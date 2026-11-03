// QUBO 항 정의의 근거: 항마다 (가) 실제 아파트에서 그 관계가 얼마나 자주 나타나는가, (나) 생성 문법에서 우연히 나타나는 빈도와
// 비교해 방향(보상/벌점)이 데이터로 지지되는가, (다) 그 관계가 공간구문 지표를 어느 쪽으로 움직이는가를 잰다.
// 실제 세대(AI 허브 샘플 SPA 35세대)와 생성 평면(무작위 방 순서, 기본 치수)을 **같은 분석 함수(analyze)**로 잰다.
// 생성기 동작은 바꾸지 않는다.
// 결과: evidence/results/term-evidence.md, .json
// 사용: node scripts/term-evidence.mjs [--samples 200]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultParams } from '../src/generate/compare.js';
import { buildLayout, rng, toLabel } from '../src/generate/layout.js';
import { buildQubo, decode, encode, frontBedCount, TERMS, weightsOf } from '../src/generate/qubo.js';
import { CALIBRATED } from '../src/generate/qubo-weights.js';
import { analyze } from '../src/model/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'evidence', 'results');
const labelsDir = path.join(root, 'public', 'data', 'labels');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const SAMPLES = arg('samples', 200);
const SX = ['livingBedroomRatio', 'kitchenBedroomRatio', 'genotypeTau', 'privacyDepthGap'];
const SX_LABEL = { livingBedroomRatio: '거실/침실 통합도 비', kitchenBedroomRatio: '주방/침실 통합도 비', genotypeTau: '유전형 τ', privacyDepthGap: '사생활 깊이 차' };
const END = 0.2; // 장축 양 끝 20% 안이면 "끝"

// ---- 세대 하나에서 관계 측정(실제·생성 공통) ----
// 반환: { 관계 id: true/false/null(해당 실이 없어 판단 불가) , offCenter: 0~0.5 }
function relations(analysis, unit) {
  const sp = analysis.spaces;
  const nodes = unit.nodes.filter((n) => !n.duct);
  const idx = new Map(unit.nodes.map((n, i) => [i, n]));
  const adj = new Map(unit.nodes.map((_, i) => [i, new Set()]));
  // unit.edges는 전역 공간 번호(spa.js localEdges)이므로 세대 안 번호로 바꾼다
  const loc = new Map(unit.nodes.map((n, i) => [n.space, i]));
  for (const [ga, gb] of unit.edges) {
    const a = loc.get(ga), b = loc.get(gb);
    if (a === undefined || b === undefined) continue;
    adj.get(a).add(b);
    adj.get(b).add(a);
  }
  const of = (t) => [...idx.entries()].filter(([, n]) => n.type === t && !n.duct).map(([i]) => i);
  const area = (i) => sp[idx.get(i).space].area;
  const beds = of('침실').sort((a, b) => area(b) - area(a));
  const master = beds[0];
  const others = beds.slice(1);
  const baths = of('화장실');
  const pubBaths = master === undefined ? baths : baths.filter((b) => !adj.get(master).has(b));
  const touch = (A, B) => (A.length && B.length ? A.some((a) => B.some((b) => a !== b && adj.get(a).has(b))) : null);
  const living = of('거실');
  const kitchen = of('주방');
  const entrance = of('현관');
  const multi = of('다목적공간');
  // 장축 위치
  const pts = nodes.map((n) => sp[n.space].center).filter(Boolean);
  const xs = pts.map((p) => p[0] ?? p.x);
  const ys = pts.map((p) => p[1] ?? p.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const axis = spanX >= spanY ? 0 : 1;
  const lo = axis ? Math.min(...ys) : Math.min(...xs);
  const len = Math.max(spanX, spanY) || 1;
  const pos = (i) => {
    const c = sp[idx.get(i).space].center;
    return ((axis ? (c[1] ?? c.y) : (c[0] ?? c.x)) - lo) / len;
  };
  const atEnd = (I) => (I.length ? I.some((i) => pos(i) <= END || pos(i) >= 1 - END) : null);
  return {
    kitchenLiving: touch(kitchen, living),
    entranceLiving: touch(entrance, living),
    entranceKitchen: touch(entrance, kitchen),
    bathKitchen: touch(pubBaths, kitchen),
    bathEntrance: touch(pubBaths, entrance),
    bathLiving: touch(pubBaths, living),
    multiKitchen: multi.length ? touch(multi, kitchen) : null,
    bedEntrance: touch(beds, entrance),
    backBedKitchen: touch(others, kitchen),
    bedLiving: touch(beds, living),
    bedBed: beds.length >= 2 ? beds.some((a) => beds.some((b) => a !== b && adj.get(a).has(b))) : null,
    masterKitchen: master === undefined ? null : touch([master], kitchen),
    bedOverBath: touch(others, pubBaths),
    masterEnd: master === undefined ? null : atEnd([master]),
    entranceEnd: atEnd(entrance),
    kitchenEnd: atEnd(kitchen),
    otherBedEnd: atEnd(others),
    livingOffCenter: living.length ? Math.abs(pos(living[0]) - 0.5) : null,
  };
}
// QUBO 항 ↔ 측정 관계. sign: 관계가 있을 때 항이 켜지는 방향(+1) 또는 반대(−1; masterNotEnd는 끝이 "아닐 때" 켜짐)
const MAP = {
  kitchenLiving: ['kitchenLiving', 1, '주방–거실 맞닿음'],
  entranceLiving: ['entranceLiving', 1, '현관–거실 맞닿음'],
  entranceKitchen: ['entranceKitchen', 1, '현관–주방 맞닿음'],
  bathKitchen: ['bathKitchen', 1, '공용욕실–주방 맞닿음'],
  bathEntrance: ['bathEntrance', 1, '공용욕실–현관 맞닿음'],
  bathLiving: ['bathLiving', 1, '공용욕실–거실 맞닿음'],
  multiKitchen: ['multiKitchen', 1, '다목적실–주방 맞닿음'],
  bedEntrance: ['bedEntrance', 1, '침실–현관 맞닿음'],
  backBedEntrance: ['bedEntrance', 1, '침실–현관 맞닿음(뒤 침실 항, 같은 관계로 측정)'],
  backBedKitchen: ['backBedKitchen', 1, '작은 침실–주방 맞닿음'],
  bedLiving: ['bedLiving', 1, '침실–거실 맞닿음'],
  bedBed: ['bedBed', 1, '침실끼리 맞닿음'],
  masterKitchen: ['masterKitchen', 1, '안방–주방 맞닿음'],
  bedOverBath: ['bedOverBath', 1, '작은 침실–공용욕실 맞닿음'],
  masterNotEnd: ['masterEnd', -1, '안방이 장축 끝 20% 안'],
  entranceEnd: ['entranceEnd', 1, '현관이 장축 끝 20% 안'],
  kitchenEnd: ['kitchenEnd', 1, '주방이 장축 끝 20% 안'],
  backBedEnd: ['otherBedEnd', 1, '작은 침실이 장축 끝 20% 안'],
  livingOffCenter: ['livingOffCenter', 1, '거실 중심의 장축 중앙 거리(0–0.5)'],
  backBedUnderBed: [null, 1, '생성 문법 고유(앞·뒤 띠)라 실제 도면에서 같은 정의로 잴 수 없음'],
};

// ---- (가) 실제 세대 ----
const real = [];
for (const file of fs.readdirSync(labelsDir).filter((f) => f.includes('_SPA_')).sort()) {
  const a = analyze(JSON.parse(fs.readFileSync(path.join(labelsDir, file), 'utf8')), 'SPA');
  for (const u of a.units) real.push({ drawing: file, rel: relations(a, u), sx: Object.fromEntries(SX.map((k) => [k, u.features[k] ?? null])) });
}

// ---- (나)(다) 생성 평면: 조건 20개 × 템플릿, 무작위 방 순서(보정 스크립트와 같은 표집), 기본 치수 ----
const targets = { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 };
const PREFS = [[], ['livingCentral', 'bath'], ['privacy', 'quiet'], ['kitchenLink', 'entryNear'], ['spacious', 'sunny', 'storage']];
const SIZES = [[59, 2], [59, 3], [74, 3], [84, 3], [84, 4], [101, 3], [101, 4], [114, 4]];
const specs = Array.from({ length: 20 }, (_, i) => {
  const [area, bedrooms] = SIZES[i % SIZES.length];
  return { area, bedrooms, baths: 2, dress: true, multi: i % 3 === 0, outdoorUnit: true, balcony: i % 4 !== 3, targets, prefs: PREFS[i % PREFS.length] };
});
const shuffle = (a, r) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const gen = [];
const t0 = Date.now();
specs.forEach((spec, si) => {
  const kmax = frontBedCount(spec);
  for (const k of [...new Set([kmax, kmax - 1])].filter((x) => x >= 0)) {
    const q = buildQubo(spec, { frontBeds: k, weights: 'hand', syntax: false });
    const r = rng(5000 + si * 10 + k);
    const seen = new Set();
    for (let i = 0; i < SAMPLES; i++) {
      const d = decode(q, encode(q, shuffle(q.bands.front.rooms, r), shuffle(q.bands.back.rooms, r)));
      const key = `${d.front}|${d.back}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const layout = buildLayout(spec, { ...defaultParams(spec), frontOrder: d.front, backOrder: d.back });
      let a;
      try {
        a = analyze(toLabel(layout), 'SPA');
      } catch {
        continue;
      }
      if (a.units.length !== 1) continue;
      gen.push({ group: `${si}/${k}`, rel: relations(a, a.units[0]), sx: Object.fromEntries(SX.map((kk) => [kk, a.units[0].features[kk] ?? null])) });
    }
  }
  process.stdout.write(`\r조건 ${si + 1}/20`);
});
process.stdout.write('\n');

// ---- 요약 ----
const wilson = (k, n) => {
  if (!n) return [null, null];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - h, c + h];
};
const rate = (rows, key) => {
  const v = rows.map((r) => r.rel[key]).filter((x) => x !== null && x !== undefined);
  if (key === 'livingOffCenter') return { n: v.length, mean: v.reduce((s, x) => s + x, 0) / v.length };
  const k = v.filter(Boolean).length;
  const [lo, hi] = wilson(k, v.length);
  return { n: v.length, p: v.length ? k / v.length : null, lo, hi };
};
// 공간구문 효과: 생성 평면에서 같은 그룹(조건·템플릿) 안에서 관계 있음 − 없음의 지표 평균 차, 그룹 평균
function sxEffect(key) {
  const byG = new Map();
  for (const g of gen) (byG.get(g.group) || byG.set(g.group, []).get(g.group)).push(g);
  const out = {};
  for (const s of SX) {
    const diffs = [];
    for (const rows of byG.values()) {
      if (key === 'livingOffCenter') {
        // 중앙에 가까운 절반 − 먼 절반
        const v = rows.filter((r) => r.rel[key] !== null && r.sx[s] !== null).sort((a, b) => a.rel[key] - b.rel[key]);
        if (v.length < 4) continue;
        const h = Math.floor(v.length / 2);
        const m = (a) => a.reduce((t, r) => t + r.sx[s], 0) / a.length;
        diffs.push(m(v.slice(h)) - m(v.slice(0, h)));
        continue;
      }
      const yes = rows.filter((r) => r.rel[key] === true && r.sx[s] !== null);
      const no = rows.filter((r) => r.rel[key] === false && r.sx[s] !== null);
      if (yes.length < 3 || no.length < 3) continue;
      const m = (a) => a.reduce((t, r) => t + r.sx[s], 0) / a.length;
      diffs.push(m(yes) - m(no));
    }
    out[s] = diffs.length ? { mean: diffs.reduce((a, b) => a + b, 0) / diffs.length, groups: diffs.length, pos: diffs.filter((d) => d > 0).length } : null;
  }
  return out;
}
const lit = Object.fromEntries(TERMS.map((t) => [t.id, t.why]));
const rows = TERMS.map((t) => {
  const [key, sign, def] = MAP[t.id];
  if (!key) return { id: t.id, label: t.label, def, why: lit[t.id], hand: t.hand, cal: CALIBRATED.weights[t.id] };
  const R = rate(real, key);
  const G = rate(gen, key);
  return { id: t.id, label: t.label, key, sign, def, why: lit[t.id], hand: t.hand, cal: CALIBRATED.weights[t.id], real: R, gen: G, sx: sxEffect(key) };
});
fs.writeFileSync(path.join(outDir, 'term-evidence.json'), JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), realUnits: real.length, genLayouts: gen.length, rows }, null, 1));

// 판정: 실제 빈도가 생성 문법의 우연 빈도보다 높으면 "실제 아파트가 이 관계를 택함" → 항이 켜질 때 보상(음수)이 데이터 방향
const f2 = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d));
const pc = (x) => (x === null || x === undefined ? '—' : `${Math.round(100 * x)}%`);
function verdict(r) {
  if (!r.real) return '측정 불가';
  if (r.key === 'livingOffCenter') {
    const d = r.real.mean - r.gen.mean;
    return Math.abs(d) < 0.03 ? '차이 작음' : d < 0 ? '실제가 더 중앙 → 벌점 방향' : '실제가 덜 중앙 → 보상 방향';
  }
  if (r.real.n < 5) return '표본 부족';
  // 생성 문법이 그 관계를 거의 강제하면(우연 빈도 ≥ 95% 또는 ≤ 5%) 비교할 수 없다. 실제 빈도만 적는다.
  if (r.gen.p >= 0.95 || r.gen.p <= 0.05) return `생성 문법이 거의 강제(우연 비교 불가). 실제 ${pc(r.real.p)}`;
  // 실제 95% 구간이 생성 빈도를 포함하면 판단 보류
  if (r.gen.p >= r.real.lo && r.gen.p <= r.real.hi) return '차이 불확실';
  const prefer = r.real.p > r.gen.p; // 실제 아파트가 이 관계를 더 자주 택함
  const termOnPrefers = r.sign > 0 ? prefer : !prefer; // 항이 켜지는 상태를 실제가 선호하는가
  return termOnPrefers ? '항이 켜진 상태를 실제가 선호 → 보상(음수) 방향' : '항이 켜진 상태를 실제가 피함 → 벌점(양수) 방향';
}
const agree = (r, w) => {
  const v = verdict(r);
  if (v.startsWith('생성 문법')) return '—';
  if (v.includes('보상')) return w < 0 ? '일치' : w > 0 ? '**반대**' : '0';
  if (v.includes('벌점')) return w > 0 ? '일치' : w < 0 ? '**반대**' : '0';
  return '—';
};
const sxCell = (r, s) => {
  const e = r.sx?.[s];
  return e ? `${e.mean >= 0 ? '+' : ''}${e.mean.toFixed(2)} (${e.pos}/${e.groups})` : '—';
};
const md = `# QUBO 항 정의의 근거: 실제 아파트 빈도 · 생성 문법의 우연 빈도 · 공간구문 효과

> 생성: ${new Date().toISOString().slice(0, 10)} · \`node scripts/term-evidence.mjs --samples ${SAMPLES}\` · ${Math.round((Date.now() - t0) / 1000)}초
> 실제 세대 ${real.length}개(AI 허브 샘플 SPA)와 생성 평면 ${gen.length.toLocaleString()}개(조건 20개 × 템플릿, 무작위 방 순서, 기본 치수)를 같은 분석 함수(\`analyze\`)로 쟀습니다. 생성기 동작은 바꾸지 않았습니다.

## 질문
QUBO 항은 "어떤 관계를 보상하거나 벌점 줄 것인가"의 선언입니다. 항마다 세 가지를 확인합니다.
1. **실제 아파트에서 그 관계가 얼마나 자주 나타나는가** (실제 빈도, 95% Wilson 구간)
2. **생성 문법에서 아무 순서나 골랐을 때 우연히 나타나는 빈도**와 비교해, 실제 아파트가 그 관계를 택하는가 피하는가 → 항의 **방향(부호)**의 데이터 근거
3. **그 관계가 공간구문 지표를 어느 쪽으로 움직이는가** (생성 평면에서, 같은 조건·템플릿 안의 "관계 있음 − 없음" 평균 차; 괄호는 양수인 그룹 수/전체)

## 측정 정의
- 맞닿음: 평가 모델의 벽 인접 그래프(\`spa.js\`)에서 두 실이 이웃인가. 안방 = 가장 큰 침실, 공용욕실 = 안방과 맞닿지 않은 화장실.
- 끝: 세대 실 중심들의 장축 범위에서 양 끝 ${END * 100}% 안. 거실 중앙 거리: 장축 위치의 0.5와의 차.
- QUBO 항은 띠의 칸으로 정의되어 있어 위 측정은 **같은 관계의 근사**입니다(예: QUBO의 "옆 칸"과 벽 인접은 다를 수 있음).

## 결과
| 항 | 측정 관계 | 실제 빈도 [95%] (n) | 생성 우연 빈도 | 데이터 방향 | 손 / 보정 가중치 | 손 · 보정 부호 | 문헌·설계 의도 |
|---|---|---|---|---|---|---|---|
${rows
  .map((r) => {
    if (!r.real) return `| \`${r.id}\` ${r.label} | ${r.def} | — | — | 측정 불가 | ${r.hand} / ${r.cal} | — | ${r.why} |`;
    const realCell = r.key === 'livingOffCenter' ? `평균 ${f2(r.real.mean)} (${r.real.n})` : `${pc(r.real.p)} [${pc(r.real.lo)}, ${pc(r.real.hi)}] (${r.real.n})`;
    const genCell = r.key === 'livingOffCenter' ? `평균 ${f2(r.gen.mean)}` : pc(r.gen.p);
    return `| \`${r.id}\` ${r.label} | ${r.def} | ${realCell} | ${genCell} | ${verdict(r)} | ${r.hand} / ${r.cal} | ${agree(r, r.hand)} · ${agree(r, r.cal)} | ${r.why} |`;
  })
  .join('\n')}

## 관계가 공간구문 지표에 주는 효과(생성 평면, 관계 있음 − 없음)
| 항 | ${SX.map((s) => SX_LABEL[s]).join(' | ')} |
|---|${SX.map(() => '---').join('|')}|
${rows.filter((r) => r.sx).map((r) => `| \`${r.id}\` ${r.label} | ${SX.map((s) => sxCell(r, s)).join(' | ')} |`).join('\n')}

거실 중앙 거리는 "중앙에서 먼 절반 − 가까운 절반"입니다.

## 한계
- 실제 세대는 ${real.length}개(도면 20장)뿐이라 구간이 넓습니다. 판단이 갈리는 항은 표본을 늘려야 합니다.
- 생성 우연 빈도는 이 생성 문법(판상형 두 띠) 안에서의 빈도입니다. 문법 자체가 이미 어떤 관계를 강제하면(예: 현관–주방) 비교가 의미 없을 수 있습니다.
- 공간구문 효과는 생성 평면에서의 연관이며, 다른 관계와 함께 바뀌는 효과가 섞여 있습니다.
`;
fs.writeFileSync(path.join(outDir, 'term-evidence.md'), md);
console.log(`실제 ${real.length}세대, 생성 ${gen.length}개`);

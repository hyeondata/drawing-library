// 손상(perturbation) 실험과 판별 타당도 점검.
// 실제 평면을 일부러 망가뜨려(알려진 집단) 점수가 떨어지는지, 손상 종류에 맞는 하위 점수가 반응하는지 본다.
// 외부 데이터 없이 할 수 있는 첫 번째 타당도 검증이다(투고 검토 보고서 4단계).
// 결과: evidence/results/validation.md, evidence/results/validation.json
// 사용: npm run validate
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_VERSION } from '../src/model/config.js';
import { analyze, extractFeatures, scoreAnalysis } from '../src/model/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const labelsDir = path.join(root, 'public', 'data', 'labels');
const outDir = path.join(root, 'evidence', 'results');

let seed = 7;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const normal = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
const quantile = (arr, p) => {
  const a = [...arr].sort((x, y) => x - y);
  if (!a.length) return NaN;
  const i = (a.length - 1) * p;
  return a[Math.floor(i)] + (a[Math.ceil(i)] - a[Math.floor(i)]) * (i % 1);
};
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
function spearman(x, y) {
  const rank = (v) => {
    const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length);
    for (let i = 0; i < o.length; ) {
      let j = i;
      while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++;
      for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x);
  const ry = rank(y);
  const mx = mean(rx);
  const my = mean(ry);
  const num = rx.reduce((s, v, i) => s + (v - mx) * (ry[i] - my), 0);
  const den = Math.sqrt(rx.reduce((s, v) => s + (v - mx) ** 2, 0) * ry.reduce((s, v) => s + (v - my) ** 2, 0));
  return den ? num / den : NaN;
}

// ---------- COCO 라벨 조작 도우미 ----------
const clone = (x) => JSON.parse(JSON.stringify(x));
const catId = (label, name) => label.categories.find((c) => c.name === name)?.id;
function setPolys(a, polys) {
  a.segmentation = polys.map((p) => p.flat());
  const xs = polys.flat().map((p) => p[0]);
  const ys = polys.flat().map((p) => p[1]);
  a.bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}
const polysOf = (a) => a.segmentation.map((s) => Array.from({ length: s.length / 2 }, (_, i) => [s[2 * i], s[2 * i + 1]]));
const centerOf = (polys) => {
  const pts = polys.flat();
  return [mean(pts.map((p) => p[0])), mean(pts.map((p) => p[1]))];
};

/** 손상 함수: (label, analysis, level) → 손상된 label 또는 null(적용 불가). */
const DAMAGES = [
  {
    key: 'swapLivingBedroom',
    label: '거실↔가장 큰 침실 라벨 교환',
    target: 'syntax',
    levels: [1],
    apply(label, an) {
      const out = clone(label);
      const L = catId(out, '공간_거실');
      const B = catId(out, '공간_침실');
      if (!L || !B) return null;
      let n = 0;
      for (const u of an.units) {
        const sp = u.members.map((g) => an.spaces[g]);
        const living = sp.find((s) => s.type === '거실');
        const bed = sp.filter((s) => s.type === '침실').sort((a, b) => b.area - a.area)[0];
        if (!living || !bed) continue;
        out.annotations.find((a) => a.id === living.id).category_id = B;
        out.annotations.find((a) => a.id === bed.id).category_id = L;
        n++;
      }
      return n ? out : null;
    },
  },
  {
    key: 'deleteKitchen',
    label: '주방 삭제',
    target: 'rules',
    levels: [1],
    apply(label) {
      const K = catId(label, '공간_주방');
      if (!K || !label.annotations.some((a) => a.category_id === K)) return null;
      return { ...clone(label), annotations: label.annotations.filter((a) => a.category_id !== K) };
    },
  },
  {
    key: 'corridorToBedroom',
    label: '통과형 침실 삽입(가장 많이 연결된 복도를 침실로)',
    target: 'rules',
    levels: [1],
    apply(label, an) {
      const out = clone(label);
      const B = catId(out, '공간_침실');
      if (!B) return null;
      let n = 0;
      for (const u of an.units) {
        const hub = an.units[u.index] && u.nodes.filter((nd) => nd.type === '기타' && !nd.duct).sort((a, b) => b.connectivity - a.connectivity)[0];
        if (!hub || hub.connectivity < 3) continue;
        out.annotations.find((a) => a.id === an.spaces[hub.space].id).category_id = B;
        n++;
      }
      return n ? out : null;
    },
  },
  {
    key: 'detachRooms',
    label: '침실 떼어내기(1·2·3개)',
    target: 'rules',
    levels: [1, 2, 3],
    apply(label, an, level) {
      const out = clone(label);
      let n = 0;
      for (const u of an.units) {
        const beds = u.members.map((g) => an.spaces[g]).filter((s) => s.type === '침실').sort((a, b) => a.area - b.area).slice(0, level);
        const uc = centerOf(u.members.map((g) => an.spaces[g].center).map((c) => [c]));
        for (const b of beds) {
          const a = out.annotations.find((x) => x.id === b.id);
          const [cx, cy] = b.center;
          const d = Math.hypot(cx - uc[0], cy - uc[1]) || 1;
          const dx = ((cx - uc[0]) / d) * 2000;
          const dy = ((cy - uc[1]) / d) * 2000;
          setPolys(a, polysOf(a).map((p) => p.map(([x, y]) => [x + dx, y + dy])));
          n++;
        }
      }
      return n ? out : null;
    },
  },
  {
    key: 'jitter',
    label: '꼭짓점 흔들기(σ 15·30·60px)',
    target: 'shape',
    levels: [1, 2, 3],
    apply(label, an, level) {
      const sigma = [15, 30, 60][level - 1];
      const out = clone(label);
      const spaceIds = new Set(an.spaces.map((s) => s.id));
      for (const a of out.annotations) {
        if (!spaceIds.has(a.id)) continue;
        // 변마다 중점을 넣고 모든 점을 흔들어 실 모양을 비정형으로 만든다.
        const polys = polysOf(a).map((p) =>
          p.flatMap((pt, i) => {
            const q = p[(i + 1) % p.length];
            return [pt, [(pt[0] + q[0]) / 2, (pt[1] + q[1]) / 2]];
          }).map(([x, y]) => [x + sigma * normal(), y + sigma * normal()]),
        );
        setPolys(a, polys);
      }
      return out;
    },
  },
  {
    key: 'shrinkLiving',
    label: '거실 면적 축소(−30·−60%)',
    target: 'area',
    levels: [1, 2],
    apply(label, an, level) {
      const f = Math.sqrt([0.7, 0.4][level - 1]);
      const out = clone(label);
      let n = 0;
      for (const s of an.spaces.filter((x) => x.type === '거실')) {
        const a = out.annotations.find((x) => x.id === s.id);
        const [cx, cy] = s.center;
        setPolys(a, polysOf(a).map((p) => p.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f])));
        n++;
      }
      return n ? out : null;
    },
  },
];

// ---------- 실행 ----------
const files = fs.readdirSync(labelsDir).filter((f) => f.includes('_SPA_')).sort();
const drawings = files.map((f) => {
  const label = JSON.parse(fs.readFileSync(path.join(labelsDir, f), 'utf8'));
  return { id: f.replace('.json', ''), label, analysis: analyze(label, 'SPA') };
});
const pool = drawings.flatMap((d) => extractFeatures(d.analysis).map(({ features }) => ({ drawing: d.id, features })));
const poolFor = (id) => pool.filter((e) => e.drawing !== id).map((e) => e.features);
const groupScores = (r) => {
  const g = {};
  for (const u of r.units) for (const [k, v] of Object.entries(u.groups)) g[k] = (g[k] || 0) + v.score / r.units.length;
  return g;
};
const baseResults = drawings.map((d) => scoreAnalysis(d.analysis, poolFor(d.id)));

const rows = [];
for (const dmg of DAMAGES) {
  for (const level of dmg.levels) {
    const drops = [];
    const groupDrops = {};
    let invalid = 0;
    let applied = 0;
    drawings.forEach((d, i) => {
      const broken = dmg.apply(d.label, d.analysis, level);
      if (!broken) return;
      let an;
      try {
        an = analyze(broken, 'SPA');
      } catch {
        return;
      }
      if (!an.units.length) return;
      const r = scoreAnalysis(an, poolFor(d.id));
      applied++;
      drops.push(baseResults[i].score - r.score);
      if (!r.valid) invalid++;
      const b = groupScores(baseResults[i]);
      const g = groupScores(r);
      for (const k of Object.keys(b)) (groupDrops[k] ||= []).push(b[k] - (g[k] ?? 0));
    });
    // 도면 단위 부트스트랩으로 평균 하락의 95% 구간
    const boots = [];
    for (let b = 0; b < 2000; b++) boots.push(mean(Array.from({ length: drops.length }, () => drops[Math.floor(rand() * drops.length)])));
    rows.push({
      key: dmg.key,
      label: dmg.label,
      target: dmg.target,
      level,
      applied,
      meanDrop: mean(drops),
      lo: quantile(boots, 0.025),
      hi: quantile(boots, 0.975),
      droppedShare: drops.filter((x) => x > 0).length / (drops.length || 1),
      invalidShare: invalid / (applied || 1),
      groupDrops: Object.fromEntries(Object.entries(groupDrops).map(([k, v]) => [k, mean(v)])),
      drops,
    });
  }
}

// 강도–점수 단조성: 여러 단계가 있는 손상에서 (단계, 하락) Spearman
const monotone = DAMAGES.filter((d) => d.levels.length > 1).map((d) => {
  const rs = rows.filter((r) => r.key === d.key);
  const x = rs.flatMap((r) => r.drops.map(() => r.level));
  const y = rs.flatMap((r) => r.drops);
  return { key: d.key, label: d.label, rho: spearman(x, y), means: rs.map((r) => r.meanDrop) };
});

// 판별 타당도: 점수가 세대 면적·실 수의 대리 변수가 아닌가(세대 단위)
const unitRows = drawings.flatMap((d, i) =>
  baseResults[i].units.map((u, k) => {
    const a = d.analysis.units[k];
    return { score: u.score, area: a.totalArea / (d.analysis.scale || 1) ** 2, K: a.features.nodeCount, groups: Object.fromEntries(Object.entries(u.groups).map(([g, v]) => [g, v.score])) };
  }),
);
const rhoArea = spearman(unitRows.map((r) => r.score), unitRows.map((r) => r.area));
const rhoK = spearman(unitRows.map((r) => r.score), unitRows.map((r) => r.K));
const gkeys = Object.keys(unitRows[0].groups);
const corr = gkeys.map((a) => gkeys.map((b) => spearman(unitRows.map((r) => r.groups[a]), unitRows.map((r) => r.groups[b]))));

// ---------- 출력 ----------
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–');
const GN = { syntax: '공간구문', area: '면적', shape: '형태', exposure: '외기', rules: '정합성' };
const md = `# 손상 실험·판별 타당도 결과

> 자동 생성 파일입니다(\`npm run validate\`). 모델 v${MODEL_VERSION}, 공간 도면 ${drawings.length}장(${unitRows.length}세대), 난수 시드 고정.
> 실제 평면을 일부러 망가뜨렸을 때 점수가 떨어지는지(알려진 집단 타당도), 손상 종류에 맞는 하위 점수가 가장 크게 반응하는지 봅니다.
> 손상 도면은 원래 도면을 뺀 기준 분포로 채점합니다.

## 1. 손상별 점수 하락

| 손상 | 단계 | 적용 도면 | 평균 하락(점) | 95% 구간 | 하락한 도면 | 무효 판정 | 표적 영역 |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.map((r) => `| ${r.label} | ${r.level} | ${r.applied} | **${f1(r.meanDrop)}** | ${f1(r.lo)}~${f1(r.hi)} | ${Math.round(r.droppedShare * 100)}% | ${Math.round(r.invalidShare * 100)}% | ${GN[r.target]} |`).join('\n')}

## 2. 손상 × 하위 점수 반응(평균 하락, 점)

표적 영역이 가장 크게 떨어지면 하위 점수가 의도한 것을 잰다는 근거가 됩니다.

| 손상 | 단계 | ${gkeys.map((k) => GN[k] ?? k).join(' | ')} |
| --- | --- | ${gkeys.map(() => '---').join(' | ')} |
${rows.map((r) => `| ${r.label} | ${r.level} | ${gkeys.map((k) => {
  const v = r.groupDrops[k];
  const top = Math.max(...gkeys.map((g) => r.groupDrops[g] ?? -Infinity));
  return v === top ? `**${f1(v)}**` : f1(v);
}).join(' | ')} |`).join('\n')}

## 3. 손상 강도와 하락의 단조성

| 손상 | Spearman ρ(단계, 하락) | 단계별 평균 하락 |
| --- | --- | --- |
${monotone.map((m) => `| ${m.label} | ${f2(m.rho)} | ${m.means.map(f1).join(' → ')} |`).join('\n')}

## 4. 판별 타당도: 점수가 크기의 대리 변수가 아닌가

| 대상 | Spearman ρ |
| --- | --- |
| 총점 – 세대 면적 | ${f2(rhoArea)} |
| 총점 – 기능실 수(K) | ${f2(rhoK)} |

하위 점수 사이 Spearman ρ(0.8 이상이면 같은 것을 재는 중복 의심):

| | ${gkeys.map((k) => GN[k] ?? k).join(' | ')} |
| --- | ${gkeys.map(() => '---').join(' | ')} |
${gkeys.map((a, i) => `| ${GN[a] ?? a} | ${corr[i].map(f2).join(' | ')} |`).join('\n')}

## 읽는 법과 한계

- 손상 실험은 일반적인 지표 검증 관행을 빌린 설계이며, 평면 평가 분야의 확립된 표준은 아닙니다(투고 검토 보고서).
- 표본이 20도면이라 구간이 넓습니다. 기준 분포를 키운 뒤 다시 실행해야 합니다.
- 정합성 규칙(관문)은 기준 표본에서 걸린 평면이 없어, 이 실험이 관문 규칙이 작동하는지 보는 유일한 시험입니다.
`;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'validation.md'), md);
fs.writeFileSync(
  path.join(outDir, 'validation.json'),
  JSON.stringify({ modelVersion: MODEL_VERSION, rows: rows.map(({ drops, ...r }) => r), monotone, rhoArea, rhoK, groupCorr: { keys: gkeys, matrix: corr } }, null, 1),
);
console.log(rows.map((r) => `${r.key}#${r.level}: −${f1(r.meanDrop)}점 (무효 ${Math.round(r.invalidShare * 100)}%)`).join('\n'));
console.log(`ρ(점수, 면적) ${f2(rhoArea)}, ρ(점수, K) ${f2(rhoK)}`);

// 벽 인접 그래프의 공간구문 지표가 문(출입) 그래프의 지표를 얼마나 따라가는가 — 생성 평면에서.
// 왜: AI 허브 공간(SPA) 라벨에는 문이 없어 평가·근거 통계를 벽 인접 그래프로 쟀다. 생성 평면은 문을 직접 달므로(openings.js)
//   같은 평면을 두 그래프로 재서 일치도를 볼 수 있다. 실제 도면의 일치도는 구조(STR) 라벨의 문으로 따로 검증해야 한다.
// 표본: 조건 20개 × 템플릿마다 무작위 방 순서 200개(좋은 평면만이 아니라 나쁜 평면도 포함해야 일치도가 부풀지 않는다).
// 출입 그래프: 문·개구부(links) + 발코니 미닫이(outLinks). 벽 인접 링크 중 이 쌍만 남긴다(analyze의 edgeFilter).
// 지표: 스피어만 ρ, ICC(2,1) 절대 일치, 평균 차(인접 − 출입)와 95% 일치 한계(Bland–Altman), 5유형 통합도 순위(거실>주방>현관>침실>화장실 τ) 부호 일치.
// 사용: node scripts/door-vs-adjacency.mjs [--samples 200]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultParams } from '../src/generate/compare.js';
import { buildLayout, rng, toLabel } from '../src/generate/layout.js';
import { placeOpenings } from '../src/generate/openings.js';
import { buildQubo, decode, encode, frontBedCount } from '../src/generate/qubo.js';
import { analyze } from '../src/model/index.js';
import { specs } from './lib/term-measure.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i0 = process.argv.indexOf('--samples');
const SAMPLES = i0 > 0 ? Number(process.argv[i0 + 1]) : 200;
const KEYS = ['livingBedroomRatio', 'kitchenBedroomRatio', 'genotypeTau', 'privacyDepthGap', 'livingDepth', 'meanIntegration', 'livingControl', 'ringiness'];
const LABEL = { livingBedroomRatio: '거실/침실 통합도 비', kitchenBedroomRatio: '주방/침실 통합도 비', genotypeTau: '유전형 τ', privacyDepthGap: '사생활 깊이 차', livingDepth: '현관→거실 깊이', meanIntegration: '평균 통합도', livingControl: '거실 통제값', ringiness: '고리도' };
const shuffle = (a, r) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

const t0 = Date.now();
const pairs = [];
let dropped = 0;
specs.forEach((spec0, si) => {
  const spec = { ...spec0, prefs: [] };
  const kmax = frontBedCount(spec);
  for (const k of [...new Set([kmax, kmax - 1])].filter((x) => x >= 0)) {
    const q = buildQubo(spec, { frontBeds: k, weights: 'hand', syntax: false });
    const r = rng(9000 + si * 10 + k);
    const seen = new Set();
    for (let s = 0; s < SAMPLES; s++) {
      const d = decode(q, encode(q, shuffle(q.bands.front.rooms, r), shuffle(q.bands.back.rooms, r)));
      const key = `${d.front}|${d.back}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const layout = buildLayout(spec, { ...defaultParams(spec), frontOrder: d.front, backOrder: d.back });
      const { openings, unreachable } = placeOpenings(layout);
      // placeOpenings의 문 쌍을 다시 모은다(links는 내부 변수라 openings의 from/to로 복원; 발코니 미닫이 포함)
      const door = new Set();
      for (const o of openings) if (o.from && o.to) door.add([o.from, o.to].sort().join('|'));
      const label = toLabel(layout);
      const keyOf = (sp) => layout.rooms[sp.id]?.key;
      try {
        const A = analyze(label, 'SPA');
        const D = analyze(label, 'SPA', { edgeFilter: (a, b) => door.has([keyOf(a), keyOf(b)].sort().join('|')) });
        if (A.units.length !== 1 || D.units.length !== 1 || unreachable.length) {
          dropped++;
          continue;
        }
        pairs.push({ group: `${si}/${k}`, adj: A.units[0].features, door: D.units[0].features });
      } catch {
        dropped++;
      }
    }
  }
});

const rank = (v) => {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let t = i; t <= j; t++) r[idx[t][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
};
const pearson = (a, b) => {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) (sab += (a[i] - ma) * (b[i] - mb)), (saa += (a[i] - ma) ** 2), (sbb += (b[i] - mb) ** 2);
  return sab / Math.sqrt(saa * sbb || 1);
};
// ICC(2,1): 두 측정(인접·출입)의 절대 일치(Shrout & Fleiss 1979; McGraw & Wong 1996)
const icc = (a, b) => {
  const n = a.length, k = 2;
  const grand = (a.reduce((s, x) => s + x, 0) + b.reduce((s, x) => s + x, 0)) / (n * k);
  const rowM = a.map((x, i) => (x + b[i]) / 2);
  const colM = [a.reduce((s, x) => s + x, 0) / n, b.reduce((s, x) => s + x, 0) / n];
  const ssr = k * rowM.reduce((s, m) => s + (m - grand) ** 2, 0);
  const ssc = n * colM.reduce((s, m) => s + (m - grand) ** 2, 0);
  let sst = 0;
  for (let i = 0; i < n; i++) sst += (a[i] - grand) ** 2 + (b[i] - grand) ** 2;
  const sse = sst - ssr - ssc;
  const msr = ssr / (n - 1), msc = ssc / (k - 1), mse = sse / ((n - 1) * (k - 1));
  return (msr - mse) / (msr + (k - 1) * mse + (k * (msc - mse)) / n);
};
const rows = KEYS.map((key) => {
  const ok = pairs.filter((p) => Number.isFinite(p.adj[key]) && Number.isFinite(p.door[key]));
  const a = ok.map((p) => p.adj[key]), b = ok.map((p) => p.door[key]);
  const d = a.map((x, i) => x - b[i]);
  const md = d.reduce((s, x) => s + x, 0) / d.length;
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - md) ** 2, 0) / (d.length - 1));
  const same = ok.filter((p) => p.adj[key] === p.door[key]).length / ok.length;
  return { key, n: ok.length, rho: pearson(rank(a), rank(b)), icc: icc(a, b), md, loa: [md - 1.96 * sd, md + 1.96 * sd], same, medAdj: a.slice().sort((x, y) => x - y)[a.length >> 1], medDoor: b.slice().sort((x, y) => x - y)[b.length >> 1] };
});
const tau = pairs.filter((p) => Number.isFinite(p.adj.genotypeTau) && Number.isFinite(p.door.genotypeTau));
const tauSign = tau.filter((p) => Math.sign(p.adj.genotypeTau) === Math.sign(p.door.genotypeTau)).length / tau.length;
const livingTop = pairs.filter((p) => Array.isArray(p.adj.genotypeProfile) && Array.isArray(p.door.genotypeProfile));
const top = (prof) => prof.indexOf(Math.max(...prof));
const livingTopSame = livingTop.filter((p) => top(p.adj.genotypeProfile) === top(p.door.genotypeProfile)).length / (livingTop.length || 1);

const L = ['# 벽 인접 그래프 대 문(출입) 그래프: 생성 평면에서의 공간구문 일치도\n'];
L.push(`> 생성: ${new Date().toISOString().slice(0, 10)} · \`node scripts/door-vs-adjacency.mjs --samples ${SAMPLES}\` · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
L.push(`> 평면 ${pairs.length.toLocaleString()}개(조건 20개 × 템플릿, 무작위 방 순서, 기본 치수, 문이 현관에서 모두 닿는 평면만; 제외 ${dropped}개). 같은 평면을 벽 인접 그래프와 문·개구부·발코니 미닫이만 남긴 출입 그래프로 각각 쟀습니다.\n`);
L.push('## 결과\n');
L.push('| 지표 | n | 스피어만 ρ | ICC(2,1) | 값이 같은 비율 | 중앙값 인접 / 출입 | 평균 차(인접 − 출입) [95% 일치 한계] |');
L.push('|---|---|---|---|---|---|---|');
for (const r of rows) L.push(`| ${LABEL[r.key]} | ${r.n.toLocaleString()} | ${r.rho.toFixed(3)} | ${r.icc.toFixed(3)} | ${(100 * r.same).toFixed(1)}% | ${r.medAdj.toFixed(2)} / ${r.medDoor.toFixed(2)} | ${r.md.toFixed(3)} [${r.loa[0].toFixed(3)}, ${r.loa[1].toFixed(3)}] |`);
L.push('');
L.push(`- 유전형 τ의 부호(거실 중심 순서에 가까운가 먼가)가 두 그래프에서 같은 비율: ${(100 * tauSign).toFixed(1)}% (n=${tau.length.toLocaleString()}).`);
L.push(`- 5유형 중 가장 통합된 유형(대개 거실)이 같은 비율: ${(100 * livingTopSame).toFixed(1)}%.\n`);
L.push('## 읽는 법과 한계\n');
L.push('- ICC 0.75 이상이면 좋음, 0.9 이상이면 매우 좋음(Koo & Li 2016). 평균 차는 인접 그래프가 출입 그래프보다 체계적으로 큰가(편향)를 봅니다.');
L.push('- 생성 평면의 문은 규칙(openings.js)으로 단 것이라, 실제 아파트의 문 배치와 다를 수 있습니다. **실제 도면에서의 일치도는 AI 허브 구조(STR) 라벨의 출입문으로 따로 검증해야** 합니다(같은 도면의 SPA·STR 짝이 필요).');
fs.writeFileSync(path.join(root, 'evidence', 'results', 'door-vs-adjacency.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(root, 'evidence', 'results', 'door-vs-adjacency.json'), JSON.stringify({ n: pairs.length, dropped, rows, tauSign, livingTopSame }, null, 1));
console.log(rows.map((r) => `${r.key} ρ ${r.rho.toFixed(2)} icc ${r.icc.toFixed(2)} md ${r.md.toFixed(2)}`).join('\n'), `\nτ sign ${tauSign.toFixed(3)} top ${livingTopSame.toFixed(3)} n ${pairs.length} dropped ${dropped}`);

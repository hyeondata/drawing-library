// 불확실성·민감도 분석(Saisana, Saltelli & Tarantola 2005; OECD/JRC 2008 핸드북).
// 1) 몬테카를로: 영역 가중치·z 절단값·관문 상한·정규화·집계 방식을 함께 흔들어 도면 순위가 얼마나 움직이는지 본다.
// 2) 도면 단위 부트스트랩: 기준 분포를 도면 단위로 다시 뽑아 점수의 95% 구간과 등급이 바뀔 확률을 본다.
// 3) 링크 판정 문턱값(minContact, adjacencyGap)을 바꿔 다시 분석하고 순위·핵심 지표가 유지되는지 본다.
// 결과: evidence/results/sensitivity.md, evidence/results/sensitivity.json
// 사용: npm run sensitivity [-- --runs 2000 --boot 1000]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATE_CAP, MODEL_VERSION, THRESHOLDS, WEIGHTS, Z_ZERO_SCORE } from '../src/model/config.js';
import { analyze, extractFeatures, gradeOf, scoreAnalysis } from '../src/model/index.js';
import { kendallTauB } from '../src/model/syntax.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const labelsDir = path.join(root, 'public', 'data', 'labels');
const outDir = path.join(root, 'evidence', 'results');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const RUNS = arg('runs', 2000);
const BOOT = arg('boot', 1000);

// 재현 가능한 난수(mulberry32)
let seed = 20261022;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gammaSample = (k) => {
  // Marsaglia–Tsang (k ≥ 1)
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      const u1 = rand();
      const u2 = rand();
      x = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v ** 3;
    const u = rand();
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
};
const quantile = (arr, p) => {
  const a = [...arr].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  return a[Math.floor(i)] + (a[Math.ceil(i)] - a[Math.floor(i)]) * (i % 1);
};
const ranksOf = (scores) => {
  const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
  const r = new Array(scores.length);
  order.forEach(([, i], k) => (r[i] = k + 1));
  return r;
};

function loadSPA() {
  return fs
    .readdirSync(labelsDir)
    .filter((f) => f.includes('_SPA_'))
    .sort()
    .map((f) => ({ id: f.replace('.json', ''), label: JSON.parse(fs.readFileSync(path.join(labelsDir, f), 'utf8')) }));
}

function buildPool(drawings) {
  return drawings.flatMap((d) => extractFeatures(d.analysis).map(({ features }) => ({ drawing: d.id, features })));
}
// 같은 기준 분포 배열을 재사용해야 모델의 통계 캐시가 작동한다.
const exclCache = new WeakMap();
const poolExcluding = (pool, id) => {
  if (!exclCache.has(pool)) exclCache.set(pool, new Map());
  const m = exclCache.get(pool);
  if (!m.has(id)) m.set(id, pool.filter((e) => e.drawing !== id).map((e) => e.features));
  return m.get(id);
};
const scoreAll = (drawings, pool, options) => drawings.map((d) => scoreAnalysis(d.analysis, poolExcluding(pool, d.id), options).score);

const drawings = loadSPA().map((d) => ({ ...d, analysis: analyze(d.label, 'SPA') }));
const pool = buildPool(drawings);
const base = scoreAll(drawings, pool, {});
const baseRanks = ranksOf(base);

// ---------- 1. 몬테카를로 ----------
const groups = Object.keys(WEIGHTS.SPA);
const CONC = 40; // 디리클레 집중도: 영역 가중치가 대략 ±5~10점 안에서 움직인다.
const factors = { weights: [], zZero: [], gateCap: [], scoring: [], aggregation: [] };
const mcRanks = drawings.map(() => []);
const mcTau = [];
for (let r = 0; r < RUNS; r++) {
  const g = groups.map((k) => gammaSample((WEIGHTS.SPA[k] / 100) * CONC + 1));
  const sum = g.reduce((s, x) => s + x, 0);
  const weights = Object.fromEntries(groups.map((k, i) => [k, (100 * g[i]) / sum]));
  const zZero = 2 + 2 * rand();
  const gateCap = [59, 69, null][Math.floor(rand() * 3)];
  const scoring = ['default', 'z', 'ecdf'][Math.floor(rand() * 3)];
  const aggregation = rand() < 0.5 ? 'arithmetic' : 'geometric';
  const scores = scoreAll(drawings, pool, { weights, zZero, gateCap, scoring, aggregation });
  const ranks = ranksOf(scores);
  ranks.forEach((rk, i) => mcRanks[i].push(rk));
  const tau = kendallTauB(scores, base);
  mcTau.push(tau);
  factors.weights.push(Math.abs(weights.syntax - WEIGHTS.SPA.syntax) + Math.abs(weights.rules - WEIGHTS.SPA.rules));
  factors.zZero.push(zZero);
  factors.gateCap.push(gateCap === null ? 2 : gateCap === 59 ? 0 : 1);
  factors.scoring.push(['default', 'z', 'ecdf'].indexOf(scoring));
  factors.aggregation.push(aggregation === 'geometric' ? 1 : 0);
}
// 1차 민감도 지수: 각 요인을 구간으로 나눈 조건부 평균의 분산 / 전체 분산(상관비 추정).
function firstOrder(x, y, bins = 10) {
  const uniq = [...new Set(x)];
  const keyOf = uniq.length <= 5 ? (v) => v : (() => {
    const cuts = Array.from({ length: bins - 1 }, (_, i) => quantile(x, (i + 1) / bins));
    return (v) => cuts.filter((c) => v > c).length;
  })();
  const by = new Map();
  x.forEach((v, i) => {
    const k = keyOf(v);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(y[i]);
  });
  const mean = y.reduce((s, v) => s + v, 0) / y.length;
  const varY = y.reduce((s, v) => s + (v - mean) ** 2, 0) / y.length;
  let between = 0;
  for (const ys of by.values()) {
    const m = ys.reduce((s, v) => s + v, 0) / ys.length;
    between += (ys.length / y.length) * (m - mean) ** 2;
  }
  return varY ? between / varY : 0;
}
const sensitivity = Object.fromEntries(Object.entries(factors).map(([k, x]) => [k, firstOrder(x, mcTau)]));
const rankRows = drawings.map((d, i) => ({
  id: d.id,
  score: base[i],
  rank: baseRanks[i],
  median: quantile(mcRanks[i], 0.5),
  p05: quantile(mcRanks[i], 0.05),
  p95: quantile(mcRanks[i], 0.95),
  shift: mcRanks[i].reduce((s, r) => s + Math.abs(r - baseRanks[i]), 0) / RUNS,
}));
const meanShift = rankRows.reduce((s, r) => s + r.shift, 0) / rankRows.length;

// ---------- 2. 도면 단위 부트스트랩 ----------
const ids = drawings.map((d) => d.id);
const bootScores = drawings.map(() => []);
for (let b = 0; b < BOOT; b++) {
  const pick = Array.from({ length: ids.length }, () => ids[Math.floor(rand() * ids.length)]);
  const resampled = pick.flatMap((id, k) => pool.filter((e) => e.drawing === id).map((e) => ({ drawing: `${id}#${k}`, src: id, features: e.features })));
  drawings.forEach((d, i) => {
    const p = resampled.filter((e) => e.src !== d.id).map((e) => e.features);
    if (p.length >= 5) bootScores[i].push(scoreAnalysis(d.analysis, p, {}).score);
  });
}
const bootRows = drawings.map((d, i) => {
  const s = bootScores[i];
  const g = gradeOf(base[i]);
  return { id: d.id, score: base[i], lo: quantile(s, 0.025), hi: quantile(s, 0.975), gradeChange: s.filter((v) => gradeOf(v) !== g).length / s.length };
});

// ---------- 3. 링크 판정 문턱값 ----------
const original = { ...THRESHOLDS };
const variants = [
  { name: 'minContact 30', minContact: 30 },
  { name: 'minContact 60', minContact: 60 },
  { name: 'minContact 80', minContact: 80 },
  { name: 'adjacencyGap 25', adjacencyGap: 25 },
  { name: 'adjacencyGap 40', adjacencyGap: 40 },
  { name: 'ductMaxArea 6000', ductMaxArea: 6000 },
  { name: 'ductMaxArea 20000', ductMaxArea: 20000 },
];
const featMedian = (p, key) => quantile(p.map((e) => e.features[key]).filter(Number.isFinite), 0.5);
const thresholdRows = [];
for (const v of variants) {
  Object.assign(THRESHOLDS, original, v);
  delete THRESHOLDS.name;
  const ds = drawings.map((d) => ({ ...d, analysis: analyze(d.label, 'SPA') }));
  const p = buildPool(ds);
  const s = scoreAll(ds, p, {});
  thresholdRows.push({
    name: v.name,
    tau: kendallTauB(s, base),
    meanAbsDiff: s.reduce((acc, x, i) => acc + Math.abs(x - base[i]), 0) / s.length,
    rlb: featMedian(p, 'livingBedroomRatio'),
    gtau: featMedian(p, 'genotypeTau'),
    gap: featMedian(p, 'privacyDepthGap'),
    livingCentral: ds.flatMap((d) => d.analysis.units).filter((u) => u.rules.find((r) => r.id === 'livingCentral')?.pass).length,
    units: p.length,
  });
}
Object.assign(THRESHOLDS, original);
const baseRow = { rlb: featMedian(pool, 'livingBedroomRatio'), gtau: featMedian(pool, 'genotypeTau'), gap: featMedian(pool, 'privacyDepthGap') };

// ---------- 출력 ----------
fs.mkdirSync(outDir, { recursive: true });
const f1 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '–' : v.toFixed(1));
const f2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '–' : v.toFixed(2));
const short = (id) => id.replace('APT_FP_SPA_', '');
const md = `# 민감도·불확실성 분석 결과

> 자동 생성 파일입니다(\`npm run sensitivity\`). 모델 v${MODEL_VERSION}, 공간 도면 ${drawings.length}장(${pool.length}세대), 난수 시드 고정.
> 방법은 [5. 채점 방식](../05-채점-방식.md#불확실성민감도-분석)에 있습니다.

## 1. 몬테카를로(${RUNS}회): 설정을 흔들어도 순위가 유지되는가

흔든 요인: 영역 가중치(기본값 중심 디리클레, 집중도 ${CONC}), z 절단값(2~4, 기본 ${Z_ZERO_SCORE}), 관문 상한(59/69/없음, 기본 ${GATE_CAP}), 정규화(지표별 기본/모두 z/모두 백분위), 집계(산술/기하).

- 기본 설정 순위와의 Kendall τ: 중앙값 **${f2(quantile(mcTau, 0.5))}**, 5~95% 구간 ${f2(quantile(mcTau, 0.05))}~${f2(quantile(mcTau, 0.95))}
- 도면별 평균 순위 이동: **${f2(meanShift)}위**(${drawings.length}장 중)

| 요인 | 1차 민감도 지수(τ 분산 중 설명 비율) |
| --- | --- |
${Object.entries(sensitivity)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `| ${{ weights: '영역 가중치', zZero: 'z 절단값', gateCap: '관문 상한', scoring: '정규화 방식', aggregation: '집계 방식' }[k]} | ${f2(v)} |`)
  .join('\n')}

| 도면 | 기본 점수 | 기본 순위 | 순위 중앙값 | 순위 5~95% | 평균 이동 |
| --- | --- | --- | --- | --- | --- |
${rankRows
  .sort((a, b) => a.rank - b.rank)
  .map((r) => `| ${short(r.id)} | ${f1(r.score)} | ${r.rank} | ${f1(r.median)} | ${Math.round(r.p05)}~${Math.round(r.p95)} | ${f2(r.shift)} |`)
  .join('\n')}

## 2. 도면 단위 부트스트랩(${BOOT}회): 기준 분포가 달라지면 점수가 얼마나 흔들리는가

| 도면 | 점수 | 95% 구간 | 구간 폭 | 등급이 바뀔 확률 |
| --- | --- | --- | --- | --- |
${bootRows
  .sort((a, b) => b.score - a.score)
  .map((r) => `| ${short(r.id)} | ${f1(r.score)} | ${f1(r.lo)}~${f1(r.hi)} | ${f1(r.hi - r.lo)} | ${Math.round(r.gradeChange * 100)}% |`)
  .join('\n')}

- 구간 폭 중앙값: **${f1(quantile(bootRows.map((r) => r.hi - r.lo), 0.5))}점**
- 등급이 바뀔 확률이 30%를 넘는 도면: ${bootRows.filter((r) => r.gradeChange > 0.3).length}장

## 3. 링크 판정 문턱값: 그래프 규약이 바뀌면 결과가 유지되는가

기본값: minContact ${original.minContact}px, adjacencyGap ${original.adjacencyGap}px, ductMaxArea ${original.ductMaxArea}px². 기본 설정의 거실/침실 비 중앙값 ${f2(baseRow.rlb)}, τ 중앙값 ${f2(baseRow.gtau)}, 공·사 깊이 차 중앙값 ${f2(baseRow.gap)}.

| 변형 | 점수 순위 τ | 평균 점수 차 | 거실/침실 비 중앙값 | τ 중앙값 | 깊이 차 중앙값 | 거실 중심 규칙 통과 | 세대 수 |
| --- | --- | --- | --- | --- | --- | --- | --- |
${thresholdRows.map((r) => `| ${r.name} | ${f2(r.tau)} | ${f1(r.meanAbsDiff)} | ${f2(r.rlb)} | ${f2(r.gtau)} | ${f2(r.gap)} | ${r.livingCentral}/${r.units} | ${r.units} |`).join('\n')}

## 읽는 법

- τ가 0.8 이상이면 설정을 바꿔도 순위가 거의 같습니다. 0.5 아래면 그 설정이 결과를 좌우한다는 뜻이므로 논문에서 근거를 더 대야 합니다.
- 부트스트랩 구간이 넓으면 기준 분포가 작아 점수가 불안정하다는 뜻입니다. 기준 분포를 키우면 좁아집니다.
`;
fs.writeFileSync(path.join(outDir, 'sensitivity.md'), md);
fs.writeFileSync(
  path.join(outDir, 'sensitivity.json'),
  JSON.stringify({ modelVersion: MODEL_VERSION, runs: RUNS, boot: BOOT, tau: { median: quantile(mcTau, 0.5), p05: quantile(mcTau, 0.05), p95: quantile(mcTau, 0.95) }, meanShift, sensitivity, rankRows, bootRows, thresholdRows }, null, 1),
);
console.log(`민감도 분석: τ 중앙값 ${f2(quantile(mcTau, 0.5))}, 평균 순위 이동 ${f2(meanShift)}, 부트스트랩 구간 폭 중앙값 ${f1(quantile(bootRows.map((r) => r.hi - r.lo), 0.5))}점`);

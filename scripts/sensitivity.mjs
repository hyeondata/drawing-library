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
import { analyze, extractFeatures, gradeOf, scoreAnalysis, summarizePool } from '../src/model/index.js';
import { STRATA } from '../src/model/config.js';
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
// 기준이 요약형(전체 데이터)이면 그대로, 세대 목록(샘플)이면 평가 도면을 빼고 쓴다.
const refOf = (pool, id) => (pool.summary ? pool : poolExcluding(pool, id));
const scoreAll = (drawings, pool, options) => drawings.map((d) => scoreAnalysis(d.analysis, refOf(pool, d.id), options).score);

// 기본: 전체 데이터 모드. 평가할 도면 = 검증(test) 묶음에서 고정 간격 N장, 기준 = 웹과 같은 전체 기준 분포(서로 다른 평면 8,331개, 요약형).
// --sample: 예전 방식(샘플 20장이 서로를 기준으로).
const SAMPLE_MODE = process.argv.includes('--sample');
const dataDir = path.resolve(process.argv.includes('--data') ? process.argv[process.argv.indexOf('--data') + 1] : path.join(root, '..', 'aihub-full', 'TL_SPA'));
// 실제 도면 거르기(scripts/build-baseline-full.mjs와 같은 규칙): 침실 1~5, 주방·화장실 있음, 같은 평면은 한 번
const keyOf = (f) => JSON.stringify(f, (_, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));
function filterUnits(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const f = r.features;
    if (f.bedroomCount < 1 || f.bedroomCount > 5 || !(f['ratio_주방'] > 0) || !(f['ratio_화장실'] > 0)) return false;
    const k = keyOf(f);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
let drawings, pool, sourceNote, baseRows;
if (SAMPLE_MODE) {
  drawings = loadSPA().map((d) => ({ ...d, analysis: analyze(d.label, 'SPA') }));
  pool = buildPool(drawings);
  sourceNote = `샘플 공간 도면 ${drawings.length}장(${pool.length}세대)이 서로를 기준으로`;
} else {
  if (!fs.existsSync(dataDir)) {
    console.error(`실제 도면 폴더가 없습니다: ${dataDir} (샘플로 돌리려면 --sample)`);
    process.exit(1);
  }
  const N = arg('n', 300);
  const test = JSON.parse(fs.readFileSync(path.join(root, 'data', 'split.json'), 'utf8')).test;
  const step = Math.max(1, Math.floor(test.length / N));
  drawings = test
    .filter((_, i) => i % step === 0)
    .slice(0, N)
    .map((f) => {
      const label = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
      return { id: f.replace('.json', ''), label, analysis: analyze(label, 'SPA') };
    })
    .filter((d) => d.analysis.units.length);
  pool = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'baseline.json'), 'utf8')).summary.SPA;
  // 부트스트랩용: 기준 분포에 들어간 평면의 특징(도면별)
  const derived = path.join(dataDir, '..', 'derived');
  const kept = new Set(fs.readFileSync(path.join(derived, 'baseline-units.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => {
    const o = JSON.parse(l);
    return `${o.drawing}#${o.unit}`;
  }));
  baseRows = fs.readFileSync(path.join(derived, 'real-units.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((o) => kept.has(`${o.drawing}#${o.unit}`)).map((o) => ({ drawing: o.drawing, features: o.features }));
  sourceNote = `AI 허브 검증(test) 묶음 도면 ${drawings.length}장, 기준 = 전체 기준 분포(서로 다른 평면 ${pool.all.n.toLocaleString('en-US')}개)`;
}
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
const bootDrawings = SAMPLE_MODE ? null : [...new Set(baseRows.map((r) => r.drawing))];
const byDrawing = SAMPLE_MODE ? null : baseRows.reduce((m, r) => (m.get(r.drawing) || m.set(r.drawing, []).get(r.drawing)).push(r.features) && m, new Map());
for (let b = 0; b < BOOT && !SAMPLE_MODE; b++) {
  // 전체 데이터: 기준 분포를 만든 도면을 복원추출해 기준 분포를 다시 만들고(요약형) 평가 도면을 다시 채점
  const feats = [];
  for (let k = 0; k < bootDrawings.length; k++) feats.push(...byDrawing.get(bootDrawings[Math.floor(rand() * bootDrawings.length)]));
  const p = summarizePool(feats, STRATA);
  drawings.forEach((d, i) => bootScores[i].push(scoreAnalysis(d.analysis, p, {}).score));
  if ((b + 1) % 20 === 0) process.stdout.write(`\r  부트스트랩 ${b + 1}/${BOOT}`);
}
for (let b = 0; b < BOOT && SAMPLE_MODE; b++) {
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
// 전체 데이터: 문턱값마다 기준 분포를 다시 만들어야 하므로 전체 7,275장 중 고정 간격 1/5(약 1,455장)로 기준을 만든다.
//   비교 기준(기본 행)도 같은 부분집합·같은 방식으로 만들어, 차이가 문턱값에서만 오게 한다.
const allFiles = SAMPLE_MODE ? [] : fs.readdirSync(dataDir).filter((f) => f.startsWith('APT_FP_SPA_') && f.endsWith('.json')).sort().filter((_, i) => i % 5 === 0);
function variantPool() {
  const rows = [];
  for (const f of allFiles) {
    const a = analyze(JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')), 'SPA', { unitRule: 'entrance' });
    for (const u of a.units) if (u.nodes.some((n) => n.type === '거실' && !n.duct)) rows.push({ drawing: f, features: u.features });
  }
  return filterUnits(rows);
}
let subsetBase = null;
if (!SAMPLE_MODE) {
  const rows = variantPool();
  subsetBase = { rows, scores: scoreAll(drawings, summarizePool(rows.map((r) => r.features), STRATA), {}) };
}
const thresholdRows = [];
for (const v of variants) {
  Object.assign(THRESHOLDS, original, v);
  delete THRESHOLDS.name;
  const ds = drawings.map((d) => ({ ...d, analysis: analyze(d.label, 'SPA') }));
  let p, s;
  if (SAMPLE_MODE) {
    p = buildPool(ds);
    s = scoreAll(ds, p, {});
  } else {
    p = variantPool();
    s = scoreAll(ds, summarizePool(p.map((r) => r.features), STRATA), {});
  }
  const ref = SAMPLE_MODE ? base : subsetBase.scores;
  thresholdRows.push({
    name: v.name,
    tau: kendallTauB(s, ref),
    meanAbsDiff: s.reduce((acc, x, i) => acc + Math.abs(x - ref[i]), 0) / s.length,
    rlb: featMedian(p, 'livingBedroomRatio'),
    gtau: featMedian(p, 'genotypeTau'),
    gap: featMedian(p, 'privacyDepthGap'),
    livingCentral: ds.flatMap((d) => d.analysis.units).filter((u) => u.rules.find((r) => r.id === 'livingCentral')?.pass).length,
    evalUnits: ds.flatMap((d) => d.analysis.units).length,
    units: p.length,
  });
}
Object.assign(THRESHOLDS, original);
const basePoolRows = SAMPLE_MODE ? pool : subsetBase.rows;
const baseRow = { rlb: featMedian(basePoolRows, 'livingBedroomRatio'), gtau: featMedian(basePoolRows, 'genotypeTau'), gap: featMedian(basePoolRows, 'privacyDepthGap'), units: basePoolRows.length };

// ---------- 출력 ----------
fs.mkdirSync(outDir, { recursive: true });
const f1 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '–' : v.toFixed(1));
const f2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? '–' : v.toFixed(2));
const short = (id) => id.replace('APT_FP_SPA_', '');
const md = `# 민감도·불확실성 분석 결과

> 자동 생성 파일입니다(\`npm run sensitivity\`). 모델 v${MODEL_VERSION}, ${sourceNote}, 난수 시드 고정.
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
  .filter((_, i, a) => a.length <= 25 || i % Math.ceil(a.length / 20) === 0)
  .map((r) => `| ${short(r.id)} | ${f1(r.score)} | ${r.rank} | ${f1(r.median)} | ${Math.round(r.p05)}~${Math.round(r.p95)} | ${f2(r.shift)} |`)
  .join('\n')}

## 2. 도면 단위 부트스트랩(${BOOT}회): 기준 분포가 달라지면 점수가 얼마나 흔들리는가

${SAMPLE_MODE ? '' : `기준 분포를 만든 도면 ${bootDrawings.length.toLocaleString('en-US')}장을 도면 단위로 복원추출해 기준 분포를 다시 만들고 채점합니다. 도면이 많아 표는 점수 순으로 고르게 20장만 보입니다.\n`}
| 도면 | 점수 | 95% 구간 | 구간 폭 | 등급이 바뀔 확률 |
| --- | --- | --- | --- | --- |
${bootRows
  .sort((a, b) => b.score - a.score)
  .filter((_, i, a) => a.length <= 25 || i % Math.ceil(a.length / 20) === 0)
  .map((r) => `| ${short(r.id)} | ${f1(r.score)} | ${f1(r.lo)}~${f1(r.hi)} | ${f1(r.hi - r.lo)} | ${Math.round(r.gradeChange * 100)}% |`)
  .join('\n')}

- 구간 폭 중앙값: **${f1(quantile(bootRows.map((r) => r.hi - r.lo), 0.5))}점**
- 등급이 바뀔 확률이 30%를 넘는 도면: ${bootRows.filter((r) => r.gradeChange > 0.3).length}장

## 3. 링크 판정 문턱값: 그래프 규약이 바뀌면 결과가 유지되는가

기본값: minContact ${original.minContact}px, adjacencyGap ${original.adjacencyGap}px, ductMaxArea ${original.ductMaxArea}px². ${SAMPLE_MODE ? '' : `문턱값마다 기준 분포를 다시 만들어야 해서 전체 7,275장의 고정 간격 1/5(${allFiles.length.toLocaleString('en-US')}장)로 기준을 만들고, 비교 기준도 같은 부분집합·기본 문턱값으로 만든 기준(평면 ${baseRow.units.toLocaleString('en-US')}개)입니다. `}기본 설정의 거실/침실 비 중앙값 ${f2(baseRow.rlb)}, τ 중앙값 ${f2(baseRow.gtau)}, 공·사 깊이 차 중앙값 ${f2(baseRow.gap)}.

| 변형 | 점수 순위 τ | 평균 점수 차 | 거실/침실 비 중앙값 | τ 중앙값 | 깊이 차 중앙값 | 거실 중심 규칙 통과(평가 세대) | 기준 평면 수 |
| --- | --- | --- | --- | --- | --- | --- | --- |
${thresholdRows.map((r) => `| ${r.name} | ${f2(r.tau)} | ${f1(r.meanAbsDiff)} | ${f2(r.rlb)} | ${f2(r.gtau)} | ${f2(r.gap)} | ${r.livingCentral}/${r.evalUnits} | ${r.units} |`).join('\n')}

## 읽는 법

- τ가 0.8 이상이면 설정을 바꿔도 순위가 거의 같습니다. 0.5 아래면 그 설정이 결과를 좌우한다는 뜻이므로 논문에서 근거를 더 대야 합니다.
- 부트스트랩 구간이 넓으면 기준 분포가 작아 점수가 불안정하다는 뜻입니다.
`;
fs.writeFileSync(path.join(outDir, 'sensitivity.md'), md);
fs.writeFileSync(
  path.join(outDir, 'sensitivity.json'),
  JSON.stringify({ modelVersion: MODEL_VERSION, runs: RUNS, boot: BOOT, tau: { median: quantile(mcTau, 0.5), p05: quantile(mcTau, 0.05), p95: quantile(mcTau, 0.95) }, meanShift, sensitivity, rankRows, bootRows, thresholdRows }, null, 1),
);
console.log(`민감도 분석: τ 중앙값 ${f2(quantile(mcTau, 0.5))}, 평균 순위 이동 ${f2(meanShift)}, 부트스트랩 구간 폭 중앙값 ${f1(quantile(bootRows.map((r) => r.hi - r.lo), 0.5))}점`);

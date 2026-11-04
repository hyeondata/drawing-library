// 생성 평면이 실제 한국 아파트 평면과 공간구문으로 구별되는가: 비교용 생성 평면을 만든다.
// 조건 N개(침실 수는 실제 분포 비율, 면적은 침실 수별 범위에서 균등, 다목적실·발코니 유무 무작위, 선호 없음)를
//   가중치 세트(hand · calibrated · maxent)마다 두 경로로 생성한다.
//   - qubo: QUBO 전역 최적해(전수 열거)를 기본 치수로 풀어 낸 평면(가중치가 고른 배치 그 자체)
//   - full: 실제 생성기 경로(SA로 풀고 후보를 치수 다듬기 + 순위 점수 J로 고름)
// 각 평면을 실제 도면과 같은 analyze()로 재서 특징을 jsonl로 낸다. 통계는 analysis/real_vs_generated.py.
// 사용: node scripts/real-vs-generated.mjs [--n 300] [--threads 8]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
export const SETS = ['hand', 'calibrated', 'maxent'];
const targets = { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 };

if (!isMainThread) {
  const { jobs } = workerData;
  const { compareAlgorithms, defaultParams, templates } = await import('../src/generate/compare.js');
  const { buildLayout, toLabel } = await import('../src/generate/layout.js');
  const { decode } = await import('../src/generate/qubo.js');
  const { runSolver } = await import('../src/generate/solvers.js');
  const { analyze } = await import('../src/model/index.js');
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'public/data/baseline.json'), 'utf8'));
  const measure = (layout) => {
    try {
      const a = analyze(toLabel(layout), 'SPA');
      if (a.units.length !== 1) return null;
      return a.units[0].features;
    } catch {
      return null;
    }
  };
  for (const { id, spec, set } of jobs) {
    // qubo: 템플릿마다 전역 최적해, 그중 에너지가 낮은 쪽
    let bestQ = null;
    for (const t of templates(spec, set)) {
      const r = runSolver('exact', t.q, { seed: 1, budgetMs: 5000 });
      if (!bestQ || r.energy < bestQ.energy) bestQ = { energy: r.energy, x: r.samples[0].x, q: t.q };
    }
    const o = decode(bestQ.q, bestQ.x);
    const fq = measure(buildLayout(spec, { ...defaultParams(spec), frontOrder: o.front, backOrder: o.back }));
    // full: SA 경로
    const res = compareAlgorithms(spec, { baseline, algorithms: ['sa'], seed: id + 1, maxEvals: 20000, weights: set });
    const best = res.results[0].best;
    const ff = best ? measure(best.layout) : null;
    parentPort.postMessage({ id, set, spec: { area: spec.area, bedrooms: spec.bedrooms, multi: spec.multi, balcony: spec.balcony }, qubo: fq, full: ff, objective: best?.objective ?? null });
  }
  process.exit(0);
}

const N = arg('n', 300);
const THREADS = arg('threads', Math.min(8, os.availableParallelism() - 1));
// 조건: 난수 고정
let s = 20261104;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
// 침실 수 비율: 기준 분포(서로 다른 평면 8,331개)의 2·3·4침실 = 500 : 5,578 : 1,917
const pickBeds = () => {
  const u = rnd() * (500 + 5578 + 1917);
  return u < 500 ? 2 : u < 500 + 5578 ? 3 : 4;
};
const RANGE = { 2: [45, 65], 3: [59, 101], 4: [84, 135] };
const conds = Array.from({ length: N }, (_, id) => {
  const bedrooms = pickBeds();
  const [lo, hi] = RANGE[bedrooms];
  return { id, spec: { area: Math.round(lo + rnd() * (hi - lo)), bedrooms, baths: bedrooms >= 3 ? 2 : 1, dress: true, multi: rnd() < 1 / 3, outdoorUnit: true, balcony: rnd() < 0.75, targets, prefs: [] } };
});
const jobs = conds.flatMap((c) => SETS.map((set) => ({ ...c, set })));
const t0 = Date.now();
const per = Math.ceil(jobs.length / THREADS);
const out = [];
await Promise.all(
  Array.from({ length: THREADS }, (_, w) =>
    new Promise((res, rej) => {
      const mine = jobs.filter((_, i) => i % THREADS === w);
      if (!mine.length) return res();
      const wk = new Worker(new URL(import.meta.url), { workerData: { jobs: mine } });
      wk.on('message', (m) => {
        out.push(m);
        if (out.length % 50 === 0) process.stdout.write(`\r  ${out.length}/${jobs.length}`);
      });
      wk.on('error', rej);
      wk.on('exit', res);
    }),
  ),
);
out.sort((a, b) => a.id - b.id || SETS.indexOf(a.set) - SETS.indexOf(b.set));
const file = path.join(root, 'evidence', 'results', 'generated-plans.jsonl');
fs.writeFileSync(file, out.map((o) => JSON.stringify(o)).join('\n') + '\n');
console.log(`\n생성 ${out.length}개(조건 ${N} × ${SETS.length}) · ${((Date.now() - t0) / 1000).toFixed(0)}초 → ${file} (per ${per})`);

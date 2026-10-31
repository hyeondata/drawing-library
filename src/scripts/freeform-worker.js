// 자유형 평면 생성 워커: 후보마다 담금질을 돌린다.
import { WEIGHTS, anneal, buildProblem, openings, summarize } from '../freeform/engine.js';

self.onmessage = (e) => {
  const { unit, area, outline, outlineFree, syntaxPrefs = [], syntaxW = 4, freedom, jitter, seeds, steps } = e.data;
  WEIGHTS.syntax = syntaxW;
  const P = buildProblem(unit, { area, outline, outlineFree, syntaxPrefs });
  // 도면 생성 탭(외곽 형태): 고른 면적비로 바꾼 칸 수 목표
  if (e.data.target) P.target = Float64Array.from(e.data.target);
  seeds.forEach((seed, i) => {
    const t0 = performance.now();
    const res = anneal(P, { seed, jitter, freedom, steps, onProgress: (p) => self.postMessage({ type: 'progress', i, n: seeds.length, p }) });
    const ms = performance.now() - t0;
    const sum = summarize(res, P);
    const op = openings(res.assign, P);
    self.postMessage({
      type: 'cand',
      i,
      cand: {
        seed,
        ms,
        assign: res.assign,
        history: res.history,
        snaps: res.snaps,
        accepted: res.accepted,
        steps: res.steps,
        summary: sum,
        openings: op.openings,
        unreachable: op.unreachable,
        sizes: Object.fromEntries(Object.entries(res.energy.stats).map(([k, s]) => [k, s.n])),
      },
    });
  });
  self.postMessage({ type: 'done' });
};

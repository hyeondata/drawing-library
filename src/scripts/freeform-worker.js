// 자유형 평면 생성 워커: 후보마다 담금질을 돌린다.
import { anneal, openings, setup, summarize } from '../freeform/engine.js';

self.onmessage = (e) => {
  const { unit, area, freedom, jitter, seeds, steps } = e.data;
  const P = setup(unit, { area });
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

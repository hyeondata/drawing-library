// 계산 원리 화면 5번 그림: 84㎡·방 3개 QUBO를 풀이기마다 0.3초씩 풀고 수렴 기록을 돌려준다.
import { templates } from '../generate/compare.js';
import { runSolver } from '../generate/solvers.js';

const targets = { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 };
const spec = { area: 84, bedrooms: 3, baths: 2, dress: true, multi: false, outdoorUnit: true, balcony: true, targets, prefs: ['livingCentral'] };

self.onmessage = (e) => {
  try {
    const { seed, solvers } = e.data;
    const q = templates(spec)[0].q;
    const optimum = runSolver('exact', q).energy;
    const results = solvers.map((key) => {
      const r = runSolver(key, q, { seed, budgetMs: 300 });
      return { key, trace: r.trace, evals: r.evals, energy: r.energy };
    });
    self.postMessage({ results, optimum, n: q.n, penalty: q.penalty });
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
};

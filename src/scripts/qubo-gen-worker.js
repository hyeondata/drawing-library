// QUBO 도면 생성 워커: 단계 A(실 배치 QUBO) → 해마다 단계 B(문·창 QUBO) → 점검.
import { setupGrid, buildStageA, decodeA, buildStageB, decodeB, termEnergy, evaluate } from '../qubogen/model.js';
import { runSolver } from '../generate/solvers.js';

const counts = (q) => Object.fromEntries(Object.entries(q.byTerm).map(([id, t]) => [id, { lin: t.lin.size, quad: t.quad.size }]));

self.onmessage = (e) => {
  const { spec, cell, solver, budgetMs, seed, id } = e.data;
  try {
    const t0 = performance.now();
    const G = setupGrid(spec, { cell });
    const qA = buildStageA(G, { prefs: spec.prefs });
    const tBuild = performance.now() - t0;
    self.postMessage({ id, progress: 0.05, note: `단계 A QUBO: 변수 ${qA.n}개 — 푸는 중…` });
    const rA = runSolver(solver, qA, { seed, budgetMs });
    self.postMessage({ id, progress: 0.8, note: '단계 B(문·창) QUBO 푸는 중…' });
    const cands = [];
    const seen = new Set();
    for (const smp of rA.samples) {
      const { assign, broken } = decodeA(G, qA, smp.x);
      const sig = Array.from(assign).join(',');
      if (seen.has(sig)) continue;
      seen.add(sig);
      const qB = buildStageB(G, assign);
      const rB = qB.n ? runSolver(solver === 'sa' || solver === 'sqa' || solver === 'sb' ? 'tabu' : solver, qB, { seed, budgetMs: 300 }) : { samples: [{ x: new Uint8Array(0), e: 0, feasible: true }], evals: 0, ms: 0 };
      const xB = rB.samples[0].x;
      const ops = decodeB(G, qB, xB);
      const ev = evaluate(G, assign, ops);
      cands.push({
        assign: Array.from(assign),
        broken,
        eA: smp.e,
        feasibleA: smp.feasible,
        termsA: termEnergy(qA, smp.x),
        B: { n: qB.n, penalty: qB.penalty, groups: qB.groups.length, counts: counts(qB), e: rB.samples[0].e, feasible: rB.samples[0].feasible, evals: rB.evals, ms: rB.ms, solver: rB.key || solver, terms: termEnergy(qB, xB), vars: qB.vars.map((v) => v.kind).reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {}) },
        ops,
        ev,
      });
    }
    cands.sort((a, b) => b.ev.score - a.ev.score || a.eA - b.eA);
    self.postMessage({
      id,
      done: true,
      G: { nx: G.nx, ny: G.ny, C: G.C, cell: G.cell, rooms: G.rooms, balconyRows: G.balconyRows, area: G.area, spec: G.spec },
      A: { n: qA.n, penalty: qA.penalty, weights: qA.weights, counts: counts(qA), groups: qA.groups.length, energy: rA.energy, evals: rA.evals, ms: rA.ms, buildMs: tBuild, trace: rA.trace.map(([t, ev, en]) => [t, ev, en]), solver },
      cands,
    });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack ? err.stack : err) });
  }
};

// QUBO 도면 생성 워커: 고른 풀이기마다 단계 A(실 배치 QUBO) → 후보마다 단계 B(문·창·실외기실 QUBO, 같은 풀이기) → 점검.
import { setupGrid, buildStageA, decodeA, buildStageB, decodeB, termEnergy, evaluate, outdoorCols, syntaxGrid } from '../qubogen/model.js';
import { runSolver } from '../generate/solvers.js';

const counts = (q) => Object.fromEntries(Object.entries(q.byTerm).map(([id, t]) => [id, { lin: t.lin.size, quad: t.quad.size }]));

self.onmessage = (e) => {
  const { spec, cell, solvers, budgetMs, seed, syntaxScale = 1, id } = e.data;
  try {
    const G = setupGrid(spec, { cell });
    const t0 = performance.now();
    const qA = buildStageA(G, { prefs: spec.prefs, syntaxScale });
    const buildMs = performance.now() - t0;
    const results = [];
    solvers.forEach((solver, si) => {
      self.postMessage({ id, note: `${si + 1}/${solvers.length}: ${solver} — 단계 A QUBO(변수 ${qA.n}개) 푸는 중…` });
      const rA = runSolver(solver, qA, { seed, budgetMs });
      const cands = [];
      const seen = new Set();
      for (const smp of rA.samples) {
        const { assign, broken } = decodeA(G, qA, smp.x);
        const sig = Array.from(assign).join(',');
        if (seen.has(sig)) continue;
        seen.add(sig);
        const qB = buildStageB(G, assign);
        // 단계 B도 같은 풀이기로 푼다(작은 QUBO라 시간은 0.3초).
        const rB = qB.n ? runSolver(solver, qB, { seed, budgetMs: 300 }) : { samples: [{ x: new Uint8Array(0), e: 0, feasible: true }], evals: 0, ms: 0 };
        const xB = rB.samples[0].x;
        const ops = decodeB(G, qB, xB);
        const ev = evaluate(G, assign, ops);
        cands.push({
          assign: Array.from(assign),
          broken,
          eA: smp.e,
          termsA: termEnergy(qA, smp.x),
          outCols: outdoorCols(qB, xB),
          B: { n: qB.n, penalty: qB.penalty, groups: qB.groups.length, counts: counts(qB), e: rB.samples[0].e, feasible: rB.samples[0].feasible, evals: rB.evals, ms: rB.ms, terms: termEnergy(qB, xB), vars: qB.vars.map((v) => v.kind).reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {}) },
          ops,
          ev,
          syntax: syntaxGrid(G, assign),
        });
      }
      cands.sort((a, b) => b.ev.score - a.ev.score || a.eA - b.eA);
      results.push({ solver, A: { energy: rA.energy, evals: rA.evals, ms: rA.ms, trace: rA.trace.map(([t, ev, en]) => [t, ev, en]) }, cands });
    });
    self.postMessage({
      id,
      done: true,
      G: { nx: G.nx, ny: G.ny, C: G.C, cell: G.cell, rooms: G.rooms, stripRows: G.stripRows, balconyRows: G.balconyRows, balcony: G.balcony, outdoorUnit: G.outdoorUnit, area: G.area, spec: G.spec },
      QA: { n: qA.n, penalty: qA.penalty, weights: qA.weights, counts: counts(qA), groups: qA.groups.length, buildMs, prefNotes: qA.prefNotes },
      results,
    });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack ? err.stack : err) });
  }
};

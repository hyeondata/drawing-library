// QUBO 도면 생성: 항별 에너지의 합 = 전체 에너지, 그리고 Tabu로 푼 평면이 규칙 점검을 통과하는지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupGrid, buildStageA, decodeA, buildStageB, decodeB, termEnergy, evaluate } from '../src/qubogen/model.js';
import { energy } from '../src/generate/qubo.js';
import { runSolver } from '../src/generate/solvers.js';

const spec = { area: 84, bedrooms: 3, baths: 2, dress: true, multi: false, outdoorUnit: false, balcony: true, targets: { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 }, prefs: [] };

test('QUBO 도면 생성: 항별 에너지 합 = energy(), 벌점 = ⌈1 + 최대 이득⌉', () => {
  const G = setupGrid(spec, { cell: 1.2 });
  const q = buildStageA(G, {});
  let s = 7;
  const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let t = 0; t < 20; t++) {
    const x = Uint8Array.from({ length: q.n }, () => (r() < 0.1 ? 1 : 0));
    const sum = Object.values(termEnergy(q, x)).reduce((a, v) => a + v, 0);
    assert.ok(Math.abs(sum - energy(q, x)) < 1e-6);
  }
});

test('QUBO 도면 생성: Tabu로 푼 84㎡ 평면이 원-핫·연결·도달·창 점검을 통과', () => {
  const G = setupGrid(spec, { cell: 1.2 });
  const qA = buildStageA(G, {});
  const rA = runSolver('tabu', qA, { seed: 1, budgetMs: 60000, maxEvals: 400000 });
  const { assign, broken } = decodeA(G, qA, rA.samples[0].x);
  assert.equal(broken, 0);
  const qB = buildStageB(G, assign);
  const rB = runSolver('tabu', qB, { seed: 1, budgetMs: 60000, maxEvals: 50000 });
  assert.ok(rB.samples[0].feasible);
  const ev = evaluate(G, assign, decodeB(G, qB, rB.samples[0].x));
  assert.deepEqual(ev.checks.missing, []);
  assert.deepEqual(ev.checks.split, []);
  assert.deepEqual(ev.checks.unreachable, []);
  assert.deepEqual(ev.checks.noWindow, []);
});

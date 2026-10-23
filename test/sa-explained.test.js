import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQubo } from '../src/generate/qubo.js';
import { runSolver } from '../src/generate/solvers.js';
import { createSA } from '../src/generate/sa-explained.js';

const spec = { area: 84, bedrooms: 3, baths: 2, dress: true, multi: false, outdoorUnit: false, balcony: true, targets: { living: 0.24, kitchen: 0.12, master: 0.15, other: 0.11, bath: 0.05, entrance: 0.04, dress: 0.04, multi: 0.04 }, prefs: [] };

test('설명용 SA는 실제 sa()의 첫 담금질과 같은 결과를 낸다(같은 시드)', () => {
  const q = buildQubo(spec, { weights: 'calibrated' });
  for (const seed of [1, 2, 3]) {
    const sa = createSA(q, { seed });
    while (sa.step());
    // 실제 SA를 정확히 한 번의 담금질(1000 sweep × n번 평가)만큼만 돌린다
    const real = runSolver('sa', q, { seed, budgetMs: 1000, maxEvals: 1000 * q.n });
    // 실제 SA는 담금질이 끝난 상태를 후보에 넣는다 → 설명용의 마지막 상태와 같아야 한다
    const lastE = sa.E;
    assert.ok(real.samples.some((s) => Math.abs(s.e - lastE) < 1e-9 && s.x.join('') === sa.x.join('')), `seed ${seed}`);
  }
});

import { SOLVERS } from '../src/generate/solvers.js';
import { anneal, buildProblem } from '../src/freeform/engine.js';
import fs from 'node:fs';

test('기록점(onEvent)은 계산을 바꾸지 않는다: 모든 풀이기·자유형 담금질에서 기록 있음/없음 결과가 같다', () => {
  const q = buildQubo(spec, { weights: 'calibrated' });
  for (const s of SOLVERS) {
    const a = runSolver(s.key, q, { seed: 3, budgetMs: 1000, maxEvals: 20000 });
    let n = 0;
    const b = runSolver(s.key, q, { seed: 3, budgetMs: 1000, maxEvals: 20000, onEvent: () => n++ });
    assert.equal(a.energy, b.energy, s.key);
    assert.deepEqual(a.samples.map((x) => x.x.join('')), b.samples.map((x) => x.x.join('')), s.key);
    assert.ok(n > 0, `${s.key} 기록 있음`);
  }
  const u = JSON.parse(fs.readFileSync(new URL('../public/data/shapes.json', import.meta.url)))[0];
  const P1 = buildProblem(u, {});
  const P2 = buildProblem(u, {});
  const r1 = anneal(P1, { seed: 2, steps: 3000 });
  let m = 0;
  const r2 = anneal(P2, { seed: 2, steps: 3000, onEvent: () => m++ });
  assert.equal(r1.energy.total, r2.energy.total);
  assert.equal(Array.from(r1.assign).join(), Array.from(r2.assign).join());
  assert.ok(m > 0);
});

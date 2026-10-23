import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildQubo, decode } from '../src/generate/qubo.js';
import { runSolver } from '../src/generate/solvers.js';
import { buildLayout, toLabel } from '../src/generate/layout.js';
import { defaultParams } from '../src/generate/compare.js';
import { analyze } from '../src/model/index.js';
import { SYNTAX } from '../src/generate/syntax-weights.js';

const targets = { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 };
const spec = (prefs) => ({ area: 84, bedrooms: 3, baths: 2, dress: true, multi: false, outdoorUnit: true, balcony: true, targets, prefs });

test('공간구문 대리 항: 교차검증에서 대리 에너지와 실제 변수가 양의 상관(ρ > 0.4)', () => {
  for (const [k, v] of Object.entries(SYNTAX)) assert.ok(v.cv['0.5'].rho > 0.4, `${k} ρ ${v.cv['0.5'].rho}`);
});

test('선호를 고르면 QUBO에 대리 항이 들어가고, 안 고르면 안 들어간다', () => {
  assert.equal(buildQubo(spec([])).syntaxTerms.length, 0);
  const q = buildQubo(spec(['livingCentral']));
  assert.deepEqual(q.syntaxTerms.map((t) => t.key).sort(), ['genotypeTau', 'livingBedroomRatio']);
  assert.equal(buildQubo(spec(['privacy'])).syntaxTerms[0].key, 'privacyDepthGap');
});

test('거실 중심 선호의 최적 배치는 거실/침실 통합도 비가 선호 없을 때보다 작지 않다(84㎡·방 3)', () => {
  const ratio = (prefs) => {
    const sp = spec(prefs);
    const q = buildQubo(sp);
    const ex = runSolver('exact', q, { seed: 1, budgetMs: 3000 });
    const o = decode(q, ex.samples[0].x);
    const a = analyze(toLabel(buildLayout(sp, { ...defaultParams(sp), frontOrder: o.front, backOrder: o.back })), 'SPA');
    return a.units[0].features.livingBedroomRatio;
  };
  assert.ok(ratio(['livingCentral']) >= ratio([]) - 1e-9);
});

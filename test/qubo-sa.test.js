// 사이트 생성기(QUBO + SA, qubo-sa.js): 짧은 예산에서도 돌아가고, 유효한 읽기는 전부 열거한 배치 표의 에너지와 같으며, 낸 안은 점검을 거친다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultBetaRange, generateQuboSA, saRng, toIsing } from '../src/generate/qubo-sa.js';
import { buildGenQubo, enumerateTemplate } from '../src/generate/qubo-exact.js';

const targets = { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 };
const spec = { area: 59, bedrooms: 2, baths: 1, dress: false, multi: false, outdoorUnit: true, balcony: true, targets, prefs: [] };

test('QUBO + SA 생성기: 2초 예산에서 읽기를 반복하고 유효 읽기의 에너지는 E* 이상, 결과 구조가 맞다', () => {
  const ticks = [];
  const out = generateQuboSA(spec, { seed: 1, budgetMs: 2000, onTick: (t) => ticks.push(t) });
  assert.ok(out && out.reads > 0 && ticks.length > 0);
  assert.ok(out.total > 0 && Number.isFinite(out.exactMin));
  assert.ok(out.valid <= out.reads && out.hits <= out.valid);
  for (const r of out.readLog) if (r[3] !== null) assert.ok(r[3] >= out.exactMin - 1e-9);
  if (out.bestE !== null) assert.ok(out.bestE >= out.exactMin - 1e-9);
  assert.equal(out.sweeps, 1000);
  for (const c of out.cands) assert.ok(typeof c.ok === 'boolean' && Number.isFinite(c.syntaxE) && c.layout.aligned);
  for (let i = 1; i < out.cands.length; i++) if (out.cands[i - 1].ok && out.cands[i].ok) assert.ok(out.cands[i].syntaxE >= out.cands[i - 1].syntaxE - 1e-12);
});

test('β 범위: |편향| < 1e-9 잔차를 무시해 차가운 β가 비정상(1e10 이상)으로 커지지 않는다', () => {
  const t = { id: 't', front: ['living', 'master', 'bed1'], back: ['kitchen', 'entrance', 'bathPublic'], m: 3, k: 3, suite: ['bathMaster', 'dress'], types: { living: '거실', kitchen: '주방', entrance: '현관', master: '침실', bed1: '침실', bathPublic: '화장실', bathMaster: '화장실', dress: '드레스룸' } };
  const { arrangements, K } = enumerateTemplate(t);
  assert.ok(arrangements.length > 0);
  const { bqm } = buildGenQubo(t, { O1: -0.276, O2: -0.132, O3: -0.896, O7: 2.746, O2b: -1.604 }, K);
  const br = defaultBetaRange(toIsing(bqm));
  assert.ok(br[0] > 0 && br[1] > br[0] && br[1] < 1e10, `β 범위 ${br}`);
  const r = saRng(1);
  const xs = Array.from({ length: 1000 }, r);
  assert.ok(xs.every((x) => x >= 0 && x < 1) && new Set(xs).size > 990);
});

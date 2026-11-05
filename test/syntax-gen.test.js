// 연구 생성기: JS 공간구문 통계량이 Python(analysis/boltzmann_rq4.py stats_profile)과 같은지, 생성이 점검을 통과하는 평면을 내는지.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateSyntax, graphOf, syntaxStats } from '../src/generate/syntax-gen.js';
import { SYNTAX_MODEL } from '../src/generate/syntax-model-data.js';

const vecs = JSON.parse(fs.readFileSync(new URL('./fixtures/syntax-stats.json', import.meta.url), 'utf8'));

test('공간구문 통계량 8개가 Python 구현과 같다(픽스처 그래프)', () => {
  assert.ok(vecs.length >= 10);
  for (const v of vecs) {
    const f = syntaxStats(graphOf(v));
    f.forEach((x, j) => assert.ok(Math.abs(x - v.f[j]) < 1e-9, `${SYNTAX_MODEL.stats[j]}: ${x} vs ${v.f[j]}`));
  }
});

test('연구 생성기: 84㎡ 3침실에서 점검(필수 규칙·좁은 실·문 동선)을 통과한 안을 확률 순으로 낸다', () => {
  const targets = { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 };
  const spec = { area: 84, bedrooms: 3, baths: 2, dress: true, multi: false, outdoorUnit: true, balcony: true, targets, prefs: [] };
  const out = generateSyntax(spec, { seed: 1 });
  assert.ok(out && out.n > 0 && out.best);
  assert.ok(out.best.ok, '최선안이 점검을 통과해야 함');
  const ps = out.cands.filter((c) => c.ok).map((c) => c.syntaxP);
  for (let i = 1; i < ps.length; i++) assert.ok(ps[i] <= ps[i - 1] + 1e-12);
  assert.equal(out.best.layout.aligned, true);
});

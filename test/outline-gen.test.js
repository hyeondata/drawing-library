import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildProblem, anneal, openings } from '../src/freeform/engine.js';
import { largest, maskConnected, maskFromUnit } from '../src/freeform/outline.js';
import { programOf, retarget } from '../src/scripts/generate-outline.js';

const { outlines } = JSON.parse(fs.readFileSync(new URL('../public/data/outlines.json', import.meta.url), 'utf8'));
const targets = { living: 0.24, kitchen: 0.15, master: 0.13, other: 0.09, bath: 0.03, entrance: 0.04, dress: 0.05, multi: 0.03 };
const spec = (bedrooms) => ({ area: 84, bedrooms, baths: 2, dress: true, multi: false, balcony: true, outdoorUnit: true, prefs: [], targets });

test('외곽 형태: 침실 2~4개는 모든 형태에서 실 구성을 빌려 올 세대가 있다', () => {
  for (const o of outlines) for (const b of [2, 3, 4]) assert.ok(programOf(outlines, o, spec(b))?.beds === b, `${o.id} 방${b}`);
});

test('외곽 형태: 대표 외곽은 한 덩어리이고 원래 칸의 90% 이상', () => {
  for (const o of outlines) {
    const m = largest(maskFromUnit(o.rep, 84));
    assert.ok(maskConnected(m) && m.share >= 0.9, `${o.id} ${m.share}`);
  }
});

test('외곽 형태: 목표 칸 수 합은 그대로, 거실 몫은 고른 면적비를 따른다', () => {
  const s = spec(3);
  const o = outlines[1];
  const prog = programOf(outlines, o, s);
  const P0 = buildProblem(prog, { outline: { mode: 'mask', mask: largest(maskFromUnit(o.rep, 84)), balconySides: ['S'] } });
  const before = P0.movable.reduce((t, k) => t + P0.target[k], 0);
  const P = retarget(P0, s);
  const after = P.movable.reduce((t, k) => t + P.target[k], 0);
  assert.ok(Math.abs(before - after) < 1e-6);
  const liv = P.movable.find((k) => P.rooms[k].type === '거실');
  const sum = P.movable.reduce((t, k) => t + P.target[k], 0);
  assert.ok(Math.abs(P.target[liv] / sum - 0.24) < 0.05, `거실 몫 ${P.target[liv] / sum}`);
  // 짧게 담금질해도 실이 외곽 안에 다 들어간다
  const res = anneal(P, { seed: 1, steps: 3000 });
  assert.ok(openings(res.assign, P).openings.length > 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/generate/layout.js';
import { defaultParams, templates } from '../src/generate/compare.js';
import { layoutGraph } from '../src/generate/syntax-gen.js';
import { fineMask, project } from '../src/generate/projection.js';
import { unitFromLayout, judgeProjected, compareEdges } from '../src/generate/realize.js';
import { setupMask, energy, WEIGHTS } from '../src/freeform/engine.js';
import { mcnemarMidP } from '../scripts/outline-aware/graph-realize.mjs';

const CELL = 0.3;
const spec = { area: 84, bedrooms: 3, baths: 2, dress: true, multi: false, balcony: true, outdoorUnit: true, prefs: [], targets: { living: 0.24, kitchen: 0.15, master: 0.13, other: 0.09, bath: 0.03, entrance: 0.04, dress: 0.05, multi: 0.03 } };
function rectCase() {
  const D = defaultParams(spec).depth;
  const nx = Math.round(spec.area / D / CELL);
  const ny = Math.round(D / CELL);
  const mask = { nx, ny, cells: new Uint8Array(nx * ny).fill(1) };
  const spec2 = { ...spec, area: nx * CELL * ny * CELL };
  const base = { ...defaultParams(spec2), depth: ny * CELL };
  const t = templates(spec2, 'hand')[0];
  const rest = t.q.bands.front.rooms.filter((x) => x !== 'master');
  const lay = buildLayout(spec2, { ...structuredClone(base), frontOrder: ['master', ...rest], backOrder: t.q.bands.back.rooms, align: true });
  return { mask, lay };
}

test('C-1: unitFromLayout 간선 = layoutGraph, exactGraph forbid = 나머지 실 쌍 전부', () => {
  const { mask, lay } = rectCase();
  const u = unitFromLayout(lay);
  const g = layoutGraph(lay);
  const nE = [...g.adj.values()].reduce((t, s) => t + s.size, 0) / 2;
  assert.equal(u.edges.length, nE);
  const P = setupMask(u, mask, { balconySides: ['S'], outdoorUnit: true, exactGraph: true });
  const n = u.keys.length;
  assert.equal(P.need.length, nE);
  assert.equal(P.forbid.length, (n * (n - 1)) / 2 - nE);
  assert.equal(P.minTouch, 2);
  // 기본 모드는 그대로: forbid 없음, extra 항 0
  const P0 = setupMask(u, mask, { balconySides: ['S'], outdoorUnit: true });
  assert.equal(P0.forbid, undefined);
  assert.equal(energy(Int16Array.from(P0.grid), P0).terms.extra, 0);
  assert.equal(WEIGHTS.extra, WEIGHTS.adj);
});

test('C-1: 꽉 찬 직사각형 투영은 원 규약(0.1 m)에서 그래프가 그대로', () => {
  const { mask, lay } = rectCase();
  const pr = project(lay, fineMask(mask, CELL));
  assert.ok(judgeProjected(pr, lay, { minLen: 0.1 }).ok);
});

test('C-1: 간선 비교·McNemar mid-p', () => {
  assert.deepEqual(compareEdges(new Set(['a|b', 'b|c']), new Set(['a|b', 'a|c'])), { same: false, missing: ['b|c'], extra: ['a|c'] });
  assert.equal(mcnemarMidP(0, 0), 1);
  assert.ok(Math.abs(mcnemarMidP(1, 5) - 0.125) < 1e-12);
  assert.ok(Math.abs(mcnemarMidP(5, 1) - 0.125) < 1e-12);
});

test('C-1(10-11): minWidths를 주면 실별 최소 폭 = R5(안방 별도, 복도 1.2 m), 안 주면 기존 값', async () => {
  const { minSidesFor } = await import('../src/generate/layout.js');
  const { minWidthOf, MIN_WIDTH } = await import('../src/freeform/engine.js');
  const { mask, lay } = rectCase();
  const u = unitFromLayout(lay);
  const mw = minSidesFor(spec);
  const P = setupMask(u, mask, { balconySides: ['S'], outdoorUnit: true, exactGraph: true, minWidths: mw });
  u.keys.forEach((key, i) => {
    const t = u.rooms[i].type;
    const want = key === 'master' ? mw['안방'] : mw[t] ?? (t === '기타' ? 1.2 : MIN_WIDTH[t] ?? 1);
    assert.equal(minWidthOf(P, i), want, key);
  });
  const P0 = setupMask(u, mask, { balconySides: ['S'], outdoorUnit: true, exactGraph: true });
  assert.equal(minWidthOf(P0, u.keys.indexOf('living')), MIN_WIDTH['거실']);
});

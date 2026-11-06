import test from 'node:test';
import assert from 'node:assert/strict';
import { toAihubSPAPolys, toAihubSPA } from '../src/generate/aihub.js';
import { roomPolygons } from '../src/freeform/engine.js';

test('toAihubSPAPolys: one polygon per room + background, L-shape keeps 6 corners', () => {
  // 3×2 칸(1 m) 격자: 0번 실 ㄱ자(5칸), 1번 실 1칸
  const P = { nx: 3, ny: 2, sx: 1, sy: 1 };
  const a = Int16Array.from([0, 0, 0, 0, 0, 1]);
  const rooms = [
    { type: '거실', loops: roomPolygons(a, P, 0) },
    { type: '침실', loops: roomPolygons(a, P, 1) },
  ];
  const d = toAihubSPAPolys(rooms, '912340001');
  assert.equal(d.annotations.length, 3);
  assert.equal(d.annotations.at(-1).category_id, 12);
  assert.equal(d.annotations[0].segmentation[0].length, 12); // 꼭짓점 6개
  assert.equal(d.annotations[0].area, 5 * 100 * 100);
  assert.equal(d.annotations[1].area, 100 * 100);
  assert.equal(d.images[0].file_name, 'APT_FP_SPA_912340001.PNG');
});

test('toAihubSPAPolys matches rectangle SPA areas for rectangles', () => {
  const lay = { W: 4, D: 3, rooms: [{ type: '거실', x: 0, y: 0, w: 4, h: 3 }] };
  const r = toAihubSPA(lay).annotations[0];
  const p = toAihubSPAPolys([{ type: '거실', loops: [[[0, 0], [4, 0], [4, 3], [0, 3]]] }]).annotations[0];
  assert.equal(p.area, r.area);
  assert.equal(p.category_id, r.category_id);
});

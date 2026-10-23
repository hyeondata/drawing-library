import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { access, anneal, energy, openings, roomPolygons, setup } from '../src/freeform/engine.js';

const units = JSON.parse(fs.readFileSync(new URL('../public/data/shapes.json', import.meta.url)));
const OUT = new Set(['발코니', '실외기실']);
const polyArea = (p) => Math.abs(p.reduce((s, [x, y], i) => s + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y, 0)) / 2;

test('Sample에서 뽑은 세대는 모두 사각형이 아닌 실을 가진다', () => {
  assert.ok(units.length >= 20);
  for (const u of units) assert.ok(u.nonrect.length >= 1 && u.rooms.some((r) => r.type === '현관'));
});

test('고른 전용면적에 격자 면적을 맞춘다(±3%)', () => {
  const u = units[0];
  const P = setup(u, { area: 100 });
  let cells = 0;
  for (const v of P.grid) if (v >= 0 && !OUT.has(P.rooms[v].type)) cells++;
  assert.ok(Math.abs(cells * P.sx * P.sy - 100) / 100 < 0.03);
});

test('담금질 뒤에도 실은 한 덩어리이고, 다각형 면적 = 칸 면적, 에너지는 줄어든다', () => {
  const u = units.find((x) => x.id === '037105612-1') || units[0];
  const P = setup(u);
  const res = anneal(P, { seed: 2, jitter: 0.5, freedom: 'L', steps: 6000 });
  assert.ok(res.history.at(-1).E <= res.history[0].E);
  for (const k of P.movable) {
    const n = res.energy.stats[k].n;
    if (!n) continue;
    const loops = roomPolygons(res.assign, P, k);
    assert.equal(loops.length, 1, `실 ${k}는 구멍 없는 한 덩어리`);
    assert.ok(Math.abs(polyArea(loops[0]) - n * P.sx * P.sy) < 0.01); // 좌표를 0.001m로 반올림
  }
});

test('원본 배치는 대부분 접근 규칙을 통과하고, 문은 현관에서 이어진다', () => {
  let ok = 0;
  for (const u of units) {
    const P = setup(u);
    const a = Int16Array.from(P.grid);
    if (!access(P, energy(a, P).stats).unreach.length && !openings(a, P).unreachable.length) ok++;
  }
  assert.ok(ok / units.length >= 0.85, `통과 ${ok}/${units.length}`);
});

import { buildProblem, transformUnit } from '../src/freeform/engine.js';
import { maskConnected, maskFromUnit, templateMask } from '../src/freeform/outline.js';

test('외곽 템플릿은 고른 면적에 맞고(±3%) 한 덩어리다', () => {
  for (const k of ['rect', 'L', 'U', 'T', 'step'])
    for (const area of [60, 84, 119]) {
      const m = templateMask(k, area, { aspect: 1.5, cut: 0.35 });
      assert.ok(Math.abs(m.n * 0.09 - area) / area < 0.03, `${k} ${area}`);
      assert.ok(maskConnected(m));
    }
});

test('원본 변형(회전·뒤집기·비율)은 실 면적을 바꾸지 않는다', () => {
  const u = units[0];
  const t = transformUnit(u, { rot: 1, flipX: true, aspect: 1.3 });
  const sum = (x) => x.rooms.reduce((s, r) => s + r.polys.reduce((q, p) => q + polyArea(p), 0), 0);
  assert.ok(Math.abs(sum(t) - sum(u)) / sum(u) < 1e-9);
});

test('새 외곽: 실내 칸을 모두 실에 나누고, 현관은 바깥에 닿으며, 외곽 다듬기는 구멍을 만들지 않는다', () => {
  const u = units.find((x) => x.id === '037105612-1') || units[0];
  for (const outline of [
    { mode: 'mask', mask: templateMask('L', 90, { aspect: 1.5, cut: 0.35 }), balcony: true },
    { mode: 'mask', mask: maskFromUnit(u, 90), balcony: true, outdoorUnit: true },
  ]) {
    const P = buildProblem(u, { area: 90, outline, outlineFree: true });
    let inside = 0;
    for (const v of P.grid) if (v >= 0 && !OUT.has(P.rooms[v].type)) inside++;
    assert.equal(inside, outline.mask.n);
    const res = anneal(P, { seed: 1, jitter: 0.4, freedom: 'L', steps: 8000 });
    for (const k of P.movable) if (res.energy.stats[k].n) assert.equal(roomPolygons(res.assign, P, k).length, 1);
    // 바깥(-1) 칸은 모두 격자 가장자리와 이어져야 한다(갇힌 구멍 없음)
    const { nx, ny } = P;
    const a = res.assign;
    const seen = new Uint8Array(a.length);
    const q = [];
    for (let k = 0; k < a.length; k++) if (a[k] === -1 && (k % nx === 0 || k % nx === nx - 1 || k < nx || k >= nx * (ny - 1))) ((seen[k] = 1), q.push(k));
    while (q.length) {
      const k = q.pop();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = (k % nx) + di;
        const j = Math.floor(k / nx) + dj;
        if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
        const m = j * nx + i;
        if (!seen[m] && a[m] === -1) ((seen[m] = 1), q.push(m));
      }
    }
    for (let k = 0; k < a.length; k++) if (a[k] === -1) assert.ok(seen[k], '갇힌 바깥 칸');
    assert.equal(res.energy.terms.entry, 0, '현관이 바깥에 닿음');
  }
});

import { openings as ffOpenings, solarFreeform } from '../src/freeform/engine.js';

test('자유형 방위: 앞쪽을 돌리면 같은 창의 향이 함께 돈다(남 → 동이면 남향 창이 동향)', () => {
  const u = units.find((x) => x.id === '037105612-1') || units[0];
  const P = setup(u);
  const a = Int16Array.from(P.grid);
  const op = ffOpenings(a, P).openings;
  const south = solarFreeform(a, P, op, { front: 180 });
  const east = solarFreeform(a, P, op, { front: 90 });
  assert.ok(south.length > 0);
  for (const r of south) {
    const e = east.find((x) => x.k === r.k);
    assert.deepEqual(e.faces, r.faces.map((az) => (((az - 90) % 360) + 360) % 360));
  }
  // 남향 창이 있는 실은 동지 8시간
  for (const r of south) if (r.faces.includes(180)) assert.ok(Math.abs(r.total - 8) < 1e-9);
});

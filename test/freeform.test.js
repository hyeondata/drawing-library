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

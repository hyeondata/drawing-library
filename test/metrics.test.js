import test from 'node:test';
import assert from 'node:assert/strict';
import { circulation, daylight, deviation, diversity, koreanMetrics } from '../src/generate/metrics.js';

// 2×1 칸짜리 단순 평면: 뒤(y=0)에 현관·주방, 앞(y=D)에 거실·침실, 앞에 발코니
const layout = {
  W: 8,
  D: 6,
  rooms: [
    { key: 'entrance', type: '현관', name: '현관', x: 0, y: 0, w: 2, h: 3 },
    { key: 'kitchen', type: '주방', name: '주방', x: 2, y: 0, w: 6, h: 3 },
    { key: 'living', type: '거실', name: '거실', x: 0, y: 3, w: 5, h: 3 },
    { key: 'master', type: '침실', name: '안방', x: 5, y: 3, w: 3, h: 3 },
    { key: 'balcony', type: '발코니', name: '발코니', x: 0, y: 6, w: 8, h: 1.5 },
  ],
  openings: [
    { kind: 'door', entry: true, x1: 0.5, y1: 0, x2: 1.5, y2: 0, from: 'outside', to: 'entrance' },
    { kind: 'opening', x1: 2, y1: 1, x2: 2, y2: 2, from: 'entrance', to: 'kitchen' },
    { kind: 'opening', x1: 3, y1: 3, x2: 4.5, y2: 3, from: 'kitchen', to: 'living' },
    { kind: 'door', x1: 5, y1: 4, x2: 5, y2: 4.9, from: 'living', to: 'master' },
    { kind: 'sliding', x1: 1, y1: 6, x2: 4, y2: 6, from: 'living', to: 'balcony' },
    { kind: 'sliding', x1: 5.5, y1: 6, x2: 7.5, y2: 6, from: 'master', to: 'balcony' },
    { kind: 'window', x1: 4, y1: 0, x2: 6, y2: 0, to: 'kitchen' },
  ],
};

test('베이·맞통풍·국민주택규모·서비스면적', () => {
  const k = koreanMetrics(layout);
  assert.equal(k.bays, 2);
  assert.deepEqual(k.bayRooms, ['거실', '안방']);
  assert.equal(k.cross, true);
  assert.equal(k.nationalSize, true);
  assert.equal(k.service, 12);
});

test('동선 깊이는 문 수, 발코니 미닫이는 경로에서 뺀다', () => {
  const c = circulation(layout);
  assert.deepEqual([c.depth.entrance, c.depth.kitchen, c.depth.living, c.depth.master], [0, 1, 2, 3]);
  assert.equal(c.depth.balcony, undefined);
  assert.ok(c.meters.master > c.meters.living);
  assert.equal(c.pathTo('master').length, 8); // 현관문 + (실 중심, 문) × 3 + 안방 중심
});

test('채광 1/10·환기 1/20 (창 높이 가정)', () => {
  const L = Object.fromEntries(daylight(layout).map((l) => [l.key, l]));
  // 거실: 미닫이 3m × 2.1m = 6.3㎡ / 15㎡ = 42%
  assert.ok(Math.abs(L.living.light - 0.42) < 1e-9);
  assert.equal(L.living.lightOk, true);
  // 주방: 창 2m × 1.2m = 2.4㎡ / 18㎡ = 13.3%, 환기 6.7%
  assert.equal(L.kitchen.lightOk, true);
  assert.equal(L.kitchen.ventOk, true);
});

test('면적 편차 등급과 후보 다양성', () => {
  assert.equal(deviation(10, 10.4).level, 'good');
  assert.equal(deviation(10, 10.8).level, 'warn');
  assert.equal(deviation(10, 12).level, 'bad');
  const d = diversity([layout, layout]);
  assert.equal(d[0][1], 0);
});

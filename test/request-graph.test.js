import test from 'node:test';
import assert from 'node:assert/strict';
import { compareGraph } from '../src/generate/request-graph.js';

// 뒤(y 0~3): 현관·주방, 앞(y 3~6): 거실·안방. 안방은 현관과 떨어져 있고 거실 쪽 문.
const layout = {
  rooms: [
    { key: 'entrance', type: '현관', name: '현관', x: 0, y: 0, w: 2, h: 3 },
    { key: 'kitchen', type: '주방', name: '주방', x: 2, y: 0, w: 6, h: 3 },
    { key: 'living', type: '거실', name: '거실', x: 0, y: 3, w: 5, h: 3 },
    { key: 'master', type: '침실', name: '안방', x: 5, y: 3, w: 3, h: 3 },
  ],
  openings: [
    { kind: 'opening', from: 'entrance', to: 'kitchen' },
    { kind: 'opening', from: 'kitchen', to: 'living' },
    { kind: 'door', from: 'living', to: 'master' },
  ],
};

test('원함이 문으로 이어지면 충족, 피함이 떨어져 있으면 지킴', () => {
  const g = compareGraph({ prefs: [] }, layout);
  const by = Object.fromEntries(g.pairs.map((p) => [p.label, p]));
  assert.equal(by['주방–거실'].status, 'met');
  assert.equal(by['현관–공용 공간'].status, 'met');
  assert.equal(by['안방–거실·복도'].status, 'met');
  assert.equal(by['안방–현관'].status, 'kept');
  assert.equal(g.counts.ged, 0);
});

test('조용한 침실 선호에서 안방이 주방과 맞닿으면 어김', () => {
  const g = compareGraph({ prefs: ['quiet'] }, layout);
  const p = g.pairs.find((x) => x.label === '안방–주방');
  assert.equal(p.status, 'violated');
  assert.equal(p.strength, 'pref');
  assert.equal(g.counts.violated, 1);
});

test('문이 없으면 맞닿아도 문 없음(0.5), 떨어지면 빠짐(1)', () => {
  const noDoor = { ...layout, openings: layout.openings.filter((o) => o.to !== 'master') };
  const g = compareGraph({ prefs: [] }, noDoor);
  assert.equal(g.pairs.find((x) => x.label === '안방–거실·복도').status, 'wall');
  assert.equal(g.counts.ged, 0.5);
});

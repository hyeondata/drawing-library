import test from 'node:test';
import assert from 'node:assert/strict';
import { netDims } from '../src/generate/net-dims.js';

// 4×3 두 실을 나란히, 앞(아래)에 발코니
const layout = {
  W: 8,
  D: 3,
  rooms: [
    { key: 'a', type: '침실', name: 'A', x: 0, y: 0, w: 4, h: 3 },
    { key: 'b', type: '거실', name: 'B', x: 4, y: 0, w: 4, h: 3 },
    { key: 'bal', type: '발코니', name: '발코니', x: 0, y: 3, w: 8, h: 1.5 },
  ],
};

test('안목 치수: 바깥·발코니 쪽은 외벽 절반 0.1m, 실내끼리는 내벽 절반 0.06m를 뺀다', () => {
  const n = netDims(layout);
  // A: 왼쪽 바깥 0.1, 오른쪽 B 0.06, 위 바깥 0.1, 아래 발코니 0.1
  assert.deepEqual(n.a.sides, { left: 0.1, right: 0.06, top: 0.1, bottom: 0.1 });
  assert.ok(Math.abs(n.a.nw - 3.84) < 1e-9 && Math.abs(n.a.nh - 2.8) < 1e-9);
  assert.ok(Math.abs(n.a.area - 3.84 * 2.8) < 1e-9);
  // 발코니: 실내와 맞닿은 위쪽은 외벽 절반, 나머지 바깥은 기타벽 절반
  assert.equal(n.bal.sides.top, 0.1);
  assert.equal(n.bal.sides.bottom, 0.06);
});

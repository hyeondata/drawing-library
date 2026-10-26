// 문 규칙: 침실(안방 포함)은 부속실·다른 침실을 거쳐 들어가지 않고, 발코니 문은 실내 동선으로 치지 않는다.
// 이 치수는 'SA 기반 도면 생성 과정' 문서의 84㎡ 예시에서 안방 문이 부부욕실 쪽으로 나던 경우다(2026-10-26 수정).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/generate/layout.js';
import { sharedSegment } from '../src/generate/openings.js';

const spec = {
  area: 84, bedrooms: 3, baths: 2, dress: true, multi: false, outdoorUnit: true, balcony: true, prefs: ['livingCentral'],
  targets: { living: 0.23899325800796564, kitchen: 0.1575811051255887, master: 0.1253937595800874, other: 0.0876765987942067, bath: 0.03201794329191832, entrance: 0.03891707882661403, dress: 0.049901133606526954, multi: 0.030332131032240105 },
};
const params = {
  depth: 7.123107788855779, frontShare: 0.66, bedWidth: 3, masterDepth: 0.7196629952639341, suiteOrder: false, stackService: false,
  jitter: Array(12).fill(0), areaMul: [0.982, 1.009, 1.018, 0.994, 1.04, 0.996, 0.999, 0.971, 0.992, 0.98, 0.972, 0.999],
  backBedSide: 'near', entranceSide: 'right', livingPos: 0, frontBeds: 1, masterEnd: 'left',
  frontOrder: ['bed2', 'living', 'bed1', 'master'], backOrder: ['bathPublic', 'kitchen', 'entrance'],
};

test('침실 문은 부속실·다른 침실 쪽으로 나지 않고, 공용 공간에 못 닿는 침실은 갈 수 없는 실로 감점된다', () => {
  const L = buildLayout(spec, params);
  const by = Object.fromEntries(L.rooms.map((r) => [r.key, r]));
  for (const r of L.rooms.filter((x) => x.type === '침실')) {
    const d = L.openings.find((o) => o.kind === 'door' && o.to === r.key);
    if (d) {
      const from = by[d.from];
      assert.ok(from && from.type !== '침실' && !['bathMaster', 'dress'].includes(from.key), `${r.name} 문이 ${from?.name} 쪽`);
    }
    const touchesPublic = L.rooms.some((o) => ['기타', '거실', '현관', '주방'].includes(o.type) && sharedSegment(r, o) && Math.hypot(sharedSegment(r, o).x2 - sharedSegment(r, o).x1, sharedSegment(r, o).y2 - sharedSegment(r, o).y1) > 0.6);
    if (!touchesPublic) assert.ok(L.doorCheck.unreachable.includes(r.key), `${r.name}는 공용 공간에 닿지 않으므로 갈 수 없는 실이어야 함`);
  }
});

test('발코니 문(미닫이)은 실내 동선으로 치지 않는다: 실외기실은 발코니를 거쳐 갈 수 있다', () => {
  const L = buildLayout(spec, params);
  assert.ok(!L.doorCheck.unreachable.includes('outdoor'));
  assert.ok(!L.doorCheck.unreachable.includes('balcony'));
});

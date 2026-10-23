// 안목 치수: 벽 중심선 치수에서 벽 두께의 절반씩을 뺀 실내 유효 치수.
// 벽 규칙은 AI 허브 형식 내보내기(aihub.js toAihubSTR)와 같다: 실내–바깥·실내–발코니 경계 = 철근콘크리트 외벽 0.2m,
// 실내끼리 = 내벽 0.12m, 벽은 경계선 가운데에 놓인다(양쪽에 절반씩). 한 변에 외벽이 조금이라도 있으면 그 변은 외벽 두께로 본다(보수적).
import { sharedSegment } from './openings.js';

export const WALL = { rc: 0.2, inner: 0.12 };
const OUTDOOR = new Set(['발코니', '실외기실']);

/** layout → { key: { nw, nh, area, sides: { left, right, top, bottom }(빼는 두께, m) } } */
export function netDims(layout) {
  const rooms = layout.rooms;
  const out = {};
  for (const r of rooms) {
    const isOut = OUTDOOR.has(r.type);
    // 변마다 실내 이웃이 덮는 길이를 센다.
    const cover = { left: 0, right: 0, top: 0, bottom: 0 };
    const rcSide = { left: false, right: false, top: false, bottom: false };
    for (const o of rooms) {
      if (o === r) continue;
      const s = sharedSegment(r, o);
      if (!s) continue;
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      const side = s.v ? (Math.abs(s.x1 - r.x) < 1e-6 ? 'left' : 'right') : Math.abs(s.y1 - r.y) < 1e-6 ? 'top' : 'bottom';
      if (OUTDOOR.has(o.type) !== isOut) rcSide[side] = true; // 실내–발코니 경계는 외벽
      else cover[side] += len;
    }
    const sideLen = { left: r.h, right: r.h, top: r.w, bottom: r.w };
    const sides = {};
    for (const k of ['left', 'right', 'top', 'bottom']) {
      // 이웃이 다 덮지 못한 부분은 세대 바깥 = 외벽(실내 실) / 기타벽(발코니)
      const exposed = sideLen[k] - cover[k] > 0.05;
      const t = rcSide[k] || (exposed && !isOut) ? WALL.rc : WALL.inner;
      sides[k] = t / 2;
    }
    const nw = Math.max(0, r.w - sides.left - sides.right);
    const nh = Math.max(0, r.h - sides.top - sides.bottom);
    out[r.key] = { nw, nh, area: nw * nh, sides };
  }
  return out;
}

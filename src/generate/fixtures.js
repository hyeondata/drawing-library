// 생성한 평면에 설비(AI 허브 OBJ 종류: 변기·세면대·욕조·싱크대·가스레인지)를 놓는다(단위 m).
// 실마다 문(주방은 거실 쪽 개구부)이 있는 변을 '앞'으로 보고, 맞은편 벽(뒤)과 옆벽을 따라 놓는다.

const M = 0.05; // 벽에서 띄우는 간격

/** 실의 네 변 가운데 선분이 놓인 변 이름. */
function sideOf(room, seg) {
  const e = 1e-6;
  if (!seg.v && Math.abs(seg.y1 - room.y) < e) return 'top';
  if (!seg.v && Math.abs(seg.y1 - (room.y + room.h)) < e) return 'bottom';
  if (seg.v && Math.abs(seg.x1 - room.x) < e) return 'left';
  return 'right';
}

/** 앞 변 기준 지역 좌표(x' = 앞 변을 따라, y' = 앞에서 안쪽으로) → 전역 직사각형. */
function frame(room, side) {
  const W = side === 'top' || side === 'bottom' ? room.w : room.h;
  const D = side === 'top' || side === 'bottom' ? room.h : room.w;
  const pt = (x, y) => {
    if (side === 'top') return [room.x + x, room.y + y];
    if (side === 'bottom') return [room.x + x, room.y + room.h - y];
    if (side === 'left') return [room.x + y, room.y + x];
    return [room.x + room.w - y, room.y + x];
  };
  const rect = (x0, y0, x1, y1) => {
    const [ax, ay] = pt(x0, y0);
    const [bx, by] = pt(x1, y1);
    return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
  };
  // 앞 변 위 한 점의 x'
  const along = (gx, gy) => (side === 'top' || side === 'bottom' ? gx - room.x : gy - room.y);
  return { W, D, rect, along };
}

/**
 * 설비 목록. 반환: [{ type: '변기'|'세면대'|'욕조'|'싱크대'|'가스레인지', room, x, y, w, h, facing }]
 * facing: 설비가 바라보는 방향(앞 변 쪽) — 그리기에서 변기 모양의 방향에 쓴다.
 */
export function placeFixtures(layout, openings) {
  const out = [];
  const add = (type, room, f, side, x0, y0, x1, y1) => out.push({ type, room: room.key, side, ...f.rect(x0, y0, x1, y1) });
  const doorOf = (room) => openings.find((o) => o.kind === 'door' && o.to === room.key);

  for (const room of layout.rooms) {
    if (room.type === '화장실') {
      const door = doorOf(room);
      const side = door ? sideOf(room, door) : 'bottom';
      const f = frame(room, side);
      const dc = door ? (f.along(door.x1, door.y1) + f.along(door.x2, door.y2)) / 2 : f.W / 2;
      const away = dc < f.W / 2 ? 'right' : 'left'; // 문에서 먼 옆벽
      const sx = (w) => (away === 'right' ? [f.W - M - w, f.W - M] : [M, M + w]);
      // 공용욕실(또는 하나뿐인 욕실)에는 욕조를 뒤 벽에 놓는다.
      const tub = room.key === 'bathPublic' && f.W >= 1.4 && f.D >= 1.9;
      let back = f.D - M;
      if (tub) {
        add('욕조', room, f, side, M, f.D - M - 0.75, Math.min(f.W - M, M + 1.5), f.D - M);
        back = f.D - M - 0.8;
        // 변기·세면대는 문에서 먼 옆벽을 따라
        const [a, b] = sx(0.45);
        add('변기', room, f, side, a, back - 0.7, b, back);
        // 세면대: 같은 옆벽의 문 쪽(문이 여닫히는 0.8m는 비운다), 자리가 없으면 반대쪽 구석
        if (back - 0.75 - 0.5 >= 0.8) add('세면대', room, f, side, a, back - 0.75 - 0.5, b, back - 0.75);
        else if (away === 'right') add('세면대', room, f, side, M, back - 0.45, M + 0.55, back);
        else add('세면대', room, f, side, f.W - M - 0.55, back - 0.45, f.W - M, back);
      } else {
        // 뒤 벽에 세면대, 문에서 먼 옆쪽 구석에 변기
        const [a, b] = sx(0.45);
        add('변기', room, f, side, a, back - 0.7, b, back);
        const bx = away === 'right' ? [M, M + 0.55] : [f.W - M - 0.55, f.W - M];
        if (f.W >= 1.2) add('세면대', room, f, side, bx[0], back - 0.45, bx[1], back);
        else add('세면대', room, f, side, a, back - 0.7 - 0.55, b, back - 0.75);
      }
    }
    if (room.type === '주방') {
      // 앞 = 거실과 가장 길게 트인 변. 뒤 벽을 따라 싱크대와 가스레인지.
      const open = openings.filter((o) => o.kind === 'opening' && (o.to === room.key || o.from === room.key)).sort((a, b) => Math.hypot(b.x2 - b.x1, b.y2 - b.y1) - Math.hypot(a.x2 - a.x1, a.y2 - a.y1))[0];
      const side = open ? sideOf(room, open) : 'bottom';
      const f = frame(room, side);
      const L = Math.min(f.W - 2 * M, 3.2);
      if (L >= 1.4) {
        add('싱크대', room, f, side, M, f.D - M - 0.6, M + L - 0.65, f.D - M);
        add('가스레인지', room, f, side, M + L - 0.6, f.D - M - 0.6, M + L, f.D - M);
      }
    }
  }
  return out;
}

/** 설비를 AI 허브 OBJ 라벨(객체_*)로 쓸 때의 범주 이름. */
export const FIXTURE_TYPES = ['변기', '세면대', '욕조', '싱크대', '가스레인지'];

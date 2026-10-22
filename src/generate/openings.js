// 생성한 평면에 문·개구부·창을 단다(단위 m).
// 문 규칙: 현관 바깥문 1개, 공용 공간(현관·거실·주방·복도)끼리는 벽 없이 트고(개구부), 침실·공용욕실·다목적실은 공용 공간 쪽으로,
// 부부욕실·드레스룸은 안방 쪽으로 문을 낸다. 거실·침실이 발코니에 닿으면 미닫이 창(발코니 문)을, 바깥 벽에는 창을 낸다.
// 문 그래프로 현관에서 모든 실에 갈 수 있는지도 센다(평가 모델은 인접 그래프라 문 위치를 보지 못한다).

const EPS = 1e-6;
const PUBLIC = new Set(['현관', '거실', '주방', '기타']);
const OUTDOOR = new Set(['발코니', '실외기실']);
export const DOOR_WIDTH = { 현관: 1.0, 침실: 0.9, 화장실: 0.8, 드레스룸: 0.8, 다목적공간: 0.8, 실외기실: 0.7 };

/** 두 직사각형이 맞닿은 선분. 반환: { x1, y1, x2, y2, v(세로 여부) } 또는 null */
export function sharedSegment(a, b) {
  if (Math.abs(a.x + a.w - b.x) < EPS || Math.abs(b.x + b.w - a.x) < EPS) {
    const x = Math.abs(a.x + a.w - b.x) < EPS ? b.x : a.x;
    const y1 = Math.max(a.y, b.y);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    if (y2 - y1 > EPS) return { x1: x, y1, x2: x, y2, v: true };
  }
  if (Math.abs(a.y + a.h - b.y) < EPS || Math.abs(b.y + b.h - a.y) < EPS) {
    const y = Math.abs(a.y + a.h - b.y) < EPS ? b.y : a.y;
    const x1 = Math.max(a.x, b.x);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    if (x2 - x1 > EPS) return { x1, y1: y, x2, y2: y, v: false };
  }
  return null;
}
const lengthOf = (s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

/** 실 둘레 중 다른 실과 맞닿지 않은 부분(바깥 벽) 선분들. */
export function exteriorSegments(room, rooms) {
  const sides = [
    { x1: room.x, y1: room.y, x2: room.x + room.w, y2: room.y, v: false },
    { x1: room.x, y1: room.y + room.h, x2: room.x + room.w, y2: room.y + room.h, v: false },
    { x1: room.x, y1: room.y, x2: room.x, y2: room.y + room.h, v: true },
    { x1: room.x + room.w, y1: room.y, x2: room.x + room.w, y2: room.y + room.h, v: true },
  ];
  const out = [];
  for (const side of sides) {
    // 변 위의 구간 [a, b]에서 맞닿은 구간을 뺀다.
    let free = side.v ? [[side.y1, side.y2]] : [[side.x1, side.x2]];
    for (const o of rooms) {
      if (o === room) continue;
      const s = sharedSegment(room, o);
      if (!s || s.v !== side.v) continue;
      if (side.v ? Math.abs(s.x1 - side.x1) > EPS : Math.abs(s.y1 - side.y1) > EPS) continue;
      const [c, d] = side.v ? [s.y1, s.y2] : [s.x1, s.x2];
      free = free.flatMap(([a, b]) => [
        [a, Math.min(b, c)],
        [Math.max(a, d), b],
      ]).filter(([a, b]) => b - a > 0.05);
    }
    for (const [a, b] of free) out.push(side.v ? { x1: side.x1, y1: a, x2: side.x1, y2: b, v: true } : { x1: a, y1: side.y1, x2: b, y2: side.y1, v: false });
  }
  return out;
}

/** 선분 안에 폭 width 구간을 잡는다. at: 'start'면 모서리에서 0.15m 띄워, 'center'면 가운데. */
function span(seg, width, at = 'start') {
  const L = lengthOf(seg);
  const w = Math.min(width, L - 0.1);
  if (w <= 0.3) return null;
  const off = at === 'center' || L < w + 0.3 ? (L - w) / 2 : 0.15;
  const ux = (seg.x2 - seg.x1) / L;
  const uy = (seg.y2 - seg.y1) / L;
  return { x1: seg.x1 + ux * off, y1: seg.y1 + uy * off, x2: seg.x1 + ux * (off + w), y2: seg.y1 + uy * (off + w), v: seg.v };
}

/** 문이 열리는 방향(into 실 쪽)의 법선. */
function normalInto(seg, room) {
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  return seg.v ? { nx: Math.sign(cx - seg.x1) || 1, ny: 0 } : { nx: 0, ny: Math.sign(cy - seg.y1) || 1 };
}

/**
 * 문·개구부·창 목록과 문 그래프 도달 여부.
 * 반환: { openings: [{ kind: 'door'|'opening'|'window'|'sliding', x1, y1, x2, y2, v, nx, ny, from, to }], unreachable: [실 key] }
 */
export function placeOpenings(layout) {
  const rooms = layout.rooms;
  const byKey = Object.fromEntries(rooms.map((r) => [r.key, r]));
  const openings = [];
  const links = [];
  const link = (a, b) => links.push([a.key, b.key]);
  const neighbors = (room) =>
    rooms
      .filter((o) => o !== room)
      .map((o) => ({ o, seg: sharedSegment(room, o) }))
      .filter((n) => n.seg && lengthOf(n.seg) > 0.6);

  const addDoor = (room, target, seg, kind = 'door') => {
    const s = span(seg, kind === 'opening' ? Math.min(lengthOf(seg) - 0.2, 1.6) : DOOR_WIDTH[room.type] || 0.9, kind === 'opening' ? 'center' : 'start');
    if (!s) return false;
    openings.push({ kind, ...s, ...normalInto(s, room), from: target.key, to: room.key });
    link(room, target);
    return true;
  };

  // 1. 현관 바깥문: 현관의 가장 긴 바깥 벽
  const entrance = rooms.find((r) => r.type === '현관');
  if (entrance) {
    const ext = exteriorSegments(entrance, rooms).sort((a, b) => lengthOf(b) - lengthOf(a))[0];
    if (ext) {
      const s = span(ext, DOOR_WIDTH.현관, 'center');
      if (s) openings.push({ kind: 'door', ...s, ...normalInto(s, entrance), from: 'outside', to: entrance.key, entry: true });
    }
  }

  // 2. 공용 공간끼리는 트고(개구부)
  const publics = rooms.filter((r) => PUBLIC.has(r.type));
  for (let i = 0; i < publics.length; i++)
    for (let j = i + 1; j < publics.length; j++) {
      const seg = sharedSegment(publics[i], publics[j]);
      if (seg && lengthOf(seg) > 0.8) addDoor(publics[j], publics[i], seg, 'opening');
    }

  // 3. 실마다 문 하나: 들어갈 쪽을 우선순위로 고른다.
  const master = byKey.master;
  const priority = (room) => {
    if (room.key === 'bathMaster' || room.key === 'dress') return ['master', '기타', '거실', '주방', '현관'];
    if (room.type === '실외기실') return ['발코니', '주방', '기타', '거실'];
    return ['기타', '거실', '현관', '주방'];
  };
  for (const room of rooms) {
    if (PUBLIC.has(room.type) || room.type === '발코니') continue;
    if (room.type === '실외기실' && !byKey.balcony && !neighbors(room).length) continue;
    const ns = neighbors(room);
    let chosen = null;
    for (const want of priority(room)) {
      chosen = ns.filter(({ o }) => (want === 'master' ? o === master : o.type === want)).sort((a, b) => lengthOf(b.seg) - lengthOf(a.seg))[0];
      if (chosen) break;
    }
    // 공용 공간에 닿지 않으면 침실이 아닌 이웃(없으면 아무 이웃)으로
    if (!chosen) chosen = ns.filter(({ o }) => o.type !== '침실' && !OUTDOOR.has(o.type))[0] || ns.filter(({ o }) => !OUTDOOR.has(o.type))[0];
    if (chosen) addDoor(room, chosen.o, chosen.seg);
  }

  // 4. 발코니: 거실·침실과 맞닿은 곳에 미닫이 창(발코니 문), 발코니 바깥 벽에 창
  for (const b of rooms.filter((r) => r.type === '발코니')) {
    for (const { o, seg } of neighbors(b)) {
      if (!['거실', '침실', '주방'].includes(o.type)) continue;
      const s = span(seg, Math.max(0.9, lengthOf(seg) * 0.75), 'center');
      if (s) openings.push({ kind: 'sliding', ...s, from: o.key, to: b.key });
      link(o, b);
    }
    for (const seg of exteriorSegments(b, rooms)) {
      if (lengthOf(seg) < 1) continue;
      const s = span(seg, lengthOf(seg) * 0.85, 'center');
      if (s) openings.push({ kind: 'window', ...s });
    }
  }

  // 5. 거주실·주방·욕실의 바깥 벽 창: 가장 긴 바깥 벽 가운데
  const winRatio = { 거실: 0.7, 침실: 0.55, 주방: 0.45, 화장실: 0.35, 드레스룸: 0.35, 다목적공간: 0.35 };
  for (const room of rooms) {
    if (!winRatio[room.type]) continue;
    const doorSegs = openings.filter((o) => o.entry && o.to === room.key);
    const ext = exteriorSegments(room, rooms).filter((s) => lengthOf(s) >= 0.9).sort((a, b) => lengthOf(b) - lengthOf(a))[0];
    if (!ext || doorSegs.length) continue;
    const s = span(ext, Math.max(0.6, lengthOf(ext) * winRatio[room.type]), 'center');
    if (s) openings.push({ kind: 'window', ...s, to: room.key });
  }

  // 문 그래프로 현관에서 갈 수 있는지
  const adj = new Map(rooms.map((r) => [r.key, []]));
  for (const [a, b] of links) {
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }
  const seen = new Set();
  if (entrance) {
    const queue = [entrance.key];
    seen.add(entrance.key);
    while (queue.length) for (const n of adj.get(queue.shift()) || []) if (!seen.has(n)) (seen.add(n), queue.push(n));
  }
  const unreachable = rooms.filter((r) => !seen.has(r.key)).map((r) => r.key);
  // 침실을 지나야만 갈 수 있는 실(통과 침실)
  const throughBedroom = rooms
    .filter((r) => !PUBLIC.has(r.type) && r.type !== '침실' && r.key !== 'bathMaster' && r.key !== 'dress' && !OUTDOOR.has(r.type))
    .filter((r) => {
      const d = links.find(([a, b]) => a === r.key || b === r.key);
      if (!d) return false;
      const other = byKey[d[0] === r.key ? d[1] : d[0]];
      return other?.type === '침실';
    })
    .map((r) => r.key);
  // 현관이 바깥 벽에 닿지 않아 현관문을 낼 수 없으면 현관부터 갈 수 없는 것으로 본다.
  if (!openings.some((o) => o.entry)) unreachable.unshift('entrance(현관문 없음)');
  return { openings, unreachable, throughBedroom };
}

/** 문·창을 AI 허브 STR 라벨(구조_출입문·구조_창호, COCO)로 바꾼다. 벽 두께 0.2m 띠로 그린다. */
export function openingsLabel(layout, openings, { pxPerM = 100, ox, oy, fileName = 'generated_STR.png' } = {}) {
  const t = 0.1;
  const categories = [
    { id: 1, name: '구조_출입문' },
    { id: 2, name: '구조_창호' },
  ];
  const annotations = openings
    .filter((o) => o.kind !== 'opening')
    .map((o, i) => {
      const x0 = ox + (Math.min(o.x1, o.x2) - (o.v ? t : 0)) * pxPerM;
      const y0 = oy + (Math.min(o.y1, o.y2) - (o.v ? 0 : t)) * pxPerM;
      const x1 = ox + (Math.max(o.x1, o.x2) + (o.v ? t : 0)) * pxPerM;
      const y1 = oy + (Math.max(o.y1, o.y2) + (o.v ? 0 : t)) * pxPerM;
      const r = (v) => Math.round(v * 10) / 10;
      return {
        id: i + 1,
        image_id: 1,
        category_id: o.kind === 'door' ? 1 : 2,
        segmentation: [[x0, y0, x1, y0, x1, y1, x0, y1].map(r)],
        area: r((x1 - x0) * (y1 - y0)),
        bbox: [x0, y0, x1 - x0, y1 - y0].map(r),
        iscrowd: 0,
        attributes: { kind: o.kind === 'sliding' ? '미닫이창(발코니 문)' : o.kind === 'door' ? (o.entry ? '현관문' : '여닫이문') : '창' },
      };
    });
  return { images: [{ id: 1, width: 4963, height: 3509, file_name: fileName }], categories, annotations };
}

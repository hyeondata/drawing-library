// 생성 평면 → AI 허브 아파트 평면도 라벨과 같은 형식(Sample/02.라벨링데이터)의 SPA·STR·OBJ JSON.
// 형식: { categories(23개 고정 목록), images: [{ id, width, height, file_name }], annotations: [...] }.
// - SPA: 공간 다각형, attributes { occluded: false }, 마지막에 종이 전체 background(12번) 하나
// - STR: 벽체(attributes 구조_벽체: 철근콘크리트벽·기타벽), 출입문(구조_출입문: 여닫이문), 창호(창호: 미닫이창), background 하나
// - OBJ: 설비 상자(segmentation 빈 배열, bbox만), attributes { occluded: false, rotation: 0.0 }
// 좌표: 종이 4963×3509px, 1m = 100px(배율 1 기준 침실 한 변 약 297px와 맞음). 소수 둘째 자리.
import { BALCONY_DEPTH } from './layout.js';
import { exteriorSegments, sharedSegment } from './openings.js';

export const AIHUB_CATEGORIES = [
  { id: 1, name: '공간_다목적공간' },
  { id: 2, name: '공간_엘리베이터홀' },
  { id: 3, name: '공간_계단실' },
  { id: 4, name: '객체_변기' },
  { id: 5, name: '객체_세면대' },
  { id: 6, name: '객체_싱크대' },
  { id: 7, name: '객체_욕조' },
  { id: 8, name: '객체_가스레인지' },
  { id: 9, name: '구조_출입문' },
  { id: 10, name: '구조_창호' },
  { id: 11, name: '구조_벽체' },
  { id: 12, name: 'background' },
  { id: 13, name: '공간_거실' },
  { id: 14, name: '공간_침실' },
  { id: 15, name: '공간_주방' },
  { id: 16, name: '공간_현관' },
  { id: 17, name: '공간_발코니' },
  { id: 18, name: '공간_화장실' },
  { id: 19, name: '공간_실외기실' },
  { id: 20, name: '공간_드레스룸' },
  { id: 21, name: 'OCR' },
  { id: 22, name: '공간_기타' },
  { id: 23, name: '공간_엘리베이터' },
];
const CAT = Object.fromEntries(AIHUB_CATEGORIES.map((c) => [c.name, c.id]));
const SHEET = { w: 4963, h: 3509 };
const PX = 100;
const WALL_RC = 0.2; // 외벽 두께(m)
const WALL_IN = 0.12; // 내벽 두께(m)
const r2 = (v) => Math.round(v * 100) / 100;

/** 평면을 종이 가운데에 놓는 원점(px). */
function origin(layout) {
  const ys = layout.rooms.map((r) => r.y);
  const minY = Math.min(0, ...ys);
  return { ox: (SHEET.w - layout.W * PX) / 2, oy: (SHEET.h - (layout.D + BALCONY_DEPTH - minY) * PX) / 2 - minY * PX };
}

/** 9자리 도면 번호: 9 + 전용면적(3) + 침실 수(1) + 안 번호(1) + 시드(3). AI 허브 번호와 겹치지 않게 9로 시작. */
export function generatedNumber({ area, bedrooms, candidate = 0, seed = 1 }) {
  return `9${String(Math.round(area)).padStart(3, '0').slice(-3)}${bedrooms % 10}${candidate % 10}${String(seed % 1000).padStart(3, '0')}`;
}

function polygonArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}
function polyAnn(id, category, pts, attributes) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return {
    id,
    image_id: 1,
    category_id: CAT[category],
    segmentation: [pts.flat().map(r2)],
    area: Math.round(polygonArea(pts) * 10) / 10,
    bbox: [r2(x0), r2(y0), r2(Math.max(...xs) - x0), r2(Math.max(...ys) - y0)],
    iscrowd: 0,
    attributes,
  };
}
const background = (id) => polyAnn(id, 'background', [[0, 0], [0, SHEET.h], [SHEET.w, SHEET.h], [SHEET.w, 0]], { occluded: false });
const doc = (kind, number, annotations) => ({
  categories: AIHUB_CATEGORIES,
  images: [{ id: 1, width: SHEET.w, height: SHEET.h, file_name: `APT_FP_${kind}_${number}.PNG` }],
  annotations,
});

/** SPA: 실 다각형(직사각형) + background. */
export function toAihubSPA(layout, number = '900000000') {
  const { ox, oy } = origin(layout);
  const anns = layout.rooms.map((r, i) =>
    polyAnn(i, `공간_${r.type}`, [
      [ox + r.x * PX, oy + r.y * PX],
      [ox + (r.x + r.w) * PX, oy + r.y * PX],
      [ox + (r.x + r.w) * PX, oy + (r.y + r.h) * PX],
      [ox + r.x * PX, oy + (r.y + r.h) * PX],
    ], { occluded: false }),
  );
  anns.push(background(anns.length));
  return doc('SPA', number, anns);
}

/** 선분을 두께 t(m)의 사각형으로(선분 가운데 정렬), 종이 좌표 px. */
function bandPts(seg, t, ox, oy) {
  const h = t / 2;
  const x0 = Math.min(seg.x1, seg.x2);
  const x1 = Math.max(seg.x1, seg.x2);
  const y0 = Math.min(seg.y1, seg.y2);
  const y1 = Math.max(seg.y1, seg.y2);
  const [a, b, c, d] = seg.v ? [x0 - h, y0, x1 + h, y1] : [x0, y0 - h, x1, y1 + h];
  return [
    [ox + a * PX, oy + b * PX],
    [ox + c * PX, oy + b * PX],
    [ox + c * PX, oy + d * PX],
    [ox + a * PX, oy + d * PX],
  ];
}

/**
 * STR: 벽체·출입문·창호 + background.
 * 벽: 실끼리 맞닿은 선분은 내벽(기타벽), 실내 공간의 바깥 선분은 외벽(철근콘크리트벽), 발코니 바깥 선분은 기타벽.
 * 문·창·개구부 자리는 벽에서 잘라 내고, 문과 창은 따로 다각형으로 둔다(AI 허브처럼 벽과 겹치지 않게).
 */
export function toAihubSTR(layout, number = '900000000') {
  const { ox, oy } = origin(layout);
  const rooms = layout.rooms;
  const outdoor = (r) => r.type === '발코니' || r.type === '실외기실';
  const walls = [];
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const s = sharedSegment(rooms[i], rooms[j]);
      if (!s) continue;
      // 실내–발코니 경계는 외벽(단열·구조벽), 실내끼리는 내벽, 발코니–실외기실은 기타벽
      const rc = outdoor(rooms[i]) !== outdoor(rooms[j]);
      walls.push({ ...s, rc });
    }
  for (const r of rooms) for (const s of exteriorSegments(r, rooms)) walls.push({ ...s, rc: !outdoor(r) });
  // 같은 선 위의 개구부 구간을 벽에서 뺀다.
  const openings = layout.openings || [];
  const pieces = [];
  for (const w of walls) {
    const along = w.v ? [Math.min(w.y1, w.y2), Math.max(w.y1, w.y2)] : [Math.min(w.x1, w.x2), Math.max(w.x1, w.x2)];
    let free = [along];
    for (const o of openings) {
      if (o.v !== w.v) continue;
      if (w.v ? Math.abs(o.x1 - w.x1) > 1e-6 : Math.abs(o.y1 - w.y1) > 1e-6) continue;
      const [c, d] = w.v ? [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)] : [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)];
      free = free.flatMap(([a, b]) => [
        [a, Math.min(b, c)],
        [Math.max(a, d), b],
      ]).filter(([a, b]) => b - a > 0.05);
    }
    for (const [a, b] of free) pieces.push(w.v ? { x1: w.x1, x2: w.x1, y1: a, y2: b, v: true, rc: w.rc } : { y1: w.y1, y2: w.y1, x1: a, x2: b, v: false, rc: w.rc });
  }
  const anns = [];
  for (const p of pieces) anns.push(polyAnn(anns.length, '구조_벽체', bandPts(p, p.rc ? WALL_RC : WALL_IN, ox, oy), { '구조_벽체': p.rc ? '철근콘크리트벽' : '기타벽', occluded: false }));
  const onRC = (o) => pieces.some((p) => p.rc && p.v === o.v && (o.v ? Math.abs(p.x1 - o.x1) < 1e-6 : Math.abs(p.y1 - o.y1) < 1e-6));
  for (const o of openings) {
    if (o.kind === 'opening') continue;
    const t = onRC(o) ? WALL_RC : WALL_IN;
    if (o.kind === 'door') anns.push(polyAnn(anns.length, '구조_출입문', bandPts(o, t, ox, oy), { '구조_출입문': '여닫이문', occluded: false }));
    else anns.push(polyAnn(anns.length, '구조_창호', bandPts(o, t, ox, oy), { '창호': '미닫이창', occluded: false }));
  }
  anns.push(background(anns.length));
  return doc('STR', number, anns);
}

/** OBJ: 설비 상자(segmentation 없음, bbox만). */
export function toAihubOBJ(layout, number = '900000000') {
  const { ox, oy } = origin(layout);
  const anns = (layout.fixtures || []).map((f, i) => ({
    id: i,
    image_id: 1,
    category_id: CAT[`객체_${f.type}`],
    segmentation: [],
    area: Math.round(f.w * f.h * PX * PX * 100) / 100,
    bbox: [r2(ox + f.x * PX), r2(oy + f.y * PX), r2(f.w * PX), r2(f.h * PX)],
    iscrowd: 0,
    attributes: { occluded: false, rotation: 0.0 },
  }));
  return doc('OBJ', number, anns);
}

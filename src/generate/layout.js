// 판상형 아파트 단위세대 평면 생성기.
// 앞(남측) 띠에 거실과 침실을 나란히 두고, 뒤(북측) 띠에 주방·현관·화장실·드레스룸 등을 둔다(한국 판상형의 거실 중심 배치,
// Seo 2007; Choi et al. 2014). 실은 모두 축 정렬 직사각형이고 단위세대 사각형을 빈틈없이 채운다. 단위는 m.
// 같은 사양으로 여러 변형을 만들고 평가 모델로 고르는 일은 optimize.js가 한다.

import { toAihubSPA } from './aihub.js';
import { placeFixtures } from './fixtures.js';
import { placeOpenings } from './openings.js';

export const BALCONY_DEPTH = 1.5;

/**
 * 실 종류별 최소 폭(m). 치수 제약을 둔 평면 생성 연구(Upasani et al. 2020)처럼 실마다 하한을 두되,
 * 값은 국내 아파트 통상 치수(욕실 1.5m, 현관 1.2m 등)를 쓴 설계 가정이다. 안방은 key 'master'에 따로 적용한다.
 */
/** 최소 면적(m²): 최소 폭 × 통상 깊이(작은방 2.4×2.7m, 안방 3.0×3.3m, 욕실 1.5×2.0m 등). 작은 평형에서 면적비만 따르면 실이 너무 작아진다. */
export const MIN_AREA = { bedroom: 6.5, master: 9.9, bath: 3.0, entrance: 2.2, dress: 2.5 };

export const MIN_SIDE = { 안방: 3.0, 거실: 3.6, 침실: 2.4, 주방: 2.2, 화장실: 1.5, 현관: 1.2, 드레스룸: 1.3, 다목적공간: 1.1 };
export const OUTDOOR_UNIT = { w: 1.4, d: 1.5 };

/**
 * 폭 나누기: 각 칸에 최소 폭을 먼저 주고, 남는 폭은 (원하는 폭 − 최소 폭)에 비례해 나눈다.
 * 전체가 최소 폭 합보다 좁으면 최소 폭에 비례해 줄인다. 원하는 폭이 모두 최소 폭이면 원하는 폭에 비례.
 */
export function allocate(desired, mins, total) {
  const minSum = mins.reduce((s, m) => s + m, 0);
  if (total <= minSum) return mins.map((m, i) => (minSum ? (m / minSum) * total : total / mins.length));
  const extra = desired.map((d, i) => Math.max(0, d - mins[i]));
  const exSum = extra.reduce((s, e) => s + e, 0);
  const left = total - minSum;
  if (!exSum) {
    const dSum = desired.reduce((s, d) => s + d, 0);
    return desired.map((d, i) => mins[i] + (left * d) / dSum);
  }
  return mins.map((m, i) => m + (left * extra[i]) / exSum);
}

/** 시드 고정 난수(mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const between = (r, a, b) => a + (b - a) * r();

/**
 * 사양 → 실별 목표 면적(m², 전용면적 안).
 * spec.targets: 전용면적 대비 비율 { living, kitchen, master, other, bath, entrance, dress, multi }
 */
export function programOf(spec) {
  const A = spec.area;
  const t = spec.targets;
  const rooms = [
    { key: 'living', type: '거실', name: '거실', area: t.living * A },
    { key: 'kitchen', type: '주방', name: '주방/식당', area: t.kitchen * A },
    { key: 'entrance', type: '현관', name: '현관', area: Math.max(MIN_AREA.entrance, t.entrance * A) },
    { key: 'master', type: '침실', name: '안방', area: Math.max(MIN_AREA.master, t.master * A) },
  ];
  for (let i = 1; i < spec.bedrooms; i++) rooms.push({ key: `bed${i}`, type: '침실', name: `침실${i + 1}`, area: Math.max(MIN_AREA.bedroom, t.other * A) });
  rooms.push({ key: 'bathPublic', type: '화장실', name: spec.baths >= 2 ? '공용욕실' : '욕실', area: Math.max(MIN_AREA.bath, t.bath * A) });
  if (spec.baths >= 2) rooms.push({ key: 'bathMaster', type: '화장실', name: '부부욕실', area: Math.max(MIN_AREA.bath, t.bath * A * 0.9) });
  if (spec.dress) rooms.push({ key: 'dress', type: '드레스룸', name: '드레스룸', area: Math.max(MIN_AREA.dress, t.dress * A) });
  if (spec.multi) rooms.push({ key: 'multi', type: '다목적공간', name: '다목적실', area: t.multi * A });
  // 남는 면적은 모든 실에 비례해 나눈다(복도·홀은 거실·주방에 포함된 것으로 본다).
  const sum = rooms.reduce((s, r) => s + r.area, 0);
  for (const r of rooms) r.area *= A / sum;
  return rooms;
}

/**
 * 변형 매개변수를 무작위로 뽑는다. 최적화는 이 값을 조금씩 바꿔 가며 더 나은 안을 찾는다.
 */
export function randomParams(spec, r) {
  const scale = Math.sqrt(spec.area / 84);
  const others = spec.bedrooms - 1;
  // 앞 띠에 둘 침실 수: 너무 좁아지지 않게 최소 폭 2.6m를 확보할 수 있는 만큼
  const frontBeds = Math.max(1, Math.min(spec.bedrooms, others >= 3 ? pick(r, [spec.bedrooms - 1, spec.bedrooms]) : pick(r, [spec.bedrooms, spec.bedrooms, spec.bedrooms - 1])));
  return {
    depth: between(r, 7.0, 9.8) * scale ** 0.6,
    frontShare: between(r, 0.5, 0.64),
    frontBeds,
    livingPos: Math.floor(r() * (frontBeds + 1)),
    masterEnd: pick(r, ['left', 'right']),
    entranceSide: pick(r, ['left', 'right']),
    stackService: r() < 0.5,
    suiteOrder: r() < 0.5,
    bedWidth: between(r, 2.6, 3.4),
    masterDepth: between(r, 0.65, 1),
    serviceOrder: r() < 0.5,
    backBedSide: pick(r, ['near', 'far']),
    jitter: Array.from({ length: 12 }, () => between(r, -0.25, 0.25)),
    areaMul: Array.from({ length: 12 }, () => between(r, 0.88, 1.12)),
  };
}

/** 매개변수를 조금 바꾼다(국소 탐색). */
export function mutate(p, spec, r) {
  const q = structuredClone(p);
  const k = Math.floor(r() * 8);
  if (k === 0) {
    const scale = Math.sqrt(spec.area / 84) ** 0.6;
    q.depth = Math.min(9.8 * scale, Math.max(7.0 * scale, q.depth * between(r, 0.93, 1.07)));
  }
  if (k === 1) q.frontShare = Math.min(0.68, Math.max(0.46, q.frontShare + between(r, -0.04, 0.04)));
  if (k === 2) q.livingPos = Math.floor(r() * (q.frontBeds + 1));
  if (k === 3) q.entranceSide = q.entranceSide === 'left' ? 'right' : 'left';
  if (k === 4) [q.stackService, q.suiteOrder, q.serviceOrder] = [r() < 0.5, r() < 0.5, r() < 0.5];
  if (k === 5) q.jitter = q.jitter.map((j) => Math.max(-0.4, Math.min(0.4, j + between(r, -0.12, 0.12))));
  if (k === 6) {
    q.bedWidth = Math.min(3.6, Math.max(2.5, (q.bedWidth ?? 3) + between(r, -0.2, 0.2)));
    q.masterDepth = Math.min(1, Math.max(0.6, (q.masterDepth ?? 1) + between(r, -0.08, 0.08)));
  }
  if (k === 7) q.areaMul = q.areaMul.map((m) => Math.max(0.8, Math.min(1.2, m * between(r, 0.95, 1.05))));
  return q;
}

/**
 * 매개변수로 평면을 만든다.
 * 반환: { W, D, rooms: [{ key, type, name, x, y, w, h }] } — y가 작을수록 뒤(북측), 앞 띠 아래에 발코니.
 */
export function buildLayout(spec, p) {
  const program = programOf(spec).map((room, i) => ({ ...room, area: room.area * (p.areaMul[i % p.areaMul.length] || 1) }));
  const by = Object.fromEntries(program.map((room) => [room.key, room]));
  // 면적 배수는 실 사이 비율만 바꾸고, 전체는 고른 전용면적에 맞춘다.
  const A = spec.area;
  const D = p.depth;
  const W = A / D;
  const Df = D * p.frontShare;
  const Db = D - Df;

  // ---- 앞 띠: 침실(안방은 한쪽 끝)과 거실 ----
  const beds = program.filter((room) => room.type === '침실');
  const master = by.master;
  const regular = beds.filter((b) => b !== master);
  // p.frontOrder·p.backOrder가 있으면(QUBO 해) 그 순서를 그대로 쓰고, 없으면 매개변수로 정한다.
  let frontRegular;
  let front;
  if (p.frontOrder) {
    front = p.frontOrder.map((key) => by[key]);
    frontRegular = front.filter((room) => room.type === '침실' && room !== master);
    p.masterEnd = front[0] === master ? 'left' : 'right';
  } else {
    frontRegular = regular.slice(0, Math.max(0, p.frontBeds - 1));
    front = [...frontRegular];
    front.splice(Math.min(p.livingPos, front.length), 0, by.living);
    if (p.masterEnd === 'left') front.unshift(master);
    else front.push(master);
  }
  const backBeds = regular.filter((b) => !frontRegular.includes(b));
  // 작은방은 폭(bedWidth)을 먼저 정하고 깊이는 면적에서 구한다. 거실보다 얕으면 그 뒤를 복도(기타)로 쓴다.
  // 남는 깊이가 0.4m 미만이면 앞 띠 깊이에 맞추고, 1.1m 미만이면 복도 폭 1.1m를 확보한다.
  const other = frontRegular[0];
  let bedD = other ? Math.min(Df, other.area / (p.bedWidth ?? 3)) : Df;
  if (Df - bedD < 0.4) bedD = Df;
  else if (Df - bedD < 1.1) bedD = Df - 1.1;
  // 안방도 얕게 둘 수 있다. 그 뒤는 부속실(부부욕실·드레스룸)이 차지한다.
  const hasSuite = Boolean(by.bathMaster || by.dress);
  const masterD = hasSuite && Df * (p.masterDepth ?? 1) < Df - 0.6 ? Df * p.masterDepth : Df;
  const depthOf = (room) => (room === master ? masterD : room.type === '침실' ? bedD : Df);
  const minW = (room) => (room === master ? MIN_SIDE.안방 : MIN_SIDE[room.type] || 0);
  const frontWidths = allocate(
    front.map((room) => room.area / depthOf(room)),
    front.map(minW),
    W,
  );
  // (보기용 기록) p.trace 배열을 주면 폭 나누기 계산을 남긴다. 계산에는 영향 없음.
  p.trace?.push({ band: 'front', A, D, W, Df, Db, names: front.map((r) => r.name), areas: front.map((r) => r.area), depths: front.map(depthOf), desired: front.map((room) => room.area / depthOf(room)), mins: front.map(minW), total: W, out: frontWidths });
  const rooms = [];
  const gaps = [];
  let x = 0;
  front.forEach((room, i) => {
    const w = frontWidths[i];
    const d = depthOf(room);
    rooms.push({ key: room.key, type: room.type, name: room.name, x, y: D - d, w, h: d });
    if (d < Df && room !== master) {
      const last = gaps.at(-1);
      if (last && Math.abs(last.x + last.w - x) < 1e-9) last.w += w;
      else gaps.push({ x, w });
    }
    x += w;
  });
  gaps.forEach((g, i) => rooms.push({ key: `hall${i}`, type: '기타', name: '복도', x: g.x, y: Db, w: g.w, h: Df - bedD }));
  const bayOf = Object.fromEntries(rooms.map((rm) => [rm.key, rm]));
  const centerOf = (key) => bayOf[key].x + bayOf[key].w / 2;

  // ---- 뒤 띠: 기준 실의 x 위치(앞 띠)에 맞춰 늘어놓는다 ----
  const livingC = centerOf('living');
  const masterC = centerOf('master');
  const side = p.entranceSide === 'left' ? -1 : 1;
  const livingHalf = bayOf.living.w / 2;
  const farBed = frontRegular.length ? [...frontRegular].sort((a, b) => Math.abs(centerOf(b.key) - masterC) - Math.abs(centerOf(a.key) - masterC))[0] : null;
  const anchors = {
    kitchen: livingC,
    entrance: livingC + side * (livingHalf + 0.5),
    bathPublic: livingC + side * (livingHalf + 1.5),
    multi: livingC - side * (livingHalf * 0.8),
    bathMaster: masterC + (masterC < livingC ? 0.3 : -0.3),
    dress: masterC + (masterC < livingC ? -0.3 : 0.3),
  };
  backBeds.forEach((b, i) => {
    const ref = p.backBedSide === 'far' && farBed ? centerOf(farBed.key) : livingC - side * (livingHalf + 1 + i);
    anchors[b.key] = ref + i * 0.4;
  });

  // 열(column) 단위: 한 열에 실 1개 또는 위아래로 2개
  const columns = [];
  const add = (items, anchor) => columns.push({ items, anchor });
  const used = new Set();
  const take = (key) => (by[key] && !used.has(key) ? (used.add(key), by[key]) : null);
  const kitchen = take('kitchen');
  add([kitchen], anchors.kitchen);
  // 안방 부속실(부부욕실·드레스룸)은 안방 바로 뒤에 나란히 둬서 둘 다 안방과 맞닿게 한다(Zeng et al. 2025의 master suite).
  const suite = [take('bathMaster'), take('dress')].filter(Boolean);
  const masterBay = bayOf.master;
  // 안방 폭이 둘을 나란히 두기에 좁으면(2.9m 미만) 한 열에 위아래로 쌓는다.
  const suiteInBay = suite.length > 0 && (suite.length === 1 || masterBay.w >= 2.9 || masterD < Df);
  if (suiteInBay) {
    const order = p.suiteOrder ? [...suite].reverse() : suite;
    const total = order.reduce((s, it) => s + it.area, 0);
    // 면적 비례로 나누되 최소 폭을 먼저 보장한다.
    const widths = order.map((it) => (masterBay.w * it.area) / total);
    if (order.length === 2) {
      for (const k of [0, 1]) {
        const min = Math.min(MIN_SIDE[order[k].type] || 0, masterBay.w / 2);
        if (widths[k] < min) {
          widths[1 - k] -= min - widths[k];
          widths[k] = min;
        }
      }
    }
    let sx = masterBay.x;
    for (const [k, it] of order.entries()) {
      const w = widths[k];
      rooms.push({ key: it.key, type: it.type, name: it.name, x: sx, y: 0, w, h: D - masterD });
      sx += w;
    }
  } else if (suite.length === 2) add(p.suiteOrder ? [...suite].reverse() : suite, (anchors.bathMaster + anchors.dress) / 2);
  else for (const s of suite) add([s], anchors[s.key]);
  if (p.backOrder) {
    // QUBO 해: 뒤 띠 칸 순서대로 한 칸에 한 실(좁은 실은 아래에서 옆 열과 쌓는다)
    columns.length = 0;
    used.clear();
    if (suiteInBay) for (const s of suite) used.add(s.key);
    else if (suite.length === 2) add(p.suiteOrder ? [...suite].reverse() : suite, -1), suite.forEach((s) => used.add(s.key));
    p.backOrder.forEach((key, i) => {
      const room = take(key);
      if (room) add([room], i);
    });
    if (!suiteInBay && suite.length === 2) {
      // 쌓은 부속실 열은 안방 쪽 끝에 둔다.
      const col = columns.find((c) => c.anchor === -1);
      col.anchor = p.masterEnd === 'left' ? -1 : 1e9;
    }
  }
  const entrance = take('entrance');
  const bathPublic = take('bathPublic');
  // 현관은 위(뒤쪽 바깥 벽)에 둬야 현관문을 낼 수 있다.
  if (entrance || bathPublic) {
    if (p.stackService && entrance && bathPublic) add([entrance, bathPublic], anchors.entrance);
    else {
      if (entrance) add([entrance], anchors.entrance);
      if (bathPublic) add([bathPublic], anchors.bathPublic);
    }
  }
  const multi = take('multi');
  if (multi) add([multi], anchors.multi);
  for (const b of backBeds) {
    const room = take(b.key);
    if (room) add([room], anchors[b.key]);
  }
  if (!p.backOrder) columns.forEach((c, i) => (c.anchor += (p.jitter[i % p.jitter.length] || 0) * 1.2));
  columns.sort((a, b) => a.anchor - b.anchor);
  // 너비가 최소 폭에 못 미치는 작은 실(욕실·현관·드레스룸 등)은 옆 열(침실 제외)과 위아래로 쌓는다.
  for (let guard = 0; guard < 6; guard++) {
    const i = columns.findIndex((c) => c.items.length === 1 && !['침실', '주방'].includes(c.items[0].type) && c.items[0].area / Db < (MIN_SIDE[c.items[0].type] || 0));
    if (i < 0) break;
    // 침실·주방 열에는 쌓지 않는다(주방 아래에 쌓으면 주방이 거실과 떨어진다).
    const ok = (j) => j >= 0 && j < columns.length && columns[j].items.length < 3 && columns[j].items.every((it) => it.type !== '침실' && it.type !== '주방');
    const j = [i - 1, i + 1].filter(ok).sort((a, b) => columns[a].items.length - columns[b].items.length)[0];
    if (j === undefined) break;
    columns[j].items.push(...columns[i].items);
    columns[j].items.sort((x, y) => Number(y.type === '현관') - Number(x.type === '현관'));
    columns.splice(i, 1);
  }

  const colW = allocate(
    columns.map((c) => c.items.reduce((s, it) => s + it.area, 0) / Db),
    columns.map((c) => Math.max(...c.items.map((it) => MIN_SIDE[it.type] || 0))),
    suiteInBay ? W - masterBay.w : W,
  );
  p.trace?.push({ band: 'back', A, D, W, Df, Db, names: columns.map((c) => c.items.map((it) => it.name).join('+')), areas: columns.map((c) => c.items.reduce((s2, it) => s2 + it.area, 0)), depths: columns.map(() => Db), desired: columns.map((c) => c.items.reduce((s2, it) => s2 + it.area, 0) / Db), mins: columns.map((c) => Math.max(...c.items.map((it) => MIN_SIDE[it.type] || 0))), total: suiteInBay ? W - masterBay.w : W, out: colW, suite: suiteInBay ? masterBay.w : 0 });
  // 부속실이 안방 뒤를 차지했으면 나머지 열은 남은 폭에 놓는다.
  x = suiteInBay && masterBay.x === 0 ? masterBay.w : 0;
  columns.forEach((c, i) => {
    const w = colW[i];
    let y = 0;
    const total = c.items.reduce((s, it) => s + it.area, 0);
    for (const it of c.items) {
      const h = (Db * it.area) / total;
      rooms.push({ key: it.key, type: it.type, name: it.name, x, y, w, h });
      y += h;
    }
    x += w;
  });

  // ---- 발코니와 실외기실 ----
  if (spec.balcony) {
    const ou = spec.outdoorUnit ? OUTDOOR_UNIT.w : 0;
    const left = p.masterEnd === 'left';
    rooms.push({ key: 'balcony', type: '발코니', name: '발코니', x: left ? ou : 0, y: D, w: W - ou, h: BALCONY_DEPTH });
    if (ou) rooms.push({ key: 'outdoor', type: '실외기실', name: '실외기실', x: left ? 0 : W - ou, y: D, w: ou, h: BALCONY_DEPTH });
  } else if (spec.outdoorUnit) {
    // 확장형: 실외기실만 뒤쪽 바깥에 붙인다.
    const k = rooms.find((rm) => rm.key === 'kitchen');
    rooms.push({ key: 'outdoor', type: '실외기실', name: '실외기실', x: k.x, y: -OUTDOOR_UNIT.d, w: Math.min(OUTDOOR_UNIT.w, k.w), h: OUTDOOR_UNIT.d });
  }
  const layout = { W, D, rooms };
  // 문·창·설비(예시 도면의 STR·OBJ에 해당)와 문 동선 점검
  const { openings, unreachable, throughBedroom } = placeOpenings(layout);
  layout.openings = openings;
  layout.fixtures = placeFixtures(layout, openings);
  layout.doorCheck = { unreachable, throughBedroom };
  return layout;
}

/** 두 직사각형이 맞닿은 변의 길이(m). */
export function sharedEdge(a, b, eps = 1e-6) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if ((Math.abs(a.x + a.w - b.x) < eps || Math.abs(b.x + b.w - a.x) < eps) && oy > eps) return oy;
  if ((Math.abs(a.y + a.h - b.y) < eps || Math.abs(b.y + b.h - a.y) < eps) && ox > eps) return ox;
  return 0;
}

/**
 * 방음 근사(소음원과 맞댄 침실 벽의 비율). 침실 둘레 중 거실·주방·현관과 맞댄 길이(가중 1)와
 * 다른 침실과 맞댄 길이(가중 0.5)를 둘레로 나눈다. 0이면 소음원과 맞댄 벽이 없다.
 * 모델 지표가 아니라 생성기 선호 항목의 근사값이다(차음 성능은 벽체 사양이 정한다).
 */
export function noiseExposure(rooms) {
  const beds = rooms.filter((r) => r.type === '침실');
  const loud = new Set(['거실', '주방', '현관']);
  let num = 0;
  let den = 0;
  for (const b of beds) {
    den += 2 * (b.w + b.h);
    for (const o of rooms) {
      if (o === b) continue;
      const e = sharedEdge(b, o);
      if (!e) continue;
      if (loud.has(o.type)) num += e;
      else if (o.type === '침실') num += 0.5 * e;
    }
  }
  return den ? num / den : 0;
}

/** 평면을 AI 허브 SPA 라벨 형식(Sample과 같은 23개 범주, background 포함)으로 바꾼다. 평가에는 이 라벨을 쓴다. */
export function toLabel(layout) {
  return toAihubSPA(layout);
}

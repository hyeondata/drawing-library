// 생성한 평면 한 장의 진단 지표(단위 m). 기하만으로 계산한다.
// 근거: reports/평면 생성 화면 추가 시각화.md (한국 법규·관행, 평면 생성 논문, 실무 도구 조사)
//  - 국민주택규모 85㎡: 주택법 제2조제6호
//  - 채광창 ≥ 바닥면적 1/10, 환기 개구부 ≥ 1/20: 건축물의 피난·방화구조 등의 기준에 관한 규칙 제17조
//  - 베이·맞통풍·향: 법 정의 없음(시장 관행). 앞쪽(발코니 쪽)을 남향으로 가정한다.
//  - 동선 깊이: 공간구문(space syntax)의 깊이(depth) — 현관에서 문을 몇 번 지나는가

const EPS = 0.05;
const HABITABLE = new Set(['거실', '침실']);
const PUBLIC = new Set(['현관', '거실', '주방', '기타']);
const OUTDOOR = new Set(['발코니', '실외기실']);

// 창 높이 가정(도면에 높이가 없으므로): 일반 창 1.2m, 발코니 미닫이(문 겸 창) 2.1m. 여닫는 부분은 절반.
export const ASSUME = { windowH: 1.2, slidingH: 2.1, openable: 0.5, frontIsSouth: true };

const len = (o) => Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
const mid = (o) => ({ x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 });
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const area = (r) => r.w * r.h;

/** 창이 어느 실의 것인지: to가 있으면 그 실, 없으면(발코니 바깥 창) 선분이 닿은 실. */
function ownerOf(o, rooms) {
  if (o.kind === 'sliding') return o.from;
  if (o.to) return o.to;
  const m = mid(o);
  const r = rooms.find((r) => m.x >= r.x - EPS && m.x <= r.x + r.w + EPS && m.y >= r.y - EPS && m.y <= r.y + r.h + EPS);
  return r?.key ?? null;
}

/** 문 그래프(문·개구부·발코니 문) → 현관에서의 깊이와 걸음 거리(실 중심 → 문 → 실 중심, 다익스트라). */
export function circulation(layout) {
  const rooms = layout.rooms;
  const byKey = Object.fromEntries(rooms.map((r) => [r.key, r]));
  const edges = new Map(rooms.map((r) => [r.key, []]));
  const links = [];
  for (const o of layout.openings || []) {
    if (!['door', 'opening'].includes(o.kind) || o.entry) continue; // 발코니 미닫이는 이동 동선에서 뺀다
    const a = byKey[o.from];
    const b = byKey[o.to];
    if (!a || !b) continue;
    const p = mid(o);
    const w = dist(center(a), p) + dist(p, center(b));
    edges.get(a.key).push({ to: b.key, w, p });
    edges.get(b.key).push({ to: a.key, w, p });
    links.push({ a: a.key, b: b.key, p, kind: o.kind });
  }
  const entrance = rooms.find((r) => r.type === '현관');
  const entry = (layout.openings || []).find((o) => o.entry);
  const depth = {};
  const meters = {};
  const prev = {};
  if (entrance) {
    // 깊이(BFS)
    depth[entrance.key] = 0;
    const q = [entrance.key];
    while (q.length) {
      const k = q.shift();
      for (const e of edges.get(k)) if (depth[e.to] === undefined) ((depth[e.to] = depth[k] + 1), q.push(e.to));
    }
    // 걸음 거리(현관문에서 출발)
    const start = entry ? dist(mid(entry), center(entrance)) : 0;
    meters[entrance.key] = start;
    const done = new Set();
    for (;;) {
      let k = null;
      for (const key of Object.keys(meters)) if (!done.has(key) && (k === null || meters[key] < meters[k])) k = key;
      if (k === null) break;
      done.add(k);
      for (const e of edges.get(k)) {
        const d = meters[k] + e.w;
        if (meters[e.to] === undefined || d < meters[e.to]) ((meters[e.to] = d), (prev[e.to] = { from: k, p: e.p }));
      }
    }
  }
  const pathTo = (key) => {
    const pts = [];
    let k = key;
    if (meters[k] === undefined) return [];
    pts.unshift(center(byKey[k]));
    while (prev[k]) {
      pts.unshift(prev[k].p);
      k = prev[k].from;
      pts.unshift(center(byKey[k]));
    }
    if (entry) pts.unshift(mid(entry));
    return pts;
  };
  const indoor = rooms.filter((r) => !OUTDOOR.has(r.type));
  const ds = indoor.map((r) => depth[r.key]).filter((d) => d !== undefined);
  const meanDepth = ds.length ? ds.reduce((s, d) => s + d, 0) / ds.length : null;
  return { depth, meters, links, pathTo, meanDepth, maxDepth: ds.length ? Math.max(...ds) : null, entry: entry ? mid(entry) : null };
}

/** 실별 채광·환기 비율. 발코니 미닫이 창은 발코니를 거쳐 빛이 들어오는 것으로 센다. */
export function daylight(layout) {
  const rooms = layout.rooms;
  const per = {};
  for (const o of layout.openings || []) {
    if (o.kind !== 'window' && o.kind !== 'sliding') continue;
    const k = ownerOf(o, rooms);
    if (!k) continue;
    const h = o.kind === 'sliding' ? ASSUME.slidingH : ASSUME.windowH;
    (per[k] ||= { glass: 0, open: 0, viaBalcony: false });
    per[k].glass += len(o) * h;
    per[k].open += len(o) * h * ASSUME.openable;
    if (o.kind === 'sliding') per[k].viaBalcony = true;
  }
  return rooms
    .filter((r) => HABITABLE.has(r.type) || r.type === '주방')
    .map((r) => {
      const p = per[r.key] || { glass: 0, open: 0, viaBalcony: false };
      const light = p.glass / area(r);
      const vent = p.open / area(r);
      return { key: r.key, name: r.name, type: r.type, area: area(r), light, vent, lightOk: light >= 0.1, ventOk: vent >= 0.05, viaBalcony: p.viaBalcony };
    });
}

/** 한국 아파트 평가에서 흔히 보는 지표. */
export function koreanMetrics(layout) {
  const { W, D, rooms } = layout;
  const exclusive = W * D;
  const balcony = rooms.filter((r) => r.type === '발코니').reduce((s, r) => s + area(r), 0);
  // 앞쪽(발코니 쪽, y = D)에 닿은 거실·침실 = 베이
  const front = rooms.filter((r) => HABITABLE.has(r.type) && Math.abs(r.y + r.h - D) < EPS).sort((a, b) => a.x - b.x);
  const back = rooms.filter((r) => Math.abs(r.y) < EPS && !OUTDOOR.has(r.type));
  // 맞통풍: 앞쪽 창(발코니 문 포함)과 뒤쪽(y = 0) 바깥 창이 공용 공간(거실·주방·복도)을 사이에 두고 이어지는가
  const opens = layout.openings || [];
  const byKey = Object.fromEntries(rooms.map((r) => [r.key, r]));
  const frontOpen = opens.filter((o) => (o.kind === 'sliding' || o.kind === 'window') && (Math.abs(o.y1 - D) < EPS || Math.abs(o.y1 - D - 1.5) < EPS || o.kind === 'sliding'));
  const backOpen = opens.filter((o) => o.kind === 'window' && Math.abs(o.y1) < EPS && Math.abs(o.y2) < EPS);
  const publicFront = frontOpen.some((o) => PUBLIC.has(byKey[ownerOf(o, rooms)]?.type));
  const publicBack = backOpen.some((o) => PUBLIC.has(byKey[ownerOf(o, rooms)]?.type));
  const crossRooms = rooms.filter((r) => !OUTDOOR.has(r.type) && Math.abs(r.y) < EPS && Math.abs(r.y + r.h - D) < EPS).map((r) => r.name);
  const baths = rooms.filter((r) => r.type === '화장실').length;
  const storage = rooms.filter((r) => r.type === '드레스룸' || r.type === '다목적공간').reduce((s, r) => s + area(r), 0);
  const beds = rooms.filter((r) => r.type === '침실').length;
  return {
    exclusive,
    nationalSize: exclusive <= 85 + 1e-6,
    service: balcony,
    bays: front.length,
    bayRooms: front.map((r) => r.name),
    backRooms: back.map((r) => r.name),
    cross: publicFront && publicBack,
    crossRooms,
    baths,
    beds,
    storage,
    storageShare: storage / exclusive,
    frontWidth: W,
    depth: D,
    aspect: W / D,
  };
}

/** 목표 대비 면적 편차(%). ±5% 이내 좋음, ±10% 이내 보통(Snaptrude 기본 허용 범위 참고). */
export function deviation(target, actual) {
  const pct = target > 0 ? ((actual - target) / target) * 100 : 0;
  const level = Math.abs(pct) <= 5 ? 'good' : Math.abs(pct) <= 10 ? 'warn' : 'bad';
  return { pct, level };
}

/** 후보 사이 다양성: 평면을 40×20 칸으로 정규화해 실 종류가 다른 칸의 비율(0 같음 ~ 1 완전히 다름). */
export function planRaster(layout, nx = 40, ny = 20) {
  const cells = new Array(nx * ny).fill('');
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = ((i + 0.5) / nx) * layout.W;
      const y = ((j + 0.5) / ny) * layout.D;
      const r = layout.rooms.find((r) => !OUTDOOR.has(r.type) && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      cells[j * nx + i] = r ? (r.key === 'master' ? '안방' : r.type) : '';
    }
  return cells;
}

export function diversity(layouts) {
  const R = layouts.map((l) => planRaster(l));
  return R.map((a, i) => R.map((b, j) => (i === j ? 0 : a.reduce((s, v, k) => s + (v !== b[k] ? 1 : 0), 0) / a.length)));
}

export function diagnose(layout) {
  const kr = koreanMetrics(layout);
  const circ = circulation(layout);
  const light = daylight(layout);
  const byName = (t) => layout.rooms.find((r) => r.type === t || r.key === t);
  const m = (k) => (byName(k) ? circ.meters[byName(k).key] : undefined);
  const lightFail = light.filter((l) => !l.lightOk || !l.ventOk).length;
  return {
    kr,
    circ,
    light,
    lightFail,
    walk: { kitchen: m('주방'), living: m('거실'), master: m('master') },
    masterDepth: byName('master') ? circ.depth[byName('master').key] : undefined,
  };
}

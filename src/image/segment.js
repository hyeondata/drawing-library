// 평면도 이미지에서 실 영역을 찾아 AI 허브 COCO 공간(SPA) 라벨로 바꾼다.
// 브라우저(캔버스 픽셀)와 Node(테스트)에서 같은 코드를 쓴다. 외부 라이브러리 없이 배열만 다룬다.
//
// 흐름: 회색조 → 어두운 선(벽·문·글자) 마스크 → 끊긴 선 잇기(팽창) + 사용자가 그은 선 →
//       선이 아닌 빈 영역의 연결 요소 = 실 후보 → 팽창으로 줄어든 만큼 빈 픽셀로 다시 키움 →
//       사용자가 찍은 점(실 종류·합치기)으로 영역을 정리 → 외곽선 추적·단순화 → COCO.

/** RGBA → 회색조(0~255). 투명 픽셀은 흰 종이로 본다. */
export function toGray(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    const v = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    g[i] = Math.round(v * a + 255 * (1 - a));
  }
  return g;
}

/** Otsu 임계값. 흰 종이가 대부분이라 선을 가르는 밝기를 자동으로 찾는다. */
export function otsu(gray) {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** 정사각형 구조 요소(반지름 r)로 팽창. 행·열 방향으로 나눠 O(N)에 가깝게 처리한다. */
export function dilate(mask, w, h, r) {
  if (r <= 0) return mask.slice();
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (mask[y * w + x]) fillRow(tmp, y * w, Math.max(0, x - r), Math.min(w - 1, x + r));
  }
  for (let x = 0; x < w; x++) {
    let run = -1;
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) run = y;
      if (run >= 0 && y - run <= r) out[y * w + x] = 1;
    }
    run = -1;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) run = y;
      if (run >= 0 && run - y <= r) out[y * w + x] = 1;
    }
  }
  return out;
}
function fillRow(arr, offset, x0, x1) {
  for (let x = x0; x <= x1; x++) arr[offset + x] = 1;
}

/** 침식 = 여집합의 팽창의 여집합. */
export function erode(mask, w, h, r) {
  if (r <= 0) return mask.slice();
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const d = dilate(inv, w, h, r);
  for (let i = 0; i < d.length; i++) d[i] = d[i] ? 0 : 1;
  return d;
}

/** 선분을 마스크에 그린다(굵기 thick px). 사용자가 그은 벽·나눔선에 쓴다. */
export function drawLine(mask, w, h, [x0, y0], [x1, y1], thick = 2) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const r = Math.max(0, Math.floor(thick / 2));
  for (let i = 0; i <= n; i++) {
    const cx = Math.round(x0 + ((x1 - x0) * i) / n);
    const cy = Math.round(y0 + ((y1 - y0) * i) / n);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < w && y < h) mask[y * w + x] = 1;
      }
  }
}

/** 0이 아닌 칸(free=1)의 4-연결 요소. 반환: labels(Int32, 0=없음), 요소별 넓이. */
export function components(free, w, h) {
  const labels = new Int32Array(w * h);
  const areas = [0];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let s = 0; s < free.length; s++) {
    if (!free[s] || labels[s]) continue;
    let top = 0;
    stack[top++] = s;
    labels[s] = next;
    let area = 0;
    while (top) {
      const p = stack[--top];
      area++;
      const x = p % w;
      if (x > 0 && free[p - 1] && !labels[p - 1]) (labels[p - 1] = next), (stack[top++] = p - 1);
      if (x < w - 1 && free[p + 1] && !labels[p + 1]) (labels[p + 1] = next), (stack[top++] = p + 1);
      if (p >= w && free[p - w] && !labels[p - w]) (labels[p - w] = next), (stack[top++] = p - w);
      if (p < free.length - w && free[p + w] && !labels[p + w]) (labels[p + w] = next), (stack[top++] = p + w);
    }
    areas.push(area);
    next++;
  }
  return { labels, areas };
}

/** 라벨을 빈 칸(free)으로 steps 단계까지 넓힌다(다중 출발 BFS). 팽창으로 줄어든 실을 원래 크기로 되돌린다. */
export function grow(labels, free, w, h, steps) {
  const out = labels.slice();
  let frontier = [];
  for (let p = 0; p < out.length; p++) if (out[p]) frontier.push(p);
  for (let s = 0; s < steps && frontier.length; s++) {
    const next = [];
    for (const p of frontier) {
      const x = p % w;
      const l = out[p];
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < out.length - w ? p + w : -1];
      for (const q of nb) {
        if (q >= 0 && free[q] && !out[q]) {
          out[q] = l;
          next.push(q);
        }
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * 이미지 → 실 후보 영역.
 * opts: threshold(선 밝기 기준), close(끊긴 선 잇기 반지름 px), minArea(무시할 최소 넓이 비율), maxArea(종이 여백 등 너무 큰 영역 비율), lines([[x0,y0],[x1,y1]] 사용자 선)
 * 반환: { labels, regions: [{ id, area, bbox, cx, cy }] }  (작거나 큰 영역은 labels에서 0)
 */
export function segment(gray, w, h, opts = {}) {
  const threshold = opts.threshold ?? otsu(gray);
  const close = opts.close ?? 2;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) ink[i] = gray[i] <= threshold ? 1 : 0;
  for (const [a, b] of opts.lines || []) drawLine(ink, w, h, a, b, opts.lineWidth ?? 3);
  const closed = dilate(ink, w, h, close);
  const freeClosed = new Uint8Array(w * h);
  for (let i = 0; i < closed.length; i++) freeClosed[i] = closed[i] ? 0 : 1;
  const { labels, areas } = components(freeClosed, w, h);

  const total = w * h;
  const minA = (opts.minArea ?? 0.0008) * total;
  const maxA = (opts.maxArea ?? 0.2) * total;
  const keep = areas.map((a, i) => i > 0 && a >= minA && a <= maxA);
  // 이미지 테두리에 닿는 영역은 바깥으로 본다.
  for (let x = 0; x < w; x++) keep[labels[x]] = keep[labels[(h - 1) * w + x]] = false;
  for (let y = 0; y < h; y++) keep[labels[y * w]] = keep[labels[y * w + w - 1]] = false;
  const remap = new Int32Array(areas.length);
  let n = 0;
  for (let i = 1; i < areas.length; i++) if (keep[i]) remap[i] = ++n;
  for (let p = 0; p < labels.length; p++) labels[p] = remap[labels[p]];

  // 팽창한 만큼 원래 빈 칸으로 되돌린다(선 위로는 넘지 않는다).
  const free = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) free[i] = ink[i] ? 0 : 1;
  const grown = grow(labels, free, w, h, close + 1);
  fillHoles(grown, w, h);
  return { labels: grown, regions: describe(grown, w, h, n), threshold, ink };
}

/**
 * 한 영역에 완전히 둘러싸인 빈 곳(실 이름 상자, 가구, 작은 조각)을 그 영역으로 채운다.
 * 둘 이상의 영역이나 이미지 테두리에 닿는 것(벽선)은 그대로 둔다.
 */
export function fillHoles(labels, w, h) {
  const zero = new Uint8Array(w * h);
  for (let i = 0; i < labels.length; i++) zero[i] = labels[i] ? 0 : 1;
  const { labels: holes, areas } = components(zero, w, h);
  const owner = new Int32Array(areas.length); // 0 = 아직 없음, -1 = 여럿·테두리
  for (let p = 0; p < holes.length; p++) {
    const k = holes[p];
    if (!k || owner[k] === -1) continue;
    const x = p % w;
    const y = (p - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
      owner[k] = -1;
      continue;
    }
    for (const q of [p - 1, p + 1, p - w, p + w]) {
      const l = labels[q];
      if (!l) continue;
      if (owner[k] === 0) owner[k] = l;
      else if (owner[k] !== l) {
        owner[k] = -1;
        break;
      }
    }
  }
  for (let p = 0; p < holes.length; p++) {
    const k = holes[p];
    if (k && owner[k] > 0) labels[p] = owner[k];
  }
  return labels;
}

/**
 * 손으로 그린 사각형의 변을 가까운 선(벽)에 붙인다. 변마다 ±reach px 안에서 선이 절반 이상 지나는 줄을 찾아
 * 그 줄 바로 안쪽으로 옮긴다. 이웃 실과 벽 하나를 사이에 두고 맞닿게 하려는 것이다.
 */
export function snapRect(rect, ink, w, h, reach = 15) {
  const r = { ...rect };
  const rowInk = (y, x0, x1) => {
    if (y < 0 || y >= h) return 0;
    let n = 0;
    for (let x = Math.max(0, Math.round(x0)); x <= Math.min(w - 1, Math.round(x1)); x++) n += ink[y * w + x];
    return n / Math.max(1, Math.round(x1) - Math.round(x0) + 1);
  };
  const colInk = (x, y0, y1) => {
    if (x < 0 || x >= w) return 0;
    let n = 0;
    for (let y = Math.max(0, Math.round(y0)); y <= Math.min(h - 1, Math.round(y1)); y++) n += ink[y * w + x];
    return n / Math.max(1, Math.round(y1) - Math.round(y0) + 1);
  };
  const nearest = (start, dir, probe) => {
    // dir: 바깥쪽 방향(+1 또는 −1). 가까운 순서로 바깥·안쪽을 번갈아 본다.
    for (let d = 0; d <= reach; d++) {
      for (const s of d ? [d, -d] : [0]) {
        const v = Math.round(start + dir * s);
        if (probe(v) >= 0.5) return v - dir; // 선 바로 안쪽
      }
    }
    return start;
  };
  const [x0, y0, x1, y1] = [rect.x0, rect.y0, rect.x1, rect.y1];
  r.y0 = nearest(y0, -1, (y) => rowInk(y, x0, x1));
  r.y1 = nearest(y1, 1, (y) => rowInk(y, x0, x1));
  r.x0 = nearest(x0, -1, (x) => colInk(x, y0, y1));
  r.x1 = nearest(x1, 1, (x) => colInk(x, y0, y1));
  if (r.x1 - r.x0 < 4 || r.y1 - r.y0 < 4) return rect;
  return r;
}

/** 영역별 넓이·외접 사각형·중심(영역 안의 점). */
export function describe(labels, w, h, n = 0) {
  if (!n) for (const l of labels) if (l > n) n = l;
  const regions = Array.from({ length: n + 1 }, (_, id) => ({ id, area: 0, bbox: [Infinity, Infinity, -Infinity, -Infinity], sx: 0, sy: 0 }));
  for (let p = 0; p < labels.length; p++) {
    const l = labels[p];
    if (!l) continue;
    const r = regions[l];
    const x = p % w;
    const y = (p - x) / w;
    r.area++;
    r.sx += x;
    r.sy += y;
    if (x < r.bbox[0]) r.bbox[0] = x;
    if (y < r.bbox[1]) r.bbox[1] = y;
    if (x > r.bbox[2]) r.bbox[2] = x;
    if (y > r.bbox[3]) r.bbox[3] = y;
  }
  return regions
    .filter((r) => r.id && r.area)
    .map((r) => {
      let cx = Math.round(r.sx / r.area);
      let cy = Math.round(r.sy / r.area);
      // 무게중심이 영역 밖이면(ㄱ자 실) 영역 안에서 가장 가까운 점을 쓴다.
      if (labels[cy * w + cx] !== r.id) {
        let best = Infinity;
        for (let y = r.bbox[1]; y <= r.bbox[3]; y += 2)
          for (let x = r.bbox[0]; x <= r.bbox[2]; x += 2) {
            if (labels[y * w + x] !== r.id) continue;
            const d = (x - cx) ** 2 + (y - cy) ** 2;
            if (d < best) (best = d), (cx = x), (cy = y);
          }
      }
      return { id: r.id, area: r.area, bbox: r.bbox, cx, cy };
    });
}

/**
 * 사용자 지정을 영역에 적용한다. 지정은 좌표로 저장해 두므로 다시 분할해도 따라간다.
 * seeds: [{ x, y, type }] (type이 null이면 지정 해제), merges: [{ a:[x,y], b:[x,y] }]
 * 반환: Map(영역 id → { type, members:[영역 id] }) — 합쳐진 영역은 대표 id 하나로 묶인다.
 */
export function applyAssignments(labels, w, regions, seeds, merges) {
  const parent = new Map(regions.map((r) => [r.id, r.id]));
  const find = (x) => {
    while (parent.get(x) !== x) x = parent.get(x);
    return x;
  };
  const at = ([x, y]) => labels[Math.round(y) * w + Math.round(x)] || 0;
  for (const m of merges) {
    const a = at(m.a);
    const b = at(m.b);
    if (a && b && find(a) !== find(b)) parent.set(find(b), find(a));
  }
  const groups = new Map();
  for (const r of regions) {
    const root = find(r.id);
    if (!groups.has(root)) groups.set(root, { id: root, type: null, members: [] });
    groups.get(root).members.push(r.id);
  }
  for (const s of seeds) {
    const l = at([s.x, s.y]);
    if (l) groups.get(find(l)).type = s.type;
  }
  return { groups, rootOf: (id) => find(id) };
}

/** 이진 마스크의 바깥 외곽선(무어 이웃 추적, Jacob 정지 조건). 반환: 픽셀 중심 좌표 [[x, y], ...]. */
export function traceOutline(mask, w, h) {
  let start = -1;
  for (let p = 0; p < mask.length; p++)
    if (mask[p]) {
      start = p;
      break;
    }
  if (start < 0) return [];
  // 시계 방향(화면 좌표, y는 아래로): 서, 북서, 북, 북동, 동, 남동, 남, 남서
  const DX = [-1, -1, 0, 1, 1, 1, 0, -1];
  const DY = [0, -1, -1, -1, 0, 1, 1, 1];
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const sx = start % w;
  const sy = (start - sx) / w;
  const pts = [[sx, sy]];
  let cx = sx;
  let cy = sy;
  let back = 0; // 시작점의 서쪽은 배경(위에서 아래, 왼쪽에서 오른쪽으로 훑었으므로)
  let second = null;
  for (let guard = 0; guard < 8 * mask.length; guard++) {
    let found = -1;
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8;
      if (on(cx + DX[d], cy + DY[d])) {
        found = d;
        break;
      }
    }
    if (found < 0) break; // 외딴 픽셀
    const nx = cx + DX[found];
    const ny = cy + DY[found];
    // 새 위치에서 되돌아볼 방향: 직전 칸(배경)이 있던 방향
    const prevD = (found + 7) % 8;
    const bx = cx + DX[prevD];
    const by = cy + DY[prevD];
    back = DX.findIndex((dx, i) => nx + dx === bx && ny + DY[i] === by);
    if (back < 0) back = (found + 4) % 8;
    if (nx === sx && ny === sy) {
      if (second === null) break;
      // Jacob 정지 조건: 시작점으로 돌아와 다음이 두 번째 점이면 끝
      let nf = -1;
      for (let k = 1; k <= 8; k++) {
        const d = (back + k) % 8;
        if (on(sx + DX[d], sy + DY[d])) {
          nf = d;
          break;
        }
      }
      if (nf >= 0 && sx + DX[nf] === second[0] && sy + DY[nf] === second[1]) break;
    }
    cx = nx;
    cy = ny;
    if (second === null) second = [cx, cy];
    if (!(cx === sx && cy === sy)) pts.push([cx, cy]);
  }
  return pts;
}

/** Douglas–Peucker 단순화(닫힌 다각형). */
export function simplify(points, eps) {
  if (points.length < 4) return points;
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const [ax, ay] = pts[0];
    const [bx, by] = pts[pts.length - 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1;
    let idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > best) (best = d), (idx = i);
    }
    if (best <= eps) return [pts[0], pts[pts.length - 1]];
    return dp(pts.slice(0, idx + 1)).slice(0, -1).concat(dp(pts.slice(idx)));
  };
  // 시작점에서 가장 먼 점으로 둘로 나눠 각각 단순화한다.
  let far = 0;
  let fd = -1;
  for (let i = 1; i < points.length; i++) {
    const d = (points[i][0] - points[0][0]) ** 2 + (points[i][1] - points[0][1]) ** 2;
    if (d > fd) (fd = d), (far = i);
  }
  const a = dp(points.slice(0, far + 1));
  const b = dp(points.slice(far).concat([points[0]]));
  return a.slice(0, -1).concat(b.slice(0, -1));
}

/** 한 실(여러 영역을 합친 것)의 다각형. 합친 영역 사이의 얇은 선은 닫힘 연산으로 메운다. */
export function regionPolygon(labels, w, h, members, { bridge = 3, eps = 1.5 } = {}) {
  const set = new Set(members);
  let [x0, y0, x1, y1] = [w, h, 0, 0];
  for (let p = 0; p < labels.length; p++) {
    if (!set.has(labels[p])) continue;
    const x = p % w;
    const y = (p - x) / w;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  if (x1 < x0) return null;
  const pad = bridge + 2;
  const bx = Math.max(0, x0 - pad);
  const by = Math.max(0, y0 - pad);
  const bw = Math.min(w, x1 + pad + 1) - bx;
  const bh = Math.min(h, y1 + pad + 1) - by;
  let mask = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (set.has(labels[(by + y) * w + bx + x])) mask[y * bw + x] = 1;
  if (members.length > 1 || bridge > 0) mask = erode(dilate(mask, bw, bh, bridge), bw, bh, bridge);
  // 가장 큰 덩어리만 남긴다(떨어진 조각 제거).
  const { labels: cl, areas } = components(mask, bw, bh);
  let big = 1;
  for (let i = 2; i < areas.length; i++) if (areas[i] > areas[big]) big = i;
  for (let p = 0; p < mask.length; p++) mask[p] = cl[p] === big ? 1 : 0;
  const outline = traceOutline(mask, bw, bh);
  if (outline.length < 3) return null;
  return simplify(outline, eps).map(([x, y]) => [x + bx, y + by]);
}

/**
 * 지정된 실들을 AI 허브 SPA 형식의 COCO 라벨로 만든다.
 * 좌표는 AI 허브 도면과 같은 종이 크기(가로 sheetWidth px)로 늘려, 모델의 픽셀 기준값(벽 간격 등)이 같은 뜻을 갖게 한다.
 */
export function toCoco(rooms, w, h, { sheetWidth = 4963, fileName = 'image.png' } = {}) {
  const f = sheetWidth / w;
  const types = [...new Set(rooms.map((r) => r.type))];
  const categories = types.map((t, i) => ({ id: i + 1, name: `공간_${t}` }));
  const annotations = rooms.map((r, i) => {
    const pts = r.polygon.map(([x, y]) => [Math.round(x * f * 10) / 10, Math.round(y * f * 10) / 10]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    let area = 0;
    for (let k = 0, j = pts.length - 1; k < pts.length; j = k++) area += (pts[j][0] + pts[k][0]) * (pts[j][1] - pts[k][1]);
    return {
      id: i + 1,
      image_id: 1,
      category_id: types.indexOf(r.type) + 1,
      segmentation: [pts.flat()],
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)],
      area: Math.abs(area / 2),
      iscrowd: 0,
      attributes: { source: 'image' },
    };
  });
  return {
    images: [{ id: 1, width: Math.round(w * f), height: Math.round(h * f), file_name: fileName }],
    categories,
    annotations,
  };
}

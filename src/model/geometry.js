// 폴리곤 기하 유틸리티. 좌표는 COCO 라벨의 픽셀 좌표계를 그대로 쓴다.

/** COCO segmentation(평탄 배열 목록) 또는 bbox를 [[x, y], ...] 폴리곤 목록으로 바꾼다. */
export function toPolygons(annotation) {
  const segs = annotation.segmentation;
  if (Array.isArray(segs) && segs.length > 0 && Array.isArray(segs[0])) {
    return segs
      .filter((flat) => flat.length >= 6)
      .map((flat) => {
        const pts = [];
        for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
        return pts;
      });
  }
  const [x, y, w, h] = annotation.bbox;
  return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]];
}

export function polygonArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function centroid(pts) {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = pts.length;
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function bboxOf(polys) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const pts of polys) {
    for (const [x, y] of pts) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}

export function bboxGap(a, b) {
  const dx = Math.max(0, a[0] - b[2], b[0] - a[2]);
  const dy = Math.max(0, a[1] - b[3], b[1] - a[3]);
  return Math.hypot(dx, dy);
}

export function bboxIntersectionArea(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function edgesOf(polys) {
  const edges = [];
  for (const pts of polys) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      edges.push([a[0], a[1], b[0], b[1]]);
    }
  }
  return edges;
}

function distToEdges(x, y, edges) {
  let best = Infinity;
  for (const e of edges) {
    const d = pointSegDist(x, y, e[0], e[1], e[2], e[3]);
    if (d < best) best = d;
  }
  return best;
}

export function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 두 도형 경계 사이의 최소 거리(겹치면 0). */
export function polygonDistance(polysA, polysB) {
  const eb = edgesOf(polysB);
  const ea = edgesOf(polysA);
  for (const pts of polysA) {
    for (const [x, y] of pts) if (polysB.some((q) => pointInPolygon(x, y, q))) return 0;
  }
  for (const pts of polysB) {
    for (const [x, y] of pts) if (polysA.some((q) => pointInPolygon(x, y, q))) return 0;
  }
  let best = Infinity;
  for (const pts of polysA) for (const [x, y] of pts) best = Math.min(best, distToEdges(x, y, eb));
  for (const pts of polysB) for (const [x, y] of pts) best = Math.min(best, distToEdges(x, y, ea));
  return best;
}

/**
 * A의 경계 중 B의 경계에서 tau 이내에 있는 길이(픽셀).
 * 두 실이 벽 하나를 사이에 두고 얼마나 길게 맞닿는지 추정하는 데 쓴다.
 */
export function contactLength(polysA, polysB, tau, step = 4) {
  const eb = edgesOf(polysB);
  let length = 0;
  for (const [ax, ay, bx, by] of edgesOf(polysA)) {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (distToEdges(ax + t * (bx - ax), ay + t * (by - ay), eb) <= tau) length += len / n;
    }
  }
  return length;
}

/** A 면적 중 B 안에 들어가는 비율을 격자 표본으로 추정한다(0~1). */
export function overlapRatio(polysA, polysB, samples = 12) {
  const [x0, y0, x1, y1] = bboxOf(polysA);
  let inA = 0;
  let inBoth = 0;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const x = x0 + ((i + 0.5) / samples) * (x1 - x0);
      const y = y0 + ((j + 0.5) / samples) * (y1 - y0);
      if (!polysA.some((p) => pointInPolygon(x, y, p))) continue;
      inA++;
      if (polysB.some((p) => pointInPolygon(x, y, p))) inBoth++;
    }
  }
  return inA ? inBoth / inA : 0;
}

/** 다각형 둘레 길이(픽셀). */
export function perimeter(polys) {
  let s = 0;
  for (const pts of polys) for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
  return s;
}

/** 점 집합의 볼록 껍질(Andrew 단조 사슬). */
export function convexHull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * 최소 면적 외접 사각형(회전 허용). 볼록 껍질의 각 변 방향으로 돌려 보며 가장 작은 사각형을 찾는다.
 * 도면이 기울어져도 값이 바뀌지 않는다(Rosin 1999의 MBR 직사각형도).
 * 반환: { area, long, short }
 */
export function minAreaRect(polys) {
  const hull = convexHull(polys.flat());
  if (hull.length < 3) return { area: 0, long: 0, short: 0 };
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const [ax, ay] = hull[i];
    const [bx, by] = hull[(i + 1) % hull.length];
    const len = Math.hypot(bx - ax, by - ay);
    if (!len) continue;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of hull) {
      const u = x * ux + y * uy;
      const v = -x * uy + y * ux;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const w = u1 - u0;
    const h = v1 - v0;
    if (!best || w * h < best.area) best = { area: w * h, long: Math.max(w, h), short: Math.min(w, h) };
  }
  return best;
}

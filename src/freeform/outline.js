// 세대 외곽(마스크) 만들기: 템플릿, 원본 세대에서 가져오기, 칸 그리기. 칸 크기 CELL(0.3m).
import { BALCONY_CELLS, CELL, SIDES, balconyRuns, rasterize } from './engine.js';

const OUTDOOR = new Set(['발코니', '실외기실']);

/**
 * 템플릿. 단위 상자 가로 aspect × 세로 1에서 칸이 실내인지 정하고, 면적이 area가 되게 키운다.
 * 아래쪽이 앞(발코니 쪽)이다. cut: 꺾임·홈 크기(0.15~0.5).
 */
export const TEMPLATES = {
  rect: { label: '직사각형', inside: () => true },
  L: { label: 'ㄱ자', inside: (u, v, A, c) => !(u > A * (1 - c) && v < c) },
  U: { label: 'ㄷ자(앞뒤 홈)', inside: (u, v, A, c) => !(u > A * (0.5 - c / 2) && u < A * (0.5 + c / 2) && v < c * 1.1) },
  T: { label: '凸자', inside: (u, v, A, c) => !((u < A * c * 0.7 || u > A * (1 - c * 0.7)) && v < c) },
  step: { label: '엇갈림', inside: (u, v, A, c) => !((u < A * 0.5 && v < c * 0.7) || (u >= A * 0.5 && v > 1 - c * 0.7)) },
};

export function templateMask(kind, area, { aspect = 1.4, cut = 0.3 } = {}) {
  const f = TEMPLATES[kind]?.inside || TEMPLATES.rect.inside;
  const make = (L) => {
    const nx = Math.max(6, Math.round((aspect * L) / CELL));
    const ny = Math.max(6, Math.round(L / CELL));
    const cells = new Uint8Array(nx * ny);
    let n = 0;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const u = ((i + 0.5) / nx) * aspect;
        const v = (j + 0.5) / ny;
        if (f(u, v, aspect, cut)) ((cells[j * nx + i] = 1), n++);
      }
    return { nx, ny, cells, n };
  };
  let L = Math.sqrt(area / aspect);
  let m = make(L);
  L *= Math.sqrt(area / (m.n * CELL * CELL));
  // 칸 반올림 때문에 한 번에 맞지 않아, 근처 크기 중 면적이 가장 가까운 것을 고른다.
  let best = null;
  for (let d = -0.05; d <= 0.0501; d += 0.0025) {
    const c = make(L * (1 + d));
    if (!best || Math.abs(c.n * CELL * CELL - area) < Math.abs(best.n * CELL * CELL - area)) best = c;
  }
  return trim(best);
}

/** 원본 세대의 실내(발코니·실외기실 제외) 칸을 마스크로. */
export function maskFromUnit(unit, area = null) {
  const interior0 = unit.rooms.filter((r) => !OUTDOOR.has(r.type)).reduce((s, r) => s + r.area, 0);
  let scale = area ? Math.sqrt(area / interior0) : 1;
  let R = rasterize(unit, scale);
  const count = (g) => g.reduce((n, v) => n + (v >= 0 && !OUTDOOR.has(unit.rooms[v].type) ? 1 : 0), 0);
  if (area)
    for (let it = 0; it < 2; it++) {
      scale *= Math.sqrt(area / (count(R.grid) * R.sx * R.sy));
      R = rasterize(unit, scale);
    }
  // 원본 칸 크기(sx, sy)가 CELL과 조금 달라 CELL 격자로 다시 표본을 뜬다.
  const W = R.nx * R.sx;
  const H = R.ny * R.sy;
  const nx = Math.round(W / CELL);
  const ny = Math.round(H / CELL);
  const cells = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const gi = Math.min(R.nx - 1, Math.floor(((i + 0.5) * CELL) / R.sx));
      const gj = Math.min(R.ny - 1, Math.floor(((j + 0.5) * CELL) / R.sy));
      const v = R.grid[gj * R.nx + gi];
      if (v >= 0 && !OUTDOOR.has(unit.rooms[v].type)) cells[j * nx + i] = 1;
    }
  return trim({ nx, ny, cells });
}

/** 빈 가장자리 줄을 잘라낸다. */
export function trim(m) {
  let x0 = m.nx;
  let y0 = m.ny;
  let x1 = -1;
  let y1 = -1;
  for (let j = 0; j < m.ny; j++)
    for (let i = 0; i < m.nx; i++)
      if (m.cells[j * m.nx + i]) {
        x0 = Math.min(x0, i);
        x1 = Math.max(x1, i);
        y0 = Math.min(y0, j);
        y1 = Math.max(y1, j);
      }
  if (x1 < 0) return { nx: 0, ny: 0, cells: new Uint8Array(0), n: 0 };
  const nx = x1 - x0 + 1;
  const ny = y1 - y0 + 1;
  const cells = new Uint8Array(nx * ny);
  let n = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (m.cells[(j + y0) * m.nx + i + x0]) ((cells[j * nx + i] = 1), n++);
  return { nx, ny, cells, n };
}

/** 가장 큰 한 덩어리만 남긴다(실외기실 등을 빼고 떨어져 남은 조각 제거). share = 남긴 칸 / 원래 칸. */
export function largest(m) {
  const lab = new Int32Array(m.cells.length).fill(-1);
  let best = -1;
  let bestN = 0;
  let total = 0;
  for (let s = 0; s < m.cells.length; s++) {
    if (!m.cells[s] || lab[s] >= 0) continue;
    const q = [s];
    lab[s] = s;
    for (let h = 0; h < q.length; h++) {
      const i = q[h] % m.nx;
      const j = Math.floor(q[h] / m.nx);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di;
        const jj = j + dj;
        const k = jj * m.nx + ii;
        if (ii >= 0 && jj >= 0 && ii < m.nx && jj < m.ny && m.cells[k] && lab[k] < 0) ((lab[k] = s), q.push(k));
      }
    }
    total += q.length;
    if (q.length > bestN) ((bestN = q.length), (best = s));
  }
  const out = trim({ nx: m.nx, ny: m.ny, cells: Uint8Array.from(lab, (v) => (v === best ? 1 : 0)) });
  return { ...out, share: total ? bestN / total : 0 };
}

/** 칸이 한 덩어리인지(그리기 검사). */
export function maskConnected(m) {
  const start = m.cells.indexOf(1);
  if (start < 0) return false;
  const seen = new Uint8Array(m.cells.length);
  const q = [start];
  seen[start] = 1;
  let cnt = 1;
  while (q.length) {
    const k = q.pop();
    const i = k % m.nx;
    const j = Math.floor(k / m.nx);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= m.nx || jj >= m.ny) continue;
      const kk = jj * m.nx + ii;
      if (m.cells[kk] && !seen[kk]) ((seen[kk] = 1), q.push(kk), cnt++);
    }
  }
  return cnt === m.cells.reduce((s, v) => s + v, 0);
}

/** 마스크 미리보기 SVG(외곽선 + 앞쪽 표시). */
export function maskSvg(m, { title = '', sides = ['S'] } = {}) {
  const S = 40 * CELL; // 1m = 40
  const B = BALCONY_CELLS * S;
  const pad = 30 + B;
  const vw = m.nx * S + pad * 2;
  const vh = m.ny * S + pad * 2 + (title ? 30 : 0);
  const parts = [`<rect width="${vw}" height="${vh}" fill="#fff"/>`];
  parts.push('<defs><pattern id="mk-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#9fb7cf" stroke-width="2"/></pattern></defs>');
  const runs0 = balconyRuns(m, sides);
  for (const run of runs0) {
    const d = run.cells.map(([i, j]) => `M${pad + i * S} ${pad + j * S}h${S}v${S}h${-S}z`).join('');
    parts.push(`<path d="${d}" fill="url(#mk-hatch)" stroke="url(#mk-hatch)" stroke-width="0.6"/>`);
  }
  const runs = [];
  for (let j = 0; j < m.ny; j++) {
    let s = -1;
    for (let i = 0; i <= m.nx; i++) {
      const on = i < m.nx && m.cells[j * m.nx + i];
      if (on && s < 0) s = i;
      if (!on && s >= 0) {
        runs.push(`M${pad + s * S} ${pad + j * S}h${(i - s) * S}v${S}h${-(i - s) * S}z`);
        s = -1;
      }
    }
  }
  parts.push(`<path d="${runs.join('')}" fill="#f6e7c8" stroke="#f6e7c8" stroke-width="0.6"/>`);
  // 외곽선
  const edges = [];
  const on = (i, j) => i >= 0 && j >= 0 && i < m.nx && j < m.ny && m.cells[j * m.nx + i];
  for (let j = 0; j <= m.ny; j++) for (let i = 0; i < m.nx; i++) if (on(i, j - 1) !== on(i, j)) edges.push(`M${pad + i * S} ${pad + j * S}h${S}`);
  for (let i = 0; i <= m.nx; i++) for (let j = 0; j < m.ny; j++) if (on(i - 1, j) !== on(i, j)) edges.push(`M${pad + i * S} ${pad + j * S}v${S}`);
  parts.push(`<path d="${edges.join('')}" stroke="#2b2a33" stroke-width="5" fill="none" stroke-linecap="square"/>`);
  const area = m.cells.reduce((s, v) => s + v, 0) * CELL * CELL;
  parts.push(`<text x="${vw / 2}" y="${pad + (m.ny * S) / 2}" text-anchor="middle" font-size="18" font-weight="700" fill="#22212b">${area.toFixed(1)}㎡</text>`);
  parts.push(`<text x="${vw / 2}" y="${pad + m.ny * S + B + 22}" text-anchor="middle" font-size="13" fill="#e8590c">▼ 앞(아래) · 발코니 ${runs0.length}곳${sides.length ? ` (${sides.map((x) => SIDES[x]).join('·')})` : ' 없음'}</text>`);
  if (title) parts.push(`<text x="${vw / 2}" y="${vh - 10}" text-anchor="middle" font-size="15" font-weight="700" fill="#222">${title}</text>`);
  return `<svg viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}" role="img" aria-label="세대 외곽">${parts.join('')}</svg>`;
}

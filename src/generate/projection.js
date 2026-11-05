// 외곽 투영: 정렬 모드 평면(직사각형 띠 배치)을 실제 세대 외곽(AI 허브 외곽 묶음의 대표 세대) 안으로 잘라 넣는다.
// QUBO + SA가 정하는 것(실 순서 = 공간구문 그래프)은 그대로 두고, 치수 단계에서 외곽 밖 부분만 잘라 낸다.
// 판정(사전 등록, scripts/outline-projection.mjs): 잘라 낸 뒤에도 ① 모든 실이 남고 한 덩어리이며 ② 맞닿음 그래프가
// 직사각형 평면의 그래프(= QUBO 모형 그래프, 15,072/15,072 일치)와 같아야 그 외곽에서 정확 QUBO가 유효하다.
//
// 좌표: layout은 y가 작을수록 뒤(북), 앞 띠 아래(y = D)가 발코니. 외곽 마스크는 같은 방향으로 돌려 둔 것(앞 = 아래 줄, outlines.json).
// 마스크 칸(0.3 m)을 SUB×SUB로 나눈 고운 칸(0.1 m)에서 실을 칸 중심 포함으로 칠한다.

const OUTSIDE = new Set(['발코니', '실외기실']);
export const SUB = 3;

/** 마스크(칸 0.3 m, cells: 1 = 실내)를 고운 격자로. */
export function fineMask(mask, cell = 0.3) {
  const nx = mask.nx * SUB;
  const ny = mask.ny * SUB;
  const cells = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) cells[j * nx + i] = mask.cells[Math.floor(j / SUB) * mask.nx + Math.floor(i / SUB)];
  return { nx, ny, cells, cell: cell / SUB };
}

/**
 * layout(직사각형, 실내 W×D)을 마스크 크기에 맞춰 잘라 칠한다. layout.W·D는 마스크 상자(nx·cell × ny·cell)와 같게 만들어 둬야 한다.
 * 반환: { grid(Int16, 실 번호 또는 −1), rooms(실내 실 목록), cellsOf(실별 칸 수), area(실별 m²), rectArea, connected(실별), adj(Map key→Set) }
 */
export function project(layout, fm) {
  const rooms = layout.rooms.filter((r) => !OUTSIDE.has(r.type));
  const grid = new Int16Array(fm.nx * fm.ny).fill(-1);
  const c = fm.cell;
  for (let j = 0; j < fm.ny; j++) {
    const y = (j + 0.5) * c;
    for (let i = 0; i < fm.nx; i++) {
      if (!fm.cells[j * fm.nx + i]) continue;
      const x = (i + 0.5) * c;
      for (let k = 0; k < rooms.length; k++) {
        const r = rooms[k];
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
          grid[j * fm.nx + i] = k;
          break;
        }
      }
    }
  }
  const n = rooms.length;
  const cellsOf = new Array(n).fill(0);
  const start = new Array(n).fill(-1);
  for (let s = 0; s < grid.length; s++) if (grid[s] >= 0) (cellsOf[grid[s]]++, start[grid[s]] < 0 && (start[grid[s]] = s));
  // 실마다 한 덩어리인가(4-이웃)
  const connected = rooms.map((_, k) => {
    if (!cellsOf[k]) return false;
    const seen = new Uint8Array(grid.length);
    const q = [start[k]];
    seen[start[k]] = 1;
    for (let h = 0; h < q.length; h++) {
      const s = q[h];
      const i = s % fm.nx;
      const j = (s - i) / fm.nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= fm.nx || jj >= fm.ny) continue;
        const t = jj * fm.nx + ii;
        if (!seen[t] && grid[t] === k) (seen[t] = 1), q.push(t);
      }
    }
    return q.length === cellsOf[k];
  });
  // 맞닿음: 이웃 칸 경계가 다른 실 사이에 하나라도 있으면(공유 변 ≥ 0.1 m; 직사각형 판정은 > 0.05 m)
  const adj = new Map(rooms.map((r) => [r.key, new Set()]));
  for (let j = 0; j < fm.ny; j++)
    for (let i = 0; i < fm.nx; i++) {
      const a = grid[j * fm.nx + i];
      if (a < 0) continue;
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        const ii = i + di;
        const jj = j + dj;
        if (ii >= fm.nx || jj >= fm.ny) continue;
        const b = grid[jj * fm.nx + ii];
        if (b >= 0 && b !== a) adj.get(rooms[a].key).add(rooms[b].key), adj.get(rooms[b].key).add(rooms[a].key);
      }
    }
  const area = cellsOf.map((m) => m * c * c);
  const rectArea = rooms.map((r) => r.w * r.h);
  return { grid, rooms, cellsOf, area, rectArea, connected, adj, fm };
}

/** 두 그래프(adj: Map key→Set)가 같은가. */
export function sameGraph(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, s] of a) {
    const t = b.get(k);
    if (!t || t.size !== s.size) return false;
    for (const v of s) if (!t.has(v)) return false;
  }
  return true;
}

/**
 * 투영 평면 SVG: 고운 칸을 실별로 칠하고(가로 줄 단위로 묶어 그림), 실 경계·외곽선은 칸 경계에서 그린다.
 * 문·창·설비는 그리지 않는다(직사각형 평면의 규칙이 외곽에 맞춰 검증되지 않았기 때문).
 */
export function projSvg(pr, { title = '', fillOf, nameOf = (r) => r.name }) {
  const { grid, rooms, fm } = pr;
  const S = 40;
  const pad = 30;
  const c = fm.cell;
  const W = fm.nx * c;
  const H = fm.ny * c;
  const parts = [];
  for (let j = 0; j < fm.ny; j++)
    for (let i = 0; i < fm.nx; ) {
      const k = grid[j * fm.nx + i];
      let e = i + 1;
      while (e < fm.nx && grid[j * fm.nx + e] === k) e++;
      if (k >= 0) parts.push(`<rect x="${(pad + i * c * S).toFixed(1)}" y="${(pad + j * c * S).toFixed(1)}" width="${((e - i) * c * S + 0.6).toFixed(1)}" height="${(c * S + 0.6).toFixed(1)}" fill="${fillOf(rooms[k].type)}"/>`);
      i = e;
    }
  // 경계: 다른 실(또는 바깥)과 닿는 칸 변
  const seg = [];
  const at = (i, j) => (i < 0 || j < 0 || i >= fm.nx || j >= fm.ny ? -1 : grid[j * fm.nx + i]);
  for (let j = 0; j <= fm.ny; j++)
    for (let i = 0; i < fm.nx; i++) {
      const a = at(i, j - 1);
      const b = at(i, j);
      if (a !== b) seg.push([i, j, i + 1, j, a < 0 || b < 0]);
    }
  for (let i = 0; i <= fm.nx; i++)
    for (let j = 0; j < fm.ny; j++) {
      const a = at(i - 1, j);
      const b = at(i, j);
      if (a !== b) seg.push([i, j, i, j + 1, a < 0 || b < 0]);
    }
  const P = (v) => (pad + v * c * S).toFixed(1);
  const path = (outer) => seg.filter((s) => s[4] === outer).map(([x0, y0, x1, y1]) => `M${P(x0)} ${P(y0)}L${P(x1)} ${P(y1)}`).join('');
  parts.push(`<path d="${path(false)}" stroke="#2b2a33" stroke-width="3" fill="none"/>`, `<path d="${path(true)}" stroke="#2b2a33" stroke-width="6" fill="none" stroke-linecap="square"/>`);
  // 실 이름·면적: 실 칸의 중심에 가장 가까운 칸
  rooms.forEach((r, k) => {
    if (!pr.cellsOf[k]) return;
    let sx = 0;
    let sy = 0;
    const cells = [];
    for (let s = 0; s < grid.length; s++) if (grid[s] === k) (sx += s % fm.nx, sy += Math.floor(s / fm.nx), cells.push(s));
    const cx = sx / cells.length;
    const cy = sy / cells.length;
    const best = cells.reduce((b, s) => { const d = (s % fm.nx - cx) ** 2 + (Math.floor(s / fm.nx) - cy) ** 2; return d < b[1] ? [s, d] : b; }, [cells[0], Infinity])[0];
    const x = pad + ((best % fm.nx) + 0.5) * c * S;
    const y = pad + (Math.floor(best / fm.nx) + 0.5) * c * S;
    const big = pr.area[k] >= 4;
    parts.push(`<text x="${x.toFixed(1)}" y="${(y - (big ? 4 : 0)).toFixed(1)}" text-anchor="middle" font-size="${big ? 15 : 10}" font-weight="600" fill="#2b2a33">${nameOf(r)}</text>`);
    if (big) parts.push(`<text x="${x.toFixed(1)}" y="${(y + 13).toFixed(1)}" text-anchor="middle" font-size="11" fill="#55535f">${pr.area[k].toFixed(1)}㎡</text>`);
  });
  const vw = W * S + pad * 2;
  const vh = H * S + pad * 2 + 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}" role="img" aria-label="${title}" style="background:#fff">${parts.join('')}<text x="${(vw / 2).toFixed(0)}" y="${(vh - 8).toFixed(0)}" text-anchor="middle" font-size="16" font-weight="700" fill="#2b2a33">${title}</text></svg>`;
}

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

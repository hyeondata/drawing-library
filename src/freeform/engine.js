// 자유형(사각형이 아닌 실) 평면 생성 엔진.
// 기준 세대(sample)의 외곽과 현관·발코니·실외기실 위치는 그대로 두고, 나머지 칸을 실들에 다시 나눠 준다.
// 실 = 격자 칸의 연결된 묶음 → 직사각형뿐 아니라 ㄱ자·ㄷ자 같은 직교 다각형이 나온다.
// 최적화: 칸 하나를 이웃 실로 넘기는 이동 + 담금질(simulated annealing). 실은 항상 한 덩어리(연결)로 유지한다.
//
// 에너지(작을수록 좋음)
//   E = wA Σ((n_r − t_r)/t_r)²                       면적: 목표 칸 수 t_r에서 벗어난 정도
//     + wP Σ(둘레_r / (4√n_r) − 1)                   모양 단순함: 같은 면적의 정사각형 대비 둘레 초과분
//     + wK Σ max(0, 꼭짓점_r − K)                     꼭짓점 상한 K(모양 자유도: 4 직사각형, 6 ㄱ자, 8 ㄷ자)
//     + wT Σ(얇은 칸_r / n_r)                         최소 폭보다 좁은 부분(가로·세로 연속 길이 중 짧은 쪽 < 최소 폭)
//     + wJ Σ[필요한 인접 쌍이 문 폭(0.9m)만큼 맞닿지 않음]  기준 세대의 인접 관계 유지
//     + wE Σ max(0, 2.0m − 창 낼 수 있는 바깥 벽)_r     거실·침실은 바깥(또는 발코니)에 닿아야 함

import { dirName, sunHours } from '../generate/metrics.js';
import { bfs, kendallTauB, nodeMetrics } from '../model/syntax.js';
import { GENOTYPE_ORDER } from '../model/config.js';

export const CELL = 0.3; // m
const OUTDOOR = new Set(['발코니', '실외기실']);
export const FIXED = new Set(['현관', '발코니', '실외기실']);
export const MIN_WIDTH = { 거실: 3.0, 침실: 2.4, 주방: 1.8, 화장실: 1.2, 드레스룸: 1.0, 다목적공간: 1.2, 기타: 0.9 };
const NEEDS_WINDOW = new Set(['거실', '침실']);
const PUBLIC = new Set(['현관', '거실', '주방', '기타']);

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function pointIn(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 기준 세대를 격자로: 칸마다 기준 실 번호(-1 바깥). scale은 길이 배율(전용면적 맞춤). */
export function rasterize(unit, scale = 1, margin = 0) {
  const W = unit.W * scale;
  const H = unit.H * scale;
  const ix = Math.max(4, Math.round(W / CELL));
  const iy = Math.max(4, Math.round(H / CELL));
  const sx = W / ix;
  const sy = H / iy;
  const nx = ix + 2 * margin;
  const ny = iy + 2 * margin;
  const grid = new Int16Array(nx * ny).fill(-1);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = ((i - margin + 0.5) * sx) / scale;
      const y = ((j - margin + 0.5) * sy) / scale;
      for (let r = 0; r < unit.rooms.length; r++) if (unit.rooms[r].polys.some((p) => pointIn(x, y, p))) {
        grid[j * nx + i] = r;
        break;
      }
    }
  // 실 사이 벽 두께로 생긴 빈 칸(바깥이 아닌 틈)을 가장 많은 이웃 실로 메운다.
  for (let pass = 0; pass < 3; pass++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (grid[k] !== -1) continue;
        const cnt = new Map();
        let sides = 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const v = grid[jj * nx + ii];
          if (v >= 0 && !OUTDOOR.has(unit.rooms[v].type)) {
            sides++;
            cnt.set(v, (cnt.get(v) || 0) + 1);
          }
        }
        if (sides >= 2) grid[k] = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }
  return { nx, ny, sx, sy, grid };
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 문제 설정: 움직일 실, 목표 칸 수, 필요한 인접 쌍. */
export function setup(unit, { area = null, margin = 0 } = {}) {
  const interior0 = unit.rooms.filter((r) => !OUTDOOR.has(r.type)).reduce((s, r) => s + r.area, 0);
  let scale = area ? Math.sqrt(area / interior0) : 1;
  let R = rasterize(unit, scale, margin);
  // 원본 라벨은 실 사이에 벽 틈이 있어, 틈을 메운 격자 면적이 더 크다. 격자의 실내 면적이 고른 전용면적이 되게 두 번 맞춘다.
  if (area)
    for (let it = 0; it < 2; it++) {
      let cells = 0;
      for (const v of R.grid) if (v >= 0 && !OUTDOOR.has(unit.rooms[v].type)) cells++;
      scale *= Math.sqrt(area / (cells * R.sx * R.sy));
      R = rasterize(unit, scale, margin);
    }
  const rooms = unit.rooms.map((r, k) => ({ k, type: r.type, fixed: FIXED.has(r.type), cells: 0 }));
  for (const v of R.grid) if (v >= 0) rooms[v].cells++;
  // 1.5㎡ 미만의 작은 실(덕트·PS·작은 기타)은 움직이지 않는다.
  for (const r of rooms) if (!r.fixed && r.cells * R.sx * R.sy < 1.5) r.fixed = true;
  // 칸이 하나도 없는(너무 작은) 실은 뺀다.
  const alive = rooms.filter((r) => r.cells > 0).map((r) => r.k);
  const free = [];
  for (let k = 0; k < R.grid.length; k++) if (R.grid[k] >= 0 && !rooms[R.grid[k]].fixed) free.push(k);
  const movable = rooms.filter((r) => !r.fixed && r.cells > 0).map((r) => r.k);
  const freeCount = free.length;
  const movableCells = movable.reduce((s, k) => s + rooms[k].cells, 0);
  const target = new Float64Array(rooms.length);
  for (const k of movable) target[k] = (rooms[k].cells / movableCells) * freeCount;
  // 지킬 인접: 문이 필요한 쌍만(공용 실과 닿는 쌍, 드레스룸·화장실과 침실). 침실끼리처럼 우연히 맞닿은 쌍은 뺀다.
  const small = (r) => r.fixed && r.cells * R.sx * R.sy < 1.5;
  const matter = (x, y) => PUBLIC.has(x.type) || (['드레스룸', '화장실'].includes(x.type) && y.type === '침실');
  const need = unit.edges.filter(([a, b]) => {
    const x = rooms[a];
    const y = rooms[b];
    if (!alive.includes(a) || !alive.includes(b) || (x.fixed && y.fixed) || small(x) || small(y)) return false;
    if (OUTDOOR.has(x.type) || OUTDOOR.has(y.type)) return false;
    return matter(x, y) || matter(y, x);
  });
  // 문으로 갈 수 있게: 공용 실이 아닌 실은 공용 실(또는 안방 쪽 부속실) 하나와는 맞닿아야 한다 — 기준 세대의 인접에 이미 들어 있다.
  return { unit, scale, ...R, rooms, movable, target, need, cellM: (R.sx + R.sy) / 2 };
}

export const MARGIN = 3; // 외곽을 바꿀 때 바깥 여유 칸

/** 원본 세대 변형: 90° 회전(rot 0~3), 좌우·상하 뒤집기, 가로세로 비율(aspect, 면적은 그대로). */
export function transformUnit(unit, { rot = 0, flipX = false, flipY = false, aspect = 1 } = {}) {
  const ax = Math.sqrt(aspect);
  const map = ([x, y]) => {
    let X = x;
    let Y = y;
    for (let r = 0; r < (rot % 4 + 4) % 4; r++) [X, Y] = [-Y, X];
    if (flipX) X = -X;
    if (flipY) Y = -Y;
    return [X * ax, Y / ax];
  };
  const rooms0 = unit.rooms.map((r) => ({ ...r, polys: r.polys.map((p) => p.map(map)) }));
  const pts = rooms0.flatMap((r) => r.polys.flat());
  const x0 = Math.min(...pts.map((q) => q[0]));
  const y0 = Math.min(...pts.map((q) => q[1]));
  const rooms = rooms0.map((r) => ({ ...r, polys: r.polys.map((p) => p.map(([x, y]) => [x - x0, y - y0])) }));
  const W = Math.max(...pts.map((q) => q[0])) - x0;
  const H = Math.max(...pts.map((q) => q[1])) - y0;
  return { ...unit, rooms, W, H };
}

export const BALCONY_CELLS = 5; // 1.5m
export const SIDES = { S: '앞(아래)', N: '뒤(위)', W: '왼쪽', E: '오른쪽' };

/**
 * 발코니 띠: 면마다 줄(열·행)별 가장 바깥 실내 칸을 찾고, 그 위치가 같은 줄이 8칸(2.4m) 이상 이어지면 그 바깥에 깊이 5칸.
 * 반환 [{ side, len, cells: [[i, j, t]] }] — i, j는 마스크 좌표(바깥이라 음수·범위 밖일 수 있음), t는 띠를 따라 간 순서.
 * 앞서 놓은 띠와 겹치는 칸은 건너뛴다(모서리).
 */
export function balconyRuns(mask, sides, depth = BALCONY_CELLS, minRun = 8) {
  const { nx, ny, cells } = mask;
  const on = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && cells[j * nx + i];
  const taken = new Set();
  const out = [];
  const order = ['S', 'N', 'W', 'E'].filter((s) => sides.includes(s));
  for (const side of order) {
    const vertical = side === 'S' || side === 'N'; // 열마다 본다
    const L = vertical ? nx : ny;
    const edge = [];
    for (let a = 0; a < L; a++) {
      let e = null;
      if (side === 'S') for (let j = ny - 1; j >= 0; j--) if (on(a, j)) ((e = j), (j = -1));
      if (side === 'N') for (let j = 0; j < ny; j++) if (on(a, j)) ((e = j), (j = ny));
      if (side === 'E') for (let i = nx - 1; i >= 0; i--) if (on(i, a)) ((e = i), (i = -1));
      if (side === 'W') for (let i = 0; i < nx; i++) if (on(i, a)) ((e = i), (i = nx));
      edge.push(e);
    }
    let start = 0;
    for (let a = 1; a <= L; a++) {
      if (a < L && edge[a] !== null && edge[a] === edge[start]) continue;
      const len = a - start;
      if (edge[start] !== null && len >= minRun) {
        const cellsRun = [];
        for (let t = 0; t < len; t++) {
          const p = start + t;
          for (let d = 1; d <= depth; d++) {
            const [i, j] = side === 'S' ? [p, edge[start] + d] : side === 'N' ? [p, edge[start] - d] : side === 'E' ? [edge[start] + d, p] : [edge[start] - d, p];
            const key = `${i},${j}`;
            if (taken.has(key) || on(i, j)) continue;
            taken.add(key);
            cellsRun.push([i, j, t]);
          }
        }
        if (cellsRun.length) out.push({ side, len, cells: cellsRun });
      }
      start = a;
    }
  }
  return out;
}

/**
 * 새 외곽(마스크)으로 문제 설정. mask: { nx, ny, cells(Uint8Array, 1 = 실내) }, 칸 크기 CELL.
 * 실 구성·면적 비율·인접은 기준 세대에서 가져오고, 현관도 움직인다(바깥 벽에 닿게: 'entry' 항).
 * 발코니: 고른 면(S 앞·아래, N 뒤·위, W 왼쪽, E 오른쪽)마다 그 면의 가장 바깥 외벽 중 2.4m 이상 이어진 구간을 따라 1.5m.
 *   실외기실: 첫 발코니(앞쪽 우선) 끝 1.5m.
 * 초기 배치: 기준 세대 실 중심을 새 외곽 상자로 옮긴 가중 보로노이(면적이 큰 실이 넓게) + 한 덩어리로 정리.
 */
export function setupMask(unit, mask, { balcony = true, balconySides = null, outdoorUnit = false } = {}) {
  const sides = balconySides ?? (balcony ? ['S'] : []);
  const BAL = sides.length ? BALCONY_CELLS : 0;
  const M = MARGIN + BAL; // 발코니가 어느 면에나 들어가게 사방에 여유
  const nx = mask.nx + 2 * M;
  const ny = mask.ny + 2 * M;
  const grid = new Int16Array(nx * ny).fill(-1);
  const src = unit.rooms.map((r, k) => ({ ...r, k })).filter((r) => !OUTDOOR.has(r.type) && r.area >= 1.5);
  const rooms = src.map((r, i) => ({ k: i, type: r.type, fixed: false, cells: 0, src: r.k }));
  const inside = [];
  for (let j = 0; j < mask.ny; j++) for (let i = 0; i < mask.nx; i++) if (mask.cells[j * mask.nx + i]) inside.push((j + M) * nx + i + M);
  // 기준 세대 실 중심 → 새 외곽 상자
  const pts = src.flatMap((r) => r.polys.flat());
  const bx0 = Math.min(...pts.map((q) => q[0]));
  const by0 = Math.min(...pts.map((q) => q[1]));
  const bw = Math.max(...pts.map((q) => q[0])) - bx0 || 1;
  const bh = Math.max(...pts.map((q) => q[1])) - by0 || 1;
  const ix = inside.map((c) => c % nx);
  const iy = inside.map((c) => Math.floor(c / nx));
  const mx0 = Math.min(...ix);
  const my0 = Math.min(...iy);
  const mw = Math.max(...ix) - mx0 + 1;
  const mh = Math.max(...iy) - my0 + 1;
  const centers = src.map((r) => {
    const p = r.polys[0];
    const cx = p.reduce((t, q) => t + q[0], 0) / p.length;
    const cy = p.reduce((t, q) => t + q[1], 0) / p.length;
    return [mx0 + ((cx - bx0) / bw) * mw, my0 + ((cy - by0) / bh) * mh];
  });
  // 씨앗 먼저(실마다 가장 가까운 빈 칸), 나머지는 가중 보로노이.
  // 현관 씨앗은 발코니가 아닌 바깥에 닿은 칸에서 고른다(복도 쪽 현관문).
  const runs = balconyRuns(mask, sides);
  const reserved = new Set(runs.flatMap((r) => r.cells.map(([i, j]) => `${i},${j}`)));
  const entryOk = (c) => {
    const i = (c % nx) - M;
    const j = Math.floor(c / nx) - M;
    return N4.some(([di, dj]) => {
      const ii = i + di;
      const jj = j + dj;
      const outside = ii < 0 || jj < 0 || ii >= mask.nx || jj >= mask.ny || !mask.cells[jj * mask.nx + ii];
      return outside && !reserved.has(`${ii},${jj}`);
    });
  };
  const taken = new Set();
  centers.forEach(([cx, cy], r) => {
    let best = -1;
    let bd = Infinity;
    const isEnt = src[r].type === '현관';
    for (const c of inside) {
      if (taken.has(c) || (isEnt && !entryOk(c))) continue;
      const d = (c % nx - cx) ** 2 + (Math.floor(c / nx) - cy) ** 2;
      if (d < bd) ((bd = d), (best = c));
    }
    taken.add(best);
    grid[best] = r;
  });
  for (const c of inside) {
    if (grid[c] >= 0) continue;
    let best = 0;
    let bd = Infinity;
    centers.forEach(([cx, cy], r) => {
      const d = ((c % nx - cx) ** 2 + (Math.floor(c / nx) - cy) ** 2) / src[r].area;
      if (d < bd) ((bd = d), (best = r));
    });
    grid[c] = best;
  }
  repairComponents(grid, nx, ny, rooms.length);
  // 발코니·실외기실
  let unitDone = !outdoorUnit;
  for (const run of runs) {
    const bk = rooms.length;
    rooms.push({ k: bk, type: '발코니', fixed: true, cells: 0 });
    let ok = -1;
    if (!unitDone && run.len >= 14) {
      ok = rooms.length;
      rooms.push({ k: ok, type: '실외기실', fixed: true, cells: 0 });
      unitDone = true;
    }
    for (const [i, j, t] of run.cells) grid[(j + M) * nx + i + M] = ok >= 0 && t >= run.len - 5 ? ok : bk;
  }
  for (const v of grid) if (v >= 0) rooms[v].cells++;
  const movable = rooms.filter((r) => !r.fixed && r.cells > 0).map((r) => r.k);
  const total = src.reduce((t, r) => t + r.area, 0);
  const target = new Float64Array(rooms.length);
  for (const k of movable) target[k] = (src[k].area / total) * inside.length;
  const index = new Map(src.map((r, i) => [r.k, i]));
  const matter = (x, y) => PUBLIC.has(x.type) || (['드레스룸', '화장실'].includes(x.type) && y.type === '침실');
  const need = unit.edges
    .filter(([a, b]) => index.has(a) && index.has(b))
    .map(([a, b]) => [index.get(a), index.get(b)])
    .filter(([a, b]) => matter(rooms[a], rooms[b]) || matter(rooms[b], rooms[a]));
  return { unit, scale: 1, nx, ny, sx: CELL, sy: CELL, grid, rooms, movable, target, need, cellM: CELL, custom: true };
}

/** 실마다 가장 큰 덩어리만 남기고, 떨어진 칸은 이웃 실에 준다. */
function repairComponents(grid, nx, ny, nRooms) {
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (let r = 0; r < nRooms; r++) {
      const seen = new Uint8Array(grid.length);
      const comps = [];
      for (let k = 0; k < grid.length; k++) {
        if (grid[k] !== r || seen[k]) continue;
        const comp = [k];
        seen[k] = 1;
        for (let q = 0; q < comp.length; q++) {
          const c = comp[q];
          const i = c % nx;
          const j = Math.floor(c / nx);
          for (const [di, dj] of N4) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
            const m = jj * nx + ii;
            if (!seen[m] && grid[m] === r) ((seen[m] = 1), comp.push(m));
          }
        }
        comps.push(comp);
      }
      comps.sort((u, v) => v.length - u.length);
      for (const comp of comps.slice(1)) for (const c of comp) ((grid[c] = -2), (changed = true));
    }
    for (let it = 0; it < 50 && grid.includes(-2); it++)
      for (let k = 0; k < grid.length; k++) if (grid[k] === -2) {
        const i = k % nx;
        const j = Math.floor(k / nx);
        const cnt = new Map();
        for (const [di, dj] of N4) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const v = grid[jj * nx + ii];
          if (v >= 0) cnt.set(v, (cnt.get(v) || 0) + 1);
        }
        if (cnt.size) grid[k] = [...cnt.entries()].sort((x, y) => y[1] - x[1])[0][0];
      }
    if (!changed) break;
  }
}

/** 화면·워커 공통: 외곽 설정에 따라 문제를 만든다. */
export function buildProblem(unit, { area = null, outline = { mode: 'orig' }, outlineFree = false, syntaxPrefs = [] } = {}) {
  let P;
  if (outline.mode === 'mask') P = setupMask(unit, outline.mask, outline);
  else {
    const u2 = outline.tf ? transformUnit(unit, outline.tf) : unit;
    P = setup(u2, { area, margin: outlineFree ? MARGIN : 0 });
  }
  P.outlineFree = outlineFree;
  P.syntaxPrefs = syntaxPrefs;
  return P;
}

/**
 * 초기 배치: 제약 성장(constrained growth, Lopes 외 2010).
 * 1) 씨앗(기준 실 중심에서 jitter만큼 옮김)에서 직사각형으로 한 줄씩 키운다(모자란 실부터).
 * 2) 더 못 키우면 줄의 일부(연속 칸)만 넓혀 ㄱ자로 키운다.
 * 3) 남은 칸은 가장 많이 맞닿은 이웃 실에 준다.
 * jitter 0이면 기준 세대 배치를 그대로 쓴다.
 */
export function initial(P, seed = 1, jitter = 0.5) {
  const { nx, ny, grid, rooms, movable, target } = P;
  const r = rng(seed);
  const a = Int16Array.from(grid);
  if (jitter <= 0) return a;
  const freeCells = [];
  for (let k = 0; k < a.length; k++) if (a[k] >= 0 && !rooms[a[k]].fixed) {
    freeCells.push(k);
    a[k] = -2;
  }
  const center = {};
  for (const k of movable) center[k] = [0, 0, 0];
  for (let k = 0; k < grid.length; k++) if (center[grid[k]]) {
    center[grid[k]][0] += k % nx;
    center[grid[k]][1] += Math.floor(k / nx);
    center[grid[k]][2]++;
  }
  const box = {};
  const size = {};
  const taken = new Set();
  for (const k of [...movable].sort(() => r() - 0.5)) {
    const [cx, cy, n] = center[k];
    // 공용 실(거실·주방·복도)은 현관과 이어져야 하므로 씨앗을 덜 옮긴다.
    const jj = PUBLIC.has(rooms[k].type) ? jitter * 0.3 : jitter;
    const tx = cx / n + (r() - 0.5) * jj * nx;
    const ty = cy / n + (r() - 0.5) * jj * ny;
    let best = null;
    let bd = Infinity;
    // 새 외곽에서는 현관 씨앗을 바깥(발코니 아님)에 닿은 칸에 둔다.
    const needOut = P.custom && rooms[k].type === '현관';
    const touchesOut = (c) => N4.some(([di, dj]) => {
      const ii = (c % nx) + di;
      const jj = Math.floor(c / nx) + dj;
      return ii < 0 || jj < 0 || ii >= nx || jj >= ny || grid[jj * nx + ii] === -1;
    });
    for (const c of freeCells) {
      if (taken.has(c) || (needOut && !touchesOut(c))) continue;
      const d = (c % nx - tx) ** 2 + (Math.floor(c / nx) - ty) ** 2;
      if (d < bd) ((bd = d), (best = c));
    }
    taken.add(best);
    a[best] = k;
    box[k] = [best % nx, Math.floor(best / nx), best % nx, Math.floor(best / nx)];
    size[k] = 1;
  }
  const empty = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && a[j * nx + i] === -2;
  const strip = (k, dir) => {
    const [x0, y0, x1, y1] = box[k];
    const cells = [];
    if (dir === 0) for (let j = y0; j <= y1; j++) cells.push([x1 + 1, j]);
    if (dir === 1) for (let j = y0; j <= y1; j++) cells.push([x0 - 1, j]);
    if (dir === 2) for (let i = x0; i <= x1; i++) cells.push([i, y1 + 1]);
    if (dir === 3) for (let i = x0; i <= x1; i++) cells.push([i, y0 - 1]);
    return cells;
  };
  const grow = (k, cells, dir, full) => {
    for (const [i, j] of cells) a[j * nx + i] = k;
    size[k] += cells.length;
    if (full) {
      const b = box[k];
      if (dir === 0) b[2]++;
      if (dir === 1) b[0]--;
      if (dir === 2) b[3]++;
      if (dir === 3) b[1]--;
    }
  };
  // 1) 직사각형 성장
  const active = new Set(movable);
  let guard = 0;
  while (active.size && guard++ < 100000) {
    let k = null;
    let q = Infinity;
    for (const m of active) if (size[m] / target[m] < q) ((q = size[m] / target[m]), (k = m));
    if (size[k] >= target[k]) {
      active.delete(k);
      continue;
    }
    const [x0, y0, x1, y1] = box[k];
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const dirs = [0, 1, 2, 3].filter((d) => strip(k, d).every(([i, j]) => empty(i, j)));
    if (!dirs.length) {
      active.delete(k);
      continue;
    }
    // 가로세로 비율이 1:2를 넘지 않게: 짧은 변 쪽으로 늘리는 방향 우선
    dirs.sort((d1, d2) => ((d1 < 2 ? w : h) - (d2 < 2 ? w : h)) || r() - 0.5);
    grow(k, strip(k, dirs[0]), dirs[0], true);
  }
  // 2) ㄱ자 성장: 줄의 비어 있는 연속 칸만
  const minRun = (k) => Math.max(2, Math.round((MIN_WIDTH[rooms[k].type] ?? 1) / P.cellM));
  guard = 0;
  let progress = true;
  while (progress && guard++ < 20000) {
    progress = false;
    for (const k of [...movable].sort((u, v) => size[u] / target[u] - size[v] / target[v])) {
      if (size[k] >= target[k] * 1.05) continue;
      let best = null;
      for (let d = 0; d < 4; d++) {
        const cells = strip(k, d);
        let run = [];
        for (const c of [...cells, null]) {
          if (c && empty(c[0], c[1])) run.push(c);
          else {
            if (run.length >= minRun(k) && (!best || run.length > best.cells.length)) best = { d, cells: run };
            run = [];
          }
        }
      }
      if (best) {
        // 상자 밖으로 자란 칸: 이후 직사각형 판정에서 빠지므로 상자를 넓히지 않는다.
        grow(k, best.cells, best.d, best.cells.length === strip(k, best.d).length);
        progress = true;
      }
    }
  }
  // 3) 남은 칸은 가장 많이 맞닿은 이웃 실로
  for (let pass = 0; pass < 200 && a.includes(-2); pass++)
    for (let k = 0; k < a.length; k++) if (a[k] === -2) {
      const i = k % nx;
      const j = Math.floor(k / nx);
      const cnt = new Map();
      for (const [di, dj] of N4) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const v = a[jj * nx + ii];
        if (v >= 0 && !rooms[v].fixed) cnt.set(v, (cnt.get(v) || 0) + 1 - size[v] / target[v] / 10);
      }
      if (cnt.size) a[k] = [...cnt.entries()].sort((x, y) => y[1] - x[1])[0][0];
    }
  // 고정 실에 둘러싸여 닿지 못한 틈은 바깥으로 본다.
  for (let k = 0; k < a.length; k++) if (a[k] === -2) a[k] = -1;
  return a;
}

function frontierOf(a, nx, ny, room) {
  const out = [];
  for (let k = 0; k < a.length; k++) {
    if (a[k] !== -2) continue;
    const i = k % nx;
    const j = Math.floor(k / nx);
    for (const [di, dj] of N4) {
      const ii = i + di;
      const jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < nx && jj < ny && a[jj * nx + ii] === room) {
        out.push(k);
        break;
      }
    }
  }
  return out;
}

/** 실 하나의 통계: 칸 수, 둘레, 꼭짓점, 얇은 칸, 창 낼 수 있는 바깥 벽 길이(칸 변 수), 이웃 실과 맞닿은 변 수. */
export function roomStats(a, P, room) {
  const { nx, ny, rooms } = P;
  let n = 0;
  let perim = 0;
  let ext = 0;
  let out = 0;
  const touch = new Map();
  let x0 = nx;
  let y0 = ny;
  let x1 = -1;
  let y1 = -1;
  for (let k = 0; k < a.length; k++) {
    if (a[k] !== room) continue;
    n++;
    const i = k % nx;
    const j = Math.floor(k / nx);
    if (i < x0) x0 = i;
    if (i > x1) x1 = i;
    if (j < y0) y0 = j;
    if (j > y1) y1 = j;
    for (const [di, dj] of N4) {
      const ii = i + di;
      const jj = j + dj;
      const v = ii < 0 || jj < 0 || ii >= nx || jj >= ny ? -1 : a[jj * nx + ii];
      if (v === room) continue;
      perim++;
      if (v < 0 || OUTDOOR.has(rooms[v].type)) ext++;
      if (v < 0) out++;
      if (v >= 0) touch.set(v, (touch.get(v) || 0) + 1);
    }
  }
  if (!n) return { n: 0, perim: 0, corners: 0, thin: 0, ext: 0, out: 0, touch, bbox: null };
  // 꼭짓점: 2×2 창에서 실 칸이 1개·3개면 1, 대각선 2개면 2
  let corners = 0;
  for (let j = y0 - 1; j <= y1; j++)
    for (let i = x0 - 1; i <= x1; i++) {
      const q = (ii, jj) => (ii >= 0 && jj >= 0 && ii < nx && jj < ny && a[jj * nx + ii] === room ? 1 : 0);
      const tl = q(i, j);
      const tr = q(i + 1, j);
      const bl = q(i, j + 1);
      const br = q(i + 1, j + 1);
      const s = tl + tr + bl + br;
      if (s === 1 || s === 3) corners++;
      else if (s === 2 && tl === br) corners += 2;
    }
  // 얇은 칸
  const minW = Math.max(1, Math.round((MIN_WIDTH[rooms[room].type] ?? 1) / P.cellM));
  let thin = 0;
  for (let j = y0; j <= y1; j++)
    for (let i = x0; i <= x1; i++) {
      if (a[j * nx + i] !== room) continue;
      let h = 1;
      for (let ii = i - 1; ii >= 0 && a[j * nx + ii] === room; ii--) h++;
      for (let ii = i + 1; ii < nx && a[j * nx + ii] === room; ii++) h++;
      if (h >= minW) {
        let v = 1;
        for (let jj = j - 1; jj >= 0 && a[jj * nx + i] === room; jj--) v++;
        for (let jj = j + 1; jj < ny && a[jj * nx + i] === room; jj++) v++;
        if (v >= minW) continue;
      }
      thin++;
    }
  return { n, perim, corners, thin, ext, out, touch, bbox: [x0, y0, x1, y1] };
}

export const WEIGHTS = { area: 6, compact: 1.2, corner: 1.2, thin: 3, adj: 1.5, window: 0.6, access: 10, through: 1.5, entry: 6, outline: 0.8, syntax: 4 };

/** 모양 자유도: 'rect' 직사각형 위주, 'L' ㄱ자까지, 'free' ㄷ자·자유형. */
export const FREEDOM = {
  rect: { K: 4, Kout: 6, compact: 1.6, label: '직사각형 위주' },
  L: { K: 6, Kout: 8, compact: 0.8, label: 'ㄱ자까지' },
  free: { K: 8, Kout: 12, compact: 0.35, label: 'ㄷ자·자유형' },
};

/**
 * 접근(맞닿은 길이로 근사, 문 폭 0.9m 이상 맞닿으면 문을 낼 수 있다고 봄). 1.5㎡ 미만 고정 실은 뺀다.
 * - unreach: 현관에서 어떤 실을 거쳐도 갈 수 없는 실
 * - through: 공용 실(현관·거실·주방·기타)에 닿지 않아 침실을 지나야 하는 실(드레스룸·화장실·기타는 침실을 거쳐도 됨)
 * 원본 Sample도 침실 안쪽 수납, 드레스룸을 거치는 욕실 같은 구조가 있어 이 정도로 느슨하게 본다.
 */
export function access(P, S) {
  const doorCells = Math.ceil(0.9 / P.cellM);
  const live = P.rooms.filter((r) => S[r.k]?.n && !OUTDOOR.has(r.type) && !(r.fixed && S[r.k].n * P.sx * P.sy < 1.5));
  const t = (a, b) => S[a.k]?.touch.get(b.k) || 0;
  const reach = new Set(live.filter((r) => r.type === '현관').map((r) => r.k));
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of live) if (!reach.has(r.k) && live.some((q) => reach.has(q.k) && t(r, q) >= doorCells)) ((reach.add(r.k)), (grew = true));
  }
  const hubs = live.filter((r) => PUBLIC.has(r.type) && reach.has(r.k));
  const through = live.filter((r) => reach.has(r.k) && !PUBLIC.has(r.type) && !['드레스룸', '화장실'].includes(r.type) && !hubs.some((q) => t(r, q) >= doorCells));
  return { unreach: live.filter((r) => !reach.has(r.k)).map((r) => r.k), through: through.map((r) => r.k) };
}
export const unreachableRooms = (P, S) => access(P, S).unreach;

/**
 * 공간구문(평가 모델과 같은 정의): 실 = 노드, 0.6m(2칸) 이상 맞닿으면 링크, 1.5㎡ 미만 고정 실(덕트)은 빼고,
 * 현관에 세대 밖(외부) 노드를 붙인다(Byun & Choi 2016의 규약). 통합도 = 1/RRA(Hillier & Hanson 1984).
 * 반환 { nodes: [{ k, type, depth, integration }], edges, livingBedroomRatio, kitchenBedroomRatio, genotypeTau, privacyDepthGap }
 */
export function syntaxOf(P, S) {
  const link = Math.max(2, Math.ceil(0.6 / P.cellM));
  const live = P.rooms.filter((r) => S[r.k]?.n && !(r.fixed && r.type !== '현관' && !OUTDOOR.has(r.type) && S[r.k].n * P.sx * P.sy < 1.5));
  const idx = new Map(live.map((r, i) => [r.k, i]));
  const adj = live.map(() => []);
  const edges = [];
  live.forEach((r, i) => {
    for (const [q, c] of S[r.k].touch) {
      const j = idx.get(q);
      if (j === undefined || j <= i || c < link) continue;
      adj[i].push(j);
      adj[j].push(i);
      edges.push([r.k, q]);
    }
  });
  const ent = live.findIndex((r) => r.type === '현관');
  const ext = live.length;
  const sAdj = [...adj, []];
  if (ent >= 0) {
    sAdj[ent].push(ext);
    sAdj[ext].push(ent);
  }
  const m = nodeMetrics(sAdj);
  const depth = ent >= 0 ? bfs(sAdj, ent) : sAdj.map(() => Infinity);
  const nodes = live.map((r, i) => ({ k: r.k, type: r.type, depth: depth[i], integration: m[i].integration }));
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const integOf = (t) => mean(nodes.filter((nd) => nd.type === t && Number.isFinite(nd.integration)).map((nd) => nd.integration));
  const bedI = integOf('침실');
  const livingI = Math.max(-Infinity, ...nodes.filter((nd) => nd.type === '거실' && Number.isFinite(nd.integration)).map((nd) => nd.integration));
  const geno = GENOTYPE_ORDER.map(integOf);
  const depthOf = (types) => mean(nodes.filter((nd) => types.includes(nd.type) && Number.isFinite(nd.depth)).map((nd) => nd.depth));
  const priv = depthOf(['침실', '드레스룸']);
  const pub = depthOf(['거실', '주방']);
  return {
    nodes,
    edges,
    livingBedroomRatio: bedI && Number.isFinite(livingI) ? livingI / bedI : null,
    kitchenBedroomRatio: bedI && integOf('주방') !== null ? integOf('주방') / bedI : null,
    genotypeTau: geno.every((v) => v !== null) ? kendallTauB(geno, GENOTYPE_ORDER.map((_, k) => GENOTYPE_ORDER.length - k)) : null,
    privacyDepthGap: priv !== null && pub !== null ? priv - pub : null,
  };
}

/** 공간구문 선호의 벌점: 문헌 범위 아래로 떨어진 만큼(경첩). */
export const SYNTAX_TARGETS = {
  livingCentral: { label: '거실 중심형', vars: ['livingBedroomRatio', 'genotypeTau'], why: '거실/침실 통합도 비 ≥ 1.56(Byun & Choi 2016 거실 중심 군집 하한), 유전형 τ → 1(Hillier 외 1987)' },
  privacy: { label: '사생활', vars: ['privacyDepthGap'], why: '공·사 깊이 차 ≥ 1(침실이 거실·주방보다 한 단계 이상 깊게; Ham & Lee 2017, Park 외 2024)' },
  kitchenLink: { label: '대면형 주방', vars: ['kitchenBedroomRatio'], why: '주방/침실 통합도 비 ≥ 1.04(Byun & Choi 2016 범위 하한)' },
};
// 목표값: 문헌 범위의 가운데 쪽(하한만 넘기면 벌점이 0이 되어 효과가 거의 없었음, 실측)
export const SYNTAX_GOAL = { lbr: 1.9, gap: 1.5, kbr: 1.3 };
export function syntaxPenalty(sx, prefs) {
  let p = 0;
  if (prefs.includes('livingCentral')) {
    const r = sx.livingBedroomRatio;
    p += r === null ? 1 : Math.max(0, SYNTAX_GOAL.lbr - r) / SYNTAX_GOAL.lbr;
    p += sx.genotypeTau === null ? 0.5 : (1 - sx.genotypeTau) / 2;
  }
  if (prefs.includes('privacy')) p += sx.privacyDepthGap === null ? 1 : Math.max(0, SYNTAX_GOAL.gap - sx.privacyDepthGap) / SYNTAX_GOAL.gap;
  if (prefs.includes('kitchenLink')) {
    const r = sx.kitchenBedroomRatio;
    p += r === null ? 1 : Math.max(0, SYNTAX_GOAL.kbr - r) / SYNTAX_GOAL.kbr;
  }
  return p;
}

/** 전체 에너지와 항목별 값. */
/** 세대 외곽(실내 칸 묶음)의 꼭짓점 수. */
export function outlineCorners(a, P) {
  const { nx, ny, rooms } = P;
  const q = (i, j) => (i >= 0 && j >= 0 && i < nx && j < ny && a[j * nx + i] >= 0 && !OUTDOOR.has(rooms[a[j * nx + i]].type) ? 1 : 0);
  let c = 0;
  for (let j = -1; j < ny; j++)
    for (let i = -1; i < nx; i++) {
      const tl = q(i, j);
      const tr = q(i + 1, j);
      const bl = q(i, j + 1);
      const br = q(i + 1, j + 1);
      const s = tl + tr + bl + br;
      if (s === 1 || s === 3) c++;
      else if (s === 2 && tl === br) c += 2;
    }
  return c;
}

export function energy(a, P, freedom = 'L', stats = null, outline = null) {
  const F = FREEDOM[freedom];
  const S = stats || {};
  for (const k of P.movable) S[k] ||= roomStats(a, P, k);
  for (const r of P.rooms) if (r.fixed && !S[r.k]) S[r.k] = roomStats(a, P, r.k);
  const t = { area: 0, compact: 0, corner: 0, thin: 0, adj: 0, window: 0, access: 0, through: 0, entry: 0, outline: 0, syntax: 0 };
  const doorCells = Math.ceil(0.9 / P.cellM);
  for (const k of P.movable) {
    const s = S[k];
    if (!s.n) {
      t.area += 10;
      continue;
    }
    t.area += ((s.n - P.target[k]) / P.target[k]) ** 2;
    t.compact += s.perim / (4 * Math.sqrt(s.n)) - 1;
    t.corner += Math.max(0, s.corners - F.K);
    t.thin += s.thin / s.n;
    if (NEEDS_WINDOW.has(P.rooms[k].type)) t.window += Math.max(0, 2.0 - s.ext * P.cellM);
  }
  for (const [p, q] of P.need) {
    const c = (S[p]?.touch.get(q) || 0);
    if (c < doorCells) t.adj += 1;
  }
  const ac = access(P, S);
  t.access = ac.unreach.length;
  t.through = ac.through.length;
  // 새 외곽에서는 현관도 움직이므로 바깥(복도 쪽)에 문 폭 이상 닿아야 한다.
  if (P.custom) {
    const ent = P.rooms.find((r) => r.type === '현관');
    if (ent && (S[ent.k]?.out || 0) < doorCells) t.entry = 1;
  }
  let sx = null;
  if (P.syntaxPrefs?.length) {
    sx = syntaxOf(P, S);
    t.syntax = syntaxPenalty(sx, P.syntaxPrefs);
  }
  let oc = null;
  if (P.outlineFree) {
    oc = outline ?? outlineCorners(a, P);
    t.outline = Math.max(0, oc - F.Kout);
  }
  const w = { ...WEIGHTS, compact: F.compact };
  const total = Object.keys(t).reduce((s, k) => s + w[k] * t[k], 0);
  return { total, terms: t, weights: w, stats: S, outlineCorners: oc, syntax: sx };
}

/** 실 room이 한 덩어리이고 칸 수가 size인가. */
function connected(a, P, room, size) {
  const { nx, ny } = P;
  const start = a.indexOf(room);
  if (start < 0) return size === 0;
  const seen = new Uint8Array(a.length);
  seen[start] = 1;
  const q = [start];
  let cnt = 1;
  while (q.length) {
    const k = q.pop();
    const i = k % nx;
    const j = Math.floor(k / nx);
    for (const [di, dj] of N4) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const m = jj * nx + ii;
      if (!seen[m] && a[m] === room) {
        seen[m] = 1;
        q.push(m);
        cnt++;
      }
    }
  }
  return cnt === size;
}

/** 칸 c를 실 from에서 뺐을 때 from이 한 덩어리로 남는가. */
function staysConnected(a, P, c, from, size) {
  const { nx, ny } = P;
  const i0 = c % nx;
  const j0 = Math.floor(c / nx);
  let start = -1;
  for (const [di, dj] of N4) {
    const ii = i0 + di;
    const jj = j0 + dj;
    if (ii >= 0 && jj >= 0 && ii < nx && jj < ny && a[jj * nx + ii] === from) {
      start = jj * nx + ii;
      break;
    }
  }
  if (start < 0) return false;
  const seen = new Set([start, c]);
  const q = [start];
  let cnt = 1;
  while (q.length) {
    const k = q.pop();
    const i = k % nx;
    const j = Math.floor(k / nx);
    for (const [di, dj] of N4) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const m = jj * nx + ii;
      if (!seen.has(m) && a[m] === from) {
        seen.add(m);
        q.push(m);
        cnt++;
      }
    }
  }
  return cnt === size - 1;
}

/**
 * 담금질. 반환: { assign, history:[{it, E, terms}], snaps:[{it, assign}], energy }
 * steps: 이동 시도 수, T0→T1: 온도(지수 감소)
 */
export function anneal(P, { seed = 1, jitter = 0.5, freedom = 'L', steps = 30000, T0 = 1.5, T1 = 0.005, snapEvery = null, onProgress = null } = {}) {
  const r = rng(seed * 7919 + 13);
  const a = initial(P, seed, jitter);
  const { nx, ny, rooms } = P;
  let cur = energy(a, P, freedom);
  let best = { E: cur.total, a: Int16Array.from(a) };
  const history = [{ it: 0, E: cur.total, terms: { ...cur.terms } }];
  const snaps = [{ it: 0, assign: Int16Array.from(a), E: cur.total }];
  const every = snapEvery || Math.max(1, Math.floor(steps / 40));
  // 경계 칸 후보
  const free = [];
  const border = (k) => k % nx === 0 || k % nx === nx - 1 || k < nx || k >= nx * (ny - 1);
  if (P.outlineFree) {
    for (let k = 0; k < a.length; k++) if (!border(k) && !(a[k] >= 0 && rooms[a[k]].fixed)) free.push(k);
  } else for (let k = 0; k < a.length; k++) if (a[k] >= 0 && !rooms[a[k]].fixed) free.push(k);
  let accepted = 0;
  const nbrs = (k) => {
    const i = k % nx;
    const j = Math.floor(k / nx);
    const out = [];
    for (const [di, dj] of N4) {
      const ii = i + di;
      const jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < nx && jj < ny) out.push(jj * nx + ii);
    }
    return out;
  };
  const reachesBorder = (start, skip) => {
    const seen = new Set([start, skip]);
    const q = [start];
    while (q.length) {
      const k = q.pop();
      if (border(k)) return true;
      for (const m of nbrs(k)) if (!seen.has(m) && a[m] === -1) (seen.add(m), q.push(m));
    }
    return false;
  };
  const tryAccept = (next, T, undo) => {
    const dE = next.total - cur.total;
    if (dE <= 0 || r() < Math.exp(-dE / T)) {
      cur = next;
      accepted++;
      if (cur.total < best.E) best = { E: cur.total, a: Int16Array.from(a) };
    } else undo();
  };
  const restat = (changed) => {
    const stats = { ...cur.stats };
    for (const k of changed) stats[k] = roomStats(a, P, k);
    for (const k of Object.keys(stats)) {
      const kk = Number(k);
      if (!changed.includes(kk) && changed.some((c) => stats[kk].touch.has(c))) stats[kk] = roomStats(a, P, kk);
    }
    return stats;
  };
  for (let it = 1; it <= steps; it++) {
    const T = T0 * (T1 / T0) ** (it / steps);
    // 외곽 이동(외곽도 다듬기일 때 25%): 바깥 벽 칸을 실에서 빼거나(-1) 바깥 칸을 이웃 실에 붙인다.
    if (P.outlineFree && r() < 0.25) {
      for (let tries = 0; tries < 40; tries++) {
        const c = free[Math.floor(r() * free.length)];
        const ns = nbrs(c);
        if (ns.some((m) => a[m] >= 0 && rooms[a[m]].fixed && OUTDOOR.has(rooms[a[m]].type))) continue; // 발코니에 붙은 벽은 그대로
        if (a[c] >= 0) {
          const from = a[c];
          if (rooms[from].fixed || !ns.some((m) => a[m] === -1)) continue;
          const sFrom = cur.stats[from];
          if (sFrom.n <= 4) break;
          a[c] = -1;
          if (!connected(a, P, from, sFrom.n - 1)) {
            a[c] = from;
            break;
          }
          const next = energy(a, P, freedom, restat([from]));
          tryAccept(next, T, () => (a[c] = from));
        } else {
          const opts = ns.filter((m) => a[m] >= 0 && !rooms[a[m]].fixed).map((m) => a[m]);
          if (!opts.length) continue;
          const to = opts[Math.floor(r() * opts.length)];
          a[c] = to;
          if (ns.some((m) => a[m] === -1 && !reachesBorder(m, c))) {
            a[c] = -1; // 바깥에 갇힌 구멍이 생김
            break;
          }
          const next = energy(a, P, freedom, restat([to]));
          tryAccept(next, T, () => (a[c] = -1));
        }
        break;
      }
      if (it % every === 0 || it === steps) {
        history.push({ it, E: cur.total, terms: { ...cur.terms }, T });
        snaps.push({ it, assign: Int16Array.from(a), E: cur.total });
        if (onProgress) onProgress(it / steps);
      }
      continue;
    }
    // 이동: 80%는 벽 밀기(맞닿은 벽 한 줄을 통째로 한 칸), 20%는 칸 하나 넘기기
    let c = -1;
    let from = -1;
    let to = -1;
    let dir = null;
    for (let tries = 0; tries < 40 && to < 0; tries++) {
      c = free[Math.floor(r() * free.length)];
      from = a[c];
      if (from < 0 || rooms[from].fixed) continue;
      const i = c % nx;
      const j = Math.floor(c / nx);
      const d = N4[Math.floor(r() * 4)];
      const ii = i + d[0];
      const jj = j + d[1];
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const v = a[jj * nx + ii];
      if (v >= 0 && v !== from && !rooms[v].fixed) ((to = v), (dir = d));
    }
    if (to >= 0) {
      let cells = [c];
      if (r() < 0.8) {
        // 벽 방향(dir에 수직)으로 같은 관계(이쪽 from, 저쪽 to)가 이어지는 칸들
        const [pi, pj] = dir[0] ? [0, 1] : [1, 0];
        const i0 = c % nx;
        const j0 = Math.floor(c / nx);
        const ok = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && a[j * nx + i] === from && a[(j + dir[1]) * nx + (i + dir[0])] === to && i + dir[0] >= 0 && i + dir[0] < nx && j + dir[1] >= 0 && j + dir[1] < ny;
        for (let s2 = 1; ok(i0 + pi * s2, j0 + pj * s2); s2++) cells.push((j0 + pj * s2) * nx + i0 + pi * s2);
        for (let s2 = 1; ok(i0 - pi * s2, j0 - pj * s2); s2++) cells.push((j0 - pj * s2) * nx + i0 - pi * s2);
      }
      const sFrom = cur.stats[from];
      if (sFrom.n > cells.length + 1) {
        for (const k of cells) a[k] = to;
        if (connected(a, P, from, sFrom.n - cells.length)) {
          const stats = { ...cur.stats };
          stats[from] = roomStats(a, P, from);
          stats[to] = roomStats(a, P, to);
          for (const k of Object.keys(stats)) {
            const kk = Number(k);
            if (kk !== from && kk !== to && (stats[kk].touch.has(from) || stats[kk].touch.has(to))) stats[kk] = roomStats(a, P, kk);
          }
          const next = energy(a, P, freedom, stats);
          const dE = next.total - cur.total;
          if (dE <= 0 || r() < Math.exp(-dE / T)) {
            cur = next;
            accepted++;
            if (cur.total < best.E) best = { E: cur.total, a: Int16Array.from(a) };
          } else for (const k of cells) a[k] = from;
        } else for (const k of cells) a[k] = from;
      }
    }
    if (it % every === 0 || it === steps) {
      history.push({ it, E: cur.total, terms: { ...cur.terms }, T });
      snaps.push({ it, assign: Int16Array.from(a), E: cur.total });
      if (onProgress) onProgress(it / steps);
    }
  }
  const final = energy(best.a, P, freedom);
  return { assign: best.a, energy: final, history, snaps, accepted, steps };
}

/** 칸 묶음 → 직교 다각형(외곽선, 꼭짓점만). 단위 m. 구멍이 있으면 여러 고리. */
export function roomPolygons(a, P, room) {
  const { nx, ny, sx, sy } = P;
  const edges = new Map(); // "x,y" → [x2,y2] 방향 있는 경계 변(실이 왼쪽)
  const add = (x1, y1, x2, y2) => edges.set(`${x1},${y1}`, [...(edges.get(`${x1},${y1}`) || []), [x2, y2]]);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (a[j * nx + i] !== room) continue;
      const o = (ii, jj) => ii < 0 || jj < 0 || ii >= nx || jj >= ny || a[jj * nx + ii] !== room;
      if (o(i, j - 1)) add(i, j, i + 1, j);
      if (o(i + 1, j)) add(i + 1, j, i + 1, j + 1);
      if (o(i, j + 1)) add(i + 1, j + 1, i, j + 1);
      if (o(i - 1, j)) add(i, j + 1, i, j);
    }
  const loops = [];
  while (edges.size) {
    const [startKey, list] = edges.entries().next().value;
    let [x, y] = startKey.split(',').map(Number);
    const loop = [[x, y]];
    let nextPt = list[0];
    const take = (key, pt) => {
      const l = edges.get(key).filter((p) => p !== pt);
      if (l.length) edges.set(key, l);
      else edges.delete(key);
    };
    take(startKey, nextPt);
    let guard = 0;
    while (guard++ < 100000) {
      [x, y] = nextPt;
      if (`${x},${y}` === startKey) break;
      loop.push([x, y]);
      const l = edges.get(`${x},${y}`);
      if (!l) break;
      nextPt = l[0];
      take(`${x},${y}`, nextPt);
    }
    // 같은 직선 위 점 지우기
    const pts = loop.filter((p, idx) => {
      const pr = loop[(idx - 1 + loop.length) % loop.length];
      const nx2 = loop[(idx + 1) % loop.length];
      return !((pr[0] === p[0] && p[0] === nx2[0]) || (pr[1] === p[1] && p[1] === nx2[1]));
    });
    loops.push(pts.map(([gx, gy]) => [+(gx * sx).toFixed(3), +(gy * sy).toFixed(3)]));
  }
  return loops;
}

/** 모양 이름: 꼭짓점 수로. */
export function shapeName(corners) {
  if (corners <= 4) return '직사각형';
  if (corners === 6) return 'ㄱ자';
  if (corners === 8) return 'ㄷ자·계단형';
  return `${corners}각형`;
}

/** 문·창: 문 그래프(공용 실 중심)와 바깥 벽 창. 단위 m 선분. */
export function openings(a, P) {
  const { nx, ny, sx, sy, rooms } = P;
  const segs = (p, q) => {
    // 실 p와 q(-1 바깥)가 맞닿은 칸 변들을 직선 구간으로 묶는다.
    const H = new Map(); // 가로 경계 y → [x...]
    const V = new Map();
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i < nx; i++) {
        const up = j > 0 ? a[(j - 1) * nx + i] : -1;
        const dn = j < ny ? a[j * nx + i] : -1;
        if ((up === p && dn === q) || (up === q && dn === p)) H.set(j, [...(H.get(j) || []), i]);
      }
    for (let i = 0; i <= nx; i++)
      for (let j = 0; j < ny; j++) {
        const lf = i > 0 ? a[j * nx + i - 1] : -1;
        const rt = i < nx ? a[j * nx + i] : -1;
        if ((lf === p && rt === q) || (lf === q && rt === p)) V.set(i, [...(V.get(i) || []), j]);
      }
    const runs = [];
    for (const [y, xs] of H) {
      xs.sort((u, v) => u - v);
      let s = xs[0];
      for (let k = 1; k <= xs.length; k++)
        if (k === xs.length || xs[k] !== xs[k - 1] + 1) {
          runs.push({ v: false, x1: s * sx, y1: y * sy, x2: (xs[k - 1] + 1) * sx, y2: y * sy });
          s = xs[k];
        }
    }
    for (const [x, ys] of V) {
      ys.sort((u, v) => u - v);
      let s = ys[0];
      for (let k = 1; k <= ys.length; k++)
        if (k === ys.length || ys[k] !== ys[k - 1] + 1) {
          runs.push({ v: true, x1: x * sx, y1: s * sy, x2: x * sx, y2: (ys[k - 1] + 1) * sy });
          s = ys[k];
        }
    }
    return runs.map((s) => ({ ...s, len: Math.hypot(s.x2 - s.x1, s.y2 - s.y1) })).sort((u, v) => v.len - u.len);
  };
  const present = rooms.filter((r) => a.includes(r.k)).map((r) => r.k);
  const out = [];
  const links = [];
  const door = (p, q, kind, width = 0.9) => {
    const s = segs(p, q)[0];
    if (!s || s.len < Math.min(width, 0.8)) return false;
    const w = kind === 'opening' ? Math.min(s.len - 0.1, 1.8) : Math.min(width, s.len - 0.1);
    const off = kind === 'opening' ? (s.len - w) / 2 : Math.min(0.15, s.len - w);
    const ux = (s.x2 - s.x1) / s.len;
    const uy = (s.y2 - s.y1) / s.len;
    out.push({ kind, x1: s.x1 + ux * off, y1: s.y1 + uy * off, x2: s.x1 + ux * (off + w), y2: s.y1 + uy * (off + w), v: s.v, from: q, to: p });
    links.push([p, q]);
    return true;
  };
  const typeOf = (k) => rooms[k].type;
  // 현관문: 현관의 가장 긴 바깥 벽
  const ent = present.find((k) => typeOf(k) === '현관');
  if (ent !== undefined) {
    // 바깥 벽이 없으면(공용 복도 쪽에 덕트 등 작은 고정 실) 그 작은 실과 맞닿은 가장 긴 변에 낸다.
    const tinyNb = present.filter((k) => rooms[k].fixed && k !== ent && !OUTDOOR.has(typeOf(k)) && a.reduce((n, v) => n + (v === k ? 1 : 0), 0) * sx * sy < 1.5);
    const s = segs(ent, -1)[0] || tinyNb.map((k) => segs(ent, k)[0]).filter(Boolean).sort((u, v) => v.len - u.len)[0];
    if (s) {
      const w = Math.min(1.0, s.len - 0.1);
      const ux = (s.x2 - s.x1) / s.len;
      const uy = (s.y2 - s.y1) / s.len;
      const off = (s.len - w) / 2;
      out.push({ kind: 'door', entry: true, x1: s.x1 + ux * off, y1: s.y1 + uy * off, x2: s.x1 + ux * (off + w), y2: s.y1 + uy * (off + w), v: s.v, from: -1, to: ent });
    }
  }
  // 1.5㎡ 미만 고정 실(덕트 등)에는 문을 내지 않는다.
  const cellsOf = (k) => a.reduce((n, v) => n + (v === k ? 1 : 0), 0);
  const live = present.filter((k) => !(rooms[k].fixed && cellsOf(k) * sx * sy < 1.5));
  // 공용 실끼리는 트기
  const pub = live.filter((k) => PUBLIC.has(typeOf(k)));
  for (let x = 0; x < pub.length; x++) for (let y = x + 1; y < pub.length; y++) door(pub[y], pub[x], 'opening');
  // 현관에서 이어진 공용 실
  const reached = new Set(ent !== undefined ? [ent] : []);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [p, q] of links) {
      if (reached.has(p) && !reached.has(q)) ((reached.add(q)), (grew = true));
      if (reached.has(q) && !reached.has(p)) ((reached.add(p)), (grew = true));
    }
  }
  const master = live.filter((k) => typeOf(k) === '침실').sort((u, v) => cellsOf(v) - cellsOf(u))[0];
  const byRun = (k, list) => list.filter((q) => q !== k).map((q) => [q, segs(k, q)[0]?.len || 0]).sort((u, v) => v[1] - u[1]).map((x) => x[0]);
  // 나머지 실: 이어진 공용 실 → (드레스룸·화장실은) 안방 → 이어지지 않은 공용 실 → 침실이 아닌 실 → 아무 실
  // 공용 실 단계에서 이어지지 못한 기타(침실 안쪽 수납 등)도 문을 받는다.
  const pending = (k) => !OUTDOOR.has(typeOf(k)) && k !== ent && !(PUBLIC.has(typeOf(k)) && reached.has(k));
  const order = [...live.filter((k) => pending(k) && typeOf(k) !== '드레스룸' && typeOf(k) !== '화장실'), ...live.filter((k) => pending(k) && (typeOf(k) === '드레스룸' || typeOf(k) === '화장실'))];
  // 현관에서 이어진 실부터 차례로 문을 낸다(공용 실 → 안방(부속실) → 이어진 아무 실).
  const left = new Set(order);
  for (let pass = 0; pass < 2; pass++)
    for (let grew = true; grew; ) {
      grew = false;
      for (const k of [...left]) {
        const t = typeOf(k);
        const ensuite = t === '드레스룸' || t === '화장실';
        const okRoom = (q) => pass === 1 || reached.has(q);
        const cand = [
          ...byRun(k, pub.filter(okRoom)),
          ...(ensuite && master !== undefined && okRoom(master) ? [master] : []),
          ...byRun(k, live.filter((q) => okRoom(q) && !OUTDOOR.has(typeOf(q)) && q !== k)),
        ];
        for (const q of cand) if (door(k, q, 'door', ensuite ? 0.8 : 0.9)) {
          left.delete(k);
          if (reached.has(q)) reached.add(k);
          grew = true;
          break;
        }
      }
    }
  // 창: 거실·침실·주방·화장실의 가장 긴 바깥 벽, 발코니에 닿으면 발코니 문(미닫이)
  for (const k of present) {
    const t = typeOf(k);
    if (!['거실', '침실', '주방', '화장실', '다목적공간', '드레스룸'].includes(t)) continue;
    const balc = present.filter((q) => OUTDOOR.has(typeOf(q)) && typeOf(q) === '발코니');
    let done = false;
    if (t === '거실' || t === '침실') for (const b of balc) {
      const s = segs(k, b)[0];
      if (s && s.len >= 1.2) {
        const w = s.len * 0.75;
        const ux = (s.x2 - s.x1) / s.len;
        const uy = (s.y2 - s.y1) / s.len;
        const off = (s.len - w) / 2;
        out.push({ kind: 'sliding', x1: s.x1 + ux * off, y1: s.y1 + uy * off, x2: s.x1 + ux * (off + w), y2: s.y1 + uy * (off + w), v: s.v, from: k, to: b });
        done = true;
        break;
      }
    }
    if (done) continue;
    const s = segs(k, -1).find((x) => !out.some((o) => o.entry && Math.abs(o.x1 - x.x1) + Math.abs(o.y1 - x.y1) < 1e-6)) || null;
    if (s && s.len >= 0.9) {
      const ratio = { 거실: 0.7, 침실: 0.55, 주방: 0.45 }[t] || 0.35;
      const w = Math.max(0.6, s.len * ratio);
      const ux = (s.x2 - s.x1) / s.len;
      const uy = (s.y2 - s.y1) / s.len;
      const off = (s.len - w) / 2;
      out.push({ kind: 'window', x1: s.x1 + ux * off, y1: s.y1 + uy * off, x2: s.x1 + ux * (off + w), y2: s.y1 + uy * (off + w), v: s.v, to: k });
    }
  }
  // 현관에서 문으로 갈 수 있는지
  const adj = new Map(present.map((k) => [k, []]));
  for (const [p, q] of links) {
    adj.get(p)?.push(q);
    adj.get(q)?.push(p);
  }
  const seen = new Set(ent !== undefined ? [ent] : []);
  const qq = ent !== undefined ? [ent] : [];
  while (qq.length) for (const n of adj.get(qq.shift()) || []) if (!seen.has(n)) (seen.add(n), qq.push(n));
  const unreachable = live.filter((k) => !seen.has(k) && !OUTDOOR.has(typeOf(k)));
  return { openings: out, unreachable };
}

/** 결과 요약: 실별 면적·모양·인접 만족. */
export function summarize(res, P) {
  const E = res.energy;
  const rooms = P.rooms
    .filter((r) => E.stats[r.k]?.n)
    .map((r) => {
      const s = E.stats[r.k];
      const m2 = s.n * P.sx * P.sy;
      const target = r.fixed ? null : P.target[r.k] * P.sx * P.sy;
      const bw = (s.bbox[2] - s.bbox[0] + 1) * P.sx;
      const bh = (s.bbox[3] - s.bbox[1] + 1) * P.sy;
      return { k: r.k, type: r.type, fixed: r.fixed, m2, target, corners: s.corners, shape: shapeName(s.corners), rect: m2 / (bw * bh), thin: s.thin / s.n, windowM: s.ext * P.cellM };
    });
  const doorCells = Math.ceil(0.9 / P.cellM);
  const need = P.need.map(([p, q]) => ({ p, q, ok: (E.stats[p]?.touch.get(q) || 0) >= doorCells }));
  return { rooms, need, total: E.total, terms: E.terms, weights: E.weights, syntax: syntaxOf(P, E.stats) };
}

// ---------- 방위와 동지 일조(자유형) ----------

/**
 * 창(바깥 창·발코니 문)마다 바깥 방향을 찾아 방위각을 정하고 실별 동지 일조를 낸다(장애물 없음).
 * 도면 아래(+y) = 앞쪽 = front, 위(−y) = front + 180, 오른쪽(+x) = front − 90, 왼쪽(−x) = front + 90.
 * 반환 [{ k, type, faces:[방위각], facingName, total, cont, slots, ok }] (거실·침실·주방만)
 */
export function solarFreeform(assign, P, openings, { front = 180, lat = 37.57 } = {}) {
  const { nx, ny, sx, sy, rooms } = P;
  const at = (x, y) => {
    const i = Math.floor(x / sx);
    const j = Math.floor(y / sy);
    return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : assign[j * nx + i];
  };
  const norm = (a) => ((a % 360) + 360) % 360;
  const faces = {};
  for (const o of openings) {
    if (o.kind !== 'window' && o.kind !== 'sliding') continue;
    const k = o.kind === 'sliding' ? o.from : o.to;
    if (k === undefined || k === null || k < 0) continue;
    const mx = (o.x1 + o.x2) / 2;
    const my = (o.y1 + o.y2) / 2;
    const e = Math.min(sx, sy) / 2;
    let az;
    if (o.v) az = at(mx + e, my) === k ? front + 90 : front - 90; // 실이 오른쪽이면 창은 왼쪽(−x)을 본다
    else az = at(mx, my + e) === k ? front + 180 : front; // 실이 아래쪽이면 창은 위(−y)를 본다
    (faces[k] ||= []).push({ az: norm(az), len: Math.hypot(o.x2 - o.x1, o.y2 - o.y1) });
  }
  return rooms
    .filter((r) => ['거실', '침실', '주방'].includes(r.type) && faces[r.k])
    .map((r) => {
      const fs = [...faces[r.k]].sort((a, b) => b.len - a.len);
      const sun = sunHours(fs, { lat });
      return { k: r.k, type: r.type, faces: [...new Set(fs.map((f) => Math.round(f.az)))], facingName: [...new Set(fs.map((f) => dirName(f.az)))].slice(0, 2).join('·'), ...sun };
    });
}

/**
 * 안목 면적(근사): 칸 면적 − Σ(경계 변 길이 × 벽 두께의 절반). 실내–바깥·실내–발코니 = 외벽 0.2m, 실내끼리 = 내벽 0.12m.
 * 모서리에서 겹쳐 빼는 작은 넓이는 무시한다(ㄱ자 실의 오목한 모서리 등).
 */
export function netAreas(assign, P) {
  const { nx, ny, sx, sy, rooms } = P;
  const out = {};
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = assign[j * nx + i];
      if (k < 0) continue;
      const me = rooms[k];
      const o = (out[k] ||= { area: 0, cut: 0 });
      o.area += sx * sy;
      for (const [di, dj] of N4) {
        const ii = i + di;
        const jj = j + dj;
        const v = ii < 0 || jj < 0 || ii >= nx || jj >= ny ? -1 : assign[jj * nx + ii];
        if (v === k) continue;
        const edge = di ? sy : sx;
        const otherOut = v < 0 || OUTDOOR.has(rooms[v].type);
        const t = otherOut !== OUTDOOR.has(me.type) || (v < 0 && !OUTDOOR.has(me.type)) ? 0.2 : 0.12;
        o.cut += edge * (t / 2);
      }
    }
  return Object.fromEntries(Object.entries(out).map(([k, o]) => [k, Math.max(0, o.area - o.cut)]));
}

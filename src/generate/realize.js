// 후보 C-1(10-07): 정확 QUBO가 고른 그래프(정렬 틀 배치)를 틀 없이 실제 외곽 안에 다시 실현하고, 실현된 그래프가 목표와 같은지 잰다.
// 실현 = 자유형 엔진(src/freeform/engine.js)의 exactGraph 모드. 맞닿음 규약은 공유 변 길이 minLen(주 규약 0.6 m).
import { setupMask, anneal, roomStats, CELL } from '../freeform/engine.js';
import { layoutGraph } from './syntax-gen.js';

const OUTSIDE = new Set(['발코니', '실외기실']);

/** 정렬 틀 layout → 자유형 엔진의 unit(실내 실 직사각형 + 목표 간선 = layoutGraph). */
export function unitFromLayout(layout) {
  const rooms = layout.rooms.filter((r) => !OUTSIDE.has(r.type));
  const g = layoutGraph(layout);
  const idx = new Map(rooms.map((r, i) => [r.key, i]));
  const edges = [];
  for (const [a, s] of g.adj) for (const b of s) if (idx.get(a) < idx.get(b)) edges.push([idx.get(a), idx.get(b)]);
  return {
    rooms: rooms.map((r) => ({ key: r.key, type: r.type, area: r.w * r.h, polys: [[[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]] })),
    edges,
    keys: rooms.map((r) => r.key),
  };
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** 간선 집합 비교: { same, missing:[...], extra:[...] } (키 쌍 'a|b'). */
export function compareEdges(target, got) {
  const missing = [...target].filter((e) => !got.has(e));
  const extra = [...got].filter((e) => !target.has(e));
  return { same: !missing.length && !extra.length, missing, extra };
}

/**
 * 자유형 결과(assign)를 새로 재서 판정. 담금질 중 통계가 아니라 최종 칸에서 다시 센다.
 * ① 모든 실내 실이 1칸 이상(엔진은 실마다 한 덩어리를 유지) ② 현관이 외곽 바깥에 문 폭 이상 ③ 그래프 = 목표.
 */
export function judgeRealized(assign, P, unit, { minCells = P.minTouch ?? 2 } = {}) {
  const n = unit.keys.length;
  const S = {};
  for (let k = 0; k < n; k++) S[k] = roomStats(assign, P, k);
  const hasAll = unit.keys.every((_, k) => S[k].n > 0);
  const doorCells = Math.ceil(0.9 / P.cellM);
  const ent = unit.rooms.findIndex((r) => r.type === '현관');
  const entryOk = ent < 0 || S[ent].out >= doorCells;
  const got = new Set();
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (Math.max(S[a].touch.get(b) || 0, S[b].touch.get(a) || 0) >= minCells) got.add(pairKey(unit.keys[a], unit.keys[b]));
  const target = new Set(unit.edges.map(([a, b]) => pairKey(unit.keys[a], unit.keys[b])));
  const cmp = compareEdges(target, got);
  return { ok: hasAll && entryOk && cmp.same, hasAll, entryOk, ...cmp, stats: S };
}

/** 외곽 마스크 안에 layout의 그래프를 실현(시드 하나). weights: 엔진 가중치 덮어쓰기(보정 단계에서 고정). */
export function realizeInOutline(layout, mask, { seed = 1, steps = 30000, weights = null, balconySides = ['S'], minTouch = 2 } = {}) {
  const unit = unitFromLayout(layout);
  const P = setupMask(unit, mask, { balconySides, outdoorUnit: true, exactGraph: true, minTouch });
  if (weights) P.weightOverride = weights;
  const res = anneal(P, { seed, steps });
  const judge = judgeRealized(res.assign ?? res.best?.a, P, unit);
  return { unit, P, res, judge };
}

/**
 * 외곽 투영(현행 방법, projection.js)의 결과를 같은 주 규약으로 판정: 고운 칸(0.1 m)에서 공유 변 ≥ minLen이면 맞닿음.
 * pr = project(layout, fm). 반환 { ok, hasAll, oneEach, same, missing, extra }.
 */
export function judgeProjected(pr, layout, { minLen = 2 * CELL } = {}) {
  const fm = pr.fm;
  const need = Math.round(minLen / fm.cell);
  const n = pr.rooms.length;
  const cnt = new Map();
  for (let j = 0; j < fm.ny; j++)
    for (let i = 0; i < fm.nx; i++) {
      const a = pr.grid[j * fm.nx + i];
      if (a < 0) continue;
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        const ii = i + di;
        const jj = j + dj;
        if (ii >= fm.nx || jj >= fm.ny) continue;
        const b = pr.grid[jj * fm.nx + ii];
        if (b >= 0 && b !== a) {
          const k = pairKey(pr.rooms[a].key, pr.rooms[b].key);
          cnt.set(k, (cnt.get(k) || 0) + 1);
        }
      }
    }
  const got = new Set([...cnt].filter(([, c]) => c >= need).map(([k]) => k));
  const g = layoutGraph(layout);
  const target = new Set();
  for (const [a, s] of g.adj) for (const b of s) target.add(pairKey(a, b));
  const hasAll = pr.cellsOf.every((m) => m > 0);
  const oneEach = pr.connected.every(Boolean);
  const cmp = compareEdges(target, got);
  return { ok: hasAll && oneEach && cmp.same, hasAll, oneEach, ...cmp, n };
}

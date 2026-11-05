// 연구 생성기: 공간구문 최대 엔트로피(볼츠만) 모형으로 방 배치를 고른다(논문 RQ2·RQ4와 같은 계산).
// - 틀: 정렬 모드 + 복도(layout.js p.align). QUBO 칸 모형의 맞닿음이 도면과 100% 일치하는 틀이다(Confluence 09-13 7절).
// - 모형: P(배치) ∝ exp(−Σ β_j·f_j). f는 공간구문 통계량(거실·현관·주방 RRA, 공·사 깊이 차, 습식 주변화, 거실 선택도, 현관→거실 깊이),
//   β는 AI 허브 7,275장 실제 평면(거실 볼록 분할 P1)의 평균에 맞춘 값(최대 엔트로피, Jaynes 1957 p.623; Park & Newman 2004).
//   통계량 집합과 β는 analysis/gen_model_select.py가 정한다(syntax-model-data.js).
// - 풀이: 템플릿마다 배치 수가 수십~수천 개라 전부 열거해 정확한 분포를 계산한다(근사 없음). 너무 많으면 고정 시드로 표본을 뽑는다.
// - 고르기: 확률이 가장 높은 배치부터 치수를 다듬어 평면으로 만들고, 필수 규칙·좁은 실·문 동선 점검을 통과한 것 중 확률이 높은 순으로 낸다.
import { defaultParams, realize, templates } from './compare.js';
import { buildLayout, rng, sharedEdge } from './layout.js';
import { SYNTAX_MODEL } from './syntax-model-data.js';

const OUTSIDE = new Set(['발코니', '실외기실']);
const MAX_ENUM = 40000;

/** 평면(layout) → 공간 그래프 { nodes: {key: type}, adj: Map(key → Set) }. 맞닿음 = 공유 변 > 0.05 m(export-aligned-graphs와 같음). */
export function layoutGraph(layout) {
  const R = layout.rooms.filter((r) => !OUTSIDE.has(r.type));
  const nodes = Object.fromEntries(R.map((r) => [r.key, r.type]));
  const adj = new Map(R.map((r) => [r.key, new Set()]));
  for (let i = 0; i < R.length; i++)
    for (let j = i + 1; j < R.length; j++)
      if (sharedEdge(R[i], R[j]) > 0.05) {
        adj.get(R[i].key).add(R[j].key);
        adj.get(R[j].key).add(R[i].key);
      }
  return { nodes, adj };
}

/** { nodes: {name: type}, edges: [[a, b], ...] } → 같은 그래프 형식. */
export function graphOf({ nodes, edges }) {
  const adj = new Map(Object.keys(nodes).map((k) => [k, new Set()]));
  for (const [a, b] of edges) {
    adj.get(a).add(b);
    adj.get(b).add(a);
  }
  return { nodes, adj };
}

function bfs(adj, s) {
  const d = new Map([[s, 0]]);
  const q = [s];
  for (let i = 0; i < q.length; i++) for (const v of adj.get(q[i])) if (!d.has(v)) d.set(v, d.get(q[i]) + 1), q.push(v);
  return d;
}

/** 무가중 그래프의 매개 중심성(Brandes 2001), networkx betweenness_centrality(normalized=True)와 같은 정규화. */
function betweenness(adj) {
  const V = [...adj.keys()];
  const C = new Map(V.map((v) => [v, 0]));
  for (const s of V) {
    const S = [];
    const P = new Map(V.map((v) => [v, []]));
    const sigma = new Map(V.map((v) => [v, 0]));
    const dist = new Map();
    sigma.set(s, 1);
    dist.set(s, 0);
    const Q = [s];
    for (let i = 0; i < Q.length; i++) {
      const v = Q[i];
      S.push(v);
      for (const w of adj.get(v)) {
        if (!dist.has(w)) dist.set(w, dist.get(v) + 1), Q.push(w);
        if (dist.get(w) === dist.get(v) + 1) sigma.set(w, sigma.get(w) + sigma.get(v)), P.get(w).push(v);
      }
    }
    const delta = new Map(V.map((v) => [v, 0]));
    while (S.length) {
      const w = S.pop();
      for (const v of P.get(w)) delta.set(v, delta.get(v) + (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w)));
      if (w !== s) C.set(w, C.get(w) + delta.get(w));
    }
  }
  const n = V.length;
  const scale = n > 2 ? 1 / ((n - 1) * (n - 2)) : 1; // 무방향: 쌍마다 두 번 셌으므로 2/((n−1)(n−2)) × 1/2
  for (const v of V) C.set(v, C.get(v) * scale);
  return C;
}

/** 공간구문 통계량(analysis/boltzmann_rq4.py stats_profile과 같은 정의·순서). 작을수록 그 원리에 맞음. */
export function syntaxStats(g) {
  const { nodes, adj } = g;
  const V = Object.keys(nodes);
  const k = V.length;
  const of = (tp) => V.filter((v) => nodes[v] === tp);
  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
  const sp = new Map(V.map((v) => [v, bfs(adj, v)]));
  const D = (2 * (k * (Math.log2((k + 2) / 3) - 1) + 1)) / ((k - 1) * (k - 2));
  const R = new Map(V.map((v) => [v, ((2 * ([...sp.get(v).values()].reduce((s, x) => s + x, 0) / (k - 1) - 1)) / (k - 2)) / D]));
  const ent = of('현관')[0];
  const dep = sp.get(ent);
  const pub = [...of('거실'), ...of('주방')];
  const svc = [...of('현관'), ...of('화장실')];
  const high = [...of('거실'), ...of('주방'), ...of('침실')];
  const bc = betweenness(adj);
  const etc = of('기타');
  return [
    mean(of('거실').map((v) => R.get(v))),
    R.get(ent),
    -(mean(of('침실').map((v) => dep.get(v))) - mean(pub.map((v) => dep.get(v)))),
    -(mean(svc.map((v) => R.get(v))) / mean(high.map((v) => R.get(v)))),
    mean(of('주방').map((v) => R.get(v))),
    -mean(of('거실').map((v) => bc.get(v))),
    mean(of('거실').map((v) => dep.get(v))),
    etc.length ? Math.min(...etc.map((v) => R.get(v))) : Math.max(...R.values()),
  ];
}

const connected = (adj) => {
  const s = adj.keys().next().value;
  return bfs(adj, s).size === adj.size;
};

/** 연구 생성기를 쓸 수 있는 사양인가: β를 맞춘 실제 데이터의 침실 수 범위(2~4개) 안. 밖은 외삽이라 손 가중치 SA로 대신한다. */
export const syntaxSupported = (spec) => spec.bedrooms >= SYNTAX_MODEL.support.bedrooms[0] && spec.bedrooms <= SYNTAX_MODEL.support.bedrooms[1];

/** 에너지 E = Σ β_raw·f(낮을수록 실제 한국 아파트다움). 쓰지 않는 통계량은 β 0. */
export function syntaxEnergy(f) {
  return SYNTAX_MODEL.beta_raw.reduce((s, b, j) => s + (b ? b * f[j] : 0), 0);
}

function* perms(a) {
  if (a.length <= 1) {
    yield a.slice();
    return;
  }
  for (let i = 0; i < a.length; i++) for (const p of perms([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...p];
}
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
function shuffle(a, r) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/**
 * 연구 생성기. 반환: { cands(상위 count개, 확률 높은 순), best, n(평가한 배치 수), sampled, ms, model }.
 * 각 후보: realize 결과 + { syntaxE, syntaxP(열거한 배치 전체에 대한 확률), stats, template }.
 */
export function generateSyntax(spec, { seed = 1, count = 3, top = 12, refine = 30, onProgress } = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const r = rng(seed * 7919 + 1);
  const tpls = templates(spec, 'hand');
  const all = [];
  let sampled = false;
  const base = defaultParams(spec);
  tpls.forEach((t, ti) => {
    const rest = t.q.bands.front.rooms.filter((x) => x !== 'master');
    const back = t.q.bands.back.rooms;
    const total = fact(rest.length) * fact(back.length);
    let orders;
    if (total <= MAX_ENUM) {
      orders = [];
      for (const rp of perms(rest)) for (const bp of perms(back)) orders.push([rp, bp]);
    } else {
      sampled = true;
      const seen = new Set();
      orders = [];
      while (orders.length < MAX_ENUM) {
        const o = [shuffle(rest, r), shuffle(back, r)];
        const key = o[0].join() + '|' + o[1].join();
        if (!seen.has(key)) seen.add(key), orders.push(o);
      }
    }
    orders.forEach(([rp, bp], i) => {
      const front = ['master', ...rp];
      const layout = buildLayout(spec, { ...base, frontOrder: front, backOrder: bp, align: true });
      const g = layoutGraph(layout);
      if (!connected(g.adj)) return;
      const f = syntaxStats(g);
      if (f.some((x, j) => SYNTAX_MODEL.beta_raw[j] && !Number.isFinite(x))) return;
      all.push({ front, back: bp, template: t.k, f, E: syntaxEnergy(f) });
      if (onProgress && i % 500 === 0) onProgress((0.6 * (ti + i / orders.length)) / tpls.length);
    });
  });
  if (!all.length) return null;
  const Emin = Math.min(...all.map((a) => a.E));
  const Z = all.reduce((s, a) => s + Math.exp(-(a.E - Emin)), 0);
  all.sort((a, b) => a.E - b.E);
  const cands = [];
  for (const [i, a] of all.slice(0, top).entries()) {
    const c = realize(spec, { front: a.front, back: a.back }, rng(seed * 101 + i), refine, true);
    onProgress?.(0.6 + (0.4 * (i + 1)) / Math.min(top, all.length));
    if (!c) continue;
    const ok = c.unit?.validity?.valid !== false && c.narrow === 0 && c.doorIssues === 0;
    cands.push({ ...c, ok, syntaxE: a.E, syntaxP: Math.exp(-(a.E - Emin)) / Z, stats: a.f, template: a.template, order: { front: a.front, back: a.back } });
  }
  // 점검 통과 안을 확률 순으로 먼저, 그다음 통과 못 한 안을 적합성 J 순으로
  const pass = cands.filter((c) => c.ok).sort((a, b) => a.syntaxE - b.syntaxE);
  const fail = cands.filter((c) => !c.ok).sort((a, b) => b.objective - a.objective);
  const seen = new Set();
  const ranked = [...pass, ...fail].filter((c) => !seen.has(c.signature) && seen.add(c.signature));
  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return { cands: ranked.slice(0, count), best: ranked[0] || null, n: all.length, sampled, ms, model: { used: SYNTAX_MODEL.used, convention: SYNTAX_MODEL.convention } };
}

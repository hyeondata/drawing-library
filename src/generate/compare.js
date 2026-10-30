// QUBO 풀이기 비교: 풀이기마다 같은 시간 예산·같은 시드로 QUBO를 풀고, 좋은 해 몇 개를 판상형 문법으로 평면으로 풀어 낸 뒤
// 같은 연속값 다듬기 예산을 주고 적합성 J(규칙 충족 + 목표 면적 + 선호 − 감점)로 고른다. 에너지와 규칙 충족률을 함께 보고한다.
// QUBO 에너지는 J의 대리 지표라 에너지가 낮다고 J가 높다는 보장은 없다(그래서 순위상관을 함께 낸다).
import { buildLayout, rng as makeRng } from './layout.js';
import { optimize, scoreLayout, signature, snapshot } from './optimize.js';
import { buildQubo, decode, energy, frontBedCount } from './qubo.js';
import { SOLVERS, runSolver } from './solvers.js';

/** 연속값 기본 매개변수(QUBO는 순서만 정한다). */
export function defaultParams(spec) {
  const scale = Math.sqrt(spec.area / 84);
  return {
    depth: 7.4 * scale ** 0.6,
    frontShare: 0.57,
    bedWidth: 3.0,
    masterDepth: 0.85,
    suiteOrder: false,
    stackService: false,
    jitter: Array(12).fill(0),
    areaMul: Array(12).fill(1),
    backBedSide: 'near',
    entranceSide: 'right',
    livingPos: 0,
    frontBeds: 1,
    masterEnd: 'left',
  };
}

function tweak(p, spec, r) {
  const q = structuredClone(p);
  const scale = Math.sqrt(spec.area / 84) ** 0.6;
  const u = (a, b) => a + (b - a) * r();
  const k = Math.floor(r() * 5);
  if (k === 0) q.depth = Math.min(9.8 * scale, Math.max(7.0 * scale, q.depth * u(0.94, 1.06)));
  if (k === 1) q.frontShare = Math.min(0.66, Math.max(0.48, q.frontShare + u(-0.04, 0.04)));
  if (k === 2) q.bedWidth = Math.min(3.6, Math.max(2.5, q.bedWidth + u(-0.2, 0.2)));
  if (k === 3) q.masterDepth = Math.min(1, Math.max(0.6, q.masterDepth + u(-0.08, 0.08)));
  if (k === 4) q.areaMul = q.areaMul.map((m) => Math.max(0.85, Math.min(1.15, m * u(0.96, 1.04))));
  return q;
}

/** 순서(QUBO 해) 하나를 평면으로: 기본값으로 만들고 연속값을 refine번 다듬는다(모든 풀이기에 같은 횟수). */
export function realize(spec, order, r, refine) {
  const p0 = { ...defaultParams(spec), frontOrder: order.front, backOrder: order.back };
  let best = null;
  let p = p0;
  for (let i = 0; i <= refine; i++) {
    const cand = i === 0 ? p0 : tweak(p, spec, r);
    const layout = buildLayout(spec, structuredClone(cand));
    const s = scoreLayout(spec, layout);
    if (s && (!best || s.objective > best.objective)) {
      best = { layout, params: cand, ...s, signature: signature(layout) };
      p = cand;
    }
  }
  return best;
}

/** 스피어만 순위상관. */
export function spearman(a, b) {
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const r = Array(v.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const m = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = m(ra);
  const mb = m(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}

/**
 * 알고리즘들을 돌려 비교한다.
 * algorithms: SOLVERS의 key 배열 + 'model'(기존: J 직접 탐색)
 * 반환: { qubo 요약, results: [{ key, name, energy, feasible, ms, evals, best(평면 후보), samples }], rho }
 */
/**
 * 앞 띠 작은방 수가 다른 템플릿 두 개(들어가는 최대 개수와 하나 적게). 템플릿마다 QUBO가 다르므로 에너지는 같은 템플릿끼리만 비교한다.
 */
export function templates(spec, weights = 'hand') {
  const kmax = frontBedCount(spec);
  return [...new Set([kmax, kmax - 1])].filter((k) => k >= 0).map((k) => ({ k, q: buildQubo(spec, { frontBeds: k, weights }) }));
}

export function compareAlgorithms(spec, { algorithms, seed = 1, budgetMs = 300, maxEvals = null, refine = 30, samplesPer = 4, weights = 'hand', onProgress } = {}) {
  const tpls = templates(spec, weights);
  const q = tpls[0].q;
  const results = [];
  const points = [];
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const run0 = clock();
  const total = algorithms.length;
  algorithms.forEach((key, idx) => {
    onProgress?.(idx / total, key);
    if (key === 'model') {
      const t0 = performance.now();
      const start = clock() - run0;
      const timeline = {};
      const top = optimize(spec, { seed, count: 1, timeline });
      const best = top[0];
      // 이 안의 배치를 QUBO 에너지로도 잰다(순서를 QUBO 변수로 옮겨서).
      let energyM = null;
      let templateM = null;
      for (const t of tpls) {
        const order = orderOf(best.layout, t.q);
        if (order) (energyM = energyOfOrder(t.q, order)), (templateM = t.k);
      }
      results.push({
        key, name: '기존: J 직접 탐색', family: '적합성 J 블랙박스 최적화', cite: '이 사이트 v1', energy: energyM, template: templateM, feasible: true, ms: performance.now() - t0, evals: 800, best, budget: '평가 800회',
        // 시간 과정: 탐색 구간 하나, 나은 안을 찾은 순간마다 평면
        time: { start, phases: [{ label: '무작위 탐색', start, end: start + timeline.randomEnd }, { label: '다듬기', start: start + timeline.randomEnd, end: start + timeline.total }], marks: timeline.improvements.map((m) => ({ t: start + m.t, layout: m.layout, note: m.phase })) },
      });
      return;
    }
    const solver = SOLVERS.find((s) => s.key === key);
    const r = makeRng(seed * 31 + idx);
    let best = null;
    let ms = 0;
    let evals = 0;
    const perTemplate = [];
    const start = clock() - run0;
    const phases = [];
    const marks = [];
    // 예산을 템플릿 수로 나눠 각 템플릿 QUBO를 푼다.
    for (const t of tpls) {
      const solveStart = clock() - run0;
      const res = runSolver(key, t.q, { seed, budgetMs: budgetMs / tpls.length, maxEvals: maxEvals ? Math.round(maxEvals / tpls.length) : null });
      phases.push({ label: `QUBO 풀이(앞 침실 ${t.k + 1}개)`, start: solveStart, end: solveStart + res.ms });
      // 에너지가 낮아진 순간마다 그 해를 기본 치수로 평면에 풀어 둔다(최대 16개).
      const tr = res.trace;
      const pick = tr.length <= 16 ? tr : Array.from({ length: 16 }, (_, i) => tr[Math.round((i * (tr.length - 1)) / 15)]);
      for (const [tm, , e, xs] of pick) {
        const order = decode(t.q, xs);
        const lay = buildLayout(spec, { ...defaultParams(spec), frontOrder: order.front, backOrder: order.back });
        marks.push({ t: solveStart + tm, energy: e, template: t.k, layout: snapshot(lay), note: `에너지 ${e.toFixed(2)}${order.repaired ? '(제약 복구)' : ''}` });
      }
      const decodeStart = clock() - run0;
      ms += res.ms;
      evals += res.evals;
      perTemplate.push({ k: t.k, energy: res.energy, feasible: res.feasible, info: res.info });
      const seen = new Set();
      for (const smp of res.samples.slice(0, samplesPer)) {
        const order = decode(t.q, smp.x);
        const sig = `${order.front}|${order.back}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        const cand = realize(spec, order, r, refine);
        if (!cand) continue;
        cand.energy = smp.e;
        cand.template = t.k;
        cand.repaired = order.repaired;
        points.push([t.k, smp.e, cand.objective, key, cand.rules]);
        if (!best || cand.objective > best.objective) best = cand;
      }
      phases.push({ label: '평면으로 풀기·다듬기', start: decodeStart, end: clock() - run0 });
    }
    const tb = best ? perTemplate.find((p) => p.k === best.template) : perTemplate[0];
    results.push({ key, name: solver.name, full: solver.full, family: solver.family, cite: solver.cite, provisional: Boolean(solver.provisional), energy: best ? best.energy : tb.energy, template: tb.k, feasible: tb.feasible, perTemplate, ms, evals, best, info: tb.info, budget: maxEvals ? `평가 ${maxEvals.toLocaleString()}회` : `${budgetMs}ms`, time: { start, phases, marks } });
  });
  onProgress?.(1);
  // 에너지(낮을수록 좋음)와 순위 점수(높을수록 좋음)의 상관: 템플릿마다 구해 후보 수로 가중 평균. 음수면 에너지가 낮을수록 평면이 좋다.
  let rhoSum = 0;
  let rhoN = 0;
  for (const t of tpls) {
    const pts = points.filter((p) => p[0] === t.k);
    const rr = pts.length >= 4 ? spearman(pts.map((p) => p[1]), pts.map((p) => p[2])) : null;
    if (rr !== null) (rhoSum += rr * pts.length), (rhoN += pts.length);
  }
  const exactRes = results.find((x) => x.key === 'exact');
  const optimum = Object.fromEntries((exactRes?.perTemplate || []).filter((p) => p.info?.optimal).map((p) => [p.k, p.energy]));
  return {
    qubo: { weights: typeof weights === 'string' ? weights : 'custom', templates: tpls.map((t) => ({ k: t.k, n: t.q.n, penalty: t.q.penalty, front: t.q.bands.front.rooms, back: t.q.bands.back.rooms })), terms: q.terms.length, optimum },
    results,
    rho: rhoN ? rhoSum / rhoN : null,
    points: points.length,
    scatter: points, // [템플릿, 에너지, 순위 점수 J, 풀이기 key, 규칙 충족률]
  };
}

/** 기존 탐색 결과 평면에서 앞·뒤 순서를 읽어 QUBO 변수 순서로 옮긴다. */
function orderOf(layout, q) {
  const front = q.bands.front.rooms;
  const back = q.bands.back.rooms;
  const xs = (keys) => keys.map((k) => layout.rooms.find((r) => r.key === k)).filter(Boolean);
  const f = xs(front).sort((a, b) => a.x - b.x).map((r) => r.key);
  const b = xs(back).sort((a, c) => a.x - c.x).map((r) => r.key);
  if (f.length !== front.length || b.length !== back.length) return null;
  return { front: f, back: b };
}
function energyOfOrder(q, order) {
  const x = new Uint8Array(q.n);
  q.vars.forEach((v, i) => {
    const seq = v.band === 'front' ? order.front : order.back;
    if (seq[v.slot] === v.room) x[i] = 1;
  });
  return energy(q, x);
}

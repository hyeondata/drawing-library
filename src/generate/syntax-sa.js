// 연구 생성기의 SA판: 같은 공간구문 에너지 E = Σ β·f(syntax-gen.js)를 담금질(SA)로 최소화한다.
// - 상태 = (템플릿, 앞 띠 나머지 순서, 뒤 띠 순서). 이동 = 같은 띠 안 두 실 맞바꾸기(대부분) 또는 다른 템플릿의 무작위 배치로 건너뛰기.
//   순열 위에서 움직이므로 원-핫 제약이 늘 지켜진다(RQ3에서 순열 SA가 QUBO SA보다 최적 도달률이 높았던 방식, Kirkpatrick et al. 1983).
// - 온도: 재시작마다 T0 → T1 기하 감소(T0·T1은 전체 배치 에너지의 표준편차로 잡음). 시간 예산(budgetMs)이 끝날 때까지 재시작한다.
// - 기준: 같은 사양의 배치를 전부 열거한 최저 에너지(syntax-gen.js enumerateSyntax)와 비교해 SA가 최적에 언제 닿았는지 보여 준다.
import { rng } from './layout.js';
import { enumerateSyntax, evalArrangement, pickPlans } from './syntax-gen.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const CACHE_MAX = 200000;

function shuffle(a, r) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** 에너지 히스토그램(bins개 구간). */
function histogram(es, bins = 40) {
  const lo = Math.min(...es);
  const hi = Math.max(...es);
  const w = (hi - lo) / bins || 1;
  const counts = Array(bins).fill(0);
  for (const e of es) counts[Math.min(bins - 1, Math.floor((e - lo) / w))]++;
  return { lo, hi, w, counts };
}

/**
 * spec을 budgetMs 동안 SA로 푼다.
 * onTick({ ms, budgetMs, cur, best, trace(새 점들) })를 약 0.25초마다 부른다.
 * 반환: { cands, best, trace:[[ms, 현재 E, 최저 E]], improvements:[[ms, E]], steps, restarts, visited, total, sampled,
 *         exactMin, hitMs(처음 최저에 닿은 시각, 못 닿으면 null), hist, T0, T1, ms }
 */
export function annealSyntax(spec, { seed = 1, budgetMs = 30000, count = 3, top = 12, refine = 30, onTick } = {}) {
  const t0 = now();
  const r = rng(seed * 104729 + 7);
  // 1) 기준: 전부 열거(시간 예산 밖, 비교용)
  const ref = enumerateSyntax(spec, { seed });
  if (!ref.all.length) return null;
  const es = ref.all.map((a) => a.E);
  const exactMin = Math.min(...es);
  const mean = es.reduce((s, x) => s + x, 0) / es.length;
  const sd = Math.sqrt(es.reduce((s, x) => s + (x - mean) ** 2, 0) / es.length) || 1;
  const Z = es.reduce((s, x) => s + Math.exp(-(x - exactMin)), 0);
  const T0 = sd;
  const T1 = sd / 200;
  const enumMs = now() - t0;

  // 2) SA
  const tpls = ref.tpls.map((t) => ({ t, rest: t.q.bands.front.rooms.filter((x) => x !== 'master'), back: t.q.bands.back.rooms }));
  const cache = new Map();
  const energyOf = (s) => {
    const key = `${s.ti}|${s.rp.join()}|${s.bp.join()}`;
    let a = cache.get(key);
    if (a === undefined) {
      a = evalArrangement(spec, ref.base, tpls[s.ti].t, s.rp, s.bp);
      if (cache.size < CACHE_MAX) cache.set(key, a);
    }
    return a;
  };
  const randomState = (ti = Math.floor(r() * tpls.length)) => ({ ti, rp: shuffle(tpls[ti].rest, r), bp: shuffle(tpls[ti].back, r) });
  const neighbor = (s) => {
    if (tpls.length > 1 && r() < 0.05) return randomState((s.ti + 1 + Math.floor(r() * (tpls.length - 1))) % tpls.length);
    const n = { ti: s.ti, rp: s.rp.slice(), bp: s.bp.slice() };
    const useFront = n.bp.length < 2 || (n.rp.length >= 2 && r() < n.rp.length / (n.rp.length + n.bp.length));
    const arr = useFront ? n.rp : n.bp;
    if (arr.length < 2) return randomState(s.ti);
    const i = Math.floor(r() * arr.length);
    let j = Math.floor(r() * (arr.length - 1));
    if (j >= i) j++;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return n;
  };
  const nRooms = tpls[0].rest.length + tpls[0].back.length;
  const L = 60 * nRooms; // 재시작 한 번의 걸음 수
  const sa0 = now();
  const deadline = sa0 + budgetMs;
  const trace = [];
  const improvements = [];
  let pending = [];
  let best = null;
  let steps = 0;
  let restarts = 0;
  let hitMs = null;
  let lastRec = -Infinity;
  let lastTick = sa0;
  let cur = null;
  const record = (t, force = false) => {
    if (!force && t - lastRec < 100) return;
    lastRec = t;
    const pt = [Math.round(t), cur ? cur.E : null, best ? best.E : null];
    trace.push(pt);
    pending.push(pt);
  };
  while (now() < deadline) {
    restarts++;
    let s = randomState();
    let a = energyOf(s);
    while (!a) (s = randomState()), (a = energyOf(s));
    cur = a;
    for (let k = 0; k < L; k++) {
      const T = T0 * (T1 / T0) ** (k / (L - 1));
      const ns = neighbor(s);
      const na = energyOf(ns);
      steps++;
      if (na && (na.E <= cur.E || r() < Math.exp(-(na.E - cur.E) / T))) (s = ns), (cur = na);
      const t = now() - sa0;
      if (!best || cur.E < best.E - 1e-12) {
        best = cur;
        improvements.push([Math.round(t), cur.E]);
        if (hitMs === null && cur.E <= exactMin + 1e-9) hitMs = t;
        record(t, true);
      } else record(t);
      if ((k & 63) === 0) {
        const tn = now();
        if (tn >= deadline) break;
        if (onTick && tn - lastTick > 250) {
          lastTick = tn;
          onTick({ ms: tn - sa0, budgetMs, cur: cur.E, best: best.E, trace: pending });
          pending = [];
        }
      }
    }
  }
  record(now() - sa0, true);
  const saMs = now() - sa0;
  onTick?.({ ms: saMs, budgetMs, cur: cur?.E ?? null, best: best?.E ?? null, trace: pending, decoding: true });

  // 3) SA가 지나간 배치 중 에너지가 낮은 것부터 평면으로
  const visited = [...cache.values()].filter(Boolean);
  const seen = new Set();
  const list = visited.sort((a, b) => a.E - b.E).filter((a) => {
    const k = `${a.template}|${a.front}|${a.back}`;
    return !seen.has(k) && seen.add(k);
  });
  const Emin = Math.min(exactMin, list[0].E);
  const cands = pickPlans(spec, list, { seed, count, top, refine, Emin, Z: ref.sampled ? null : Z });
  return {
    cands,
    best: cands[0] || null,
    bestE: best ? best.E : null,
    trace,
    improvements,
    steps,
    restarts,
    stepsPerRestart: L,
    visited: cache.size,
    total: ref.all.length,
    sampled: ref.sampled,
    exactMin,
    hitMs,
    hist: histogram(es),
    T0,
    T1,
    budgetMs,
    saMs,
    enumMs,
    ms: now() - t0,
  };
}

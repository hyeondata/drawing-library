// 사이트 생성기: 공간구문 정확 QUBO(qubo-exact.js)를 SA로 푼다(고정 기록 Confluence 09-21 ⑤).
// SA는 dwave-samplers SimulatedAnnealingSampler의 기본값과 같은 규칙:
//   - BINARY → SPIN으로 바꾼 뒤 Metropolis 단일 스핀 뒤집기, 변수 순서대로 한 번 = 스위프 하나(randomize_order=False)
//   - β 범위: _default_ising_beta_range(뜨거운 β = ln2 / (2·최대 유효장), 차가운 β = ln(최소 간격 수 / 0.01) / (2·최소 유효장))
//   - 기하 스케줄(np.geomspace), 스위프 1,000번, 무작위 초기 상태
// 고른 시간(30초·1분·3분) 동안 읽기를 반복하고, 유효한 배치 중 모형 에너지가 가장 낮은 것부터 평면으로 푼다.
// 전수 열거 최저 E*는 정답 확인용으로만 함께 낸다(생성에 쓰지 않음).
import { buildQubo, frontBedCount } from './qubo.js';
import { programOf } from './layout.js';
import { buildGenQubo, decodeArrangement, enumerateTemplate, GEN_TERMS } from './qubo-exact.js';
import { pickPlans, syntaxEnergy, syntaxStats } from './syntax-gen.js';
import { SYNTAX_MODEL } from './syntax-model-data.js';

export const SWEEPS = 1000;

/**
 * SA용 난수: xoshiro128**(Blackman & Vigna 2018), splitmix32로 시드. 화면 다른 곳이 쓰는 mulberry32(layout.js rng)는 상태 32비트라
 * 읽기 수백 번 × 스위프 1,000 × 변수 수천 개(수억 번 뽑기)에서 dwave-samplers(xorshift128+)와 E* 적중률이 달라졌다(sa-js-vs-py.md).
 */
export function saRng(seed) {
  let x = seed >>> 0;
  const sm = () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
  let a = sm(), b = sm(), c = sm(), d = sm();
  if ((a | b | c | d) === 0) a = 1;
  return () => {
    const r = Math.imul(b * 5, 1) >>> 0;
    const result = (Math.imul((r << 7) | (r >>> 25), 9) >>> 0) / 4294967296;
    const t = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = (d << 11) | (d >>> 21);
    return result;
  };
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 사이트 모형의 β(원 단위)를 항 이름으로. */
export function modelBeta() {
  return Object.fromEntries(SYNTAX_MODEL.stats.map((s, j) => [s, SYNTAX_MODEL.beta_raw[j]]).filter(([s, b]) => GEN_TERMS.includes(s) && b));
}

/** compare.js 템플릿(앞 띠 침실 수별) → Python Template과 같은 꼴(scripts/export-qubo-specs.mjs와 같은 규칙). */
export function templatesOf(spec) {
  const types = Object.fromEntries(programOf(spec).map((r) => [r.key, r.type]));
  const kmax = frontBedCount(spec);
  return [...new Set([kmax, kmax - 1])].filter((k) => k >= 0).map((k) => {
    const q = buildQubo(spec, { frontBeds: k, weights: 'hand' });
    return { k, front: q.bands.front.rooms, back: q.bands.back.rooms, suite: ['bathMaster', 'dress'].filter((x) => types[x]), types };
  });
}

/** 지금 사양의 정확 QUBO(템플릿마다 하나)를 D-Wave·dimod가 읽는 JSON으로(사이트 β). */
export function exactQuboJson(spec) {
  const beta = modelBeta();
  return templatesOf(spec).map((t) => {
    const { K } = enumerateTemplate(t);
    const { q, bqm } = buildGenQubo(t, beta, K);
    return { template: { k: t.k, front: t.front, back: t.back }, K, beta, penalty: q.P, vartype: 'BINARY', offset: bqm.offset, linear: Object.fromEntries(bqm.linear), quadratic: [...bqm.quad.values()].filter(([, , c]) => c !== 0) };
  });
}

/** BINARY BQM → SPIN 배열(CSR). dimod change_vartype과 같은 식. */
export function toIsing(bqm) {
  const names = [...bqm.linear.keys()];
  const idx = new Map(names.map((v, i) => [v, i]));
  const n = names.length;
  const h = new Float64Array(n);
  let offset = bqm.offset;
  names.forEach((v, i) => {
    const a = bqm.linear.get(v);
    h[i] += a / 2;
    offset += a / 2;
  });
  const nb = Array.from({ length: n }, () => []);
  const Jlist = [];
  for (const [a, b, c] of bqm.quad.values()) {
    if (!c) continue;
    const i = idx.get(a);
    const j = idx.get(b);
    h[i] += c / 4;
    h[j] += c / 4;
    offset += c / 4;
    nb[i].push([j, c / 4]);
    nb[j].push([i, c / 4]);
    Jlist.push([i, j, c / 4]);
  }
  const start = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + nb[i].length;
  const nbr = new Int32Array(start[n]);
  const w = new Float64Array(start[n]);
  for (let i = 0; i < n; i++) nb[i].forEach(([j, c], k) => ((nbr[start[i] + k] = j), (w[start[i] + k] = c)));
  return { names, idx, n, h, start, nbr, w, J: Jlist, offset };
}

/**
 * dwave-samplers _default_ising_beta_range(scale_T_with_N=True, 들뜸률 0.01).
 * 단, |편향| < EPS는 0으로 본다: BINARY→SPIN 변환의 부동소수 잔차(1e-14 크기 h)가 '최소 유효장'이 되면 차가운 β가 1e14까지 커져
 * 스케줄이 사실상 탐욕 탐색이 된다. Python 쪽(sa_js_vs_py.py·RQ3)도 같은 정리를 한 뒤 dwave 함수를 쓴다(고정 기록 변경 기록 2026-11-05).
 */
export const BIAS_EPS = 1e-9;
export function defaultBetaRange(is, eps = BIAS_EPS) {
  const sumAbs = Array.from(is.h, (v) => (Math.abs(v) >= eps ? Math.abs(v) : 0));
  const minAbs = new Map();
  is.h.forEach((v, i) => Math.abs(v) >= eps && minAbs.set(i, Math.abs(v)));
  for (const [i, j, c] of is.J) {
    if (Math.abs(c) < eps) continue;
    for (const k of [i, j]) {
      sumAbs[k] += Math.abs(c);
      minAbs.set(k, minAbs.has(k) ? Math.min(Math.abs(c), minAbs.get(k)) : Math.abs(c));
    }
  }
  if (!minAbs.size) return [0.1, 1];
  const maxField = Math.max(...sumAbs);
  const hot = maxField === 0 ? 1 : Math.log(2) / (2 * maxField);
  const vals = [...minAbs.values()];
  const minField = Math.min(...vals);
  const count = vals.filter((v) => v === minField).length;
  return [hot, Math.log(count / 0.01) / (2 * minField)];
}

export function geomspace(a, b, n) {
  if (n === 1) return [b];
  return Array.from({ length: n }, (_, i) => a * (b / a) ** (i / (n - 1)));
}

/** 읽기 한 번: 무작위 스핀에서 시작해 스케줄대로 스위프. 반환 Int8Array(±1). */
export function anneal(is, betas, r) {
  const { n, h, start, nbr, w } = is;
  const s = new Int8Array(n);
  for (let i = 0; i < n; i++) s[i] = r() < 0.5 ? -1 : 1;
  // 유효장 field_i = h_i + Σ J_ij s_j 를 유지한다
  const field = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let f = h[i];
    for (let k = start[i]; k < start[i + 1]; k++) f += w[k] * s[nbr[k]];
    field[i] = f;
  }
  for (const beta of betas) {
    for (let i = 0; i < n; i++) {
      const dE = -2 * s[i] * field[i];
      if (dE <= 0 || (beta * dE < 22.18 && r() < Math.exp(-beta * dE))) {
        s[i] = -s[i];
        const d = 2 * s[i];
        for (let k = start[i]; k < start[i + 1]; k++) field[nbr[k]] += w[k] * d;
      }
    }
  }
  return s;
}

export function isingEnergy(is, s) {
  let e = is.offset;
  for (let i = 0; i < is.n; i++) e += is.h[i] * s[i];
  for (const [i, j, c] of is.J) e += c * s[i] * s[j];
  return e;
}

function histogram(es, bins = 40) {
  const lo = Math.min(...es);
  const hi = Math.max(...es);
  const w = (hi - lo) / bins || 1;
  const counts = Array(bins).fill(0);
  for (const e of es) counts[Math.min(bins - 1, Math.floor((e - lo) / w))]++;
  return { lo, hi, w, counts };
}

/**
 * 공간구문 QUBO + SA로 평면을 만든다.
 * onTick({ ms, budgetMs, reads, valid, best, newReads:[[ms, 템플릿 k, QUBO 에너지, 모형 에너지 | null]] }) 약 0.25초마다.
 * 반환: { cands, best, reads, valid, hits, hitMs, bestE, exactMin, total, hist, sizes:[{k, n, quad, P, betaRange}], readLog, ms, saMs, prepMs }
 */
export function generateQuboSA(spec, { seed = 1, budgetMs = 30000, count = 3, top = 12, refine = 30, frame = null, onTick } = {}) {
  const t0 = now();
  const beta = modelBeta();
  const tpls = templatesOf(spec).map((t) => {
    const { arrangements, K } = enumerateTemplate(t);
    const table = new Map();
    for (const a of arrangements) {
      if (!a.connected) continue;
      const f = syntaxStats(a.g);
      if (f.some((x, j) => SYNTAX_MODEL.beta_raw[j] && !Number.isFinite(x))) continue;
      table.set(`${a.rp.join()}|${a.bp.join()}`, { front: ['master', ...a.rp], back: a.bp, template: t.k, f, E: syntaxEnergy(f) });
    }
    const { q, bqm } = buildGenQubo(t, beta, K);
    const is = toIsing(bqm);
    const br = defaultBetaRange(is);
    return { t, q, is, table, betas: geomspace(br[0], br[1], SWEEPS), size: { k: t.k, n: is.n, quad: is.J.length, P: q.P, betaRange: br, K, arrangements: table.size } };
  });
  const all = tpls.flatMap((x) => [...x.table.values()]);
  if (!all.length) return null;
  const es = all.map((a) => a.E);
  const exactMin = Math.min(...es);
  const Z = es.reduce((s, x) => s + Math.exp(-(x - exactMin)), 0);
  const prepMs = now() - t0;

  const r = saRng(seed * 2654435761 + 17);
  const sa0 = now();
  const deadline = sa0 + budgetMs;
  const found = new Map();
  const readLog = [];
  let pending = [];
  let reads = 0;
  let valid = 0;
  let hits = 0;
  let hitMs = null;
  let best = null;
  let lastTick = sa0;
  do {
    const x = tpls[reads % tpls.length];
    const s = anneal(x.is, x.betas, r);
    reads++;
    const tm = now() - sa0;
    const qE = isingEnergy(x.is, s);
    const arr = decodeArrangement(x.q, (name) => (s[x.is.idx.get(name)] === 1 ? 1 : 0));
    const a = arr ? x.table.get(`${arr.rp.join()}|${arr.bp.join()}`) : null;
    if (a) {
      valid++;
      found.set(`${a.template}|${a.front}|${a.back}`, a);
      if (Math.abs(a.E - exactMin) < 1e-9) {
        hits++;
        if (hitMs === null) hitMs = tm;
      }
      if (!best || a.E < best.E) best = a;
    }
    const row = [Math.round(tm), x.t.k, qE, a ? a.E : null];
    readLog.push(row);
    pending.push(row);
    if (onTick && now() - lastTick > 250) {
      lastTick = now();
      onTick({ ms: lastTick - sa0, budgetMs, reads, valid, best: best ? best.E : null, newReads: pending });
      pending = [];
    }
  } while (now() < deadline);
  const saMs = now() - sa0;
  onTick?.({ ms: saMs, budgetMs, reads, valid, best: best ? best.E : null, newReads: pending, decoding: true });

  const list = [...found.values()].sort((a, b) => a.E - b.E);
  const cands = list.length ? pickPlans(spec, list, { seed, count, top, refine, Emin: exactMin, Z, frame }) : [];
  return {
    cands, best: cands[0] || null, reads, valid, hits, hitMs, bestE: best ? best.E : null, exactMin, total: all.length, distinct: list.length,
    hist: histogram(es), sizes: tpls.map((x) => x.size), readLog, budgetMs, saMs, prepMs, ms: now() - t0, sweeps: SWEEPS,
  };
}

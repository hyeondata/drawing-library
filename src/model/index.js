// 도면 평가 모델 진입점. 브라우저와 Node(CLI·테스트)에서 같은 코드를 쓴다.
import { FEATURES, GATE_CAP, GATE_RULES, GRADES, MODEL_VERSION, STRATA, WEIGHTS, Z_ZERO_SCORE } from './config.js';
import { detectKind, parseLabel } from './labels.js';
import { analyzeOBJ } from './obj.js';
import { analyzeSPA } from './spa.js';
import { analyzeSTR } from './str.js';

export { MODEL_VERSION, detectKind };

const ANALYZERS = { SPA: analyzeSPA, STR: analyzeSTR, OBJ: analyzeOBJ };

export function analyze(label, kind = detectKind(label), opts = {}) {
  const fn = ANALYZERS[kind];
  if (!fn) throw new Error(kind ? `${kind} 라벨은 평가 대상이 아닙니다(문자 정보만 있음).` : '평가할 라벨이 없습니다.');
  return fn(parseLabel(label), opts);
}

/** 기준 분포에 넣을 특징값 목록: [{ unit, features }] */
export function extractFeatures(analysis) {
  return analysis.units.map((u) => ({ unit: u.index, features: u.features }));
}

function median(sorted) {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/**
 * Rousseeuw & Croux(1993)의 Qn 척도: 두 값 차이 |xi − xj|(i<j)의 k번째 순서통계량 × 2.2219 × 유한표본 보정.
 * k = C(h, 2), h = ⌊n/2⌋ + 1. MAD보다 정규분포 효율이 높고(MAD 약 37%) 붕괴점은 같다(50%).
 */
export function qnScale(sorted) {
  const n = sorted.length;
  if (n < 2) return 0;
  const h = Math.floor(n / 2) + 1;
  const k = (h * (h - 1)) / 2;
  const small = { 2: 0.399, 3: 0.994, 4: 0.512, 5: 0.844, 6: 0.611, 7: 0.857, 8: 0.669, 9: 0.872 };
  const dn = n <= 9 ? small[n] : n % 2 ? n / (n + 1.4) : n / (n + 3.8);
  return 2.2219 * dn * kthPairDiff(sorted, k);
}

/**
 * 정렬된 값에서 쌍 차이 sorted[j] − sorted[i](i<j)의 k번째로 작은 값. 모든 쌍을 만들어 정렬하면 O(n² log n)이라
 * 기준 분포 1만 세대 이상에서 쓸 수 없어, "d 이하 쌍의 수"(두 포인터, O(n))로 d를 이분 탐색한 뒤 실제 차이값으로 맞춘다.
 * 결과는 모든 쌍을 정렬한 값과 같다(테스트에서 대조).
 */
function kthPairDiff(s, k) {
  const n = s.length;
  const countLE = (d) => {
    let c = 0;
    for (let i = 0, j = 0; i < n; i++) {
      while (s[i] - s[j] > d) j++;
      c += i - j;
    }
    return c;
  };
  let lo = 0;
  let hi = s[n - 1] - s[0];
  if (countLE(0) >= k) return 0;
  for (let it = 0; it < 200 && hi > lo; it++) {
    const mid = lo + (hi - lo) / 2;
    if (mid <= lo || mid >= hi) break;
    if (countLE(mid) >= k) hi = mid;
    else lo = mid;
  }
  // hi 이하인 실제 쌍 차이 중 최댓값이 k번째 값이다.
  let best = 0;
  for (let i = 0, j = 0; i < n; i++) {
    while (s[i] - s[j] > hi) j++;
    if (j < i && s[i] - s[j] > best) best = s[i] - s[j];
  }
  return best;
}

/** 중앙값, Qn 척도(채점용), MAD×1.4826(참고용), 정렬된 값(백분위용). */
export function robustStats(values) {
  const v = values.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const med = median(v);
  const mad = median(v.map((x) => Math.abs(x - med)).sort((a, b) => a - b)) * 1.4826;
  return { n: v.length, median: med, scale: qnScale(v), mad, min: v[0], max: v[v.length - 1], sorted: v };
}

/**
 * z가 0이면 100점, |z|가 zZero(기본 Z_ZERO_SCORE) 이상이면 0점.
 * direction이 'higher'면 중앙값보다 큰 쪽(z>0)은 감점하지 않고, 'lower'면 작은 쪽을 감점하지 않는다.
 */
export function closenessScore(z, direction, zZero = Z_ZERO_SCORE) {
  if ((direction === 'higher' && z > 0) || (direction === 'lower' && z < 0)) return 100;
  return 100 * Math.max(0, 1 - Math.abs(z) / zZero);
}

/** 경험적 누적분포 F(x) (동점은 절반으로 셈). */
export function ecdf(x, sorted) {
  let below = 0;
  let equal = 0;
  for (const v of sorted) {
    if (v < x - 1e-12) below++;
    else if (Math.abs(v - x) <= 1e-12) equal++;
  }
  return (below + 0.5 * equal) / sorted.length;
}

/**
 * 요약형 기준 분포의 누적분포. 값 종류가 적으면(이산 지표) 값별 누적 개수로 ecdf와 똑같이 계산하고,
 * 많으면(연속 지표) 등간격 분위수 격자에서 선형 보간한다(오차 ≤ 1/(격자 수 − 1)).
 */
export const CDF_GRID = 501;
export function makeCdf(sorted) {
  const u = [];
  const c = [];
  for (let i = 0; i < sorted.length; i++) {
    if (u.length && Math.abs(sorted[i] - u[u.length - 1]) <= 1e-12) c[c.length - 1] = i + 1;
    else if (u.length >= CDF_GRID) {
      u.length = 0;
      break;
    } else {
      u.push(sorted[i]);
      c.push(i + 1);
    }
  }
  if (u.length) return { u, c };
  const n = sorted.length;
  return { q: Array.from({ length: CDF_GRID }, (_, j) => sorted[Math.round((j * (n - 1)) / (CDF_GRID - 1))]) };
}

// 정렬 배열에서 x − tol보다 작은 원소 수 / x + tol 이하인 원소 수
const lowerBound = (arr, x) => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < x) lo = m + 1;
    else hi = m;
  }
  return lo;
};
const upperBound = (arr, x) => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= x) lo = m + 1;
    else hi = m;
  }
  return lo;
};

export function cdfAt(x, cdf, n) {
  if (cdf.u) {
    const a = lowerBound(cdf.u, x - 1e-12);
    const b = upperBound(cdf.u, x + 1e-12);
    const below = a ? cdf.c[a - 1] : 0;
    const upto = b ? cdf.c[b - 1] : 0;
    return (below + 0.5 * (upto - below)) / n;
  }
  const q = cdf.q;
  const G = q.length - 1;
  if (x < q[0]) return 0;
  if (x > q[G]) return 1;
  // ecdf와 같은 동점 허용 오차(1e-12): 부동소수점 끝자리만 다른 같은 값이 많은 지표(면적비 등)가 있다.
  const a = lowerBound(q, x - 1e-12);
  const b = upperBound(q, x + 1e-12);
  if (b > a) return (a + b - 1) / 2 / G; // 격자점과 같은 값: 그 격자점들의 가운데 순위
  return (a - 1 + (x - q[a - 1]) / (q[a] - q[a - 1])) / G;
}

/** 백분위 점수: 양측 100·2·min(F, 1−F), 'higher' 100·min(1, F/0.5), 'lower' 100·min(1, (1−F)/0.5). */
export function percentileScore(F, direction) {
  if (direction === 'higher') return 100 * Math.min(1, F / 0.5);
  if (direction === 'lower') return 100 * Math.min(1, (1 - F) / 0.5);
  return 100 * 2 * Math.min(F, 1 - F);
}

const dist = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));

/**
 * 기준 분포에 기대는 파생 특징을 더한다. 같은 기준 분포는 한 번만 준비한다(민감도 분석에서 수천 번 다시 채점하므로).
 * - genotypeDistance: 평면 안에서 표준화한 5유형 통합도 벡터와 기준 분포 중앙 벡터 사이의 거리.
 * - adjust: 'logK' 지표는 기준 분포에서 log(기능실 수)에 회귀한 잔차를 '<key>__adj'로 둔다.
 */
const prepared = new WeakMap();
const ADJUSTED = Object.values(FEATURES)
  .flatMap((g) => (Array.isArray(g) ? g : []))
  .filter((d) => d.adjust === 'logK');

function applyDerived(f, prep) {
  const out = { ...f };
  if (prep.center) out.genotypeDistance = Array.isArray(f.genotypeProfile) ? dist(f.genotypeProfile, prep.center) : null;
  for (const def of ADJUSTED) {
    const [a, b] = prep.fits[def.key];
    out[`${def.key}__adj`] = Number.isFinite(f[def.key]) && f.nodeCount > 0 ? f[def.key] - (a + b * Math.log(f.nodeCount)) : null;
  }
  return out;
}

function preparePool(pool) {
  if (prepared.has(pool)) return prepared.get(pool);
  if (pool.summary) {
    const prep = { center: pool.center, fits: pool.fits, statsOf: (key) => pool.stats[key] ?? null };
    prepared.set(pool, prep);
    return prep;
  }
  const profiles = pool.map((f) => f.genotypeProfile).filter(Array.isArray);
  const center = profiles.length ? profiles[0].map((_, i) => median(profiles.map((p) => p[i]).sort((a, b) => a - b))) : null;
  const fits = {};
  for (const def of ADJUSTED) {
    const pts = pool.filter((f) => Number.isFinite(f[def.key]) && f.nodeCount > 0).map((f) => [Math.log(f.nodeCount), f[def.key]]);
    let a = 0;
    let b = 0;
    if (pts.length >= 3) {
      const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
      b = sxx ? pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx : 0;
      a = my - b * mx;
    }
    fits[def.key] = [a, b];
  }
  const prep = { center, fits };
  prep.pool = pool.map((f) => applyDerived(f, prep));
  prep.stats = new Map();
  prep.statsOf = (key) => {
    if (!prep.stats.has(key)) prep.stats.set(key, robustStats(prep.pool.map((f) => f[key])));
    return prep.stats.get(key);
  };
  prepared.set(pool, prep);
  return prep;
}

function scoreFeatures(defs, features, prep, opts) {
  const items = defs.map((def) => {
    const value = features[def.key];
    const key = def.adjust ? `${def.key}__adj` : def.key;
    const scored = features[key];
    const display = prep.statsOf(def.key);
    const stats = def.adjust ? prep.statsOf(key) : display;
    const base = { ...def, value: value ?? null, stats: display ? { ...display, sorted: undefined, cdf: undefined } : null, z: null, percentile: null, score: null };
    if (value === null || value === undefined || scored === null || scored === undefined || !stats) return base;
    const method = opts.scoring === 'z' || opts.scoring === 'ecdf' ? opts.scoring : def.scoring || 'z';
    const F = stats.cdf ? cdfAt(scored, stats.cdf, stats.n) : ecdf(scored, stats.sorted);
    if (method === 'ecdf' || !(stats.scale > 0)) {
      return { ...base, percentile: F, method: 'ecdf', score: percentileScore(F, def.direction) };
    }
    const z = (scored - stats.median) / stats.scale;
    return { ...base, z, percentile: F, method: 'z', score: closenessScore(z, def.direction, opts.zZero) };
  });
  const scored = items.filter((i) => i.score !== null && (i.weight ?? 1) > 0);
  const w = scored.reduce((s, i) => s + (i.weight ?? 1), 0);
  return { score: w ? scored.reduce((s, i) => s + (i.weight ?? 1) * i.score, 0) / w : 0, items };
}

function scoreRules(rules) {
  const w = rules.reduce((s, r) => s + r.weight, 0);
  return { score: w ? (100 * rules.reduce((s, r) => s + r.weight * r.ratio, 0)) / w : 0, items: rules };
}

export function gradeOf(score) {
  return GRADES.find(([min]) => score >= min)[1];
}

/**
 * 기준 분포에서 평가 도면 자신(같은 도면의 모든 세대)을 뺀 특징 목록.
 * 요약형 기준 분포(baseline.summary[kind], 전체 7,275장)는 세대 목록이 없어 자기 제외를 하지 않는다(8천여 평면 중 1~3개라 영향이 작다).
 */
export function poolFor(baseline, kind, drawingId = null) {
  if (baseline?.summary?.[kind]) return baseline.summary[kind];
  return ((baseline && baseline.entries[kind]) || []).filter((e) => e.drawing !== drawingId).map((e) => e.features);
}

/** 층화: 같은 층(침실 수)의 세대가 충분하면 그 세대만 기준으로 쓴다. 같은 배열을 돌려줘야 통계 캐시가 작동한다. */
const strataCache = new WeakMap();
function stratumOf(pool, features, opts) {
  const key = opts.strata === null ? null : (opts.strata || STRATA)?.key;
  if (pool.summary) {
    // 요약형: 층은 기준 분포를 만들 때 정해진다(같은 층 규칙만 쓸 수 있다).
    const st = pool.strata;
    if (!key || features[key] === undefined || features[key] === null) return { pool: pool.all, stratum: null };
    if (key !== st.key || (opts.strata || STRATA).minSize !== st.minSize) throw new Error(`요약형 기준 분포의 층(${st.key}, ${st.minSize})과 다른 층 설정은 쓸 수 없습니다.`);
    const layer = st.layers[features[key]];
    return layer ? { pool: layer, stratum: `${key}=${features[key]}` } : { pool: pool.all, stratum: null };
  }
  if (!key || features[key] === undefined || features[key] === null) return { pool, stratum: null };
  if (!strataCache.has(pool)) strataCache.set(pool, new Map());
  const m = strataCache.get(pool);
  const v = features[key];
  if (!m.has(v)) m.set(v, pool.filter((f) => f[key] === v));
  const sub = m.get(v);
  const minSize = (opts.strata || STRATA).minSize;
  return sub.length >= minSize ? { pool: sub, stratum: `${key}=${v}` } : { pool, stratum: null };
}

const sizeOf = (p) => (p.summary ? p.n : p.length);

const SPA_GROUPS = [
  ['syntax', '공간구문(인접 그래프)'],
  ['area', '면적 구성'],
  ['shape', '형태'],
  ['exposure', '외기 접면'],
];

/**
 * 분석 결과를 점수로 바꾼다. 민감도 분석이 같은 분석을 여러 설정으로 다시 채점할 수 있게 분리했다.
 * options: { weights, zZero, gateCap(null이면 상한 없음), scoring('z'|'ecdf'면 모든 지표에 강제), aggregation('arithmetic'|'geometric') }
 */
export function scoreAnalysis(analysis, pool, options = {}) {
  const kind = analysis.kind;
  const opts = { zZero: Z_ZERO_SCORE, gateCap: GATE_CAP, aggregation: 'arithmetic', ...options };
  const weights = { ...WEIGHTS[kind], ...(options.weights || {}) };

  const units = analysis.units.map((u) => {
    const { pool: ref, stratum } = stratumOf(pool, u.features, opts);
    const prep = preparePool(ref);
    const target = applyDerived(u.features, prep);
    const groups = {};
    if (kind === 'SPA') {
      for (const [key, label] of SPA_GROUPS) groups[key] = { label, ...scoreFeatures(FEATURES[key], target, prep, opts) };
    } else {
      groups.profile = { label: '구성 분포', ...scoreFeatures(FEATURES.profile[kind], target, prep, opts) };
    }
    groups.rules = { label: kind === 'SPA' ? '정합성' : '라벨 정합성', ...scoreRules(u.rules) };
    for (const [key, g] of Object.entries(groups)) g.weight = weights[key] ?? 0;
    const wSum = Object.values(groups).reduce((s, g) => s + g.weight, 0) || 1;
    const raw =
      opts.aggregation === 'geometric'
        ? 100 * Math.exp(Object.values(groups).reduce((s, g) => s + (g.weight / wSum) * Math.log(Math.max(1, g.score) / 100), 0))
        : Object.values(groups).reduce((s, g) => s + (g.weight * g.score) / 100, 0) * (100 / wSum);
    // 관문 규칙: 유효성은 따로 출력하고(사전식 판정), 단일 점수가 필요할 때만 상한을 건다.
    const failedGates = u.rules.filter((r) => GATE_RULES.has(r.id) && !r.pass).map((r) => r.label);
    const total = failedGates.length && opts.gateCap !== null ? Math.min(raw, opts.gateCap) : raw;
    return {
      index: u.index,
      score: total,
      rawScore: raw,
      capped: total < raw,
      failedGates,
      validity: { valid: failedGates.length === 0, failed: failedGates },
      stratum,
      baselineSize: sizeOf(ref),
      grade: gradeOf(total),
      groups,
    };
  });

  const score = units.length ? units.reduce((s, u) => s + u.score, 0) / units.length : 0;
  return { score, grade: gradeOf(score), valid: units.every((u) => u.validity.valid), units };
}

/**
 * 도면 하나를 평가한다.
 * baseline: build-baseline이 만든 기준 분포. drawingId가 같은 항목(같은 도면의 모든 세대)은 비교에서 뺀다.
 */
export function evaluate(label, { baseline, drawingId = null, kind = detectKind(label), options = {} } = {}) {
  const analysis = analyze(label, kind);
  const pool = poolFor(baseline, kind, drawingId);
  const result = scoreAnalysis(analysis, pool, options);
  return {
    modelVersion: MODEL_VERSION,
    kind,
    drawingId,
    ...result,
    baselineSize: sizeOf(pool.summary ? pool.all : pool),
    analysis,
  };
}

/**
 * 세대 특징 목록을 요약형 기준 분포로 바꾼다(build-baseline-full). 층(침실 수)마다, 그리고 전체에 대해
 * 유전형 중심·실 수 보정 회귀·지표별 { n, median, scale(Qn), mad, min, max, cdf }만 남긴다.
 * 세대 1만여 개를 그대로 웹에 싣지 않고, 채점은 원래 목록으로 한 것과 같거나(이산 지표) 격자 오차 이내다.
 */
const SUMMARY_KEYS = [...new Set(SPA_GROUPS.flatMap(([g]) => FEATURES[g].flatMap((d) => (d.adjust ? [d.key, `${d.key}__adj`] : [d.key]))))];
export function summarizePool(pool, strata = STRATA) {
  const layer = (p) => {
    const prep = preparePool(p);
    const stats = {};
    for (const key of SUMMARY_KEYS) {
      const st = prep.statsOf(key);
      if (st) stats[key] = { n: st.n, median: st.median, scale: st.scale, mad: st.mad, min: st.min, max: st.max, cdf: makeCdf(st.sorted) };
    }
    return { summary: true, n: p.length, center: prep.center, fits: prep.fits, stats };
  };
  const groups = new Map();
  for (const f of pool) if (f[strata.key] !== undefined && f[strata.key] !== null) (groups.get(f[strata.key]) || groups.set(f[strata.key], []).get(f[strata.key])).push(f);
  const layers = {};
  for (const [v, sub] of [...groups].sort((a, b) => a[0] - b[0])) if (sub.length >= strata.minSize) layers[v] = layer(sub);
  return { summary: true, all: layer(pool), strata: { key: strata.key, minSize: strata.minSize, layers } };
}

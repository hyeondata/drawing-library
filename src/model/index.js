// 도면 평가 모델 진입점. 브라우저와 Node(CLI·테스트)에서 같은 코드를 쓴다.
import { FEATURES, GRADES, MODEL_VERSION, WEIGHTS, Z_ZERO_SCORE } from './config.js';
import { detectKind, parseLabel } from './labels.js';
import { analyzeOBJ } from './obj.js';
import { analyzeSPA } from './spa.js';
import { analyzeSTR } from './str.js';

export { MODEL_VERSION, detectKind };

const ANALYZERS = { SPA: analyzeSPA, STR: analyzeSTR, OBJ: analyzeOBJ };

export function analyze(label, kind = detectKind(label)) {
  const fn = ANALYZERS[kind];
  if (!fn) throw new Error(kind ? `${kind} 라벨은 평가 대상이 아닙니다(문자 정보만 있음).` : '평가할 라벨이 없습니다.');
  return fn(parseLabel(label));
}

/** 기준 분포에 넣을 특징값 목록: [{ unit, features }] */
export function extractFeatures(analysis) {
  return analysis.units.map((u) => ({ unit: u.index, features: u.features }));
}

function median(sorted) {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/** 중앙값과 강건 척도(MAD×1.4826, 없으면 표준편차, 최소 minScale). */
export function robustStats(values, minScale = 1e-6) {
  const v = values.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const med = median(v);
  const mad = median(v.map((x) => Math.abs(x - med)).sort((a, b) => a - b)) * 1.4826;
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
  return { n: v.length, median: med, scale: Math.max(mad || sd, minScale), min: v[0], max: v[v.length - 1] };
}

/** z가 0이면 100점, |z|가 Z_ZERO_SCORE 이상이면 0점. */
export function closenessScore(z) {
  return 100 * Math.max(0, 1 - Math.abs(z) / Z_ZERO_SCORE);
}

function scoreFeatures(defs, features, pool) {
  const items = defs.map((def) => {
    const value = features[def.key];
    const stats = robustStats(pool.map((f) => f[def.key]), def.minScale);
    if (value === null || value === undefined || !stats) return { ...def, value: value ?? null, stats, z: null, score: null };
    const z = (value - stats.median) / stats.scale;
    return { ...def, value, stats, z, score: closenessScore(z) };
  });
  const scored = items.filter((i) => i.score !== null);
  return { score: scored.length ? scored.reduce((s, i) => s + i.score, 0) / scored.length : 0, items };
}

function scoreRules(rules) {
  const w = rules.reduce((s, r) => s + r.weight, 0);
  return { score: w ? (100 * rules.reduce((s, r) => s + r.weight * r.ratio, 0)) / w : 0, items: rules };
}

export function gradeOf(score) {
  return GRADES.find(([min]) => score >= min)[1];
}

/**
 * 도면 하나를 평가한다.
 * baseline: build-baseline이 만든 기준 분포. drawingId가 같은 항목은 비교에서 뺀다(자기 자신 제외).
 */
export function evaluate(label, { baseline, drawingId = null, kind = detectKind(label) } = {}) {
  const analysis = analyze(label, kind);
  const pool = ((baseline && baseline.entries[kind]) || [])
    .filter((e) => e.drawing !== drawingId)
    .map((e) => e.features);
  const weights = WEIGHTS[kind];

  const units = analysis.units.map((u) => {
    const groups = {};
    if (kind === 'SPA') {
      groups.syntax = { label: '공간구문', ...scoreFeatures(FEATURES.syntax, u.features, pool) };
      groups.area = { label: '면적 구성', ...scoreFeatures(FEATURES.area, u.features, pool) };
    } else {
      groups.profile = { label: '구성 분포', ...scoreFeatures(FEATURES.profile[kind], u.features, pool) };
    }
    groups.rules = { label: '정합성', ...scoreRules(u.rules) };
    for (const [key, g] of Object.entries(groups)) g.weight = weights[key];
    const total = Object.values(groups).reduce((s, g) => s + (g.weight * g.score) / 100, 0);
    return { index: u.index, score: total, grade: gradeOf(total), groups };
  });

  const score = units.length ? units.reduce((s, u) => s + u.score, 0) / units.length : 0;
  return {
    modelVersion: MODEL_VERSION,
    kind,
    drawingId,
    score,
    grade: gradeOf(score),
    baselineSize: pool.length,
    units,
    analysis,
  };
}

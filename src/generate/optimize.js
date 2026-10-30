// 사양에 맞는 평면 변형을 여러 개 만들고 적합성(시공 가능성 규칙 충족 + 목표 면적 부합 + 선택한 선호)으로 골라낸다.
// 무작위 탐색 뒤 상위 안을 국소 탐색(hill climbing)으로 다듬는다. 브라우저 Web Worker와 Node 테스트가 함께 쓴다.
import { analyze, failedGates, ruleRate } from '../model/index.js';
import { MIN_SIDE, buildLayout, mutate, noiseExposure, randomParams, rng, toLabel } from './layout.js';

export { MIN_SIDE };
import { ALL_CHOICES } from './preferences.js';

/** 목적함수 가중치: 규칙 충족·목표 부합·선호. 선호를 고르지 않으면 나머지로 나눈다. */
export const OBJECTIVE = { rules: 0.45, fit: 0.25, prefs: 0.3 };

export function scoreLayout(spec, layout) {
  const label = toLabel(layout);
  let analysis;
  try {
    analysis = analyze(label, 'SPA');
  } catch {
    return null;
  }
  // 세대가 둘 이상으로 갈라지면 실이 끊긴 것이다.
  if (analysis.units.length !== 1) return null;
  const a = analysis.units[0];
  const failed = failedGates(a.rules);
  const unit = { features: a.features, rules: a.rules, validity: { valid: failed.length === 0, failed } };
  const rule = (id) => a.rules.find((r) => r.id === id)?.ratio ?? 1;
  const noise = noiseExposure(layout.rooms);
  const ctx = { features: a.features, rule, layout, noise };
  const rules = ruleRate(a.rules);

  // 목표 면적 부합: 거실·주방·안방·나머지 침실 평균의 상대 오차
  const areaOf = (pred) => layout.rooms.filter(pred).map((r) => r.w * r.h);
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  const others = areaOf((r) => r.type === '침실' && r.key !== 'master');
  const actual = {
    living: sum(areaOf((r) => r.key === 'living')),
    kitchen: sum(areaOf((r) => r.key === 'kitchen')),
    master: sum(areaOf((r) => r.key === 'master')),
    other: others.length ? sum(others) / others.length : null,
  };
  const errs = [];
  for (const k of Object.keys(actual)) if (actual[k] !== null) errs.push(Math.abs(actual[k] - spec.targets[k] * spec.area) / (spec.targets[k] * spec.area));
  // 복도·홀('기타')이 실제 아파트(같은 침실 수 세대의 p75, spec.etcMax)보다 넓으면 그만큼을 면적 오차로 더한다.
  const interior = sum(layout.rooms.filter((r) => r.type !== '발코니' && r.type !== '실외기실').map((r) => r.w * r.h));
  const etcShare = sum(areaOf((r) => r.type === '기타')) / interior;
  if (spec.etcMax) errs.push(Math.max(0, etcShare - spec.etcMax) / spec.etcMax);
  const fit = Math.max(0, 100 - 250 * (errs.reduce((s, e) => s + e, 0) / errs.length));
  // 짧은 변이 MIN_SIDE보다 좁은 실은 쓰기 어려운 실로 보고 감점한다.
  // 거실·침실은 긴 변이 짧은 변의 2배를 넘어도 쓰기 어렵다고 본다.
  const narrow = layout.rooms.filter(
    (r) => (MIN_SIDE[r.type] && Math.min(r.w, r.h) < MIN_SIDE[r.type]) || (r.key === 'master' && Math.min(r.w, r.h) < MIN_SIDE.안방) || ((r.type === '침실' || r.type === '거실') && Math.max(r.w, r.h) / Math.min(r.w, r.h) > 2),
  ).length;

  const prefs = ALL_CHOICES.filter((c) => spec.prefs.includes(c.key)).map((c) => ({ key: c.key, score: c.score(ctx) }));
  const prefScore = prefs.length ? prefs.reduce((s, p) => s + p.score, 0) / prefs.length : null;
  const w = prefs.length ? OBJECTIVE : { rules: OBJECTIVE.rules / (1 - OBJECTIVE.prefs), fit: OBJECTIVE.fit / (1 - OBJECTIVE.prefs), prefs: 0 };
  let objective = w.rules * rules + w.fit * fit + (prefScore === null ? 0 : w.prefs * prefScore);
  if (!unit.validity.valid) objective -= 40;
  objective -= 15 * narrow;
  // 문 동선: 현관에서 문으로 갈 수 없는 실, 침실을 지나야 하는 실은 감점(규칙은 인접 그래프라 이것을 보지 못한다).
  const doorIssues = layout.doorCheck ? layout.doorCheck.unreachable.length + layout.doorCheck.throughBedroom.length : 0;
  objective -= 15 * doorIssues;
  return { label, unit, rules, fit, prefs, prefScore, objective, noise, actual, narrow, doorIssues, etcShare };
}

/** 앞 띠 순서와 뒤 띠 순서로 만든 배치 서명(비슷한 안을 한 번만 보여 주려고). */
// 위아래로 쌓은 순서만 다른 안은 같은 배치로 본다.
export const signature = (layout) => {
  const rooms = layout.rooms.filter((r) => r.type !== '발코니' && r.type !== '실외기실' && r.type !== '기타');
  const front = rooms.filter((r) => r.y + r.h > layout.D - 1e-6).sort((a, b) => a.x - b.x).map((r) => r.key);
  const back = rooms.filter((r) => r.y < 1e-6).sort((a, b) => a.x - b.x || a.key.localeCompare(b.key)).map((r) => r.key);
  return `${front.join(',')}|${back.join(',')}`;
};

/**
 * 최적화. 반환: 서로 다른 배치의 상위 count개 [{ layout, params, ...scoreLayout }]
 */
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** 평면 스냅샷(점수 없이 배치만). */
export const snapshot = (layout) => ({ W: layout.W, D: layout.D, rooms: layout.rooms.map(({ key, type, name, x, y, w, h }) => ({ key, type, name, x, y, w, h })) });

/**
 * timeline(선택): 계산 시간에 따른 과정 기록. { improvements: [{ t, evals, phase, layout }], pace: [[t, evals]], randomEnd, total }
 * improvements는 '지금까지 가장 나은 안'이 바뀐 순간과 그때의 평면이다(점수는 담지 않는다).
 */
export function optimize(spec, { seed = 1, random = 400, refine = 400, count = 3, onProgress, gallery = null, timeline = null, onEvent = null } = {}) {
  const r = rng(seed);
  const total = random + refine;
  const pool = [];
  let done = 0;
  const t0 = clock();
  let bestObj = -Infinity;
  if (timeline) Object.assign(timeline, { improvements: [], pace: [[0, 0]], randomEnd: null, total: null });
  const tick = () => {
    done++;
    if (onProgress && done % 20 === 0) onProgress(done / total);
  };
  const tryParams = (params) => {
    const layout = buildLayout(spec, params);
    const s = scoreLayout(spec, layout);
    tick();
    // 탐색 과정 보기용: 일정 간격으로 만든 후보를 모은다(점수 없이 배치만).
    if (gallery && done % Math.max(1, Math.floor(total / 24)) === 0 && gallery.length < 24)
      gallery.push({ W: layout.W, D: layout.D, rooms: layout.rooms.map(({ key, type, name, x, y, w, h }) => ({ key, type, name, x, y, w, h })), signature: signature(layout), index: done, phase: done <= random ? '무작위' : '다듬기' });
    if (s) pool.push({ layout, params, ...s, signature: signature(layout) });
    // (보기용 기록) 평가 한 번의 결과
    if (onEvent) {
      if (s && s.objective > (onEvent.best ?? -Infinity)) onEvent.best = s.objective;
      onEvent({ type: 'model', i: done, phase: done <= random ? 'random' : 'local', objective: s ? s.objective : null, rules: s ? s.rules : null, fit: s ? s.fit : null, narrow: s ? s.narrow : null, best: onEvent.best ?? null, params: { depth: params.depth, frontShare: params.frontShare, bedWidth: params.bedWidth, masterDepth: params.masterDepth }, layout: snapshot(layout) });
    }
    if (timeline) {
      const t = clock() - t0;
      if (done % 10 === 0) timeline.pace.push([t, done]);
      if (s && s.objective > bestObj) {
        bestObj = s.objective;
        timeline.improvements.push({ t, evals: done, phase: done <= random ? '무작위 탐색' : '다듬기', signature: signature(layout), layout: snapshot(layout) });
      }
    }
    return s;
  };
  for (let i = 0; i < random; i++) tryParams(randomParams(spec, r));
  if (timeline) timeline.randomEnd = clock() - t0;
  // 국소 탐색: 서명이 다른 상위 안 몇 개를 각각 다듬는다.
  const seeds = distinctTop(pool, 4);
  const per = Math.floor(refine / Math.max(1, seeds.length));
  for (const start of seeds) {
    let cur = start;
    for (let i = 0; i < per; i++) {
      const params = mutate(cur.params, spec, r);
      const s = tryParams(params);
      if (s && s.objective > cur.objective) cur = pool[pool.length - 1];
    }
  }
  onProgress?.(1);
  if (timeline) {
    timeline.total = clock() - t0;
    timeline.pace.push([timeline.total, done]);
  }
  return distinctTop(pool, count);
}

function distinctTop(pool, n) {
  const out = [];
  const seen = new Set();
  for (const c of [...pool].sort((a, b) => b.objective - a.objective)) {
    if (seen.has(c.signature)) continue;
    seen.add(c.signature);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

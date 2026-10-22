// 판상형 평면의 실 배치(어느 실이 앞·뒤 띠의 몇 번째 칸에 가는가)를 QUBO로 만든다.
// 변수 x(r,s) = 1이면 실 r이 칸 s에 간다(앞 띠 실 × 앞 띠 칸, 뒤 띠 실 × 뒤 띠 칸: 띠별 이차 배정 문제, QAP).
// 에너지 = 띠·칸마다 하나씩(원-핫) 벌점 + 실 쌍의 인접 보상·감점(이차) + 실의 위치 선호(일차). 낮을수록 좋다.
// 정식화: Lucas 2014(Front. Phys.), Glover·Kochenberger·Du 2019(4OR) QUBO 튜토리얼의 배정 문제 형식.
// 벌점 계수는 '유효한 최소값'(한 변수를 뒤집을 때 목적함수가 바뀔 수 있는 최대폭 + 1)을 쓴다(Ayodele 2022, EvoCOP:
// 너무 큰 벌점은 해의 질을 떨어뜨린다). 너비·깊이처럼 연속인 값과 공간구문 통합도는 QUBO에 넣지 않고,
// 해를 판상형 문법(layout.js)으로 풀어 낸 뒤 평가 모델이 채점한다.
import { programOf } from './layout.js';

/** 선호(사양의 prefs)에 따라 커지는 항의 배수. */
const boost = (spec, key, k = 1.6) => (spec.prefs.includes(key) ? k : 1);

/** 앞 띠에 놓을 침실 수: 최소 폭(안방 3.0, 거실 3.6, 작은방 2.6m)으로 앞 띠 폭(전용 ÷ 깊이 약 7m, 생성 평면의 깊이 7.0~9.8m 중 얕은 쪽)에 들어가는 만큼. */
export function frontBedCount(spec) {
  const W = spec.area / (7.0 * Math.sqrt(spec.area / 84) ** 0.6);
  let k = spec.bedrooms - 1; // 안방 외 작은방
  while (k > 0 && 3.0 + 3.6 + 2.6 * k > W) k--;
  return k;
}

/**
 * QUBO를 만든다.
 * 반환: { n, vars: [{ room, slot, band }], diag: Float64Array, M: Float64Array(n*n, 대칭, 대각 0), offset,
 *         bands: { front: { rooms, slots }, back: { rooms, slots } }, groups: 원-핫 묶음 목록, penalty, terms }
 */
export function buildQubo(spec, { frontBeds = null } = {}) {
  const program = programOf(spec);
  const by = Object.fromEntries(program.map((r) => [r.key, r]));
  const kFront = frontBeds ?? frontBedCount(spec);
  const others = program.filter((r) => r.type === '침실' && r.key !== 'master');
  const frontRooms = ['living', 'master', ...others.slice(0, kFront).map((r) => r.key)];
  // 부부욕실·드레스룸은 안방 뒤에 붙으므로 변수에서 뺀다.
  const backRooms = ['kitchen', 'entrance', 'bathPublic', ...(by.multi ? ['multi'] : []), ...others.slice(kFront).map((r) => r.key)];
  const m = frontRooms.length;
  const k = backRooms.length;

  const vars = [];
  const idx = {};
  for (const band of ['front', 'back']) {
    const rooms = band === 'front' ? frontRooms : backRooms;
    const slots = band === 'front' ? m : k;
    for (const r of rooms) for (let s = 0; s < slots; s++) idx[`${r}@${band}${s}`] = vars.push({ room: r, slot: s, band }) - 1;
  }
  const n = vars.length;
  const diag = new Float64Array(n);
  const M = new Float64Array(n * n);
  const v = (r, band, s) => idx[`${r}@${band}${s}`];
  const addPair = (a, b, w) => {
    if (a === undefined || b === undefined || a === b) return;
    M[a * n + b] += w;
    M[b * n + a] += w;
  };
  const terms = [];

  // 칸의 기하(0~1 폭으로 정규화): 앞 칸 i는 [i/m, (i+1)/m], 뒤 칸 j는 [j/k, (j+1)/k]. 위아래로 겹치는 비율 = 맞닿음.
  const ov = (i, j) => Math.max(0, Math.min((i + 1) / m, (j + 1) / k) - Math.max(i / m, j / k)) / Math.min(1 / m, 1 / k);
  const beds = frontRooms.filter((r) => r !== 'living');
  const backBeds = backRooms.filter((r) => r.startsWith('bed'));

  // ---- 이차 항: 앞–뒤(위아래로 맞닿음) ----
  const vertical = (front, back, w, why) => {
    terms.push({ kind: 'vertical', front, back, w, why });
    for (let i = 0; i < m; i++) for (let j = 0; j < k; j++) if (ov(i, j) > 0) addPair(v(front, 'front', i), v(back, 'back', j), w * ov(i, j));
  };
  // ---- 이차 항: 같은 띠에서 옆 칸 ----
  const beside = (band, a, b, w, why) => {
    terms.push({ kind: 'beside', band, a, b, w, why });
    const slots = band === 'front' ? m : k;
    for (let s = 0; s + 1 < slots; s++) {
      addPair(v(a, band, s), v(b, band, s + 1), w);
      addPair(v(a, band, s + 1), v(b, band, s), w);
    }
  };
  // ---- 일차 항 ----
  const at = (band, r, f, why) => {
    terms.push({ kind: 'position', band, room: r, why });
    const slots = band === 'front' ? m : k;
    for (let s = 0; s < slots; s++) {
      const i = v(r, band, s);
      if (i !== undefined) diag[i] += f(s, slots);
    }
  };

  vertical('living', 'kitchen', -8 * boost(spec, 'kitchenLink'), '주방–거실 맞닿음(규칙 kitchenLiving; Byun & Choi 2016)');
  vertical('living', 'entrance', -5 * boost(spec, 'entryNear'), '현관–거실(규칙 livingNear·entry; Seo 2007)');
  beside('back', 'entrance', 'kitchen', -5 * boost(spec, 'entryNear'), '현관–주방 옆(현관이 공용 공간으로 열림)');
  beside('back', 'bathPublic', 'kitchen', -3, '공용욕실이 공용 공간에 닿음(규칙 publicBath)');
  beside('back', 'bathPublic', 'entrance', -3, '공용욕실이 현관에 닿음(규칙 publicBath)');
  vertical('living', 'bathPublic', -2, '공용욕실이 거실에 닿음');
  if (by.multi) beside('back', 'multi', 'kitchen', -3, '다목적실(팬트리)이 주방 옆');
  for (const b of beds) vertical(b, 'entrance', 4 * boost(spec, 'privacy'), '침실이 현관과 맞닿지 않게(공·사 깊이; Park et al. 2024)');
  for (const bb of backBeds) {
    beside('back', bb, 'entrance', 3 * boost(spec, 'privacy'), '뒤쪽 침실이 현관 옆이 아니게');
    for (const b of beds) vertical(b, bb, -2, '뒤쪽 침실이 다른 침실 뒤(복도로 묶임)');
    beside('back', bb, 'kitchen', 2 * boost(spec, 'quiet'), '뒤쪽 침실이 주방 옆이 아니게(방음)');
  }
  for (const b of beds) beside('front', b, 'living', 1.5 * boost(spec, 'quiet', 2), '침실이 거실과 벽을 덜 맞대게(방음 근사)');
  for (let a = 0; a < beds.length; a++) for (let b = a + 1; b < beds.length; b++) beside('front', beds[a], beds[b], 0.8 * boost(spec, 'quiet', 2), '침실끼리 벽을 덜 맞대게(방음 근사)');

  at('front', 'living', (s, S) => 6 * boost(spec, 'livingCentral') * Math.abs((s + 0.5) / S - 0.5), '거실이 가운데(거실 중심형; Hillier 1987, Choi 2014)');
  at('front', 'master', (s, S) => (s === 0 || s === S - 1 ? 0 : 6), '안방은 끝 칸(부속실을 뒤에 붙임)');
  at('back', 'entrance', (s, S) => (s === 0 || s === S - 1 ? 1.5 : 0), '현관은 가운데 쪽(거실·주방과 가깝게)');

  // ---- 원-핫 벌점: 실마다 칸 하나, 칸마다 실 하나 ----
  // 벌점 계수 = 1 + 한 변수가 받는 목적함수 계수 절댓값 합의 최댓값(뒤집기 한 번으로 얻을 수 있는 최대 이득).
  let maxGain = 0;
  for (let i = 0; i < n; i++) {
    let g = Math.abs(diag[i]);
    for (let j = 0; j < n; j++) g += Math.abs(M[i * n + j]);
    maxGain = Math.max(maxGain, g);
  }
  const penalty = Math.ceil(maxGain + 1);
  const groups = [];
  for (const band of ['front', 'back']) {
    const rooms = band === 'front' ? frontRooms : backRooms;
    const slots = band === 'front' ? m : k;
    for (const r of rooms) groups.push(Array.from({ length: slots }, (_, s) => v(r, band, s)));
    for (let s = 0; s < slots; s++) groups.push(rooms.map((r) => v(r, band, s)));
  }
  let offset = 0;
  for (const g of groups) {
    // P(Σx − 1)² = P(−Σx + 2Σ_{a<b} x_a x_b + 1)  (이진 변수)
    for (const a of g) diag[a] -= penalty;
    for (let p = 0; p < g.length; p++) for (let q = p + 1; q < g.length; q++) addPair(g[p], g[q], 2 * penalty);
    offset += penalty;
  }
  return { n, vars, diag, M, offset, bands: { front: { rooms: frontRooms, slots: m }, back: { rooms: backRooms, slots: k } }, groups, penalty, terms, frontBeds: kFront };
}

/** 에너지 E(x) = offset + Σ diag·x + Σ_{i<j} M_ij x_i x_j */
export function energy(q, x) {
  let e = q.offset;
  const { n, diag, M } = q;
  for (let i = 0; i < n; i++) {
    if (!x[i]) continue;
    e += diag[i];
    for (let j = i + 1; j < n; j++) if (x[j]) e += M[i * n + j];
  }
  return e;
}

/** 원-핫 제약을 모두 지키는가. */
export const feasible = (q, x) => q.groups.every((g) => g.reduce((s, i) => s + x[i], 0) === 1);

/**
 * 해 → 앞·뒤 띠 순서. 제약을 어긴 해는 '가장 많이 켜진 쪽부터 남은 칸에 배정'하는 탐욕 복구를 한다.
 * 안방이 가운데에 오면 가까운 끝으로 옮긴다(부속실을 뒤에 붙이려면 끝이어야 함).
 */
export function decode(q, x) {
  const order = {};
  let repaired = !feasible(q, x);
  for (const band of ['front', 'back']) {
    const { rooms, slots } = q.bands[band];
    const seq = Array(slots).fill(null);
    const left = new Set(rooms);
    const cand = [];
    q.vars.forEach((vr, i) => vr.band === band && x[i] && cand.push(vr));
    for (const c of cand) if (seq[c.slot] === null && left.has(c.room)) (seq[c.slot] = c.room), left.delete(c.room);
    for (let s = 0; s < slots; s++) if (seq[s] === null) seq[s] = [...left].shift(), left.delete(seq[s]);
    order[band] = seq;
  }
  const f = order.front;
  const mi = f.indexOf('master');
  if (mi > 0 && mi < f.length - 1) {
    f.splice(mi, 1);
    if (mi < f.length / 2) f.unshift('master');
    else f.push('master');
    repaired = true;
  }
  return { front: f, back: order.back, repaired };
}

/** 앞·뒤 순서 → 해 벡터(정확해 열거와 시험에 쓴다). */
export function encode(q, front, back) {
  const x = new Uint8Array(q.n);
  q.vars.forEach((vr, i) => {
    const seq = vr.band === 'front' ? front : back;
    if (seq[vr.slot] === vr.room) x[i] = 1;
  });
  return x;
}

/** D-Wave(dimod) BinaryQuadraticModel.to_serializable()에 가까운 JSON. 변수 이름은 '실@띠칸'. */
export function toBqmJson(q) {
  const name = (i) => `${q.vars[i].room}@${q.vars[i].band}${q.vars[i].slot}`;
  const linear = {};
  const quadratic = [];
  for (let i = 0; i < q.n; i++) {
    linear[name(i)] = q.diag[i];
    for (let j = i + 1; j < q.n; j++) if (q.M[i * q.n + j]) quadratic.push([name(i), name(j), q.M[i * q.n + j]]);
  }
  return { vartype: 'BINARY', offset: q.offset, linear, quadratic, penalty: q.penalty, groups: q.groups.map((g) => g.map(name)) };
}

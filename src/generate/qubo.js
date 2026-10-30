// 판상형 평면의 실 배치(어느 실이 앞·뒤 띠의 몇 번째 칸에 가는가)를 QUBO로 만든다.
// 변수 x(r,s) = 1이면 실 r이 칸 s에 간다(앞 띠 실 × 앞 띠 칸, 뒤 띠 실 × 뒤 띠 칸: 띠별 이차 배정 문제, QAP).
// 에너지 = 띠·칸마다 하나씩(원-핫) 벌점 + 실 쌍의 인접 보상·감점(이차) + 실의 위치 선호(일차). 낮을수록 좋다.
// 정식화: Lucas 2014(Front. Phys.), Glover·Kochenberger·Du 2019(4OR) QUBO 튜토리얼의 배정 문제 형식.
// 벌점 계수는 한 변수를 뒤집을 때 목적함수가 바뀔 수 있는 최대폭 + 1(보수적 상한, 이 도구가 정함). Ayodele 2022(EvoCOP)는
// 벌점이 너무 작으면 실행 불가능한 해, 너무 크면 느린 수렴이 생기며 최선의 설정은 문제·풀이기마다 다르다고 보고했다. 너비·깊이처럼 연속인 값과 공간구문 통합도는 QUBO에 넣지 않고,
// 해를 판상형 문법(layout.js)으로 풀어 낸 뒤 적합성(규칙·면적·선호)으로 고른다.
import { programOf } from './layout.js';
import { SYNTAX, SYNTAX_LAMBDA } from './syntax-weights.js';

/**
 * QUBO 항 목록. hand = 손으로 정한 가중치(근거: 시공 가능성 규칙·문헌), pref = 그 선호를 고르면 곱하는 배수.
 * 에너지 = Σ_t w_t · φ_t(x) + 원-핫 벌점이라 가중치에 대해 선형이다. hand가 0인 항은 공간구문 대리 항에서만 쓰는 후보 항이다.
 */
export const TERMS = [
  { id: 'kitchenLiving', hand: -8, pref: ['kitchenLink', 1.6], label: '주방–거실 맞닿음', why: '규칙 kitchenLiving; Byun & Choi 2016' },
  { id: 'entranceLiving', hand: -5, pref: ['entryNear', 1.6], label: '현관–거실 맞닿음', why: '규칙 livingNear·entry; Seo 2007' },
  { id: 'entranceKitchen', hand: -5, pref: ['entryNear', 1.6], label: '현관–주방 옆', why: '현관이 공용 공간으로 열림' },
  { id: 'bathKitchen', hand: -3, label: '공용욕실–주방 옆', why: '규칙 publicBath' },
  { id: 'bathEntrance', hand: -3, label: '공용욕실–현관 옆', why: '규칙 publicBath' },
  { id: 'bathLiving', hand: -2, label: '공용욕실–거실 맞닿음', why: '공용욕실이 공용 공간에 닿음' },
  { id: 'multiKitchen', hand: -3, label: '다목적실–주방 옆', why: '팬트리' },
  { id: 'bedEntrance', hand: 4, pref: ['privacy', 1.6], label: '침실–현관 맞닿음', why: '공·사 깊이; Park et al. 2024' },
  { id: 'backBedEntrance', hand: 3, pref: ['privacy', 1.6], label: '뒤 침실–현관 옆', why: '사생활' },
  { id: 'backBedUnderBed', hand: -2, label: '뒤 침실이 앞 침실 뒤', why: '복도로 묶임' },
  { id: 'backBedKitchen', hand: 2, pref: ['quiet', 1.6], label: '뒤 침실–주방 옆', why: '방음' },
  { id: 'bedLiving', hand: 1.5, pref: ['quiet', 2], label: '침실–거실 옆', why: '방음 근사' },
  { id: 'bedBed', hand: 0.8, pref: ['quiet', 2], label: '침실끼리 옆', why: '방음 근사' },
  { id: 'livingOffCenter', hand: 6, pref: ['livingCentral', 1.6], label: '거실이 가운데에서 먼 정도', why: '거실 중심형; Hillier 1987, Choi 2014' },
  { id: 'masterNotEnd', hand: 6, label: '안방이 끝 칸이 아님', why: '부속실을 뒤에 붙임' },
  { id: 'entranceEnd', hand: 1.5, label: '현관이 끝 칸', why: '거실·주방과 가깝게' },
  { id: 'kitchenEnd', hand: 0, label: '주방이 끝 칸', why: '대리 항 후보' },
  { id: 'backBedEnd', hand: 0, label: '뒤 침실이 끝 칸', why: '대리 항 후보(외기 접면)' },
  { id: 'masterKitchen', hand: 0, label: '안방–주방 맞닿음', why: '대리 항 후보' },
  { id: 'bedOverBath', hand: 0, label: '앞 침실–공용욕실 맞닿음', why: '대리 항 후보' },
  { id: 'bath3Bed', hand: -2, label: '욕실3–앞 침실 맞닿음', why: '화장실 3개 평면의 침실 쪽 욕실(욕실3이 있을 때만)' },
];

/** 가중치 세트: 'hand'(기본) | { id: w }. */
export function weightsOf(set = 'hand') {
  if (set && typeof set === 'object') return set;
  return Object.fromEntries(TERMS.map((t) => [t.id, t.hand]));
}

/**
 * 공간구문 대리 항 더하기: 고른 공간구문 선호(거실 중심·사생활·대면형 주방)마다 해당 변수의 대리 가중치 v를
 * λ·s배 해서 더한다(E = E_기본 + λ·s·Σ v_t φ_t, s = ‖w_기본‖₁/‖v‖₁). v는 SCI(E) 논문의 공간구문 변수를
 * 분석(spa.js) 규약으로 정확히 계산해 φ로 회귀한 것(scripts/syntax-surrogate.mjs, evidence/results/syntax-surrogate.md).
 * 반환: { weights, added: [{ key, label, pref, refs, scale }] }
 */
export function withSyntax(W, prefs = [], { lambda = SYNTAX_LAMBDA } = {}) {
  const added = [];
  const out = { ...W };
  const l1 = (o) => Object.values(o).reduce((s, x) => s + Math.abs(x || 0), 0);
  const base = l1(W);
  for (const [key, v] of Object.entries(SYNTAX || {})) {
    if (!prefs.includes(v.pref)) continue;
    const scale = (lambda * base) / Math.max(1e-9, l1(v.weights));
    for (const [id, x] of Object.entries(v.weights)) out[id] = (out[id] ?? 0) + scale * x;
    added.push({ key, label: v.label, pref: v.pref, refs: v.refs, scale });
  }
  return { weights: out, added };
}

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
export function buildQubo(spec, { frontBeds = null, weights = 'hand', syntax = true } = {}) {
  // 공간구문 대리 항은 정해진 가중치 세트(손)에만 더한다(직접 준 가중치 객체는 그대로).
  const sx = syntax && typeof weights === 'string' ? withSyntax(weightsOf(weights), spec.prefs || []) : { weights: weightsOf(weights), added: [] };
  const W = sx.weights;
  const program = programOf(spec);
  const by = Object.fromEntries(program.map((r) => [r.key, r]));
  const kFront = frontBeds ?? frontBedCount(spec);
  const others = program.filter((r) => r.type === '침실' && r.key !== 'master');
  const frontRooms = ['living', 'master', ...others.slice(0, kFront).map((r) => r.key)];
  // 부부욕실·드레스룸은 안방 뒤에 붙으므로 변수에서 뺀다.
  const backRooms = ['kitchen', 'entrance', 'bathPublic', ...(by.bath3 ? ['bath3'] : []), ...(by.multi ? ['multi'] : []), ...others.slice(kFront).map((r) => r.key)];
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
  // 항마다 단위 기여(가중치 1, 선호 배수 포함)를 따로 모은다: φ_t(x) = Σ lin·x + Σ quad·x·x.
  const unit = Object.fromEntries(TERMS.map((t) => [t.id, { lin: new Map(), quad: new Map() }]));
  const mult = (id) => {
    const t = TERMS.find((d) => d.id === id);
    return t.pref ? boost(spec, t.pref[0], t.pref[1]) : 1;
  };
  const addLin = (id, i, w) => {
    if (i === undefined || !w) return;
    const u = unit[id].lin;
    u.set(i, (u.get(i) || 0) + w * mult(id));
  };
  const addQuad = (id, a, b, w) => {
    if (a === undefined || b === undefined || a === b || !w) return;
    const key = a < b ? a * n + b : b * n + a;
    const u = unit[id].quad;
    u.set(key, (u.get(key) || 0) + w * mult(id));
  };

  // 칸의 기하(0~1 폭으로 정규화): 앞 칸 i는 [i/m, (i+1)/m], 뒤 칸 j는 [j/k, (j+1)/k]. 위아래로 겹치는 비율 = 맞닿음.
  const ov = (i, j) => Math.max(0, Math.min((i + 1) / m, (j + 1) / k) - Math.max(i / m, j / k)) / Math.min(1 / m, 1 / k);
  const beds = frontRooms.filter((r) => r !== 'living');
  const backBeds = backRooms.filter((r) => r.startsWith('bed'));
  const vertical = (id, front, back) => {
    for (let i = 0; i < m; i++) for (let j = 0; j < k; j++) if (ov(i, j) > 0) addQuad(id, v(front, 'front', i), v(back, 'back', j), ov(i, j));
  };
  const beside = (id, band, a, b) => {
    const slots = band === 'front' ? m : k;
    for (let s = 0; s + 1 < slots; s++) {
      addQuad(id, v(a, band, s), v(b, band, s + 1), 1);
      addQuad(id, v(a, band, s + 1), v(b, band, s), 1);
    }
  };
  const at = (id, band, r, f) => {
    const slots = band === 'front' ? m : k;
    for (let s = 0; s < slots; s++) addLin(id, v(r, band, s), f(s, slots));
  };
  const isEnd = (s, S) => s === 0 || s === S - 1;

  vertical('kitchenLiving', 'living', 'kitchen');
  vertical('entranceLiving', 'living', 'entrance');
  beside('entranceKitchen', 'back', 'entrance', 'kitchen');
  beside('bathKitchen', 'back', 'bathPublic', 'kitchen');
  beside('bathEntrance', 'back', 'bathPublic', 'entrance');
  vertical('bathLiving', 'living', 'bathPublic');
  if (by.multi) beside('multiKitchen', 'back', 'multi', 'kitchen');
  for (const b of beds) vertical('bedEntrance', b, 'entrance');
  for (const bb of backBeds) {
    beside('backBedEntrance', 'back', bb, 'entrance');
    for (const b of beds) vertical('backBedUnderBed', b, bb);
    beside('backBedKitchen', 'back', bb, 'kitchen');
    at('backBedEnd', 'back', bb, (s, S) => (isEnd(s, S) ? 1 : 0));
  }
  for (const b of beds) if (b !== 'master') vertical('bedOverBath', b, 'bathPublic');
  for (const b of beds) if (b !== 'master') vertical('bath3Bed', b, 'bath3');
  for (const b of beds) beside('bedLiving', 'front', b, 'living');
  for (let a = 0; a < beds.length; a++) for (let b = a + 1; b < beds.length; b++) beside('bedBed', 'front', beds[a], beds[b]);
  vertical('masterKitchen', 'master', 'kitchen');
  at('livingOffCenter', 'front', 'living', (s, S) => Math.abs((s + 0.5) / S - 0.5));
  at('masterNotEnd', 'front', 'master', (s, S) => (isEnd(s, S) ? 0 : 1));
  at('entranceEnd', 'back', 'entrance', (s, S) => (isEnd(s, S) ? 1 : 0));
  at('kitchenEnd', 'back', 'kitchen', (s, S) => (isEnd(s, S) ? 1 : 0));

  // 가중치를 곱해 합친다.
  const terms = [];
  for (const t of TERMS) {
    const w = W[t.id] ?? 0;
    const u = unit[t.id];
    if (!u.lin.size && !u.quad.size) continue;
    terms.push({ id: t.id, label: t.label, w, why: t.why });
    if (!w) continue;
    for (const [i, val] of u.lin) diag[i] += w * val;
    for (const [key, val] of u.quad) {
      const a = Math.floor(key / n);
      const b = key % n;
      M[a * n + b] += w * val;
      M[b * n + a] += w * val;
    }
  }

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
  return { n, vars, diag, M, offset, bands: { front: { rooms: frontRooms, slots: m }, back: { rooms: backRooms, slots: k } }, groups, penalty, terms, unit, weights: W, frontBeds: kFront, syntaxTerms: sx.added };
}

/** 해 x의 항별 단위 값 φ_t(x) (TERMS 순서). 에너지(벌점 제외) = Σ w_t φ_t. */
export function features(q, x) {
  const { n } = q;
  return TERMS.map((t) => {
    const u = q.unit[t.id];
    let f = 0;
    for (const [i, val] of u.lin) if (x[i]) f += val;
    for (const [key, val] of u.quad) if (x[Math.floor(key / n)] && x[key % n]) f += val;
    return f;
  });
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

/** 앞·뒤 순서 → 해 벡터(전수 열거와 시험에 쓴다). */
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

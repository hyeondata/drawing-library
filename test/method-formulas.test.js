// "방법과 근거" 3절의 식을 글 그대로 따로 구현해, 실제 buildQubo/energy와 같은 값을 내는지 확인한다.
// (페이지의 식이 실제 생성에 쓰이는 식과 다르면 이 테스트가 깨진다.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQubo, energy, TERMS, weightsOf, withSyntax } from '../src/generate/qubo.js';
import { programOf } from '../src/generate/layout.js';

/** 3.2·3.3절: E = Σ w_t·b_t·φ_t(x) 의 목적 부분을 (실, 칸) 이름으로만 계산 */
function pageObjective(spec, q, x) {
  const prog = programOf(spec);
  const others = prog.filter((r) => r.type === '침실' && r.key !== 'master').map((r) => r.key);
  const kf = q.frontBeds;
  const front = ['living', 'master', ...others.slice(0, kf)];
  const back = ['kitchen', 'entrance', 'bathPublic', ...(prog.some((r) => r.key === 'multi') ? ['multi'] : []), ...others.slice(kf)];
  const m = front.length;
  const k = back.length;
  const X = (room, band, s) => {
    const i = q.vars.findIndex((v) => v.room === room && v.band === band && v.slot === s);
    return i < 0 ? 0 : x[i];
  };
  const W = withSyntax(weightsOf('hand'), spec.prefs).weights; // 4.1절
  const w = (id) => {
    const t = TERMS.find((d) => d.id === id);
    return (W[id] ?? 0) * (t.pref && spec.prefs.includes(t.pref[0]) ? t.pref[1] : 1);
  };
  // ov(i, j) = 겹친 길이 ÷ 짧은 칸 폭
  const ov = (i, j) => Math.max(0, Math.min((i + 1) / m, (j + 1) / k) - Math.max(i / m, j / k)) / Math.min(1 / m, 1 / k);
  const vert = (a, b) => {
    let s = 0;
    for (let i = 0; i < m; i++) for (let j = 0; j < k; j++) s += ov(i, j) * X(a, 'front', i) * X(b, 'back', j);
    return s;
  };
  const side = (band, a, b) => {
    const S = band === 'front' ? m : k;
    let s = 0;
    for (let t = 0; t + 1 < S; t++) s += X(a, band, t) * X(b, band, t + 1) + X(a, band, t + 1) * X(b, band, t);
    return s;
  };
  const lin = (band, r, f) => {
    const S = band === 'front' ? m : k;
    let s = 0;
    for (let t = 0; t < S; t++) s += f(t, S) * X(r, band, t);
    return s;
  };
  const end = (t, S) => (t === 0 || t === S - 1 ? 1 : 0);
  const beds = front.filter((r) => r !== 'living');
  const bb = back.filter((r) => r.startsWith('bed'));
  const sum = (arr, f) => arr.reduce((s, v) => s + f(v), 0);
  const phi = {
    kitchenLiving: vert('living', 'kitchen'),
    entranceLiving: vert('living', 'entrance'),
    entranceKitchen: side('back', 'entrance', 'kitchen'),
    bathKitchen: side('back', 'bathPublic', 'kitchen'),
    bathEntrance: side('back', 'bathPublic', 'entrance'),
    bathLiving: vert('living', 'bathPublic'),
    multiKitchen: back.includes('multi') ? side('back', 'multi', 'kitchen') : 0,
    bedEntrance: sum(beds, (b) => vert(b, 'entrance')),
    backBedEntrance: sum(bb, (b) => side('back', b, 'entrance')),
    backBedUnderBed: sum(bb, (b2) => sum(beds, (b) => vert(b, b2))),
    backBedKitchen: sum(bb, (b) => side('back', b, 'kitchen')),
    backBedEnd: sum(bb, (b) => lin('back', b, end)),
    bedOverBath: sum(beds.filter((b) => b !== 'master'), (b) => vert(b, 'bathPublic')),
    bedLiving: sum(beds, (b) => side('front', b, 'living')),
    bedBed: beds.reduce((s, a, i) => s + sum(beds.slice(i + 1), (b) => side('front', a, b)), 0),
    masterKitchen: vert('master', 'kitchen'),
    livingOffCenter: lin('front', 'living', (t, S) => Math.abs((t + 0.5) / S - 0.5)),
    masterNotEnd: lin('front', 'master', (t, S) => 1 - end(t, S)),
    entranceEnd: lin('back', 'entrance', end),
    kitchenEnd: lin('back', 'kitchen', end),
  };
  return Object.entries(phi).reduce((s, [id, f]) => s + w(id) * f, 0);
}

/** 3.4절: P = ⌈1 + max_i(|q_ii| + Σ_j |q_ij|)⌉, 목적 계수는 목적 함수에서 수치로 뽑는다 */
function pagePenalty(q, f) {
  const n = q.n;
  const e = (idx) => {
    const v = new Uint8Array(n);
    for (const i of idx) v[i] = 1;
    return v;
  };
  const f0 = f(e([]));
  const d = Array.from({ length: n }, (_, i) => f(e([i])) - f0);
  let mx = 0;
  for (let i = 0; i < n; i++) {
    let g = Math.abs(d[i]);
    for (let j = 0; j < n; j++) if (j !== i) g += Math.abs(f(e([i, j])) - d[i] - d[j] - f0);
    mx = Math.max(mx, g);
  }
  return Math.ceil(1 + mx);
}

const targets = { living: 0.24, kitchen: 0.12, master: 0.15, other: 0.11, bath: 0.05, entrance: 0.04, dress: 0.04, multi: 0.04 };
const CASES = [
  { area: 59, bedrooms: 3, multi: false, prefs: [] },
  { area: 84, bedrooms: 3, multi: false, prefs: ['livingCentral', 'privacy'] },
  { area: 114, bedrooms: 4, multi: true, prefs: ['quiet', 'kitchenLink', 'entryNear'] },
];

test('방법과 근거의 QUBO 식(글 그대로 구현) = 실제 생성 코드의 에너지와 벌점', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const c of CASES) {
    const spec = { baths: 2, dress: true, outdoorUnit: false, balcony: true, targets, ...c };
    for (const frontBeds of [0, 1, null]) {
      const q = buildQubo(spec, frontBeds === null ? {} : { frontBeds });
      const f = (x) => pageObjective(spec, q, x);
      const P = pagePenalty(q, f);
      assert.equal(P, q.penalty, `${c.area} P`);
      for (let t = 0; t < 60; t++) {
        const x = Uint8Array.from({ length: q.n }, () => (rnd() < 0.35 ? 1 : 0));
        const pen = q.groups.reduce((s, g) => s + (g.reduce((a, i) => a + x[i], 0) - 1) ** 2, 0);
        assert.ok(Math.abs(f(x) + P * pen - energy(q, x)) < 1e-9, `${c.area}㎡ 배치 ${t}`);
      }
    }
  }
});

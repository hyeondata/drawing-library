// QUBO 풀이기(브라우저·Node 공용, 순수 JS). 모두 같은 시간 예산(ms)과 같은 시드로 돈다.
// 공통: 한 변수 뒤집기 변화량 Δ_i = (1−2x_i)(q_ii + Σ_j q_ij x_j), 뒤집은 뒤 Δ_i ← −Δ_i, Δ_j += (1−2x_j) q_ij (new_i − old_i).
// 비교 대상은 첨부 가이드의 최소 비교 세트(D²TS·Path Relinking·튜닝된 SA·Parallel Tempering·Simulated Bifurcation·전수 열거)와
// tabu 내장 memetic. SA는 D-Wave QPU 결과가 나오기 전까지의 '임시 대체'이며 양자 어닐링 결과가 아니다.
import { energy, feasible } from './qubo.js';
import { rng as makeRng } from './layout.js';

const realNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// 시계: 기본은 실제 시간. 평가 횟수 예산(maxEvals)으로 돌리면 '평가 횟수 × 단위 시간'이 시계가 되어 결과가 시드로 완전히 재현된다.
let now = realNow;

function deltas(q, x) {
  const { n, diag, M } = q;
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = diag[i];
    for (let j = 0; j < n; j++) if (x[j] && j !== i) s += M[i * n + j];
    d[i] = (1 - 2 * x[i]) * s;
  }
  return d;
}
function flip(q, x, d, i) {
  const { n, M } = q;
  const delta = x[i] ? -1 : 1;
  x[i] ^= 1;
  for (let j = 0; j < n; j++) if (j !== i) d[j] += (1 - 2 * x[j]) * M[i * n + j] * delta;
  d[i] = -d[i];
}
const randomX = (n, r) => Uint8Array.from({ length: n }, () => (r() < 0.5 ? 1 : 0));

/** 서로 다른 좋은 해를 모은다(디코딩해 적합성 J로 고를 후보). */
class Pool {
  constructor(size = 6) {
    this.size = size;
    this.items = [];
  }
  add(x, e) {
    const key = x.join('');
    if (this.items.some((it) => it.key === key)) return;
    this.items.push({ key, x: Uint8Array.from(x), e });
    this.items.sort((a, b) => a.e - b.e);
    if (this.items.length > this.size) this.items.pop();
  }
  get best() {
    return this.items[0];
  }
}

// ---------- 공통 tabu 탐색(한 변수 뒤집기) ----------
// tenure = c + rand(1..10), aspiration(최고 해보다 좋으면 tabu여도 허용), 개선 없이 alpha번이면 멈춤.
// 원-핫(집합 분할) 구조 QUBO에는 HMA 논문의 set-partitioning 설정(c = n/50, alpha = 15n)을 쓴다(Lü, Glover & Hao 2010).
function tabu(q, x0, r, deadline, { c = q.n / 50, alpha = 15 * q.n, onEval, ev } = {}) {
  const { n } = q;
  const x = Uint8Array.from(x0);
  const d = deltas(q, x);
  let e = energy(q, x);
  let best = { x: Uint8Array.from(x), e };
  const tabuUntil = new Int32Array(n);
  let iter = 0;
  let stall = 0;
  while (stall < alpha && now() < deadline) {
    iter++;
    let pick = -1;
    let pickD = Infinity;
    let ties = 0;
    for (let i = 0; i < n; i++) {
      const allowed = tabuUntil[i] <= iter || e + d[i] < best.e - 1e-9;
      if (!allowed) continue;
      if (d[i] < pickD - 1e-12) (pickD = d[i]), (pick = i), (ties = 1);
      else if (Math.abs(d[i] - pickD) <= 1e-12 && r() < 1 / ++ties) pick = i;
    }
    if (pick < 0) break;
    // (보기용 기록) 이번 걸음: 막혀 있었지만 최고해를 넘어서 허용됐는가(aspiration), 허용된 후보 수
    const aspiration = ev && tabuUntil[pick] > iter;
    const allowedCount = ev ? Array.from({ length: n }, (_, i) => tabuUntil[i] <= iter || e + d[i] < best.e - 1e-9).filter(Boolean).length : 0;
    const dPick = d[pick];
    e += d[pick];
    flip(q, x, d, pick);
    onEval?.();
    tabuUntil[pick] = iter + Math.floor(c) + 1 + Math.floor(r() * 10);
    if (e < best.e - 1e-9) {
      best = { x: Uint8Array.from(x), e };
      stall = 0;
    } else stall++;
    ev?.({ type: 'tabu', iter, pick, delta: dPick, e, best: best.e, tabuUntil: tabuUntil[pick], aspiration, allowed: allowedCount, stall, alpha, x: Uint8Array.from(x) });
  }
  return best;
}

// ---------- 풀이기 ----------

/** D-Wave neal/dwave-samplers 방식의 β 범위: 뜨거운 쪽 ln2/최대 변화량, 차가운 쪽 ln(100)/최소 0 아닌 변화량(1% 수용). */
function betaRange(q) {
  const { n, diag, M } = q;
  let maxD = 0;
  let minD = Infinity;
  for (let i = 0; i < n; i++) {
    let s = Math.abs(diag[i]);
    if (Math.abs(diag[i]) > 1e-9) minD = Math.min(minD, Math.abs(diag[i]));
    for (let j = 0; j < n; j++) {
      const v = Math.abs(M[i * n + j]);
      s += v;
      if (v > 1e-9) minD = Math.min(minD, v);
    }
    maxD = Math.max(maxD, s);
  }
  return [Math.log(2) / maxD, Math.log(100) / minD];
}

/**
 * SA: 무작위 시작에서 sweep 1,000번(기하 온도 스케줄)을 한 번의 재시작으로 보고, 시간이 남으면 다시 시작한다.
 * stopHits를 주면 지금까지의 최저 에너지를 그만큼의 재시작에서 다시 찾았을 때 시간 전에 멈춘다(수렴 판정).
 */
function sa(q, { r, deadline, pool, count, sweeps = 1000, ev, stopHits = null }) {
  const [b0, b1] = betaRange(q);
  const { n } = q;
  let best = Infinity;
  let hits = 0;
  do {
    const x = randomX(n, r);
    const d = deltas(q, x);
    let e = energy(q, x);
    for (let s = 0; s < sweeps; s++) {
      const beta = b0 * (b1 / b0) ** (s / (sweeps - 1)); // 기하 스케줄
      for (let i = 0; i < n; i++) {
        count();
        if (d[i] <= 0 || r() < Math.exp(-beta * d[i])) {
          e += d[i];
          flip(q, x, d, i);
        }
      }
      ev?.({ type: 'sa-sweep', sweep: s, beta, e, x: Uint8Array.from(x) });
      if (now() > deadline) break;
    }
    pool.add(x, e);
    if (e < best - 1e-9) (best = e), (hits = 1);
    else if (Math.abs(e - best) <= 1e-9) hits++;
    if (stopHits && hits >= stopHits) return { stopped: true, hits };
  } while (now() < deadline);
  return { stopped: false, hits };
}

function d2ts(q, { r, deadline, pool, count, ev }) {
  // Glover, Lü & Hao 2010: tabu와 섭동을 번갈아. 엘리트 8개, 섭동 변수 γ = n/4, 순위 선택 확률 ∝ rank^−λ (λ = 1.2), β = 0.3.
  const { n } = q;
  const elite = new Pool(8);
  const freq = new Float64Array(n);
  let x = randomX(n, r);
  while (now() < deadline) {
    const res = tabu(q, x, r, deadline, { c: n / 50, alpha: 15 * n, onEval: count, ev });
    elite.add(res.x, res.e);
    pool.add(res.x, res.e);
    for (let i = 0; i < n; i++) freq[i] += res.x[i];
    ev?.({ type: 'elite', e: res.e, elite: elite.items.map((it) => it.e), x: Uint8Array.from(res.x) });
    // 섭동: 엘리트 하나를 골라 자주 켜진(빈도 높은) 변수 위주로 γ개 뒤집기
    const base = elite.items[Math.floor(r() * elite.items.length)].x;
    x = Uint8Array.from(base);
    const maxF = Math.max(1, ...freq);
    const score = Array.from({ length: n }, (_, i) => ({ i, s: 0.3 * (freq[i] / maxF) + 0.7 * r() }));
    score.sort((a, b) => b.s - a.s);
    const gamma = Math.max(2, Math.floor(n / 4));
    const chosen = new Set();
    while (chosen.size < gamma) {
      // 순위 j(1부터)를 확률 ∝ j^−1.2로 뽑는다.
      const u = r();
      let acc = 0;
      let total = 0;
      for (let j = 1; j <= n; j++) total += j ** -1.2;
      for (let j = 1; j <= n; j++) {
        acc += j ** -1.2 / total;
        if (u <= acc) {
          chosen.add(score[j - 1].i);
          break;
        }
      }
    }
    for (const i of chosen) x[i] ^= 1;
    ev?.({ type: 'perturb', gamma, chosen: [...chosen], baseE: energy(q, base), e: energy(q, x), x: Uint8Array.from(x) });
  }
}

function pathRelinking(q, { r, deadline, pool, count, ev }) {
  // Wang, Lü, Glover & Hao 2012: 참조 집합 10개(tabu로 개선), 두 해 사이 경로의 1/3~2/3 지점을 tabu로 개선해 참조 집합을 갱신.
  const { n } = q;
  const ref = new Pool(10);
  for (let k = 0; k < 10 && now() < deadline; k++) {
    const res = tabu(q, randomX(n, r), r, deadline, { c: n / 50, alpha: 5 * n, onEval: count, ev });
    ref.add(res.x, res.e);
    pool.add(res.x, res.e);
    ev?.({ type: 'ref', k, e: res.e, refs: ref.items.map((it) => it.e), x: Uint8Array.from(res.x) });
  }
  while (now() < deadline && ref.items.length >= 2) {
    const a = ref.items[Math.floor(r() * ref.items.length)].x;
    const b = ref.items[Math.floor(r() * ref.items.length)].x;
    const diff = [];
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) diff.push(i);
    if (diff.length < 3) continue;
    const x = Uint8Array.from(a);
    const d = deltas(q, x);
    const stop = Math.floor(diff.length / 3) + Math.floor(r() * Math.max(1, Math.floor(diff.length / 3)));
    const left = new Set(diff);
    ev?.({ type: 'path-start', diff: diff.length, stop, ea: energy(q, a), eb: energy(q, b), x: Uint8Array.from(x) });
    for (let step = 0; step < stop; step++) {
      // 남은 차이 가운데 에너지를 가장 덜 올리는 변수부터 b 쪽으로
      let pick = -1;
      for (const i of left) if (pick < 0 || d[i] < d[pick]) pick = i;
      left.delete(pick);
      const dPick = d[pick];
      flip(q, x, d, pick);
      count();
      ev?.({ type: 'path', step: step + 1, stop, pick, delta: dPick, e: energy(q, x), left: left.size, x: Uint8Array.from(x) });
    }
    const res = tabu(q, x, r, deadline, { c: n / 50, alpha: 5 * n, onEval: count, ev });
    ref.add(res.x, res.e);
    pool.add(res.x, res.e);
  }
}

function memetic(q, { r, deadline, pool, count, ev }) {
  // Lü, Glover & Hao 2010 HMA: 개체 20, 균등 교차(공통 비트 유지), 자식을 tabu로 개선, 나쁜 개체와 교체.
  const { n } = q;
  const pop = new Pool(20);
  for (let k = 0; k < 20 && now() < deadline; k++) {
    const res = tabu(q, randomX(n, r), r, deadline, { c: n / 50, alpha: 3 * n, onEval: count, ev });
    pop.add(res.x, res.e);
    pool.add(res.x, res.e);
    ev?.({ type: 'pop', k, e: res.e, pop: pop.items.map((it) => it.e), x: Uint8Array.from(res.x) });
  }
  while (now() < deadline && pop.items.length >= 2) {
    const a = pop.items[Math.floor(r() * pop.items.length)].x;
    const b = pop.items[Math.floor(r() * pop.items.length)].x;
    const child = Uint8Array.from({ length: n }, (_, i) => (a[i] === b[i] ? a[i] : r() < 0.5 ? 1 : 0));
    if (ev) {
      let same = 0;
      for (let i = 0; i < n; i++) if (a[i] === b[i]) same++;
      ev({ type: 'cross', same, n, ea: energy(q, a), eb: energy(q, b), e: energy(q, child), x: Uint8Array.from(child) });
    }
    const res = tabu(q, child, r, deadline, { c: n / 50, alpha: 3 * n, onEval: count, ev });
    pop.add(res.x, res.e);
    pool.add(res.x, res.e);
  }
}

function parallelTempering(q, { r, deadline, pool, count, replicas = 8, ev }) {
  // Hukushima & Nemoto 1996 교환 몬테카를로: β 사다리(기하), 매 sweep 뒤 이웃 교환 확률 min(1, exp((β_i−β_j)(E_i−E_j))).
  const { n } = q;
  const [b0, b1] = betaRange(q);
  const betas = Array.from({ length: replicas }, (_, k) => b0 * (b1 / b0) ** (k / (replicas - 1)));
  const xs = betas.map(() => randomX(n, r));
  const ds = xs.map((x) => deltas(q, x));
  const es = xs.map((x) => energy(q, x));
  let sweep = 0;
  while (now() < deadline) {
    for (let k = 0; k < replicas; k++) {
      const x = xs[k];
      const d = ds[k];
      for (let i = 0; i < n; i++) {
        count();
        if (d[i] <= 0 || r() < Math.exp(-betas[k] * d[i])) {
          es[k] += d[i];
          flip(q, x, d, i);
        }
      }
    }
    const swaps = [];
    for (let k = sweep % 2; k + 1 < replicas; k += 2) {
      const p = Math.exp((betas[k] - betas[k + 1]) * (es[k] - es[k + 1]));
      const before = [es[k], es[k + 1]];
      let ok = false;
      if (p >= 1 || r() < p) {
        ok = true;
        [xs[k], xs[k + 1]] = [xs[k + 1], xs[k]];
        [ds[k], ds[k + 1]] = [ds[k + 1], ds[k]];
        [es[k], es[k + 1]] = [es[k + 1], es[k]];
      }
      if (ev) swaps.push({ k, p: Math.min(1, p), ok, before });
    }
    ev?.({ type: 'pt', sweep, betas, es: [...es], swaps, e: es[replicas - 1], x: Uint8Array.from(xs[replicas - 1]) });
    sweep++;
    if (sweep % 20 === 0) pool.add(xs[replicas - 1], es[replicas - 1]);
  }
  for (let k = 0; k < replicas; k++) pool.add(xs[k], es[k]);
}

function simulatedBifurcation(q, { r, deadline, pool, count, steps = 1000, dt = 0.5, ev }) {
  // Goto et al. 2021 (Sci. Adv.) discrete SB(dSB). QUBO → Ising(s = 2x − 1), 일차 항은 +1로 고정한 보조 스핀으로 넣는다.
  // y_i += (−(a0 − a(t)) x_i + c0 Σ_j K_ij sgn(x_j)) dt,  x_i += a0 y_i dt,  |x_i| > 1이면 x_i = sgn(x_i), y_i = 0.
  // a0 = 1, a(t)는 0 → 1 선형, c0 = 0.5 / (rms(K) √N). 결과는 sgn(x).
  const { n, diag, M } = q;
  const N = n + 1; // 마지막 = 보조 스핀
  const K = new Float64Array(N * N);
  // E = Σ h_i s_i + Σ_{i<j} J_ij s_i s_j + 상수,  J_ij = M_ij/4,  h_i = diag_i/2 + Σ_j M_ij/4.  SB는 −½ΣK s s를 최소화 → K = −J, K_i,aux = −h_i.
  for (let i = 0; i < n; i++) {
    let h = diag[i] / 2;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      h += M[i * n + j] / 4;
      K[i * N + j] = -M[i * n + j] / 4;
    }
    K[i * N + n] = -h;
    K[n * N + i] = -h;
  }
  let sq = 0;
  let cnt = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j && K[i * N + j]) (sq += K[i * N + j] ** 2), cnt++;
  const c0 = 0.5 / (Math.sqrt(sq / Math.max(1, cnt)) * Math.sqrt(N));
  do {
    const x = new Float64Array(N);
    const y = Float64Array.from({ length: N }, () => (r() - 0.5) * 0.2);
    x[n] = 1;
    for (let t = 0; t < steps; t++) {
      const a = t / (steps - 1);
      for (let i = 0; i < n; i++) {
        let f = 0;
        for (let j = 0; j < N; j++) if (j !== i) f += K[i * N + j] * (j === n ? 1 : Math.sign(x[j]));
        y[i] += (-(1 - a) * x[i] + c0 * f) * dt;
      }
      for (let i = 0; i < n; i++) {
        x[i] += y[i] * dt;
        if (Math.abs(x[i]) > 1) (x[i] = Math.sign(x[i])), (y[i] = 0);
      }
      count();
      if (ev && (t % 10 === 0 || t === steps - 1)) {
        const sx = Uint8Array.from({ length: n }, (_, i) => (x[i] > 0 ? 1 : 0));
        ev({ type: 'sb', t, steps, a, c0, pos: Array.from(x.slice(0, n)), e: energy(q, sx), x: sx });
      }
      if (now() > deadline) break;
    }
    const sol = Uint8Array.from({ length: n }, (_, i) => (x[i] > 0 ? 1 : 0));
    pool.add(sol, energy(q, sol));
  } while (now() < deadline);
}

function sqa(q, { r, deadline, pool, count, slices = 16, PT = 0.5, sweeps = 300, gamma0 = 2.5, gamma1 = 0.01, ev }) {
  // 경로적분 SQA(Santoro, Martoňák & Tosatti 2002): 횡자기장 이징 모형을 P개 Trotter 사본으로 옮기고
  // 사본 사이를 J⊥ = −(PT/2)·ln tanh(Γ/(PT))로 묶는다. Γ를 2.5에서 0 가까이 줄인다. 고전 컴퓨터의 양자 몬테카를로이며
  // QPU 결과가 아니다(SA보다 양자 어닐링에 가까운 대리). 결합은 최대 절댓값 1로 정규화한다.
  const { n, diag, M } = q;
  const J = new Float64Array(n * n);
  const h = new Float64Array(n);
  let scale = 0;
  for (let i = 0; i < n; i++) {
    let hi = diag[i] / 2;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      hi += M[i * n + j] / 4;
      J[i * n + j] = M[i * n + j] / 4;
      scale = Math.max(scale, Math.abs(J[i * n + j]));
    }
    h[i] = hi;
    scale = Math.max(scale, Math.abs(hi));
  }
  for (let i = 0; i < n * n; i++) J[i] /= scale;
  for (let i = 0; i < n; i++) h[i] /= scale;
  const P = slices;
  do {
    const S = Array.from({ length: P }, () => Int8Array.from({ length: n }, () => (r() < 0.5 ? 1 : -1)));
    // 사본마다 국소장 f_i = h_i + Σ_j J_ij s_j
    const F = S.map((sv) => {
      const f = Float64Array.from(h);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (j !== i) f[i] += J[i * n + j] * sv[j];
      return f;
    });
    for (let t = 0; t < sweeps; t++) {
      const G = gamma0 * (gamma1 / gamma0) ** (t / (sweeps - 1));
      const B = -0.5 * Math.log(Math.tanh(G / PT)); // 무차원 사본 결합(β·J⊥)
      for (let k = 0; k < P; k++) {
        const sv = S[k];
        const f = F[k];
        const up = S[(k + 1) % P];
        const dn = S[(k + P - 1) % P];
        for (let i = 0; i < n; i++) {
          count();
          // 뒤집을 때 변화: 고전 부분 −2 s_i f_i/(PT), 사본 결합 +2B s_i(s_i^{k−1} + s_i^{k+1})
          const d = (-2 * sv[i] * f[i]) / PT + 2 * B * sv[i] * (up[i] + dn[i]);
          if (d <= 0 || r() < Math.exp(-d)) {
            const old = sv[i];
            sv[i] = -old;
            for (let j = 0; j < n; j++) if (j !== i) f[j] += -2 * old * J[j * n + i];
          }
        }
      }
      if (ev) {
        const xsS = S.map((sv) => Uint8Array.from(sv, (v) => (v > 0 ? 1 : 0)));
        const esS = xsS.map((xx) => energy(q, xx));
        const bi = esS.indexOf(Math.min(...esS));
        ev({ type: 'sqa', t, sweeps, G, B, es: esS, e: esS[bi], x: xsS[bi] });
      }
      if (now() > deadline) break;
    }
    for (const sv of S) {
      const x = Uint8Array.from(sv, (v) => (v > 0 ? 1 : 0));
      pool.add(x, energy(q, x));
    }
  } while (now() < deadline);
}

function dwaveTabu(q, { r, deadline, pool, count, ev }) {
  // D-Wave dwave-samplers TabuSampler 방식(MST2 다중 시작 tabu, Palubeckis 2004)을 다시 구현한 것:
  // tenure = min(20, ⌊n/4⌋), 읽기마다 무작위 시작 또는 지금까지 최고해에서 출발, 읽기 하나에 시간 상한(기본 20ms)을 두고 되풀이.
  // D²TS와는 다른 알고리즘이다(섭동·엘리트 풀 없음).
  const { n } = q;
  const tenure = Math.min(20, Math.floor(n / 4));
  let best = null;
  let read = 0;
  while (now() < deadline) {
    const start = !best || read % 2 === 0 ? randomX(n, r) : Uint8Array.from(best.x);
    ev?.({ type: 'read', read, from: !best || read % 2 === 0 ? 'random' : 'best', tenure, e: energy(q, start), x: Uint8Array.from(start) });
    const readDeadline = Math.min(deadline, now() + 20);
    const res = tabu(q, start, r, readDeadline, { c: Math.max(0, tenure - 5.5), alpha: 10000, onEval: count, ev });
    if (!best || res.e < best.e) best = res;
    pool.add(res.x, res.e);
    read++;
  }
}

function cpBranchAndBound(q, { deadline, pool, count, ev }) {
  // 제약 프로그래밍식 분기한정(CP-SAT의 브라우저 안 대체). 칸을 차례로 채우며 실마다 한 번만(AllDifferent),
  // 부분 에너지 + 낙관적 하한(남은 칸마다 가능한 최소 기여 + 남은 칸 쌍의 음수 결합 최솟값)이 최고해 이상이면 가지를 자른다.
  // 진짜 CP-SAT(OR-Tools)는 내보낸 QUBO로 Python에서 돌린다(public/qubo/solve_qubo.py --solver cpsat).
  const { n, diag, M } = q;
  const slots = [];
  for (const band of ['front', 'back']) for (let s = 0; s < q.bands[band].slots; s++) slots.push({ band, s, rooms: q.bands[band].rooms });
  const varOf = new Map(q.vars.map((v, i) => [`${v.room}@${v.band}${v.slot}`, i]));
  const cand = slots.map((sl) => sl.rooms.map((room) => varOf.get(`${room}@${sl.band}${sl.s}`)));
  const S = slots.length;
  // 칸 쌍마다 가능한 가장 작은(음수) 결합
  const pairMin = Array.from({ length: S }, () => new Float64Array(S));
  for (let a = 0; a < S; a++)
    for (let b = a + 1; b < S; b++) {
      let mn = 0;
      for (const i of cand[a]) for (const j of cand[b]) mn = Math.min(mn, M[i * n + j]);
      pairMin[a][b] = mn;
    }
  let bestE = Infinity;
  const chosen = [];
  const used = new Set();
  let nodes = 0;
  let aborted = false;
  const dfs = (depth, cur) => {
    if (aborted) return;
    if (++nodes % 2048 === 0 && now() > deadline + 5000) {
      aborted = true;
      return;
    }
    count();
    if (depth === S) {
      const e = cur + q.offset;
      if (ev) {
        const xl = new Uint8Array(n);
        for (const i of chosen) xl[i] = 1;
        ev({ type: 'leaf', e, best: Math.min(bestE, e), improved: e < bestE - 1e-12, x: xl });
      }
      if (e < bestE - 1e-12) bestE = e;
      const x = new Uint8Array(n);
      for (const i of chosen) x[i] = 1;
      pool.add(x, e);
      return;
    }
    // 하한: 남은 칸마다 (가능한 실 중) 일차 + 이미 고른 변수와의 결합의 최솟값, 더하기 남은 칸 쌍의 음수 결합
    let lb = cur;
    for (let a = depth; a < S; a++) {
      let mn = Infinity;
      for (let ri = 0; ri < cand[a].length; ri++) {
        if (used.has(slots[a].band + slots[a].rooms[ri])) continue;
        const i = cand[a][ri];
        let v = diag[i];
        for (const j of chosen) v += M[i * n + j];
        if (v < mn) mn = v;
      }
      lb += mn;
      for (let b = a + 1; b < S; b++) lb += pairMin[a][b];
    }
    const pruned = lb + q.offset >= bestE - 1e-12 && pool.items.length >= pool.size;
    if (ev) {
      const xp = new Uint8Array(n);
      for (const i of chosen) xp[i] = 1;
      ev({ type: 'node', depth, slots: S, slot: depth < S ? slots[depth] : null, lb: lb + q.offset, best: bestE, pruned, e: lb + q.offset, x: xp });
    }
    if (pruned) return;
    // 값 순서: 기여가 작은 실부터
    const opts = [];
    for (let ri = 0; ri < cand[depth].length; ri++) {
      const key = slots[depth].band + slots[depth].rooms[ri];
      if (used.has(key)) continue;
      const i = cand[depth][ri];
      let v = diag[i];
      for (const j of chosen) v += M[i * n + j];
      opts.push([v, i, key]);
    }
    opts.sort((x, y) => x[0] - y[0]);
    for (const [v, i, key] of opts) {
      used.add(key);
      chosen.push(i);
      dfs(depth + 1, cur + v);
      chosen.pop();
      used.delete(key);
    }
  };
  dfs(0, 0);
  return aborted ? { skipped: '시간 초과(부분 탐색)', nodes } : { optimal: true, nodes };
}

function* permutations(list) {
  if (list.length <= 1) {
    yield list.slice();
    return;
  }
  for (let i = 0; i < list.length; i++) {
    const rest = list.slice(0, i).concat(list.slice(i + 1));
    for (const p of permutations(rest)) yield [list[i], ...p];
  }
}

function exact(q, { deadline, pool, count, ev }) {
  // 원-핫을 지키는 모든 배정(앞 m! × 뒤 k!)을 열거해 에너지 최소를 찾는다. 벌점이 유효하므로 이것이 QUBO 전역 최적해이다.
  // Gurobi·CP-SAT의 브라우저 안 대체(내보낸 모델로 Python에서 같은 최적값을 확인할 수 있다).
  const { front, back } = q.bands;
  const fact = (k) => (k <= 1 ? 1 : k * fact(k - 1));
  const total = fact(front.slots) * fact(back.slots);
  if (total > 3e6) return { skipped: `경우의 수 ${total.toLocaleString()}개로 너무 큼` };
  const idx = new Map(q.vars.map((v, i) => [`${v.room}@${v.band}${v.slot}`, i]));
  const { n, diag, M } = q;
  const backPerms = [...permutations(back.rooms)];
  let done = 0;
  for (const f of permutations(front.rooms)) {
    const onesF = f.map((room, s) => idx.get(`${room}@front${s}`));
    let eF = q.offset;
    for (let a = 0; a < onesF.length; a++) {
      eF += diag[onesF[a]];
      for (let b = a + 1; b < onesF.length; b++) eF += M[onesF[a] * n + onesF[b]];
    }
    for (const bk of backPerms) {
      const onesB = bk.map((room, s) => idx.get(`${room}@back${s}`));
      let e = eF;
      for (let a = 0; a < onesB.length; a++) {
        e += diag[onesB[a]];
        for (let b = a + 1; b < onesB.length; b++) e += M[onesB[a] * n + onesB[b]];
        for (const fa of onesF) e += M[fa * n + onesB[a]];
      }
      count();
      if (ev) {
        const xe = new Uint8Array(n);
        for (const i of onesF) xe[i] = 1;
        for (const i of onesB) xe[i] = 1;
        ev({ type: 'enum', e, best: Math.min(e, pool.items[0]?.e ?? Infinity), x: xe });
      }
      if (pool.items.length < pool.size || e < pool.items.at(-1).e) {
        const x = new Uint8Array(n);
        for (const i of onesF) x[i] = 1;
        for (const i of onesB) x[i] = 1;
        pool.add(x, e);
      }
    }
    done++;
    if (now() > deadline + 5000) return { skipped: '시간 초과', partial: done };
  }
  return { optimal: true, total };
}

/** 풀이기 목록. refs는 REFERENCES id가 아니라 이 기능의 문헌 표(evidence/10)에 대응하는 짧은 이름. */
/**
 * 화면에서 쓰는 풀이기. SA만 켠다(근거: evidence/18-SA-선택-근거.md). 나머지는 꺼 두고 실험하지 않으며 코드와 설명만 남긴다(QUBO 도면 생성 탭은 예외로 Tabu 기본).
 */
export const ACTIVE = ['sa'];

export const SOLVERS = [
  { key: 'd2ts', name: 'D²TS', full: 'Diversification-driven Tabu Search', family: '고전 메타휴리스틱(tabu)', cite: 'Glover, Lü & Hao 2010', run: d2ts },
  { key: 'pr', name: 'Path Relinking', full: 'Path Relinking (PR)', family: '고전 메타휴리스틱(tabu)', cite: 'Wang, Lü, Glover & Hao 2012', run: pathRelinking },
  { key: 'memetic', name: 'Memetic', full: 'Hybrid memetic (tabu 내장)', family: '고전 메타휴리스틱(진화+tabu)', cite: 'Lü, Glover & Hao 2010', run: memetic },
  { key: 'tabu', name: 'Tabu', full: 'Tabu (D-Wave TabuSampler 방식, MST2 다중 시작)', family: '고전 메타휴리스틱(tabu)', cite: 'Palubeckis 2004; dwave-samplers', run: dwaveTabu },
  { key: 'sa', name: 'SA', full: 'Simulated Annealing (D-Wave 기본값 방식)', family: 'QPU 임시 대체(잠정)', cite: 'Kirkpatrick et al. 1983; dwave-samplers', provisional: true, run: sa },
  { key: 'pt', name: 'Parallel Tempering', full: 'Parallel Tempering (replica exchange)', family: '고전 메타휴리스틱(MCMC)', cite: 'Hukushima & Nemoto 1996', run: parallelTempering },
  { key: 'sqa', name: 'SQA', full: '경로적분 Simulated Quantum Annealing (양자 몬테카를로)', family: 'QPU 대리(고전 양자 MC)', cite: 'Santoro et al. 2002; Martoňák et al. 2002', provisional: true, run: sqa },
  { key: 'sb', name: 'Simulated Bifurcation', full: 'discrete Simulated Bifurcation (dSB)', family: '양자영감·병렬', cite: 'Goto et al. 2019, 2021', run: simulatedBifurcation },
  { key: 'cpsat', name: 'CP-SAT 방식', full: '제약 프로그래밍 분기한정 (CP-SAT의 브라우저 대체)', family: '전역 최적해 보장(제약 프로그래밍)', cite: 'OR-Tools CP-SAT는 Python 스크립트', run: cpBranchAndBound },
  { key: 'exact', name: '전수 열거(전역 최적해)', full: '전수 열거 (Gurobi·CP-SAT 대체)', family: '전역 최적해 보장', cite: '—', run: exact },
];

/**
 * 풀이기 하나를 돌린다. 반환: { key, energy, feasible, ms, evals, samples: [{ x, e, feasible }], note }
 */
export function runSolver(key, q, { seed = 1, budgetMs = 300, maxEvals = null, onEvent = null, onTick = null, stopHits = null } = {}) {
  const solver = SOLVERS.find((s) => s.key === key);
  const r = makeRng(seed * 7919 + key.length * 104729);
  const pool = new Pool(6);
  let evals = 0;
  const wall0 = realNow();
  if (maxEvals) now = () => (evals / maxEvals) * budgetMs;
  const t0 = now();
  // 수렴 기록: 지금까지 최저 에너지가 바뀔 때마다 [경과 ms, 평가 횟수, 에너지]
  const trace = [];
  let bestSoFar = Infinity;
  const add = pool.add.bind(pool);
  pool.add = (x, e) => {
    add(x, e);
    if (e < bestSoFar - 1e-12) {
      bestSoFar = e;
      trace.push([realNow() - wall0, evals, e, Uint8Array.from(x)]);
    }
  };
  let info;
  try {
    // onEvent: 보기용 기록(코드로 보기 탭). 주지 않으면 계산은 기록 없이 똑같이 돈다.
    // onTick: 진행 표시용(QUBO 도면 생성 탭). 평가 8192회마다 시계를 보고 0.12초 넘게 지났으면 지금까지 최저 해를 알린다. 계산에는 영향 없음.
    let lastTick = 0;
    const count = onTick
      ? () => {
          evals++;
          if ((evals & 8191) === 0) {
            const t = realNow() - wall0;
            if (t - lastTick > 120) {
              lastTick = t;
              const b0 = pool.items[0];
              onTick({ evals, ms: t, budgetMs, best: b0 ? { e: b0.e, x: b0.x } : null });
            }
          }
        }
      : () => evals++;
    info = solver.run(q, { r, deadline: t0 + budgetMs, pool, count, stopHits, ev: onEvent ? (e) => onEvent({ ...e, evals }) : null }) || {};
  } finally {
    now = realNow;
  }
  const ms = realNow() - wall0;
  const samples = pool.items.map((it) => ({ x: it.x, e: it.e, feasible: feasible(q, it.x) }));
  const best = samples[0];
  return { key, energy: best ? best.e : null, feasible: best ? best.feasible : false, ms, evals, samples, info, trace };
}

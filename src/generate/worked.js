// '방법과 근거' 페이지의 계산 예제: 같은 예시 QUBO 하나에 각 알고리즘의 식을 실제 숫자로 적용한다(빌드 때 실행).
// 풀이기 내부 함수는 내보내지 않으므로, 여기서 같은 식을 그대로 다시 계산한다(solvers.js와 같은 식·같은 상수).
import { TERMS, encode, energy, features } from './qubo.js';
import { runSolver } from './solvers.js';

const f = (v, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)) : v);

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
  return { b0: Math.log(2) / maxD, b1: Math.log(100) / minD, maxD, minD };
}

/**
 * @param q 예시 QUBO, @param nameOf 실 key → 이름, @param start { front, back } 시작 배치
 */
export function workedExamples(q, nameOf, start) {
  const { n, diag, M } = q;
  const vname = (i) => `${nameOf[q.vars[i].room] ?? q.vars[i].room}@${q.vars[i].band === 'front' ? '앞' : '뒤'}${q.vars[i].slot + 1}`;
  const x0 = encode(q, start.front, start.back);
  const E0 = energy(q, x0);
  const d0 = deltas(q, x0);

  // ---- 맞닿음 비율 ov(i, j) ----
  const m = q.bands.front.slots;
  const k = q.bands.back.slots;
  const ov = (i, j) => Math.max(0, Math.min((i + 1) / m, (j + 1) / k) - Math.max(i / m, j / k)) / Math.min(1 / m, 1 / k);
  const ovTable = Array.from({ length: m }, (_, i) => Array.from({ length: k }, (_, j) => f(ov(i, j), 3)));

  // ---- 전역 최적해 배치와 항별 분해 ----
  const ex = runSolver('exact', q, { seed: 1, budgetMs: 3000 });
  const xs = ex.samples[0].x;
  const phiOf = (x) => features(q, x);
  const decomp = (x) =>
    TERMS.map((t, idx) => ({ id: t.id, label: t.label, w: q.weights[t.id] ?? 0, phi: f(phiOf(x)[idx], 3) }))
      .map((r) => ({ ...r, contrib: f(r.w * r.phi, 3) }))
      .filter((r) => r.phi !== 0);
  const startDecomp = decomp(x0);
  const optDecomp = decomp(xs);

  // ---- 벌점: 한 변수의 최대 이득 ----
  let maxGain = 0;
  let argGain = 0;
  const objOnly = (i, j) => {
    // 목적 항만의 계수(벌점 제외) = 전체 − 벌점. 벌점은 대각 −P, 같은 묶음 쌍 +2P.
    const same = q.groups.some((g) => g.includes(i) && g.includes(j));
    return i === j ? diag[i] + q.penalty * q.groups.filter((g) => g.includes(i)).length : M[i * n + j] - (same ? 2 * q.penalty : 0);
  };
  for (let i = 0; i < n; i++) {
    let g = Math.abs(objOnly(i, i));
    for (let j = 0; j < n; j++) if (j !== i) g += Math.abs(objOnly(i, j));
    if (g > maxGain) ((maxGain = g), (argGain = i));
  }

  // ---- Δ 한 개를 풀어 쓰기 ----
  // 가장 작은 Δ(가장 좋아지는, 없으면 가장 덜 나빠지는) 변수와, 켜져 있는 변수 하나(끄는 경우)
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => d0[a] - d0[b]);
  const explain = (i) => {
    const terms = [];
    for (let j = 0; j < n; j++) if (j !== i && x0[j] && Math.abs(M[i * n + j]) > 1e-12) terms.push({ j: vname(j), q: f(M[i * n + j], 3) });
    const inner = diag[i] + terms.reduce((s, t) => s + t.q, 0);
    return { var: vname(i), x: x0[i], qii: f(diag[i], 3), terms, inner: f(inner, 3), delta: f(d0[i], 3) };
  };
  const bestFlip = explain(order[0]);
  const onVar = order.find((i) => x0[i]);
  const offFlip = explain(onVar);
  const deltaTop = order.slice(0, 5).map((i) => ({ var: vname(i), x: x0[i], delta: f(d0[i], 3) }));

  // ---- 두 실 맞바꾸기(올바른 배치 → 올바른 배치): 같은 띠의 두 칸을 바꾼다 ----
  const swaps = [];
  for (const band of ['front', 'back']) {
    const seq = band === 'front' ? start.front : start.back;
    for (let a = 0; a < seq.length; a++)
      for (let b = a + 1; b < seq.length; b++) {
        const s2 = [...seq];
        [s2[a], s2[b]] = [s2[b], s2[a]];
        const xx = band === 'front' ? encode(q, s2, start.back) : encode(q, start.front, s2);
        swaps.push({ band, a: nameOf[seq[a]] ?? seq[a], b: nameOf[seq[b]] ?? seq[b], dE: f(energy(q, xx) - E0, 3) });
      }
  }
  swaps.sort((u, v) => u.dE - v.dE);

  // ---- tabu 세 걸음(같은 규칙: 허용된 변수 중 Δ 최소, aspiration, tenure = ⌊n/50⌋ + 1 + rand(0..9)) ----
  const tabuTrace = [];
  {
    const x = Uint8Array.from(x0);
    const d = deltas(q, x);
    let e = E0;
    let best = e;
    const until = new Int32Array(n);
    for (let it = 1; it <= 60; it++) {
      let pick = -1;
      for (let i = 0; i < n; i++) {
        const allowed = until[i] <= it || e + d[i] < best - 1e-9;
        if (allowed && (pick < 0 || d[i] < d[pick])) pick = i;
      }
      const dE = d[pick];
      e += dE;
      // 뒤집고 Δ 갱신
      const delta = x[pick] ? -1 : 1;
      x[pick] ^= 1;
      for (let j = 0; j < n; j++) if (j !== pick) d[j] += (1 - 2 * x[j]) * M[pick * n + j] * delta;
      d[pick] = -d[pick];
      const tenure = Math.floor(n / 50) + 1 + 4; // 예시에서는 rand(0..9) 대신 가운데 값 4
      until[pick] = it + tenure;
      best = Math.min(best, e);
      const feas = q.groups.every((g) => g.reduce((s, i) => s + x[i], 0) === 1);
      tabuTrace.push({ it, var: vname(pick), to: x[pick], dE: f(dE, 3), E: f(e, 3), tabuUntil: it + tenure, feasible: feas });
      if (feas && e < E0 - 1e-9) break; // 다시 올바른 배치에 닿았고 시작보다 좋으면 멈춤
    }
  }

  // ---- D²TS 섭동 확률 ----
  const gamma = Math.max(2, Math.floor(n / 4));
  let Z = 0;
  for (let j = 1; j <= n; j++) Z += j ** -1.2;
  const rankP = [1, 2, 3, 5, 10, n].map((j) => ({ j, p: f((j ** -1.2) / Z, 4) }));

  // ---- Path Relinking: 시작 배치 ↔ 최적 배치 ----
  const diff = [];
  for (let i = 0; i < n; i++) if (x0[i] !== xs[i]) diff.push(i);
  const prFirst = [...diff].sort((a, b) => d0[a] - d0[b])[0];
  const pr = { diff: diff.length, from: Math.floor(diff.length / 3), to: Math.floor(diff.length / 3) + Math.max(1, Math.floor(diff.length / 3)) - 1, first: prFirst !== undefined ? { var: vname(prFirst), delta: f(d0[prFirst], 3) } : null };

  // ---- Memetic 균등 교차 ----
  let same = 0;
  for (let i = 0; i < n; i++) if (x0[i] === xs[i]) same++;
  const memetic = { same, random: n - same, expectFlips: f((n - same) / 2, 1) };

  // ---- SA ----
  const br = betaRange(q);
  const sweeps = 1000;
  const betaAt = (s) => br.b0 * (br.b1 / br.b0) ** (s / (sweeps - 1));
  const upSmall = Math.min(...Array.from(d0).filter((v) => v > 1e-9));
  const sa = {
    ...Object.fromEntries(Object.entries(br).map(([kk, v]) => [kk, f(v, 5)])),
    rows: [0, 250, 500, 750, 999].map((s) => ({ s, beta: f(betaAt(s), 4), pFlip: f(Math.exp(-betaAt(s) * upSmall), 4), pObj: f(Math.exp(-betaAt(s) * 1), 4) })),
    upSmall: f(upSmall, 3),
  };

  // ---- PT ----
  const R = 8;
  const betas = Array.from({ length: R }, (_, kk) => br.b0 * (br.b1 / br.b0) ** (kk / (R - 1)));
  const Eopt = energy(q, xs);
  const swapP = (a, b, Ea, Eb) => Math.min(1, Math.exp((betas[a] - betas[b]) * (Ea - Eb)));
  const pt = {
    betas: betas.map((b) => f(b, 4)),
    // 차가운 사본(β 큰 쪽)이 시작 배치(E0), 그보다 뜨거운 이웃이 최적 배치(Eopt)를 갖고 있을 때 교환 확률
    E0: f(E0, 3),
    Eopt: f(Eopt, 3),
    // 뜨거운 사본(a)이 더 좋은 해(최적)를 가졌으면 항상 교환, 차가운 사본(b)이 더 좋은 해를 가졌으면 확률적으로 교환
    swaps: [[0, 1], [3, 4], [6, 7]].map(([a, b]) => ({ pair: `${a + 1}↔${b + 1}`, hotBetter: f(swapP(a, b, Eopt, E0), 4), coldBetter: f(swapP(a, b, E0, Eopt), 6) })),
  };

  // ---- SQA ----
  let scale = 0;
  for (let i = 0; i < n; i++) {
    let h = diag[i] / 2;
    for (let j = 0; j < n; j++) if (j !== i) ((h += M[i * n + j] / 4), (scale = Math.max(scale, Math.abs(M[i * n + j] / 4))));
    scale = Math.max(scale, Math.abs(h));
  }
  const PT0 = 0.5;
  const sqa = { scale: f(scale, 3), rows: [2.5, 1, 0.3, 0.1, 0.01].map((G) => ({ G, B: f(-0.5 * Math.log(Math.tanh(G / PT0)), 4) })) };

  // ---- SB(solvers.js와 같은 K) ----
  const N = n + 1;
  const K = new Float64Array(N * N);
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
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j && K[i * N + j]) ((sq += K[i * N + j] ** 2), cnt++);
  const rms = Math.sqrt(sq / Math.max(1, cnt));
  const c0 = 0.5 / (rms * Math.sqrt(N));
  // 한 걸음: 모든 x = 0, y = 0.01이고 a(t) = 0일 때 변수 하나의 y 갱신 = (−(1 − 0)·0 + c0 Σ K sgn(x)) Δt. sgn(0) = 0이라 보조 스핀 항만 남는다.
  const i0 = order[0];
  const sb = { N, rms: f(rms, 3), c0: f(c0, 5), var: vname(i0), kAux: f(K[i0 * N + n], 3), dy: f(c0 * K[i0 * N + n] * 0.5, 5) };

  // ---- CP-SAT 방식·열거 ----
  const cp = runSolver('cpsat', q, { seed: 1, budgetMs: 3000 });
  const fact = (v) => (v <= 1 ? 1 : v * fact(v - 1));
  const total = fact(m) * fact(k);
  // 가지치기 없는 전체 탐색 나무의 마디 수: 칸을 차례로 채울 때 깊이 d의 마디 수 = (앞 띠 부분 순열) × (뒤 띠 부분 순열)
  let fullNodes = 1;
  let level = 1;
  for (let dd = 0; dd < m; dd++) ((level *= m - dd), (fullNodes += level));
  for (let dd = 0; dd < k; dd++) ((level *= k - dd), (fullNodes += level));
  const cpsat = { nodes: cp.info?.nodes ?? null, fullNodes, total, energy: f(cp.energy, 3), optimal: Math.abs(cp.energy - ex.energy) < 1e-9 };

  return {
    n,
    m,
    k,
    start: { front: start.front.map((r) => nameOf[r] ?? r), back: start.back.map((r) => nameOf[r] ?? r), E: f(E0, 3) },
    opt: { E: f(ex.energy, 3) },
    ovTable,
    startDecomp,
    optDecomp,
    penalty: { maxGain: f(maxGain, 3), at: vname(argGain), P: q.penalty },
    bestFlip,
    offFlip,
    deltaTop,
    tabuTrace,
    swaps: swaps.slice(0, 4),
    swapCount: swaps.length,
    d2ts: { gamma, Z: f(Z, 3), rankP },
    pr,
    memetic,
    sa,
    pt,
    sqa,
    sb,
    cpsat,
  };
}

// =====================================================================================
// 담금질(SA)을 "한 걸음씩" 보여 주기 위한 설명용 코드
// -------------------------------------------------------------------------------------
// 이 파일은 solvers.js의 sa()와 똑같은 계산을 똑같은 순서로 합니다.
// 다만 한 번에 끝까지 돌리지 않고, 한 걸음마다 무슨 일이 일어났는지 기록을 남깁니다.
// 같은 시드로 돌리면 실제 sa()의 첫 번째 담금질과 결과가 똑같습니다(test/sa-explained.test.js로 확인).
//
// 핵심 한 줄 요약
//   · 풀어야 할 변수는 모두 0/1입니다. 예시 84㎡에서는 25개(앞 띠 4실 × 4칸 + 뒤 띠 3실 × 3칸).
//   · 25개 전체를 하나의 상태 x로 들고 다닙니다. 이 x 전체가 곧 "지금의 배치"입니다.
//   · 한 걸음에는 변수 하나만 뒤집어 볼지 정합니다. 그런데 그 판단(Δ)에
//     지금 켜져 있는 다른 변수들이 모두 들어가므로, 결국 25개가 서로 맞물려 함께 정해집니다.
//   · 25개를 한 바퀴 다 돌면 1 sweep. 이것을 1,000번 하는 동안 온도를 천천히 낮춥니다.
//   · 끝났을 때의 x(25개 전체)가 답입니다.
// =====================================================================================

import { energy } from './qubo.js';
import { rng as makeRng } from './layout.js';

/**
 * 설명용 SA를 만듭니다. 반환한 객체의 step()을 부를 때마다 한 걸음 나아가고 그 기록을 돌려줍니다.
 * @param q     buildQubo()가 만든 QUBO(변수 정보 vars, 일차 계수 diag, 이차 계수 M)
 * @param seed  난수 시드. runSolver('sa', q, { seed })와 같은 난수를 쓰도록 맞춰 두었습니다.
 */
export function createSA(q, { seed = 1, sweeps = 1000 } = {}) {
  const { n, diag, M } = q;

  // ---------------------------------------------------------------
  // 1단계. 난수 준비: 실제 풀이기(runSolver)와 같은 공식으로 시드를 만듭니다.
  //        그래야 이 설명용 코드와 실제 코드의 결과를 비교할 수 있습니다.
  // ---------------------------------------------------------------
  const random = makeRng(seed * 7919 + 'sa'.length * 104729);

  // ---------------------------------------------------------------
  // 2단계. 온도 범위 정하기(D-Wave SA의 기본 규칙과 같음)
  //   β(베타) = 1 / 온도. β가 작으면 뜨겁고(나쁜 이동도 잘 받아들임), 크면 차갑습니다.
  //   · 가장 뜨거울 때 β₀ = ln 2 ÷ (변수 하나를 뒤집을 때 생길 수 있는 가장 큰 에너지 변화)
  //       → 가장 큰 오르막도 50% 확률로 받아들일 만큼 뜨겁게 시작합니다.
  //   · 가장 차가울 때 β₁ = ln 100 ÷ (0이 아닌 가장 작은 계수)
  //       → 가장 작은 오르막도 1% 확률로만 받아들일 만큼 차갑게 끝냅니다.
  // ---------------------------------------------------------------
  let biggestChange = 0;
  let smallestCoef = Infinity;
  for (let i = 0; i < n; i++) {
    let change = Math.abs(diag[i]); // 변수 i가 받는 일차 계수
    if (Math.abs(diag[i]) > 1e-9) smallestCoef = Math.min(smallestCoef, Math.abs(diag[i]));
    for (let j = 0; j < n; j++) {
      const c = Math.abs(M[i * n + j]); // 변수 i와 j 사이의 이차 계수
      change += c;
      if (c > 1e-9) smallestCoef = Math.min(smallestCoef, c);
    }
    biggestChange = Math.max(biggestChange, change);
  }
  const betaHot = Math.log(2) / biggestChange;
  const betaCold = Math.log(100) / smallestCoef;
  // sweep 번호 s(0 ~ sweeps−1)에서의 β: 뜨거운 쪽에서 차가운 쪽으로 기하급수적으로(곱해서) 바뀝니다.
  const betaAt = (s) => betaHot * (betaCold / betaHot) ** (s / (sweeps - 1));

  // ---------------------------------------------------------------
  // 3단계. 시작 상태: 25개 변수를 모두 무작위로 0 또는 1로 둡니다.
  //        대부분 "실마다 칸 하나" 규칙(원-핫)을 어긴 엉터리 배치라 에너지가 큽니다.
  // ---------------------------------------------------------------
  const x = Uint8Array.from({ length: n }, () => (random() < 0.5 ? 1 : 0));

  // ---------------------------------------------------------------
  // 4단계. 변수마다 "지금 뒤집으면 에너지가 얼마나 바뀌나(Δ)"를 미리 계산해 둡니다.
  //   Δ_i = (1 − 2·x_i) × ( q_ii + Σ_{j≠i} q_ij · x_j )
  //   · 괄호 안: 변수 i 자신의 계수 + 지금 켜져 있는(x_j = 1) 다른 변수들과의 결합 계수 합
  //   · 앞의 (1 − 2·x_i): 꺼진 변수를 켜면 +1배, 켜진 변수를 끄면 −1배
  //   → 이 식에 다른 변수들의 현재 값이 모두 들어간다는 점이 "함께 푼다"의 핵심입니다.
  // ---------------------------------------------------------------
  const delta = new Float64Array(n);
  const recomputeDelta = (i) => {
    let inner = diag[i];
    for (let j = 0; j < n; j++) if (j !== i && x[j]) inner += M[i * n + j];
    delta[i] = (1 - 2 * x[i]) * inner;
  };
  for (let i = 0; i < n; i++) recomputeDelta(i);

  let E = energy(q, x); // 지금 상태 전체의 에너지
  let best = { E, x: Uint8Array.from(x) };
  let sweep = 0; // 지금 몇 번째 sweep인가
  let i = 0; // 이 sweep에서 몇 번째 변수를 볼 차례인가
  let steps = 0;

  /** 변수 i를 실제로 뒤집고, 영향을 받는 다른 변수들의 Δ를 고칩니다(전체를 다시 계산하지 않아도 됨). */
  const flip = (k) => {
    const wasOn = x[k];
    x[k] ^= 1; // 0 ↔ 1
    // 변수 k가 켜지면(+1) 또는 꺼지면(−1) 다른 변수 j의 괄호 안 값이 q_jk만큼 바뀝니다.
    const sign = wasOn ? -1 : 1;
    for (let j = 0; j < n; j++) if (j !== k) delta[j] += (1 - 2 * x[j]) * M[k * n + j] * sign;
    delta[k] = -delta[k]; // 자기 자신은 방향만 반대로
  };

  /**
   * 한 걸음: 이번 차례의 변수 하나를 뒤집을지 정합니다.
   * 반환: 이번 걸음의 모든 숫자(화면에 그대로 보여 줌)
   */
  function step() {
    if (sweep >= sweeps) return null; // 담금질 끝
    const sw = sweep; // 이 걸음이 속한 sweep 번호
    const beta = betaAt(sweep);
    const k = i;
    const d = delta[k];

    // Δ가 어떻게 만들어졌는지 풀어서 기록(설명용): q_kk + 켜져 있는 변수들과의 결합
    const couplings = [];
    for (let j = 0; j < n; j++) if (j !== k && x[j] && Math.abs(M[k * n + j]) > 1e-12) couplings.push({ j, q: M[k * n + j] });

    // ---------------------------------------------------------------
    // 5단계. 받아들일지 정하기(메트로폴리스 규칙)
    //   · Δ ≤ 0(에너지가 같거나 내려감)이면 무조건 뒤집습니다.
    //   · Δ > 0(오르막)이면 확률 p = e^(−β·Δ)로만 뒤집습니다.
    //     뜨거울 때(β 작음)는 p가 커서 오르막도 자주 넘고, 차가워지면 거의 넘지 않습니다.
    //   (실제 코드와 난수 순서를 맞추려고, Δ ≤ 0일 때는 난수를 뽑지 않습니다.)
    // ---------------------------------------------------------------
    let accepted;
    let p = 1;
    let u = null;
    if (d <= 0) accepted = true;
    else {
      p = Math.exp(-beta * d);
      u = random();
      accepted = u < p;
    }
    const before = x[k];
    if (accepted) {
      E += d; // 에너지는 Δ만큼만 고치면 됩니다
      flip(k);
      if (E < best.E - 1e-12) best = { E, x: Uint8Array.from(x) };
    }

    // 다음 차례: 변수를 0번부터 n−1번까지 차례로 보고, 다 보면 다음 sweep(온도가 조금 내려감)
    i++;
    if (i >= n) {
      i = 0;
      sweep++;
    }
    steps++;
    return { step: steps, sweep: sw, k, before, delta: d, qkk: diag[k], couplings, beta, T: 1 / beta, p, u, accepted, E, bestE: best.E };
  }

  return {
    n,
    sweeps,
    x, // 지금 상태(25개 전체). 화면이 이 배열을 표로 그립니다.
    step,
    get E() {
      return E;
    },
    get best() {
      return best;
    },
    get sweep() {
      return sweep;
    },
    get next() {
      return i;
    },
    betaHot,
    betaCold,
    biggestChange,
    smallestCoef,
    betaAt,
  };
}

// QUBO 가중치를 평가 모델 점수로 다시 맞춘다(대리 모델 보정).
// 에너지(벌점 제외) = Σ_t w_t φ_t(x)라 가중치에 선형이다. 조건(평형·방 수·선호)마다 템플릿 QUBO의 배치를 열거(또는 표본)하고,
// 각 배치를 평면으로 풀어 순위 점수(평가 모델 + 목표 면적 + 선호 − 감점)를 잰다. 같은 QUBO 안에서만 에너지를 비교하므로
// 조건·템플릿별로 점수를 백분위 순위로 바꾸고 φ를 중심화한 뒤 릿지 회귀로 β를 구하고 w = −β로 둔다(낮은 에너지 = 높은 점수).
// λ는 조건 단위 교차검증(조건을 통째로 빼고 맞춤)으로 고른다. 결과: src/generate/qubo-weights.js, evidence/results/qubo-calibration.md
// 사용: node scripts/qubo-calibrate.mjs [--samples 600]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultParams, spearman } from '../src/generate/compare.js';
import { buildLayout, rng } from '../src/generate/layout.js';
import { scoreLayout } from '../src/generate/optimize.js';
import { buildQubo, decode, encode, features, frontBedCount, TERMS } from '../src/generate/qubo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const SAMPLES = arg('samples', 600);
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'public/data/baseline.json'), 'utf8'));
const targets = { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 };

// ---- 학습 조건 20개: 평형·방 수·구성·선호를 고르게 ----
const PREFS = [[], ['livingCentral', 'bath'], ['privacy', 'quiet'], ['kitchenLink', 'entryNear'], ['spacious', 'sunny', 'storage']];
const SIZES = [
  [59, 2],
  [59, 3],
  [74, 3],
  [84, 3],
  [84, 4],
  [101, 3],
  [101, 4],
  [114, 4],
];
// 20개: 크기 8가지 × 선호 5가지를 돌려 가며, 다목적실·발코니 유무도 섞는다.
const specs = Array.from({ length: 20 }, (_, i) => {
  const [area, bedrooms] = SIZES[i % SIZES.length];
  return { area, bedrooms, baths: 2, dress: true, multi: i % 3 === 0, outdoorUnit: true, balcony: i % 4 !== 3, targets, prefs: PREFS[i % PREFS.length] };
});

function* perms(list) {
  if (list.length <= 1) return yield list.slice();
  for (let i = 0; i < list.length; i++) for (const p of perms([...list.slice(0, i), ...list.slice(i + 1)])) yield [list[i], ...p];
}
const shuffle = (a, r) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const fact = (k) => (k <= 1 ? 1 : k * fact(k - 1));

// ---- 데이터 모으기 ----
const groups = []; // { spec, k, rows: [{ phi, objective }] }
const t0 = Date.now();
specs.forEach((spec, si) => {
  const kmax = frontBedCount(spec);
  for (const k of [...new Set([kmax, kmax - 1])].filter((x) => x >= 0)) {
    const q = buildQubo(spec, { frontBeds: k, weights: 'hand', syntax: false });
    const { front, back } = q.bands;
    const r = rng(1000 + si * 10 + k);
    const total = fact(front.slots) * fact(back.slots);
    const orders = [];
    if (total <= SAMPLES) for (const f of perms(front.rooms)) for (const b of perms(back.rooms)) orders.push([f, b]);
    else for (let i = 0; i < SAMPLES; i++) orders.push([shuffle(front.rooms, r), shuffle(back.rooms, r)]);
    const seen = new Set();
    const rows = [];
    for (const [f, b] of orders) {
      const d = decode(q, encode(q, f, b)); // 안방을 끝으로 옮기는 등 실제로 평면이 되는 순서
      const key = `${d.front}|${d.back}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const layout = buildLayout(spec, { ...defaultParams(spec), frontOrder: d.front, backOrder: d.back });
      const s = scoreLayout(spec, layout, baseline);
      if (!s) continue;
      rows.push({ phi: features(q, encode(q, d.front, d.back)), objective: s.objective });
    }
    groups.push({ si, k, rows });
  }
  process.stdout.write(`\r조건 ${si + 1}/${specs.length} (${Math.round((Date.now() - t0) / 1000)}초)   `);
});
console.log();

// ---- 회귀 ----
const T = TERMS.length;
const rankPct = (v) => {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const out = Array(v.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let t = i; t <= j; t++) out[idx[t][1]] = ((i + j) / 2) / Math.max(1, v.length - 1);
    i = j + 1;
  }
  return out;
};
function design(gs) {
  const X = [];
  const y = [];
  for (const g of gs) {
    if (g.rows.length < 3) continue;
    const yr = rankPct(g.rows.map((r) => r.objective));
    const mean = Array(T).fill(0);
    for (const r of g.rows) r.phi.forEach((f, t) => (mean[t] += f / g.rows.length));
    g.rows.forEach((r, i) => {
      X.push(r.phi.map((f, t) => f - mean[t]));
      y.push(yr[i] - 0.5);
    });
  }
  return { X, y };
}
function ridge(X, y, lambda) {
  // (XᵀX + λI) β = Xᵀy, 가우스 소거
  const A = Array.from({ length: T }, () => Array(T + 1).fill(0));
  for (let r = 0; r < X.length; r++)
    for (let i = 0; i < T; i++) {
      if (!X[r][i]) continue;
      for (let j = 0; j < T; j++) A[i][j] += X[r][i] * X[r][j];
      A[i][T] += X[r][i] * y[r];
    }
  for (let i = 0; i < T; i++) A[i][i] += lambda;
  for (let c2 = 0; c2 < T; c2++) {
    let p = c2;
    for (let r = c2 + 1; r < T; r++) if (Math.abs(A[r][c2]) > Math.abs(A[p][c2])) p = r;
    [A[c2], A[p]] = [A[p], A[c2]];
    for (let r = 0; r < T; r++) {
      if (r === c2 || !A[c2][c2]) continue;
      const f = A[r][c2] / A[c2][c2];
      for (let j = c2; j <= T; j++) A[r][j] -= f * A[c2][j];
    }
  }
  return A.map((row, i) => (row[i] ? row[T] / row[i] : 0));
}
// 평가: 그룹마다 ρ(에너지, 점수)와 '에너지 최소 배치의 점수 − 그룹 최고 점수'(후회)
function evaluateWeights(gs, w) {
  let rhoS = 0;
  let rhoN = 0;
  let regret = 0;
  let top = 0;
  let cnt = 0;
  for (const g of gs) {
    if (g.rows.length < 3) continue;
    const e = g.rows.map((r) => r.phi.reduce((s, f, t) => s + f * w[t], 0));
    const o = g.rows.map((r) => r.objective);
    const rr = spearman(e, o);
    if (rr !== null) (rhoS += rr), rhoN++;
    const minE = Math.min(...e);
    // 에너지 동점이면 그 가운데 평균 점수(풀이기는 동점 가운데 아무거나 낸다)
    const tied = o.filter((_, i) => Math.abs(e[i] - minE) < 1e-9);
    const chosen = tied.reduce((s, x) => s + x, 0) / tied.length;
    const best = Math.max(...o);
    regret += chosen - best;
    top += rankPct(o)[e.indexOf(minE)];
    cnt++;
  }
  return { rho: rhoS / rhoN, regret: regret / cnt, topPct: top / cnt };
}
const handW = TERMS.map((t) => t.hand);

// 직접 최적화: 학습 그룹의 평균 후회(에너지 최소 배치의 점수 − 그룹 최고)를 키우는 방향으로 가중치를 무작위 국소 탐색.
// 후회는 계단 함수라 경사가 없으므로 섭동 + 수락(개선 또는 동률이면 ρ가 나아질 때)으로 찾는다. 시작점은 손 가중치와 릿지 해.
function direct(train, starts, iters = 1500, seed = 7) {
  const r = rng(seed);
  const score = (w) => {
    const m = evaluateWeights(train, w);
    return m.regret - 2 * m.rho; // 후회를 주로, 동률이면 상관이 더 강한 쪽
  };
  let best = null;
  for (const w0 of starts) {
    let w = w0.slice();
    let sc = score(w);
    for (let it = 0; it < iters; it++) {
      const cand = w.slice();
      const kk = 1 + Math.floor(r() * 3);
      for (let t = 0; t < kk; t++) {
        const i = Math.floor(r() * T);
        cand[i] += (r() - 0.5) * 4;
      }
      const cs = score(cand);
      if (cs >= sc) (w = cand), (sc = cs);
    }
    if (!best || sc > best.sc) best = { w, sc };
  }
  return best.w;
}
const LAMBDAS = [0.01, 1, 100];
const FOLDS = 5;
const ridgeW = (gs, l) => {
  const d = design(gs);
  const w = ridge(d.X, d.y, l).map((b) => -b);
  const sc = 8 / Math.max(...w.map(Math.abs));
  return w.map((v) => v * sc);
};
const METHODS = { hand: () => handW, ...Object.fromEntries(LAMBDAS.map((l) => [`ridge λ=${l}`, (gs) => ridgeW(gs, l)])), direct: (gs) => direct(gs, [handW, ridgeW(gs, 1)]) };
const cv = {};
for (const [name, fit] of Object.entries(METHODS)) {
  const acc = { rho: 0, regret: 0, topPct: 0 };
  for (let f = 0; f < FOLDS; f++) {
    const train = groups.filter((g) => g.si % FOLDS !== f);
    const test = groups.filter((g) => g.si % FOLDS === f);
    const m = evaluateWeights(test, fit(train));
    for (const key of Object.keys(acc)) acc[key] += m[key] / FOLDS;
  }
  cv[name] = acc;
  console.log(name, JSON.stringify(acc));
}
const bestMethod = Object.keys(METHODS).filter((k) => k !== 'hand').reduce((a, b) => (cv[b].regret > cv[a].regret ? b : a));
const bestLambda = bestMethod;
const raw = METHODS[bestMethod](groups);
const scale = 8 / Math.max(...raw.map(Math.abs));
const weights = Object.fromEntries(TERMS.map((t, i) => [t.id, Math.round(raw[i] * scale * 100) / 100]));
// 아래 가중치 표는 전체 조건으로 다시 맞춘 값(최대 절댓값 8로 맞춤).
const full = { hand: evaluateWeights(groups, handW), calibrated: evaluateWeights(groups, TERMS.map((t) => weights[t.id])) };

// ---- 저장 ----
const meta = {
  generatedAt: new Date().toISOString().slice(0, 10),
  specs: specs.length,
  groups: groups.length,
  samples: groups.reduce((s, g) => s + g.rows.length, 0),
  lambda: bestLambda,
  method: bestMethod,
  cv: { hand: cv.hand, calibrated: cv[bestMethod], all: cv },
  insample: full,
};
fs.writeFileSync(
  path.join(root, 'src/generate/qubo-weights.js'),
  `// scripts/qubo-calibrate.mjs가 만든 파일(손대지 말 것). 평가 모델 점수로 다시 맞춘 QUBO 항 가중치.\n// 조건 ${meta.specs}개 × 템플릿, 배치 ${meta.samples}개, 방법 ${bestMethod}(조건 단위 ${FOLDS}겹 교차검증으로 고름).\nexport const CALIBRATED = ${JSON.stringify({ weights, meta }, null, 2)};\n`,
);
const f = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const md = [];
md.push('# QUBO 가중치 보정');
md.push('');
md.push(`\`node scripts/qubo-calibrate.mjs --samples ${SAMPLES}\`로 만든 파일입니다(${meta.generatedAt}). 조건 ${meta.specs}개(평형 59~114㎡, 방 2~4개, 선호 5가지)의 템플릿 QUBO ${meta.groups}개에서 배치 ${meta.samples.toLocaleString()}개를 열거·표본추출해 평면으로 풀고 순위 점수를 쟀습니다(${Math.round((Date.now() - t0) / 1000)}초).`);
md.push('');
md.push('두 방법을 비교했습니다. (1) 릿지: 같은 QUBO 안에서만 에너지를 비교하므로 점수를 조건·템플릿별 백분위 순위로, 항 값을 중심화해 회귀하고 w = −β(최대 절댓값 8). 전체 순서를 맞춥니다. (2) 직접: 학습 조건에서 \'에너지 최소 배치의 후회\'를 줄이도록 가중치를 무작위 국소 탐색(시작점: 손 가중치와 릿지 해). QUBO를 정확히 풀었을 때 나오는 평면을 좋게 만드는 것이 목적이라 이쪽이 실제 목표에 가깝습니다. 교차검증 후회가 가장 작은 방법을 고릅니다.');
md.push('');
md.push('## 검증: 조건을 통째로 빼고 맞춘 교차검증(5겹)');
md.push('');
md.push('| 가중치 | 에너지–점수 ρ (그룹 평균) | 에너지 최소 배치의 점수 백분위 | 에너지 최소 배치의 후회(점수 − 그룹 최고) |');
md.push('| --- | --- | --- | --- |');
md.push(`| 손으로 정한 가중치 | ${f(cv.hand.rho)} | ${f(cv.hand.topPct * 100, 1)}% | ${f(cv.hand.regret, 1)} |`);
for (const name of Object.keys(METHODS).filter((k) => k !== 'hand')) md.push(`| 보정: ${name}${name === bestMethod ? ' (선택)' : ''} | ${f(cv[name].rho)} | ${f(cv[name].topPct * 100, 1)}% | ${f(cv[name].regret, 1)} |`);
md.push('');
md.push('ρ는 음수일수록(에너지가 낮을수록 점수가 높음), 백분위는 높을수록, 후회는 0에 가까울수록 좋습니다. 후회는 QUBO를 정확히 풀었을 때(에너지 최소) 그 조건에서 가능한 최고 평면보다 순위 점수가 얼마나 낮은지입니다.');
md.push('');
md.push('## 가중치');
md.push('');
md.push('| 항 | 손 | 보정 | 설명 |');
md.push('| --- | --- | --- | --- |');
for (const t of TERMS) md.push(`| ${t.id} | ${t.hand} | ${weights[t.id]} | ${t.label} (${t.why}) |`);
md.push('');
md.push('양수는 그 배치를 피하게(에너지를 올림), 음수는 그 배치를 끌어오게 합니다. 손 가중치 0인 항은 보정에서만 쓰는 후보 항입니다.');
fs.writeFileSync(path.join(root, 'evidence/results/qubo-calibration.md'), `${md.join('\n')}\n`);
// 계산 원리 화면(/method/)의 시각화용: 항·가중치·교차검증과 한 조건(84㎡ 방 3, 첫 템플릿)의 배치별 항 값·점수
const demo = groups.find((g) => specs[g.si].area === 84 && specs[g.si].bedrooms === 3) || groups[0];
const demoSpec = specs[demo.si];
fs.writeFileSync(
  path.join(root, 'public/data/qubo-calibration.json'),
  JSON.stringify({
    terms: TERMS.map((t) => ({ id: t.id, label: t.label, hand: t.hand, calibrated: weights[t.id] })),
    method: bestMethod,
    cv: { hand: cv.hand, calibrated: cv[bestMethod] },
    demo: {
      name: `${demoSpec.area}㎡ · 방 ${demoSpec.bedrooms}개 · 앞 띠 작은방 ${demo.k}개 · 선호 ${demoSpec.prefs.join(', ') || '없음'}`,
      points: demo.rows.map((r) => ({ phi: r.phi.map((v) => Math.round(v * 1000) / 1000), objective: Math.round(r.objective * 10) / 10 })),
    },
  }),
);
console.log(md.join('\n'));

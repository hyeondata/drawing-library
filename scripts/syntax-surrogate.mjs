// 공간구문 변수의 QUBO 대리 항을 데이터로 맞춘다(생성 모델에 공간구문을 직접 넣기 위해).
// 조건 20개 × 템플릿의 배치를 평면으로 풀어, 분석기(spa.js)와 같은 규약으로 공간구문 변수를 정확히 계산하고,
// 각 변수를 QUBO 항 φ_t(x)의 선형 결합으로 회귀한다(조건·템플릿 안 백분위 순위, 중심화, 릿지).
// 대리 항 에너지 E_s(x) = Σ_t v_t φ_t(x), v = −β(낮은 에너지 = 변수가 큼). 생성 때 선호를 고르면 E = E_손 + λ·s·E_s.
// 검증: 조건 단위 5겹 교차검증 — (1) 대리 항과 실제 변수의 스피어만 ρ, (2) 에너지 최소 배치의 변수 백분위가 얼마나 오르는지와 종합 점수 비용.
// 변수와 근거(SCI(E)/SSCI): 거실/침실 통합도 비·주방/침실 통합도 비(Byun & Choi 2016, JAABE SCIE; Choi et al. 2014 SCIE),
// 거실 중심 유전형 τ(Hillier, Hanson & Graham 1987, EPB SSCI; Byun & Choi 2016), 공·사 깊이 차(Ham & Lee 2017 SCIE·SSCI; Park et al. 2024 SCIE).
// 대리 모델: Jin 2011(Swarm Evol. Comput., SCIE). 결과: src/generate/syntax-weights.js, evidence/results/syntax-surrogate.md
// 사용: node scripts/syntax-surrogate.mjs [--samples 600]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultParams, spearman } from '../src/generate/compare.js';
import { buildLayout, rng } from '../src/generate/layout.js';
import { scoreLayout } from '../src/generate/optimize.js';
import { buildQubo, decode, encode, features, frontBedCount, TERMS, weightsOf } from '../src/generate/qubo.js';
import { buildChoices } from '../src/generate/choices.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const SAMPLES = arg('samples', 600);
// 목표 면적비: 도면 생성 화면의 기본값(AI 허브 아파트 평면도 전체, 침실 3개 세대 중앙값)
const ch = buildChoices();
const b3 = ch.byBedrooms[3];
const targets = { living: ch.living[1].share, ...b3.targets, other: b3.roomSize[1].share, master: b3.roomSize[1].share * b3.master[1].ratio };

export const VARS = {
  livingBedroomRatio: { label: '거실/침실 통합도 비', pref: 'livingCentral', refs: 'Byun & Choi 2016; Choi et al. 2014' },
  genotypeTau: { label: '거실 중심 유전형 순위 부합도 τ', pref: 'livingCentral', refs: 'Hillier, Hanson & Graham 1987; Byun & Choi 2016' },
  privacyDepthGap: { label: '공·사 깊이 차', pref: 'privacy', refs: 'Ham & Lee 2017; Park et al. 2024' },
  kitchenBedroomRatio: { label: '주방/침실 통합도 비', pref: 'kitchenLink', refs: 'Byun & Choi 2016; Choi et al. 2014' },
};
const KEYS = Object.keys(VARS);

const PREFS = [[], ['livingCentral', 'bath'], ['privacy', 'quiet'], ['kitchenLink', 'entryNear'], ['spacious', 'sunny', 'storage']];
const SIZES = [[59, 2], [59, 3], [74, 3], [84, 3], [84, 4], [101, 3], [101, 4], [114, 4]];
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

// ---- 데이터 ----
const groups = [];
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
      const d = decode(q, encode(q, f, b));
      const key = `${d.front}|${d.back}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const s = scoreLayout(spec, buildLayout(spec, { ...defaultParams(spec), frontOrder: d.front, backOrder: d.back }));
      if (!s) continue;
      const sx = Object.fromEntries(KEYS.map((kk) => [kk, s.unit.features[kk]]));
      if (KEYS.some((kk) => !Number.isFinite(sx[kk]))) continue;
      rows.push({ phi: features(q, encode(q, d.front, d.back)), objective: s.objective, sx });
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
    for (let t = i; t <= j; t++) out[idx[t][1]] = (i + j) / 2 / Math.max(1, v.length - 1);
    i = j + 1;
  }
  return out;
};
function design(gs, key) {
  const X = [];
  const y = [];
  for (const g of gs) {
    if (g.rows.length < 3) continue;
    const yr = rankPct(g.rows.map((r) => r.sx[key]));
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
const hand = weightsOf('hand');
const base = TERMS.map((t) => hand[t.id] ?? 0);
const l1 = (v) => v.reduce((s, x) => s + Math.abs(x), 0);
const energyOf = (w, phi) => w.reduce((s, x, t) => s + x * phi[t], 0);

/** 그룹들에서: 대리 항 ρ, 그리고 E_손 + λ·s·E_s의 최소 배치가 갖는 변수·종합 점수 백분위 */
function evaluate(gs, key, v, lam) {
  const s = l1(base) / Math.max(1e-9, l1(v));
  const w = base.map((b, t) => b + lam * s * v[t]);
  let rho = 0;
  let nR = 0;
  let varPct = 0;
  let objPct = 0;
  let nG = 0;
  for (const g of gs) {
    if (g.rows.length < 4) continue;
    const vs = g.rows.map((r) => r.sx[key]);
    const es = g.rows.map((r) => energyOf(v, r.phi));
    const rr = spearman(es, vs);
    if (Number.isFinite(rr)) ((rho += -rr), nR++);
    const E = g.rows.map((r) => energyOf(w, r.phi));
    const minE = Math.min(...E);
    const pick = g.rows.filter((_, i) => Math.abs(E[i] - minE) < 1e-9);
    const vr = rankPct(vs);
    const orr = rankPct(g.rows.map((r) => r.objective));
    varPct += pick.reduce((a, r) => a + vr[g.rows.indexOf(r)], 0) / pick.length;
    objPct += pick.reduce((a, r) => a + orr[g.rows.indexOf(r)], 0) / pick.length;
    nG++;
  }
  return { rho: rho / nR, varPct: varPct / nG, objPct: objPct / nG };
}

const LAMBDAS = [0, 0.25, 0.5, 1, 2];
const FOLDS = 5;
const result = {};
for (const key of KEYS) {
  // 조건 단위 교차검증: 조건 si % 5로 나눔
  const agg = Object.fromEntries(LAMBDAS.map((l) => [l, { rho: 0, varPct: 0, objPct: 0 }]));
  for (let f = 0; f < FOLDS; f++) {
    const train = groups.filter((g) => g.si % FOLDS !== f);
    const test = groups.filter((g) => g.si % FOLDS === f);
    const d = design(train, key);
    const v = ridge(d.X, d.y, 1).map((b) => -b);
    for (const l of LAMBDAS) {
      const e = evaluate(test, key, v, l);
      for (const k2 of ['rho', 'varPct', 'objPct']) agg[l][k2] += e[k2] / FOLDS;
    }
  }
  const d = design(groups, key);
  const v = ridge(d.X, d.y, 1).map((b) => -b);
  result[key] = { ...VARS[key], cv: agg, weights: Object.fromEntries(TERMS.map((t, i) => [t.id, Number(v[i].toFixed(4))])) };
  console.log(key, Object.entries(agg).map(([l, a]) => `λ${l}: ρ ${a.rho.toFixed(2)} 변수 ${(a.varPct * 100).toFixed(0)}% 종합 ${(a.objPct * 100).toFixed(0)}%`).join(' | '));
}

// ---- 저장 ----
const LAMBDA_DEFAULT = 0.5;
const out = `// scripts/syntax-surrogate.mjs가 만든 파일(손대지 말 것). 공간구문 변수의 QUBO 대리 항 가중치 v(낮은 에너지 = 변수가 큼).
// 생성 때 선호를 고르면 E = E_손 + λ·s·Σ_t v_t φ_t, s = ‖w_손‖₁ / ‖v‖₁, λ = ${LAMBDA_DEFAULT}(교차검증 표 참고).
// 조건 20개 × 템플릿, 배치 ${groups.reduce((s, g) => s + g.rows.length, 0)}개.
export const SYNTAX_LAMBDA = ${LAMBDA_DEFAULT};
export const SYNTAX = ${JSON.stringify(result, null, 1)};
`;
fs.writeFileSync(path.join(root, 'src/generate/syntax-weights.js'), out);
const md = [
  '# 공간구문 대리 항(QUBO) 맞춤 결과',
  '',
  `조건 20개 × 템플릿, 배치 ${groups.reduce((s, g) => s + g.rows.length, 0)}개. 각 배치를 기본 치수 평면으로 풀어 분석기와 같은 규약(인접 그래프, 외부 노드, 덕트 제외)으로 공간구문 변수를 계산했다. 조건 단위 5겹 교차검증(빼 둔 조건에서 잰 값).`,
  '',
  '- ρ: 대리 항 에너지와 실제 변수의 스피어만 상관(부호를 바꿔 양수일수록 맞음)',
  '- 변수 백분위: E_손 + λ·s·E_s가 가장 낮은 배치의 변수 값이 그 조건 안에서 몇 백분위인가(λ = 0은 대리 항 없이 손 가중치만)',
  '- 종합 백분위: 같은 배치의 적합성 J 백분위(공간구문을 밀 때 치르는 비용)',
  '',
  '| 변수 | 근거 | ' + LAMBDAS.map((l) => `λ = ${l}`).join(' | ') + ' |',
  '| --- | --- | ' + LAMBDAS.map(() => '---').join(' | ') + ' |',
  ...KEYS.map((k) => `| ${VARS[k].label} | ${VARS[k].refs} | ` + LAMBDAS.map((l) => { const a = result[k].cv[l]; return `ρ ${a.rho.toFixed(2)} · 변수 ${(a.varPct * 100).toFixed(0)}% · 종합 ${(a.objPct * 100).toFixed(0)}%`; }).join(' | ') + ' |'),
  '',
];
fs.mkdirSync(path.join(root, 'evidence/results'), { recursive: true });
fs.writeFileSync(path.join(root, 'evidence/results/syntax-surrogate.md'), md.join('\n'));
console.log(`저장: src/generate/syntax-weights.js, evidence/results/syntax-surrogate.md (${Math.round((Date.now() - t0) / 1000)}초)`);

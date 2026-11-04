// QUBO 가중치를 한국 실제 아파트 통계로 직접 추정한다(최대 엔트로피 · 모멘트 맞춤).
//
// 생각: QUBO 에너지 E_w(x) = Σ_t w_t φ_t(x)는 볼츠만 분포 p_w(x) ∝ exp(−E_w(x))를 정한다(SA가 온도 1에서 뽑는 분포).
//   관계 r(주방–거실 맞닿음 등)이 생성 평면에 나타나는 기대 빈도 E_{p_w}[m_r]가 실제 아파트 빈도 T_r과 같아지도록 w를 고른다.
//   제약이 '빈도를 맞춘다'뿐일 때 엔트로피가 가장 큰 분포가 바로 이 지수형이다(Jaynes 1957; 최대 엔트로피 = 지수족의 최대우도).
//   그러면 가중치의 부호와 크기가 모두 실제 데이터에서 나오고, QUBO 최저 에너지 해는 '실제 한국 평면 분포의 최빈 배치'가 된다.
// 데이터: 실제 = 개발(dev) 묶음의 서로 다른 평면(data/split.json, baseline-units.jsonl), 침실 수별 빈도.
//   검증(test) 묶음은 맞춤에 쓰지 않고 마지막 대조에만 쓴다.
// 생성: 조건 20개 × 템플릿마다 방 순서를 열거(또는 표본)하고, 평면으로 풀어 실제와 같은 relations()로 잰다.
// 규칙 항: masterNotEnd(안방은 끝, decode가 강제)와 backBedUnderBed(실제 도면에서 잴 수 없음)는 맞추지 않고 손 가중치로 고정한다.
// 결과: src/generate/qubo-weights-maxent.js, evidence/results/qubo-maxent.md/.json
// 사용: node scripts/qubo-maxent.mjs [--samples 600] [--threads 8]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};

// 항 ↔ 실제 도면에서 잴 수 있는 관계. sign: 관계가 켜진 상태가 항을 켜는가(+1) 끄는가(−1)
export const LINK = {
  kitchenLiving: 'kitchenLiving',
  entranceLiving: 'entranceLiving',
  entranceKitchen: 'entranceKitchen',
  bathKitchen: 'bathKitchen',
  bathEntrance: 'bathEntrance',
  bathLiving: 'bathLiving',
  multiKitchen: 'multiKitchen',
  bedEntrance: 'bedEntrance',
  backBedEntrance: 'bedEntrance',
  backBedKitchen: 'backBedKitchen',
  bedLiving: 'bedLiving',
  bedBed: 'bedBed',
  livingOffCenter: 'livingOffCenter',
  entranceEnd: 'entranceEnd',
  kitchenEnd: 'kitchenEnd',
  backBedEnd: 'otherBedEnd',
  masterKitchen: 'masterKitchen',
  bedOverBath: 'bedOverBath',
};
export const FIXED = ['masterNotEnd', 'backBedUnderBed']; // 규칙 항(맞추지 않음)
const REL = [...new Set(Object.values(LINK))];

// ---------------- worker: 조건 하나 측정 ----------------
if (!isMainThread) {
  const { si, samples } = workerData;
  const { defaultParams } = await import('../src/generate/compare.js');
  const { buildLayout, rng, toLabel } = await import('../src/generate/layout.js');
  const { buildQubo, decode, encode, features, frontBedCount, TERMS } = await import('../src/generate/qubo.js');
  const { analyze } = await import('../src/model/index.js');
  const { relations, specs } = await import('./lib/term-measure.mjs');
  const spec0 = specs[si];
  const spec = { ...spec0, prefs: [] }; // 기본 가중치는 선호 없이 맞춘다(선호는 사용자가 고르는 편차)
  const out = [];
  const kmax = frontBedCount(spec);
  const shuffle = (a, r) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  function* perms(list) {
    if (list.length <= 1) return yield list.slice();
    for (let i = 0; i < list.length; i++) for (const p of perms([...list.slice(0, i), ...list.slice(i + 1)])) yield [list[i], ...p];
  }
  const fact = (k) => (k <= 1 ? 1 : k * fact(k - 1));
  for (const k of [...new Set([kmax, kmax - 1])].filter((x) => x >= 0)) {
    const q = buildQubo(spec, { frontBeds: k, weights: 'hand', syntax: false });
    const { front, back } = q.bands;
    const total = fact(front.slots) * fact(back.slots);
    const orders = [];
    if (total <= samples) for (const f of perms(front.rooms)) for (const b of perms(back.rooms)) orders.push([f, b]);
    else {
      const r = rng(7000 + si * 10 + k);
      for (let i = 0; i < samples; i++) orders.push([shuffle(front.rooms, r), shuffle(back.rooms, r)]);
    }
    const seen = new Set();
    const rows = [];
    for (const [f, b] of orders) {
      const d = decode(q, encode(q, f, b));
      const key = `${d.front.join(',')}|${d.back.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const layout = buildLayout(spec, { ...defaultParams(spec), frontOrder: d.front, backOrder: d.back });
      let a;
      try {
        a = analyze(toLabel(layout), 'SPA');
      } catch {
        continue;
      }
      if (a.units.length !== 1) continue;
      rows.push({ key, phi: features(q, encode(q, d.front, d.back)), m: relations(a, a.units[0]) });
    }
    out.push({ si, k, bedrooms: spec.bedrooms, exhaustive: total <= samples, total, terms: TERMS.map((t) => t.id), rows });
  }
  parentPort.postMessage(out);
  process.exit(0);
}

// ---------------- main ----------------
const SAMPLES = arg('samples', 600);
const THREADS = arg('threads', Math.min(8, os.availableParallelism() - 1));
const { TERMS } = await import('../src/generate/qubo.js');
const { specs } = await import('./lib/term-measure.mjs');
const derived = path.join(root, '..', 'aihub-full', 'derived');
const split = JSON.parse(fs.readFileSync(path.join(root, 'data', 'split.json'), 'utf8'));
const testSet = new Set(split.test);

// 실제 평면(서로 다른 평면 8,331개) → dev/test, 침실 수별 관계 빈도
const keep = new Set(
  fs.readFileSync(path.join(derived, 'baseline-units.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => {
    const o = JSON.parse(l);
    return `${o.drawing}#${o.unit}`;
  }),
);
const real = { dev: [], test: [] };
for (const l of fs.readFileSync(path.join(derived, 'real-units.jsonl'), 'utf8').split('\n')) {
  if (!l) continue;
  const o = JSON.parse(l);
  if (!keep.has(`${o.drawing}#${o.unit}`)) continue;
  real[testSet.has(o.drawing) ? 'test' : 'dev'].push({ bedrooms: o.bedrooms, rel: o.rel, sx: o.sx, features: o.features, drawing: o.drawing });
}
const stat = (rows, bedrooms) => {
  const out = {};
  for (const r of REL) {
    const v = rows.filter((x) => x.bedrooms === bedrooms && x.rel[r] !== null && x.rel[r] !== undefined).map((x) => Number(x.rel[r]));
    const mean = v.reduce((s, x) => s + x, 0) / (v.length || 1);
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, v.length - 1));
    out[r] = { mean, sd, n: v.length };
  }
  return out;
};
const BEDS = [...new Set(specs.map((s) => s.bedrooms))];
const T = { dev: {}, test: {} };
for (const b of BEDS) {
  T.dev[b] = stat(real.dev, b);
  T.test[b] = stat(real.test, b);
}

// 생성 평면 측정(병렬)
const t0 = Date.now();
const groups = (
  await Promise.all(
    specs.map(
      (_, si) =>
        new Promise((res, rej) => {
          const w = new Worker(new URL(import.meta.url), { workerData: { si, samples: SAMPLES } });
          w.on('message', res);
          w.on('error', rej);
        }),
    ),
  )
).flat();
const tMeasure = (Date.now() - t0) / 1000;
const termIds = TERMS.map((t) => t.id);
const FIT = termIds.filter((id) => LINK[id]);
const fitIdx = FIT.map((id) => termIds.indexOf(id));
const hand = Object.fromEntries(TERMS.map((t) => [t.id, t.hand]));

// 정리: 그룹마다 Φ(행렬), M(관계값, null은 NaN)
for (const g of groups) {
  g.Phi = g.rows.map((r) => r.phi);
  g.M = g.rows.map((r) => REL.map((k) => (r.m[k] === null || r.m[k] === undefined ? NaN : Number(r.m[k]))));
}

/** 그룹의 볼츠만 기대값 E_w[m_r]과 공분산 Cov(m_r, φ_t) */
function moments(g, w) {
  const E = g.Phi.map((phi) => phi.reduce((s, f, t) => s + (w[termIds[t]] ?? 0) * f, 0));
  const mn = Math.min(...E);
  const p = E.map((e) => Math.exp(-(e - mn)));
  const Z = p.reduce((s, x) => s + x, 0);
  for (let i = 0; i < p.length; i++) p[i] /= Z;
  const R = REL.length;
  const em = new Array(R).fill(0);
  const pm = new Array(R).fill(0); // 관계를 잴 수 있는 배치의 확률 합
  for (let i = 0; i < p.length; i++)
    for (let r = 0; r < R; r++) {
      const v = g.M[i][r];
      if (Number.isNaN(v)) continue;
      em[r] += p[i] * v;
      pm[r] += p[i];
    }
  for (let r = 0; r < R; r++) em[r] = pm[r] > 0 ? em[r] / pm[r] : NaN;
  const ephi = fitIdx.map((t) => p.reduce((s, pi, i) => s + pi * g.Phi[i][t], 0));
  // dE[m_r]/dw_t = −Cov(m_r, φ_t)
  const cov = REL.map((_, r) =>
    fitIdx.map((t, j) => {
      if (Number.isNaN(em[r]) || pm[r] === 0) return 0;
      let c = 0;
      for (let i = 0; i < p.length; i++) {
        const v = g.M[i][r];
        if (Number.isNaN(v)) continue;
        c += (p[i] / pm[r]) * (v - em[r]) * (g.Phi[i][t] - ephi[j]);
      }
      return c;
    }),
  );
  return { em, cov, p };
}

/** 손실 L = 평균_g Σ_r ((E_w[m_r] − T_r)/s_r)² + α Σ w², s_r = 실제 표준편차(0.05 하한) */
function loss(w, gs, targets, alpha) {
  let L = 0;
  const grad = Object.fromEntries(FIT.map((id) => [id, 2 * alpha * w[id]]));
  for (const g of gs) {
    const { em, cov } = moments(g, w);
    REL.forEach((r, ri) => {
      const t = targets[g.bedrooms][r];
      if (!t || !t.n || Number.isNaN(em[ri])) return;
      const s = Math.max(0.05, t.sd);
      const d = (em[ri] - t.mean) / s;
      L += (d * d) / gs.length;
      FIT.forEach((id, j) => (grad[id] += ((2 * d) / s) * -cov[ri][j] / gs.length));
    });
  }
  return { L: L + alpha * FIT.reduce((s, id) => s + w[id] ** 2, 0), grad };
}

function fit(gs, targets, { alpha = 1e-3, iters = arg("iters", 1500), lr = arg("lr", 0.05), start = null } = {}) {
  const w = { ...hand };
  for (const id of FIT) w[id] = start ? start[id] ?? 0 : 0; // 기본은 0에서 시작: 데이터가 정하게
  const m = Object.fromEntries(FIT.map((id) => [id, 0]));
  const v = Object.fromEntries(FIT.map((id) => [id, 0]));
  let last;
  for (let it = 1; it <= iters; it++) {
    const { L, grad } = loss(w, gs, targets, alpha);
    last = L;
    for (const id of FIT) {
      m[id] = 0.9 * m[id] + 0.1 * grad[id];
      v[id] = 0.999 * v[id] + 0.001 * grad[id] ** 2;
      w[id] -= (lr * (m[id] / (1 - 0.9 ** it))) / (Math.sqrt(v[id] / (1 - 0.999 ** it)) + 1e-8);
      // 부호 제약(사영): 항의 부호는 그 관계의 실제 방향(보상/벌점)을 따른다. 크기만 데이터로 맞춘다.
      if (SIGNED && dir[id] && Math.sign(w[id]) === -dir[id]) w[id] = 0;
    }
  }
  return { w, L: last };
}

// 데이터 방향(부호 제약에 쓰고 표에도 낸다): 개발 묶음 실제 빈도 vs '모든 배치가 같은 확률'(w = 0)일 때 생성 빈도.
// 실제가 2%p 이상 많으면 보상(가중치 ≤ 0), 적으면 벌점(≥ 0), 차이가 작으면 제약 없음.
const uniformEval = evaluate(Object.fromEntries(termIds.map((id) => [id, 0])));
const dir = {};
for (const id of FIT) {
  const u = uniformEval.rows[LINK[id]];
  const diff = u.dev - u.exp;
  const tol = LINK[id] === 'livingOffCenter' ? 0.01 : 0.02;
  dir[id] = Math.abs(diff) < tol ? 0 : diff > 0 ? -1 : 1;
}
const SIGNED = !process.argv.includes('--free');

const t1 = Date.now();
const res = fit(groups, T.dev);
const tFit = (Date.now() - t1) / 1000;
const W = Object.fromEntries(termIds.map((id) => [id, Math.round(res.w[id] * 100) / 100]));

// ---- 평가: 기대 빈도(볼츠만)와 최빈 배치(최저 에너지)의 빈도를 dev/test 실제와 비교 ----
const sets = {
  uniform: Object.fromEntries(termIds.map((id) => [id, 0])),
  hand,
  calibrated: (await import('../src/generate/qubo-weights.js')).CALIBRATED.weights,
  maxent: W,
};
function evaluate(w) {
  const rows = {};
  for (const r of REL) rows[r] = { exp: [], mode: [] };
  for (const g of groups) {
    const { em } = moments(g, w);
    const E = g.Phi.map((phi) => phi.reduce((s, f, t) => s + (w[termIds[t]] ?? 0) * f, 0));
    const best = E.indexOf(Math.min(...E));
    REL.forEach((r, ri) => {
      if (!Number.isNaN(em[ri])) rows[r].exp.push({ b: g.bedrooms, v: em[ri] });
      const mv = g.M[best][ri];
      if (!Number.isNaN(mv)) rows[r].mode.push({ b: g.bedrooms, v: mv });
    });
  }
  // 그룹 평균(침실 수 구성은 생성 조건 그대로) vs 같은 침실 수 구성으로 가중한 실제 빈도
  const out = {};
  let errDev = 0, errTest = 0, k = 0;
  for (const r of REL) {
    const avg = (a) => a.reduce((s, x) => s + x.v, 0) / (a.length || 1);
    const tgt = (which, a) => a.reduce((s, x) => s + T[which][x.b][r].mean, 0) / (a.length || 1);
    const sd = (a) => a.reduce((s, x) => s + Math.max(0.05, T.dev[x.b][r].sd), 0) / (a.length || 1);
    const e = rows[r].exp;
    if (!e.length) continue;
    out[r] = { exp: avg(e), mode: avg(rows[r].mode), dev: tgt('dev', e), test: tgt('test', e), sd: sd(e) };
    errDev += Math.abs(out[r].exp - out[r].dev) / out[r].sd;
    errTest += Math.abs(out[r].exp - out[r].test) / out[r].sd;
    k++;
  }
  return { rows: out, errDev: errDev / k, errTest: errTest / k };
}
const evals = Object.fromEntries(Object.entries(sets).map(([k, w]) => [k, evaluate(w)]));

// ---- 출력 ----
const meta = {
  generatedAt: new Date().toISOString().slice(0, 10),
  method: `maxent moment matching (Boltzmann, T=1), Adam, ridge 1e-3, ${SIGNED ? 'sign-constrained to data direction' : 'unconstrained'}`,
  data: `dev ${real.dev.length} plans / test ${real.test.length} plans (data/split.json)`,
  groups: groups.length,
  configs: groups.reduce((s, g) => s + g.rows.length, 0),
  fixed: FIXED,
  errDev: evals.maxent.errDev,
  errTest: evals.maxent.errTest,
};
fs.writeFileSync(
  path.join(root, 'src', 'generate', 'qubo-weights-maxent.js'),
  `// scripts/qubo-maxent.mjs가 만든 파일(손대지 말 것). 한국 실제 아파트(AI 허브 개발 묶음) 관계 빈도로 추정한 QUBO 항 가중치(최대 엔트로피 모멘트 맞춤).\n// 규칙 항 ${FIXED.join(', ')}은 손 가중치 고정.\nexport const MAXENT = ${JSON.stringify({ weights: W, meta }, null, 2)};\n`,
);
const pc = (x) => (x === undefined || Number.isNaN(x) ? '—' : `${(100 * x).toFixed(1)}%`);
const fmtR = (r, x) => (r === 'livingOffCenter' ? x.toFixed(3) : pc(x));
const L = [];
L.push('# QUBO 가중치의 데이터 추정: 최대 엔트로피 모멘트 맞춤\n');
L.push(`> 생성: ${meta.generatedAt} · \`node scripts/qubo-maxent.mjs --samples ${SAMPLES}\` · 측정 ${tMeasure.toFixed(0)}초, 맞춤 ${tFit.toFixed(0)}초`);
L.push(`> 실제: AI 허브 APT_FP_SPA 서로 다른 평면, 개발 묶음 ${real.dev.length.toLocaleString()}개로 맞추고 검증 묶음 ${real.test.length.toLocaleString()}개로 대조(도면 단위 분할, 같은 평면을 가진 도면은 같은 쪽). 생성: 조건 20개 × 템플릿 ${groups.length}개, 배치 ${meta.configs.toLocaleString()}개.\n`);
L.push('## 방법\n');
L.push('- QUBO 에너지 E_w(x) = Σ_t w_t φ_t(x)를 볼츠만 분포 p_w(x) ∝ exp(−E_w(x))로 읽는다. SA가 온도 1에서 표집하는 분포이고, 최저 에너지 해는 이 분포의 최빈 배치다.');
L.push('- 관계 r의 생성 기대 빈도 E_{p_w}[m_r]이 같은 침실 수의 실제 빈도 T_r과 같아지도록 w를 고른다. 빈도 제약만 있을 때 엔트로피가 최대인 분포가 이 지수형이므로(Jaynes 1957), 가중치는 **실제 빈도를 재현하는 데 필요한 만큼만** 정보를 담는다.');
L.push('- 손실: 조건 평균 Σ_r ((E_w[m_r] − T_r)/s_r)² + 10⁻³‖w‖², s_r = 실제 표준편차(하한 0.05). 기울기 ∂E_w[m_r]/∂w_t = −Cov_w(m_r, φ_t)로 Adam 1,500회, 시작값 0.');
L.push(`- 맞추지 않는 규칙 항: \`masterNotEnd\`(안방은 띠 끝, decode가 강제; Seo 2007 p.16 89%), \`backBedUnderBed\`(앞·뒤 띠 고유라 실제 도면에서 잴 수 없음) → 손 가중치 고정.`);
L.push('- 관계 측정은 실제 도면과 생성 평면 모두 같은 함수(`relations()`, 벽 인접 그래프)로 한다.\n');
L.push('## 가중치\n');
L.push('| 항 | 대응 관계 | 데이터 방향 | 최대 엔트로피 | 손 | 평가 모델 보정 | 부호 일치(최대 엔트로피) |');
L.push('|---|---|---|---|---|---|---|');
let agree = 0, nonzero = 0;
for (const t of TERMS) {
  const id = t.id;
  if (!LINK[id]) {
    L.push(`| \`${id}\` ${t.label} | — | 규칙 | ${W[id]} (고정) | ${hand[id]} | ${sets.calibrated[id]} | — |`);
    continue;
  }
  const d = dir[id];
  const ok = d === 0 ? '—' : W[id] === 0 ? '0 (데이터 방향으로 움직일 여지 없음 → 뺄 항)' : Math.sign(W[id]) === d ? '일치' : '**반대**';
  if (d !== 0 && W[id] !== 0) {
    nonzero++;
    agree += Number(Math.sign(W[id]) === d);
  }
  L.push(`| \`${id}\` ${t.label} | ${LINK[id]} | ${d < 0 ? '보상' : d > 0 ? '벌점' : '차이 작음'} | ${W[id]} | ${hand[id]} | ${sets.calibrated[id]} | ${ok} |`);
}
L.push('');
L.push(`가중치가 0이 아니고 데이터 방향이 있는 항 ${nonzero}개 중 부호 일치 ${agree}개. 0이 된 항: ${FIT.filter((id) => W[id] === 0).map((id) => '`' + id + '`').join(', ') || '없음'}. 데이터 방향 = 개발 묶음 실제 빈도와 '모든 배치가 같은 확률'(w = 0)일 때 생성 빈도의 차(2%p 이상).\n`);
L.push('## 실제 빈도 재현(조건 평균)\n');
L.push('기대 = 볼츠만 분포의 기대 빈도, 최빈 = 최저 에너지 배치의 빈도. 실제는 조건마다 같은 침실 수의 실제 빈도.\n');
L.push('| 관계 | 실제 dev | 실제 test | 균등(w=0) | 손 기대 | 보정 기대 | **최대 엔트로피 기대** | 최대 엔트로피 최빈 |');
L.push('|---|---|---|---|---|---|---|---|');
for (const r of REL) {
  const e = evals.maxent.rows[r];
  if (!e) continue;
  L.push(`| ${r} | ${fmtR(r, e.dev)} | ${fmtR(r, e.test)} | ${fmtR(r, evals.uniform.rows[r].exp)} | ${fmtR(r, evals.hand.rows[r].exp)} | ${fmtR(r, evals.calibrated.rows[r].exp)} | **${fmtR(r, e.exp)}** | ${fmtR(r, e.mode)} |`);
}
L.push('');
L.push('평균 표준화 오차 |기대 − 실제| / s (작을수록 실제 빈도를 잘 재현):\n');
L.push('| 가중치 | dev | test |');
L.push('|---|---|---|');
for (const [k, e] of Object.entries(evals)) L.push(`| ${k === 'uniform' ? '균등(w = 0)' : k === 'hand' ? '손' : k === 'calibrated' ? '평가 모델 보정' : '**최대 엔트로피**'} | ${e.errDev.toFixed(3)} | ${e.errTest.toFixed(3)} |`);
L.push('');
L.push('## 한계\n');
L.push('- 관계는 생성 문법(판상형 두 띠)이 만들 수 있는 범위 안에서만 맞출 수 있습니다. 문법이 거의 강제하는 관계(침실–거실 맞닿음 등)는 가중치로 움직이지 않습니다.');
L.push('- 큰 조건은 방 순서를 다 열거하지 않고 표본(조건당 최대 ' + SAMPLES + '개)으로 기대값을 근사했습니다.');
L.push('- 실제 빈도는 침실 수로만 맞췄습니다(축척을 몰라 면적대는 쓰지 못함).');
fs.writeFileSync(path.join(root, 'evidence', 'results', 'qubo-maxent.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(root, 'evidence', 'results', 'qubo-maxent.json'), JSON.stringify({ meta, weights: W, dir, evals, targets: T }, null, 1));
console.log(`zero: ${FIT.filter((id) => W[id] === 0).join(',')}`);
console.log(`maxent: errDev ${meta.errDev.toFixed(3)} errTest ${meta.errTest.toFixed(3)} · 부호 일치 ${agree}/${nonzero} · 측정 ${tMeasure.toFixed(0)}s 맞춤 ${tFit.toFixed(0)}s`);
for (const [k, e] of Object.entries(evals)) console.log(k, e.errDev.toFixed(3), e.errTest.toFixed(3));
console.log(JSON.stringify(W));

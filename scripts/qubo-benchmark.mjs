// QUBO 풀이기 비교 실험(논문용, 재현 가능).
// 프로토콜(evidence/10): 풀이기마다 같은 시간 예산을 이 기계에서 '평가 횟수'로 보정해 고정하고(시드로 완전히 재현),
// 조건 4개 × 시드 30개 × 알고리즘 8개를 돌린다. 지표: QUBO 최적 도달률, 에너지 차, 평면 순위 점수·모델 점수(중앙값·IQR),
// Friedman 검정(블록 = 조건×시드)과 평균 순위, 에너지–순위 점수 스피어만 상관.
// 사용: node scripts/qubo-benchmark.mjs [--seeds 30] [--budget 100]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareAlgorithms, spearman, templates } from '../src/generate/compare.js';
import { buildQubo } from '../src/generate/qubo.js';
import { SOLVERS, runSolver } from '../src/generate/solvers.js';
import { buildChoices } from '../src/generate/choices.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const SEEDS = arg('seeds', 30);
const WEIGHTS = 'hand';
const BUDGET = arg('budget', 100);

// 목표 면적비: 도면 생성 화면의 기본값(AI 허브 아파트 평면도 전체, 침실 3개 세대 중앙값)
const ch = buildChoices();
const b3 = ch.byBedrooms[3];
const targets = { living: b3.living.standard, ...b3.targets, other: b3.roomSize[1].share, master: b3.roomSize[1].share * b3.master[1].ratio };
const CASES = [
  { name: '59㎡ 방2', spec: { area: 59, bedrooms: 2, baths: 2, dress: true, multi: false, outdoorUnit: true, balcony: true, targets, prefs: ['livingCentral'] } },
  { name: '84㎡ 방3', spec: { area: 84, bedrooms: 3, baths: 2, dress: true, multi: false, outdoorUnit: true, balcony: true, targets, prefs: ['livingCentral', 'bath'] } },
  { name: '101㎡ 방4', spec: { area: 101, bedrooms: 4, baths: 2, dress: true, multi: true, outdoorUnit: true, balcony: true, targets, prefs: ['privacy', 'quiet'] } },
  { name: '114㎡ 방4', spec: { area: 114, bedrooms: 4, baths: 2, dress: true, multi: true, outdoorUnit: true, balcony: false, targets, prefs: ['kitchenLink', 'sunny', 'storage'] } },
];
const ALGOS = ['model', ...SOLVERS.map((s) => s.key)];
const NAME = { model: '기존: J 직접 탐색', ...Object.fromEntries(SOLVERS.map((s) => [s.key, s.name])) };

// ---- 시간 예산 → 평가 횟수 보정(조건마다, 시드 0으로 BUDGET ms 동안 센 횟수) ----
const calib = {};
for (const c of CASES) {
  const q = templates(c.spec, WEIGHTS)[0].q;
  calib[c.name] = {};
  for (const s of SOLVERS) {
    if (s.key === 'exact' || s.key === 'cpsat') continue;
    const evals = [0, 1, 2].map((k) => runSolver(s.key, q, { seed: 1000 + k, budgetMs: BUDGET }).evals);
    calib[c.name][s.key] = Math.max(1, Math.round(evals.sort((a, b) => a - b)[1]));
  }
}

// ---- 실행 ----
const rows = []; // { case, seed, algo, energy, optimum, objective, rules, valid, doorIssues }
const pairs = []; // 에너지–순위 점수
const t0 = Date.now();
for (const c of CASES) {
  for (let seed = 1; seed <= SEEDS; seed++) {
    for (const algo of ALGOS) {
      const out = compareAlgorithms(c.spec, { algorithms: [algo], seed, budgetMs: BUDGET, maxEvals: calib[c.name][algo] || null, weights: WEIGHTS });
      const r = out.results[0];
      rows.push({
        case: c.name,
        seed,
        algo,
        energy: r.energy,
        template: r.template,
        perTemplate: (r.perTemplate || []).map((p) => ({ k: p.k, energy: p.energy })),
        objective: r.best ? r.best.objective : null,
        rules: r.best ? r.best.rules : null,
        valid: r.best ? r.best.unit.validity.valid : false,
        doorIssues: r.best ? r.best.doorIssues : null,
        feasible: r.feasible,
      });
      if (r.best && r.energy !== null && algo !== 'model') pairs.push([`${c.name}#${r.template}`, r.energy, r.best.objective]);
    }
    process.stdout.write(`\r${c.name} 시드 ${seed}/${SEEDS} (${Math.round((Date.now() - t0) / 1000)}초)   `);
  }
}
console.log();

// ---- 통계 ----
const q = (v, p) => {
  const s = v.filter((x) => x !== null).sort((a, b) => a - b);
  if (!s.length) return null;
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo);
};
// 최적 에너지: 조건·템플릿마다 전수 열거 값
const optimum = {};
for (const c of CASES) for (const t of templates(c.spec, WEIGHTS)) {
  const res = runSolver('exact', t.q, { seed: 1, budgetMs: 60000 });
  optimum[`${c.name}#${t.k}`] = res.energy;
}
const optOf = (r) => optimum[`${r.case}#${r.template}`] ?? null;

// Friedman: 블록마다 순위 점수가 높을수록 1위(동점은 평균 순위)
const blocks = [];
for (const c of CASES) for (let s = 1; s <= SEEDS; s++) blocks.push(rows.filter((r) => r.case === c.name && r.seed === s));
const k = ALGOS.length;
const rankSum = Object.fromEntries(ALGOS.map((a) => [a, 0]));
for (const b of blocks) {
  const sorted = [...b].sort((x, y) => (y.objective ?? -1e9) - (x.objective ?? -1e9));
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].objective === sorted[i].objective) j++;
    for (let t = i; t <= j; t++) rankSum[sorted[t].algo] += (i + j) / 2 + 1;
    i = j + 1;
  }
}
const N = blocks.length;
const meanRank = Object.fromEntries(ALGOS.map((a) => [a, rankSum[a] / N]));
const chi2 = ((12 * N) / (k * (k + 1))) * ALGOS.reduce((s, a) => s + (meanRank[a] - (k + 1) / 2) ** 2, 0);
// 카이제곱 분포 상측 확률(자유도 k−1): 정규 근사(Wilson–Hilferty)
const df = k - 1;
const z = ((chi2 / df) ** (1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
const pFriedman = 0.5 * erfc(z / Math.SQRT2);
function erfc(x) {
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? y : 2 - y;
}
// 템플릿(같은 QUBO)마다 상관을 구해 개수로 가중 평균
let rhoS = 0;
let rn = 0;
for (const key of new Set(pairs.map((p) => p[0]))) {
  const pts = pairs.filter((p) => p[0] === key);
  const v = pts.length >= 4 ? spearman(pts.map((p) => p[1]), pts.map((p) => p[2])) : null;
  if (v !== null) (rhoS += v * pts.length), (rn += pts.length);
}
const rho = rn ? rhoS / rn : null;

// ---- 사후 검정: 평균 순위 1위 알고리즘과 나머지의 Wilcoxon 부호 순위 검정(정규 근사), Holm 보정 ----
function wilcoxon(a, b) {
  const d = a.map((x, i) => (x ?? -1e9) - (b[i] ?? -1e9)).filter((x) => Math.abs(x) > 1e-9);
  const m = d.length;
  if (!m) return { p: 1, m: 0 };
  const idx = d.map((x, i) => [Math.abs(x), i]).sort((p1, p2) => p1[0] - p2[0]);
  const rk = Array(m);
  for (let i = 0; i < m; ) {
    let j = i;
    while (j + 1 < m && idx[j + 1][0] === idx[i][0]) j++;
    for (let t = i; t <= j; t++) rk[idx[t][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  const W = d.reduce((s2, x, i) => s2 + (x > 0 ? rk[i] : 0), 0);
  const mu = (m * (m + 1)) / 4;
  const sd = Math.sqrt((m * (m + 1) * (2 * m + 1)) / 24);
  const zz = (W - mu) / sd;
  return { p: Math.min(1, erfc(Math.abs(zz) / Math.SQRT2)), m, z: zz };
}
const leader = [...ALGOS].sort((a, b) => meanRank[a] - meanRank[b])[0];
const objOf = (algo) => blocks.map((b) => b.find((r) => r.algo === algo)?.objective ?? null);
const posthoc = ALGOS.filter((a) => a !== leader).map((a) => ({ algo: a, ...wilcoxon(objOf(leader), objOf(a)) }));
posthoc.sort((x, y) => x.p - y.p);
posthoc.forEach((t, i) => (t.holm = Math.min(1, Math.max(...posthoc.slice(0, i + 1).map((u, j) => u.p * (posthoc.length - j))))));

// ---- 결과 파일 ----
const fmt = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
const lines = [];
lines.push('# QUBO 풀이기 비교 실험 (손으로 정한 가중치)');
lines.push('');
lines.push(`\`node scripts/qubo-benchmark.mjs --seeds ${SEEDS} --budget ${BUDGET}\`로 만든 파일입니다. 풀이기마다 ${BUDGET}ms를 이 기계에서 평가 횟수로 보정해 고정했으므로 시드가 같으면 결과가 같습니다. '기존'은 적합성 J를 800번 재는 직접 탐색이라 예산 단위가 다릅니다.`);
lines.push('');
lines.push(`조건 ${CASES.length}개 × 시드 ${SEEDS}개 = 블록 ${N}개. 실행 시간 ${Math.round((Date.now() - t0) / 1000)}초.`);
lines.push('');
lines.push('## 요약');
lines.push('');
lines.push('| 알고리즘 | QUBO 최적 도달률 | TTS₉₉ | 에너지 차 중앙값 | 순위 점수 J 중앙값 (IQR) | 규칙 충족률 중앙값 (IQR) | 유효 평면 | 문 동선 문제 0 | 평균 순위 |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const a of ALGOS) {
  const rs = rows.filter((r) => r.algo === a);
  // 풀이기 성능: 템플릿마다 그 풀이기가 찾은 최저 에너지와 최적값의 차(큰 쪽). 모든 템플릿에서 최적이면 도달.
  const gapOf = (r) => {
    if (!r.perTemplate.length) return null;
    return Math.max(...r.perTemplate.map((p) => (p.energy === null ? Infinity : p.energy - optimum[`${r.case}#${p.k}`])));
  };
  const hits = rs.filter((r) => r.perTemplate.length && gapOf(r) < 1e-6).length;
  const gaps = rs.map((r) => (a === 'model' ? (r.energy === null || optOf(r) === null ? null : r.energy - optOf(r)) : gapOf(r)));
  const obj = rs.map((r) => r.objective);
  const mod = rs.map((r) => r.rules);
  // TTS99 = t_run · ln(0.01) / ln(1 − p_s) (Rønnow et al. 2014). t_run = 예산(ms).
  const ps = rs.length ? hits / rs.length : 0;
  const tts = a === 'model' ? '—' : ps >= 1 ? `${BUDGET}ms` : ps <= 0 ? `> ${BUDGET}ms` : `${Math.round((BUDGET * Math.log(0.01)) / Math.log(1 - ps))}ms`;
  lines.push(
    `| ${NAME[a]}${a === 'sa' ? ' (QPU 대체, 잠정)' : a === 'sqa' ? ' (QPU 대리, 잠정)' : ''} | ${a === 'model' ? '—' : `${((100 * hits) / rs.length).toFixed(0)}%`} | ${tts} | ${fmt(q(gaps, 0.5), 2)} | ${fmt(q(obj, 0.5))} (${fmt(q(obj, 0.25))}–${fmt(q(obj, 0.75))}) | ${fmt(q(mod, 0.5))} (${fmt(q(mod, 0.25))}–${fmt(q(mod, 0.75))}) | ${rs.filter((r) => r.valid).length}/${rs.length} | ${rs.filter((r) => r.doorIssues === 0).length}/${rs.length} | ${meanRank[a].toFixed(2)} |`,
  );
}
lines.push('');
lines.push(`- Friedman 검정(순위 점수, 블록 ${N}개, 알고리즘 ${k}개): χ² = ${chi2.toFixed(2)}, 자유도 ${df}, p ≈ ${pFriedman < 1e-4 ? pFriedman.toExponential(1) : pFriedman.toFixed(4)} (Wilson–Hilferty 근사).`);
lines.push(`- TTS₉₉ = 실행 한 번의 예산(${BUDGET}ms) × ln(0.01)/ln(1 − 최적 도달률): 99% 확률로 한 번은 최적에 닿는 데 드는 시간(Rønnow et al. 2014). 전수 열거(전역 최적해)의 실제 열거 시간은 예산보다 훨씬 짧습니다.`);
lines.push(`- QUBO 에너지와 순위 점수의 스피어만 ρ = ${fmt(rho, 2)} (QUBO 풀이기 해 ${pairs.length}개). 음수일수록 에너지가 낮은 해가 좋은 평면입니다.`);
lines.push('- 최적 도달률·에너지 차는 풀이기 성능입니다: 풀이기는 앞 띠 침실 수가 다른 템플릿 2개를 예산을 나눠 풀고, 템플릿마다 찾은 최저 에너지와 전수 열거 최적값의 차 가운데 큰 쪽을 씁니다(모든 템플릿에서 최적이면 도달). \'기존\'의 에너지 차는 그 평면의 배치를 QUBO 변수로 옮겨 잰 값입니다.');
lines.push('');
lines.push(`### 사후 검정: ${NAME[leader]}(평균 순위 1위) 대 나머지`);
lines.push('');
lines.push('Wilcoxon 부호 순위 검정(순위 점수, 블록별 짝, 정규 근사)과 Holm 보정. z가 양수면 1위 알고리즘의 순위 점수가 더 높습니다.');
lines.push('');
lines.push('| 비교 대상 | 짝(0 제외) | z | p | Holm 보정 p |');
lines.push('| --- | --- | --- | --- | --- |');
for (const t of posthoc) lines.push(`| ${NAME[t.algo]} | ${t.m} | ${fmt(t.z, 2)} | ${t.p < 1e-4 ? t.p.toExponential(1) : t.p.toFixed(4)} | ${t.holm < 1e-4 ? t.holm.toExponential(1) : t.holm.toFixed(4)} |`);
lines.push('');
lines.push('## 조건별 QUBO 크기와 보정된 평가 횟수');
lines.push('');
lines.push(`| 조건 | 변수(템플릿별) | 최적 에너지(템플릿별) | ${SOLVERS.filter((s) => s.key !== 'exact' && s.key !== 'cpsat').map((s) => s.name).join(' | ')} |`);
lines.push(`| --- | --- | --- | ${SOLVERS.filter((s) => s.key !== 'exact' && s.key !== 'cpsat').map(() => '---').join(' | ')} |`);
for (const c of CASES) {
  const ts = templates(c.spec, WEIGHTS);
  lines.push(`| ${c.name} | ${ts.map((t) => `앞 침실 ${t.k + 1}: ${t.q.n}`).join(', ')} | ${ts.map((t) => fmt(optimum[`${c.name}#${t.k}`], 2)).join(', ')} | ${SOLVERS.filter((s) => s.key !== 'exact' && s.key !== 'cpsat').map((s) => calib[c.name][s.key].toLocaleString()).join(' | ')} |`);
}
lines.push('');
lines.push('평가 횟수의 단위는 풀이기마다 다릅니다(SA·PT: 스핀 하나의 수용 판정, tabu 계열: 한 번 뒤집기, SB: 시간 한 걸음). 그래서 같은 시간으로 보정한 횟수를 씁니다.');
lines.push('');
lines.push('## 해석할 때');
lines.push('');
lines.push('- 변수 18~45개의 작은 QUBO라 전수 열거로 최적값을 알 수 있습니다. 풀이기 사이 차이는 최적 도달률·에너지 차로 보고, 평면 품질은 순위 점수로 따로 봅니다.');
lines.push('- 순위 점수 J는 규칙 충족·목표 면적·선호 점수의 합이라 QUBO 에너지의 대리 관계가 약하면 에너지 최적이 곧 최고 평면은 아닙니다.');
lines.push('- SA는 D-Wave QPU 결과가 나오기 전의 임시 대체입니다. 양자 어닐링 결과로 보고하지 않습니다. SQA는 고전 컴퓨터에서 돌린 경로적분 양자 몬테카를로로, SA보다 양자 어닐링에 가까운 대리일 뿐 QPU 결과가 아닙니다.');
const outDir = path.join(root, 'evidence', 'results');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'qubo-benchmark.md'), `${lines.join('\n')}\n`);
fs.writeFileSync(path.join(outDir, 'qubo-benchmark.json'), JSON.stringify({ seeds: SEEDS, budgetMs: BUDGET, calib, optimum, posthoc, leader, meanRank, friedman: { chi2, df, p: pFriedman }, rho, rows }, null, 1));
console.log(lines.slice(0, 22).join('\n'));

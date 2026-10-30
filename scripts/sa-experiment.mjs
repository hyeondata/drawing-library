// 켜 둔 풀이기(src/generate/solvers.js ACTIVE, 지금은 SA)만 재는 실험. 다른 풀이기와 비교하지 않는다.
// (1) 시간 예산별 전역 최적 도달률: 템플릿 2개에 예산을 반씩(화면과 같음), 전수 열거 최적값은 기준으로만 쓴다.
// (2) 화면 기본 예산(3초)으로 만든 평면의 품질: 필수 규칙·문 동선·좁은 실·적합성 J.
// 결과: evidence/results/sa-experiment.md, .json · 사용: node scripts/sa-experiment.mjs [--seeds 20]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChoices } from '../src/generate/choices.js';
import { compareAlgorithms, templates } from '../src/generate/compare.js';
import { ACTIVE, SOLVERS, runSolver } from '../src/generate/solvers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--seeds');
const SEEDS = i > 0 ? Number(process.argv[i + 1]) : 20;
const BUDGETS = [300, 1000, 3000];
const DEFAULT_BUDGET = 3000;
const ch = buildChoices();
const specOf = (area, b, baths, prefs, extra = {}) => {
  const o = ch.byBedrooms[b];
  const other = o.roomSize[1].share;
  return { area, bedrooms: b, baths, dress: true, multi: false, outdoorUnit: true, balcony: true, targets: { living: o.living.standard, ...o.targets, other, master: other * o.master[1].ratio }, prefs, etcMax: o.etcMax, ...extra };
};
const CASES = [
  { name: '59㎡ 방2', spec: specOf(59, 2, 2, ['livingCentral']) },
  { name: '84㎡ 방3', spec: specOf(84, 3, 2, ['livingCentral', 'bath']) },
  { name: '101㎡ 방4', spec: specOf(101, 4, 2, ['privacy', 'quiet'], { multi: true }) },
  { name: '114㎡ 방4', spec: specOf(114, 4, 3, ['kitchenLink', 'sunny', 'storage'], { multi: true, balcony: false }) },
];
const q = (v, p) => {
  const s = v.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const k = (s.length - 1) * p;
  const lo = Math.floor(k);
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (k - lo);
};
const out = { seeds: SEEDS, active: ACTIVE, cases: CASES.map((c) => c.name), budget: [], quality: [] };
const t0 = Date.now();
for (const key of ACTIVE) {
  // (1) 도달률
  const opt = CASES.map((c) => templates(c.spec, 'hand').map((t) => runSolver('exact', t.q, { seed: 1, budgetMs: 20000 }).energy));
  for (const B of BUDGETS) {
    let hit = 0;
    let n = 0;
    CASES.forEach((c, ci) => {
      const tpls = templates(c.spec, 'hand');
      for (let s = 1; s <= SEEDS; s++) {
        hit += tpls.every((t, k) => runSolver(key, t.q, { seed: s, budgetMs: B / tpls.length }).energy - opt[ci][k] < 1e-6) ? 1 : 0;
        n++;
      }
    });
    const p = hit / n;
    out.budget.push({ solver: key, budgetMs: B, hit, n, p, tts: p >= 1 ? B : p <= 0 ? null : Math.round((B * Math.log(0.01)) / Math.log(1 - p)) });
    console.log(`${key} ${B}ms: ${hit}/${n} (${Math.round((Date.now() - t0) / 1000)}초)`);
  }
  // (2) 평면 품질(화면 기본 예산, 서로 다른 3안 모두)
  for (const c of CASES) {
    const plans = [];
    for (let s = 1; s <= SEEDS; s++) {
      const r = compareAlgorithms(c.spec, { algorithms: [key], seed: s, budgetMs: DEFAULT_BUDGET }).results[0];
      for (const x of r.cands) plans.push({ J: x.objective, rules: x.rules, valid: x.unit.validity.valid, door: x.doorIssues, narrow: x.narrow });
    }
    out.quality.push({ solver: key, case: c.name, plans: plans.length, valid: plans.filter((x) => x.valid).length, door0: plans.filter((x) => x.door === 0).length, narrow0: plans.filter((x) => x.narrow === 0).length, J: { p25: q(plans.map((x) => x.J), 0.25), p50: q(plans.map((x) => x.J), 0.5), p75: q(plans.map((x) => x.J), 0.75) } });
    console.log(`${key} ${c.name}: 평면 ${plans.length}개 (${Math.round((Date.now() - t0) / 1000)}초)`);
  }
}
const nameOf = Object.fromEntries(SOLVERS.map((s) => [s.key, s.name]));
const f = (v) => (v === null ? '—' : v.toFixed(1));
const md = [
  '# 켜 둔 풀이기 실험(SA)',
  '',
  `\`node scripts/sa-experiment.mjs --seeds ${SEEDS}\`로 만든 파일입니다. 켜 둔 풀이기(${ACTIVE.map((k) => nameOf[k]).join(', ')})만 재고 다른 풀이기와 비교하지 않습니다. 조건 4개(${CASES.map((c) => c.name).join(' · ')}) × 시드 ${SEEDS}개. 목표 면적비는 도면 생성 화면의 기본값(고른 침실 수 세대의 중앙값)입니다. 시간 예산이라 기계에 따라 값이 조금 달라집니다.`,
  '',
  '## 시간 예산별 전역 최적 도달률',
  '',
  '템플릿 2개에 예산을 반씩 나눠(화면과 같음) 두 템플릿 모두 전수 열거 최적값(기준값)에 닿으면 도달로 셉니다.',
  '',
  '| 풀이기 | 풀이기당 시간 | 도달 | 도달률 | TTS₉₉ |',
  '| --- | --- | --- | --- | --- |',
  ...out.budget.map((r) => `| ${nameOf[r.solver]} | ${r.budgetMs / 1000}초 | ${r.hit}/${r.n} | ${Math.round(r.p * 100)}% | ${r.tts === null ? '—' : r.p >= 1 ? `≤ ${r.tts / 1000}초` : `${(r.tts / 1000).toFixed(1)}초`} |`),
  '',
  `## 화면 기본 예산(${DEFAULT_BUDGET / 1000}초)으로 만든 평면`,
  '',
  '시드마다 서로 다른 3안을 모두 셉니다.',
  '',
  '| 풀이기 | 조건 | 평면 | 필수 규칙 통과 | 문 동선 문제 0 | 좁은 실 0 | J p25 · p50 · p75 |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...out.quality.map((r) => `| ${nameOf[r.solver]} | ${r.case} | ${r.plans} | ${r.valid}/${r.plans} | ${r.door0}/${r.plans} | ${r.narrow0}/${r.plans} | ${f(r.J.p25)} · ${f(r.J.p50)} · ${f(r.J.p75)} |`),
  '',
];
fs.writeFileSync(path.join(root, 'evidence/results/sa-experiment.md'), md.join('\n'));
fs.writeFileSync(path.join(root, 'evidence/results/sa-experiment.json'), JSON.stringify(out, null, 1));
console.log(`저장: evidence/results/sa-experiment.md (${Math.round((Date.now() - t0) / 1000)}초)`);

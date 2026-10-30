// 켜 둔 풀이기(src/generate/solvers.js ACTIVE, 지금은 SA)만 재는 실험. 다른 풀이기와 비교하지 않는다.
// (1) 멈춤 조건별 전역 최적 도달률과 걸린 시간: 최대 MAX_MS, 같은 최저 에너지를 K번 다시 찾으면 멈춤.
//     템플릿 2개에 시간을 나누고 앞 템플릿이 일찍 끝나면 남은 시간을 뒤로 넘긴다(화면과 같음). 전수 열거 최적값은 기준으로만 쓴다.
// (2) 화면 기본값(최대 MAX_MS, K = DEFAULT_STOP)으로 만든 평면의 품질: 필수 규칙·문 동선·좁은 실·적합성 J.
// 결과: evidence/results/sa-experiment.md, .json · 사용: node scripts/sa-experiment.mjs [--seeds 20]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChoices } from '../src/generate/choices.js';
import { compareAlgorithms, templates } from '../src/generate/compare.js';
import { ACTIVE, SOLVERS, runSolver } from '../src/generate/solvers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--seeds');
const SEEDS = i > 0 ? Number(process.argv[i + 1]) : 10;
const MAX_MS = 30000;
const STOPS = [3, 5, 10];
const DEFAULT_STOP = 10;
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
const out = { seeds: SEEDS, active: ACTIVE, cases: CASES.map((c) => c.name), maxMs: MAX_MS, defaultStop: DEFAULT_STOP, stop: [], quality: [] };
const t0 = Date.now();
for (const key of ACTIVE) {
  // (1) 멈춤 조건별 도달률·시간
  const opt = CASES.map((c) => templates(c.spec, 'hand').map((t) => runSolver('exact', t.q, { seed: 1, budgetMs: 20000 }).energy));
  for (const K of STOPS) {
    let hit = 0;
    let n = 0;
    const ms = [];
    CASES.forEach((c, ci) => {
      const tpls = templates(c.spec, 'hand');
      for (let s = 1; s <= SEEDS; s++) {
        let used = 0;
        const ok = tpls.every((t, k) => {
          const r = runSolver(key, t.q, { seed: s, budgetMs: (MAX_MS - used) / (tpls.length - k), stopHits: K });
          used += r.ms;
          return r.energy - opt[ci][k] < 1e-6;
        });
        hit += ok ? 1 : 0;
        n++;
        ms.push(used);
      }
    });
    out.stop.push({ solver: key, stopHits: K, hit, n, p: hit / n, ms: { p50: q(ms, 0.5), p90: q(ms, 0.9), max: Math.max(...ms) } });
    console.log(`${key} K=${K}: ${hit}/${n} (${Math.round((Date.now() - t0) / 1000)}초)`);
  }
  // (2) 평면 품질(화면 기본 예산, 서로 다른 3안 모두)
  for (const c of CASES) {
    const plans = [];
    for (let s = 1; s <= SEEDS; s++) {
      const r = compareAlgorithms(c.spec, { algorithms: [key], seed: s, budgetMs: MAX_MS, stopHits: DEFAULT_STOP }).results[0];
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
  `## 멈춤 조건별 전역 최적 도달률(최대 ${MAX_MS / 1000}초)`,
  '',
  '같은 최저 에너지를 K번 다시 찾으면 멈춥니다. 두 템플릿 모두 전수 열거 최적값(기준값)에 닿으면 도달로 셉니다. "끝까지"(최대 시간까지 계속)는 같은 시드에서 K번 멈춤보다 더 오래 찾으므로 도달률이 그보다 낮을 수 없습니다.',
  '',
  '| 풀이기 | 멈춤 조건 | 도달 | 도달률 | 걸린 시간 중앙값 · 90% · 최대 |',
  '| --- | --- | --- | --- | --- |',
  ...out.stop.map((r) => `| ${nameOf[r.solver]} | 같은 최저 ${r.stopHits}번 | ${r.hit}/${r.n} | ${Math.round(r.p * 100)}% | ${(r.ms.p50 / 1000).toFixed(1)} · ${(r.ms.p90 / 1000).toFixed(1)} · ${(r.ms.max / 1000).toFixed(1)}초 |`),
  '',
  `## 화면 기본값(최대 ${MAX_MS / 1000}초, 같은 최저 ${DEFAULT_STOP}번 재발견 시 멈춤)으로 만든 평면`,
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

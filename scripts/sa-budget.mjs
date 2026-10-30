// SA 시간 예산별 전역 최적 도달률(도면 생성 화면의 '풀이기당 시간' 선택지 근거).
// 풀이기 비교 실험과 같은 조건 4개, 템플릿마다 예산의 절반(화면과 같음), 전수 열거 최적값과 비교한다.
// 결과: evidence/results/sa-budget.md · 사용: node scripts/sa-budget.mjs [--seeds 20]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChoices } from '../src/generate/choices.js';
import { templates } from '../src/generate/compare.js';
import { runSolver } from '../src/generate/solvers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--seeds');
const SEEDS = i > 0 ? Number(process.argv[i + 1]) : 20;
const BUDGETS = [300, 1000, 3000];
const ch = buildChoices();
const b3 = ch.byBedrooms[3];
const targets = { living: b3.living.standard, ...b3.targets, other: b3.roomSize[1].share, master: b3.roomSize[1].share * b3.master[1].ratio };
const CASES = [
  { name: '59㎡ 방2', spec: { area: 59, bedrooms: 2, baths: 2, dress: true, multi: false, outdoorUnit: true, balcony: true, targets, prefs: ['livingCentral'] } },
  { name: '84㎡ 방3', spec: { area: 84, bedrooms: 3, baths: 2, dress: true, multi: false, outdoorUnit: true, balcony: true, targets, prefs: ['livingCentral', 'bath'] } },
  { name: '101㎡ 방4', spec: { area: 101, bedrooms: 4, baths: 2, dress: true, multi: true, outdoorUnit: true, balcony: true, targets, prefs: ['privacy', 'quiet'] } },
  { name: '114㎡ 방4', spec: { area: 114, bedrooms: 4, baths: 2, dress: true, multi: true, outdoorUnit: true, balcony: false, targets, prefs: ['kitchenLink', 'sunny', 'storage'] } },
];
const rows = [];
for (const B of BUDGETS) {
  let hit = 0;
  let n = 0;
  for (const c of CASES) {
    const tpls = templates(c.spec, 'hand');
    const opt = tpls.map((t) => runSolver('exact', t.q, { seed: 1, budgetMs: 20000 }).energy);
    for (let s = 1; s <= SEEDS; s++) {
      const ok = tpls.every((t, k) => runSolver('sa', t.q, { seed: s, budgetMs: B / tpls.length }).energy - opt[k] < 1e-6);
      hit += ok ? 1 : 0;
      n++;
    }
  }
  const p = hit / n;
  rows.push({ B, hit, n, p, tts: p >= 1 ? B : p <= 0 ? null : Math.round((B * Math.log(0.01)) / Math.log(1 - p)) });
  console.log(`${B}ms: ${hit}/${n}`);
}
const md = [
  '# SA 시간 예산별 전역 최적 도달률',
  '',
  `\`node scripts/sa-budget.mjs --seeds ${SEEDS}\`로 만든 파일입니다. 조건 4개(59㎡ 방2 · 84㎡ 방3 · 101㎡ 방4 · 114㎡ 방4) × 시드 ${SEEDS}개, 템플릿 2개에 예산을 반씩 나눠(화면과 같음) 두 템플릿 모두 전수 열거 최적값에 닿으면 도달로 셉니다. 시간 예산이라 기계에 따라 값이 조금 달라집니다.`,
  '',
  '| 풀이기당 시간 | 도달 | 도달률 | TTS₉₉ |',
  '| --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.B / 1000}초 | ${r.hit}/${r.n} | ${Math.round(r.p * 100)}% | ${r.tts === null ? '—' : r.p >= 1 ? `≤ ${r.tts / 1000}초` : `${(r.tts / 1000).toFixed(1)}초`} |`),
  '',
];
fs.writeFileSync(path.join(root, 'evidence/results/sa-budget.md'), md.join('\n'));
fs.writeFileSync(path.join(root, 'evidence/results/sa-budget.json'), JSON.stringify({ seeds: SEEDS, rows }, null, 1));

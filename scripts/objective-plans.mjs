// RQ4 예비: 공간구문 목적별 최적 배치(objective-orders.json)를 정렬 모드로 도면화하고 평가 모델과 같은 analyze()로 잰다.
// 치수는 realize(치수 다듬기 30번, 순서 고정)로 정한다. 비교 대상 '기존'은 지금 생성기(보정 가중치 QUBO + SA + J, 기존 배치).
// 사용: node scripts/objective-plans.mjs → evidence/results/objective-plans.jsonl (통계는 analysis/objective_compare.py)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { realize, compareAlgorithms } from '../src/generate/compare.js';
import { analyze } from '../src/model/index.js';
import { rng, toLabel } from '../src/generate/layout.js';
import { specs } from './lib/term-measure.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'public/data/baseline.json'), 'utf8'));
const recs = JSON.parse(fs.readFileSync(path.join(root, 'evidence/results/objective-orders.json'), 'utf8'));
const out = [];
const feat = (layout) => {
  const a = analyze(toLabel(layout), 'SPA');
  return a.units.length === 1 ? a.units[0].features : null;
};
for (const rec of recs) {
  const si = Number(rec.id.split('/')[0]);
  const spec = { ...specs[si], prefs: [] };
  for (const [obj, orders] of Object.entries(rec.orders)) {
    orders.forEach(([front, back], n) => {
      const c = realize(spec, { front, back }, baseline, rng(1000 + n), 30, true);
      if (!c) return;
      out.push({ obj, t: rec.id, bedrooms: spec.bedrooms, fit: c.fit, narrow: c.narrow, door: c.doorIssues, J: c.objective, features: feat(c.layout) });
    });
  }
}
// 기존 생성기(사양 20개 × 시드 5)
specs.forEach((s0, si) => {
  const spec = { ...s0, prefs: [] };
  for (let seed = 1; seed <= 5; seed++) {
    const b = compareAlgorithms(spec, { baseline, algorithms: ['sa'], seed, maxEvals: 20000, weights: 'calibrated' }).results[0].best;
    if (b) out.push({ obj: 'legacy', t: `${si}`, bedrooms: spec.bedrooms, fit: b.fit, narrow: b.narrow, door: b.doorIssues, J: b.objective, features: feat(b.layout) });
  }
});
fs.writeFileSync(path.join(root, 'evidence/results/objective-plans.jsonl'), out.map((o) => JSON.stringify(o)).join('\n') + '\n');
console.log('plans', out.length);

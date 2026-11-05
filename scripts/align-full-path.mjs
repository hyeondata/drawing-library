// 기존 방식 대 정렬 모드: 생성기 전체 경로(SA + 치수 다듬기 + 적합성 J = 규칙 충족·면적 부합·선호 − 감점, 손 가중치 QUBO)에서의 결과.
// 사용: node scripts/align-full-path.mjs [--n 200]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareAlgorithms } from '../src/generate/compare.js';
import { analyze } from '../src/model/index.js';
import { toLabel, sharedEdge } from '../src/generate/layout.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = Number(process.argv[process.argv.indexOf('--n') + 1]) || 200;
const targets = { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 };
let s = 7;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const RANGE = { 2: [45, 65], 3: [59, 101], 4: [84, 135] };
const conds = Array.from({ length: N }, () => {
  const u = rnd() * 7995, bedrooms = u < 500 ? 2 : u < 6078 ? 3 : 4;
  const [lo, hi] = RANGE[bedrooms];
  return { area: Math.round(lo + rnd() * (hi - lo)), bedrooms, baths: bedrooms >= 3 ? 2 : 1, dress: true, multi: rnd() < 1 / 3, outdoorUnit: true, balcony: rnd() < 0.75, targets, prefs: [] };
});
const med = (v) => { const a = v.filter(Number.isFinite).sort((x, y) => x - y); return a[a.length >> 1]; };
const out = {};
for (const align of [false, true]) {
  const rows = [];
  conds.forEach((spec, i) => {
    const res = compareAlgorithms(spec, { algorithms: ['sa'], seed: i + 1, maxEvals: 20000, weights: 'hand', align });
    const b = res.results[0].best;
    if (!b) return;
    const a = analyze(toLabel(b.layout), 'SPA');
    const f = a.units.length === 1 ? a.units[0].features : {};
    const R = Object.fromEntries(b.layout.rooms.map((r) => [r.key, r]));
    rows.push({ fit: b.fit, model: b.rules, J: b.objective, narrow: b.narrow, door: b.doorIssues, entryLiving: R.entrance && R.living && sharedEdge(R.entrance, R.living) > 0, livingDepth: f.livingDepth, livingControl: f.livingControl, lbr: f.livingBedroomRatio });
  });
  out[align ? 'aligned' : 'legacy'] = {
    n: rows.length, fit: med(rows.map((r) => r.fit)), model: med(rows.map((r) => r.model)), J: med(rows.map((r) => r.J)),
    narrow: rows.reduce((a, r) => a + r.narrow, 0) / rows.length, door: rows.reduce((a, r) => a + r.door, 0) / rows.length,
    entryLiving: rows.filter((r) => r.entryLiving).length / rows.length, depth1: rows.filter((r) => r.livingDepth === 1).length / rows.length,
    livingControl: med(rows.map((r) => r.livingControl)), lbr: med(rows.map((r) => r.lbr)),
  };
  console.log(align ? 'aligned' : 'legacy', JSON.stringify(out[align ? 'aligned' : 'legacy']));
}
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const L = ['# 기존 방식 대 정렬 모드: 생성기 전체 경로(SA + 치수 다듬기 + J)\n'];
L.push(`> 생성: ${new Date().toISOString().slice(0, 10)} · \`node scripts/align-full-path.mjs --n ${N}\` · 조건 ${N}개(침실 수는 실제 분포 비율), 손 가중치 QUBO, SA maxEvals 20,000, 적합성 J(규칙 충족·면적 부합). '실제' 칸은 AI 허브 라벨 규약 값(entrance-living-diagnosis, 이전 dev 진단)\n`);
L.push('| 지표 | 기존 | 정렬 모드 | 실제(라벨 규약) |');
L.push('|---|---|---|---|');
const lg = out.legacy, al = out.aligned;
L.push(`| 면적 부합(0~100, 중앙값) | ${lg.fit.toFixed(1)} | ${al.fit.toFixed(1)} | — |`);
L.push(`| 규칙 충족률(중앙값) | ${lg.model.toFixed(1)} | ${al.model.toFixed(1)} | — |`);
L.push(`| 순위 점수 J(중앙값) | ${lg.J.toFixed(1)} | ${al.J.toFixed(1)} | — |`);
L.push(`| 좁은 실(평면당) | ${lg.narrow.toFixed(2)} | ${al.narrow.toFixed(2)} | — |`);
L.push(`| 문 동선 문제(평면당) | ${lg.door.toFixed(2)} | ${al.door.toFixed(2)} | — |`);
L.push(`| 현관–거실 맞닿음 | ${pct(lg.entryLiving)} | ${pct(al.entryLiving)} | 99.4% |`);
L.push(`| 현관→거실 깊이 1 | ${pct(lg.depth1)} | ${pct(al.depth1)} | 99.4% |`);
L.push(`| 거실 통제값(중앙값) | ${lg.livingControl.toFixed(2)} | ${al.livingControl.toFixed(2)} | 2.62 |`);
L.push(`| 거실/침실 통합도 비(중앙값) | ${lg.lbr.toFixed(2)} | ${al.lbr.toFixed(2)} | 2.42 |`);
fs.writeFileSync(path.join(root, 'evidence', 'results', 'align-full-path.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(root, 'evidence', 'results', 'align-full-path.json'), JSON.stringify(out, null, 1));
console.log(L.join('\n'));

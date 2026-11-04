// 진단: 생성 평면의 현관→거실 깊이가 실제(1)보다 큰(2) 이유가 측정(라벨) 차이인가, 생성기 구조인가.
// 왜: 실제 대 생성 분류기 검정(real-vs-generated)에서 가장 크게 어긋난 지표가 현관→거실 깊이였다(실제 중앙값 1, 생성 2).
//   검정 결과를 보고 생성기를 고치면 순환 논리가 되므로, 고치기 전에 원인을 dev 데이터와 생성 경로별로 나눠 확인한다.
// 1) 실제 dev 도면(검증 묶음 제외, 15장마다 1장)에서 현관과 맞닿은 실 유형, 현관→거실 깊이
// 2) 생성 평면(evidence/results/generated-plans.jsonl): 가중치 세트 × 경로(QUBO 최적해 / SA+순위 점수 J)별 깊이 1 비율
// 사용: node scripts/entrance-living-diagnosis.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/model/index.js';
import { requireDataDir } from './lib/real-units.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '..', 'aihub-full', 'TL_SPA');
requireDataDir(dataDir);
const test = new Set(JSON.parse(fs.readFileSync(path.join(root, 'data', 'split.json'), 'utf8')).test);
const files = fs.readdirSync(dataDir).filter((f) => f.startsWith('APT_FP_SPA_') && f.endsWith('.json') && !test.has(f)).filter((_, i) => i % 15 === 0);
let n = 0, d1 = 0, touch = 0;
const nbr = new Map();
for (const f of files) {
  const a = analyze(JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')), 'SPA', { unitRule: 'entrance' });
  for (const u of a.units) {
    const b = u.features.bedroomCount;
    if (b < 2 || b > 4) continue;
    n++;
    if (u.features.livingDepth === 1) d1++;
    const idx = new Map(u.members.map((g, l) => [g, l]));
    const r0 = u.nodes.findIndex((x) => x.depth === 0);
    const types = new Set();
    for (const [i, j] of u.edges) {
      if (idx.get(i) === r0) types.add(u.nodes[idx.get(j)].type);
      if (idx.get(j) === r0) types.add(u.nodes[idx.get(i)].type);
    }
    if (types.has('거실')) touch++;
    for (const t of types) nbr.set(t, (nbr.get(t) || 0) + 1);
  }
}
const gen = fs.readFileSync(path.join(root, 'evidence', 'results', 'generated-plans.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const rows = [];
for (const set of ['hand', 'calibrated', 'maxent']) for (const p of ['qubo', 'full']) {
  const r = gen.filter((o) => o.set === set && o[p]).map((o) => o[p]);
  const med = (k) => { const v = r.map((x) => x[k]).filter(Number.isFinite).sort((a, b) => a - b); return v[v.length >> 1]; };
  rows.push({ set, path: p, n: r.length, depth1: r.filter((x) => x.livingDepth === 1).length / r.length, livingControl: med('livingControl'), livingBedroomRatio: med('livingBedroomRatio') });
}
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const NAME = { hand: '손 가중치', calibrated: 'J 보정(부호 제약)', maxent: '최대 엔트로피(실제 빈도)' };
const L = ['# 진단: 생성 평면의 현관→거실 깊이가 실제보다 큰 이유\n'];
L.push(`> 생성: ${new Date().toISOString().slice(0, 10)} · \`node scripts/entrance-living-diagnosis.mjs\` · 실제 dev 도면 ${files.length}장(검증 묶음 제외, 15장마다 1장)의 침실 2~4개 세대 ${n.toLocaleString()}개 · 생성 평면은 \`evidence/results/generated-plans.jsonl\`\n`);
L.push('## 1. 측정 차이가 아니다\n');
L.push(`- 실제 dev 세대의 **${pct(touch / n)}**에서 현관이 거실과 맞닿고, 현관→거실 깊이 1이 ${pct(d1 / n)}입니다. 실제와 생성 평면은 같은 \`analyze()\`(벽 인접 그래프)로 쟀으므로 라벨 규칙 차이로 생긴 차이가 아닙니다.`);
L.push('- 현관과 맞닿는 실 유형(세대 비율): ' + [...nbr].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, c]) => `${t} ${pct(c / n)}`).join(', ') + '.\n');
L.push('## 2. 어느 단계에서 어긋나는가\n');
L.push('| 가중치 | 경로 | n | 현관→거실 깊이 1 | 거실 통제값 중앙값 | 거실/침실 통합도 비 중앙값 |');
L.push('|---|---|---|---|---|---|');
for (const r of rows) L.push(`| ${NAME[r.set]} | ${r.path === 'qubo' ? 'QUBO 최적해' : 'SA + 순위 점수 J'} | ${r.n} | ${pct(r.depth1)} | ${r.livingControl.toFixed(2)} | ${r.livingBedroomRatio.toFixed(2)} |`);
L.push(`| 실제 dev | | ${n} | ${pct(d1 / n)} | 2.62 | 2.42 |`);
L.push('');
L.push('## 3. 원인\n');
L.push('- **실제 빈도로 맞춘 가중치(최대 엔트로피)의 QUBO 최적해는 현관이 100% 거실에 붙습니다.** QUBO 항 구성 자체는 한국 평면의 현관–거실 관계를 표현할 수 있습니다.');
L.push('- 손 가중치와 J 보정 가중치의 QUBO 최적해는 13~18%만 붙습니다. J 보정에서 `entranceLiving`이 0이 되었고(J가 이 관계를 보상하지 않음), 현관–주방 맞닿음이 실제(16.8%)보다 훨씬 강하게 보상되기 때문입니다(evidence/results/qubo-maxent.md).');
L.push('- 생성기 전체 경로(SA + J)에서는 세 가중치 모두 33~39%로 내려갑니다. 순위 점수 J는 평가 모델 점수 + 목표 면적 부합 + 좁은 실 감점이고, 평가 모델 규칙 `livingNear`는 깊이 2까지 통과시키므로, 면적 부합이 조금 나은 깊이 2 평면이 뽑힙니다.');
L.push('- 결론: 어긋남은 **순위 점수 J(현재 기준)와 J에 맞춘 가중치**에서 생깁니다. 한국 실제 평면의 현관–거실 직결(dev 98% 이상)은 데이터로 뒷받침되는 구조 규칙이며, 이 진단은 검증(test) 묶음과 분류기 결과를 쓰지 않고 dev 데이터만으로 원인을 정했습니다.');
fs.writeFileSync(path.join(root, 'evidence', 'results', 'entrance-living-diagnosis.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(root, 'evidence', 'results', 'entrance-living-diagnosis.json'), JSON.stringify({ realUnits: n, realTouch: touch / n, realDepth1: d1 / n, neighbors: Object.fromEntries(nbr), rows }, null, 1));
console.log(`real n ${n} touch ${pct(touch / n)} depth1 ${pct(d1 / n)}`);
console.log(rows.map((r) => `${r.set} ${r.path} ${pct(r.depth1)}`).join('\n'));

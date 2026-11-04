// 기존 방식 대 정렬 모드(p.align): QUBO 칸 모형의 맞닿음이 실제 평면에서 얼마나 성립하는가, 그 대가(면적 부합·좁은 실)는 얼마인가.
// 왜: 템플릿 40개의 모든 배치를 기존 방식으로 풀었을 때 앞·뒤 띠 맞닿음 중 실제로 맞닿는 것이 24.5%뿐이었다(같은 띠 98.8%).
//   정렬 모드는 이를 생성 방식으로 보장하려는 것이다. 기본 동작은 바꾸지 않고 두 방식을 같은 조건에서 비교한다.
// 칸 모형: 같은 띠 이웃 칸, 앞·뒤 띠 겹치는 칸(qubo.js). 정렬 모드에서는 안방 칸 아래를 부속실이 차지하므로
//   안방–뒤 칸 대신 '안방 바로 뒤 부속실(부부욕실, 없으면 드레스룸)'–뒤 칸, 부속실–안방 이웃 칸, 부속실끼리, 드레스룸–안방이 맞닿는다.
// 사용: node scripts/align-check.mjs → evidence/results/align-check.md/json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLayout, sharedEdge, programOf } from '../src/generate/layout.js';
import { defaultParams } from '../src/generate/compare.js';
import { specs } from './lib/term-measure.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = JSON.parse(fs.readFileSync(path.join(root, 'analysis', 'syntax_qubo', 'templates.json'), 'utf8'));
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((q) => [x, ...q])));
const ov = (i, j, m, k) => Math.min((i + 1) / m, (j + 1) / k) - Math.max(i / m, j / k) > 1e-12;
function modelPairs(t, fp, bp, aligned) {
  const m = fp.length, k = bp.length, P = new Set();
  const add = (a, b) => P.add([a, b].sort().join('|'));
  for (let i = 0; i + 1 < m; i++) add(fp[i], fp[i + 1]);
  for (let j = 0; j + 1 < k; j++) add(bp[j], bp[j + 1]);
  const im = fp.indexOf('master');
  const suite = ['dress', 'bathMaster'].filter((s) => t.suite.includes(s));
  const low = aligned && suite.length ? suite.at(-1) : null; // 뒤 띠와 맞닿는 부속실
  for (let i = 0; i < m; i++) for (let j = 0; j < k; j++) if (ov(i, j, m, k)) add(i === im && low ? low : fp[i], bp[j]);
  if (aligned && suite.length) {
    add('master', suite[0]);
    if (suite.length === 2) add(suite[0], suite[1]);
    for (const n of [im - 1, im + 1]) if (n >= 0 && n < m) for (const s of suite) add(s, fp[n]);
  } else for (const s of suite) add(s, 'master');
  return P;
}
const out = {};
for (const mode of ['legacy', 'aligned']) {
  const c = { same: [0, 0, 0, 0], cross: [0, 0, 0, 0] };
  let n = 0, areaErr = 0, areaN = 0, narrow = 0, doorBad = 0;
  for (const t of T) {
    const spec = { ...specs[Number(t.id.split('/')[0])], prefs: [] };
    const target = Object.fromEntries(programOf(spec).map((r) => [r.key, r.area]));
    for (const fp of perms(t.front)) for (const bp of perms(t.back)) {
      const L = buildLayout(spec, { ...defaultParams(spec), frontOrder: fp, backOrder: bp, align: mode === 'aligned' });
      n++;
      const R = Object.fromEntries(L.rooms.map((r) => [r.key, r]));
      const P = modelPairs(t, fp, bp, mode === 'aligned');
      const nodes = [...t.front, ...t.back, ...t.suite];
      const frontSet = new Set([...t.front, ...(mode === 'aligned' ? t.suite : [])]);
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const u = nodes[i], v = nodes[j];
        const s = P.has([u, v].sort().join('|'));
        const g = R[u] && R[v] && sharedEdge(R[u], R[v]) > 0.05;
        const cc = c[frontSet.has(u) === frontSet.has(v) ? 'same' : 'cross'];
        cc[s && g ? 0 : s ? 1 : g ? 2 : 3]++;
      }
      for (const key of nodes) if (R[key] && target[key]) { areaErr += Math.abs(R[key].w * R[key].h - target[key]) / target[key]; areaN++; }
      narrow += L.rooms.filter((r) => r.minW && Math.min(r.w, r.h) < r.minW - 1e-6).length;
      doorBad += L.doorCheck.unreachable.length + L.doorCheck.throughBedroom.length;
    }
  }
  const f = ([tp, so, go, tn]) => ({ precision: tp / (tp + so), recall: tp / (tp + go), agree: (tp + tn) / (tp + so + go + tn) });
  out[mode] = { layouts: n, same: f(c.same), cross: f(c.cross), areaErr: areaErr / areaN, narrowPerPlan: narrow / n, doorIssuesPerPlan: doorBad / n };
}
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const L = ['# 기존 방식 대 정렬 모드: QUBO 칸 모형의 맞닿음이 실제 평면에서 성립하는가\n'];
L.push(`> 생성: ${new Date().toISOString().slice(0, 10)} · \`node scripts/align-check.mjs\` · 템플릿 40개의 모든 배치 ${out.legacy.layouts.toLocaleString('en-US')}개를 기본 치수로 평면화. 맞닿음 = 공유 변 0.05 m 초과\n`);
L.push('| | 기존 | 정렬 모드 |');
L.push('|---|---|---|');
for (const [k, lab] of [['same', '같은 띠'], ['cross', '앞·뒤 띠']]) {
  L.push(`| ${lab}: QUBO가 맞닿는다고 본 것 중 실제 맞닿음 | ${pct(out.legacy[k].precision)} | **${pct(out.aligned[k].precision)}** |`);
  L.push(`| ${lab}: 실제 맞닿음 중 QUBO가 잡은 것 | ${pct(out.legacy[k].recall)} | **${pct(out.aligned[k].recall)}** |`);
  L.push(`| ${lab}: 전체 일치율 | ${pct(out.legacy[k].agree)} | **${pct(out.aligned[k].agree)}** |`);
}
L.push(`| 실 면적 상대 오차(평균) | ${pct(out.legacy.areaErr)} | ${pct(out.aligned.areaErr)} |`);
L.push(`| 최소 폭 미달 실(평면당) | ${out.legacy.narrowPerPlan.toFixed(2)} | ${out.aligned.narrowPerPlan.toFixed(2)} |`);
L.push(`| 문 동선 문제(평면당) | ${out.legacy.doorIssuesPerPlan.toFixed(2)} | ${out.aligned.doorIssuesPerPlan.toFixed(2)} |`);
L.push('\n- 기본 치수(치수 다듬기 전) 기준이다. 정렬 모드는 연구 실험용 선택지이며 사이트 기본 동작은 기존 방식 그대로다.');
fs.writeFileSync(path.join(root, 'evidence', 'results', 'align-check.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(root, 'evidence', 'results', 'align-check.json'), JSON.stringify(out, null, 1));
console.log(L.join('\n'));

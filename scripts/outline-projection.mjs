// 외곽 투영 검증(변경 기록 6, 2026-11-06): 정확 QUBO + SA의 배치를 실제 세대 외곽 안으로 잘라 넣었을 때 QUBO 모형 그래프가 유지되는가.
//
// 사전 등록한 판정(결과를 보기 전에 정함, 이 파일의 첫 commit이 기록):
//   단위 = 외곽 묶음(outlines.json o1~o12) × 침실 수(2~4, β를 맞춘 범위이며 그 묶음에 실제 세대가 있는 것).
//   대상 = 사양 80개(rq4-specs) 중 그 침실 수의 사양 전부 × 템플릿 전부 × 배치 전부(안방 왼쪽 끝).
//   외곽 = 묶음 대표 세대의 실내 외곽(largest(maskFromUnit(rep, 사양 면적))), 실내 면적을 사양 전용면적에 맞춤.
//   평면 = 정렬 모드 직사각형 평면을 외곽 상자(폭 × 깊이)에 맞춰 만들고(깊이 = 상자 깊이), 외곽 밖 칸을 잘라 냄(src/generate/projection.js).
//   통과 = 모든 배치에서 ① 모든 실내 실이 1칸 이상 남고 한 덩어리 ② 잘라 낸 평면의 맞닿음 그래프 = 직사각형 평면 그래프(= QUBO 모형 그래프).
//   통과한 단위만 사이트에서 정확 QUBO + SA로 생성하고, 나머지는 '정확 QUBO 범위 밖'으로 표시해 기존 자유형 엔진을 쓴다.
//   품질(판정에 쓰지 않음, 보고만): 실별 면적 유지율(잘라 낸 면적 ÷ 직사각형 면적)의 최솟값, 50% 미만인 실이 있는 배치 비율.
//   대조(정합성): 외곽 대신 꽉 찬 직사각형 마스크로 같은 절차를 돌리면 100% 통과해야 한다(격자화 자체가 그래프를 바꾸지 않음).
// 사용: SPECS=rq4 node scripts/outline-projection.mjs → evidence/results/outline-projection.md/json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLayout } from '../src/generate/layout.js';
import { defaultParams, templates } from '../src/generate/compare.js';
import { layoutGraph } from '../src/generate/syntax-gen.js';
import { fineMask, project, sameGraph } from '../src/generate/projection.js';
import { largest, maskFromUnit } from '../src/freeform/outline.js';
import { specs } from './lib/rq4-specs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTL = JSON.parse(fs.readFileSync(path.join(root, 'public/data/outlines.json'), 'utf8'));
const CELL = 0.3;

function* perms(a) {
  if (a.length <= 1) return yield a.slice();
  for (let i = 0; i < a.length; i++) for (const p of perms([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...p];
}

/** 사양 하나 × 마스크 하나: 모든 템플릿·배치를 잘라 넣고 판정. */
function checkSpec(spec, mask) {
  const fm = fineMask(mask, CELL);
  const W = mask.nx * CELL;
  const D = mask.ny * CELL;
  const spec2 = { ...spec, area: W * D }; // 직사각형 평면을 외곽 상자에 맞춤(잘라 낸 뒤 실내 면적 ≈ 사양 면적)
  const base = { ...defaultParams(spec2), depth: D };
  let n = 0;
  let pass = 0;
  let lost = 0;
  let split = 0;
  let graphDiff = 0;
  let minKeep = Infinity;
  let lowKeep = 0;
  const fails = [];
  for (const t of templates(spec2, 'hand')) {
    const rest = t.q.bands.front.rooms.filter((x) => x !== 'master');
    for (const rp of perms(rest))
      for (const bp of perms(t.q.bands.back.rooms)) {
        const lay = buildLayout(spec2, { ...structuredClone(base), frontOrder: ['master', ...rp], backOrder: bp, align: true });
        const g = layoutGraph(lay);
        const pr = project(lay, fm);
        n++;
        const hasAll = pr.cellsOf.every((m) => m > 0);
        const oneEach = pr.connected.every(Boolean);
        const same = hasAll && sameGraph(pr.adj, g.adj);
        if (!hasAll) lost++;
        else if (!oneEach) split++;
        if (hasAll && !same) graphDiff++;
        const ok = hasAll && oneEach && same;
        if (ok) pass++;
        else if (fails.length < 3) fails.push({ k: t.k, front: ['master', ...rp], back: bp, lost: pr.rooms.filter((_, i) => !pr.cellsOf[i]).map((r) => r.key), split: pr.rooms.filter((_, i) => pr.cellsOf[i] && !pr.connected[i]).map((r) => r.key) });
        const keep = pr.rooms.map((_, i) => pr.area[i] / pr.rectArea[i]);
        const mk = Math.min(...keep);
        minKeep = Math.min(minKeep, mk);
        if (mk < 0.5) lowKeep++;
      }
  }
  return { n, pass, lost, split, graphDiff, minKeep, lowKeep, fails };
}

const rows = [];
// 대조: 꽉 찬 직사각형(외곽 상자 비율은 대표 사양의 기본 깊이)
{
  const s = specs.find((x) => x.bedrooms === 3);
  const D = defaultParams(s).depth;
  const Wd = s.area / D;
  const nx = Math.round(Wd / CELL);
  const ny = Math.round(D / CELL);
  const r = checkSpec(s, { nx, ny, cells: new Uint8Array(nx * ny).fill(1) });
  rows.push({ outline: '대조: 직사각형', bedrooms: 3, specs: 1, fill: 1, ...r });
  console.log('control', r.pass, '/', r.n);
}
for (const o of OUTL.outlines) {
  for (const b of [2, 3, 4]) {
    if (!o.byBeds[b]?.length) continue;
    const ss = specs.filter((x) => x.bedrooms === b);
    const acc = { n: 0, pass: 0, lost: 0, split: 0, graphDiff: 0, minKeep: Infinity, lowKeep: 0, fails: [], areas: new Set() };
    for (const s of ss) {
      const mask = largest(maskFromUnit(o.rep, s.area));
      const r = checkSpec(s, mask);
      for (const k of ['n', 'pass', 'lost', 'split', 'graphDiff', 'lowKeep']) acc[k] += r[k];
      acc.minKeep = Math.min(acc.minKeep, r.minKeep);
      if (acc.fails.length < 3) acc.fails.push(...r.fails.slice(0, 3 - acc.fails.length).map((f) => ({ area: s.area, ...f })));
      acc.areas.add(s.area);
    }
    const row = { outline: o.id, share: o.share, fill: o.fill, bedrooms: b, specs: ss.length, areas: [...acc.areas], ...acc, passed: acc.pass === acc.n };
    rows.push(row);
    console.log(o.id, b, `${acc.pass}/${acc.n}`, row.passed ? 'PASS' : 'fail', 'lost', acc.lost, 'split', acc.split, 'graph', acc.graphDiff);
  }
}
fs.writeFileSync(path.join(root, 'evidence/results/outline-projection.json'), JSON.stringify(rows.map((r) => ({ ...r, areas: r.areas })), null, 1));
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—');
const L = ['# 외곽 투영 검증: 정확 QUBO 배치를 실제 세대 외곽에 잘라 넣어도 모형 그래프가 유지되는가\n'];
L.push('> `SPECS=rq4 node scripts/outline-projection.mjs` · 외곽 = AI 허브 외곽 묶음 o1~o12 대표 세대(outlines.json) · 사양 80개 중 해당 침실 수 전부 × 템플릿 × 배치 전부 · 고운 칸 0.1 m\n');
L.push('판정(사전 등록): 모든 배치에서 ① 모든 실이 남고 한 덩어리 ② 잘라 낸 평면 그래프 = 직사각형 평면 그래프(= QUBO 모형 그래프). 통과한 외곽 × 침실 수만 사이트에서 정확 QUBO + SA로 생성.\n');
L.push('| 외곽 | 세대 비중 | 채움률 | 침실 | 배치 | 통과 | 실 사라짐 | 실 쪼개짐 | 그래프 다름 | 판정 | 면적 유지율 최솟값 | 유지율 50% 미만 실이 있는 배치 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows)
  L.push(`| ${r.outline} | ${r.share ? (100 * r.share).toFixed(1) + '%' : '—'} | ${r.fill.toFixed(3)} | ${r.bedrooms} | ${r.n.toLocaleString()} | ${pct(r.pass, r.n)} | ${r.lost} | ${r.split} | ${r.graphDiff} | ${r.outline.startsWith('대조') ? (r.pass === r.n ? '대조 통과' : '**대조 실패**') : r.passed ? '**통과**' : '불통과'} | ${(100 * r.minKeep).toFixed(0)}% | ${pct(r.lowKeep, r.n)} |`);
const real = rows.filter((r) => !r.outline.startsWith('대조'));
const ok = real.filter((r) => r.passed);
L.push(`\n- 통과: ${ok.length} / ${real.length} 단위(외곽 × 침실 수) — ${ok.map((r) => `${r.outline}·${r.bedrooms}침실`).join(', ') || '없음'}.`);
L.push('- 실 사라짐 = 외곽 밖으로 통째로 잘린 실이 있는 배치, 실 쪼개짐 = 잘린 뒤 두 덩어리 이상이 된 실이 있는 배치, 그래프 다름 = 모든 실이 남았지만 맞닿음이 바뀐 배치(겹쳐 셀 수 있음).');
L.push('- 면적 유지율은 품질 참고값이며 판정에 쓰지 않았다. 통과한 외곽이라도 유지율이 낮은 배치는 실 면적이 목표에서 크게 벗어난다(평면 진단에 표시).');
L.push('- 한계: 외곽은 묶음의 대표 세대 하나다(묶음 안의 다른 세대 외곽은 재지 않음). 투영은 잘라 내기만 하며 실 폭을 다시 나누지 않는다.');
for (const r of real.filter((x) => !x.passed).slice(0, 4)) L.push(`- 불통과 예(${r.outline}·${r.bedrooms}침실): ${r.fails.map((f) => `${f.area}㎡ 앞 ${f.front.join('·')} / 뒤 ${f.back.join('·')}${f.lost.length ? ` 사라짐 ${f.lost.join('·')}` : ''}${f.split.length ? ` 쪼개짐 ${f.split.join('·')}` : ''}`).join('; ')}`);
fs.writeFileSync(path.join(root, 'evidence/results/outline-projection.md'), L.join('\n') + '\n');
console.log(L.join('\n'));

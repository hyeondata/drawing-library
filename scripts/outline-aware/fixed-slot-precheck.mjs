// 외곽 비고정 트랙 10-01 사전 점검: 고정 칸 틀(p.fixedSlots)에서 외곽으로 잘라 낸 평면의 맞닿음 그래프가
// '실 쌍의 배정'만으로 정해지는가(= 이차 할당 문제 형식, 정확 QUBO로 쓸 수 있는 조건).
//
// 사전 등록(결과를 보기 전에 정함, 이 파일의 첫 commit이 기록. Confluence 10-01):
//   틀 = 정렬 모드 + 고정 칸: 안방 폭은 기존 배분, 나머지 앞 칸은 균등, 뒤 칸 경계도 균등(칸 모형 j/k 위치). 생성기 기본 동작은 그대로.
//   대상 = outline-projection.mjs와 같다: 외곽 o1~o12 대표 세대 × 침실 2~4(그 묶음에 세대가 있는 것) × SPECS=rq4 사양 전부 × 템플릿 × 배치 전부, 고운 칸 0.1 m.
//   칸 열쇠: 앞 띠 실 = 'f'+앞 칸 번호, 뒤 띠 실 = 'b'+뒤 칸 번호, 부속실(드레스룸·부부욕실) = 'S'(늘 안방 아래), 복도 = 'L'+거실의 앞 칸 번호
//            (정렬 모드 복도는 거실을 경계로 정해지므로). 그 밖의 실은 'X'로 두고 보고한다.
//   M0 대조(전 사양, 꽉 찬 직사각형): (a) 고정 칸 평면 그래프 = 기존 정렬 평면 그래프(순서만으로 정해지는 모형 그래프) 100%,
//      (b) 꽉 찬 마스크로 자른 그래프 = 자르기 전 그래프 100%. 하나라도 어긋나면 이 점검 전체를 무효로 본다.
//   M1 결정성(단위별): 같은 사양·같은 템플릿에서 (실, 칸 열쇠)가 같으면 잘린 뒤 상태(사라짐/쪼개짐/한 덩어리)가 같고,
//      (실 u, 칸 열쇠, 실 v, 칸 열쇠)가 같으면 맞닿음 여부가 같아야 한다. 어긋난 열쇠 수 = 0이면 '이차 형식 성립'.
//   M1 실행 가능: 모든 실이 남고 한 덩어리이며 잘린 그래프가 연결인 배치 수. 1개 이상이면 '정확 QUBO 후보'.
//   설계 (a) 채택 규칙: M0 통과 그리고 모든 단위에서 M1 어긋남 = 0. 실행 가능 배치가 0인 단위는 '범위 밖'으로 보고.
//   M2 면적(보고만, 판정 없음): 모든 실이 남은 배치에서 실별 |잘린 면적 ÷ 목표 면적(programOf(사양)) − 1|의 중앙값·90%·최댓값.
//      같은 지표를 기존 정렬 틀(실 크기 반영, fixedSlots 없음)에도 계산해 나란히 둔다.
//   M3 크기(보고만): 한 번이라도 참인 맞닿음 열쇠 수(이차 항 후보 수)를 단위별로.
// 사용: SPECS=rq4 node scripts/outline-aware/fixed-slot-precheck.mjs → evidence/results/outline-aware/fixed-slot-precheck.md/json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLayout, programOf } from '../../src/generate/layout.js';
import { defaultParams, templates } from '../../src/generate/compare.js';
import { layoutGraph } from '../../src/generate/syntax-gen.js';
import { fineMask, project, sameGraph } from '../../src/generate/projection.js';
import { largest, maskFromUnit } from '../../src/freeform/outline.js';
import { specs } from '../lib/rq4-specs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUTL = JSON.parse(fs.readFileSync(path.join(root, 'public/data/outlines.json'), 'utf8'));
const CELL = 0.3;
const SUITE = new Set(['dress', 'bathMaster']);

function* perms(a) {
  if (a.length <= 1) return yield a.slice();
  for (let i = 0; i < a.length; i++) for (const p of perms([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...p];
}
function* arrangements(spec2) {
  for (const t of templates(spec2, 'hand')) {
    const rest = t.q.bands.front.rooms.filter((x) => x !== 'master');
    for (const rp of perms(rest)) for (const bp of perms(t.q.bands.back.rooms)) yield { t, front: ['master', ...rp], back: bp };
  }
}
const quant = (a, q) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(q * (a.length - 1) + 0.5))] : null);
function connectedGraph(adj) {
  const ks = [...adj.keys()];
  if (!ks.length) return false;
  const seen = new Set([ks[0]]);
  const q = [ks[0]];
  for (let h = 0; h < q.length; h++) for (const v of adj.get(q[h])) if (!seen.has(v)) (seen.add(v), q.push(v));
  return seen.size === ks.length;
}

/** 사양 하나 × 마스크 하나. acc에 누적. */
function checkSpec(si, spec, mask, acc, { control = false } = {}) {
  const fm = fineMask(mask, CELL);
  const W = mask.nx * CELL;
  const D = mask.ny * CELL;
  const spec2 = { ...spec, area: W * D };
  const base = { ...defaultParams(spec2), depth: D };
  const target = Object.fromEntries(programOf(spec).map((r) => [r.key, r.area]));
  for (const a of arrangements(spec2)) {
    const p = { ...structuredClone(base), frontOrder: a.front, backOrder: a.back, align: true };
    const fixed = buildLayout(spec2, { ...p, fixedSlots: true });
    const gFixed = layoutGraph(fixed);
    const pr = project(fixed, fm);
    acc.n++;
    if (control) {
      const gOld = layoutGraph(buildLayout(spec2, structuredClone(p)));
      if (!sameGraph(gFixed.adj, gOld.adj)) acc.m0a++;
      if (!sameGraph(pr.adj, gFixed.adj) || !pr.cellsOf.every((m) => m > 0)) acc.m0b++;
    }
    const liv = a.front.indexOf('living');
    const keyOf = (k) => {
      const fi = a.front.indexOf(k);
      if (fi >= 0) return 'f' + fi;
      const bi = a.back.indexOf(k);
      if (bi >= 0) return 'b' + bi;
      if (SUITE.has(k)) return 'S';
      if (k.startsWith('hall')) return 'L' + liv;
      acc.other.add(k);
      return 'X';
    };
    const ks = pr.rooms.map((r) => r.key);
    const kk = ks.map(keyOf);
    const st = pr.rooms.map((_, i) => (!pr.cellsOf[i] ? 'lost' : pr.connected[i] ? 'one' : 'split'));
    // 복도 실 이름(hall0/hall1)은 거실 위치에 따라 순번이 바뀌므로, 복도는 '왼쪽/오른쪽'(실 중심 x < 거실 중심 x)으로 이름을 고정한다.
    const lv = fixed.rooms.find((r) => r.key === 'living');
    const name = (i) => (ks[i].startsWith('hall') ? (pr.rooms[i].x + pr.rooms[i].w / 2 < lv.x + lv.w / 2 ? 'hallL' : 'hallR') : ks[i]);
    for (let i = 0; i < ks.length; i++) {
      const key = `${si}|${a.t.k}|${name(i)}|${kk[i]}`;
      const v = acc.state.get(key);
      if (v === undefined) acc.state.set(key, st[i]);
      else if (v !== st[i]) acc.stateConf.add(key);
    }
    for (let i = 0; i < ks.length; i++)
      for (let j = i + 1; j < ks.length; j++) {
        if (!pr.cellsOf[i] || !pr.cellsOf[j]) continue;
        const [x, y] = [[name(i), kk[i]], [name(j), kk[j]]].sort((p1, p2) => (p1[0] < p2[0] ? -1 : 1));
        const key = `${si}|${a.t.k}|${x[0]}|${x[1]}|${y[0]}|${y[1]}`;
        const e = pr.adj.get(ks[i]).has(ks[j]);
        const v = acc.edge.get(key);
        if (v === undefined) acc.edge.set(key, e);
        else if (v !== e) acc.edgeConf.add(key);
      }
    const alive = pr.cellsOf.every((m) => m > 0);
    if (alive && pr.connected.every(Boolean) && connectedGraph(pr.adj)) acc.feasible++;
    if (alive) for (let i = 0; i < ks.length; i++) if (target[ks[i]]) acc.devFixed.push(Math.abs(pr.area[i] / target[ks[i]] - 1));
    if (!control) {
      // 기존 정렬 틀(실 크기 반영)의 같은 지표
      const old = project(buildLayout(spec2, structuredClone(p)), fm);
      if (old.cellsOf.every((m) => m > 0)) old.rooms.forEach((r, i) => target[r.key] && acc.devOld.push(Math.abs(old.area[i] / target[r.key] - 1)));
    }
  }
}
const newAcc = () => ({ n: 0, m0a: 0, m0b: 0, feasible: 0, state: new Map(), edge: new Map(), stateConf: new Set(), edgeConf: new Set(), devFixed: [], devOld: [], other: new Set() });
const summary = (acc) => ({
  n: acc.n, m0a: acc.m0a, m0b: acc.m0b, feasible: acc.feasible,
  stateConf: acc.stateConf.size, edgeConf: acc.edgeConf.size, edgeKeysTrue: [...acc.edge.values()].filter(Boolean).length,
  confExamples: [...acc.stateConf, ...acc.edgeConf].slice(0, 5), other: [...acc.other],
  devFixed: { med: quant(acc.devFixed, 0.5), p90: quant(acc.devFixed, 0.9), max: quant(acc.devFixed, 1) },
  devOld: { med: quant(acc.devOld, 0.5), p90: quant(acc.devOld, 0.9), max: quant(acc.devOld, 1) },
});

const rows = [];
{ // M0 대조: 침실 수마다 사양 전부, 꽉 찬 직사각형(기본 깊이)
  for (const b of [2, 3, 4]) {
    const acc = newAcc();
    specs.filter((s) => s.bedrooms === b).forEach((s, si) => {
      const D = defaultParams(s).depth;
      const nx = Math.round(s.area / D / CELL);
      const ny = Math.round(D / CELL);
      checkSpec(si, s, { nx, ny, cells: new Uint8Array(nx * ny).fill(1) }, acc, { control: true });
    });
    rows.push({ outline: '대조: 직사각형', bedrooms: b, ...summary(acc) });
    console.log('control', b, JSON.stringify(rows.at(-1)).slice(0, 300));
  }
}
for (const o of OUTL.outlines)
  for (const b of [2, 3, 4]) {
    if (!o.byBeds[b]?.length) continue;
    const acc = newAcc();
    specs.filter((x) => x.bedrooms === b).forEach((s, si) => checkSpec(si, s, largest(maskFromUnit(o.rep, s.area)), acc));
    rows.push({ outline: o.id, bedrooms: b, ...summary(acc) });
    console.log(o.id, b, JSON.stringify(rows.at(-1)).slice(0, 300));
  }
const outDir = path.join(root, 'evidence/results/outline-aware');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'fixed-slot-precheck.json'), JSON.stringify(rows, null, 1));
const ctrl = rows.filter((r) => r.outline.startsWith('대조'));
const real = rows.filter((r) => !r.outline.startsWith('대조'));
const m0ok = ctrl.every((r) => r.m0a === 0 && r.m0b === 0);
const m1ok = real.every((r) => r.stateConf === 0 && r.edgeConf === 0);
const f = (x) => (x == null ? '—' : `${(100 * x).toFixed(0)}%`);
const L = ['# 외곽 비고정 트랙 10-01: 고정 칸 틀의 이차 형식 사전 점검\n', '> `SPECS=rq4 node scripts/outline-aware/fixed-slot-precheck.mjs` · 판정은 이 파일 첫 commit에 사전 등록(Confluence 10-01)\n'];
L.push(`- M0 대조: ${m0ok ? '**통과**' : '**실패(점검 무효)**'} — ${ctrl.map((r) => `${r.bedrooms}침실 ${r.n}배치: 고정 칸≠기존 ${r.m0a}, 자르기 전후 다름 ${r.m0b}`).join(' · ')}`);
L.push(`- M1 결정성(모든 단위 어긋남 0): ${m1ok ? '**성립**' : '**불성립**'}`);
L.push(`- 설계 (a) 채택 규칙: ${m0ok && m1ok ? '**충족**' : '**불충족**'}\n`);
L.push('| 외곽 | 침실 | 배치 | 상태 어긋남 | 맞닿음 어긋남 | 실행 가능 배치 | 맞닿음 열쇠(참) | 면적 오차 중앙값·90%·최대 (고정 칸) | 같은 지표 (기존 정렬 틀) | 기타 실 |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) L.push(`| ${r.outline} | ${r.bedrooms} | ${r.n.toLocaleString()} | ${r.stateConf} | ${r.edgeConf} | ${r.feasible.toLocaleString()} | ${r.edgeKeysTrue.toLocaleString()} | ${f(r.devFixed.med)} · ${f(r.devFixed.p90)} · ${f(r.devFixed.max)} | ${f(r.devOld.med)} · ${f(r.devOld.p90)} · ${f(r.devOld.max)} | ${r.other.join(',') || '—'} |`);
const bad = real.filter((r) => r.stateConf || r.edgeConf);
if (bad.length) L.push(`\n- 어긋난 열쇠 예: ${bad.slice(0, 4).map((r) => `${r.outline}·${r.bedrooms}: ${r.confExamples.join('; ')}`).join(' / ')}`);
L.push(`- 범위 밖(실행 가능 배치 0): ${real.filter((r) => !r.feasible).map((r) => `${r.outline}·${r.bedrooms}`).join(', ') || '없음'}`);
L.push('- 면적 오차는 판정에 쓰지 않는다(보고만). 기존 정렬 틀 열은 모든 실이 남은 배치만 센다.');
fs.writeFileSync(path.join(outDir, 'fixed-slot-precheck.md'), L.join('\n') + '\n');
console.log(L.join('\n'));

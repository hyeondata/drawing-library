// AI 허브 아파트 평면도(APT_FP) 전체에서 세대 외곽 모양을 묶어 도면 생성 탭 첫 단계(외곽 형태)의 선택지를 만든다.
// 1) 세대마다 실내(발코니·실외기실 제외) 외곽을 0.3m 칸 마스크로 바꾸고(가장 큰 덩어리, 90% 미만이면 뺌), 발코니가 아래(앞)에 오게 돌린다.
// 2) 외곽 상자를 12×12로 나눈 칸별 채움 비율 + 가로세로 비율로 k-means(K개, 시드 고정).
// 3) 묶음마다 대표 외곽(중심에 가장 가까운 세대)과, 침실 수(1~5)별로 중심에 가까운 세대 PER_BED개(원본이 접근 규칙을 통과하는 세대만)를 남긴다.
//    생성 때는 대표 외곽 안에, 고른 침실 수의 세대 실 구성을 넣는다.
// 세대 수는 실 구성·면적이 똑같은 반복 세대를 하나로 센 값. 축척은 build-shapes.mjs와 같다(침실 한 변 297px ≈ 3.2m).
// 출력: public/data/outlines.json · 사용: node scripts/build-outlines.mjs <TL_SPA 폴더>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/model/index.js';
import { THRESHOLDS } from '../src/model/config.js';
import { access, energy, openings, setup, transformUnit } from '../src/freeform/engine.js';
import { largest, maskFromUnit } from '../src/freeform/outline.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2];
if (!dir) throw new Error('사용: node scripts/build-outlines.mjs <TL_SPA 폴더>');
const K = 12;
const G = 12;
const PER_BED = 3;
const BED_SIDE_M = 3.2;
const KEEP = new Set(['거실', '침실', '주방', '현관', '화장실', '발코니', '실외기실', '드레스룸', '다목적공간', '기타']);
const OUTDOOR = new Set(['발코니', '실외기실']);
const REQUIRED = ['현관', '거실', '주방', '침실', '화장실'];

const polyArea = (p) => Math.abs(p.reduce((s, [x1, y1], i) => s + x1 * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y1, 0)) / 2;
const bbox = (pts) => [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];
const centroid = (rooms) => {
  const pts = rooms.flatMap((r) => r.polys.flat());
  return [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
};

// ---- 1. 세대 모으기 ----
const units = [];
const seen = new Set();
const files = fs.readdirSync(dir).filter((x) => x.startsWith('APT_FP_SPA_') && x.endsWith('.json')).sort();
files.forEach((f, fi) => {
  const drawing = f.replace(/\.json$/, '');
  const a = analyze(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), 'SPA');
  const pxPerM = (THRESHOLDS.referenceBedSide * a.scale) / BED_SIDE_M;
  a.units.forEach((u, ui) => {
    const members = u.members.filter((i) => KEEP.has(a.spaces[i].type));
    const types = members.map((i) => a.spaces[i].type);
    if (REQUIRED.some((t) => !types.includes(t)) || members.length < 6) return;
    const [x0, y0] = bbox(members.flatMap((i) => a.spaces[i].polys.flat()));
    const rooms = members.map((i) => {
      const polys = a.spaces[i].polys.map((p) => p.map(([x, y]) => [+((x - x0) / pxPerM).toFixed(3), +((y - y0) / pxPerM).toFixed(3)]));
      return { type: a.spaces[i].type, polys, area: +polys.reduce((t, p) => t + polyArea(p), 0).toFixed(2) };
    });
    const interior = rooms.filter((r) => !OUTDOOR.has(r.type)).reduce((t, r) => t + r.area, 0);
    const b = bbox(rooms.flatMap((r) => r.polys.flat()));
    // 세대 분리가 어긋나 여러 세대·복도가 이어진 경우는 뺀다(build-shapes.mjs와 같은 기준).
    if (interior < 35 || interior > 200 || b[2] / b[3] > 2.6 || b[2] / b[3] < 0.4 || rooms.length > 24) return;
    const sig = rooms.map((r) => `${r.type}${r.area}`).sort().join();
    if (seen.has(sig)) return;
    seen.add(sig);
    // 발코니가 아래(앞)에 오게 돌린다.
    const bal = rooms.filter((r) => r.type === '발코니');
    let rot = 0;
    if (bal.length) {
      const [cx, cy] = centroid(rooms.filter((r) => !OUTDOOR.has(r.type)));
      const [bx, by] = centroid(bal);
      const dx = bx - cx;
      const dy = by - cy;
      rot = Math.abs(dy) >= Math.abs(dx) ? (dy >= 0 ? 0 : 2) : dx > 0 ? 1 : 3;
    }
    const index = new Map(members.map((m, k) => [m, k]));
    const unit = transformUnit(
      {
        id: `${drawing.replace('APT_FP_SPA_', '')}-${ui + 1}`,
        drawing,
        unit: ui + 1,
        interior: +interior.toFixed(1),
        rooms,
        edges: u.edges.filter(([i, j]) => index.has(i) && index.has(j)).map(([i, j]) => [index.get(i), index.get(j)]),
        beds: types.filter((t) => t === '침실').length,
        baths: types.filter((t) => t === '화장실').length,
        dress: types.includes('드레스룸'),
        multi: types.includes('다목적공간'),
      },
      { rot },
    );
    unit.W = +unit.W.toFixed(2);
    unit.H = +unit.H.toFixed(2);
    // 외곽이 한 덩어리가 아니면(가장 큰 덩어리가 90% 미만) 세대 분리가 어긋난 것으로 보고 뺀다.
    const m = largest(maskFromUnit(unit, 84));
    if (!m.n || m.share < 0.9) return;
    // 특징: 외곽 상자 12×12 칸별 채움 비율 + 가로세로 비율(로그)
    const feat = new Float64Array(G * G + 1);
    const cnt = new Float64Array(G * G);
    for (let j = 0; j < m.ny; j++)
      for (let i = 0; i < m.nx; i++) {
        const c = Math.floor((j / m.ny) * G) * G + Math.floor((i / m.nx) * G);
        cnt[c]++;
        feat[c] += m.cells[j * m.nx + i];
      }
    for (let c = 0; c < G * G; c++) feat[c] = cnt[c] ? feat[c] / cnt[c] : 0;
    feat[G * G] = Math.log(m.nx / m.ny) * 2;
    units.push({ unit, feat, fill: m.n / (m.nx * m.ny) });
  });
  if (fi % 500 === 0) process.stdout.write(`\r도면 ${fi + 1}/${files.length} · 세대 ${units.length}   `);
});
console.log(`\n외곽을 잰 고유 세대 ${units.length}개`);

// ---- 2. k-means(k-means++ 시작, 시드 고정) ----
let s = 7;
const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const d2 = (a, b) => a.reduce((t, x, i) => t + (x - b[i]) ** 2, 0);
const C = [Float64Array.from(units[Math.floor(rand() * units.length)].feat)];
while (C.length < K) {
  const ds = units.map((u) => Math.min(...C.map((c) => d2(u.feat, c))));
  let r = rand() * ds.reduce((t, x) => t + x, 0);
  let k = 0;
  while ((r -= ds[k]) > 0) k++;
  C.push(Float64Array.from(units[k].feat));
}
let assign = new Int32Array(units.length);
for (let it = 0; it < 40; it++) {
  let moved = 0;
  units.forEach((u, i) => {
    let best = 0;
    for (let k = 1; k < K; k++) if (d2(u.feat, C[k]) < d2(u.feat, C[best])) best = k;
    if (assign[i] !== best) ((assign[i] = best), moved++);
  });
  for (let k = 0; k < K; k++) {
    const mem = units.filter((_, i) => assign[i] === k);
    if (!mem.length) continue;
    C[k] = new Float64Array(G * G + 1);
    for (const u of mem) u.feat.forEach((x, t) => (C[k][t] += x / mem.length));
  }
  if (!moved) break;
}

// ---- 3. 묶음마다 대표 외곽 + 침실 수별 세대 ----
const passes = (u) => {
  const P = setup(u);
  const g = Int16Array.from(P.grid);
  return !access(P, energy(g, P).stats).unreach.length && !openings(g, P).unreachable.length;
};
const out = [];
for (let k = 0; k < K; k++) {
  const mem = units.map((u, i) => ({ ...u, i })).filter((u) => assign[u.i] === k).sort((a, b) => d2(a.feat, C[k]) - d2(b.feat, C[k]));
  if (!mem.length) continue;
  const rep = mem.slice(0, 60).find((u) => passes(u.unit));
  if (!rep) continue;
  const byBeds = {};
  for (let b = 1; b <= 5; b++) {
    byBeds[b] = [];
    for (const u of mem.filter((x) => x.unit.beds === b).slice(0, 40)) {
      if (byBeds[b].length >= PER_BED) break;
      if (passes(u.unit)) byBeds[b].push(u.unit);
    }
    if (!byBeds[b].length) delete byBeds[b];
  }
  const fill = mem.reduce((t, u) => t + u.fill, 0) / mem.length;
  const beds = {};
  for (const u of mem) beds[u.unit.beds] = (beds[u.unit.beds] || 0) + 1;
  out.push({ n: mem.length, fill: +fill.toFixed(3), beds, rep: rep.unit, byBeds });
}
out.sort((a, b) => b.n - a.n);
const total = units.length;
out.forEach((c, i) => {
  c.id = `o${i + 1}`;
  c.share = +(c.n / total).toFixed(4);
});
fs.writeFileSync(path.join(root, 'public', 'data', 'outlines.json'), JSON.stringify({ total, k: K, outlines: out }));
console.log(`묶음 ${out.length}개 → public/data/outlines.json`);
for (const c of out) console.log(c.id, `${c.n}세대(${(c.share * 100).toFixed(1)}%)`, `채움 ${c.fill}`, '침실별 세대', Object.fromEntries(Object.entries(c.byBeds).map(([b, l]) => [b, l.length])), '대표', c.rep.id);

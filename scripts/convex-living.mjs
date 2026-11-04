// 실제 세대의 거실 라벨을 볼록 공간으로 나눈 공간 그래프를 내보낸다(Confluence 09-15 12~13절).
// 왜: AI 허브 '거실' 다각형은 복도·식당 영역을 포함한 비볼록 형상이다(직사각형도 중앙값 0.59, scripts/room-convexity.mjs).
//   공간구문의 볼록 지도(Hillier & Hanson 1984: 영역을 덮는 가장 적고 가장 넓은 볼록 공간)와 생성기(복도 = 별도 노드)에 맞추려면
//   실제 쪽 거실을 나눠야 한다. 볼록 분할은 유일하지 않다(Peponis et al. 1997)는 비판이 있어 결정적 규칙 두 개로 민감도를 본다.
// 규칙(격자 셀 = 침실 한 변 중앙값/40 px, 거실 셀은 셀 중심이 다각형 안):
//   P1 가장 넓은 직사각형부터: 남은 셀에서 넓이 최대 직사각형을 반복해서 떼어 낸다(짧은 변 ≥ 0.6 m이고 넓이 ≥ 거실의 2%일 때까지).
//      남은 조각 셀은 가장 길게 맞닿은 직사각형에 붙인다. 가장 큰 조각 = 거실, 나머지 = 기타(복도 등).
//   P2 거실 핵 + 나머지: 넓이 최대 직사각형 하나 = 거실, 나머지 셀의 연결 성분마다 기타 하나(0.5 m² 미만 성분은 맞닿은 조각에 붙임).
// m 환산: 침실 한 변 중앙값 = 3.2 m로 가정(dev 침실 면적 중앙값 약 10 m²의 한 변). 덕트 규칙 등 나머지는 평가 모델과 같다.
// 사용: node scripts/convex-living.mjs P1|P2 → ../aihub-full/derived/unit-graphs-convex-P1.jsonl (형식은 export-unit-graphs와 같음)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/model/index.js';
import { pointInPolygon, polygonArea, toPolygons } from '../src/model/geometry.js';

const rule = process.argv[2] || 'P1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '..', 'aihub-full', 'TL_SPA');
const test = new Set(JSON.parse(fs.readFileSync(path.join(root, 'data', 'split.json'), 'utf8')).test);
const only = process.argv[3]; // 점검용: 도면 번호 하나만 처리하고 SVG를 그린다
const files = fs.readdirSync(dataDir).filter((f) => f.startsWith('APT_FP_SPA_') && f.endsWith('.json') && (!only || f.includes(only)));
const out = only ? { write() {}, end() {} } : fs.createWriteStream(path.join(root, '..', 'aihub-full', 'derived', `unit-graphs-convex-${rule}.jsonl`));
const BED_M = 3.2;

/** 이진 격자에서 넓이 최대 직사각형(히스토그램 방법). */
function maxRect(G, R, C) {
  const h = new Int32Array(C);
  let best = { a: 0 };
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) h[c] = G[r * C + c] ? h[c] + 1 : 0;
    const st = [];
    for (let c = 0; c <= C; c++) {
      const cur = c < C ? h[c] : 0;
      let start = c;
      while (st.length && st.at(-1)[1] >= cur) {
        const [s, hh] = st.pop();
        const a = hh * (c - s);
        if (a > best.a) best = { a, r0: r - hh + 1, r1: r, c0: s, c1: c - 1 };
        start = s;
      }
      st.push([start, cur]);
    }
  }
  return best;
}

/** 셀 묶음을 행 구간 직사각형 목록(픽셀 다각형)으로. */
function cellsToPolys(cells, C, x0, y0, g) {
  const rows = new Map();
  for (const i of cells) {
    const r = Math.floor(i / C);
    (rows.get(r) || rows.set(r, []).get(r)).push(i % C);
  }
  const polys = [];
  for (const [r, cs] of rows) {
    cs.sort((a, b) => a - b);
    let s = cs[0];
    for (let k = 1; k <= cs.length; k++) {
      if (k === cs.length || cs[k] !== cs[k - 1] + 1) {
        const e = cs[k - 1];
        const X0 = x0 + s * g, X1 = x0 + (e + 1) * g, Y0 = y0 + r * g, Y1 = y0 + (r + 1) * g;
        polys.push([X0, Y0, X1, Y0, X1, Y1, X0, Y1]);
        if (k < cs.length) s = cs[k];
      }
    }
  }
  return polys;
}

function partition(polys, bedSide) {
  const g = Math.max(3, bedSide / 40);
  const pxPerM = bedSide / BED_M;
  const xs = polys.flat().map((p) => p[0]), ys = polys.flat().map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const C = Math.ceil((Math.max(...xs) - x0) / g), R = Math.ceil((Math.max(...ys) - y0) / g);
  const G = new Uint8Array(R * C);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const cx = x0 + (c + 0.5) * g, cy = y0 + (r + 0.5) * g;
    if (polys.some((p) => pointInPolygon(cx, cy, p))) G[r * C + c] = 1;
  }
  const total = G.reduce((s, v) => s + v, 0);
  if (!total) return null;
  const label = new Int32Array(R * C).fill(-1);
  const pieces = [];
  const take = (m) => {
    const id = pieces.length;
    const cells = [];
    for (let r = m.r0; r <= m.r1; r++) for (let c = m.c0; c <= m.c1; c++) { G[r * C + c] = 0; label[r * C + c] = id; cells.push(r * C + c); }
    pieces.push(cells);
  };
  const minSide = (0.6 * pxPerM) / g;
  for (;;) {
    const m = maxRect(G, R, C);
    if (!m.a) break;
    const short = Math.min(m.r1 - m.r0 + 1, m.c1 - m.c0 + 1);
    if (pieces.length && (short < minSide || m.a < 0.02 * total)) break;
    take(m);
    if (rule === 'P2') break;
  }
  // 남은 셀의 연결 성분
  const seen = new Uint8Array(R * C);
  const comps = [];
  for (let i = 0; i < R * C; i++) {
    if (!G[i] || seen[i]) continue;
    const st = [i], comp = [];
    seen[i] = 1;
    while (st.length) {
      const k = st.pop();
      comp.push(k);
      const r = Math.floor(k / C), c = k % C;
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (rr < 0 || cc < 0 || rr >= R || cc >= C) continue;
        const j = rr * C + cc;
        if (G[j] && !seen[j]) { seen[j] = 1; st.push(j); }
      }
    }
    comps.push(comp);
  }
  const minCompCells = (0.5 * pxPerM * pxPerM) / (g * g);
  for (const comp of comps) {
    if (rule === 'P2' && comp.length >= minCompCells) {
      const id = pieces.length;
      for (const k of comp) label[k] = id;
      pieces.push(comp);
      continue;
    }
    // 가장 길게 맞닿은 조각에 붙인다
    const cnt = new Map();
    for (const k of comp) {
      const r = Math.floor(k / C), c = k % C;
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (rr < 0 || cc < 0 || rr >= R || cc >= C) continue;
        const l = label[rr * C + cc];
        if (l >= 0) cnt.set(l, (cnt.get(l) || 0) + 1);
      }
    }
    const tgt = cnt.size ? [...cnt].sort((a, b) => b[1] - a[1])[0][0] : 0;
    for (const k of comp) label[k] = tgt;
    pieces[tgt].push(...comp);
  }
  pieces.sort((a, b) => b.length - a.length);
  return pieces.map((cells) => cellsToPolys(cells, C, x0, y0, g));
}

const stats = { units: 0, livings: 0, split: 0, pieces: 0 };
for (const f of files) {
  const label = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  const cat = new Map(label.categories.map((c) => [c.name, c.id]));
  const LIV = cat.get('공간_거실'), ETC = cat.get('공간_기타');
  const beds = label.annotations.filter((a) => a.category_id === cat.get('공간_침실')).map((a) => Math.sqrt(toPolygons(a).reduce((s, p) => s + polygonArea(p), 0))).sort((a, b) => a - b);
  const bedSide = beds.length ? beds[Math.floor(beds.length / 2)] : 305;
  let nextId = Math.max(...label.annotations.map((a) => a.id)) + 1;
  const anns = [];
  for (const a of label.annotations) {
    if (a.category_id !== LIV) { anns.push(a); continue; }
    stats.livings++;
    const parts = partition(toPolygons(a), bedSide);
    if (!parts || parts.length === 1) { anns.push(a); continue; }
    stats.split++;
    stats.pieces += parts.length;
    parts.forEach((segs, k) => anns.push({ ...a, id: k === 0 ? a.id : nextId++, category_id: k === 0 ? LIV : ETC, segmentation: segs, attributes: {} }));
  }
  const an = analyze({ ...label, annotations: anns }, 'SPA', { unitRule: 'entrance' });
  if (only) {
    const col = { 거실: '#f4c', 침실: '#4af', 주방: '#fa4', 현관: '#4f4', 화장실: '#0dd', 기타: '#ccc', 발코니: '#cfc', 드레스룸: '#c9f' };
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="877" viewBox="0 0 ${label.images[0].width} ${label.images[0].height}"><rect width="100%" height="100%" fill="white"/>`;
    for (const sp of an.spaces) for (const p of sp.polys) svg += `<polygon points="${p.map((q) => q.join(',')).join(' ')}" fill="${col[sp.type] || '#eee'}" fill-opacity="0.6" stroke="#333" stroke-width="3"/>`;
    for (const sp of an.spaces) svg += `<text x="${sp.center[0]}" y="${sp.center[1]}" font-size="36">${sp.type}</text>`;
    fs.writeFileSync(`/tmp/claude-1000/dvw/convex-${rule}-${only}.svg`, svg + '</svg>');
  }
  for (const u of an.units) {
    const idx = new Map(u.members.map((gi, l) => [gi, l]));
    out.write(JSON.stringify({ drawing: f, unit: u.index, split: test.has(f) ? 'test' : 'dev', scale: an.scale, nodes: u.nodes.map((x) => ({ type: x.type, area: Math.round(an.spaces[x.space].area), duct: x.duct })), edges: u.edges.map(([i, j]) => [idx.get(i), idx.get(j)]) }) + '\n');
    stats.units++;
  }
}
out.end();
console.log(rule, stats);

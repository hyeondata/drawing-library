// 자유형 평면 SVG(흰 종이 위 도면이라 화면 테마와 무관한 고정색). 단위 m → 1m = 40.
import { roomPolygons } from './engine.js';
import { compass } from '../generate/sun-view.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// 실 종류 색(기존 생성 화면과 같은 계열)
export const ROOM_FILL = {
  거실: '#f6e7c8',
  주방: '#f3dcc0',
  침실: '#dbe7f7',
  화장실: '#d3ece4',
  현관: '#e6e0f2',
  드레스룸: '#dbe7f7',
  다목적공간: '#e9e3d6',
  기타: '#eeeeea',
  발코니: '#f4f4f1',
  실외기실: '#f4f4f1',
};
const OUTDOOR = new Set(['발코니', '실외기실']);

/** 실 이름 붙이기: 침실은 큰 순서로 안방·침실2…, 같은 종류가 여럿이면 번호. */
export function roomNames(rooms, sizeOf) {
  const names = {};
  const beds = rooms.filter((r) => r.type === '침실').sort((a, b) => sizeOf(b.k) - sizeOf(a.k));
  beds.forEach((r, i) => (names[r.k] = i === 0 ? '안방' : `침실${i + 1}`));
  const count = {};
  for (const r of rooms) if (r.type !== '침실') count[r.type] = (count[r.type] || 0) + 1;
  const seen = {};
  const label = { 기타: '복도·기타', 다목적공간: '다목적실', 주방: '주방/식당' };
  for (const r of rooms) {
    if (r.type === '침실') continue;
    seen[r.type] = (seen[r.type] || 0) + 1;
    const base = label[r.type] || r.type;
    names[r.k] = count[r.type] > 1 ? `${base}${seen[r.type]}` : base;
  }
  return names;
}

const pathOf = (loops, X, Y) => loops.map((pts) => 'M' + pts.map(([x, y]) => `${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join('L') + 'Z').join('');

/** 기준 세대(원본 다각형) SVG. highlight: 사각형이 아닌 실 강조 */
export function unitSvg(unit, { scale = 1, title = '', highlight = true, small = false } = {}) {
  const S = small ? 14 : 40;
  const pad = small ? 6 : 40;
  const X = (x) => pad + x * scale * S;
  const Y = (y) => pad + y * scale * S;
  const vw = unit.W * scale * S + pad * 2;
  const vh = unit.H * scale * S + pad * 2 + (title ? 34 : 0);
  const parts = [`<rect width="${vw}" height="${vh}" fill="#fff"/>`];
  for (const r of unit.rooms) {
    const non = highlight && !OUTDOOR.has(r.type) && r.rect < 0.85 && r.area >= 2;
    parts.push(`<path d="${pathOf(r.polys, X, Y)}" fill="${ROOM_FILL[r.type] || '#eee'}" stroke="${non ? '#e8590c' : '#3a3a40'}" stroke-width="${non ? (small ? 2 : 3.5) : small ? 0.8 : 1.6}"${OUTDOOR.has(r.type) ? ' stroke-dasharray="5 4"' : ''}/>`);
  }
  if (!small)
    for (const r of unit.rooms) {
      const pts = r.polys[0];
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      if (r.area * scale * scale < 1.5) continue;
      parts.push(`<text x="${X(cx)}" y="${Y(cy)}" text-anchor="middle" font-size="12" fill="#222">${esc(r.type)}</text>`);
    }
  if (title) parts.push(`<text x="${vw / 2}" y="${vh - 12}" text-anchor="middle" font-size="16" font-weight="700" fill="#222">${esc(title)}</text>`);
  return `<svg viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}" role="img" aria-label="${esc(title || '기준 세대')}">${parts.join('')}</svg>`;
}

/**
 * 생성 결과 SVG. assign: 칸 배정, P: setup 결과, opts: { openings, names, mode:'full'|'space', title, highlight:Set(실 k), small }
 */
export function planSvg(assign, P, { openings = [], names = {}, mode = 'full', title = '', small = false, labels = true, areaOf = null, front = null, sunOf = null } = {}) {
  const S = small ? 14 : 40;
  const pad = small ? 6 : 50;
  const W = P.nx * P.sx;
  const H = P.ny * P.sy;
  const X = (x) => pad + x * S;
  const Y = (y) => pad + y * S;
  const vw = W * S + pad * 2;
  const vh = H * S + pad * 2 + (title ? 34 : 0);
  const parts = [`<rect width="${vw.toFixed(0)}" height="${vh.toFixed(0)}" fill="#fff"/>`];
  parts.push('<defs><pattern id="ff-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#c9c9c0" stroke-width="2"/></pattern></defs>');
  const present = P.rooms.filter((r) => assign.includes(r.k));
  const polys = {};
  for (const r of present) polys[r.k] = roomPolygons(assign, P, r.k);
  for (const r of present) {
    const out = OUTDOOR.has(r.type);
    parts.push(`<path d="${pathOf(polys[r.k], X, Y)}" fill="${out ? 'url(#ff-hatch)' : ROOM_FILL[r.type] || '#eee'}" fill-rule="evenodd" stroke="none"/>`);
  }
  // 벽: 실 경계(안쪽 얇게, 바깥 굵게)
  const { nx, ny, sx, sy } = P;
  const wallIn = [];
  const wallOut = [];
  const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? -1 : assign[j * nx + i]);
  const isOut = (v) => v < 0 || OUTDOOR.has(P.rooms[v].type);
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = at(i, j - 1);
      const b = at(i, j);
      if (a === b || (a < 0 && b < 0)) continue;
      const seg = `M${X(i * sx).toFixed(1)} ${Y(j * sy).toFixed(1)}H${X((i + 1) * sx).toFixed(1)}`;
      (isOut(a) !== isOut(b) && !(a >= 0 && b >= 0 && OUTDOOR.has(P.rooms[a].type) && OUTDOOR.has(P.rooms[b].type)) ? wallOut : wallIn).push(seg);
    }
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j < ny; j++) {
      const a = at(i - 1, j);
      const b = at(i, j);
      if (a === b || (a < 0 && b < 0)) continue;
      const seg = `M${X(i * sx).toFixed(1)} ${Y(j * sy).toFixed(1)}V${Y((j + 1) * sy).toFixed(1)}`;
      (isOut(a) !== isOut(b) ? wallOut : wallIn).push(seg);
    }
  parts.push(`<path d="${wallIn.join('')}" stroke="#2b2a33" stroke-width="${small ? 1 : 3}" fill="none" stroke-linecap="square"/>`);
  parts.push(`<path d="${wallOut.join('')}" stroke="#2b2a33" stroke-width="${small ? 2 : 7}" fill="none" stroke-linecap="square"/>`);
  if (mode === 'full' && !small) {
    for (const o of openings) {
      const x1 = X(o.x1);
      const y1 = Y(o.y1);
      const x2 = X(o.x2);
      const y2 = Y(o.y2);
      // 벽을 지우고(흰 선) 문·창 표시
      parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="${o.kind === 'window' || o.kind === 'sliding' ? 5 : 9}"/>`);
      if (o.kind === 'door') {
        const L = Math.hypot(x2 - x1, y2 - y1);
        // 문 열림 호: 경계에서 문이 들어가는 실 쪽으로
        const toRoom = o.to;
        const mx = (o.x1 + o.x2) / 2;
        const my = (o.y1 + o.y2) / 2;
        const probe = (dx, dy) => at(Math.floor((mx + dx) / sx), Math.floor((my + dy) / sy));
        const e = 0.15;
        const sgn = o.v ? (probe(e, 0) === toRoom ? 1 : -1) : probe(0, e) === toRoom ? 1 : -1;
        const tipX = o.v ? x1 + sgn * L : x1;
        const tipY = o.v ? y1 : y1 + sgn * L;
        parts.push(`<path d="M${x1} ${y1}L${tipX} ${tipY}A${L} ${L} 0 0 ${(o.v ? sgn > 0 : sgn < 0) ? 1 : 0} ${x2} ${y2}" fill="#fde7dc" fill-opacity="0.5" stroke="#e8590c" stroke-width="2" stroke-dasharray="4 3"/>`);
        parts.push(`<line x1="${x1}" y1="${y1}" x2="${tipX}" y2="${tipY}" stroke="#e8590c" stroke-width="3"/>`);
      } else if (o.kind === 'window' || o.kind === 'sliding') {
        const nxv = o.v ? 3 : 0;
        const nyv = o.v ? 0 : 3;
        parts.push(`<line x1="${x1 - nxv}" y1="${y1 - nyv}" x2="${x2 - nxv}" y2="${y2 - nyv}" stroke="#4a90d9" stroke-width="2"/><line x1="${x1 + nxv}" y1="${y1 + nyv}" x2="${x2 + nxv}" y2="${y2 + nyv}" stroke="#4a90d9" stroke-width="2"/>`);
        if (o.kind === 'sliding') parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4a90d9" stroke-width="1.5" stroke-dasharray="6 3"/>`);
      }
    }
  }
  if (labels && !small)
    for (const r of present) {
      if (r.fixed && r.cells * P.sx * P.sy < 1.5) continue; // 덕트·작은 기타는 이름 생략
      // 이름 위치: 가장 안쪽 칸(가장자리에서 가장 먼 칸)
      let best = null;
      let bd = -1;
      for (let k = 0; k < assign.length; k++) {
        if (assign[k] !== r.k) continue;
        const i = k % nx;
        const j = Math.floor(k / nx);
        let d = 0;
        while (d < 40 && at(i + d + 1, j) === r.k && at(i - d - 1, j) === r.k && at(i, j + d + 1) === r.k && at(i, j - d - 1) === r.k) d++;
        if (d > bd) ((bd = d), (best = [i, j]));
      }
      if (!best) continue;
      const cx = X((best[0] + 0.5) * sx);
      const cy = Y((best[1] + 0.5) * sy);
      const m2 = areaOf ? areaOf(r.k) : null;
      const fs = bd >= 3 ? 15 : bd >= 1 ? 12 : 9;
      parts.push(`<text x="${cx}" y="${cy - (m2 !== null && bd >= 1 ? 4 : -4)}" text-anchor="middle" font-size="${fs}" font-weight="600" fill="#22212b">${esc(names[r.k] || r.type)}</text>`);
      if (m2 !== null && bd >= 1) parts.push(`<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="11" fill="#55535f">${m2.toFixed(1)}㎡</text>`);
      const so = sunOf ? sunOf(r.k) : null;
      if (so && bd >= 2) parts.push(`<text x="${cx}" y="${cy + 25}" text-anchor="middle" font-size="10.5" fill="${so.ok ? '#0f7b0f' : '#b42f2f'}">${esc(so.facingName)}향 · 일조 ${so.total.toFixed(1)}h</text>`);
    }
  if (title) parts.push(`<text x="${vw / 2}" y="${vh - 12}" text-anchor="middle" font-size="16" font-weight="700" fill="#222">${esc(title)}</text>`);
  if (front !== null && !small) parts.push(compass(vw - 40, 40, front, 18));
  return `<svg viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}" role="img" aria-label="${esc(title || '생성 평면')}">${parts.join('')}</svg>`;
}

/**
 * 원본(기준 세대)에서 지켜야 할 연결을 생성 평면 위에 겹쳐 그린다.
 * links: [{ p, q, status: 'met'|'wall'|'missing', label }], STATUS: 색·점선 정의(request-graph.js)
 */
export function graphOverlaySvg(assign, P, { links = [], names = {}, STATUS }) {
  const S = 40;
  const pad = 50;
  const { nx, ny, sx, sy } = P;
  const X = (x) => pad + x * S;
  const Y = (y) => pad + y * S;
  const vw = nx * sx * S + pad * 2;
  const vh = ny * sy * S + pad * 2;
  const parts = [`<rect width="${vw.toFixed(0)}" height="${vh.toFixed(0)}" fill="#fff"/>`];
  const present = P.rooms.filter((r) => assign.includes(r.k));
  const center = {};
  for (const r of present) {
    const loops = roomPolygons(assign, P, r.k);
    const out = OUTDOOR.has(r.type);
    parts.push(`<path d="${pathOf(loops, X, Y)}" fill="${out ? '#f4f4f1' : '#f7f6f2'}" fill-rule="evenodd" stroke="#b9b7c2" stroke-width="1.2"${out ? ' stroke-dasharray="5 4"' : ''}/>`);
    // 중심: 실 칸 가운데 가장 안쪽 칸
    let best = null;
    let bd = -1;
    const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? -1 : assign[j * nx + i]);
    for (let k = 0; k < assign.length; k++) {
      if (assign[k] !== r.k) continue;
      const i = k % nx;
      const j = Math.floor(k / nx);
      let d = 0;
      while (d < 40 && at(i + d + 1, j) === r.k && at(i - d - 1, j) === r.k && at(i, j + d + 1) === r.k && at(i, j - d - 1) === r.k) d++;
      if (d > bd) ((bd = d), (best = [i, j]));
    }
    if (best) center[r.k] = [X((best[0] + 0.5) * sx), Y((best[1] + 0.5) * sy)];
  }
  const seen = new Map();
  for (const e of links) {
    const a = center[e.p];
    const b = center[e.q];
    if (!a || !b) continue;
    const st = STATUS[e.status];
    const key = [e.p, e.q].sort().join('|');
    const k = seen.get(key) || 0;
    seen.set(key, k + 1);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const bend = (k % 2 ? -1 : 1) * (8 + 12 * k);
    const qx = (a[0] + b[0]) / 2 + (-(b[1] - a[1]) / len) * bend;
    const qy = (a[1] + b[1]) / 2 + ((b[0] - a[0]) / len) * bend;
    parts.push(`<path d="M${a[0]} ${a[1]}Q${qx} ${qy} ${b[0]} ${b[1]}" fill="none" stroke="${st.color}" stroke-width="4.5" stroke-linecap="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}><title>${esc(e.label)}: ${esc(st.label)}</title></path>`);
    if (e.status === 'missing') parts.push(`<text x="${qx}" y="${qy + 5}" text-anchor="middle" font-size="15" font-weight="800" fill="${st.color}">?</text>`);
  }
  for (const r of present) {
    if (OUTDOOR.has(r.type) || !center[r.k]) continue;
    if (r.fixed && r.cells * sx * sy < 1.5) continue;
    const [x, y] = center[r.k];
    const used = links.some((e) => e.p === r.k || e.q === r.k);
    parts.push(`<circle cx="${x}" cy="${y}" r="${used ? 7 : 4}" fill="${used ? '#2b2a33' : '#b9b7c2'}" stroke="#fff" stroke-width="2"/>`);
    parts.push(`<text x="${x}" y="${y - 12}" text-anchor="middle" font-size="12" font-weight="600" fill="#22212b" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(names[r.k] || r.type)}</text>`);
  }
  return `<svg viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}" role="img" aria-label="원본 연결 겹쳐 보기">${parts.join('')}</svg>`;
}

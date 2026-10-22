// 생성한 평면을 SVG 문자열로 그린다(흰 종이 위 도면이라 화면 테마와 상관없이 같은 색).
import { FIXTURE_COLORS, STR_STYLE, roomGroupOf } from '../model/drawing-style.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * layout(m) → SVG. 1m = 40 단위. 실 이름·면적과 바깥 치수(mm)를 적는다.
 * mode: 'space'(실만, 예시 도면의 SPA처럼) | 'full'(모든 요소: 실 + 문·창(STR) + 설비(OBJ)).
 */
export function layoutSvg(layout, { title = '', showArea = true, mode = 'space', stage = null } = {}) {
  // stage(생성 과정 1~8): 1 전용면적 윤곽, 2 앞·뒤 띠, 3 실 배치, 4 폭 나누기, 5 복도·부속실, 6 문·개구부, 7 창·발코니 문, 8 설비(완성)
  if (stage) {
    const keep = stage >= 8 ? null : stage >= 7 ? ['door', 'opening', 'window', 'sliding'] : stage >= 6 ? ['door', 'opening'] : [];
    layout = { ...layout, openings: keep ? (layout.openings || []).filter((o) => keep.includes(o.kind)) : layout.openings, fixtures: stage >= 8 ? layout.fixtures : [] };
    mode = stage >= 6 ? 'full' : 'space';
    showArea = stage === 3 || stage >= 8;
  }
  const outlineOnly = stage !== null && stage <= 2;
  const highlight = stage === 5 ? new Set(layout.rooms.filter((r) => r.type === '기타' || r.key === 'bathMaster' || r.key === 'dress' || r.key === 'master').map((r) => r.key)) : null;
  const S = 40;
  const pad = 70;
  const ys = layout.rooms.map((r) => r.y);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(...layout.rooms.map((r) => r.y + r.h));
  const maxX = Math.max(...layout.rooms.map((r) => r.x + r.w));
  const vw = maxX * S + pad * 2;
  const vh = (maxY - minY) * S + pad * 2;
  const X = (x) => pad + x * S;
  const Y = (y) => pad + (y - minY) * S;
  const parts = [];
  parts.push(`<rect x="0" y="0" width="${vw}" height="${vh}" fill="#ffffff"/>`);
  parts.push(
    '<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#b9c7a6" stroke-width="2"/></pattern></defs>',
  );
  for (const r of layout.rooms) {
    const outdoor = r.type === '발코니' || r.type === '실외기실';
    if (outlineOnly) {
      if (outdoor) parts.push(`<rect x="${X(r.x).toFixed(1)}" y="${Y(r.y).toFixed(1)}" width="${(r.w * S).toFixed(1)}" height="${(r.h * S).toFixed(1)}" fill="url(#hatch)" stroke="#8b88a0" stroke-width="2" stroke-dasharray="6 4"/>`);
      continue;
    }
    const fill = outdoor ? 'url(#hatch)' : roomGroupOf(r.type).fill;
    const dim = highlight && !highlight.has(r.key) && !outdoor ? ' fill-opacity="0.3"' : '';
    parts.push(
      `<rect x="${X(r.x).toFixed(1)}" y="${Y(r.y).toFixed(1)}" width="${(r.w * S).toFixed(1)}" height="${(r.h * S).toFixed(1)}" fill="${fill}"${dim} stroke="#2b2a33" stroke-width="${outdoor ? 2 : 5}"/>`,
    );
  }
  // 바깥 벽을 한 번 더 굵게
  const inner = layout.rooms.filter((r) => r.type !== '발코니' && r.type !== '실외기실');
  const ix0 = Math.min(...inner.map((r) => r.x));
  const iy0 = Math.min(...inner.map((r) => r.y));
  const ix1 = Math.max(...inner.map((r) => r.x + r.w));
  const iy1 = Math.max(...inner.map((r) => r.y + r.h));
  parts.push(`<rect x="${X(ix0)}" y="${Y(iy0)}" width="${(ix1 - ix0) * S}" height="${(iy1 - iy0) * S}" fill="${outlineOnly ? '#f3f1ea' : 'none'}" stroke="#1b1a22" stroke-width="9"/>`);
  if (outlineOnly) {
    const area = ((ix1 - ix0) * (iy1 - iy0)).toFixed(1);
    if (stage === 1) parts.push(`<text x="${X((ix0 + ix1) / 2)}" y="${Y((iy0 + iy1) / 2) + 8}" font-size="26" font-weight="700" text-anchor="middle" fill="#1b1a22">전용 ${area}㎡</text>`);
    if (stage === 2) {
      // 앞 띠 깊이 = 거실 깊이(거실은 앞 띠를 꽉 채운다)
      const living = layout.rooms.find((r) => r.key === 'living');
      const yb = living ? living.y : (iy0 + iy1) / 2;
      parts.push(`<line x1="${X(ix0)}" y1="${Y(yb)}" x2="${X(ix1)}" y2="${Y(yb)}" stroke="#5b3ff0" stroke-width="4" stroke-dasharray="12 8"/>`);
      parts.push(`<text x="${X((ix0 + ix1) / 2)}" y="${Y((iy0 + yb) / 2) + 7}" font-size="20" font-weight="700" text-anchor="middle" fill="#1b1a22">뒤 띠(북) · 깊이 ${(yb - iy0).toFixed(2)}m</text>`);
      parts.push(`<text x="${X((ix0 + ix1) / 2)}" y="${Y((yb + iy1) / 2) + 7}" font-size="20" font-weight="700" text-anchor="middle" fill="#1b1a22">앞 띠(남) · 깊이 ${(iy1 - yb).toFixed(2)}m</text>`);
    }
  }
  if (mode === 'full') parts.push(...openingParts(layout, X, Y, S), ...fixtureParts(layout, X, Y, S));
  for (const r of outlineOnly ? [] : layout.rooms) {
    const cx = X(r.x + r.w / 2);
    const cy = Y(r.y + r.h / 2);
    // 실 폭에 맞춰 글자 크기를 줄인다.
    const fs = Math.max(9, Math.min(17, (r.w * S * 0.9) / Math.max(2, [...r.name].length), r.h * S * 0.3));
    parts.push(`<text x="${cx.toFixed(1)}" y="${(cy - (showArea || stage === 4 ? 4 : -5)).toFixed(1)}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="#1b1a22">${esc(r.name)}</text>`);
    if (showArea) parts.push(`<text x="${cx.toFixed(1)}" y="${(cy + fs - 2).toFixed(1)}" font-size="${fs - 4}" text-anchor="middle" fill="#55536a">${(r.w * r.h).toFixed(1)}㎡</text>`);
    else if (stage === 4) parts.push(`<text x="${cx.toFixed(1)}" y="${(cy + fs - 2).toFixed(1)}" font-size="${Math.max(9, fs - 3)}" font-weight="600" text-anchor="middle" fill="#5b3ff0">폭 ${r.w.toFixed(2)}m</text>`);
  }
  // 치수: 전체 폭과 깊이(mm)
  const dim = (x1, y1, x2, y2, label, vertical) => {
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8b88a0" stroke-width="1.5"/>`);
    const tx = (x1 + x2) / 2 + (vertical ? -10 : 0);
    const ty = (y1 + y2) / 2 + (vertical ? 0 : -8);
    parts.push(`<text x="${tx}" y="${ty}" font-size="15" fill="#55536a" text-anchor="middle"${vertical ? ` transform="rotate(-90 ${tx} ${ty})"` : ''}>${label}</text>`);
  };
  dim(X(ix0), Y(minY) - 34, X(ix1), Y(minY) - 34, `${Math.round((ix1 - ix0) * 1000)}`, false);
  dim(X(ix0) - 34, Y(iy0), X(ix0) - 34, Y(iy1), `${Math.round((iy1 - iy0) * 1000)}`, true);
  if (title) parts.push(`<text x="${vw / 2}" y="${vh - 18}" font-size="18" font-weight="700" text-anchor="middle" fill="#1b1a22">${esc(title)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}" font-family="Pretendard, 'Noto Sans KR', sans-serif" role="img" aria-label="${esc(title || '생성한 평면')}">${parts.join('')}</svg>`;
}

const f1 = (v) => v.toFixed(1);

/** 문·개구부·창. 벽 위에 흰 틈을 내고 예시 도면(STR)의 색으로 그린다. */
function openingParts(layout, X, Y, S) {
  const parts = [];
  const inner = layout.rooms.filter((r) => r.type !== '발코니' && r.type !== '실외기실');
  const ix0 = Math.min(...inner.map((r) => r.x));
  const iy0 = Math.min(...inner.map((r) => r.y));
  const ix1 = Math.max(...inner.map((r) => r.x + r.w));
  const iy1 = Math.max(...inner.map((r) => r.y + r.h));
  const onOuter = (o) => (o.v ? Math.abs(o.x1 - ix0) < 1e-6 || Math.abs(o.x1 - ix1) < 1e-6 : Math.abs(o.y1 - iy0) < 1e-6 || Math.abs(o.y1 - iy1) < 1e-6);
  for (const o of layout.openings || []) {
    const t = onOuter(o) ? 10 : 6; // 벽 두께(그림 단위)
    const a = [X(o.x1), Y(o.y1)];
    const b = [X(o.x2), Y(o.y2)];
    const gap = `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="#ffffff" stroke-width="${t + 2}"/>`;
    if (o.kind === 'opening') {
      parts.push(gap);
      continue;
    }
    if (o.kind === 'window' || o.kind === 'sliding') {
      const x = Math.min(a[0], b[0]) - (o.v ? t / 2 : 0);
      const y = Math.min(a[1], b[1]) - (o.v ? 0 : t / 2);
      const w = o.v ? t : Math.abs(b[0] - a[0]);
      const h = o.v ? Math.abs(b[1] - a[1]) : t;
      parts.push(gap);
      parts.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${STR_STYLE.window.fill}" stroke="${STR_STYLE.window.stroke}" stroke-width="1.4"/>`);
      if (o.kind === 'sliding') {
        // 미닫이: 두 짝이 겹친 모양
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        parts.push(o.v
          ? `<line x1="${f1(x + w * 0.3)}" y1="${f1(a[1])}" x2="${f1(x + w * 0.3)}" y2="${f1(my + 4)}" stroke="${STR_STYLE.window.stroke}" stroke-width="1.4"/><line x1="${f1(x + w * 0.7)}" y1="${f1(my - 4)}" x2="${f1(x + w * 0.7)}" y2="${f1(b[1])}" stroke="${STR_STYLE.window.stroke}" stroke-width="1.4"/>`
          : `<line x1="${f1(a[0])}" y1="${f1(y + h * 0.3)}" x2="${f1(mx + 4)}" y2="${f1(y + h * 0.3)}" stroke="${STR_STYLE.window.stroke}" stroke-width="1.4"/><line x1="${f1(mx - 4)}" y1="${f1(y + h * 0.7)}" x2="${f1(b[0])}" y2="${f1(y + h * 0.7)}" stroke="${STR_STYLE.window.stroke}" stroke-width="1.4"/>`);
      } else {
        parts.push(o.v
          ? `<line x1="${f1(x + w / 2)}" y1="${f1(a[1])}" x2="${f1(x + w / 2)}" y2="${f1(b[1])}" stroke="${STR_STYLE.window.stroke}" stroke-width="1"/>`
          : `<line x1="${f1(a[0])}" y1="${f1(y + h / 2)}" x2="${f1(b[0])}" y2="${f1(y + h / 2)}" stroke="${STR_STYLE.window.stroke}" stroke-width="1"/>`);
      }
      continue;
    }
    // 여닫이문: 경첩(a)에서 문짝이 실 안쪽(현관문은 바깥쪽)으로 열린다.
    const sign = o.entry ? -1 : 1;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const leaf = [a[0] + o.nx * sign * len, a[1] + o.ny * sign * len];
    const cross = (leaf[0] - a[0]) * (b[1] - a[1]) - (leaf[1] - a[1]) * (b[0] - a[0]);
    const sweep = cross > 0 ? 1 : 0;
    parts.push(gap);
    parts.push(`<path d="M${f1(a[0])} ${f1(a[1])} L${f1(leaf[0])} ${f1(leaf[1])} A${f1(len)} ${f1(len)} 0 0 ${sweep} ${f1(b[0])} ${f1(b[1])} Z" fill="${STR_STYLE.door.fill}" fill-opacity="0.55" stroke="none"/>`);
    parts.push(`<path d="M${f1(leaf[0])} ${f1(leaf[1])} A${f1(len)} ${f1(len)} 0 0 ${sweep} ${f1(b[0])} ${f1(b[1])}" fill="none" stroke="${STR_STYLE.door.stroke}" stroke-width="1.2" stroke-dasharray="4 3"/>`);
    parts.push(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(leaf[0])}" y2="${f1(leaf[1])}" stroke="${STR_STYLE.door.stroke}" stroke-width="3" stroke-linecap="round"/>`);
  }
  return parts;
}

/** 설비(변기·세면대·욕조·싱크대·가스레인지). 예시 도면(OBJ)과 같은 색. */
function fixtureParts(layout, X, Y, S) {
  const parts = [];
  for (const f of layout.fixtures || []) {
    const c = FIXTURE_COLORS[f.type] || '#6f6c7e';
    const x = X(f.x);
    const y = Y(f.y);
    const w = f.w * S;
    const h = f.h * S;
    const cx = x + w / 2;
    const cy = y + h / 2;
    parts.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="3" fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-width="1.6"/>`);
    if (f.type === '변기' || f.type === '세면대') {
      parts.push(`<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(w * 0.32)}" ry="${f1(h * 0.32)}" fill="none" stroke="${c}" stroke-width="1.4"/>`);
    } else if (f.type === '욕조') {
      parts.push(`<rect x="${f1(x + 4)}" y="${f1(y + 4)}" width="${f1(w - 8)}" height="${f1(h - 8)}" rx="${f1(Math.min(w, h) / 3)}" fill="none" stroke="${c}" stroke-width="1.4"/>`);
    } else if (f.type === '싱크대') {
      const bw = Math.min(w, h) * 0.6;
      parts.push(`<rect x="${f1(cx - bw / 2)}" y="${f1(cy - bw / 2)}" width="${f1(bw)}" height="${f1(bw)}" rx="3" fill="none" stroke="${c}" stroke-width="1.4"/>`);
    } else if (f.type === '가스레인지') {
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(`<circle cx="${f1(cx + (dx * w) / 4.5)}" cy="${f1(cy + (dy * h) / 4.5)}" r="${f1(Math.min(w, h) / 7)}" fill="none" stroke="${c}" stroke-width="1.3"/>`);
    }
  }
  return parts;
}

/** 모든 요소 보기의 범례(예시 도면과 같은 이름·색). */
export const FULL_LEGEND = [
  { label: '벽', fill: '#2b2a33' },
  { label: '출입문', fill: STR_STYLE.door.fill, stroke: STR_STYLE.door.stroke },
  { label: '창호', fill: STR_STYLE.window.fill, stroke: STR_STYLE.window.stroke },
  ...Object.entries(FIXTURE_COLORS).map(([label, c]) => ({ label, fill: c, stroke: c })),
];

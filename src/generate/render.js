// 생성한 평면을 SVG 문자열로 그린다(흰 종이 위 도면이라 화면 테마와 상관없이 같은 색).
import { roomGroupOf } from '../model/drawing-style.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** layout(m) → SVG. 1m = 40 단위. 실 이름·면적과 바깥 치수(mm)를 적는다. */
export function layoutSvg(layout, { title = '', showArea = true } = {}) {
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
    const fill = outdoor ? 'url(#hatch)' : roomGroupOf(r.type).fill;
    parts.push(
      `<rect x="${X(r.x).toFixed(1)}" y="${Y(r.y).toFixed(1)}" width="${(r.w * S).toFixed(1)}" height="${(r.h * S).toFixed(1)}" fill="${fill}" stroke="#2b2a33" stroke-width="${outdoor ? 2 : 5}"/>`,
    );
  }
  // 바깥 벽을 한 번 더 굵게
  const inner = layout.rooms.filter((r) => r.type !== '발코니' && r.type !== '실외기실');
  const ix0 = Math.min(...inner.map((r) => r.x));
  const iy0 = Math.min(...inner.map((r) => r.y));
  const ix1 = Math.max(...inner.map((r) => r.x + r.w));
  const iy1 = Math.max(...inner.map((r) => r.y + r.h));
  parts.push(`<rect x="${X(ix0)}" y="${Y(iy0)}" width="${(ix1 - ix0) * S}" height="${(iy1 - iy0) * S}" fill="none" stroke="#1b1a22" stroke-width="9"/>`);
  for (const r of layout.rooms) {
    const cx = X(r.x + r.w / 2);
    const cy = Y(r.y + r.h / 2);
    // 실 폭에 맞춰 글자 크기를 줄인다.
    const fs = Math.max(9, Math.min(17, (r.w * S * 0.9) / Math.max(2, [...r.name].length), r.h * S * 0.3));
    parts.push(`<text x="${cx.toFixed(1)}" y="${(cy - (showArea ? 4 : -5)).toFixed(1)}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="#1b1a22">${esc(r.name)}</text>`);
    if (showArea) parts.push(`<text x="${cx.toFixed(1)}" y="${(cy + fs - 2).toFixed(1)}" font-size="${fs - 4}" text-anchor="middle" fill="#55536a">${(r.w * r.h).toFixed(1)}㎡</text>`);
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

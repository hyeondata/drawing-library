// QUBO 에너지(가로, 낮을수록 좋음)와 평가 점수(세로, 높을수록 좋음) 산점도. 서버(빌드)와 브라우저에서 같이 쓴다.
// 색은 CSS 변수(--cat-1~3, 밝음·어두움 테마 모두 검증)라 테마를 따라가고, 모양(원·삼각형)을 함께 써 색만으로 구분하지 않는다.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** 스피어만 순위상관(동점은 평균 순위). */
export function spearman(a, b) {
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(v.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  if (a.length < 3) return null;
  const ra = rank(a);
  const rb = rank(b);
  const m = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = m(ra);
  const mb = m(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}

const marker = (shape, x, y, r, fill, extra = '') =>
  shape === 'tri'
    ? `<path d="M${x} ${y - r * 1.15}L${x + r} ${y + r * 0.75}L${x - r} ${y + r * 0.75}Z" fill="${fill}" stroke="var(--surface-1)" stroke-width="1.5"${extra}/>`
    : shape === 'sq'
      ? `<rect x="${x - r * 0.85}" y="${y - r * 0.85}" width="${r * 1.7}" height="${r * 1.7}" fill="${fill}" stroke="var(--surface-1)" stroke-width="1.5"${extra}/>`
      : `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="var(--surface-1)" stroke-width="1.5"${extra}/>`;

/**
 * 한 칸(패널) SVG. points: [{ x, y, group, shape, label, ring }], groups: { key: { color } }
 * opts: { title, xLabel, yLabel, rho, optimum(x에 세로 점선) }
 */
export function scatterPanel(points, groups, { title = '', xLabel = 'QUBO 에너지 ↓', yLabel = '점수 ↑', rho = null, optimum = null, w = 420, h = 300 } = {}) {
  const L = 46;
  const R = 12;
  const T = 30;
  const B = 38;
  if (!points.length) return `<svg viewBox="0 0 ${w} ${h}"><text x="${w / 2}" y="${h / 2}" text-anchor="middle" class="sc-ax">점 없음</text></svg>`;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  let [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (optimum !== null) x0 = Math.min(x0, optimum);
  const px = (x1 - x0 || 1) * 0.06;
  const py = (y1 - y0 || 1) * 0.08;
  x0 -= px;
  x1 += px;
  y0 -= py;
  y1 += py;
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (w - L - R);
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (h - T - B);
  const ticks = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
  const parts = [];
  for (const v of ticks(y0 + py, y1 - py, 4)) parts.push(`<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" class="sc-grid"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="sc-ax">${v.toFixed(0)}</text>`);
  for (const v of ticks(x0 + px, x1 - px, 4)) parts.push(`<text x="${X(v)}" y="${h - B + 16}" text-anchor="middle" class="sc-ax">${v.toFixed(1)}</text>`);
  parts.push(`<line x1="${L}" x2="${w - R}" y1="${h - B}" y2="${h - B}" class="sc-base"/>`);
  if (optimum !== null) parts.push(`<line x1="${X(optimum)}" x2="${X(optimum)}" y1="${T}" y2="${h - B}" class="sc-opt"/><text x="${X(optimum) + 4}" y="${T + 10}" class="sc-ax">최적 에너지</text>`);
  // 겹침을 줄이려 큰 점(강조)은 나중에
  const sorted = [...points].sort((a, b) => Number(Boolean(a.ring)) - Number(Boolean(b.ring)));
  for (const p of sorted) {
    const g = groups[p.group] || { color: 'var(--text-muted)' };
    const r = p.ring ? 7 : 5;
    const style = p.hollow ? ` fill-opacity="0.12" style="stroke:${g.color};stroke-width:1.6"` : ' fill-opacity="0.85"';
    parts.push(`<g class="sc-pt">${marker(p.shape, X(p.x), Y(p.y), r, g.color, style)}${p.ring ? `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${r + 4}" fill="none" stroke="var(--text-primary)" stroke-width="2"/>` : ''}<title>${esc(p.label)}</title></g>`);
  }
  parts.push(`<text x="${L}" y="16" class="sc-ttl">${esc(title)}</text>`);
  if (rho !== null) parts.push(`<text x="${w - R}" y="16" text-anchor="end" class="sc-rho">ρ = ${rho.toFixed(2)}</text>`);
  parts.push(`<text x="${(L + w - R) / 2}" y="${h - 4}" text-anchor="middle" class="sc-ax">${esc(xLabel)}</text>`);
  parts.push(`<text transform="translate(12 ${(T + h - B) / 2}) rotate(-90)" text-anchor="middle" class="sc-ax">${esc(yLabel)}</text>`);
  return `<svg viewBox="0 0 ${w} ${h}" class="sc-svg" role="img" aria-label="${esc(title)}: 에너지와 점수 산점도">${parts.join('')}</svg>`;
}

/** 범례 HTML. items: [{ color, shape, label }] */
export function scatterLegend(items) {
  return `<ul class="sc-legend">${items
    .map((it) => `<li><svg width="16" height="16" aria-hidden="true">${marker(it.shape || 'circle', 8, 8, 5.5, it.color)}</svg>${esc(it.label)}</li>`)
    .join('')}</ul>`;
}

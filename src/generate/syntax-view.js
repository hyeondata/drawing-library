// 정당화 그래프(JPG) 그림: 현관 깊이 0을 맨 아래에 두고 깊이별로 쌓는다. 노드 색 = 통합도(진할수록 통합). 도면 생성·자유형 공용.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const DEPTH = ['#d6e6fa', '#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];
const ink = (k) => (k >= 3 ? '#fff' : '#1b1b1f');

/** nodes: [{ id, name, depth, integration, x(같은 층에서 왼→오 순서용) }], edges: [[id, id]] */
export function jpgSvg(nodes, edges) {
  const ok = nodes.filter((n) => Number.isFinite(n.depth));
  const levels = {};
  for (const n of ok) (levels[n.depth] ||= []).push(n);
  const maxD = Math.max(0, ...Object.keys(levels).map(Number));
  const W = 560;
  const rowH = 74;
  const H = (maxD + 1) * rowH + 40;
  const pos = {};
  for (const [d, list] of Object.entries(levels)) {
    list.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
    list.forEach((n, i) => (pos[n.id] = [((i + 1) * W) / (list.length + 1), H - 30 - Number(d) * rowH]));
  }
  const ints = ok.map((n) => n.integration).filter(Number.isFinite);
  const lo = Math.min(...ints);
  const hi = Math.max(...ints);
  const lv = (v) => (Number.isFinite(v) ? Math.min(DEPTH.length - 1, Math.max(0, Math.round(((v - lo) / (hi - lo || 1)) * (DEPTH.length - 1)))) : 0);
  const p = [];
  for (let d = 0; d <= maxD; d++) p.push(`<line x1="0" x2="${W}" y1="${H - 30 - d * rowH}" y2="${H - 30 - d * rowH}" stroke="#e4e2ea" stroke-dasharray="3 4"/><text x="4" y="${H - 34 - d * rowH}" font-size="10" fill="#8a8794">깊이 ${d}</text>`);
  for (const [a, b] of edges) if (pos[a] && pos[b]) p.push(`<line x1="${pos[a][0]}" y1="${pos[a][1]}" x2="${pos[b][0]}" y2="${pos[b][1]}" stroke="#8a8794" stroke-width="1.5"/>`);
  for (const n of ok) {
    const [x, y] = pos[n.id];
    const k = lv(n.integration);
    p.push(`<circle cx="${x}" cy="${y}" r="17" fill="${DEPTH[k]}" stroke="#2b2a33" stroke-width="1.2"><title>${esc(n.name)}: 깊이 ${n.depth}, 통합도 ${Number.isFinite(n.integration) ? n.integration.toFixed(2) : '—'}</title></circle>`);
    p.push(`<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="${ink(k)}">${Number.isFinite(n.integration) ? n.integration.toFixed(2) : '—'}</text>`);
    p.push(`<text x="${x}" y="${y - 22}" text-anchor="middle" font-size="11" font-weight="600" fill="#22212b" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(n.name)}</text>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="정당화 그래프(현관 기준 깊이, 통합도)" style="background:#fff">${p.join('')}</svg>`;
}

// 계산 원리 화면: 평가·생성 코드를 그대로 불러 식의 중간값을 그림으로 보여 준다.
import { FEATURES, GRADES, THRESHOLDS } from '../model/config.js';
import { roomGroupOf } from '../model/drawing-style.js';
import { analyze, closenessScore, ecdf, evaluate, percentileScore, robustStats } from '../model/index.js';
import { diamondValue } from '../model/syntax.js';

const { base } = JSON.parse(document.getElementById('mth-data').textContent);
const $ = (s) => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const f2 = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : v.toFixed(d));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- SVG 도우미 ----------
function el(tag, attrs = {}, parent = null, text = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (text !== null) e.textContent = text;
  if (parent) parent.append(e);
  return e;
}
function svgIn(fig, w, h, label) {
  fig.innerHTML = '';
  return el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label, class: 'mth-svg' }, fig);
}
const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
function niceTicks(a, b, n = 5) {
  const step0 = (b - a) / n;
  const mag = 10 ** Math.floor(Math.log10(Math.abs(step0) || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || mag * 10;
  const out = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}
function axisX(svg, x, y0, ticks, fmt = (v) => v, label = '') {
  for (const t of ticks) {
    el('line', { x1: x(t), x2: x(t), y1: y0, y2: y0 + 4, class: 'mth-axis' }, svg);
    el('text', { x: x(t), y: y0 + 16, class: 'mth-tick', 'text-anchor': 'middle' }, svg, fmt(t));
  }
  if (label) el('text', { x: x(ticks.at(-1)), y: y0 + 32, class: 'mth-axis-label', 'text-anchor': 'end' }, svg, label);
}
function gridY(svg, y, x0, x1, ticks, fmt = (v) => v) {
  for (const t of ticks) {
    el('line', { x1: x0, x2: x1, y1: y(t), y2: y(t), class: 'mth-grid' }, svg);
    el('text', { x: x0 - 6, y: y(t) + 4, class: 'mth-tick', 'text-anchor': 'end' }, svg, fmt(t));
  }
}
// 툴팁
const tip = $('#mth-tip');
function showTip(html, ev) {
  tip.innerHTML = html;
  tip.hidden = false;
  const pad = 14;
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
const hideTip = () => (tip.hidden = true);
function hover(node, html) {
  node.addEventListener('pointermove', (e) => showTip(typeof html === 'function' ? html(e) : html, e));
  node.addEventListener('pointerleave', hideTip);
}
const table = (head, rows) =>
  `<table class="gen-table"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

// ---------- 1. 축척 보정 ----------
function drawScale() {
  const side = Number($('#scale-in').value);
  $('#scale-out').textContent = side;
  const s = Math.min(2.5, Math.max(0.4, side / THRESHOLDS.referenceBedSide));
  $('#scale-s').textContent = s.toFixed(2);
  const items = [
    { label: '최소 접촉 길이', base: `${THRESHOLDS.minContact}px`, mult: Math.max(1, s), val: `${(THRESHOLDS.minContact * Math.max(1, s)).toFixed(0)}px`, rule: '× max(1, s)' },
    { label: '덕트 최대 면적', base: `${THRESHOLDS.ductMaxArea.toLocaleString()}px²`, mult: s * s, val: `${Math.round(THRESHOLDS.ductMaxArea * s * s).toLocaleString()}px²`, rule: '× s²' },
    { label: '창 최소 길이', base: `${THRESHOLDS.windowMinLength}px`, mult: s, val: `${(THRESHOLDS.windowMinLength * s).toFixed(0)}px`, rule: '× s' },
    { label: '벽 간격(고정)', base: `${THRESHOLDS.adjacencyGap}px`, mult: 1, val: `${THRESHOLDS.adjacencyGap}px`, rule: '× 1' },
  ];
  const W = 720;
  const H = 210;
  const L = 130;
  const R = 110;
  const svg = svgIn($('#scale-chart'), W, H, '기준값 배수');
  const max = Math.max(2, ...items.map((i) => i.mult)) * 1.05;
  const x = scale(0, max, L, W - R);
  const ticks = niceTicks(0, max, 5);
  for (const t of ticks) el('line', { x1: x(t), x2: x(t), y1: 10, y2: H - 30, class: 'mth-grid' }, svg);
  axisX(svg, x, H - 30, ticks, (v) => `×${v}`);
  items.forEach((it, i) => {
    const y = 18 + i * 42;
    el('text', { x: L - 10, y: y + 15, class: 'mth-label', 'text-anchor': 'end' }, svg, it.label);
    const bar = el('rect', { x: x(0), y, width: Math.max(1, x(it.mult) - x(0)), height: 22, rx: 4, fill: i === 3 ? 'var(--text-muted)' : 'var(--series-1)' }, svg);
    el('text', { x: x(it.mult) + 8, y: y + 15, class: 'mth-value' }, svg, `${it.val} (${it.rule})`);
    hover(bar, `<b>${esc(it.label)}</b><br>기준 ${esc(it.base)} ${esc(it.rule)} = ${esc(it.val)}`);
  });
  el('line', { x1: x(1), x2: x(1), y1: 6, y2: H - 30, class: 'mth-ref' }, svg);
  el('text', { x: x(1) + 4, y: 8, class: 'mth-tick' }, svg, '배율 1');
  $('#scale-table').innerHTML = table(['기준값', '배율 1', '보정', `s = ${s.toFixed(2)}일 때`], items.map((i) => [esc(i.label), i.base, i.rule, i.val]));
}
$('#scale-in').addEventListener('input', drawScale);

// ---------- 2. 공간구문 ----------
const syn = { label: null, analysis: null, unit: 0, selected: null, result: null };
async function loadDrawing(id) {
  syn.label = await (await fetch(`${base}data/labels/${id}.json`)).json();
  syn.analysis = analyze(syn.label, 'SPA');
  const sel = $('#syn-unit');
  sel.innerHTML = syn.analysis.units.map((u, i) => `<option value="${i}">세대 ${i + 1}</option>`).join('');
  syn.unit = 0;
  syn.selected = null;
  syn.result = evaluate(syn.label, { baseline: await baselineP, kind: 'SPA' });
  drawSyntax();
  drawTotal();
}
function syntaxGraph(unit) {
  // 공간구문 그래프: 덕트·끊긴 실 제외 + 세대 밖 노드(현관에 연결)
  const nodes = unit.nodes.filter((n) => !n.duct && n.depth !== null).map((n) => n.space);
  const set = new Set(nodes);
  const adj = new Map(nodes.map((s) => [s, []]));
  for (const [i, j] of unit.edges) if (set.has(i) && set.has(j)) (adj.get(i).push(j), adj.get(j).push(i));
  adj.set('out', []);
  if (set.has(unit.rootSpace)) (adj.get(unit.rootSpace).push('out'), adj.get('out').push(unit.rootSpace));
  return adj;
}
function bfsMap(adj, start) {
  const d = new Map([[start, 0]]);
  const q = [start];
  while (q.length) {
    const u = q.shift();
    for (const v of adj.get(u)) if (!d.has(v)) (d.set(v, d.get(u) + 1), q.push(v));
  }
  return d;
}
const DEPTH_FILL = ['var(--depth-0)', 'var(--depth-1)', 'var(--depth-2)', 'var(--depth-3)', 'var(--depth-4)'];
function drawSyntax() {
  const a = syn.analysis;
  const unit = a.units[syn.unit];
  const adj = syntaxGraph(unit);
  if (syn.selected === null || !adj.has(syn.selected)) syn.selected = unit.rootSpace;
  const depth = bfsMap(adj, syn.selected);
  const spaces = unit.members.map((g) => a.spaces[g]);
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const sp of spaces) for (const poly of sp.polys) for (const [x, y] of poly) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  const W = 640;
  const pad = 40;
  const k = (W - 2 * pad) / Math.max(1, x1 - x0);
  const H = Math.max(260, (y1 - y0) * k + 2 * pad);
  const X = (x) => pad + (x - x0) * k;
  const Y = (y) => pad + (y - y0) * k;
  const svg = svgIn($('#syn-chart'), W, H, '인접 그래프');
  for (const sp of spaces)
    for (const poly of sp.polys)
      el('path', { d: `M${poly.map(([x, y]) => `${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join('L')}Z`, fill: roomGroupOf(sp.type).fill, 'fill-opacity': 0.75, stroke: 'var(--line)', 'stroke-width': 1 }, svg);
  const pos = new Map(spaces.map((sp, i) => [unit.members[i], [X(sp.center[0]), Y(sp.center[1])]]));
  // 밖 노드: 현관에서 가장 가까운 바깥 쪽으로
  const rc = pos.get(unit.rootSpace) || [W / 2, H / 2];
  const toEdge = [rc[0] - pad, W - pad - rc[0], rc[1] - pad, H - pad - rc[1]];
  const dir = toEdge.indexOf(Math.min(...toEdge));
  pos.set('out', [dir === 0 ? 14 : dir === 1 ? W - 14 : rc[0], dir === 2 ? 14 : dir === 3 ? H - 14 : rc[1]]);
  const drawn = new Set();
  for (const [u, vs] of adj)
    for (const v of vs) {
      const key = [u, v].sort().join('-');
      if (drawn.has(key)) continue;
      drawn.add(key);
      const [ax, ay] = pos.get(u);
      const [bx, by] = pos.get(v);
      el('line', { x1: ax, y1: ay, x2: bx, y2: by, class: v === 'out' || u === 'out' ? 'mth-edge mth-edge-out' : 'mth-edge' }, svg);
    }
  const typeOf = (s) => (s === 'out' ? '세대 밖' : a.spaces[s].type);
  for (const [s, [cx, cy]] of pos) {
    const inGraph = adj.has(s);
    const d = depth.get(s);
    const g = el('g', { class: 'mth-node', tabindex: inGraph ? 0 : -1 }, svg);
    el('circle', { cx, cy, r: s === 'out' ? 10 : 13, fill: inGraph && d !== undefined ? DEPTH_FILL[Math.min(4, d)] : 'var(--surface-3)', stroke: s === syn.selected ? 'var(--text-primary)' : 'var(--surface-1)', 'stroke-width': s === syn.selected ? 3 : 2, 'stroke-dasharray': s === 'out' ? '3 2' : null }, g);
    el('text', { x: cx, y: cy + 4, class: 'mth-node-num', fill: d !== undefined && d >= 2 ? 'var(--depth-ink)' : 'var(--text-primary)', 'text-anchor': 'middle' }, g, inGraph ? (d ?? '·') : '–');
    el('text', { x: cx, y: cy + 26, class: 'mth-node-label', 'text-anchor': 'middle' }, g, typeOf(s));
    if (inGraph && s !== 'out') {
      g.addEventListener('click', () => ((syn.selected = s), drawSyntax()));
      g.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && ((syn.selected = s), drawSyntax()));
    }
    hover(g, inGraph ? `<b>${esc(typeOf(s))}</b><br>누른 실에서 깊이 ${d ?? '–'}${s === 'out' ? '' : '<br>눌러서 이 실 기준으로 계산'}` : `<b>${esc(typeOf(s))}</b><br>덕트·끊긴 실(공간구문에서 제외)`);
  }
  // 단계 계산
  const K = depth.size;
  const sum = [...depth.values()].reduce((s, v) => s + v, 0);
  const md = sum / (K - 1);
  const ra = (2 * (md - 1)) / (K - 2);
  const dk = diamondValue(K);
  const rra = ra / dk;
  const integ = 1 / rra;
  const counts = {};
  for (const v of depth.values()) counts[v] = (counts[v] || 0) + 1;
  const node = unit.nodes.find((n) => n.space === syn.selected);
  $('#syn-steps').innerHTML = `
    <p class="mth-step-title">기준 실: <b>${esc(typeOf(syn.selected))}</b></p>
    <table class="gen-table"><thead><tr><th>깊이</th><th>실 수</th><th>깊이 × 실 수</th></tr></thead><tbody>
      ${Object.entries(counts).map(([dd, c]) => `<tr><td>${dd}</td><td>${c}</td><td>${dd * c}</td></tr>`).join('')}
    </tbody></table>
    <ol class="mth-calc">
      <li>K(노드 수, 세대 밖 포함) = <b>${K}</b>, Σd = <b>${sum}</b></li>
      <li>MD = ${sum} ÷ (${K} − 1) = <b>${f2(md, 3)}</b></li>
      <li>RA = 2 × (${f2(md, 3)} − 1) ÷ (${K} − 2) = <b>${f2(ra, 4)}</b></li>
      <li>D<sub>K</sub> = 2(K(log₂((K+2)/3) − 1) + 1) ÷ ((K−1)(K−2)) = <b>${f2(dk, 4)}</b></li>
      <li>RRA = ${f2(ra, 4)} ÷ ${f2(dk, 4)} = <b>${f2(rra, 4)}</b></li>
      <li>통합도 = 1 ÷ RRA = <b>${f2(integ, 3)}</b></li>
    </ol>
    <p class="note">평가 모델이 계산한 값: ${f2(node?.integration, 3)}${node && Math.abs(node.integration - integ) < 1e-9 ? ' (같음)' : ''}. 값이 클수록 이 실에서 다른 실로 가기 쉽습니다(통합도가 높음).</p>`;
  $('#syn-legend').innerHTML = DEPTH_FILL.map((c, i) => `<li><i style="background:${c}"></i>깊이 ${i}${i === 4 ? ' 이상' : ''}</li>`).join('') + '<li><i style="background:var(--surface-3)"></i>공간구문에서 제외(덕트 등)</li>';
}
$('#syn-drawing').addEventListener('change', (e) => loadDrawing(e.target.value));
$('#syn-unit').addEventListener('change', (e) => {
  syn.unit = Number(e.target.value);
  syn.selected = null;
  drawSyntax();
  drawTotal();
});

// ---------- 3. 점수 환산 ----------
const baselineP = fetch(`${base}data/baseline.json`).then((r) => r.json());
const SCORED = ['syntax', 'area', 'shape', 'exposure'].flatMap((g) => FEATURES[g].filter((d) => (d.weight ?? 1) > 0 && !d.adjust && d.key !== 'genotypeDistance'));
const score = { def: null, values: [], ids: [], stats: null, x: null };
async function initScore() {
  const bl = await baselineP;
  const sel = $('#score-feature');
  sel.innerHTML = SCORED.map((d) => `<option value="${d.key}">${esc(d.label)}</option>`).join('');
  sel.value = 'livingBedroomRatio';
  const pick = () => {
    score.def = SCORED.find((d) => d.key === sel.value);
    const rows = bl.entries.SPA.filter((e) => Number.isFinite(e.features[score.def.key]));
    score.values = rows.map((e) => e.features[score.def.key]);
    score.ids = rows.map((e) => `${e.drawing.replace('APT_FP_SPA_', '')}·${e.unit + 1}`);
    score.stats = robustStats(score.values);
    const st = score.stats;
    score.method = score.def.scoring === 'ecdf' || !(st.scale > 0) ? 'ecdf' : 'z';
    const lo = score.method === 'z' ? Math.min(st.min, st.median - 3.4 * st.scale) : st.min - 0.1 * (st.max - st.min || 1);
    const hi = score.method === 'z' ? Math.max(st.max, st.median + 3.4 * st.scale) : st.max + 0.1 * (st.max - st.min || 1);
    score.domain = [lo, hi];
    const x = $('#score-x');
    x.min = lo;
    x.max = hi;
    x.step = (hi - lo) / 500;
    x.value = st.median;
    drawScore();
  };
  sel.addEventListener('change', pick);
  $('#score-x').addEventListener('input', drawScore);
  pick();
}
function scoreAt(x) {
  const { def, stats: st } = score;
  if (score.method === 'z') return { z: (x - st.median) / st.scale, s: closenessScore((x - st.median) / st.scale, def.direction) };
  const F = ecdf(x, st.sorted);
  return { z: null, F, s: percentileScore(F, def.direction) };
}
function drawScore() {
  const { def, stats: st, domain } = score;
  const xv = Number($('#score-x').value);
  const cur = scoreAt(xv);
  $('#score-x-out').textContent = f2(xv, 3);
  $('#score-z').textContent = cur.z === null ? `백분위 ${(cur.F * 100).toFixed(0)}%` : f2(cur.z, 2);
  $('#score-v').textContent = cur.s.toFixed(0);
  const dirText = def.direction === 'higher' ? '높을수록 좋음(중앙값보다 크면 100점)' : def.direction === 'lower' ? '낮을수록 좋음(중앙값보다 작으면 100점)' : '양쪽 모두 감점';
  $('#score-formula').innerHTML =
    score.method === 'z'
      ? `z = (x − 중앙값 ${f2(st.median, 3)}) ÷ Qn ${f2(st.scale, 3)} &nbsp;·&nbsp; 점수 = 100 · max(0, 1 − |z| ÷ 3) &nbsp;·&nbsp; ${dirText}`
      : `F = 기준 분포에서 x보다 작은 비율(동점 절반) &nbsp;·&nbsp; 점수 = ${def.direction === 'higher' ? '100·min(1, F÷0.5)' : def.direction === 'lower' ? '100·min(1, (1−F)÷0.5)' : '100·2·min(F, 1−F)'} &nbsp;·&nbsp; ${dirText}${st.scale > 0 ? '' : ' · Qn = 0이라 백분위로 채점'}`;
  const W = 720;
  const H = 320;
  const L = 48;
  const R = 20;
  const top = 28;
  const plotB = 210;
  const stripT = 236;
  const stripB = 280;
  const svg = svgIn($('#score-chart'), W, H, '기준 분포와 점수 곡선');
  const x = scale(domain[0], domain[1], L, W - R);
  const y = scale(0, 100, plotB, top);
  // |z| 1·2·3 띠
  if (score.method === 'z')
    for (const k of [3, 2, 1]) {
      const a = Math.max(domain[0], st.median - k * st.scale);
      const b = Math.min(domain[1], st.median + k * st.scale);
      el('rect', { x: x(a), y: top, width: Math.max(0, x(b) - x(a)), height: stripB - top, class: `mth-band mth-band-${k}` }, svg);
      el('text', { x: x(Math.min(domain[1], st.median + k * st.scale)) - 3, y: top + 12, class: 'mth-tick', 'text-anchor': 'end' }, svg, `|z| ${k}`);
    }
  gridY(svg, y, L, W - R, [0, 25, 50, 75, 100]);
  // 점수 곡선
  const pts = [];
  for (let i = 0; i <= 300; i++) {
    const v = domain[0] + ((domain[1] - domain[0]) * i) / 300;
    pts.push(`${x(v).toFixed(1)},${y(scoreAt(v).s).toFixed(1)}`);
  }
  el('polyline', { points: pts.join(' '), class: 'mth-line', stroke: 'var(--series-1)' }, svg);
  el('line', { x1: x(st.median), x2: x(st.median), y1: top, y2: stripB, class: 'mth-ref' }, svg);
  el('text', { x: x(st.median) + 4, y: plotB - 6, class: 'mth-tick' }, svg, '중앙값');
  // 기준 35세대 점(띠)
  el('text', { x: L, y: stripT - 6, class: 'mth-tick' }, svg, `기준 세대 ${score.values.length}개`);
  score.values.forEach((v, i) => {
    const jy = stripT + 6 + ((i * 37) % 29);
    const c = el('circle', { cx: x(v), cy: jy, r: 4.5, class: 'mth-dot', fill: 'var(--series-1)' }, svg);
    hover(c, `<b>${esc(score.ids[i])}</b><br>값 ${f2(v, 3)} · 점수 ${scoreAt(v).s.toFixed(0)}`);
  });
  // 평가할 값
  el('line', { x1: x(xv), x2: x(xv), y1: top, y2: stripB, class: 'mth-cursor' }, svg);
  el('circle', { cx: x(xv), cy: y(cur.s), r: 6, fill: 'var(--series-2)', stroke: 'var(--surface-1)', 'stroke-width': 2 }, svg);
  el('text', { x: x(xv) + (x(xv) > W - 140 ? -8 : 8), y: y(cur.s) - 8, class: 'mth-value', 'text-anchor': x(xv) > W - 140 ? 'end' : 'start' }, svg, `${cur.s.toFixed(0)}점`);
  axisX(svg, x, stripB + 4, niceTicks(domain[0], domain[1], 6), (v) => +v.toFixed(3), def.label);
  el('text', { x: L - 36, y: 12, class: 'mth-tick' }, svg, '점수');
  $('#score-table').innerHTML =
    table(['통계', '값'], [['중앙값', f2(st.median, 4)], ['Qn', f2(st.scale, 4)], ['MAD×1.4826(참고)', f2(st.mad, 4)], ['최소–최대', `${f2(st.min, 3)} – ${f2(st.max, 3)}`], ['채점 방식', score.method === 'z' ? '강건 z' : '백분위'], ['방향', esc(dirText)]]) +
    table(['세대', '값', '점수'], score.values.map((v, i) => [esc(score.ids[i]), f2(v, 3), scoreAt(v).s.toFixed(0)]));
}

// ---------- 4. 종합 점수 ----------
const GROUPS = [
  ['syntax', '공간구문', 30],
  ['area', '면적 구성', 20],
  ['shape', '형태', 10],
  ['exposure', '외기 접면', 10],
  ['rules', '정합성', 30],
];
function initTotal() {
  $('#total-weights').innerHTML =
    GROUPS.map(([k, name, w]) => `<label class="mth-range">${name} <output id="w-${k}-out">${w}</output><input type="range" min="0" max="60" step="1" value="${w}" data-w="${k}" /></label>`).join('') +
    `<label class="mth-check"><input type="checkbox" id="total-gate" checked /> 관문 상한(69) 적용</label><button type="button" class="button-ghost small" id="total-reset">기본 가중치</button>`;
  $('#total-weights').addEventListener('input', drawTotal);
  $('#total-reset').addEventListener('click', () => {
    GROUPS.forEach(([k, , w]) => ($(`[data-w="${k}"]`).value = w));
    drawTotal();
  });
}
function drawTotal() {
  if (!syn.result) return;
  const unit = syn.result.units[syn.unit];
  const rows = GROUPS.map(([k, name], i) => {
    const w = Number($(`[data-w="${k}"]`).value);
    $(`#w-${k}-out`).textContent = w;
    return { k, name, w, s: unit.groups[k].score, color: `var(--series-${i + 1})` };
  });
  const wSum = rows.reduce((s, r) => s + r.w, 0) || 1;
  rows.forEach((r) => (r.c = (r.w * r.s) / wSum));
  const raw = rows.reduce((s, r) => s + r.c, 0);
  const capped = $('#total-gate').checked && unit.failedGates.length ? Math.min(raw, 69) : raw;
  const grade = GRADES.find(([min]) => capped >= min)[1];
  $('#total-score').textContent = capped.toFixed(1);
  $('#total-grade').textContent = grade;
  $('#total-valid').textContent = unit.failedGates.length ? `유효하지 않음(${unit.failedGates.join(', ')})${$('#total-gate').checked ? ` · 상한 전 ${raw.toFixed(1)}` : ''}` : '유효한 평면';
  const W = 720;
  const L = 96;
  const R = 70;
  const H = 40 + rows.length * 34 + 70;
  const svg = svgIn($('#total-chart'), W, H, '영역별 점수와 기여');
  const x = scale(0, 100, L, W - R);
  for (const t of [0, 25, 50, 75, 100]) el('line', { x1: x(t), x2: x(t), y1: 14, y2: 14 + rows.length * 34, class: 'mth-grid' }, svg);
  el('text', { x: L, y: 10, class: 'mth-tick' }, svg, '영역 점수(0~100)');
  rows.forEach((r, i) => {
    const yy = 18 + i * 34;
    el('text', { x: L - 10, y: yy + 15, class: 'mth-label', 'text-anchor': 'end' }, svg, r.name);
    const b = el('rect', { x: x(0), y: yy, width: Math.max(1, x(r.s) - x(0)), height: 22, rx: 4, fill: r.color }, svg);
    el('text', { x: x(r.s) + 6, y: yy + 15, class: 'mth-value' }, svg, `${r.s.toFixed(1)} × ${r.w}`);
    hover(b, `<b>${esc(r.name)}</b><br>점수 ${r.s.toFixed(1)} · 가중치 ${r.w}<br>기여 ${r.w} × ${r.s.toFixed(1)} ÷ ${wSum} = ${r.c.toFixed(1)}`);
  });
  // 종합 = 기여의 합(쌓은 막대)
  const yT = 30 + rows.length * 34;
  el('text', { x: L - 10, y: yT + 17, class: 'mth-label', 'text-anchor': 'end' }, svg, '종합');
  let acc = 0;
  rows.forEach((r) => {
    if (r.c <= 0) return;
    const seg = el('rect', { x: x(acc) + (acc ? 1 : 0), y: yT, width: Math.max(0.5, x(acc + r.c) - x(acc) - (acc ? 1 : 0)), height: 26, fill: r.color }, svg);
    hover(seg, `<b>${esc(r.name)}</b> 기여 ${r.c.toFixed(1)}점`);
    acc += r.c;
  });
  el('text', { x: x(acc) + 6, y: yT + 18, class: 'mth-value' }, svg, `${raw.toFixed(1)}${capped < raw ? ` → 상한 ${capped.toFixed(0)}` : ''}`);
  axisX(svg, x, yT + 32, [0, 25, 50, 75, 100]);
  $('#total-table').innerHTML = table(['영역', '점수', '가중치', '기여'], rows.map((r) => [r.name, r.s.toFixed(1), r.w, r.c.toFixed(1)]).concat([['종합', '', wSum, `${raw.toFixed(1)}${capped < raw ? ` (상한 ${capped.toFixed(0)})` : ''}`]]));
}

// ---------- 5. QUBO 풀이 ----------
const SOLVER_STYLE = [
  ['d2ts', 'D²TS'],
  ['tabu', 'Tabu'],
  ['sa', 'SA (QPU 대체·잠정)'],
  ['pt', 'Parallel Tempering'],
  ['sqa', 'SQA'],
  ['sb', 'Simulated Bifurcation'],
];
let worker = null;
function runQubo() {
  worker ||= new Worker(new URL('./method-worker.js', import.meta.url), { type: 'module' });
  $('#qubo-info').textContent = '풀이기 6개를 0.3초씩 돌리는 중…';
  $('#qubo-run').disabled = true;
  worker.onmessage = (e) => {
    $('#qubo-run').disabled = false;
    if (e.data.error) return ($('#qubo-info').textContent = e.data.error);
    drawQubo(e.data);
  };
  worker.postMessage({ seed: Number($('#qubo-seed').value) || 1, solvers: SOLVER_STYLE.map((s) => s[0]) });
}
function drawQubo(d) {
  const { results, optimum, n, penalty } = d;
  $('#qubo-info').textContent = `변수 ${n}개, 원-핫 벌점 P = ${penalty}, 전수 열거 최적 에너지 ${optimum.toFixed(2)}.`;
  const W = 720;
  const H = 320;
  const L = 56;
  const R = 20;
  const T = 14;
  const B = 270;
  const svg = svgIn($('#qubo-chart'), W, H, '시간에 따른 최적과의 차');
  const tMin = 0.05;
  const tMax = 300;
  const x = (t) => L + ((Math.log10(Math.max(tMin, t)) - Math.log10(tMin)) / (Math.log10(tMax) - Math.log10(tMin))) * (W - L - R);
  const series = results.map((r, i) => ({ ...r, name: SOLVER_STYLE[i][1], color: `var(--series-${i + 1})`, steps: r.trace.map(([t, , e]) => [Math.max(tMin, t), e - optimum]) }));
  const yMax = Math.min(2 * penalty, Math.max(1, ...series.flatMap((s) => s.steps.map((p) => p[1])))) || 1;
  const y = scale(0, yMax, B, T);
  gridY(svg, y, L, W - R, niceTicks(0, yMax, 4), (v) => +v.toFixed(1));
  axisX(svg, x, B, [0.1, 1, 10, 100, 300], (v) => `${v}ms`, '경과 시간(로그)');
  el('text', { x: L - 46, y: T + 2, class: 'mth-tick' }, svg, '최적과의 차');
  el('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), class: 'mth-ref' }, svg);
  for (const s of series) {
    if (!s.steps.length) continue;
    let dPath = '';
    s.steps.forEach(([t, g], i) => {
      const gy = y(Math.min(yMax, g));
      dPath += i === 0 ? `M${x(t)} ${gy}` : `H${x(t)} V${gy}`;
    });
    dPath += `H${x(tMax)}`;
    el('path', { d: dPath, fill: 'none', stroke: s.color, 'stroke-width': 2 }, svg);
    const hit = s.steps.find(([, g]) => g < 1e-9);
    if (hit) el('circle', { cx: x(hit[0]), cy: y(0), r: 5, fill: s.color, stroke: 'var(--surface-1)', 'stroke-width': 2 }, svg);
  }
  // 십자선 + 툴팁
  const cross = el('line', { y1: T, y2: B, class: 'mth-cursor', visibility: 'hidden' }, svg);
  const hitArea = el('rect', { x: L, y: T, width: W - L - R, height: B - T, fill: 'transparent' }, svg);
  hitArea.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const t = 10 ** (Math.log10(tMin) + ((px - L) / (W - L - R)) * (Math.log10(tMax) - Math.log10(tMin)));
    cross.setAttribute('x1', px);
    cross.setAttribute('x2', px);
    cross.setAttribute('visibility', 'visible');
    const rows = series
      .map((s) => {
        const last = [...s.steps].reverse().find(([tt]) => tt <= t);
        return [s, last ? last[1] : null];
      })
      .sort((a, b) => (a[1] ?? 1e9) - (b[1] ?? 1e9));
    showTip(`<b>${t < 1 ? t.toFixed(2) : t.toFixed(0)}ms</b>${rows.map(([s, g]) => `<br><i class="mth-sw" style="background:${s.color}"></i>${esc(s.name)}: ${g === null ? '아직 해 없음' : g < 1e-9 ? '최적' : `+${g.toFixed(2)}`}`).join('')}`, ev);
  });
  hitArea.addEventListener('pointerleave', () => (cross.setAttribute('visibility', 'hidden'), hideTip()));
  $('#qubo-legend').innerHTML = series.map((s) => `<li><i style="background:${s.color}"></i>${esc(s.name)}</li>`).join('') + '<li><i class="mth-sw-dot"></i>최적에 처음 닿은 시각</li>';
  $('#qubo-table').innerHTML = table(
    ['풀이기', '최종 에너지 − 최적', '최적에 처음 닿은 시각', '평가 횟수(단위는 풀이기마다 다름)'],
    series.map((s) => {
      const hit = s.steps.find(([, g]) => g < 1e-9);
      const last = s.steps.at(-1);
      return [esc(s.name), last ? (last[1] < 1e-9 ? '0 (최적)' : `+${last[1].toFixed(2)}`) : '–', hit ? `${hit[0].toFixed(2)}ms` : '0.3초 안에 못 닿음', s.evals.toLocaleString()];
    }),
  );
}
$('#qubo-run').addEventListener('click', runQubo);

// ---------- 6. 가중치 보정 ----------
const calib = { data: null, set: 'calibrated' };
function spearman(a, b) {
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const r = Array(v.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let t = i; t <= j; t++) r[idx[t][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const m = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = m(ra);
  const mb = m(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) (num += (ra[i] - ma) * (rb[i] - mb)), (da += (ra[i] - ma) ** 2), (db += (rb[i] - mb) ** 2);
  return num / Math.sqrt(da * db);
}
async function initCalib() {
  calib.data = await (await fetch(`${base}data/qubo-calibration.json`)).json();
  document.querySelectorAll('[data-w]').forEach((b) =>
    b.tagName === 'BUTTON' &&
    b.addEventListener('click', () => {
      calib.set = b.dataset.w;
      document.querySelectorAll('button[data-w]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      drawCalib();
    }),
  );
  drawCalib();
  drawBars();
}
function drawCalib() {
  const { terms, demo } = calib.data;
  const w = terms.map((t) => (calib.set === 'hand' ? t.hand : t.calibrated));
  const pts = demo.points.map((p, i) => ({ i, e: p.phi.reduce((s, f, t) => s + f * w[t], 0), o: p.objective }));
  const minE = Math.min(...pts.map((p) => p.e));
  const argmin = pts.filter((p) => Math.abs(p.e - minE) < 1e-9);
  const chosen = argmin.reduce((s, p) => s + p.o, 0) / argmin.length;
  const best = Math.max(...pts.map((p) => p.o));
  const rho = spearman(pts.map((p) => p.e), pts.map((p) => p.o));
  const pct = pts.filter((p) => p.o < chosen).length / (pts.length - 1);
  $('#calib-stat').innerHTML = `ρ(에너지, 점수) = <b>${rho.toFixed(2)}</b> · 에너지 최소 배치 점수 <b>${chosen.toFixed(1)}</b>(백분위 ${(pct * 100).toFixed(0)}%) · 후회 <b>${(chosen - best).toFixed(1)}</b>`;
  const W = 720;
  const H = 330;
  const L = 52;
  const R = 20;
  const T = 16;
  const B = 280;
  const svg = svgIn($('#calib-scatter'), W, H, '에너지와 순위 점수');
  const eMin = Math.min(...pts.map((p) => p.e));
  const eMax = Math.max(...pts.map((p) => p.e));
  const oMin = Math.max(-60, Math.min(...pts.map((p) => p.o)));
  const oMax = Math.max(...pts.map((p) => p.o));
  const x = scale(eMin - 0.03 * (eMax - eMin), eMax + 0.03 * (eMax - eMin), L, W - R);
  const y = scale(oMin - 3, oMax + 3, B, T);
  gridY(svg, y, L, W - R, niceTicks(oMin, oMax, 5), (v) => v);
  axisX(svg, x, B, niceTicks(eMin, eMax, 6), (v) => +v.toFixed(1), 'QUBO 에너지(벌점 제외) → 낮을수록 풀이기가 고름');
  el('text', { x: L - 46, y: T, class: 'mth-tick' }, svg, '순위 점수');
  el('line', { x1: L, x2: W - R, y1: y(best), y2: y(best), class: 'mth-ref' }, svg);
  el('text', { x: W - R, y: y(best) - 5, class: 'mth-tick', 'text-anchor': 'end' }, svg, `이 조건의 최고 ${best.toFixed(1)}`);
  for (const p of pts) {
    if (argmin.includes(p)) continue;
    const c = el('circle', { cx: x(p.e), cy: y(Math.max(oMin, p.o)), r: 4.5, class: 'mth-dot', fill: 'var(--series-1)' }, svg);
    hover(c, `배치 ${p.i + 1}<br>에너지 ${p.e.toFixed(2)} · 점수 ${p.o.toFixed(1)}`);
  }
  for (const p of argmin) {
    const c = el('circle', { cx: x(p.e), cy: y(Math.max(oMin, p.o)), r: 8, fill: 'var(--series-2)', stroke: 'var(--surface-1)', 'stroke-width': 2 }, svg);
    hover(c, `<b>에너지 최소 배치</b>(풀이기가 내는 해)<br>에너지 ${p.e.toFixed(2)} · 점수 ${p.o.toFixed(1)}`);
  }
  const ax = x(argmin[0].e);
  el('line', { x1: ax + 12, x2: ax + 12, y1: y(chosen), y2: y(best), stroke: 'var(--series-2)', 'stroke-width': 2, 'stroke-dasharray': '4 3' }, svg);
  el('text', { x: ax + 18, y: (y(chosen) + y(best)) / 2 + 4, class: 'mth-value' }, svg, `후회 ${(chosen - best).toFixed(1)}`);
  $('#calib-table').innerHTML =
    `<p class="note">${esc(demo.name)} · 배치 ${pts.length}개 · 교차검증(빼 둔 조건): 손 ρ ${calib.data.cv.hand.rho.toFixed(2)}·후회 ${calib.data.cv.hand.regret.toFixed(1)}, 보정 ρ ${calib.data.cv.calibrated.rho.toFixed(2)}·후회 ${calib.data.cv.calibrated.regret.toFixed(1)}</p>` +
    table(['항', '손', '보정'], terms.map((t) => [esc(t.label), t.hand, t.calibrated]));
}
function drawBars() {
  const { terms } = calib.data;
  const W = 720;
  const L = 210;
  const R = 50;
  const rowH = 26;
  const H = 30 + terms.length * rowH + 30;
  const svg = svgIn($('#calib-bars'), W, H, '항별 가중치');
  const m = Math.max(...terms.flatMap((t) => [Math.abs(t.hand), Math.abs(t.calibrated)])) * 1.1;
  const x = scale(-m, m, L, W - R);
  for (const t of niceTicks(-m, m, 6)) el('line', { x1: x(t), x2: x(t), y1: 16, y2: H - 30, class: 'mth-grid' }, svg);
  el('line', { x1: x(0), x2: x(0), y1: 12, y2: H - 30, class: 'mth-ref' }, svg);
  el('text', { x: x(-m), y: 10, class: 'mth-tick' }, svg, '← 끌어옴(에너지↓)');
  el('text', { x: x(m), y: 10, class: 'mth-tick', 'text-anchor': 'end' }, svg, '피함(에너지↑) →');
  terms.forEach((t, i) => {
    const yy = 20 + i * rowH;
    el('text', { x: L - 8, y: yy + 14, class: 'mth-label', 'text-anchor': 'end' }, svg, t.label);
    [
      [t.hand, 'var(--series-1)', 0, '손'],
      [t.calibrated, 'var(--series-2)', 10, '보정'],
    ].forEach(([v, c, off, nm]) => {
      const b = el('rect', { x: Math.min(x(0), x(v)), y: yy + off, width: Math.max(1, Math.abs(x(v) - x(0))), height: 9, rx: 2, fill: c }, svg);
      hover(b, `<b>${esc(t.label)}</b><br>${nm} 가중치 ${v}`);
    });
  });
  axisX(svg, x, H - 30, niceTicks(-m, m, 6), (v) => +v.toFixed(1));
  $('#calib-legend').innerHTML = '<li><i style="background:var(--series-1)"></i>손으로 정한 가중치</li><li><i style="background:var(--series-2)"></i>보정한 가중치</li>';
}

// ---------- 시작 ----------
drawScale();
initScore();
initTotal();
loadDrawing($('#syn-drawing').value);
initCalib();

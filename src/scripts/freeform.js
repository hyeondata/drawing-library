// 자유형 평면 페이지: 기준 세대 고르기 → 조건 → 생성(워커) → 결과·계산 과정·식·비교·내려받기
import { CELL, FREEDOM, WEIGHTS, balconyRuns, buildProblem, roomPolygons, solarFreeform, transformUnit } from '../freeform/engine.js';
import { DIRS } from '../generate/metrics.js';
import { sunTimeline } from '../generate/sun-view.js';
import { jpgSvg } from '../generate/syntax-view.js';
import { SYNTAX_GOAL, SYNTAX_TARGETS } from '../freeform/engine.js';
import { TEMPLATES, maskConnected, maskFromUnit, maskSvg, templateMask, trim } from '../freeform/outline.js';
import { graphOverlaySvg, planSvg, roomNames, unitSvg } from '../freeform/render.js';
import { STATUS } from '../generate/request-graph.js';
import { AIHUB_CATEGORIES } from '../generate/aihub.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const { base } = JSON.parse($('#ff-data').textContent);
const OUTDOOR = new Set(['발코니', '실외기실']);

const st = {
  units: [],
  filter: 'all',
  unit: null,
  freedom: 'L',
  cands: [],
  current: 0,
  view: 'full',
  P: null,
  playing: null,
  worker: null,
  omode: 'orig',
  tf: { rot: 0, flipX: false, flipY: false, aspect: 1 },
  tpl: 'L',
  bsides: ['S'],
  front: 180,
  sxPrefs: [],
  lat: 37.57,
  draw: { gx: 40, gy: 30, cells: new Uint8Array(40 * 30) },
};
const DG = 2; // 그리기 한 칸 = 계산 칸 2×2 = 0.6m

const pressed = (group, attr, v) => group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === v)));
const interiorOf = (u) => u.rooms.filter((r) => !OUTDOOR.has(r.type)).reduce((s, r) => s + r.area, 0);

// ---------- 1. 갤러리 ----------
function renderGallery() {
  const list = st.units.filter((u) => {
    if (st.filter === 'all') return true;
    if (st.filter === 'many') return u.nonrect.length >= 3;
    return u.nonrect.includes(st.filter);
  });
  $('#ff-gallery').innerHTML = list
    .map((u) => {
      const kinds = [...new Set(u.nonrect)].map((t) => `<span class="chip">${esc(t)}</span>`).join(' ');
      return `<button type="button" class="ff-card${st.unit?.id === u.id ? ' on' : ''}" data-id="${u.id}" aria-pressed="${st.unit?.id === u.id}">
        <span class="ff-thumb">${unitSvg(u, { small: true })}</span>
        <span class="ff-card-t"><b class="mono">${Math.round(u.interior)}㎡</b> · 침실 ${u.beds} · 욕실 ${u.baths}</span>
        <span class="ff-card-k">비사각: ${kinds}</span>
        <span class="note mono">${esc(u.id)}</span>
      </button>`;
    })
    .join('') || '<p class="note">조건에 맞는 세대가 없습니다.</p>';
  $('#ff-gallery').querySelectorAll('.ff-card').forEach((b) => b.addEventListener('click', () => choose(b.dataset.id)));
}

// ---------- 2. 조건 ----------
function choose(id) {
  st.unit = st.units.find((u) => u.id === id);
  renderGallery();
  const u = st.unit;
  $('#ff-area').value = Math.round(interiorOf(u));
  st.tf = { rot: 0, flipX: false, flipY: false, aspect: 1 };
  $('#ff-asp').value = '1';
  $('#ff-asp-v').textContent = '1.00';
  loadDrawFromUnit();
  renderOutline();
  const rows = u.rooms
    .filter((r) => !OUTDOOR.has(r.type) && r.area >= 1.5)
    .sort((a, b) => b.area - a.area)
    .map((r) => `<tr><td>${esc(r.type)}</td><td class="mono">${r.area.toFixed(1)}</td><td class="mono">${(r.rect * 100).toFixed(0)}%</td><td>${r.rect < 0.85 ? '<b class="ff-non">사각형 아님</b>' : '사각형'}</td></tr>`)
    .join('');
  $('#ff-orig-info').innerHTML = `
    <p class="ff-lead"><b>${esc(u.id)}</b> · 추정 전용 ${Math.round(interiorOf(u))}㎡ · 실 ${u.rooms.length}개 · 인접 ${u.edges.length}쌍</p>
    <details><summary>실 구성(1.5㎡ 이상)</summary>
    <table class="gen-table"><thead><tr><th>실</th><th>㎡</th><th>사각형 비율</th><th>모양</th></tr></thead><tbody>${rows}</tbody></table></details>`;
  $('#ff-setup').hidden = false;
  $('#ff-result').hidden = true;
  $('#ff-setup').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- 세대 외곽 ----------
const OMODE = { orig: '원본', tf: '원본 변형', tpl: '모양 고르기', draw: '직접 그리기' };

function outlineSpec() {
  const area = Number($('#ff-area').value) || interiorOf(st.unit);
  const extra = { balconySides: [...st.bsides], outdoorUnit: $('#ff-outunit').checked };
  if (st.omode === 'orig') return { mode: 'orig' };
  if (st.omode === 'tf') return { mode: 'orig', tf: { ...st.tf } };
  if (st.omode === 'tpl') return { mode: 'mask', mask: templateMask(st.tpl, area, { aspect: Number($('#ff-taspect').value), cut: Number($('#ff-tcut').value) }), ...extra };
  const m = drawMask();
  if (!m.n || !maskConnected(m) || m.n * CELL * CELL < 30) {
    $('#ff-progress').hidden = false;
    $('#ff-progress-text').textContent = '그린 외곽이 한 덩어리가 아니거나 30㎡보다 작습니다.';
    return null;
  }
  return { mode: 'mask', mask: m, ...extra };
}

function drawMask() {
  const { gx, gy, cells } = st.draw;
  const nx = gx * DG;
  const ny = gy * DG;
  const fine = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) fine[j * nx + i] = cells[Math.floor(j / DG) * gx + Math.floor(i / DG)];
  return trim({ nx, ny, cells: fine });
}

function loadDrawFromUnit() {
  const area = Number($('#ff-area').value) || interiorOf(st.unit);
  const m = maskFromUnit(st.unit, area);
  const { gx, gy } = st.draw;
  const cells = new Uint8Array(gx * gy);
  const cx = Math.ceil(m.nx / DG);
  const cy = Math.ceil(m.ny / DG);
  const ox = Math.max(0, Math.floor((gx - cx) / 2));
  const oy = Math.max(0, Math.floor((gy - cy) / 2));
  for (let j = 0; j < cy && j + oy < gy; j++)
    for (let i = 0; i < cx && i + ox < gx; i++) {
      let on = 0;
      for (let dj = 0; dj < DG; dj++) for (let di = 0; di < DG; di++) on += m.cells[(j * DG + dj) * m.nx + i * DG + di] || 0;
      if (on >= 2) cells[(j + oy) * gx + i + ox] = 1;
    }
  st.draw.cells = cells;
}

function editorSvg() {
  const { gx, gy, cells } = st.draw;
  const S = 18;
  const parts = [`<rect width="${gx * S}" height="${gy * S}" fill="#fff"/>`];
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) parts.push(`<rect x="${i * S + 0.5}" y="${j * S + 0.5}" width="${S - 1}" height="${S - 1}" fill="${cells[j * gx + i] ? '#f0c987' : '#f3f3f0'}"/>`);
  // 발코니 미리보기(계산 칸 기준 → 그리기 칸 좌표로)
  const full = { nx: gx * DG, ny: gy * DG, cells: new Uint8Array(gx * DG * gy * DG) };
  for (let j = 0; j < full.ny; j++) for (let i = 0; i < full.nx; i++) full.cells[j * full.nx + i] = cells[Math.floor(j / DG) * gx + Math.floor(i / DG)];
  const pre = [];
  for (const run of balconyRuns(full, st.bsides)) for (const [i, j] of run.cells) if (i >= 0 && j >= 0 && i < full.nx && j < full.ny) pre.push(`M${(i * S) / DG} ${(j * S) / DG}h${S / DG}v${S / DG}h${-S / DG}z`);
  if (pre.length) parts.push(`<path d="${pre.join('')}" fill="#9fc3e8" fill-opacity="0.55" pointer-events="none"/>`);
  parts.push(`<text x="${(gx * S) / 2}" y="${gy * S - 6}" text-anchor="middle" font-size="12" fill="#e8590c">▼ 앞(발코니 쪽)</text>`);
  return `<svg viewBox="0 0 ${gx * S} ${gy * S}" class="ff-editor" id="ff-editor" role="img" aria-label="외곽 그리기 격자(한 칸 0.6m)">${parts.join('')}</svg>`;
}

function renderOutline() {
  const u = st.unit;
  if (!u) return;
  pressed($('#ff-omode'), 'v', st.omode);
  $('#ff-o-tf').hidden = st.omode !== 'tf';
  $('#ff-o-tpl').hidden = st.omode !== 'tpl';
  $('#ff-o-draw').hidden = st.omode !== 'draw';
  $('#ff-o-out').hidden = st.omode === 'orig' || st.omode === 'tf';
  $('#ff-area-wrap').hidden = st.omode === 'draw';
  const fig = $('#ff-orig');
  if (st.omode === 'orig') fig.innerHTML = `${unitSvg(u, { title: `기준 세대 ${u.id} (원본 라벨)` })}<figcaption class="note">주황 테두리 = 사각형이 아닌 실. 원본 라벨의 다각형 그대로입니다.</figcaption>`;
  else if (st.omode === 'tf') fig.innerHTML = `${unitSvg(transformUnit(u, st.tf), { title: `원본 변형(회전 ${st.tf.rot * 90}°${st.tf.flipX ? ', 좌우' : ''}${st.tf.flipY ? ', 상하' : ''}, 비율 ${st.tf.aspect.toFixed(2)})` })}<figcaption class="note">원본 실 배치·현관·발코니를 함께 변형합니다.</figcaption>`;
  else if (st.omode === 'tpl') {
    const area = Number($('#ff-area').value) || interiorOf(u);
    const m = templateMask(st.tpl, area, { aspect: Number($('#ff-taspect').value), cut: Number($('#ff-tcut').value) });
    fig.innerHTML = `${maskSvg(m, { title: `${TEMPLATES[st.tpl].label} 외곽`, sides: st.bsides })}<figcaption class="note">실 구성·면적 비율·인접은 기준 세대 ${esc(u.id)}에서 가져옵니다.</figcaption>`;
  } else {
    fig.innerHTML = `${editorSvg()}<figcaption class="note">한 칸 0.6m × 0.6m. 파란 칸 = 발코니가 들어갈 자리(격자 밖으로 나가는 부분은 생략). 실 구성은 기준 세대 ${esc(u.id)}에서 가져옵니다.</figcaption>`;
    const m = drawMask();
    const ok = m.n && maskConnected(m);
    $('#ff-darea').innerHTML = `그린 면적 <b>${(m.n * CELL * CELL).toFixed(1)}㎡</b>${m.n && !ok ? ' <span class="error-text">· 한 덩어리가 아님</span>' : ''}`;
    bindEditor();
  }
}

function bindEditor() {
  const svg = $('#ff-editor');
  if (!svg) return;
  let paint = null;
  const cellAt = (e) => {
    const r = svg.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / r.width) * st.draw.gx);
    const j = Math.floor(((e.clientY - r.top) / r.height) * st.draw.gy);
    return i >= 0 && j >= 0 && i < st.draw.gx && j < st.draw.gy ? j * st.draw.gx + i : -1;
  };
  const apply = (e) => {
    const k = cellAt(e);
    if (k < 0) return;
    if (paint === null) paint = st.draw.cells[k] ? 0 : 1;
    if (st.draw.cells[k] !== paint) {
      st.draw.cells[k] = paint;
      const rect = svg.querySelectorAll('rect')[k + 1];
      if (rect) rect.setAttribute('fill', paint ? '#f0c987' : '#f3f3f0');
    }
  };
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    paint = null;
    apply(e);
  });
  svg.addEventListener('pointermove', (e) => e.buttons && apply(e));
  svg.addEventListener('pointerup', () => {
    paint = null;
    renderOutline(); // 면적·발코니 미리보기 갱신
  });
}

// ---------- 생성 ----------
function run() {
  const u = st.unit;
  if (!u) return;
  const area = Number($('#ff-area').value) || interiorOf(u);
  const count = Number($('#ff-count').value);
  const seed0 = Number($('#ff-seed').value) || 1;
  const steps = Number($('#ff-steps').value);
  const jitter = Number($('#ff-jitter').value);
  const outline = outlineSpec();
  if (!outline) return;
  const outlineFree = $('#ff-ofree').checked;
  const syntaxPrefs = [...st.sxPrefs];
  const syntaxW = Number($('#ff-sxw').value);
  st.P = buildProblem(u, { area, outline, outlineFree, syntaxPrefs });
  st.cands = [];
  st.current = 0;
  st.params = { area: outline.mode === 'mask' ? outline.mask.n * CELL * CELL : area, count, seed0, steps, jitter, freedom: st.freedom, omode: st.omode, outlineFree, syntaxPrefs, syntaxW };
  st.worker?.terminate();
  st.worker = new Worker(new URL('./freeform-worker.js', import.meta.url), { type: 'module' });
  $('#ff-progress').hidden = false;
  $('#ff-run').disabled = true;
  const t0 = performance.now();
  st.worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') {
      const p = (m.i + m.p) / m.n;
      $('#ff-bar').style.width = `${(p * 100).toFixed(1)}%`;
      $('#ff-progress-text').textContent = `${m.i + 1} / ${m.n}안 담금질 중… ${Math.round(m.p * 100)}%`;
    } else if (m.type === 'cand') {
      st.cands[m.i] = m.cand;
    } else if (m.type === 'done') {
      st.totalMs = performance.now() - t0;
      $('#ff-progress').hidden = true;
      $('#ff-run').disabled = false;
      st.cands.sort((a, b) => a.summary.total - b.summary.total);
      renderResult();
      $('#ff-result').hidden = false;
      $('#ff-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  st.worker.postMessage({ unit: u, area, outline, outlineFree, syntaxPrefs, syntaxW, freedom: st.freedom, jitter, seeds: Array.from({ length: count }, (_, i) => seed0 + i), steps });
}

// ---------- 3. 결과 ----------
const namesOf = (c) => roomNames(st.P.rooms.filter((r) => c.assign.includes(r.k)), (k) => c.sizes[k] || 0);
const m2Of = (c, k) => (c.sizes[k] || 0) * st.P.sx * st.P.sy;

function renderResult() {
  const c = st.cands[st.current];
  const P = st.P;
  const names = namesOf(c);
  $('#ff-tabs').innerHTML = st.cands.map((x, i) => `<button type="button" data-i="${i}" aria-pressed="${i === st.current}">${i + 1}안 <span class="mono">E ${x.summary.total.toFixed(1)}</span></button>`).join('');
  $('#ff-tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => ((st.current = Number(b.dataset.i)), renderResult())));
  const title = `자유형 ${Math.round(st.params.area)}㎡ · ${st.current + 1}안`;
  const sol = solarFreeform(c.assign, P, c.openings, { front: st.front, lat: st.lat });
  const solOf = Object.fromEntries(sol.map((x) => [x.k, x]));
  renderOrient();
  $('#ff-plan').innerHTML = `${planSvg(c.assign, P, { openings: c.openings, names, mode: st.view, title, areaOf: (k) => m2Of(c, k), front: st.front, sunOf: (k) => solOf[k] })}<figcaption class="note">기준 세대 ${esc(st.unit.id)} · 외곽 ${esc(OMODE[st.params.omode])}${st.params.outlineFree ? '(+외곽 다듬기)' : ''} · ${FREEDOM[st.params.freedom].label} · 변화 ${st.params.jitter} · 시드 ${c.seed} · ${(c.ms / 1000).toFixed(1)}초</figcaption>`;

  const s = c.summary;
  const rooms = s.rooms.filter((r) => !(r.fixed && r.m2 < 1.5));
  const non = rooms.filter((r) => !r.fixed && !OUTDOOR.has(r.type) && r.corners > 4);
  const needOk = s.need.filter((n) => n.ok).length;
  const dev = (r) => (r.target ? ((r.m2 - r.target) / r.target) * 100 : null);
  const rows = rooms
    .filter((r) => !OUTDOOR.has(r.type))
    .sort((a, b) => b.m2 - a.m2)
    .map((r) => {
      const d = dev(r);
      const cls = d === null ? '' : Math.abs(d) <= 5 ? 'good-text' : Math.abs(d) <= 10 ? 'warn-text' : 'error-text';
      return `<tr><td>${esc(names[r.k] || r.type)}${r.fixed ? ' <span class="note">(고정)</span>' : ''}</td><td class="mono">${r.target ? r.target.toFixed(1) : '—'}</td><td class="mono">${r.m2.toFixed(1)}</td><td class="mono ${cls}">${d === null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(0)}%`}</td><td>${r.corners > 4 ? `<b class="ff-non">${esc(r.shape)}</b>` : esc(r.shape)}</td><td class="mono">${(r.rect * 100).toFixed(0)}%</td></tr>`;
    })
    .join('');
  const typeName = (k) => names[k] || P.rooms[k].type;
  const needRows = s.need.map((n) => `<li class="${n.ok ? '' : 'error-text'}">${n.ok ? '✓' : '✗'} ${esc(typeName(n.p))} — ${esc(typeName(n.q))}</li>`).join('');
  $('#ff-detail').innerHTML = `
    <div class="gen-sumgrid">
      <div><span class="gen-k">전용면적</span><b class="mono">${rooms.filter((r) => !OUTDOOR.has(r.type)).reduce((t, r) => t + r.m2, 0).toFixed(1)}㎡</b></div>
      <div><span class="gen-k">사각형 아닌 실</span><b class="mono">${non.length}개</b></div>
      <div><span class="gen-k">원본 인접 유지</span><b class="mono">${needOk} / ${s.need.length}</b></div>
      <div><span class="gen-k">문 동선</span><b class="mono">${c.unreachable.length ? `<span class="error-text">${c.unreachable.length}실 끊김</span>` : '모두 연결'}</b></div>
      <div><span class="gen-k">거실 향 · 동지 일조</span><b class="mono">${(() => { const lv = sol.find((x) => x.type === '거실'); return lv ? `${lv.facingName}향 · ${lv.total.toFixed(1)}h` : '—'; })()}</b></div>
      <div><span class="gen-k">판례 기준 충족(거실·침실)</span><b class="mono">${sol.filter((x) => x.type !== '주방' && x.ok).length} / ${sol.filter((x) => x.type !== '주방').length}</b></div>
    </div>
    ${c.unreachable.length ? `<p class="note error-text">현관에서 문으로 갈 수 없는 실: ${esc(c.unreachable.map(typeName).join(', '))}. 공용 실에 맞닿지 않아 문을 낼 곳이 없습니다. 시드나 변화 정도를 바꿔 보세요.</p>` : ''}
    <h3>실별 면적과 모양</h3>
    <table class="gen-table"><thead><tr><th>실</th><th>목표 ㎡</th><th>생성 ㎡</th><th>차이</th><th>모양</th><th>사각형 비율</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="note">목표 면적은 기준 세대의 실 면적 비율을 고른 전용면적에 맞춘 값입니다. 모양은 꼭짓점 수(4 직사각형, 6 ㄱ자, 8 ㄷ자·계단형), 사각형 비율은 면적 ÷ 외접 사각형입니다. 사선 외벽에 닿은 실은 격자 계단 때문에 꼭짓점이 많게 셉니다.</p>
    <h3>향과 동지 일조(장애물 없음)</h3>
    ${sunTimeline(sol.map((x) => ({ ...x, name: names[x.k] || x.type })))}
    <p class="note">앞쪽(도면 아래) ${Math.round(st.front)}°, 위도 ${st.lat}°. 창마다 바깥 방향으로 향을 정하고, 동지 08~16시(진태양시)에 해 고도가 0보다 크고 창 방향과 해 방위 차가 85° 미만이면 해가 든다고 셉니다. 판례 기준: 총 4시간 또는 09~15시 연속 2시간(대법원 98다23850 등). 이웃 동·발코니 깊이 그림자는 넣지 않은 최대치입니다.</p>
    <details class="gen-rooms"><summary>원본 인접 관계 ${needOk}/${s.need.length} 유지(문 폭 0.9m 이상 맞닿음)</summary><ul class="ff-need">${needRows}</ul></details>`;
  if (st.lastCand !== c) {
    $('#ff-slider').max = String(c.snaps.length - 1);
    $('#ff-slider').value = String(c.snaps.length - 1);
    st.lastCand = c;
  }
  renderGraph(c, names);
  renderSyntax(c, names);
  renderTime();
  renderFormula();
  $('#ff-cmp-orig').innerHTML = unitSvg(st.unit, { scale: st.P.scale, title: '원본(라벨)' });
  $('#ff-cmp-gen').innerHTML = planSvg(c.assign, P, { openings: c.openings, names, mode: 'space', title: `생성 ${st.current + 1}안`, areaOf: (k) => m2Of(c, k), front: st.front });
}

// ---------- 방위 ----------
function renderOrient() {
  $('#ff-dir').innerHTML = DIRS.map(([az, n]) => `<button type="button" data-az="${az}" aria-pressed="${Math.round(st.front) === az}">${n}</button>`).join('');
  $('#ff-az').value = String(Math.round(st.front));
  $('#ff-lat').value = String(st.lat);
}
const setFront = (v) => {
  st.front = ((Number(v) % 360) + 360) % 360;
  if (st.cands.length) renderResult();
};
$('#ff-dir').addEventListener('click', (e) => {
  const b = e.target.closest('[data-az]');
  if (b) setFront(b.dataset.az);
});
$('#ff-az').addEventListener('change', (e) => setFront(e.target.value));
$('#ff-lat').addEventListener('change', (e) => {
  st.lat = Math.min(39, Math.max(33, Number(e.target.value) || 37.57));
  if (st.cands.length) renderResult();
});

// ---------- 공간구문 ----------
const SX_ROWS = [
  ['livingBedroomRatio', '거실/침실 통합도 비', 'Byun & Choi 2016(SCIE) 거실 중심 군집 1.56~2.29', 'livingCentral', 'lbr'],
  ['genotypeTau', '거실 중심 유전형 순위 부합도 τ', 'Hillier 외 1987(SSCI), 1에 가까울수록 거실>주방>현관>침실>화장실', 'livingCentral', null],
  ['privacyDepthGap', '공·사 깊이 차(침실 − 거실·주방)', 'Ham & Lee 2017(SCIE·SSCI); Park 외 2024(SCIE)', 'privacy', 'gap'],
  ['kitchenBedroomRatio', '주방/침실 통합도 비', 'Byun & Choi 2016(SCIE) 1.04~1.58', 'kitchenLink', 'kbr'],
];
function renderSyntax(c, names) {
  const sx = c.summary.syntax;
  const P = st.P;
  const xOf = (k) => {
    let sxm = 0;
    let n = 0;
    for (let i = 0; i < c.assign.length; i++) if (c.assign[i] === k) ((sxm += i % P.nx), n++);
    return n ? sxm / n : 0;
  };
  const nodes = sx.nodes.filter((nd) => !['발코니', '실외기실'].includes(nd.type)).map((nd) => ({ id: nd.k, name: names[nd.k] || nd.type, depth: nd.depth, integration: nd.integration, x: xOf(nd.k) }));
  $('#ff-jpg').innerHTML = jpgSvg(nodes, sx.edges);
  const prefs = st.params.syntaxPrefs || [];
  const rows = SX_ROWS.map(([k, label, ref, pref, goal]) => {
    const v = sx[k];
    const on = prefs.includes(pref);
    return `<tr><td>${esc(label)}<br><span class="note">${esc(ref)}</span></td><td class="mono">${Number.isFinite(v) ? v.toFixed(2) : '—'}</td><td>${on ? `<b class="good-text">✓ 에너지에 반영</b>${goal ? `<br><span class="note">목표 ${SYNTAX_GOAL[goal]}</span>` : ''}` : '<span class="note">선호를 고르면 반영</span>'}</td></tr>`;
  }).join('');
  $('#ff-sx-text').innerHTML = `<table class="gen-table gen-graph-table"><thead><tr><th>변수</th><th>값</th><th>생성에 반영</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="note">현관을 맨 아래(깊이 0)에 두고 0.6m 이상 맞닿은 실을 한 단계씩 쌓은 정당화 그래프입니다. 숫자·색은 통합도(1/RRA). 평가 모델과 같은 규약(덕트 제외, 현관에 외부 노드)입니다. ${prefs.length ? `이번 생성은 ${prefs.map((p) => SYNTAX_TARGETS[p].label).join('·')} 선호를 세기 ${st.params.syntaxW}로 반영했습니다.` : '이번 생성은 공간구문 선호 없이 만들었습니다.'} 실측(6세대 × 시드 2): 거실 중심형은 거실/침실 비를 평균 1.65 → 1.96으로 올렸고, 사생활은 깊이 차를 0.54 → 0.66(강하게 0.74)로 조금 올렸습니다. 대면형 주방은 이미 목표를 넘는 경우가 많아 변화가 거의 없습니다.</p>`;
}

// ---------- 요청한 연결 ----------
function renderGraph(c, names) {
  const P = st.P;
  const typeName = (k) => names[k] || P.rooms[k].type;
  const hasDoor = (p, q) => c.openings.some((o) => (o.kind === 'door' || o.kind === 'opening') && ((o.from === p && o.to === q) || (o.from === q && o.to === p)));
  const links = c.summary.need.map((e) => ({ ...e, status: hasDoor(e.p, e.q) ? 'met' : e.ok ? 'wall' : 'missing', label: `${typeName(e.p)}–${typeName(e.q)}` }));
  const cnt = { met: 0, wall: 0, missing: 0 };
  for (const l of links) cnt[l.status]++;
  $('#ff-graph').innerHTML = graphOverlaySvg(c.assign, P, { links, names, STATUS });
  const legend = ['met', 'wall', 'missing'].map((k) => `<li><svg width="34" height="10" aria-hidden="true"><line x1="2" y1="5" x2="32" y2="5" stroke="${STATUS[k].color}" stroke-width="4" stroke-linecap="round"${STATUS[k].dash ? ` stroke-dasharray="${STATUS[k].dash}"` : ''}/></svg>${esc(STATUS[k].label)} <b class="mono">${cnt[k]}</b></li>`).join('');
  const rows = links
    .map((l) => `<tr><td>${esc(l.label)}</td><td><span style="color:${STATUS[l.status].color};font-weight:700">${{ met: '✓ 충족', wall: '△ 문 없음', missing: '? 빠짐' }[l.status]}</span></td></tr>`)
    .join('');
  $('#ff-graph-text').innerHTML = `<ul class="gen-graph-legend">${legend}</ul>
    <p class="note">선은 기준 세대 ${esc(st.unit.id)}에서 맞닿아 있던 실 쌍 가운데 문이 필요한 쌍(공용 실과 닿는 쌍, 드레스룸·욕실–침실)입니다. 생성 평면에서 문 폭(0.9m) 이상 맞닿고 문·개구부가 있으면 충족, 맞닿기만 하면 문 없음, 떨어져 있으면 빠짐(?)입니다. 에너지의 '인접' 항이 이 빠짐을 줄입니다.</p>
    <p class="mono">충족 ${cnt.met} · 문 없음 ${cnt.wall} · 빠짐 ${cnt.missing} / ${links.length} · 간이 편집 거리 ${(cnt.missing + 0.5 * cnt.wall).toFixed(1)}</p>
    <details class="gen-rooms"><summary>쌍 목록(${links.length})</summary><table class="gen-table gen-graph-table"><thead><tr><th>연결</th><th>결과</th></tr></thead><tbody>${rows}</tbody></table></details>`;
}

// ---------- 계산 과정 ----------
function renderTime() {
  const c = st.cands[st.current];
  const H = c.history;
  const w = 1000;
  const h = 230;
  const L = 52;
  const R = 12;
  const T = 14;
  const B = 30;
  const maxE = Math.max(...H.map((p) => p.E));
  const minE = Math.min(0, ...H.map((p) => p.E));
  const X = (it) => L + (it / c.steps) * (w - L - R);
  const Y = (e) => T + (1 - (e - minE) / (maxE - minE || 1)) * (h - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((q) => minE + q * (maxE - minE));
  const grid = ticks.map((v) => `<line x1="${L}" x2="${w - R}" y1="${Y(v)}" y2="${Y(v)}" class="ff-grid"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="ff-axis">${v.toFixed(0)}</text>`).join('');
  const xt = [0, 0.5, 1].map((q) => `<text x="${X(q * c.steps)}" y="${h - 8}" text-anchor="middle" class="ff-axis">${Math.round(q * c.steps).toLocaleString()}번</text>`).join('');
  const line = H.map((p, i) => `${i ? 'L' : 'M'}${X(p.it).toFixed(1)} ${Y(p.E).toFixed(1)}`).join('');
  const k = Number($('#ff-slider').value);
  const snap = c.snaps[Math.min(k, c.snaps.length - 1)];
  $('#ff-chart').innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="계산 횟수에 따른 에너지">${grid}${xt}
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    <line x1="${X(snap.it)}" x2="${X(snap.it)}" y1="${T}" y2="${h - B}" stroke="var(--text-primary)" stroke-width="1.5" stroke-dasharray="4 3"/>
    <circle cx="${X(snap.it)}" cy="${Y(snap.E)}" r="5" fill="var(--accent)" stroke="var(--surface-1)" stroke-width="2"/>
    <text x="${Math.min(w - R - 4, X(snap.it) + 8)}" y="${Y(snap.E) - 8}" class="ff-axis ff-val" text-anchor="${X(snap.it) > w - 120 ? 'end' : 'start'}">E ${snap.E.toFixed(1)}</text>
    <text x="${L}" y="${T - 2}" class="ff-axis">에너지 E(작을수록 좋음)</text></svg>`;
  $('#ff-slider').max = String(c.snaps.length - 1);
  $('#ff-now').textContent = `${snap.it.toLocaleString()}번째 이동 · E ${snap.E.toFixed(1)}`;
  $('#ff-time-note').textContent = `이동 ${c.steps.toLocaleString()}번 중 ${c.accepted.toLocaleString()}번을 받아들였습니다(${((c.accepted / c.steps) * 100).toFixed(1)}%). 처음에는 온도가 높아 나빠지는 이동도 가끔 받아들이고, 온도가 내려가면서 좋아지는 이동만 남습니다. 슬라이더로 그 시점의 배치를 봅니다.`;
  const names = namesOf(c);
  $('#ff-snap').innerHTML = planSvg(snap.assign, st.P, { names, mode: 'space', areaOf: null });
  const h0 = c.history[Math.min(k, c.history.length - 1)];
  const W = { ...WEIGHTS, compact: FREEDOM[st.params.freedom].compact };
  $('#ff-snap-text').innerHTML = `<h4>이 시점의 에너지 구성</h4>${termBars(h0.terms, W)}`;
}

const TERM = {
  area: ['면적', '목표 칸 수에서 벗어난 정도의 제곱 합'],
  compact: ['둘레', '같은 면적 정사각형 대비 둘레 초과분(모양 단순함)'],
  corner: ['꼭짓점', '꼭짓점이 상한을 넘은 수'],
  thin: ['좁은 부분', '최소 폭(거실 3.0·침실 2.4·주방 1.8m…)보다 좁은 칸 비율'],
  adj: ['인접', '원본에서 이어졌던 실 쌍이 0.9m 미만으로 맞닿음'],
  window: ['창', '거실·침실의 바깥 벽이 2.0m보다 짧은 만큼'],
  access: ['접근', '현관에서 문으로 이어지지 않는 실 수'],
  entry: ['현관', '새 외곽에서 현관이 바깥 벽에 문 폭(0.9m) 이상 닿지 않음'],
  outline: ['외곽', '외곽도 다듬을 때 세대 외곽 꼭짓점이 상한을 넘은 수'],
  syntax: ['공간구문', '고른 공간구문 선호의 문헌 목표(거실/침실 비 1.9, 깊이 차 1.5, 주방/침실 비 1.3, τ → 1)에 못 미친 비율'],
  through: ['침실 통과', '공용 실에 닿지 않아 침실을 지나야 들어가는 실 수(드레스룸·화장실 제외)'],
};

function termBars(terms, W) {
  const items = Object.keys(TERM).filter((k) => (k !== 'entry' || st.P.custom) && (k !== 'outline' || st.P.outlineFree) && (k !== 'syntax' || st.P.syntaxPrefs?.length)).map((k) => ({ k, raw: terms[k], v: W[k] * terms[k] }));
  const max = Math.max(1e-9, ...items.map((i) => i.v));
  return `<ul class="ff-bars">${items
    .map((i) => `<li><span>${TERM[i.k][0]}</span><span class="ff-bar"><i style="width:${((i.v / max) * 100).toFixed(1)}%"></i></span><span class="mono">${i.v.toFixed(2)}</span></li>`)
    .join('')}</ul>`;
}

function renderFormula() {
  const c = st.cands[st.current];
  const W = c.summary.weights;
  const F = FREEDOM[st.params.freedom];
  const t = c.summary.terms;
  $('#ff-formula').innerHTML = `
    <p class="ff-eq mono">E = ${W.area}·면적 + ${W.compact}·둘레 + ${W.corner}·꼭짓점(K=${F.K}) + ${W.thin}·좁은 부분 + ${W.adj}·인접 + ${W.window}·창 + ${W.access}·접근 + ${W.through}·침실 통과${st.P.custom ? ` + ${W.entry}·현관` : ''}${st.P.outlineFree ? ` + ${W.outline}·외곽(K=${F.Kout})` : ''}${st.P.syntaxPrefs?.length ? ` + ${W.syntax}·공간구문` : ''}</p>
    <table class="gen-table ff-ftable"><thead><tr><th>항</th><th>뜻</th><th>무게</th><th>값</th><th>기여</th></tr></thead><tbody>
    ${Object.keys(TERM).filter((k) => (k !== 'entry' || st.P.custom) && (k !== 'outline' || st.P.outlineFree) && (k !== 'syntax' || st.P.syntaxPrefs?.length)).map((k) => `<tr><td>${TERM[k][0]}</td><td>${TERM[k][1]}</td><td class="mono">${W[k]}</td><td class="mono">${t[k].toFixed(2)}</td><td class="mono">${(W[k] * t[k]).toFixed(2)}</td></tr>`).join('')}
    <tr><td colspan="4"><b>합계 E</b></td><td class="mono"><b>${c.summary.total.toFixed(2)}</b></td></tr></tbody></table>
    <p class="note">'모양 자유도'가 꼭짓점 상한 K와 둘레 무게를 바꿉니다: 직사각형 위주(K=4, 둘레 ${FREEDOM.rect.compact}), ㄱ자까지(K=6, ${FREEDOM.L.compact}), ㄷ자·자유형(K=8, ${FREEDOM.free.compact}). 면적 항은 목표 대비 비율이라 큰 실과 작은 실을 같은 무게로 봅니다.</p>`;
}

// ---------- 내려받기 ----------
function spaJson() {
  const c = st.cands[st.current];
  const P = st.P;
  const PX = 100;
  const W = P.nx * P.sx * PX;
  const H = P.ny * P.sy * PX;
  const sheet = { w: 4963, h: 3509 };
  const ox = (sheet.w - W) / 2;
  const oy = (sheet.h - H) / 2;
  const cat = Object.fromEntries(AIHUB_CATEGORIES.map((x) => [x.name, x.id]));
  const anns = [];
  let id = 1;
  for (const r of P.rooms) {
    if (!c.assign.includes(r.k)) continue;
    const loops = roomPolygons(c.assign, P, r.k);
    const seg = loops.map((pts) => pts.flatMap(([x, y]) => [+(ox + x * PX).toFixed(2), +(oy + y * PX).toFixed(2)]));
    const xs = seg.flatMap((s) => s.filter((_, i) => i % 2 === 0));
    const ys = seg.flatMap((s) => s.filter((_, i) => i % 2 === 1));
    anns.push({ id: id++, image_id: 1, category_id: cat[`공간_${r.type}`] ?? cat['공간_기타'], segmentation: seg, area: +((c.sizes[r.k] || 0) * P.sx * P.sy * PX * PX).toFixed(2), bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].map((v) => +v.toFixed(2)), iscrowd: 0, attributes: { occluded: false } });
  }
  anns.push({ id: id++, image_id: 1, category_id: cat.background, segmentation: [[0, 0, 0, sheet.h, sheet.w, sheet.h, sheet.w, 0]], area: sheet.w * sheet.h, bbox: [0, 0, sheet.w, sheet.h], iscrowd: 0, attributes: { occluded: false } });
  return { categories: AIHUB_CATEGORIES, images: [{ id: 1, width: sheet.w, height: sheet.h, file_name: `${fileBase()}.PNG` }], annotations: anns };
}
const fileBase = () => `APT_FP_SPA_8${String(Math.round(st.params.area)).padStart(3, '0').slice(-3)}${st.current}${String(st.cands[st.current].seed % 1000).padStart(3, '0')}`;
const download = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// ---------- 이벤트 ----------
$('#ff-filter').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  st.filter = b.dataset.f;
  pressed($('#ff-filter'), 'f', st.filter);
  renderGallery();
});
$('#ff-freedom').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  st.freedom = b.dataset.v;
  pressed($('#ff-freedom'), 'v', st.freedom);
});
$('#ff-view').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  st.view = b.dataset.v;
  pressed($('#ff-view'), 'v', st.view);
  renderResult();
});
$('#ff-omode').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  st.omode = b.dataset.v;
  renderOutline();
});
$('#ff-tpl').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  st.tpl = b.dataset.v;
  pressed($('#ff-tpl'), 'v', st.tpl);
  renderOutline();
});
$('#ff-rot').addEventListener('click', () => ((st.tf.rot = (st.tf.rot + 1) % 4), renderOutline()));
$('#ff-fx').addEventListener('click', () => ((st.tf.flipX = !st.tf.flipX), renderOutline()));
$('#ff-fy').addEventListener('click', () => ((st.tf.flipY = !st.tf.flipY), renderOutline()));
$('#ff-asp').addEventListener('input', (e) => {
  st.tf.aspect = Number(e.target.value);
  $('#ff-asp-v').textContent = st.tf.aspect.toFixed(2);
  renderOutline();
});
for (const [id, out] of [['#ff-taspect', '#ff-taspect-v'], ['#ff-tcut', '#ff-tcut-v']])
  $(id).addEventListener('input', (e) => {
    $(out).textContent = Number(e.target.value).toFixed(2);
    renderOutline();
  });
$('#ff-bsides').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const v = b.dataset.v;
  st.bsides = st.bsides.includes(v) ? st.bsides.filter((x) => x !== v) : [...st.bsides, v];
  $('#ff-bsides').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(st.bsides.includes(x.dataset.v))));
  renderOutline();
});
$('#ff-area').addEventListener('change', () => st.omode === 'tpl' && renderOutline());
$('#ff-dload').addEventListener('click', () => (loadDrawFromUnit(), renderOutline()));
$('#ff-dclear').addEventListener('click', () => ((st.draw.cells = new Uint8Array(st.draw.gx * st.draw.gy)), renderOutline()));
$('#ff-sx').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const v = b.dataset.v;
  st.sxPrefs = st.sxPrefs.includes(v) ? st.sxPrefs.filter((x) => x !== v) : [...st.sxPrefs, v];
  $('#ff-sx').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(st.sxPrefs.includes(x.dataset.v))));
});
$('#ff-jitter').addEventListener('input', (e) => ($('#ff-jitter-v').textContent = Number(e.target.value).toFixed(2)));
$('#ff-run').addEventListener('click', run);
$('#ff-slider').addEventListener('input', () => renderTime());
$('#ff-play').addEventListener('click', () => {
  if (st.playing) {
    clearInterval(st.playing);
    st.playing = null;
    $('#ff-play').textContent = '▶ 재생';
    return;
  }
  const s = $('#ff-slider');
  if (Number(s.value) >= Number(s.max)) s.value = '0';
  $('#ff-play').textContent = '❚❚ 멈춤';
  st.playing = setInterval(() => {
    if (Number(s.value) >= Number(s.max)) {
      clearInterval(st.playing);
      st.playing = null;
      $('#ff-play').textContent = '▶ 재생';
      return;
    }
    s.value = String(Number(s.value) + 1);
    renderTime();
  }, 180);
});
$('#ff-json').addEventListener('click', () => download(new Blob([JSON.stringify(spaJson())], { type: 'application/json' }), `${fileBase()}.json`));
$('#ff-svg').addEventListener('click', () => download(new Blob([$('#ff-plan svg').outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')], { type: 'image/svg+xml' }), `${fileBase()}.svg`));

fetch(`${base}data/shapes.json`)
  .then((r) => r.json())
  .then((u) => {
    st.units = u;
    renderGallery();
  });

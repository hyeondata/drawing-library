// 이미지로 평가: 평면도 이미지 → 실 영역 찾기 → 실 종류 지정 → COCO 공간 라벨 → 평가 화면으로 넘기기.
import { ROOM_TYPES } from '../model/drawing-style.js';
import { applyAssignments, otsu, regionPolygon, segment, snapRect, toCoco, toGray } from '../image/segment.js';

const { base, required, tools } = JSON.parse(document.getElementById('ie-data').textContent);
const $ = (s) => document.querySelector(s);
const COLOR = Object.fromEntries(ROOM_TYPES.map((t) => [t.type, t.color]));
const MAX_W = 2000; // 처리 해상도(가로). 큰 이미지는 줄여서 처리한다.
export const HANDOFF_KEY = 'floorplan-eval:image';

const state = {
  name: '',
  img: null,
  w: 0,
  h: 0,
  gray: null,
  threshold: 160,
  close: 2,
  minArea: 0.0008,
  lines: [],
  rects: [],
  seeds: [],
  merges: [],
  history: [],
  tool: 'assign',
  type: ROOM_TYPES[0].type,
  seg: null,
  assign: null,
  hover: 0,
  pendingMerge: null,
  drag: null,
};

const canvas = $('#ie-canvas');
const ctx = canvas.getContext('2d');
const base0 = document.createElement('canvas'); // 줄인 원본 이미지

// ---------- 불러오기 ----------
async function loadImage(src, name) {
  setStatus('이미지를 읽는 중…');
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  try {
    await img.decode();
  } catch {
    setStatus('이미지를 읽지 못했습니다. PNG·JPG·WebP 파일인지 확인하세요.', true);
    return;
  }
  const f = Math.min(1, MAX_W / img.naturalWidth);
  const w = Math.round(img.naturalWidth * f);
  const h = Math.round(img.naturalHeight * f);
  base0.width = w;
  base0.height = h;
  const bctx = base0.getContext('2d', { willReadFrequently: true });
  bctx.fillStyle = '#ffffff';
  bctx.fillRect(0, 0, w, h);
  bctx.drawImage(img, 0, 0, w, h);
  const data = bctx.getImageData(0, 0, w, h).data;
  Object.assign(state, { name, img, w, h, gray: toGray(data, w, h), lines: [], rects: [], seeds: [], merges: [], history: [], hover: 0, pendingMerge: null });
  state.threshold = Math.min(220, otsu(state.gray));
  $('#opt-threshold').value = state.threshold;
  canvas.width = w;
  canvas.height = h;
  $('#ie-empty').hidden = true;
  $('#ie-stage').hidden = false;
  $('#imgeval').classList.add('has-image');
  for (const id of ['#ie-detect', '#ie-label', '#ie-eval']) $(id).setAttribute('aria-disabled', 'false');
  resegment();
}

// ---------- 분할과 지정 ----------
function resegment() {
  if (!state.gray) return;
  const t0 = performance.now();
  state.seg = segment(state.gray, state.w, state.h, { threshold: state.threshold, close: state.close, minArea: state.minArea, lines: state.lines });
  reassign();
  $('#out-threshold').textContent = state.threshold;
  $('#out-close').textContent = state.close;
  $('#out-min').textContent = (state.minArea * 100).toFixed(2);
  $('#ie-found').textContent = `영역 ${state.seg.regions.length}개를 찾았습니다(${Math.round(performance.now() - t0)}ms).`;
}
function reassign() {
  const { labels, regions } = state.seg;
  state.assign = applyAssignments(labels, state.w, regions, state.seeds, state.merges);
  render();
  updateCheck();
}
const groupAt = (x, y) => {
  const l = state.seg?.labels[Math.round(y) * state.w + Math.round(x)] || 0;
  return l ? state.assign.rootOf(l) : 0;
};
const rectAt = (x, y) => {
  for (let i = state.rects.length - 1; i >= 0; i--) {
    const r = state.rects[i];
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return i;
  }
  return -1;
};

/** 지정된 실 목록(다각형은 처리 해상도 좌표). 사각형과 겹치는 자동 영역 부분은 깎아 낸다. */
function rooms() {
  const { w, h } = state;
  const labels = state.seg.labels.slice();
  const gap = 3;
  for (const r of state.rects) {
    for (let y = Math.max(0, Math.floor(r.y0) - gap); y <= Math.min(h - 1, Math.ceil(r.y1) + gap); y++)
      for (let x = Math.max(0, Math.floor(r.x0) - gap); x <= Math.min(w - 1, Math.ceil(r.x1) + gap); x++) labels[y * w + x] = 0;
  }
  const out = [];
  for (const g of state.assign.groups.values()) {
    if (!g.type) continue;
    const polygon = regionPolygon(labels, w, h, g.members);
    if (polygon && polygon.length >= 3) out.push({ type: g.type, polygon });
  }
  for (const r of state.rects) {
    if (!r.type) continue;
    out.push({ type: r.type, polygon: [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]] });
  }
  return out;
}

// ---------- 그리기 ----------
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function render() {
  const { w, h } = state;
  if (!w) return;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(base0, 0, 0);
  const overlay = ctx.getImageData(0, 0, w, h);
  const px = overlay.data;
  const labels = state.seg.labels;
  const colorOf = new Map();
  for (const g of state.assign.groups.values()) {
    const hover = g.id === state.hover || g.id === state.pendingMerge;
    const rgb = g.type ? hexToRgb(COLOR[g.type]) : [150, 146, 170];
    const a = g.type ? (hover ? 0.7 : 0.5) : hover ? 0.45 : 0.18;
    for (const m of g.members) colorOf.set(m, [rgb, a]);
  }
  for (let p = 0; p < labels.length; p++) {
    const l = labels[p];
    if (!l) continue;
    const c = colorOf.get(l);
    if (!c) continue;
    const [[r, g, b], a] = c;
    const i = p * 4;
    px[i] = px[i] * (1 - a) + r * a;
    px[i + 1] = px[i + 1] * (1 - a) + g * a;
    px[i + 2] = px[i + 2] * (1 - a) + b * a;
  }
  ctx.putImageData(overlay, 0, 0);

  const lw = Math.max(2, w / 600);
  // 사용자가 그린 사각형
  for (const r of state.rects) {
    const c = r.type ? COLOR[r.type] : '#8b88a0';
    ctx.fillStyle = c + '88';
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  }
  // 사용자가 그은 선
  ctx.strokeStyle = '#d03b3b';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  for (const [a, b] of state.lines) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  // 끌고 있는 도형 미리보기
  if (state.drag && state.drag.cur) {
    const [a, b] = [state.drag.start, state.drag.cur];
    ctx.setLineDash([lw * 3, lw * 2]);
    ctx.strokeStyle = state.tool === 'line' ? '#d03b3b' : COLOR[state.type] || '#5b3ff0';
    if (state.tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    } else {
      ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    }
    ctx.setLineDash([]);
  }
  // 실 이름
  const font = Math.max(12, w / 95);
  ctx.font = `700 ${font}px Pretendard, 'Noto Sans KR', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const regionById = new Map(state.seg.regions.map((r) => [r.id, r]));
  const tags = [];
  for (const g of state.assign.groups.values()) {
    if (!g.type) continue;
    const biggest = g.members.map((m) => regionById.get(m)).sort((a, b) => b.area - a.area)[0];
    tags.push([g.type, biggest.cx, biggest.cy]);
  }
  for (const r of state.rects) if (r.type) tags.push([r.type, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]);
  for (const [t, x, y] of tags) {
    ctx.lineWidth = font / 4;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = '#1b1a22';
    ctx.fillText(t, x, y);
  }
}

function updateCheck() {
  const counts = {};
  for (const g of state.assign.groups.values()) if (g.type) counts[g.type] = (counts[g.type] || 0) + 1;
  for (const r of state.rects) if (r.type) counts[r.type] = (counts[r.type] || 0) + 1;
  document.querySelectorAll('#ie-check li').forEach((li) => {
    const n = counts[li.dataset.req] || 0;
    li.querySelector('span').textContent = n;
    li.classList.toggle('ok', n > 0);
  });
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  $('#ie-go').disabled = total === 0;
  $('#ie-json').disabled = total === 0;
}

function setStatus(text, error = false) {
  const el = $('#ie-status');
  el.textContent = text;
  el.classList.toggle('error-text', error);
}

// ---------- 조작 ----------
const toImage = (e) => {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) * state.w) / r.width, ((e.clientY - r.top) * state.h) / r.height];
};
function push(action) {
  state.history.push(action);
}

canvas.addEventListener('pointerdown', (e) => {
  if (!state.seg) return;
  const pt = toImage(e);
  if (state.tool === 'line' || state.tool === 'rect') {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // 합성 이벤트 등 캡처할 수 없는 포인터
    }
    state.drag = { start: pt, cur: pt };
    return;
  }
  if (state.tool === 'assign') {
    const ri = rectAt(...pt);
    if (ri >= 0) {
      push({ kind: 'rectType', index: ri, prev: state.rects[ri].type });
      if (state.type) state.rects[ri].type = state.type;
      else state.rects.splice(ri, 1);
      render();
      updateCheck();
      return;
    }
    if (!groupAt(...pt)) {
      setStatus('여기에는 찾은 영역이 없습니다. 사각형 도구로 직접 그리거나, 끊긴 선 잇기 값을 바꿔 보세요.');
      return;
    }
    state.seeds.push({ x: pt[0], y: pt[1], type: state.type || null });
    push({ kind: 'seed' });
    setStatus('');
    reassign();
    return;
  }
  if (state.tool === 'merge') {
    const g = groupAt(...pt);
    if (!g) return;
    if (!state.pendingMerge) {
      state.pendingMerge = g;
      state.mergeStart = pt;
      setStatus('합칠 다른 영역을 누르세요.');
      render();
    } else {
      if (g !== state.pendingMerge) {
        state.merges.push({ a: state.mergeStart, b: pt });
        push({ kind: 'merge' });
      }
      state.pendingMerge = null;
      setStatus('');
      reassign();
    }
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!state.seg) return;
  const pt = toImage(e);
  if (state.drag) {
    state.drag.cur = pt;
    render();
    return;
  }
  const g = groupAt(...pt);
  if (g !== state.hover) {
    state.hover = g;
    render();
  }
});
canvas.addEventListener('pointerleave', () => {
  if (state.hover) {
    state.hover = 0;
    render();
  }
});
canvas.addEventListener('pointerup', () => {
  const d = state.drag;
  state.drag = null;
  if (!d) return;
  const [a, b] = [d.start, d.cur];
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 6) return render();
  if (state.tool === 'line') {
    state.lines.push([a, b]);
    push({ kind: 'line' });
    resegment();
  } else {
    const drawn = { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]), type: state.type || '기타' };
    // 변을 가까운 벽선에 붙여 이웃 실과 맞닿게 한다.
    state.rects.push(snapRect(drawn, state.seg.ink, state.w, state.h, Math.max(8, Math.round(state.w / 130))));
    push({ kind: 'rect' });
    render();
    updateCheck();
  }
});

function undo() {
  const a = state.history.pop();
  if (!a) return;
  if (a.kind === 'seed') state.seeds.pop();
  if (a.kind === 'merge') state.merges.pop();
  if (a.kind === 'rect') state.rects.pop();
  if (a.kind === 'rectType') {
    if (state.rects[a.index]) state.rects[a.index].type = a.prev;
  }
  if (a.kind === 'line') {
    state.lines.pop();
    return resegment();
  }
  reassign();
}

// ---------- 내보내기 ----------
function buildLabel() {
  return toCoco(rooms(), state.w, state.h, { fileName: state.name || 'image.png' });
}
function previewDataUrl() {
  const c = document.createElement('canvas');
  const f = Math.min(1, 900 / state.w);
  c.width = Math.round(state.w * f);
  c.height = Math.round(state.h * f);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

$('#ie-go').addEventListener('click', () => {
  const label = buildLabel();
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ name: state.name || '이미지', label, preview: previewDataUrl() }));
  } catch {
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ name: state.name || '이미지', label }));
    } catch {
      setStatus('브라우저 저장 공간을 쓸 수 없습니다. 라벨 JSON을 내려받아 평가 화면에서 올려 주세요.', true);
      return;
    }
  }
  location.href = `${base}#image`;
});
$('#ie-json').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(buildLabel())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(state.name || 'image').replace(/\.[^.]+$/, '')}_SPA.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// 도구·실 종류·옵션
document.querySelectorAll('[data-tool]').forEach((b) =>
  b.addEventListener('click', () => {
    state.tool = b.dataset.tool;
    state.pendingMerge = null;
    document.querySelectorAll('[data-tool]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('#ie-tool-hint').textContent = tools.find((t) => t.key === state.tool).hint;
    canvas.dataset.tool = state.tool;
    render();
  }),
);
document.querySelectorAll('[data-type]').forEach((b) =>
  b.addEventListener('click', () => {
    state.type = b.dataset.type;
    document.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }),
);
let timer = 0;
const later = (fn) => {
  clearTimeout(timer);
  timer = setTimeout(fn, 120);
};
$('#opt-threshold').addEventListener('input', (e) => {
  state.threshold = Number(e.target.value);
  later(resegment);
});
$('#opt-close').addEventListener('input', (e) => {
  state.close = Number(e.target.value);
  later(resegment);
});
$('#opt-min').addEventListener('input', (e) => {
  state.minArea = Number(e.target.value) / 100;
  later(resegment);
});
$('#ie-undo').addEventListener('click', undo);
$('#ie-reset').addEventListener('click', () => {
  Object.assign(state, { lines: [], rects: [], seeds: [], merges: [], history: [], pendingMerge: null });
  resegment();
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undo();
  }
});

// 파일·샘플
const file = $('#ie-file');
file.addEventListener('change', () => {
  const f = file.files && file.files[0];
  if (f) loadImage(URL.createObjectURL(f), f.name);
  file.value = '';
});
const drop = $('#ie-drop');
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) loadImage(URL.createObjectURL(f), f.name);
});
document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => loadImage(b.dataset.sample, `${b.dataset.name}.png`)));

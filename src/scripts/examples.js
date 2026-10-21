// 예시 도면 페이지: 종류 거르기, 크게 보기(확대·이동), 주소(#도면ID)로 바로 열기.
const { base, examples, legends, sourceNote, kindName } = JSON.parse(document.getElementById('examples-data').textContent);
const byId = new Map(examples.map((e) => [e.id, e]));
const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- 거르기 ----------
const filter = { kind: 'all', originalOnly: false };
function applyFilter() {
  let shown = 0;
  document.querySelectorAll('.ex-group').forEach((group) => {
    const kindOk = filter.kind === 'all' || group.dataset.group === filter.kind;
    let visible = 0;
    group.querySelectorAll('.ex-grid > li').forEach((li) => {
      const ok = kindOk && (!filter.originalOnly || li.dataset.original === 'true');
      li.hidden = !ok;
      if (ok) visible++;
    });
    group.hidden = visible === 0;
    shown += visible;
  });
  $('#ex-count').textContent = `${shown}장`;
  document.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === filter.kind)));
}
document.querySelectorAll('[data-filter]').forEach((b) =>
  b.addEventListener('click', () => {
    filter.kind = b.dataset.filter;
    applyFilter();
  }),
);
$('#only-original').addEventListener('change', (e) => {
  filter.originalOnly = e.target.checked;
  applyFilter();
});

// ---------- 크게 보기 ----------
const viewer = $('#viewer');
const stage = $('#viewer-stage');
const img = $('#viewer-img');
const view = { id: null, scale: 1, fit: 1, x: 0, y: 0 };

const visibleIds = () => [...document.querySelectorAll('.ex-grid > li:not([hidden]) .ex-card')].map((a) => a.dataset.id);

function applyTransform() {
  img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  $('#zoom-level').textContent = `${Math.round((view.scale / view.fit) * 100)}%`;
}
function fitView() {
  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  const r = stage.getBoundingClientRect();
  view.fit = Math.min((r.width - 24) / w, (r.height - 24) / h);
  view.scale = view.fit;
  view.x = (r.width - w * view.scale) / 2;
  view.y = (r.height - h * view.scale) / 2;
  applyTransform();
}
/** 화면의 한 점(cx, cy)을 고정한 채 배율을 바꾼다. */
function zoomAt(factor, cx, cy) {
  const next = Math.min(view.fit * 12, Math.max(view.fit * 0.5, view.scale * factor));
  const k = next / view.scale;
  view.x = cx - (cx - view.x) * k;
  view.y = cy - (cy - view.y) * k;
  view.scale = next;
  applyTransform();
}
const zoomCenter = (factor) => {
  const r = stage.getBoundingClientRect();
  zoomAt(factor, r.width / 2, r.height / 2);
};

function infoHtml(e) {
  const legend = legends[e.kind]
    .map((l) => `<li><i style="background:${l.fill};border-color:${l.stroke ?? l.fill}"></i>${esc(l.label)}</li>`)
    .join('');
  const counts = e.counts.map(([name, n]) => `<tr><td>${esc(name)}</td><td class="num">${n}</td></tr>`).join('');
  const source = e.original
    ? '원본 PNG(4963×3509)를 화면용으로 줄인 이미지입니다.'
    : `원본 이미지가 없어 라벨로 그렸습니다. ${sourceNote[e.kind]}`;
  const texts = e.texts
    ? `<h3>적힌 글자</h3><p class="ex-texts">${[...new Set(e.texts)].map((t) => `<span>${esc(t)}</span>`).join('')}</p>`
    : '';
  const evaluate = e.evaluable
    ? `<a class="button-primary" href="${base}#${e.id}">이 도면 평가하기 →</a>`
    : '<p class="note">글자(OCR) 라벨은 평가 대상이 아닙니다.</p>';
  return `
    ${evaluate}
    <h3>출처</h3>
    <p>${source}</p>
    <p class="viewer-links"><a href="${base}${e.image}" target="_blank" rel="noopener">이미지 새 탭에서 열기</a> · <a href="${base}data/labels/${e.id}.json" target="_blank" rel="noopener">라벨 JSON</a></p>
    ${e.original ? '' : `<h3>범례</h3><ul class="ex-legend vertical">${legend}</ul>`}
    <h3>라벨 구성</h3>
    <table class="plain"><thead><tr><th>항목</th><th class="num">개수</th></tr></thead><tbody>${counts}</tbody></table>
    ${texts}`;
}

function open(id, { push = true } = {}) {
  const e = byId.get(id);
  if (!e) return;
  view.id = id;
  $('#viewer-kind').innerHTML = `<span class="mono">${e.kind}</span> ${kindName[e.kind]} 도면`;
  $('#viewer-title').textContent = e.number;
  $('#viewer-info').innerHTML = infoHtml(e);
  img.alt = `${kindName[e.kind]} 도면 ${e.number}${e.original ? ' 원본 이미지' : ' (라벨로 그림)'}`;
  img.classList.toggle('is-drawing', !e.original);
  img.style.opacity = '0';
  img.onload = () => {
    fitView();
    img.style.opacity = '1';
  };
  img.src = base + e.image;
  if (!viewer.open) viewer.showModal();
  if (push) history.replaceState(null, '', `#${id}`);
}
function close() {
  if (viewer.open) viewer.close();
}
viewer.addEventListener('close', () => {
  history.replaceState(null, '', location.pathname + location.search);
  document.querySelector(`.ex-card[data-id="${view.id}"]`)?.focus({ preventScroll: false });
  view.id = null;
});
function step(dir) {
  const ids = visibleIds();
  if (!ids.length) return;
  const i = ids.indexOf(view.id);
  open(ids[(i + dir + ids.length) % ids.length]);
}

document.querySelectorAll('.ex-card').forEach((a) =>
  a.addEventListener('click', (ev) => {
    ev.preventDefault();
    open(a.dataset.id);
  }),
);
viewer.addEventListener('click', (ev) => {
  const act = ev.target.closest('[data-act]')?.dataset.act;
  if (act === 'prev') step(-1);
  else if (act === 'next') step(1);
  else if (act === 'zoom-in') zoomCenter(1.4);
  else if (act === 'zoom-out') zoomCenter(1 / 1.4);
  else if (act === 'fit') fitView();
  else if (act === 'close') close();
  else if (ev.target === viewer) close(); // 바깥(배경) 클릭
});
viewer.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input, textarea')) return;
  if (ev.key === 'ArrowLeft') step(-1);
  else if (ev.key === 'ArrowRight') step(1);
  else if (ev.key === '+' || ev.key === '=') zoomCenter(1.4);
  else if (ev.key === '-') zoomCenter(1 / 1.4);
  else if (ev.key === '0') fitView();
  else return;
  ev.preventDefault();
});

// 휠 확대, 끌어서 이동(마우스·터치), 두 손가락 확대
stage.addEventListener(
  'wheel',
  (ev) => {
    ev.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
  },
  { passive: false },
);
const pointers = new Map();
let pinch = null;
stage.addEventListener('pointerdown', (ev) => {
  stage.setPointerCapture(ev.pointerId);
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  stage.classList.add('dragging');
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
stage.addEventListener('pointermove', (ev) => {
  const prev = pointers.get(ev.pointerId);
  if (!prev) return;
  const cur = { x: ev.clientX, y: ev.clientY };
  pointers.set(ev.pointerId, cur);
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const r = stage.getBoundingClientRect();
    zoomAt(d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    pinch = d;
  } else if (pointers.size === 1) {
    view.x += cur.x - prev.x;
    view.y += cur.y - prev.y;
    applyTransform();
  }
});
const endPointer = (ev) => {
  pointers.delete(ev.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) stage.classList.remove('dragging');
};
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('dblclick', (ev) => {
  const r = stage.getBoundingClientRect();
  zoomAt(2, ev.clientX - r.left, ev.clientY - r.top);
});
window.addEventListener('resize', () => viewer.open && fitView());

// 주소로 바로 열기: examples/#APT_FP_SPA_...
const fromHash = () => {
  const id = decodeURIComponent(location.hash.slice(1));
  if (byId.has(id)) open(id, { push: false });
};
window.addEventListener('hashchange', fromHash);
fromHash();

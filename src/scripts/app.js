// 평가 화면: 도면 목록 → 클릭 → 평가 모델 실행 → 결과 그리기.
import { evaluate } from '../model/index.js';

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const asset = (p) => BASE + p;
const $ = (sel) => document.querySelector(sel);

const KIND_NAME = { SPA: '공간', STR: '구조', OBJ: '설비' };
const FIXTURE_ORDER = ['변기', '세면대', '욕조', '싱크대', '가스레인지'];
const STR_CLASS = { 벽체: 'wall', 출입문: 'door', 창호: 'window' };

const state = {
  catalog: [],
  baseline: null,
  kind: 'SPA',
  query: '',
  currentId: null,
  result: null,
  entry: null,
  unit: 0,
  scores: new Map(),
};

// ---------- 유틸 ----------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtScore = (v) => (v === null || v === undefined ? '–' : v.toFixed(0));
const isRatio = (key) => key.startsWith('ratio_') || key.endsWith('Share') || key.endsWith('Pct') || key === 'exteriorExposure';
function fmtValue(key, v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return isRatio(key) ? `${(v * 100).toFixed(1)}%` : v.toFixed(2);
}
const pathOf = (polys) => polys.map((pts) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z').join('');
function bboxOfPolys(list) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polys of list)
    for (const pts of polys)
      for (const [x, y] of pts) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return [x0, y0, x1, y1];
}
const depthVar = (d) => `var(--depth-${Math.min(d, 4)})`;

async function fetchJson(path) {
  const res = await fetch(asset(path));
  if (!res.ok) throw new Error(`${path}을(를) 불러오지 못했습니다 (${res.status}).`);
  return res.json();
}

// ---------- 툴팁 ----------
const tooltip = $('#tooltip');
function showTip(text, x, y) {
  tooltip.textContent = text;
  tooltip.hidden = false;
  const r = tooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 8, x + 14);
  const top = y + 16 + r.height > window.innerHeight ? y - r.height - 12 : y + 16;
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}
document.addEventListener('pointermove', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (el) showTip(el.dataset.tip, e.clientX, e.clientY);
  else tooltip.hidden = true;
});
document.addEventListener('pointerleave', () => (tooltip.hidden = true));

// ---------- 목록 ----------
function sketchSvg(entry) {
  const { viewBox, layers } = entry.sketch;
  const cls = (type) => {
    if (entry.kind === 'STR') return `sk-${STR_CLASS[type] || 'wall'}`;
    if (entry.kind === 'OBJ') return 'sk-fixture';
    return 'sk-room';
  };
  const paths = Object.entries(layers)
    .map(([type, d]) => `<path class="${cls(type)}" d="${d}" ${entry.kind === 'SPA' ? 'stroke="var(--surface-1)" stroke-width="1.2"' : ''}/>`)
    .join('');
  return `<svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${paths}</svg>`;
}

function renderCards() {
  const list = state.catalog.filter((d) => d.kind === state.kind && d.number.includes(state.query.trim()));
  const withImage = list.filter((d) => d.image).length;
  $('#gallery-count').textContent =
    `${KIND_NAME[state.kind]} 도면 ${list.length}건` + (withImage ? ` · 원본 이미지 ${withImage}건` : ' · 라벨로 그린 도면');
  $('#cards').innerHTML = list
    .map((d) => {
      const r = state.scores.get(d.id);
      const thumb = d.thumbnail ? `<img src="${asset(d.thumbnail)}" alt="" loading="lazy" decoding="async" />` : sketchSvg(d);
      return `<button class="card" role="listitem" data-id="${d.id}" aria-current="${d.id === state.currentId}" aria-label="${d.kind} 도면 ${d.number} 평가하기">
        ${d.image ? '<span class="card-tag">원본 이미지</span>' : ''}
        <span class="card-thumb">${thumb}</span>
        <span class="card-meta"><span class="card-num">${d.number}</span>
        <span class="card-badge">${r ? `${r.score.toFixed(0)} · ${r.grade}` : '<span class="note">평가 전</span>'}</span></span>
      </button>`;
    })
    .join('');
}

function setKind(kind) {
  state.kind = kind;
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.kind === kind)));
  renderCards();
}

// ---------- 평가 ----------
async function select(id) {
  const entry = state.catalog.find((d) => d.id === id);
  if (!entry) return;
  if (entry.kind !== state.kind) setKind(entry.kind);
  state.currentId = id;
  document.querySelectorAll('.card').forEach((c) => c.setAttribute('aria-current', String(c.dataset.id === id)));
  showLoading(entry.id);
  try {
    const label = await fetchJson(entry.label);
    const t0 = performance.now();
    const result = evaluate(label, { baseline: state.baseline, drawingId: id, kind: entry.kind });
    const ms = performance.now() - t0;
    state.scores.set(id, result);
    history.replaceState(null, '', `#${id}`);
    showResult(result, entry, ms);
    renderCards();
  } catch (err) {
    showError(err);
  }
}

async function evaluateUpload(file) {
  try {
    const label = JSON.parse(await file.text());
    const t0 = performance.now();
    const result = evaluate(label, { baseline: state.baseline });
    const ms = performance.now() - t0;
    const image = (label.images && label.images[0]) || {};
    state.currentId = null;
    document.querySelectorAll('.card').forEach((c) => c.setAttribute('aria-current', 'false'));
    history.replaceState(null, '', location.pathname);
    showResult(result, { id: file.name, kind: result.kind, number: file.name, image: null, width: image.width, height: image.height, uploaded: true }, ms);
  } catch (err) {
    showError(err);
  }
}

function showLoading(id) {
  $('#empty').hidden = true;
  const el = $('#result');
  el.hidden = false;
  el.innerHTML = `<p class="note">${esc(id)} 평가 중…</p>`;
}

function showError(err) {
  $('#empty').hidden = true;
  const el = $('#result');
  el.hidden = false;
  el.innerHTML = `<div class="error-box"><b>평가하지 못했습니다.</b><br />${esc(err.message)}</div>`;
}

function showResult(result, entry, ms) {
  state.result = result;
  state.entry = entry;
  state.unit = 0;
  $('#empty').hidden = true;
  const el = $('#result');
  el.hidden = false;
  const units = result.units.length;
  el.innerHTML = `
    <div class="result-head">
      <div class="result-title">
        <span class="chip"><span class="mono">${result.kind}</span> ${KIND_NAME[result.kind]} 평가${entry.uploaded ? ' · 올린 파일' : ''}</span>
        <h2>${esc(entry.id)}</h2>
        <p>${result.kind === 'SPA' ? `세대 ${units}개 · ` : ''}기준 분포 ${result.baselineSize}개와 비교 · 계산 ${ms.toFixed(0)}ms · model v${result.modelVersion}</p>
      </div>
      <div class="score-hero">
        <div>
          <div class="score-number">${result.score.toFixed(1)}<small>/100</small></div>
          <div class="score-sub">${units > 1 ? `세대 ${units}개 평균` : '종합 점수'}</div>
        </div>
        <div class="grade" aria-label="등급 ${result.grade}">${result.grade}</div>
      </div>
    </div>
    ${units > 1 ? `<div class="unit-tabs" role="group" aria-label="세대 선택">${result.units
      .map((u, i) => `<button type="button" data-unit="${i}" aria-pressed="${i === 0}">세대 ${i + 1} · ${u.score.toFixed(0)}점</button>`)
      .join('')}</div>` : ''}
    <div id="unit-body"></div>`;
  renderUnit();
}

// ---------- 세대별 본문 ----------
function renderUnit() {
  const { result, entry } = state;
  const unit = result.units[state.unit];
  document.querySelectorAll('.unit-tabs button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.unit) === state.unit)));
  const groups = Object.values(unit.groups);
  const groupHtml = `<div class="groups">${groups
    .map(
      (g) => `<div class="group">
        <div class="group-top"><span>${g.label} <span class="note">×${g.weight}</span></span><strong>${fmtScore(g.score)}</strong></div>
        <div class="bar" role="img" aria-label="${g.label} ${fmtScore(g.score)}점"><span style="width:${Math.max(0, Math.min(100, g.score))}%"></span></div>
      </div>`,
    )
    .join('')}</div>`;

  const plan = result.kind === 'SPA' ? spaPlan(result.analysis, state.unit) : result.kind === 'STR' ? strPlan(result.analysis) : objPlan(result.analysis, entry);
  const rules = unit.groups.rules.items;
  const rulesHtml = `<ul class="rules">${rules
    .map(
      (r) => `<li class="${r.pass ? 'pass' : 'fail'}">
        <span class="icon" aria-hidden="true">${r.pass ? '✓' : '✕'}</span>
        <span>${esc(r.label)}<span class="detail">${esc(r.detail)}</span></span>
        <span class="ratio">${r.pass ? '통과' : `${Math.round(r.ratio * 100)}%`}<span class="sr-only">${r.pass ? '' : ' 충족'}</span></span>
      </li>`,
    )
    .join('')}</ul>`;

  const gateNote = unit.validity && !unit.validity.valid
    ? `<div class="error-box"><b>유효하지 않은 평면:</b> ${esc(unit.validity.failed.join(', '))}. 관문 규칙을 어긴 평면은 전형성 점수와 따로 판정합니다${unit.capped ? `. 단일 점수로는 ${unit.score.toFixed(0)}점으로 묶었습니다(원점수 ${unit.rawScore.toFixed(1)})` : ''}.</div>`
    : '';
  const featureGroups = groups.filter((g) => g !== unit.groups.rules);
  const featuresHtml = featureTable(featureGroups);
  const extra = result.kind === 'SPA' ? syntaxPanel(result.analysis.units[state.unit], result.analysis) : summaryPanel(result.analysis);

  $('#unit-body').innerHTML = `
    ${gateNote}
    ${groupHtml}
    <div class="panel-grid">
      <div class="panel"><h3>도면 분석<small>${planCaption(result.kind)}</small></h3>${plan}</div>
      <div class="panel"><h3>정합성 규칙<small>가중 충족률 ${fmtScore(unit.groups.rules.score)}점</small></h3>${rulesHtml}</div>
    </div>
    <div class="panel-grid">
      <div class="panel"><h3>분포 근접도<small>회색 띠: 기준 범위 · 세로선: 중앙값 · 점: 이 도면</small></h3>${featuresHtml}</div>
      ${extra}
    </div>`;
}

function planCaption(kind) {
  if (kind === 'SPA') return '실 색 = 현관에서 몇 단계 안쪽인지 · 선 = 인접 링크';
  if (kind === 'STR') return '벽·문·창과 문제 요소';
  return '설비 위치와 짝 없는 설비';
}

function svgFrame(bbox, padRatio, inner, label) {
  let [x0, y0, x1, y1] = bbox;
  const pad = padRatio * Math.max(x1 - x0, y1 - y0);
  x0 -= pad;
  y0 -= pad;
  x1 += pad;
  y1 += pad;
  return `<svg class="plan-svg" viewBox="${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}" role="img" aria-label="${esc(label)}">${inner}</svg>`;
}

function spaPlan(analysis, unitIndex) {
  const unit = analysis.units[unitIndex];
  if (!analysis.spaces.length) return '<p class="note">공간 라벨이 없습니다.</p>';
  const nodeBySpace = new Map((unit?.nodes || []).map((n) => [n.space, n]));
  // 세대가 여럿이면 고른 세대를 중심으로 확대한다.
  const focus = analysis.units.length > 1 && unit ? unit.members.map((i) => analysis.spaces[i].polys) : analysis.spaces.map((s) => s.polys);
  const bbox = bboxOfPolys(focus);
  const scale = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
  const font = scale / 42;
  const shapes = analysis.spaces
    .map((s, i) => {
      const n = nodeBySpace.get(i);
      let fill = 'var(--other-unit)';
      let tip = `${s.type}\n다른 세대`;
      if (s.common) {
        fill = 'var(--common)';
        tip = `${s.type}\n공용부`;
      } else if (n) {
        fill = n.depth === null ? 'var(--surface-3)' : depthVar(n.depth);
        tip = `${s.type}\n현관 기준 깊이 ${n.depth ?? '끊김'} · 연결도 ${n.connectivity}\n통합도 ${n.integration ? n.integration.toFixed(2) : '–'}`;
      }
      return `<path class="hit" d="${pathOf(s.polys)}" fill="${fill}" stroke="var(--surface-1)" stroke-width="${scale / 400}" data-tip="${esc(tip)}"/>`;
    })
    .join('');
  const edges = (unit?.edges || [])
    .map(([i, j]) => {
      const a = analysis.spaces[i].center;
      const b = analysis.spaces[j].center;
      return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="var(--text-primary)" stroke-opacity="0.45" stroke-width="${scale / 450}" stroke-linecap="round"/>`;
    })
    .join('');
  const minArea = (scale * scale) / 900;
  const labels = (unit?.nodes || [])
    .filter((n) => analysis.spaces[n.space].area >= minArea && n.type !== '기타')
    .map((n) => {
      const [x, y] = analysis.spaces[n.space].center;
      return `<text class="label" x="${x}" y="${y}" font-size="${font}" stroke-width="${font / 4}" text-anchor="middle" dominant-baseline="middle">${esc(n.type)}</text>`;
    })
    .join('');
  const root = unit ? analysis.spaces[unit.rootSpace] : null;
  const rootMark = root
    ? `<circle cx="${root.center[0]}" cy="${root.center[1]}" r="${font * 1.2}" fill="none" stroke="var(--accent)" stroke-width="${scale / 250}"/>`
    : '';
  const maxDepth = Math.max(0, ...(unit?.nodes || []).map((n) => n.depth ?? 0));
  const legend = `<div class="legend" aria-label="범례">
    ${Array.from({ length: Math.min(maxDepth, 4) + 1 }, (_, d) => `<span><i style="background:${depthVar(d)}"></i>깊이 ${d}${d === 4 ? '+' : ''}${d === 0 ? '(현관)' : ''}</span>`).join('')}
    <span><i style="background:var(--common)"></i>공용부</span>
    ${analysis.units.length > 1 ? '<span><i style="background:var(--other-unit);outline:1px solid var(--line)"></i>다른 세대</span>' : ''}
    <span><i style="border:2px solid var(--accent);background:transparent;border-radius:50%"></i>현관</span>
  </div>`;
  return svgFrame(bbox, analysis.units.length > 1 ? 0.06 : 0.03, shapes + edges + rootMark + labels, '공간 평면과 인접 그래프') + legend;
}

function strPlan(analysis) {
  if (!analysis.elements.length) return '<p class="note">구조 라벨이 없습니다.</p>';
  const bbox = bboxOfPolys(analysis.elements.map((e) => e.polys));
  const scale = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
  const fillOf = { 벽체: 'var(--wall)', 출입문: 'var(--series-1)', 창호: 'var(--series-2)' };
  const order = ['벽체', '창호', '출입문'];
  const els = [...analysis.elements].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  const shapes = els
    .map((e) => {
      const flag = e.flag ? ` stroke="var(--critical)" stroke-width="${scale / 160}"` : '';
      const tip = `${e.type}${e.subtype ? ` · ${e.subtype}` : ''}${e.flag === 'floating' ? '\n⚠ 벽에서 떨어짐' : e.flag === 'conflict' ? '\n⚠ 다른 개구부와 겹침' : ''}`;
      return `<path class="hit" d="${pathOf(e.polys)}" fill="${fillOf[e.type] || 'var(--wall)'}"${flag} data-tip="${esc(tip)}"/>`;
    })
    .join('');
  const flagged = analysis.elements.filter((e) => e.flag).length;
  const legend = `<div class="legend"><span><i style="background:var(--wall)"></i>벽체</span><span><i style="background:var(--series-1)"></i>출입문</span><span><i style="background:var(--series-2)"></i>창호</span>
    <span><i style="border:2px solid var(--critical)"></i>문제 요소 ${flagged}개</span></div>`;
  return svgFrame(bbox, 0.03, shapes, '구조 평면') + legend;
}

function objPlan(analysis, entry) {
  const colorOf = Object.fromEntries(FIXTURE_ORDER.map((t, i) => [t, `var(--series-${i + 1})`]));
  const fixtures = analysis.elements;
  let bbox;
  let under = '';
  if (entry.image && entry.width) {
    // 설비가 모인 영역을 중심으로 원본 이미지를 잘라 보여 준다.
    if (fixtures.length) {
      const [x0, y0, x1, y1] = bboxOfPolys(fixtures.map((f) => f.polys));
      const pad = 0.35 * Math.max(x1 - x0, y1 - y0, 400);
      bbox = [Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(entry.width, x1 + pad), Math.min(entry.height, y1 + pad)];
    } else {
      bbox = [0, 0, entry.width, entry.height];
    }
    under = `<image href="${asset(entry.image)}" x="0" y="0" width="${entry.width}" height="${entry.height}" preserveAspectRatio="none"/>`;
  } else if (fixtures.length) {
    bbox = bboxOfPolys(fixtures.map((f) => f.polys));
  } else {
    return '<p class="note">설비 라벨이 없습니다.</p>';
  }
  const scale = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
  const shapes = fixtures
    .map((f) => {
      const c = colorOf[f.type] || 'var(--text-muted)';
      const stroke = f.flag ? 'var(--critical)' : c;
      const tip = `${f.type}${f.flag ? '\n⚠ 짝이 되는 설비가 가까이 없음' : ''}`;
      return `<path class="hit" d="${pathOf(f.polys)}" fill="${c}" fill-opacity="${under ? 0.28 : 0.85}" stroke="${stroke}" stroke-width="${scale / (f.flag ? 220 : 500)}" data-tip="${esc(tip)}"/>`;
    })
    .join('');
  const legend = `<div class="legend">${FIXTURE_ORDER.map((t) => `<span><i style="background:${colorOf[t]}"></i>${t} ${analysis.counts[t]}</span>`).join('')}
    <span><i style="border:2px solid var(--critical)"></i>짝 없음 ${fixtures.filter((f) => f.flag).length}</span></div>`;
  const frame = under ? svgFrame(bbox, 0, under + shapes, '설비 평면 원본 이미지와 라벨') : svgFrame(bbox, 0.15, shapes, '설비 위치');
  return frame + legend;
}

function stripSvg(item) {
  const s = item.stats;
  if (!s || item.value === null) return '<span class="note">–</span>';
  let lo = Math.min(s.min, item.value, s.median - s.scale);
  let hi = Math.max(s.max, item.value, s.median + s.scale);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;
  const W = 160;
  const x = (v) => ((v - lo) / (hi - lo)) * W;
  return `<svg class="strip" viewBox="0 0 ${W} 22" preserveAspectRatio="none" aria-hidden="true">
    <rect class="band" x="${x(s.min)}" y="7" width="${Math.max(2, x(s.max) - x(s.min))}" height="8" rx="4"/>
    <line class="median" x1="${x(s.median)}" x2="${x(s.median)}" y1="3" y2="19"/>
    <circle class="dot" cx="${x(item.value)}" cy="11" r="5"/>
  </svg>`;
}

function featureTable(groups) {
  const rows = groups
    .map((g) => {
      const head = groups.length > 1 ? `<tr><td colspan="4" class="group-heading">${g.label}</td></tr>` : '';
      return (
        head +
        g.items
          .map((it) => {
            const tip = it.stats
              ? `${it.label}\n이 도면 ${fmtValue(it.key, it.value)} · 기준 중앙값 ${fmtValue(it.key, it.stats.median)}\n기준 범위 ${fmtValue(it.key, it.stats.min)} ~ ${fmtValue(it.key, it.stats.max)} (n=${it.stats.n})\n${it.method === 'ecdf' ? `백분위 ${it.percentile === null ? '–' : Math.round(it.percentile * 100)}% (백분위 채점)` : `z = ${it.z === null ? '–' : it.z.toFixed(2)} (Qn 척도)`}${it.adjust ? '\n실 수(K) 보정 잔차로 채점' : ''}${it.weight === 0 ? '\n참고값: 점수에 넣지 않음' : ''}${it.direction === 'higher' ? '\n높을수록 유리: 중앙값보다 크면 감점 없음' : it.direction === 'lower' ? '\n낮을수록 유리: 중앙값보다 작으면 감점 없음' : ''}`
              : it.label;
            return `<tr data-tip="${esc(tip)}">
              <td>${esc(it.label)}</td>
              <td class="num">${fmtValue(it.key, it.value)}</td>
              <td>${stripSvg(it)}</td>
              <td class="num feature-score">${fmtScore(it.score)}</td>
            </tr>`;
          })
          .join('')
      );
    })
    .join('');
  return `<table class="features"><thead><tr><th>지표</th><th class="num">값</th><th>기준 분포</th><th class="num">점수</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function syntaxPanel(unit, analysis) {
  if (!unit) return '<div class="panel"><h3>공간구문 그래프</h3><p class="note">세대를 찾지 못했습니다.</p></div>';
  const nodes = unit.nodes.map((n, l) => ({ ...n, l }));
  const levels = new Map();
  for (const n of nodes) {
    const key = n.depth === null ? 'cut' : n.depth;
    if (!levels.has(key)) levels.set(key, []);
    levels.get(key).push(n);
  }
  const keys = [...levels.keys()].filter((k) => k !== 'cut').sort((a, b) => a - b);
  if (levels.has('cut')) keys.push('cut');
  const W = 560;
  const rowH = 62;
  const H = keys.length * rowH + 30;
  const local = new Map(unit.members.map((g, l) => [g, l]));
  const pos = new Map();
  const neighbors = new Map(nodes.map((n) => [n.l, []]));
  for (const [i, j] of unit.edges) {
    neighbors.get(local.get(i)).push(local.get(j));
    neighbors.get(local.get(j)).push(local.get(i));
  }
  keys.forEach((k, row) => {
    const list = levels.get(k);
    // 윗줄 이웃의 평균 x로 정렬해 선이 덜 엇갈리게 한다.
    list.sort((a, b) => {
      const avg = (n) => {
        const xs = neighbors.get(n.l).filter((m) => pos.has(m)).map((m) => pos.get(m)[0]);
        return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : W / 2;
      };
      return avg(a) - avg(b);
    });
    list.forEach((n, i) => pos.set(n.l, [60 + ((i + 0.5) / list.length) * (W - 80), 20 + row * rowH, list.length > 6 && i % 2 ? 1 : 0]));
  });
  const edges = unit.edges
    .map(([i, j]) => {
      const a = pos.get(local.get(i));
      const b = pos.get(local.get(j));
      return `<line class="edge" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
    })
    .join('');
  const axis = keys
    .map((k, row) => `<text class="depth-axis" x="0" y="${24 + row * rowH}">${k === 'cut' ? '끊김' : `깊이 ${k}`}</text><line class="depth-line" x1="48" x2="${W}" y1="${20 + row * rowH}" y2="${20 + row * rowH}"/>`)
    .join('');
  const circles = nodes
    .map((n) => {
      const [x, y, stagger] = pos.get(n.l);
      const fill = n.depth === null ? 'var(--surface-3)' : depthVar(n.depth);
      const tip = `${n.type}${n.duct ? ' (덕트로 보고 구문 계산에서 제외)' : ''}\n깊이 ${n.depth ?? '끊김'} · 연결도 ${n.connectivity}\n통합도 ${n.integration ? n.integration.toFixed(2) : '–'} · 평균깊이 ${n.meanDepth ? n.meanDepth.toFixed(2) : '–'}`;
      const r = n.l === local.get(unit.rootSpace) ? 10 : 8;
      return `<g data-tip="${esc(tip)}"><circle class="node" cx="${x}" cy="${y}" r="${r + 6}" fill="transparent" stroke="none"/><circle class="node" cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>
        <text x="${x}" y="${y + (stagger ? 34 : 22)}" text-anchor="middle">${esc(n.type)}</text></g>`;
    })
    .join('');
  const sorted = [...nodes].sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99) || (b.integration ?? 0) - (a.integration ?? 0));
  const table = `<div class="table-scroll"><table class="node-table"><thead><tr><th>실</th><th class="num">깊이</th><th class="num">연결도</th><th class="num">통합도</th><th class="num">평균깊이</th></tr></thead><tbody>
    ${sorted
      .map(
        (n) => `<tr><td><span class="swatch" style="background:${n.depth === null ? 'var(--surface-3)' : depthVar(n.depth)}"></span>${esc(n.type)}${n.duct ? ' <span class="note">덕트</span>' : ''}</td>
        <td class="num">${n.depth ?? '–'}</td><td class="num">${n.connectivity}</td>
        <td class="num">${n.integration ? n.integration.toFixed(2) : '–'}</td><td class="num">${n.meanDepth ? n.meanDepth.toFixed(2) : '–'}</td></tr>`,
      )
      .join('')}</tbody></table></div>`;
  return `<div class="panel"><h3>공간구문 그래프<small>현관 기준 정렬 그래프(J-graph)</small></h3>
    <svg class="jgraph" viewBox="0 0 ${W} ${H}" role="img" aria-label="현관을 뿌리로 한 정렬 그래프">${axis}${edges}${circles}</svg>${table}</div>`;
}

function summaryPanel(analysis) {
  const counts = new Map();
  for (const e of analysis.elements) {
    const key = e.subtype ? `${e.type} · ${e.subtype}` : e.type;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`)
    .join('');
  return `<div class="panel"><h3>구성 요약<small>라벨 요소 수</small></h3><table class="node-table"><thead><tr><th>요소</th><th class="num">개수</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---------- 시작 ----------
async function init() {
  try {
    [state.catalog, state.baseline] = await Promise.all([fetchJson('data/catalog.json'), fetchJson('data/baseline.json')]);
  } catch (err) {
    showError(err);
    return;
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setKind(t.dataset.kind)));
  $('#search').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderCards();
  });
  $('#cards').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) select(card.dataset.id);
  });
  $('#upload').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) evaluateUpload(file);
    e.target.value = '';
  });
  $('#result').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unit]');
    if (!b) return;
    state.unit = Number(b.dataset.unit);
    renderUnit();
  });
  const fromHash = decodeURIComponent(location.hash.slice(1));
  const start = state.catalog.find((d) => d.id === fromHash);
  setKind(start ? start.kind : 'SPA');
  if (start) select(start.id);
}

init();

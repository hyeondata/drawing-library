// 도면 생성 화면: 단계별 선택 → 사양 → Web Worker에서 생성·최적화 → 상위 3안 보여 주기.
import { GEN_STAGES, badges, kindsTable } from '../generate/pipeline.js';
import { FULL_LEGEND, layoutSvg } from '../generate/render.js';
import { MIN_SIDE } from '../generate/layout.js';
import { renderFormulas } from './generate-formulas.js';
import { renderDiagnosis } from './generate-diagnosis.js';
import { deviation } from '../generate/metrics.js';
import { WALL, netDims } from '../generate/net-dims.js';
import { scatterLegend, scatterPanel, spearman } from '../generate/scatter.js';
import { generatedNumber, toAihubOBJ, toAihubSPA, toAihubSTR } from '../generate/aihub.js';

const data = JSON.parse(document.getElementById('gen-data').textContent);
const { base, steps, targets, refs } = data;
const $ = (s) => document.querySelector(s);
const form = $('#gen-form');
const HANDOFF_KEY = 'floorplan-eval:image';
const RESULT = steps.length - 1;
const PREF = Object.fromEntries([...data.syntax, ...data.lifestyle].map((c) => [c.key, c]));

const state = { view: 'full', compare: null, gallery: [], timeline: null, timeAt: null, timeLane: 0, step: 0, reached: 0, bedroomsTouched: false, baseline: null, worker: null, runId: 0, seed: 1, top: [], current: 0, spec: null };

// ---------- 선택 읽기 ----------
const radio = (name) => form.querySelector(`input[name="${name}"]:checked`);
const checks = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
const labelOf = (input) => input?.closest('.gen-opt')?.querySelector('strong')?.textContent || '';

function buildSpec() {
  const area = Number(radio('area').value);
  const bedrooms = Number(radio('bedrooms').value);
  const comp = new Set(checks('composition'));
  const syntax = checks('syntax');
  const life = checks('lifestyle');
  // '공간이 넓은 게 좋아'는 거실을 한 단계 넓힌다.
  let li = data.living.findIndex((o) => o.key === radio('living').value);
  if (life.includes('spacious')) li = Math.min(data.living.length - 1, li + 1);
  const other = Number(radio('roomSize').dataset.share);
  const ratio = Number(radio('master').dataset.ratio);
  return {
    area,
    bedrooms,
    baths: comp.has('baths2') || life.includes('bath') ? 2 : 1,
    dress: comp.has('dress') || life.includes('storage'),
    multi: comp.has('multi') || life.includes('storage'),
    outdoorUnit: comp.has('outdoorUnit'),
    balcony: comp.has('balcony'),
    targets: {
      living: data.living[li].share,
      kitchen: targets.kitchen,
      master: bedrooms > 1 ? other * ratio : other * 1.6,
      other,
      bath: targets.bath,
      entrance: targets.entrance,
      dress: targets.dress,
      multi: targets.multi,
    },
    prefs: [...syntax, ...life],
    livingKey: data.living[li].key,
  };
}

function summary() {
  const parts = [labelOf(radio('area')), `거실 ${labelOf(radio('living'))}`, labelOf(radio('bedrooms')), `작은방 ${labelOf(radio('roomSize'))}`];
  const prefs = [...checks('syntax'), ...checks('lifestyle')].map((k) => PREF[k].short);
  return parts.join(' · ') + (prefs.length ? ` · ${prefs.join(', ')}` : '');
}

function updateM2() {
  const area = Number(radio('area').value);
  form.querySelectorAll('[data-share-m2]').forEach((el) => {
    el.textContent = `약 ${(Number(el.dataset.shareM2) * area).toFixed(1)}㎡`;
  });
}

// ---------- 단계 이동 ----------
function show(i, scroll = true) {
  state.step = i;
  state.reached = Math.max(state.reached, i);
  form.querySelectorAll('.gen-step').forEach((el) => (el.hidden = Number(el.dataset.step) !== i));
  document.querySelectorAll('[data-goto]').forEach((b) => {
    const k = Number(b.dataset.goto);
    b.disabled = k > state.reached;
    if (k === i) b.setAttribute('aria-current', 'step');
    else b.removeAttribute('aria-current');
    b.closest('li').classList.toggle('done', k < i);
  });
  $('#gen-prev').disabled = i === 0;
  const next = $('#gen-next');
  next.hidden = i === RESULT;
  next.textContent = i === RESULT - 1 ? '도면 만들기 →' : '다음 →';
  $('#gen-summary').textContent = summary();
  if (i === RESULT) run();
  if (scroll) document.getElementById('gen').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
$('#gen-next').addEventListener('click', () => show(Math.min(RESULT, state.step + 1)));
$('#gen-prev').addEventListener('click', () => show(Math.max(0, state.step - 1)));
document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.goto))));
form.addEventListener('submit', (e) => e.preventDefault());
form.addEventListener('change', (e) => {
  if (e.target.name === 'bedrooms') state.bedroomsTouched = true;
  if (e.target.name === 'area') {
    updateM2();
    // 평수에 흔한 침실 수를 먼저 고른다(직접 바꾼 뒤에는 그대로 둔다).
    if (!state.bedroomsTouched) {
      const b = form.querySelector(`input[name="bedrooms"][value="${e.target.dataset.bedrooms}"]`);
      if (b) b.checked = true;
    }
  }
  $('#gen-summary').textContent = summary();
  // 조건을 바꾸면 결과를 다시 만든다.
  state.top = [];
});

// ---------- 생성 ----------
async function loadBaseline() {
  if (!state.baseline) state.baseline = await (await fetch(`${base}data/baseline.json`)).json();
  return state.baseline;
}
function getWorker() {
  if (!state.worker) state.worker = new Worker(new URL('./generate-worker.js', import.meta.url), { type: 'module' });
  return state.worker;
}

async function run(seed = state.seed) {
  const spec = buildSpec();
  const same = state.spec && JSON.stringify(state.spec) === JSON.stringify(spec) && state.top.length && seed === state.seed;
  if (same) return renderResult();
  state.spec = spec;
  state.seed = seed;
  const id = ++state.runId;
  $('#gen-result').hidden = true;
  $('#gen-progress').hidden = false;
  setProgress(0, '기준 분포를 읽는 중…');
  let baseline;
  try {
    baseline = await loadBaseline();
  } catch {
    setProgress(0, '기준 분포를 읽지 못했습니다. 새로 고쳐 주세요.');
    return;
  }
  const w = getWorker();
  const t0 = performance.now();
  w.onmessage = (e) => {
    const m = e.data;
    if (m.id !== state.runId) return;
    if (m.progress !== undefined) setProgress(m.progress, `평면을 만들고 평가하는 중… ${Math.round(m.progress * 100)}%`);
    if (m.error) setProgress(0, `만들지 못했습니다: ${m.error}`);
    if (m.done) {
      state.top = m.top;
      state.gallery = m.gallery || [];
      state.timeline = m.timeline || null;
      state.timeAt = null;
      state.compare = null;
      state.current = 0;
      state.ms = performance.now() - t0;
      $('#gen-progress').hidden = true;
      renderResult();
    }
  };
  w.postMessage({ id, spec, baseline, seed });
}

// ---------- 알고리즘 비교(QUBO 풀이기) ----------
const ALGO_NAME = Object.fromEntries([...document.querySelectorAll('input[name="algo"]')].map((i) => [i.value, i.closest('label').querySelector('strong').textContent]));
const selectedAlgos = () => [...document.querySelectorAll('input[name="algo"]:checked')].map((i) => i.value);

async function runCompare(algorithms, seed) {
  const spec = buildSpec();
  const budgetMs = Number($('#gen-budget').value);
  state.spec = spec;
  state.seed = seed;
  const id = ++state.runId;
  $('#gen-result').hidden = true;
  $('#gen-progress').hidden = false;
  setProgress(0, '기준 분포를 읽는 중…');
  const baseline = await loadBaseline();
  const w = getWorker();
  const t0 = performance.now();
  w.onmessage = (e) => {
    const m = e.data;
    if (m.id !== state.runId) return;
    if (m.progress !== undefined) setProgress(m.progress, `${ALGO_NAME[m.key] || ''} 실행 중… (${Math.round(m.progress * algorithms.length) + 1}/${algorithms.length})`);
    if (m.error) setProgress(0, `만들지 못했습니다: ${m.error}`);
    if (m.done) {
      state.compare = { ...m.compare, budgetMs, seed };
      state.gallery = [];
      state.timeline = null;
      state.timeAt = null;
      state.top = m.compare.results.filter((r) => r.best).map((r) => ({ ...r.best, tabLabel: r.name, algo: r }));
      state.current = 0;
      state.ms = performance.now() - t0;
      $('#gen-progress').hidden = true;
      renderResult();
    }
  };
  w.postMessage({ type: 'compare', id, spec, baseline, seed, algorithms, budgetMs, weights: $('#gen-weights').value });
}

// QUBO 에너지와 평가 점수 산점도: 풀이기가 낸 후보(템플릿별)를 평면으로 풀어 잰 점수와 그 해의 에너지.
const FAMILY = { d2ts: 'tabu', pr: 'tabu', memetic: 'tabu', tabu: 'tabu', sa: 'stoch', sqa: 'stoch', pt: 'stoch', sb: 'stoch', cpsat: 'exact', exact: 'exact' };
const FAMILY_STYLE = {
  tabu: { color: 'var(--cat-1)', label: 'tabu 계열(D²TS·PR·Memetic·Tabu)' },
  stoch: { color: 'var(--cat-2)', label: '확률적(SA·SQA·PT·SB)' },
  exact: { color: 'var(--cat-3)', label: '전역 최적해 보장(CP-SAT 방식·열거)' },
};
function renderScatter(cmp) {
  const box = $('#gen-scatter');
  if (!box) return;
  const pts = cmp.scatter || [];
  if (!pts.length) {
    box.innerHTML = '';
    return;
  }
  const mode = state.scMode || 'J';
  const yOf = (p) => (mode === 'J' ? p[2] : p[4]);
  const nameOf = Object.fromEntries(cmp.results.map((r) => [r.key, r.name]));
  const bestJ = Math.max(...pts.map((p) => p[2]));
  const tpls = [...new Set(pts.map((p) => p[0]))].sort((a, b) => a - b);
  const panels = tpls.map((k) => {
    const pp = pts.filter((p) => p[0] === k);
    const rho = pp.length >= 4 ? spearman(pp.map((p) => p[1]), pp.map(yOf)) : null;
    const points = pp.map((p) => ({ x: p[1], y: yOf(p), group: FAMILY[p[3]] || 'tabu', shape: FAMILY[p[3]] === 'stoch' ? 'tri' : FAMILY[p[3]] === 'exact' ? 'sq' : 'circle', ring: p[2] === bestJ, label: `${nameOf[p[3]] || p[3]} · 에너지 ${p[1].toFixed(2)} · 순위 점수 J ${p[2].toFixed(1)} · 모델 점수 ${p[4] === undefined || p[4] === null ? '–' : p[4].toFixed(1)}` }));
    return `<figure>${scatterPanel(points, FAMILY_STYLE, { title: `템플릿: 앞 침실 ${k + 1}개 (${pp.length}점)`, yLabel: mode === 'J' ? '순위 점수 J ↑' : '평가 모델 점수 ↑', rho, optimum: cmp.qubo.optimum?.[k] ?? null })}</figure>`;
  });
  const legend = scatterLegend(Object.entries(FAMILY_STYLE).map(([k, v]) => ({ color: v.color, shape: k === 'stoch' ? 'tri' : k === 'exact' ? 'sq' : 'circle', label: v.label })));
  box.innerHTML = `
    <div class="gen-process-head">
      <h4>QUBO 에너지와 평가 점수</h4>
      <div class="seg" role="group" id="sc-mode">
        <button type="button" data-v="J" aria-pressed="${mode === 'J'}">순위 점수 J</button>
        <button type="button" data-v="model" aria-pressed="${mode === 'model'}">평가 모델 점수</button>
      </div>
    </div>
    <div class="sc-panels">${panels.join('')}</div>
    ${legend}
    <p class="note">점 하나 = 풀이기가 낸 좋은 해 하나를 평면으로 풀고(연속값 ${'30'}번 다듬음) 잰 점수입니다. 가로는 그 해의 QUBO 에너지(왼쪽일수록 낮음), 세로는 점수(위일수록 좋음)입니다. QUBO가 평가 모델을 잘 대리한다면 점이 왼쪽 위에서 오른쪽 아래로 놓이고 스피어만 ρ가 음수가 됩니다. 점선은 그 템플릿의 최적 에너지, 굵은 테두리는 이번 실행에서 순위 점수가 가장 높은 안입니다. 에너지는 같은 템플릿끼리만 비교할 수 있어 템플릿별로 나눠 그렸습니다. 풀이기가 낸 해는 대부분 저에너지라 범위가 좁아 상관이 약하게 나오기 쉽습니다(전체 배치에서 잰 상관은 '방법과 근거' 4절).</p>`;
  box.querySelectorAll('#sc-mode button').forEach((b) =>
    b.addEventListener('click', () => {
      state.scMode = b.dataset.v;
      renderScatter(cmp);
    }),
  );
}

function renderCompare() {
  const box = $('#gen-compare');
  const cmp = state.compare;
  if (!cmp) {
    box.innerHTML = '';
    return;
  }
  const optOf = (k) => cmp.qubo.optimum?.[k] ?? null;
  const rows = cmp.results
    .map((r, i) => {
      const b = r.best;
      const opt = optOf(r.template);
      const isOpt = opt !== null && r.energy !== null && Math.abs(r.energy - opt) < 1e-6;
      const idx = state.top.findIndex((c) => c.algo?.key === r.key);
      return `<tr data-row="${idx}"${idx === state.current ? ' class="on"' : ''}>
        <td><b>${esc(r.name)}</b>${r.provisional ? ' <em class="gen-badge">QPU 대체·잠정</em>' : ''}<br><span class="note">${esc(r.family || '')}</span></td>
        <td class="mono">${r.energy === null ? '—' : r.energy.toFixed(2)}${isOpt ? ' <span class="good-text">최적</span>' : ''}${r.template !== null && r.template !== undefined ? `<br><span class="note">템플릿 앞 침실 ${r.template + 1}개</span>` : ''}</td>
        <td>${r.key === 'model' ? '—' : r.feasible ? '지킴' : '<span class="error-text">어김(복구)</span>'}</td>
        <td class="mono">${r.key === 'model' ? r.budget : `${Math.round(r.ms)}ms`}</td>
        <td>${b ? (b.doorIssues ? `<span class="error-text">${b.doorIssues}</span>` : '0') : '—'}</td>
      </tr>`;
    })
    .join('');
  box.innerHTML = `
    <div class="gen-cmp">
      <table class="gen-table gen-cmp-table">
        <thead><tr><th>알고리즘</th><th>QUBO 에너지 ↓</th><th>원-핫 제약</th><th>시간</th><th>문 동선 문제</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="note">
        가중치: ${cmp.qubo.weights === 'hand' ? '손으로 정한 값' : '평가 모델로 보정한 값'}. QUBO 템플릿 ${cmp.qubo.templates.length}개(앞 띠 침실 수가 다름): ${cmp.qubo.templates.map((t) => `앞 침실 ${t.k + 1}개 — 변수 ${t.n}개(앞 ${t.front.length}실×${t.front.length}칸, 뒤 ${t.back.length}실×${t.back.length}칸), 벌점 ${t.penalty}${optOf(t.k) !== null ? `, 최적 에너지 ${optOf(t.k).toFixed(2)}` : ''}`).join(' / ')}. 에너지는 같은 템플릿끼리만 비교합니다.
        풀이기마다 ${cmp.budgetMs}ms(템플릿마다 나눔)·시드 ${cmp.seed}로 한 번 돌리고, 좋은 해 최대 4개를 평면으로 풀어 깊이·폭을 30번 다듬은 뒤 가장 좋은 안을 보여 줍니다.
        <b>n = 1(한 번 실행), 통계적 비교 불가</b> — 어느 알고리즘이 낫다고 말할 수 없습니다(시드 30개 비교는 evidence/results/qubo-benchmark.md). 시드를 바꿔 다시 돌려 보세요. SA는 D-Wave QPU 결과가 나오기 전까지의 임시 대체이며 양자 어닐링 결과가 아닙니다.
      </p>
      <div class="gen-scatter" id="gen-scatter"></div>
      <button type="button" class="button-ghost small" id="gen-record">실행 기록 JSON</button>
    </div>`;
  renderScatter(cmp);
  $('#gen-record').addEventListener('click', () => {
    const record = {
      generatedAt: new Date().toISOString(),
      spec: state.spec,
      seed: cmp.seed,
      budgetMsPerSolver: cmp.budgetMs,
      qubo: cmp.qubo,
      rho: cmp.rho,
      results: cmp.results.map((r) => ({
        algorithm: r.name,
        key: r.key,
        family: r.family,
        provisional: Boolean(r.provisional),
        energy: r.energy,
        template: r.template,
        perTemplate: r.perTemplate,
        feasible: r.feasible,
        ms: r.ms,
        evals: r.evals,
        doorIssues: r.best?.doorIssues ?? null,
        order: r.best ? { front: r.best.params?.frontOrder, back: r.best.params?.backOrder } : null,
      })),
    };
    download(new Blob([JSON.stringify(record, null, 1)], { type: 'application/json' }), `qubo_compare_${state.spec.area}m2_seed${cmp.seed}.json`);
  });
  box.querySelectorAll('[data-row]').forEach((tr) =>
    tr.addEventListener('click', () => {
      const i = Number(tr.dataset.row);
      if (i >= 0) {
        state.current = i;
        renderResult();
      }
    }),
  );
}

$('#gen-all').addEventListener('click', () => document.querySelectorAll('input[name="algo"]').forEach((i) => (i.checked = true)));
$('#gen-run').addEventListener('click', () => {
  const algos = selectedAlgos();
  const seed = Math.max(1, Number($('#gen-seed').value) || 1);
  if (!algos.length) return setProgress(0, '알고리즘을 하나 이상 고르세요.');
  if (algos.length === 1 && algos[0] === 'model') {
    state.top = [];
    return run(seed);
  }
  runCompare(algos, seed);
});
$('#gen-qubo').addEventListener('click', () => {
  const w = getWorker();
  const id = ++state.runId;
  w.onmessage = (e) => {
    if (e.data.id !== id || !e.data.done) return;
    const spec = buildSpec();
    download(new Blob([JSON.stringify({ spec: { area: spec.area, bedrooms: spec.bedrooms, prefs: spec.prefs }, ...e.data.bqm }, null, 1)], { type: 'application/json' }), `floorplan_qubo_${spec.area}m2_${spec.bedrooms}bed.json`);
  };
  w.postMessage({ type: 'qubo', id, spec: buildSpec(), weights: $('#gen-weights').value });
});
function setProgress(p, text) {
  $('#gen-bar').style.width = `${Math.round(p * 100)}%`;
  $('#gen-progress-text').textContent = text;
}

// ---------- 결과 ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cites = (ids) => (ids?.length ? `<span class="cites">${ids.map((id) => `<a class="cite" href="${refs[id].url}" target="_blank" rel="noopener">${esc(refs[id].short)}</a>`).join('')}</span>` : '');
const bar = (score) => `<span class="gen-meter" role="img" aria-label="${Math.round(score)}점"><i style="width:${Math.max(0, Math.min(100, score))}%"></i></span>`;
const titleOf = (spec, i) => `${spec.area}㎡ · 방 ${spec.bedrooms}개 · ${state.top[i]?.tabLabel || `${i + 1}안`}`;

function renderResult() {
  const { top, spec } = state;
  if (!top.length) {
    $('#gen-plan').innerHTML = '';
    $('#gen-detail').innerHTML = '<p class="error-text">조건을 만족하는 평면을 만들지 못했습니다. 방 개수나 구성을 줄여 보세요.</p>';
    $('#gen-result').hidden = false;
    return;
  }
  $('#gen-tabs').innerHTML = top
    .map((c, i) => `<button type="button" role="tab" data-cand="${i}" aria-pressed="${i === state.current}" aria-selected="${i === state.current}">${esc(c.tabLabel || `${i + 1}안`)}</button>`)
    .join('');
  $('#gen-tabs').querySelectorAll('[data-cand]').forEach((b) =>
    b.addEventListener('click', () => {
      state.current = Number(b.dataset.cand);
      state.timeFollowTab = true;
      renderResult();
    }),
  );
  renderCompare();
  const c = top[state.current];
  const legend = state.view === 'full'
    ? `<ul class="ex-legend gen-legend" aria-label="범례">${FULL_LEGEND.map((l) => `<li><i style="background:${l.fill};border-color:${l.stroke ?? l.fill}"></i>${esc(l.label)}</li>`).join('')}</ul>`
    : '';
  $('#gen-plan').innerHTML = `${layoutSvg(c.layout, { title: titleOf(spec, state.current), mode: state.view, dims: state.dims || 'center' })}${legend}<figcaption class="note">전용 ${(c.layout.W * c.layout.D).toFixed(1)}㎡ (${(c.layout.W).toFixed(2)} × ${c.layout.D.toFixed(2)}m) · ${top.length}안 중 ${state.current + 1}번째 · 후보 ${state.ms ? `${Math.round(state.ms / 100) / 10}초` : ''}</figcaption>`;

  const m2 = (share) => share * spec.area;
  const rows = [
    ['거실', m2(spec.targets.living), c.actual.living],
    ['주방/식당', m2(spec.targets.kitchen), c.actual.kitchen],
    ['안방', m2(spec.targets.master), c.actual.master],
    ...(c.actual.other !== null ? [['작은방(평균)', m2(spec.targets.other), c.actual.other]] : []),
  ]
    .map(([n, t, a]) => {
      const dv = deviation(t, a);
      const cls = dv.level === 'good' ? 'good-text' : dv.level === 'warn' ? 'warn-text' : 'error-text';
      const w = Math.min(50, Math.abs(dv.pct) * 2.5);
      return `<tr><td>${n}</td><td class="mono">${t.toFixed(1)}</td><td class="mono">${a.toFixed(1)}</td><td class="mono"><span class="${cls}">${dv.pct >= 0 ? '+' : ''}${dv.pct.toFixed(1)}%</span><span class="gen-devbar" aria-hidden="true"><i class="gen-devband"></i><i class="gen-dev ${dv.level}" style="${dv.pct >= 0 ? 'left:50%' : `left:${50 - w}%`};width:${w}%"></i></span></td></tr>`;
    })
    .join('');
  const indoor = c.layout.rooms.filter((r) => r.type !== '발코니' && r.type !== '실외기실');
  const net = netDims(c.layout);
  const roomRows = [...c.layout.rooms]
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .map((r) => `<tr><td>${esc(r.name)}</td><td class="mono">${r.w.toFixed(2)} × ${r.h.toFixed(2)}</td><td class="mono">${(r.w * r.h).toFixed(1)}</td><td class="mono">${net[r.key].nw.toFixed(2)} × ${net[r.key].nh.toFixed(2)}</td><td class="mono">${net[r.key].area.toFixed(1)}</td></tr>`)
    .join('');
  const indoorKeys = c.layout.rooms.filter((r) => r.type !== '발코니' && r.type !== '실외기실').map((r) => r.key);
  const netSum = indoorKeys.reduce((t, k) => t + net[k].area, 0);
  const applied = [...spec.prefs.map((k) => PREF[k].title), spec.baths >= 2 ? '화장실 2개' : '화장실 1개', spec.dress ? '드레스룸' : null, spec.multi ? '다목적실' : null, spec.balcony ? '전면 발코니' : '확장형', spec.outdoorUnit ? '실외기실' : null].filter(Boolean);
  const opens = c.layout.openings || [];
  const cnt = (k) => opens.filter((o) => o.kind === k).length;
  $('#gen-detail').innerHTML = `
    <div class="gen-sumgrid">
      <div><span class="gen-k">전용면적</span><b class="mono">${(c.layout.W * c.layout.D).toFixed(1)}㎡</b></div>
      <div><span class="gen-k">폭 × 깊이</span><b class="mono">${c.layout.W.toFixed(2)} × ${c.layout.D.toFixed(2)}m</b></div>
      <div><span class="gen-k">실</span><b class="mono">${indoor.length}개</b></div>
      <div><span class="gen-k">문 · 창</span><b class="mono">${cnt('door')} · ${cnt('window') + cnt('sliding')}</b></div>
    </div>
    <p class="gen-applied">${applied.map((t) => `<span class="chip">${esc(t)}</span>`).join(' ')}</p>
    ${c.doorIssues ? `<p class="note error-text">문 동선 문제 ${c.doorIssues}개: ${esc([...c.layout.doorCheck.unreachable.map((k) => `현관에서 문으로 갈 수 없음(${k})`), ...c.layout.doorCheck.throughBedroom.map((k) => `침실을 지나야 함(${k})`)].join(', '))}</p>` : '<p class="note">문 동선: 현관에서 모든 실에 문으로 갈 수 있고, 침실을 지나야 하는 실이 없습니다.</p>'}
    ${c.narrow ? `<p class="note error-text">최소 폭(욕실 1.5m·침실 2.4m·안방 3.0m·거실 3.6m)보다 좁은 실이 ${c.narrow}개 있습니다. 방 개수나 구성을 줄여 보세요.</p>` : ''}
    <h3>목표 면적과 생성 면적</h3>
    <table class="gen-table"><thead><tr><th>실</th><th>목표 ㎡</th><th>생성 ㎡</th><th>차이(±5% 띠)</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="note">초록 ±5% 이내, 노랑 ±10% 이내, 빨강 그 밖(실무 도구 Snaptrude의 기본 허용 범위 ±5%를 참고).</p>
    <details class="gen-rooms" open><summary>실 목록(${c.layout.rooms.length}개): 중심선 치수와 안목 치수</summary>
      <table class="gen-table"><thead><tr><th>실</th><th>중심선 폭 × 깊이 m</th><th>중심선 ㎡</th><th>안목 폭 × 깊이 m</th><th>안목 ㎡</th></tr></thead><tbody>${roomRows}</tbody></table>
      <p class="note">중심선 치수는 벽 가운데선 기준, 안목 치수는 벽 두께의 절반씩을 뺀 실내 유효 치수입니다(외벽·발코니 쪽 ${WALL.rc}m, 내벽 ${WALL.inner}m, AI 허브 형식 내보내기의 벽체와 같은 규칙). 실내 안목 면적 합계 ${netSum.toFixed(1)}㎡ (중심선 전용 ${(c.layout.W * c.layout.D).toFixed(1)}㎡의 ${((netSum / (c.layout.W * c.layout.D)) * 100).toFixed(0)}%). 법정 전용면적은 벽 중심선 기준이라 중심선 값과 비교합니다.</p>
    </details>`;
  renderProcess();
  renderDiagnosis({ top, current: state.current, spec });
  renderFormulas({ spec, cand: c, weights: $('#gen-weights').value });
  renderTime();
  renderGallery();
  $('#gen-result').hidden = false;
}

function currentSvg() {
  const c = state.top[state.current];
  return layoutSvg(c.layout, { title: titleOf(state.spec, state.current), mode: state.view, dims: state.dims || 'center' });
}
const download = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const fileBase = () => `generated_${state.spec.area}m2_${state.spec.bedrooms}bed_${state.current + 1}`;
// AI 허브 Sample과 같은 형식: SPA(공간)·STR(벽체·출입문·창호)·OBJ(설비)를 따로, 파일 이름은 APT_FP_<종류>_<9자리 번호>.json
const AIHUB = { SPA: toAihubSPA, STR: toAihubSTR, OBJ: toAihubOBJ };
const numberOf = () => generatedNumber({ area: state.spec.area, bedrooms: state.spec.bedrooms, candidate: state.current + 1, seed: state.seed });
const aihub = (kind) => AIHUB[kind](state.top[state.current].layout, numberOf());
const saveAihub = (kind) => download(new Blob([JSON.stringify(aihub(kind))], { type: 'application/json' }), `APT_FP_${kind}_${numberOf()}.json`);
document.querySelectorAll('[data-aihub]').forEach((b) =>
  b.addEventListener('click', () => {
    if (b.dataset.aihub === 'ALL') ['SPA', 'STR', 'OBJ'].forEach((k, i) => setTimeout(() => saveAihub(k), i * 400));
    else saveAihub(b.dataset.aihub);
  }),
);
document.querySelectorAll('[data-dims]').forEach((b) =>
  b.addEventListener('click', () => {
    state.dims = b.dataset.dims;
    document.querySelectorAll('[data-dims]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (state.top?.length) renderResult();
  }),
);
document.querySelectorAll('[data-view]').forEach((b) =>
  b.addEventListener('click', () => {
    state.view = b.dataset.view;
    document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (state.top.length) renderResult();
  }),
);
$('#gen-svg').addEventListener('click', () => download(new Blob([currentSvg()], { type: 'image/svg+xml' }), `${fileBase()}.svg`));
$('#gen-more').addEventListener('click', () => {
  if (state.compare) {
    $('#gen-seed').value = state.seed + 1;
    return runCompare(state.compare.results.map((r) => r.key), state.seed + 1);
  }
  run(state.seed + 1);
});


// ---------- 생성 과정 ----------
const STAGES = [
  ['전용면적', '사각형 잡기'],
  ['앞·뒤 띠', '남북 두 띠로 나누기'],
  ['실 배치', '어느 실이 어느 칸에'],
  ['폭 나누기', '최소 폭 먼저, 남는 폭은 비례'],
  ['복도·부속실', '얕은 방 뒤 복도, 안방 뒤 욕실·드레스룸'],
  ['문·개구부', '들어갈 쪽을 정해 문 달기'],
  ['창·발코니 문', '바깥 벽에 창'],
  ['설비', '욕실·주방 설비 놓기'],
];
const proc = { stage: 1, timer: null };
const bandsOf = (layout) => {
  const indoor = layout.rooms.filter((r) => r.type !== '발코니' && r.type !== '실외기실');
  const front = indoor.filter((r) => Math.abs(r.y + r.h - layout.D) < 1e-6 && r.type !== '기타').sort((a, b) => a.x - b.x);
  const back = indoor.filter((r) => r.y < 1e-6).sort((a, b) => a.x - b.x || a.y - b.y);
  const living = layout.rooms.find((r) => r.key === 'living');
  return { front, back, Df: living ? living.h : layout.D / 2, Db: living ? living.y : layout.D / 2 };
};
const minOf = (r) => (r.key === 'master' ? MIN_SIDE.안방 : MIN_SIDE[r.type] || 0);
function matrixSvg(rooms, label) {
  // 행 = 실, 열 = 칸(왼쪽부터). 칠한 칸 = 배정(x = 1). 위아래로 쌓인 실은 같은 칸.
  const cols = [];
  for (const r of rooms) if (!cols.some((c) => Math.abs(c - r.x) < 1e-6)) cols.push(r.x);
  const cw = 26;
  const rh = 20;
  const L = 74;
  const W = L + cols.length * cw + 4;
  const H = 18 + rooms.length * rh + 4;
  let g = `<text x="${L}" y="12" font-size="11" fill="var(--text-muted)">${label} 칸 →</text>`;
  rooms.forEach((r, i) => {
    g += `<text x="${L - 6}" y="${18 + i * rh + 14}" font-size="11" text-anchor="end" fill="var(--text-secondary)">${esc(r.name)}</text>`;
    cols.forEach((cx, j) => {
      const on = Math.abs(cx - r.x) < 1e-6;
      g += `<rect x="${L + j * cw + 1}" y="${18 + i * rh + 1}" width="${cw - 2}" height="${rh - 2}" rx="3" fill="${on ? 'var(--accent)' : 'var(--surface-2)'}"><title>${esc(r.name)} · ${j + 1}번 칸${on ? ' (배정)' : ''}</title></rect>`;
      if (on) g += `<text x="${L + j * cw + cw / 2}" y="${18 + i * rh + 14}" font-size="11" text-anchor="middle" fill="#fff" font-weight="700">1</text>`;
    });
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="gen-matrix" role="img" aria-label="${label} 배정 행렬">${g}</svg>`;
}
function widthSvg(rooms, total, label) {
  // 한 띠의 폭 나누기: 진한 부분 = 최소 폭, 옅은 부분 = 남는 폭에서 받은 몫
  const cols = [];
  for (const r of rooms) if (!cols.some((c) => Math.abs(c.x - r.x) < 1e-6)) cols.push(r);
  const Wpx = 560;
  const k = Wpx / total;
  const H = 46;
  let g = `<text x="0" y="11" font-size="11" fill="var(--text-muted)">${label} · 전체 ${total.toFixed(2)}m</text>`;
  cols.forEach((r, i) => {
    const x = r.x * k;
    const w = r.w * k;
    const m = Math.min(r.w, minOf(r)) * k;
    const col = `var(--series-${(i % 5) + 1})`;
    g += `<rect x="${x + 1}" y="16" width="${Math.max(1, w - 2)}" height="18" fill="${col}" fill-opacity="0.35"><title>${esc(r.name)} 폭 ${r.w.toFixed(2)}m = 최소 ${minOf(r).toFixed(1)}m + 남는 몫 ${Math.max(0, r.w - minOf(r)).toFixed(2)}m</title></rect>`;
    g += `<rect x="${x + 1}" y="16" width="${Math.max(1, m - 2)}" height="18" fill="${col}"><title>${esc(r.name)} 최소 폭 ${minOf(r).toFixed(1)}m</title></rect>`;
    if (w > 34) g += `<text x="${x + w / 2}" y="45" font-size="10" text-anchor="middle" fill="var(--text-secondary)">${esc(r.name)} ${r.w.toFixed(1)}</text>`;
  });
  return `<svg viewBox="-2 0 ${Wpx + 4} ${H + 4}" class="gen-widths" role="img" aria-label="${label} 폭 나누기">${g}</svg>`;
}
function stageText(c, stage) {
  const L = c.layout;
  const { front, back, Df, Db } = bandsOf(L);
  const opens = L.openings || [];
  const cnt = (k) => opens.filter((o) => o.kind === k).length;
  const fx = (L.fixtures || []).reduce((m, f) => ((m[f.type] = (m[f.type] || 0) + 1), m), {});
  const halls = L.rooms.filter((r) => r.type === '기타');
  const suite = L.rooms.filter((r) => r.key === 'bathMaster' || r.key === 'dress');
  const qubo = c.algo && c.algo.key !== 'model';
  switch (stage) {
    case 1:
      return `<p>전용 <b>${state.spec.area}㎡</b>를 폭 × 깊이 사각형으로 잡습니다. 깊이는 평형에 맞춘 범위(7.0~9.8m)에서 탐색으로 정하고, 폭 = 면적 ÷ 깊이입니다.</p><p class="mth-formula">폭 ${L.W.toFixed(2)}m = ${state.spec.area}㎡ ÷ 깊이 ${L.D.toFixed(2)}m</p><p class="note">${state.spec.balcony ? '앞(남)쪽에 깊이 1.5m 발코니를 붙입니다.' : '확장형이라 발코니를 두지 않습니다.'}</p>`;
    case 2:
      return `<p>사각형을 <b>앞 띠(남)</b>와 <b>뒤 띠(북)</b>로 나눕니다. 앞 띠에는 거실·안방·작은방, 뒤 띠에는 주방·현관·욕실·드레스룸이 갑니다(한국 판상형의 거실 중심 배치).</p><p class="mth-formula">앞 띠 ${Df.toFixed(2)}m + 뒤 띠 ${Db.toFixed(2)}m = 깊이 ${L.D.toFixed(2)}m (앞 띠 비율 ${(Df / L.D).toFixed(2)})</p>`;
    case 3:
      return `<p>각 띠에서 실의 순서(어느 실이 몇 번째 칸에 가는가)를 정합니다. 행 = 실, 열 = 칸이고 칠한 칸이 배정입니다(x = 1). ${qubo ? `이 안은 <b>${esc(c.algo.name)}</b>가 QUBO(실마다 칸 하나, 칸마다 실 하나 + 실 쌍 인접 항)를 풀어 나온 순서입니다.` : '이 안은 순서를 무작위로 바꿔 가며 찾은 것입니다.'}</p><div class="gen-matrices">${matrixSvg(front, '앞 띠')}${matrixSvg(back, '뒤 띠')}</div>`;
    case 4:
      return `<p>칸마다 <b>최소 폭을 먼저</b> 주고(욕실 1.5·현관 1.2·침실 2.4·안방 3.0·거실 3.6m), 남는 폭은 원하는 폭(목표 면적 ÷ 깊이)이 최소 폭을 넘는 만큼에 비례해 나눕니다. 진한 부분이 최소 폭, 옅은 부분이 남는 몫입니다.</p><p class="mth-formula">폭 = 최소 폭 + (전체 − Σ최소 폭) × 초과분 ÷ Σ초과분</p>${widthSvg(front, L.W, '앞 띠')}${widthSvg(back, L.W, '뒤 띠')}`;
    case 5:
      return `<p>${halls.length ? `작은방을 거실보다 얕게 두고 그 뒤 <b>복도 ${halls.length}곳</b>(폭 ${halls.map((h) => h.h.toFixed(2)).join('·')}m)을 만들어 침실로 들어가게 합니다.` : '작은방이 앞 띠를 꽉 채워 복도가 없습니다.'} ${suite.length ? `안방 뒤에 <b>부속실(${suite.map((r) => r.name).join('·')})</b>을 나란히 붙여 모두 안방과 맞닿게 합니다.` : ''}</p><p class="note">밝게 표시한 실이 이 단계에서 정한 실입니다.</p>`;
    case 6:
      return `<p>공용 공간(현관·거실·주방·복도)끼리는 벽 없이 트고(<b>개구부 ${cnt('opening')}곳</b>), 다른 실은 들어갈 쪽을 정해 <b>문 ${cnt('door')}개</b>를 답니다. 침실은 복도 > 거실 > 현관 > 주방 순, 부부욕실·드레스룸은 안방 쪽. 현관문은 바깥으로 엽니다.</p><p class="note">${c.doorIssues ? `문 동선 문제 ${c.doorIssues}개가 있습니다.` : '문으로 현관에서 모든 실에 갈 수 있고, 침실을 지나야 하는 실이 없습니다.'}</p>`;
    case 7:
      return `<p>거실·침실·주방·욕실의 가장 긴 바깥 벽에 <b>창 ${cnt('window')}개</b>(거실 70%, 침실 55%, 주방 45% 폭), 발코니와 맞닿은 변에 <b>발코니 문(미닫이) ${cnt('sliding')}개</b>를 냅니다.</p>`;
    default:
      return `<p>욕실에는 문에서 먼 벽을 따라 변기·세면대(공용욕실은 욕조), 주방에는 거실 맞은편 벽에 싱크대·가스레인지를 놓습니다: ${Object.entries(fx).map(([t, n]) => `${t} ${n}`).join(' · ')}.</p><p><b>완성.</b> 오른쪽 위 버튼으로 AI 허브 형식(SPA·STR·OBJ) JSON을 받을 수 있습니다.</p>`;
  }
}
function renderProcess() {
  const c = state.top[state.current];
  if (!c) return;
  const isModel = !(c.algo && c.algo.key !== 'model');
  const kindsOf = (i) => (i === 2 && isModel ? GEN_STAGES[i].modelKinds : GEN_STAGES[i].kinds);
  $('#proc-steps').innerHTML = STAGES.map(([t, sub], i) => `<li><button type="button" data-stage="${i + 1}" aria-current="${proc.stage === i + 1 ? 'step' : 'false'}"><span class="gen-num">${i + 1}</span><span><b>${t}</b><small>${sub}</small><span class="pl-mini">${badges(kindsOf(i))}</span></span></button></li>`).join('');
  $('#proc-steps').querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => setStage(Number(b.dataset.stage), true)));
  $('#proc-plan').innerHTML = layoutSvg(c.layout, { stage: proc.stage, title: `${proc.stage}. ${STAGES[proc.stage - 1][0]}` });
  $('#proc-text').innerHTML = stageText(c, proc.stage);
  $('#proc-count').textContent = `${proc.stage} / ${STAGES.length}`;
  renderMethod(c, proc.stage, isModel, kindsOf(proc.stage - 1));
}
/** 고른 단계가 어떤 규칙·알고리즘으로 이루어지는지: 방식 배지, 설명, 이 안의 값, 실제 코드. */
function renderMethod(c, stage, isModel, kinds) {
  const g = GEN_STAGES[stage - 1];
  const useModel = stage === 3 && isModel;
  const lines = (useModel ? g.modelMethod : g.method).map((m) => `<li>${m.replaceAll('{base}', base)}</li>`).join('');
  let run = '';
  if (stage === 3 && !isModel) {
    const a = c.algo;
    const tpl = a.perTemplate?.find((p) => p.k === a.template);
    run = `<p class="proc-run">이 안: 풀이기 <b>${esc(a.name)}</b>, 템플릿 앞 침실 ${a.template + 1}개, QUBO 에너지 <b>${Number(a.energy).toFixed(3)}</b>${tpl && !tpl.feasible ? ' (원-핫 제약 어김 → 규칙으로 복구)' : ''}, 예산 ${esc(a.budget || '')}.</p>`;
  }
  if ((stage === 1 || stage === 2 || stage === 4) && c.params) {
    const p = c.params;
    run = `<p class="proc-run">이 안의 탐색 결과: 깊이 D ${Number(p.depth).toFixed(2)}m · 앞 띠 비율 f ${Number(p.frontShare).toFixed(2)} · 작은방 폭 w ${Number(p.bedWidth ?? 3).toFixed(2)}m · 안방 깊이 g ${Number(p.masterDepth ?? 1).toFixed(2)}</p>`;
  }
  const tpl = document.querySelector(`template[data-proc-code="${stage}${useModel ? 'm' : ''}"]`);
  $('#proc-method').innerHTML = `<div class="proc-method-head"><b>이 단계는 어떻게 정해지나</b> ${badges(kinds)}</div><ul>${lines}</ul>${run}<details class="pl-what"><summary>배지(${kinds.map((k) => k === 'qubo' ? 'QUBO 최적화' : k === 'sa' ? '담금질 최적화' : k === 'rule' ? '규칙' : k === 'search' ? '탐색' : '평가').join('·')})는 무슨 뜻인가요?</summary>${kindsTable(kinds)}<p class="note">다섯 가지 방식 전체 비교: <a href="${base}how/#kinds">생성 원리 0절</a></p></details><details class="cd-code"><summary>실제 코드 보기</summary>${tpl ? tpl.innerHTML : ''}</details>`;
}
function setStage(k, stop = false) {
  proc.stage = Math.max(1, Math.min(STAGES.length, k));
  if (stop) stopPlay();
  renderProcess();
}
function stopPlay() {
  clearInterval(proc.timer);
  proc.timer = null;
  $('#proc-play').textContent = '▶ 자동 재생';
}
$('#proc-prev').addEventListener('click', () => setStage(proc.stage - 1, true));
$('#proc-next').addEventListener('click', () => setStage(proc.stage + 1, true));
$('#proc-play').addEventListener('click', () => {
  if (proc.timer) return stopPlay();
  if (proc.stage >= STAGES.length) proc.stage = 0;
  $('#proc-play').textContent = '❚❚ 멈춤';
  setStage(proc.stage + 1);
  proc.timer = setInterval(() => (proc.stage >= STAGES.length ? stopPlay() : setStage(proc.stage + 1)), 1600);
});

// ---------- 계산 시간에 따른 과정 ----------
// 기본 모드: 탐색 한 줄(무작위 탐색 → 다듬기), 나은 안을 찾은 순간마다 그 평면.
// 비교 모드: 알고리즘마다 한 줄(QUBO 풀이 → 평면으로 풀기·다듬기), 에너지가 낮아진 순간마다 그 해를 푼 평면.
function lanes() {
  if (state.compare)
    return state.compare.results.map((r, i) => ({
      key: r.key,
      name: r.name,
      phases: r.time?.phases || [],
      marks: r.time?.marks || [],
      final: state.top.find((c) => c.algo?.key === r.key)?.layout || null,
      tab: state.top.findIndex((c) => c.algo?.key === r.key),
      color: `var(--series-${(i % 6) + 1})`,
    }));
  const tl = state.timeline;
  if (!tl) return [];
  return [
    {
      key: 'model',
      name: '탐색',
      phases: [
        { label: '무작위 탐색', start: 0, end: tl.randomEnd },
        { label: '다듬기', start: tl.randomEnd, end: tl.total },
      ],
      marks: tl.improvements.map((m) => ({ t: m.t, layout: m.layout, note: m.phase, evals: m.evals, signature: m.signature })),
      final: state.top[0]?.layout || null,
      tab: 0,
      color: 'var(--series-1)',
    },
  ];
}
const laneEnd = (l) => Math.max(0, ...l.phases.map((p) => p.end));
function renderTime() {
  const L = lanes();
  const wrap = $('#gen-time');
  if (!L.length) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const total = Math.max(1, ...L.map(laneEnd));
  const slider = $('#time-slider');
  slider.max = Math.round(total);
  if (state.timeAt === null) state.timeAt = total;
  slider.value = Math.round(state.timeAt);
  if (state.timeLane === undefined || state.timeLane >= L.length) state.timeLane = 0;
  if (state.compare) {
    const k = state.top[state.current]?.algo?.key;
    const i = L.findIndex((l) => l.key === k);
    if (i >= 0 && state.timeFollowTab !== false) state.timeLane = i;
  }
  $('#time-note').textContent = state.compare
    ? `알고리즘을 차례로 돌린 실제 시간입니다. 진한 막대 = QUBO 풀이, 옅은 막대 = 해를 평면으로 풀고 깊이·폭을 다듬는 시간, 점 = 에너지가 낮아진 순간. 줄을 누르면 그 알고리즘의 과정을 봅니다.`
    : `평면 ${state.timeline.pace.at(-1)[1]}개를 만드는 데 걸린 실제 시간입니다. 선 = 지금까지 만든 후보 수, 점 = 더 나은 안을 찾은 순간. 시각을 옮기거나 재생하면 그 순간까지 찾은 가장 나은 안을 보여 줍니다.`;
  drawTimeChart(L, total);
  drawTimePlan(L, total);
}
function drawTimeChart(L, total) {
  const W = 760;
  const left = 150;
  const right = 16;
  const pace = !state.compare && state.timeline ? state.timeline.pace : null;
  const top = pace ? 70 : 8;
  const rowH = 26;
  const H = top + L.length * rowH + 30;
  const x = (t) => left + (t / total) * (W - left - right);
  let g = '';
  // 눈금
  const step = total > 3000 ? 1000 : total > 1200 ? 500 : total > 400 ? 200 : 100;
  for (let t = 0; t <= total + 1e-6; t += step) {
    g += `<line x1="${x(t)}" x2="${x(t)}" y1="${top - (pace ? 62 : 0)}" y2="${H - 24}" stroke="var(--line)"/>`;
    g += `<text x="${x(t)}" y="${H - 8}" font-size="11" text-anchor="middle" fill="var(--text-muted)">${(t / 1000).toFixed(t % 1000 ? 1 : 0)}초</text>`;
  }
  if (pace) {
    const maxN = pace.at(-1)[1];
    const y = (n) => top - 8 - (n / maxN) * 54;
    g += `<text x="${left - 8}" y="${y(maxN) + 4}" font-size="11" text-anchor="end" fill="var(--text-muted)">후보 ${maxN}개</text><text x="${left - 8}" y="${y(0) + 4}" font-size="11" text-anchor="end" fill="var(--text-muted)">0</text>`;
    g += `<polyline points="${pace.map(([t, n]) => `${x(t).toFixed(1)},${y(n).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--series-1)" stroke-width="2"/>`;
  }
  L.forEach((l, i) => {
    const yy = top + i * rowH;
    const on = i === state.timeLane;
    g += `<g class="gen-lane" data-lane="${i}" style="cursor:${state.compare ? 'pointer' : 'default'}">`;
    g += `<rect x="0" y="${yy}" width="${W}" height="${rowH}" fill="${on && state.compare ? 'var(--accent-soft)' : 'transparent'}"/>`;
    g += `<text x="${left - 8}" y="${yy + 17}" font-size="12" text-anchor="end" fill="var(--text-${on ? 'primary' : 'secondary'})" font-weight="${on ? 700 : 400}">${esc(l.name)}</text>`;
    for (const p of l.phases) {
      const solve = p.label.startsWith('QUBO') || p.label === '무작위 탐색';
      g += `<rect x="${x(p.start)}" y="${yy + 6}" width="${Math.max(1, x(p.end) - x(p.start) - 1)}" height="${rowH - 12}" rx="3" fill="${l.color}" fill-opacity="${solve ? 0.85 : 0.3}"><title>${esc(l.name)} · ${esc(p.label)} ${((p.end - p.start) / 1000).toFixed(2)}초</title></rect>`;
    }
    for (const m of l.marks) g += `<circle cx="${x(m.t)}" cy="${yy + rowH / 2}" r="4" fill="var(--surface-1)" stroke="var(--text-primary)" stroke-width="1.5"><title>${(m.t / 1000).toFixed(3)}초 · ${esc(m.note || '')}</title></circle>`;
    g += '</g>';
  });
  g += `<line x1="${x(state.timeAt)}" x2="${x(state.timeAt)}" y1="${top - (pace ? 62 : 4)}" y2="${H - 24}" stroke="var(--accent)" stroke-width="2"/>`;
  $('#time-chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="계산 시간 막대">${g}</svg>`;
  $('#time-chart').querySelectorAll('[data-lane]').forEach((el) =>
    el.addEventListener('click', () => {
      if (!state.compare) return;
      state.timeLane = Number(el.dataset.lane);
      state.timeFollowTab = false;
      drawTimeChart(lanes(), total);
      drawTimePlan(lanes(), total);
    }),
  );
}
function drawTimePlan(L, total) {
  const l = L[state.timeLane] || L[0];
  const t = state.timeAt;
  $('#time-now').textContent = `${(t / 1000).toFixed(2)}초 / ${(total / 1000).toFixed(2)}초`;
  const start = l.phases[0]?.start ?? 0;
  const end = laneEnd(l);
  const phase = l.phases.find((p) => t >= p.start && t <= p.end);
  const seen = l.marks.filter((m) => m.t <= t);
  const last = seen.at(-1);
  let layout = null;
  let caption = '';
  if (t < start) caption = '아직 시작 전입니다.';
  else if (t >= end && l.final) {
    layout = l.final;
    caption = state.compare ? '최종 안(해를 평면으로 풀고 깊이·폭을 다듬은 뒤)' : '최종 1안';
  } else if (last) {
    layout = last.layout;
    caption = state.compare ? `이 시각까지 찾은 에너지가 가장 낮은 해를 기본 치수로 푼 평면` : `이 시각까지 찾은 가장 나은 안`;
  } else caption = '아직 해를 찾지 못했습니다.';
  $('#time-plan').innerHTML = layout ? layoutSvg(layout, { showArea: false, title: `${(t / 1000).toFixed(2)}초 시점` }) : `<p class="note" style="padding:20px">${caption}</p>`;
  let pace = '';
  if (!state.compare && state.timeline) {
    const p = state.timeline.pace;
    const k = p.findIndex(([tt]) => tt > t);
    const n = k < 0 ? p.at(-1)[1] : k === 0 ? 0 : Math.round(p[k - 1][1] + ((t - p[k - 1][0]) / (p[k][0] - p[k - 1][0] || 1)) * (p[k][1] - p[k - 1][1]));
    pace = `<p>지금까지 만든 후보 <b>${n}개</b> (평균 초당 약 ${Math.round(p.at(-1)[1] / (p.at(-1)[0] / 1000))}개).</p>`;
  }
  const same = last && state.top[0] && !state.compare ? last.signature === state.top[0].signature : null;
  $('#time-text').innerHTML = `
    <p><b>${esc(l.name)}</b> · ${phase ? esc(phase.label) : t < start ? '대기' : '끝남'}</p>
    ${pace}
    <p>더 나은 ${state.compare ? '해(낮은 에너지)를' : '안을'} 찾은 횟수 <b>${seen.length}번</b>${last ? `, 마지막은 ${(last.t / 1000).toFixed(2)}초${last.note ? ` · ${esc(last.note)}` : ''}` : ''}.</p>
    <p class="note">${esc(caption)}${same === true ? ' — 최종 1안과 같은 배치입니다.' : same === false ? ' — 이후에 배치가 더 바뀝니다.' : ''}</p>`;
}
$('#time-slider').addEventListener('input', (e) => {
  stopTime();
  state.timeAt = Number(e.target.value);
  const L = lanes();
  const total = Math.max(1, ...L.map(laneEnd));
  drawTimeChart(L, total);
  drawTimePlan(L, total);
});
let timeAnim = null;
function stopTime() {
  if (timeAnim) cancelAnimationFrame(timeAnim);
  timeAnim = null;
  $('#time-play').textContent = '▶ 재생';
}
$('#time-play').addEventListener('click', () => {
  if (timeAnim) return stopTime();
  const L = lanes();
  const total = Math.max(1, ...L.map(laneEnd));
  if (state.timeAt >= total) state.timeAt = 0;
  const from = state.timeAt;
  const t0 = performance.now();
  const dur = 6000 * (1 - from / total) + 200; // 전체를 약 6초에 재생
  $('#time-play').textContent = '❚❚ 멈춤';
  const step = (now) => {
    state.timeAt = Math.min(total, from + ((now - t0) / dur) * (total - from));
    $('#time-slider').value = Math.round(state.timeAt);
    drawTimeChart(L, total);
    drawTimePlan(L, total);
    if (state.timeAt < total) timeAnim = requestAnimationFrame(step);
    else stopTime();
  };
  timeAnim = requestAnimationFrame(step);
});

// ---------- 탐색한 후보 ----------
function renderGallery() {
  const wrap = $('#gen-gallery-wrap');
  const g = state.gallery || [];
  if (!g.length) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const chosen = new Map(state.top.map((c, i) => [c.signature, i + 1]));
  $('#gen-gallery-note').textContent = `후보 ${g.at(-1).index}개 이상을 만드는 동안 일정 간격으로 뽑은 ${g.length}개입니다(앞쪽은 무작위 탐색, 뒤쪽은 좋은 안을 다듬는 단계). 테두리 친 것이 고른 안과 같은 배치입니다.`;
  $('#gen-gallery').innerHTML = g
    .map((it) => {
      const k = chosen.get(it.signature);
      return `<figure class="gen-thumb${k ? ' on' : ''}" title="${it.index}번째 후보 · ${it.phase}">${layoutSvg(it, { showArea: false })}<figcaption>${it.index}번째 · ${it.phase}${k ? ` · ${k}안 배치` : ''}</figcaption></figure>`;
    })
    .join('');
}

updateM2();
show(0, false);

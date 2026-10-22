// 도면 생성 화면: 단계별 선택 → 사양 → Web Worker에서 생성·최적화 → 상위 3안 보여 주기.
import { FULL_LEGEND, layoutSvg } from '../generate/render.js';
import { toFullLabel } from '../generate/layout.js';

const data = JSON.parse(document.getElementById('gen-data').textContent);
const { base, steps, targets, refs } = data;
const $ = (s) => document.querySelector(s);
const form = $('#gen-form');
const HANDOFF_KEY = 'floorplan-eval:image';
const RESULT = steps.length - 1;
const PREF = Object.fromEntries([...data.syntax, ...data.lifestyle].map((c) => [c.key, c]));

const state = { view: 'full', compare: null, step: 0, reached: 0, bedroomsTouched: false, baseline: null, worker: null, runId: 0, seed: 1, top: [], current: 0, spec: null };

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
      state.top = m.compare.results.filter((r) => r.best).map((r) => ({ ...r.best, tabLabel: r.name, algo: r }));
      state.current = 0;
      state.ms = performance.now() - t0;
      $('#gen-progress').hidden = true;
      renderResult();
    }
  };
  w.postMessage({ type: 'compare', id, spec, baseline, seed, algorithms, budgetMs, weights: $('#gen-weights').value });
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
        <td class="mono">${b ? b.model.toFixed(1) : '—'}</td>
        <td class="mono">${b ? b.objective.toFixed(1) : '—'}</td>
        <td>${b ? (b.doorIssues ? `<span class="error-text">${b.doorIssues}</span>` : '0') : '—'}</td>
      </tr>`;
    })
    .join('');
  box.innerHTML = `
    <div class="gen-cmp">
      <table class="gen-table gen-cmp-table">
        <thead><tr><th>알고리즘</th><th>QUBO 에너지 ↓</th><th>원-핫 제약</th><th>시간</th><th>모델 점수</th><th>순위 점수</th><th>문 동선 문제</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="note">
        가중치: ${cmp.qubo.weights === 'hand' ? '손으로 정한 값' : '평가 모델로 보정한 값'}. QUBO 템플릿 ${cmp.qubo.templates.length}개(앞 띠 침실 수가 다름): ${cmp.qubo.templates.map((t) => `앞 침실 ${t.k + 1}개 — 변수 ${t.n}개(앞 ${t.front.length}실×${t.front.length}칸, 뒤 ${t.back.length}실×${t.back.length}칸), 벌점 ${t.penalty}${optOf(t.k) !== null ? `, 최적 에너지 ${optOf(t.k).toFixed(2)}` : ''}`).join(' / ')}. 에너지는 같은 템플릿끼리만 비교합니다.
        풀이기마다 ${cmp.budgetMs}ms(템플릿마다 나눔)·시드 ${cmp.seed}로 한 번 돌리고, 좋은 해 최대 4개를 평면으로 풀어 연속값을 30번 다듬은 뒤 가장 좋은 안을 보여 줍니다.
        에너지와 순위 점수의 순위상관 ρ = ${cmp.rho === null ? '—' : cmp.rho.toFixed(2)}(후보 ${cmp.points}개; 음수일수록 에너지가 낮은 해가 좋은 평면).
        <b>n = 1(한 번 실행), 통계적 비교 불가</b> — 어느 알고리즘이 낫다고 말할 수 없습니다(시드 30개 비교는 evidence/results/qubo-benchmark.md). 시드를 바꿔 다시 돌려 보세요. SA는 D-Wave QPU 결과가 나오기 전까지의 임시 대체이며 양자 어닐링 결과가 아닙니다.
      </p>
      <button type="button" class="button-ghost small" id="gen-record">실행 기록 JSON</button>
    </div>`;
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
        modelScore: r.best?.model ?? null,
        objective: r.best?.objective ?? null,
        valid: r.best?.unit.validity.valid ?? null,
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
    .map((c, i) => `<button type="button" role="tab" data-cand="${i}" aria-pressed="${i === state.current}" aria-selected="${i === state.current}">${esc(c.tabLabel || `${i + 1}안`)} <span class="mono">${c.unit.score.toFixed(0)}점</span></button>`)
    .join('');
  $('#gen-tabs').querySelectorAll('[data-cand]').forEach((b) =>
    b.addEventListener('click', () => {
      state.current = Number(b.dataset.cand);
      renderResult();
    }),
  );
  renderCompare();
  const c = top[state.current];
  const legend = state.view === 'full'
    ? `<ul class="ex-legend gen-legend" aria-label="범례">${FULL_LEGEND.map((l) => `<li><i style="background:${l.fill};border-color:${l.stroke ?? l.fill}"></i>${esc(l.label)}</li>`).join('')}</ul>`
    : '';
  $('#gen-plan').innerHTML = `${layoutSvg(c.layout, { title: titleOf(spec, state.current), mode: state.view })}${legend}<figcaption class="note">전용 ${(c.layout.W * c.layout.D).toFixed(1)}㎡ (${(c.layout.W).toFixed(2)} × ${c.layout.D.toFixed(2)}m) · ${top.length}안 중 ${state.current + 1}번째 · 후보 ${state.ms ? `${Math.round(state.ms / 100) / 10}초` : ''}</figcaption>`;

  const u = c.unit;
  const groups = Object.entries(u.groups)
    .map(([, g]) => `<li><span>${esc(g.label)}</span><b class="mono">${Math.round(g.score)}</b></li>`)
    .join('');
  const failed = u.groups.rules.items.filter((r) => !r.pass);
  const prefRows = c.prefs
    .map((p) => {
      const d = PREF[p.key];
      return `<li><div class="gen-pref-head"><b>${esc(d.title)}</b><span class="mono">${Math.round(p.score)}</span></div>${bar(p.score)}<p class="note">${esc(d.metrics.join(' · '))}${cites(d.refs)}</p>${d.note ? `<p class="note">${esc(d.note)}</p>` : ''}</li>`;
    })
    .join('');
  const m2 = (share) => share * spec.area;
  const rows = [
    ['거실', m2(spec.targets.living), c.actual.living],
    ['주방/식당', m2(spec.targets.kitchen), c.actual.kitchen],
    ['안방', m2(spec.targets.master), c.actual.master],
    ...(c.actual.other !== null ? [['작은방(평균)', m2(spec.targets.other), c.actual.other]] : []),
  ]
    .map(([n, t, a]) => `<tr><td>${n}</td><td class="mono">${t.toFixed(1)}</td><td class="mono">${a.toFixed(1)}</td></tr>`)
    .join('');

  $('#gen-detail').innerHTML = `
    <div class="gen-score">
      <div><span class="gen-big mono">${u.score.toFixed(1)}</span><span class="gen-grade">${u.grade}</span></div>
      <p>평가 모델 점수 · <span class="${u.validity.valid ? 'good-text' : 'error-text'}">${u.validity.valid ? '유효한 평면' : `유효하지 않음: ${esc(u.validity.failed.join(', '))}`}</span></p>
    </div>
    <ul class="gen-groups">${groups}</ul>
    ${c.doorIssues ? `<p class="note error-text">문 동선 문제 ${c.doorIssues}개: ${esc([...c.layout.doorCheck.unreachable.map((k) => `현관에서 문으로 갈 수 없음(${k})`), ...c.layout.doorCheck.throughBedroom.map((k) => `침실을 지나야 함(${k})`)].join(', '))}</p>` : '<p class="note">문 동선: 현관에서 모든 실에 문으로 갈 수 있고, 침실을 지나야 하는 실이 없습니다.</p>'}
    ${c.narrow ? `<p class="note error-text">최소 폭(욕실 1.5m·침실 2.4m·안방 3.0m·거실 3.6m)보다 좁은 실이 ${c.narrow}개 있습니다. 평수에 비해 방이나 실이 많으면 생기니, 방 개수나 구성을 줄여 보세요.</p>` : ''}
    ${failed.length ? `<p class="note">통과하지 못한 규칙: ${failed.map((r) => `${esc(r.label)}(${esc(r.detail)})`).join(', ')}</p>` : '<p class="note">정합성 규칙을 모두 통과했습니다.</p>'}
    <h3>고른 조건에 얼마나 맞나</h3>
    <ul class="gen-prefs">
      <li><div class="gen-pref-head"><b>목표 면적 부합</b><span class="mono">${Math.round(c.fit)}</span></div>${bar(c.fit)}
        <table class="gen-table"><thead><tr><th>실</th><th>목표 ㎡</th><th>생성 ㎡</th></tr></thead><tbody>${rows}</tbody></table></li>
      ${prefRows}
    </ul>
    <p class="note">순위 점수 ${c.objective.toFixed(1)} = 모델 ${u.score.toFixed(1)} × ${c.prefs.length ? '0.45' : '0.64'} + 면적 부합 ${Math.round(c.fit)} × ${c.prefs.length ? '0.25' : '0.36'}${c.prefs.length ? ` + 선호 평균 ${Math.round(c.prefScore)} × 0.30` : ''}${c.narrow ? ` − 좁은 실 ${c.narrow}개 감점` : ''}</p>`;
  $('#gen-result').hidden = false;
}

function currentSvg() {
  const c = state.top[state.current];
  return layoutSvg(c.layout, { title: titleOf(state.spec, state.current), mode: state.view });
}
const download = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const fileBase = () => `generated_${state.spec.area}m2_${state.spec.bedrooms}bed_${state.current + 1}`;
// 실만 보기는 SPA 라벨(평가용), 모든 요소 보기는 공간+출입문·창호+설비를 함께 담은 라벨
$('#gen-json').addEventListener('click', () => {
  const c = state.top[state.current];
  const full = state.view === 'full';
  download(new Blob([JSON.stringify(full ? toFullLabel(c.layout) : c.label)], { type: 'application/json' }), `${fileBase()}_${full ? 'ALL' : 'SPA'}.json`);
});
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
$('#gen-open').addEventListener('click', () => {
  const c = state.top[state.current];
  const payload = { name: titleOf(state.spec, state.current), label: c.label, preview: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(currentSvg())}`, source: 'generate' };
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    return download(new Blob([JSON.stringify(c.label)], { type: 'application/json' }), `${fileBase()}_SPA.json`);
  }
  location.href = `${base}#image`;
});

updateM2();
show(0, false);

// QUBO 도면 생성 화면.
import { planP, formulaOf } from '../qubogen/model.js';
import { planSvg } from '../freeform/render.js';
import { badges } from '../generate/pipeline.js';

const data = JSON.parse(document.getElementById('qg-data').textContent);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f = (v, d = 2) => (Number.isFinite(v) ? Number(v).toFixed(d) : '—');


let worker = null;
let reqId = 0;
const st = { res: null, sol: 0, cur: 0, step: 4 };
const form = $('#qg-form');
const radio = (name) => form.querySelector(`input[name="${name}"]:checked`);
const checks = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
const R = () => st.res.results[st.sol];
const QA = () => st.res.QA;

/** 도면 생성 탭(generate.js buildSpec)과 같은 방식으로 조건 → 사양. */
function readSpec() {
  const area = Number(radio('area').value);
  const bedrooms = Number(radio('bedrooms').value);
  const comp = new Set(checks('composition'));
  const syntax = checks('syntax');
  const life = checks('lifestyle');
  let li = data.living.findIndex((o) => o.key === radio('living').value);
  if (life.includes('spacious')) li = Math.min(data.living.length - 1, li + 1);
  const other = Number(radio('roomSize').dataset.share);
  const ratio = Number(radio('master').dataset.ratio);
  const t = data.targets;
  return {
    area,
    bedrooms,
    baths: comp.has('baths2') || life.includes('bath') ? 2 : 1,
    dress: comp.has('dress') || life.includes('storage'),
    multi: comp.has('multi') || life.includes('storage'),
    outdoorUnit: comp.has('outdoorUnit'),
    balcony: comp.has('balcony'),
    targets: { living: data.living[li].share, kitchen: t.kitchen, master: bedrooms > 1 ? other * ratio : other * 1.6, other, bath: t.bath, entrance: t.entrance, dress: t.dress, multi: t.multi },
    prefs: [...syntax, ...life],
  };
}
// 평수를 고르면 그 주택형에서 흔한 침실 수를 먼저 고른다(도면 생성 탭과 같음)
form.querySelectorAll('input[name="area"]').forEach((r) =>
  r.addEventListener('change', () => {
    const b = form.querySelector(`input[name="bedrooms"][value="${r.dataset.bedrooms}"]`);
    if (b) b.checked = true;
  }),
);

$('#qg-form').addEventListener('submit', (e) => {
  e.preventDefault();
  worker ||= new Worker(new URL('./qubo-gen-worker.js', import.meta.url), { type: 'module' });
  const id = ++reqId;
  $('#qg-run').disabled = true;
  $('#qg-status').textContent = '단계 A QUBO를 만드는 중…';
  worker.onmessage = (m) => {
    const d = m.data;
    if (d.id !== reqId) return;
    if (d.error) {
      $('#qg-status').textContent = `오류: ${d.error}`;
      $('#qg-run').disabled = false;
      return;
    }
    if (d.start) return progStart(d);
    if (d.tick) return progTick(d);
    if (!d.done) {
      $('#qg-status').textContent = d.note || '';
      return;
    }
    progDone();
    $('#qg-run').disabled = false;
    st.res = d;
    // 점검 점수가 가장 높은 풀이기의 결과부터
    st.sol = d.results.reduce((bi, r, i, arr) => (r.cands[0].ev.score > arr[bi].cands[0].ev.score ? i : bi), 0);
    st.cur = 0;
    st.step = 4;
    $('#qg-status').textContent = `완료: 단계 A 변수 ${d.QA.n}개 · 풀이기 ${d.results.length}개`;
    render();
    $('#qg-out').hidden = false;
  };
  const solvers = checks('solver');
  if (!solvers.length) {
    $('#qg-status').textContent = '풀이기를 하나 이상 고르세요.';
    $('#qg-run').disabled = false;
    return;
  }
  worker.postMessage({ id, spec: readSpec(), cell: Number($('#qg-cell').value), solvers, budgetMs: Number($('#qg-budget').value), seed: Number($('#qg-seed').value) || 1, syntaxScale: Number($('#qg-sxs').value) });
});

function drawPlan(c, { ops = true, small = false } = {}) {
  const G = st.res.G;
  const { P, assign, names } = planP(G, Int16Array.from(c.assign), c.outCols || []);
  const m2 = (k) => (k < G.rooms.length ? c.ev.rooms[k].m2 : null);
  return planSvg(assign, P, { openings: ops ? c.ops : [], names, mode: ops ? 'full' : 'space', small, areaOf: small ? null : m2 });
}

const solName = (k) => data.solvers.find((s) => s.key === k)?.name || k;
function renderCmp() {
  const rows = st.res.results
    .map((r, i) => {
      const c = r.cands[0];
      const k = c.ev.checks;
      const viol = k.missing.length + k.split.length + k.thin.length + k.noWindow.length + k.unreachable.length + k.throughBed.length;
      return `<tr class="${i === st.sol ? 'on' : ''}"><td><button type="button" class="button-ghost small" data-sol="${i}">${esc(solName(r.solver))}</button></td><td class="mono">${f(c.eA, 2)}</td><td>${c.broken ? `<span class="error-text">${c.broken}칸 어김</span>` : '지킴'}</td><td class="mono">${viol}</td><td class="mono"><b>${f(c.ev.score, 1)}</b></td><td class="mono">${(r.A.ms / 1000).toFixed(1)}초 · ${r.A.evals.toLocaleString()}회</td></tr>`;
    })
    .join('');
  $('#qg-cmp').innerHTML = `<div class="mt-scroll"><table class="gen-table qs-tbl"><thead><tr><th>풀이기</th><th>단계 A 최저 에너지 ↓</th><th>칸마다 실 하나</th><th>규칙 위반 수</th><th>점검 점수 ↑</th><th>시간 · 평가 횟수</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">같은 QUBO·같은 시간·같은 시드. 풀이기를 누르면 그 결과를 아래에 보여 줍니다. 한 번 실행이라 통계적 비교는 아닙니다.</p>`;
  document.querySelectorAll('[data-sol]').forEach((b) =>
    b.addEventListener('click', () => {
      st.sol = Number(b.dataset.sol);
      st.cur = 0;
      render();
    }),
  );
}
function render() {
  const { G } = st.res;
  const A = { ...QA(), ...R().A, solver: R().solver };
  const cands = R().cands;
  const c = cands[st.cur];
  renderCmp();
  $('#qg-which').textContent = `— ${solName(R().solver)} · 후보 ${st.cur + 1}`;
  $('#qg-plan').innerHTML = drawPlan(c);
  const rows = c.ev.rooms
    .filter((r) => r.cells || r.target)
    .map((r) => `<tr><td>${esc(r.name)}</td><td class="mono">${f(r.target, 1)}</td><td class="mono">${f(r.m2, 1)}</td><td class="mono">${r.cells}칸</td><td>${r.comps > 1 ? '<span class="error-text">나뉨</span>' : r.cells ? '한 덩어리' : '<span class="error-text">없음</span>'}</td></tr>`)
    .join('');
  $('#qg-summary').innerHTML = `<p>격자 ${G.nx} × ${G.ny}칸(${G.cell}m), 실내 ${f(G.area, 1)}㎡ · 단계 A 에너지 <b>${f(c.eA, 2)}</b>${c.broken ? ` · <span class="error-text">원-핫 어긴 칸 ${c.broken}개</span>` : ''} · 점검 점수 <b>${f(c.ev.score, 1)}</b></p><div class="mt-scroll"><table class="gen-table qs-tbl"><thead><tr><th>실</th><th>목표 ㎡</th><th>결과 ㎡</th><th>칸</th><th>연결</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  renderSteps();
  renderTerms(c);
  renderChecks(c);
  renderSyntax(c);
  renderTrace();
  $('#qg-cands').innerHTML = cands
    .map((k, i) => `<button type="button" class="qg-cand ${i === st.cur ? 'on' : ''}" data-cand="${i}">${drawPlan(k, { small: true })}<span>후보 ${i + 1} · E ${f(k.eA, 1)} · 점검 ${f(k.ev.score, 0)}</span></button>`)
    .join('');
  document.querySelectorAll('[data-cand]').forEach((b) =>
    b.addEventListener('click', () => {
      st.cur = Number(b.dataset.cand);
      render();
    }),
  );
}

function renderSteps() {
  const c = R().cands[st.cur];
  const G = st.res.G;
  document.querySelectorAll('[data-qstep]').forEach((b) => b.setAttribute('aria-current', Number(b.dataset.qstep) === st.step ? 'step' : 'false'));
  const tpl = document.querySelector(`template[data-qstep-tpl="${st.step}"]`);
  let live = '';
  let fig = '';
  if (st.step === 1) {
    fig = gridSvg();
    live = `<p class="proc-run">격자 ${G.nx} × ${G.ny} = ${G.C}칸, 칸 ${G.cell}m, 실 ${G.rooms.length}개 → 단계 A 변수 ${G.C} × ${G.rooms.length} = <b>${QA().n}개</b>. 목표 칸 수: ${G.rooms.map((r) => `${esc(r.name)} ${f(r.t, 1)}`).join(', ')}</p>`;
  } else if (st.step === 2) {
    fig = drawPlan(c, { ops: false });
    live = `<p class="proc-run">풀이기 ${esc(data.solvers.find((s) => s.key === R().solver)?.name || R().solver)} · 변수 ${QA().n}개 · 원-핫 묶음 ${QA().groups}개 · 벌점 P = ${QA().penalty} · ${(R().A.ms / 1000).toFixed(1)}초 · 이 해의 에너지 ${f(c.eA, 2)}${c.broken ? ` · 원-핫 어긴 칸 ${c.broken}개` : ' · 원-핫 모두 지킴'}</p>`;
  } else if (st.step === 3) {
    fig = drawPlan(c);
    live = `<p class="proc-run">변수 ${c.B.n}개(${Object.entries(c.B.vars).map(([k, v]) => `${{ door: '문', entry: '현관문', opening: '개구부', window: '창', sliding: '발코니 문' }[k] || k} ${v}`).join(', ')}) · 원-핫 묶음 ${c.B.groups}개 · 벌점 P = ${c.B.penalty} · 에너지 ${f(c.B.e, 2)} · ${c.B.feasible ? '원-핫 모두 지킴' : '<span class="error-text">원-핫 어김</span>'}</p>`;
  } else {
    fig = drawPlan(c);
    live = `<p class="proc-run">점검 점수 ${f(c.ev.score, 1)} = 100 − 25·(없는 실) − 15·(나뉜 실) − 6·(좁은 실) − 10·(창 없는 거실·침실) − 15·(갈 수 없는 실) − 8·(침실을 지나야 하는 실) − 60·(면적 오차 평균). 후보 ${R().cands.length}개 중 이 점수가 가장 높은 안이 처음에 보입니다.</p>`;
  }
  $('#qg-step-plan').innerHTML = fig;
  $('#qg-step-text').innerHTML = `<div class="proc-method">${tpl ? tpl.innerHTML : ''}${live}</div>`;
}
function gridSvg() {
  const G = st.res.G;
  const S = 30;
  const W = G.nx * S;
  const H = (G.ny + G.balconyRows) * S;
  let g = '';
  for (let j = 0; j < G.ny + G.balconyRows; j++)
    for (let i = 0; i < G.nx; i++) g += `<rect x="${i * S + 1}" y="${j * S + 1}" width="${S - 2}" height="${S - 2}" fill="${j >= G.ny ? '#eceae2' : 'var(--surface-2)'}" stroke="var(--line)"/>`;
  g += `<text x="${W / 2}" y="${G.ny * S + (G.balconyRows * S) / 2 + 4}" text-anchor="middle" font-size="12" fill="#666">발코니(남)</text><text x="${W / 2}" y="-6" text-anchor="middle" font-size="12" fill="#666">뒤(북) · 현관 쪽</text>`;
  return `<svg viewBox="-4 -20 ${W + 8} ${H + 26}" role="img" aria-label="격자">${g}</svg>`;
}
document.querySelectorAll('[data-qstep]').forEach((b) =>
  b.addEventListener('click', () => {
    st.step = Number(b.dataset.qstep);
    renderSteps();
  }),
);

function renderTerms(c) {
  const A = QA();
  const head = '<thead><tr><th>규칙</th><th>QUBO 항</th><th>정확/근사</th><th>무게</th><th>항 수(일차·이차)</th><th>이 해의 에너지 기여</th></tr></thead>';
  const rowsA = data.termsA
    .map((t) => {
      const cnt = A.counts[t.id] || { lin: 0, quad: 0 };
      const w = t.id === 'onehot' ? `P = ${A.penalty}` : f(A.weights[t.id], 2);
      return `<tr><td><b>${esc(t.label)}</b><br><small>${esc(t.rule)}</small></td><td>${t.qubo}</td><td>${t.exact ? '<span class="good-text">정확</span>' : `<span class="qg-approx">근사</span>${t.note ? `<br><small>${esc(t.note)}</small>` : ''}`}</td><td class="mono">${w}</td><td class="mono">${cnt.lin.toLocaleString()} · ${cnt.quad.toLocaleString()}</td><td class="mono">${f(c.termsA[t.id], 2)}</td></tr>`;
    })
    .join('');
  const sumA = Object.values(c.termsA).reduce((s, v) => s + v, 0);
  const notes = (A.prefNotes || []).map(([k, t]) => `<li><b>${esc(data.prefNames?.[k] || k)}</b>: ${esc(t)}</li>`).join('');
  $('#qg-termsA').innerHTML = `${notes ? `<caption class="qg-cap">고른 선호로 바뀐 무게: <ul>${notes}</ul></caption>` : ''}${head}<tbody>${rowsA}<tr><td colspan="5"><b>합 = 단계 A 에너지</b></td><td class="mono"><b>${f(sumA, 2)}</b> ${Math.abs(sumA - c.eA) < 1e-6 ? '✓' : '✗'}</td></tr></tbody>`;
  const rowsB = data.termsB
    .map((t) => {
      const cnt = c.B.counts[t.id] || { lin: 0, quad: 0 };
      return `<tr><td><b>${esc(t.label)}</b><br><small>${esc(t.rule)}</small></td><td>${t.qubo}</td><td>${t.exact ? '<span class="good-text">정확</span>' : '<span class="qg-approx">근사</span>'}</td><td class="mono">${['oneDoor', 'entryDoor', 'opening'].includes(t.id) ? `P = ${c.B.penalty}` : '—'}</td><td class="mono">${cnt.lin} · ${cnt.quad}</td><td class="mono">${f(c.B.terms[t.id] ?? 0, 2)}</td></tr>`;
    })
    .join('');
  $('#qg-termsB').innerHTML = `${head}<tbody>${rowsB}</tbody>`;
}

function renderChecks(c) {
  const k = c.ev.checks;
  const row = (ok, label, detail, why) => `<tr><td>${ok ? '<span class="good-text">✓</span>' : '<span class="error-text">✗</span>'}</td><td>${label}</td><td>${detail}</td><td><small>${why}</small></td></tr>`;
  $('#qg-checks').innerHTML = `<div class="mt-scroll"><table class="gen-table qs-tbl"><thead><tr><th></th><th>규칙</th><th>결과</th><th>왜 QUBO 밖에서 점검하나</th></tr></thead><tbody>
    ${row(!c.broken, '칸마다 실 하나', c.broken ? `${c.broken}칸 어김` : '모두 지킴', 'QUBO 안에 있음(벌점). 풀이기가 못 지켰는지 확인')}
    ${row(!k.missing.length, '모든 실이 있음', k.missing.join(', ') || '모두 있음', '면적 항이 0칸을 막지만 보장은 아님')}
    ${row(!k.split.length, '실이 한 덩어리', k.split.join(', ') || '모두 한 덩어리', '"이어져 있음"은 이차식으로 쓸 수 없음(둘레 항으로 근사)')}
    ${row(!k.thin.length, '최소 폭', k.thin.join(', ') || '모두 지킴', '"가로·세로로 연속 n칸"은 이차식이 아님')}
    ${row(!k.noWindow.length, '거실·침실에 창', k.noWindow.join(', ') || '모두 있음', '단계 A의 창 항은 근사, 단계 B가 실제 창을 둠')}
    ${row(!k.unreachable.length, '현관에서 모든 실로 갈 수 있음', k.unreachable.join(', ') || '모두 갈 수 있음', '경로(그래프 도달)는 이차식이 아님')}
    ${row(!k.throughBed.length, '침실을 지나지 않고 감', k.throughBed.join(', ') || '없음', '경로 조건이라 이차식이 아님')}
    ${row(k.areaErr < 0.15, '면적 오차', `평균 ${(k.areaErr * 100).toFixed(1)}%`, '면적 항은 정확하지만 칸 단위라 오차가 남음')}
  </tbody></table></div>`;
}

function renderSyntax(c) {
  const sx = c.syntax;
  const prefs = st.res.G.spec.prefs;
  const row = (label, v, goal, pref, ref) => {
    const chosen = prefs.includes(pref);
    const ok = v !== null && v !== undefined && v >= goal;
    return `<tr><td>${label}</td><td class="mono">${v === null || v === undefined ? '—' : f(v, 2)}</td><td class="mono">${goal}</td><td>${chosen ? (ok ? '<span class="good-text">✓ 목표 이상</span>' : '<span class="qg-approx">목표 미만</span>') : '<span class="note">선호 안 고름</span>'}</td><td><small>${ref}</small></td></tr>`;
  };
  $('#qg-syntax').innerHTML = `<div class="mt-scroll"><table class="gen-table qs-tbl"><thead><tr><th>공간구문 변수</th><th>이 평면</th><th>목표</th><th>고른 선호</th><th>근거</th></tr></thead><tbody>
    ${row('거실/침실 통합도 비', sx.livingBedroomRatio, sx.goal.lbr, 'livingCentral', 'Byun & Choi 2016 거실 중심 군집 하한 1.56, 자유형 목표 1.9')}
    ${row('유전형 순서 τ', sx.genotypeTau, 0.5, 'livingCentral', 'Hillier 외 1987 (1이면 거실 > 주방 > 침실 순 통합)')}
    ${row('공·사 깊이 차', sx.privacyDepthGap, sx.goal.gap, 'privacy', 'Ham & Lee 2017, Park 외 2024 (침실이 거실·주방보다 깊게)')}
    ${row('주방/침실 통합도 비', sx.kitchenBedroomRatio, sx.goal.kbr, 'kitchenLink', 'Byun & Choi 2016 범위 하한 1.04')}
  </tbody></table></div><p class="note">평가 모델·자유형 탭과 같은 정의(맞닿은 길이 0.6m 이상인 실을 잇는 그래프에서 통합도 = 1/RRA, 깊이 = 현관에서 몇 번 건너나)로 풀고 나서 계산한 값입니다. QUBO에는 이 값 자체가 아니라 근사 항(거실이 여러 실과 닿음, 침실과 현관의 거리)만 들어 있어 목표에 못 미칠 수 있습니다. "강하게"를 고르면 더 가까워지지만 다른 규칙 위반이 생길 수 있습니다.</p>`;
}

function renderTrace() {
  const tr = R().A.trace;
  if (tr.length < 2) {
    $('#qg-trace').innerHTML = '';
    return;
  }
  const W = 640;
  const H = 160;
  const t1 = Math.max(...tr.map((p) => p[0])) || 1;
  const es = tr.map((p) => p[2]);
  const lo = Math.min(...es);
  const hi = Math.max(...es);
  const X = (t) => 50 + (t / t1) * (W - 60);
  const Y = (e) => 10 + (1 - (Math.log10(e - lo + 1) / Math.log10(hi - lo + 1 || 2))) * (H - 34);
  const d = tr.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[2]).toFixed(1)}`).join('');
  $('#qg-trace').innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="sc-svg" role="img" aria-label="시간에 따른 최저 에너지"><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2"/>${tr.map((p) => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[2]).toFixed(1)}" r="2.5" fill="var(--accent)"><title>${f(p[0], 0)}ms · 평가 ${p[1].toLocaleString()}회 · E ${f(p[2], 2)}</title></circle>`).join('')}<text x="50" y="${H - 4}" class="sc-ax">0ms</text><text x="${W - 10}" y="${H - 4}" text-anchor="end" class="sc-ax">${f(t1, 0)}ms</text><text x="4" y="16" class="sc-ax">E ${f(hi, 0)}</text><text x="4" y="${H - 22}" class="sc-ax">${f(lo, 1)}</text></svg><p class="note">최저 에너지가 바뀐 순간만 찍었습니다(세로축은 로그 눈금). 처음의 큰 값은 원-핫 벌점(칸마다 실 하나)을 어긴 상태입니다.</p>`;
}


// ---------------- 살아 있는 식: 조건이 바뀌면 식의 항·조각·무게가 생기고, 없어지고, 바뀐다 ----------------
const prevF = { A: null, B: null, meta: null };
const logItems = [];
const fmt = (v) => (Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toString());
const plain = (h) => h.replace(/<[^>]+>/g, '');

/** 항 목록 렌더(이전과 비교해 생김·없어짐·바뀜 표시). 반환: 바뀐 내용 문장들. */
function renderEq(el, stage, terms, prev) {
  const notes = [];
  const prevMap = new Map((prev || []).map((t, i) => [t.id, { ...t, i }]));
  const curIds = new Set(terms.map((t) => t.id));
  // 없어진 항도 이전 자리에 잠깐 남겨 둔다
  const merged = terms.map((t) => ({ ...t, state: prev && !prevMap.has(t.id) ? 'in' : '' }));
  if (prev)
    for (const [id, t] of prevMap)
      if (!curIds.has(id)) {
        merged.splice(Math.min(t.i, merged.length), 0, { ...t, state: 'out' });
        notes.push({ p: 0, t: `− 항 없어짐: ${t.label}` });
      }
  const rows = merged.map((t, ti) => {
    const p = prevMap.get(t.id);
    if (t.state === 'in') notes.push({ p: 0, t: `＋ 항 생김: ${t.label}${t.why?.length ? ` (${t.why.join(', ')})` : ''}` });
    const wTxt = t.wSym ? `${t.wSym}${t.w !== undefined ? `=${fmt(t.w)}` : ''}` : fmt(t.w);
    const wChg = p && t.state !== 'out' && p.w !== t.w;
    if (wChg && t.w !== undefined) notes.push({ p: t.id === 'onehot' ? 3 : 2, t: `${t.label} 무게 ${fmt(p.w)} → ${fmt(t.w)}${t.why?.length ? ` (${t.why.join(', ')})` : ''}` });
    let body;
    if (t.chips) {
      const pc = new Map((p?.chips || []).map((c, i) => [c.key, { ...c, i }]));
      const cc = new Set(t.chips.map((c) => c.key));
      let nChg = 0;
      let lastChg = '';
      const chips = t.chips.map((c) => {
        const old = pc.get(c.key);
        const st = t.state === 'in' || t.state === 'out' ? '' : !old && p ? 'in' : old && old.html !== c.html ? 'chg' : '';
        if (st === 'in') notes.push({ p: 1, t: `＋ ${t.label}: ${plain(c.html)}` });
        if (st === 'chg') ((nChg += 1), (lastChg = `${plain(old.html)} → ${plain(c.html)}`));
        return { ...c, st };
      });
      if (nChg === 1) notes.push({ p: 3, t: `${t.label}: ${lastChg}` });
      else if (nChg > 1) notes.push({ p: 3, t: `${t.label}: 조각 ${nChg}개의 숫자가 바뀜(목표·비율)` });
      if (p && t.state !== 'out')
        for (const [k, c] of pc)
          if (!cc.has(k)) {
            chips.splice(Math.min(c.i, chips.length), 0, { ...c, st: 'out' });
            notes.push({ p: 1, t: `− ${t.label}: ${plain(c.html)}` });
          }
      body = `[ ${chips.map((c) => `<span class="qf-chip ${c.st ? `qf-${c.st}` : ''}">${c.sign === '−' ? '' : ''}${c.html}</span>`).join('<span class="qf-op"> + </span>')} ]`;
    } else {
      const hChg = p && t.state !== 'out' && p.head !== t.head;
      body = `<span class="qf-chip ${hChg ? 'qf-chg' : ''}">${t.head}</span>`;
    }
    return `<div class="qf-term ${t.state ? `qf-${t.state}` : ''}"><span class="qf-op">${ti === 0 ? '' : '+'}</span><span class="qf-w ${wChg ? 'qf-chg' : ''}">${wTxt}</span><span class="qf-dot">·</span><span class="qf-body">${body}</span><span class="qf-lab">${esc(t.label)}${t.approx ? ' <em>근사</em>' : ''}${t.why?.length ? ` <i>${esc(t.why.join(', '))}</i>` : ''}</span></div>`;
  });
  el.innerHTML = `<div class="qf-E">E<sub>${stage}</sub>(x) =</div>${rows.join('')}`;
  return notes;
}

let fTimer = null;
function updateFormula() {
  const spec = readSpec();
  const F = formulaOf(spec, { cell: Number($('#qg-cell').value), syntaxScale: Number($('#qg-sxs').value) });
  const meta = { n: F.n, P: F.P, C: F.G.C, R: F.G.R, nx: F.G.nx, ny: F.G.ny };
  const pm = prevF.meta;
  const ch = (k) => (pm && pm[k] !== meta[k] ? 'qf-chg' : '');
  $('#qf-metaA').innerHTML = `격자 <b class="${ch('nx')}">${meta.nx}</b> × <b class="${ch('ny')}">${meta.ny}</b> = <b class="${ch('C')}">${meta.C}</b>칸 · 실 <b class="${ch('R')}">${meta.R}</b>개 → 변수 n = ${meta.C} × ${meta.R} = <b class="qf-big ${ch('n')}">${meta.n}</b>개 · 벌점 P<sub>A</sub> = <b class="${ch('P')}">${meta.P}</b>`;
  let notes = [];
  if (pm && pm.n !== meta.n) notes.push({ p: 1, t: `변수 ${pm.n} → ${meta.n}개` });
  if (pm && pm.P !== meta.P) notes.push({ p: 3, t: `벌점 P ${pm.P} → ${meta.P}(목적 계수가 바뀌어 다시 계산)` });
  notes.push(...renderEq($('#qf-A'), 'A', F.termsA, prevF.A).map((n) => ({ ...n, t: `[A] ${n.t}` })));
  notes.push(...renderEq($('#qf-B'), 'B', F.termsB, prevF.B).map((n) => ({ ...n, t: `[B] ${n.t}` })));
  notes = notes.sort((a, b) => a.p - b.p).map((n) => n.t);
  prevF.A = F.termsA;
  prevF.B = F.termsB;
  prevF.meta = meta;
  if (notes.length) {
    const t = new Date();
    logItems.unshift({ time: `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`, notes });
    logItems.length = Math.min(logItems.length, 12);
  }
  $('#qf-log').innerHTML = logItems.map((l, i) => `<li class="${i === 0 ? 'qf-in' : ''}"><small>${l.time}</small>${l.notes.slice(0, 8).map((n) => `<div class="${n.includes('＋') ? 'qf-add' : n.includes('− ') && !n.includes('→') ? 'qf-del' : 'qf-mod'}">${esc(n)}</div>`).join('')}${l.notes.length > 8 ? `<div class="note">외 ${l.notes.length - 8}개</div>` : ''}</li>`).join('') || '<li class="note">조건을 바꿔 보세요.</li>';
  // 없어진 조각은 애니메이션 뒤 지운다
  setTimeout(() => document.querySelectorAll('#qg-live .qf-out').forEach((e) => e.remove()), 900);
}
form.addEventListener('change', () => {
  clearTimeout(fTimer);
  fTimer = setTimeout(updateFormula, 120);
});
updateFormula();


// ---------------- 생성 진행: 막대 · 최저 에너지 그래프 · 지금까지 가장 좋은 배치 ----------------
const prog = { G: null, solvers: [], cur: -1, series: {}, rows: {} };
function progStart(d) {
  prog.G = d.G;
  prog.solvers = checks('solver');
  prog.series = {};
  prog.rows = Object.fromEntries(prog.solvers.map((k) => [k, { frac: 0, e: null, evals: 0, done: false }]));
  $('#qg-prog').hidden = false;
  $('#qp-label').textContent = `단계 A 변수 ${d.n}개 · 벌점 P = ${d.P}`;
  $('#qp-plan').innerHTML = '<figcaption>지금까지 가장 좋은 배치(단계 A)</figcaption><p class="note">풀이기가 첫 해를 찾는 중…</p>';
  drawProg();
  $('#qg-prog').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function progTick(d) {
  const row = prog.rows[d.solver];
  if (!row) return;
  row.frac = d.frac;
  row.evals = d.evals;
  if (d.e !== null && d.e !== undefined) row.e = d.e;
  if (d.stageB) row.done = true;
  row.phaseB = d.phase === 'B' ? `${d.k}/${d.of}` : row.phaseB;
  if (d.phase === 'B') return drawProg(d);
  (prog.series[d.solver] ||= []).push([d.ms, d.e]);
  prog.cur = d.si;
  if (d.assign) {
    const { P, assign, names } = planP(prog.G, Int16Array.from(d.assign), []);
    $('#qp-plan').innerHTML = `<figcaption>지금까지 가장 좋은 배치(단계 A) — ${esc(solName(d.solver))} · E ${f(d.e, 1)}${d.broken ? ` · <span class="error-text">원-핫 어긴 칸 ${d.broken}개</span>` : ' · 원-핫 지킴'}</figcaption>${planSvg(assign, P, { names, mode: 'space' })}`;
  }
  drawProg(d);
}
function progDone() {
  for (const k of Object.keys(prog.rows)) ((prog.rows[k].frac = 1), (prog.rows[k].done = true));
  drawProg();
  $('#qp-label').textContent += ' · 완료';
}
const PCOL = ['var(--cat-1, #5b3ff0)', 'var(--cat-2, #e8590c)', 'var(--cat-3, #0d7d74)', '#b42f8a', '#2a78d6', '#8a6400', '#555', '#2f7a3d'];
function drawProg(d) {
  const n = prog.solvers.length;
  const done = prog.solvers.reduce((s, k) => s + (prog.rows[k].done ? 1 : prog.rows[k].frac * 0.95), 0);
  $('#qp-fill').style.width = `${(100 * done) / n}%`;
  if (d) $('#qg-status').textContent = `${d.si + 1}/${d.total} ${solName(d.solver)} — ${d.stageB ? '단계 B(문·창)와 점검 끝' : d.phase === 'B' ? `단계 A 끝(${(d.ms / 1000).toFixed(1)}초) → 단계 B(문·창) 후보 ${d.k}/${d.of} 푸는 중` : `단계 A 푸는 중 ${(d.ms / 1000).toFixed(1)}초 · 평가 ${d.evals.toLocaleString()}회`}`;
  $('#qp-label').dataset.phase = d?.phase || '';
  $('#qp-rows').innerHTML = prog.solvers
    .map((k, i) => {
      const r = prog.rows[k];
      const state = r.done ? '완료' : r.phaseB ? `B ${r.phaseB}` : r.frac > 0 ? `A ${Math.round(r.frac * 100)}%` : '대기';
      return `<div class="qp-row"><span class="qp-dot" style="background:${PCOL[i % PCOL.length]}"></span><b>${esc(solName(k))}</b><div class="qp-mini"><div style="width:${(r.done ? 1 : r.frac) * 100}%;background:${PCOL[i % PCOL.length]}"></div></div><span class="mono">${state}</span><span class="mono">${r.e === null ? '—' : `E ${f(r.e, 1)}`}</span></div>`;
    })
    .join('');
  // 최저 에너지 그래프(로그 눈금, 풀이기별 색)
  const all = Object.values(prog.series).flat().filter((p) => p[1] !== null && p[1] !== undefined);
  if (all.length < 2) return ($('#qp-chart').innerHTML = '');
  const W = 520;
  const H = 150;
  const t1 = Math.max(...all.map((p) => p[0]), 1);
  const lo = Math.min(...all.map((p) => p[1]));
  const hi = Math.max(...all.map((p) => p[1]));
  const X = (t) => 44 + (t / t1) * (W - 54);
  const Y = (e) => 8 + (1 - Math.log10(e - lo + 1) / Math.log10(hi - lo + 1 || 2)) * (H - 30);
  const paths = prog.solvers
    .map((k, i) => {
      const ss = (prog.series[k] || []).filter((p) => p[1] !== null && p[1] !== undefined);
      return ss.length ? `<path d="${ss.map((p, j) => `${j ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('')}" fill="none" stroke="${PCOL[i % PCOL.length]}" stroke-width="2"/><circle cx="${X(ss.at(-1)[0])}" cy="${Y(ss.at(-1)[1])}" r="4" fill="${PCOL[i % PCOL.length]}"/>` : '';
    })
    .join('');
  $('#qp-chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="sc-svg" role="img" aria-label="지금까지 최저 에너지">${paths}<text x="44" y="${H - 4}" class="sc-ax">0초</text><text x="${W - 10}" y="${H - 4}" text-anchor="end" class="sc-ax">${(t1 / 1000).toFixed(1)}초</text><text x="2" y="14" class="sc-ax">${f(hi, 0)}</text><text x="2" y="${H - 22}" class="sc-ax">${f(lo, 1)}</text></svg><p class="note">세로축: 지금까지 찾은 최저 에너지(로그 눈금, 낮을수록 좋음). 처음의 큰 값은 "칸마다 실 하나" 벌점을 어긴 상태이고, 벌점이 사라지면 크게 떨어집니다.</p>`;
}

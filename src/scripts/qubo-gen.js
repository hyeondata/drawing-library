// QUBO 도면 생성 화면.
import { planP } from '../qubogen/model.js';
import { planSvg } from '../freeform/render.js';
import { badges } from '../generate/pipeline.js';

const data = JSON.parse(document.getElementById('qg-data').textContent);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f = (v, d = 2) => (Number.isFinite(v) ? Number(v).toFixed(d) : '—');
const TARGETS = { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 };

let worker = null;
let reqId = 0;
const st = { res: null, cur: 0, step: 4 };

function readSpec() {
  return {
    area: Number($('#qg-area').value),
    bedrooms: Number($('#qg-bed').value),
    baths: Number($('#qg-bath').value),
    dress: $('#qg-dress').checked,
    multi: $('#qg-multi').checked,
    outdoorUnit: false,
    balcony: true,
    targets: TARGETS,
    prefs: [...document.querySelectorAll('input[name="qg-pref"]:checked')].map((e) => e.value),
  };
}

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
    if (!d.done) {
      $('#qg-status').textContent = d.note || '';
      return;
    }
    $('#qg-run').disabled = false;
    st.res = d;
    st.cur = 0;
    st.step = 4;
    $('#qg-status').textContent = `완료: 단계 A 변수 ${d.A.n}개, ${(d.A.ms / 1000).toFixed(1)}초, 평가 ${d.A.evals.toLocaleString()}회 · 후보 ${d.cands.length}개`;
    render();
    $('#qg-out').hidden = false;
  };
  worker.postMessage({ id, spec: readSpec(), cell: Number($('#qg-cell').value), solver: $('#qg-solver').value, budgetMs: Number($('#qg-budget').value), seed: Number($('#qg-seed').value) || 1 });
});

function drawPlan(c, { ops = true, small = false } = {}) {
  const G = st.res.G;
  const { P, assign, names } = planP(G, Int16Array.from(c.assign));
  const m2 = (k) => (k < G.rooms.length ? c.ev.rooms[k].m2 : null);
  return planSvg(assign, P, { openings: ops ? c.ops : [], names, mode: ops ? 'full' : 'space', small, areaOf: small ? null : m2 });
}

function render() {
  const { G, A, cands } = st.res;
  const c = cands[st.cur];
  $('#qg-plan').innerHTML = drawPlan(c);
  const rows = c.ev.rooms
    .filter((r) => r.cells || r.target)
    .map((r) => `<tr><td>${esc(r.name)}</td><td class="mono">${f(r.target, 1)}</td><td class="mono">${f(r.m2, 1)}</td><td class="mono">${r.cells}칸</td><td>${r.comps > 1 ? '<span class="error-text">나뉨</span>' : r.cells ? '한 덩어리' : '<span class="error-text">없음</span>'}</td></tr>`)
    .join('');
  $('#qg-summary').innerHTML = `<p>격자 ${G.nx} × ${G.ny}칸(${G.cell}m), 실내 ${f(G.area, 1)}㎡ · 단계 A 에너지 <b>${f(c.eA, 2)}</b>${c.broken ? ` · <span class="error-text">원-핫 어긴 칸 ${c.broken}개</span>` : ''} · 점검 점수 <b>${f(c.ev.score, 1)}</b></p><div class="mt-scroll"><table class="gen-table qs-tbl"><thead><tr><th>실</th><th>목표 ㎡</th><th>결과 ㎡</th><th>칸</th><th>연결</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  renderSteps();
  renderTerms(c);
  renderChecks(c);
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
  const c = st.res.cands[st.cur];
  const G = st.res.G;
  document.querySelectorAll('[data-qstep]').forEach((b) => b.setAttribute('aria-current', Number(b.dataset.qstep) === st.step ? 'step' : 'false'));
  const tpl = document.querySelector(`template[data-qstep-tpl="${st.step}"]`);
  let live = '';
  let fig = '';
  if (st.step === 1) {
    fig = gridSvg();
    live = `<p class="proc-run">격자 ${G.nx} × ${G.ny} = ${G.C}칸, 칸 ${G.cell}m, 실 ${G.rooms.length}개 → 단계 A 변수 ${G.C} × ${G.rooms.length} = <b>${st.res.A.n}개</b>. 목표 칸 수: ${G.rooms.map((r) => `${esc(r.name)} ${f(r.t, 1)}`).join(', ')}</p>`;
  } else if (st.step === 2) {
    fig = drawPlan(c, { ops: false });
    live = `<p class="proc-run">풀이기 ${esc(data.solvers.find((s) => s.key === st.res.A.solver)?.name || st.res.A.solver)} · 변수 ${st.res.A.n}개 · 원-핫 묶음 ${st.res.A.groups}개 · 벌점 P = ${st.res.A.penalty} · ${(st.res.A.ms / 1000).toFixed(1)}초 · 이 해의 에너지 ${f(c.eA, 2)}${c.broken ? ` · 원-핫 어긴 칸 ${c.broken}개` : ' · 원-핫 모두 지킴'}</p>`;
  } else if (st.step === 3) {
    fig = drawPlan(c);
    live = `<p class="proc-run">변수 ${c.B.n}개(${Object.entries(c.B.vars).map(([k, v]) => `${{ door: '문', entry: '현관문', opening: '개구부', window: '창', sliding: '발코니 문' }[k] || k} ${v}`).join(', ')}) · 원-핫 묶음 ${c.B.groups}개 · 벌점 P = ${c.B.penalty} · 에너지 ${f(c.B.e, 2)} · ${c.B.feasible ? '원-핫 모두 지킴' : '<span class="error-text">원-핫 어김</span>'}</p>`;
  } else {
    fig = drawPlan(c);
    live = `<p class="proc-run">점검 점수 ${f(c.ev.score, 1)} = 100 − 25·(없는 실) − 15·(나뉜 실) − 6·(좁은 실) − 10·(창 없는 거실·침실) − 15·(갈 수 없는 실) − 8·(침실을 지나야 하는 실) − 60·(면적 오차 평균). 후보 ${st.res.cands.length}개 중 이 점수가 가장 높은 안이 처음에 보입니다.</p>`;
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
  const A = st.res.A;
  const head = '<thead><tr><th>규칙</th><th>QUBO 항</th><th>정확/근사</th><th>무게</th><th>항 수(일차·이차)</th><th>이 해의 에너지 기여</th></tr></thead>';
  const rowsA = data.termsA
    .map((t) => {
      const cnt = A.counts[t.id] || { lin: 0, quad: 0 };
      const w = t.id === 'onehot' ? `P = ${A.penalty}` : f(A.weights[t.id], 2);
      return `<tr><td><b>${esc(t.label)}</b><br><small>${esc(t.rule)}</small></td><td>${t.qubo}</td><td>${t.exact ? '<span class="good-text">정확</span>' : `<span class="qg-approx">근사</span>${t.note ? `<br><small>${esc(t.note)}</small>` : ''}`}</td><td class="mono">${w}</td><td class="mono">${cnt.lin.toLocaleString()} · ${cnt.quad.toLocaleString()}</td><td class="mono">${f(c.termsA[t.id], 2)}</td></tr>`;
    })
    .join('');
  const sumA = Object.values(c.termsA).reduce((s, v) => s + v, 0);
  $('#qg-termsA').innerHTML = `${head}<tbody>${rowsA}<tr><td colspan="5"><b>합 = 단계 A 에너지</b></td><td class="mono"><b>${f(sumA, 2)}</b> ${Math.abs(sumA - c.eA) < 1e-6 ? '✓' : '✗'}</td></tr></tbody>`;
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

function renderTrace() {
  const tr = st.res.A.trace;
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

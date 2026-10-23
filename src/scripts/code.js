// 코드로 보기: 같은 예시 QUBO로 풀이기를 실제로 돌려 trace(최저 에너지가 바뀔 때마다)를 표로 보인다.
import { buildQubo, decode, energy } from '../generate/qubo.js';
import { programOf } from '../generate/layout.js';
import { runSolver } from '../generate/solvers.js';
import { anneal, buildProblem, summarize } from '../freeform/engine.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const { base } = JSON.parse($('#cd-data').textContent);

const spec = {
  area: 84,
  bedrooms: 3,
  baths: 2,
  dress: true,
  multi: false,
  outdoorUnit: false,
  balcony: true,
  targets: { living: 0.24, kitchen: 0.12, master: 0.15, other: 0.11, bath: 0.05, entrance: 0.04, dress: 0.04, multi: 0.04 },
  prefs: [],
};
const q = buildQubo(spec, { weights: 'calibrated' });
const nameOf = Object.fromEntries(programOf(spec).map((r) => [r.key, r.name]));
const opt = runSolver('exact', q, { seed: 1, budgetMs: 3000 }).energy;
const feasible = (x) => q.groups.every((g) => g.reduce((s, i) => s + x[i], 0) === 1);
const orderText = (x) => {
  const o = decode(q, x);
  return `앞 ${o.front.map((k) => nameOf[k] ?? k).join('·')} / 뒤 ${o.back.map((k) => nameOf[k] ?? k).join('·')}${o.repaired ? ' (복구)' : ''}`;
};
$('#cd-qinfo').innerHTML = `변수 <b>${q.n}</b>개(앞 띠 ${q.bands.front.rooms.length}실 × ${q.bands.front.slots}칸, 뒤 띠 ${q.bands.back.rooms.length}실 × ${q.bands.back.slots}칸), 원-핫 묶음 ${q.groups.length}개, 벌점 P = <b>${q.penalty}</b>, 정확해로 구한 최적 에너지 <b>${opt.toFixed(3)}</b>. 아래 실행은 모두 이 QUBO를 씁니다(평가 횟수 예산으로 돌려 같은 시드면 결과가 같습니다).`;

function runQubo(key, box, budget, seed) {
  const t0 = performance.now();
  const res = runSolver(key, q, { seed, budgetMs: 1000, maxEvals: budget });
  const ms = performance.now() - t0;
  const rows = res.trace
    .map(([, evals, e, x], i) => `<tr><td class="mono">${i + 1}</td><td class="mono">${evals.toLocaleString()}</td><td class="mono">${e.toFixed(3)}${Math.abs(e - opt) < 1e-9 ? ' <b class="good-text">최적</b>' : ''}</td><td>${feasible(x) ? '지킴' : '<span class="error-text">어김</span>'}</td><td>${esc(orderText(x))}</td></tr>`)
    .join('');
  const best = res.samples[0];
  box.innerHTML = `<p class="note">평가 ${res.evals.toLocaleString()}회 · 실제 ${ms.toFixed(0)}ms · 최저 에너지 <b>${res.energy?.toFixed(3) ?? '—'}</b>${res.energy !== null && Math.abs(res.energy - opt) < 1e-9 ? ' (최적 도달)' : ` (최적 ${opt.toFixed(3)}과 차이 ${(res.energy - opt).toFixed(3)})`}${res.info?.nodes ? ` · 방문 마디 ${res.info.nodes}` : ''}</p>
    <div class="mt-scroll"><table class="gen-table cd-trace"><thead><tr><th>#</th><th>평가 횟수</th><th>에너지</th><th>원-핫</th><th>그때의 배치(복구 후)</th></tr></thead><tbody>${rows || '<tr><td colspan="5">기록 없음</td></tr>'}</tbody></table></div>
    <p class="note">표의 한 줄 = 이 풀이기가 지금까지보다 낮은 에너지를 찾은 순간(runSolver의 trace). 원-핫을 어긴 해는 벌점 때문에 에너지가 큽니다. 최종 해: ${esc(best ? orderText(best.x) : '—')}.</p>`;
}

let shapes = null;
async function runFreeform(box, budget, seed) {
  shapes ||= await (await fetch(`${base}data/shapes.json`)).json();
  const u = shapes.find((x) => x.id === '037105612-1') || shapes[0];
  const P = buildProblem(u, {});
  const steps = Math.min(budget, 60000);
  const t0 = performance.now();
  const res = anneal(P, { seed, jitter: 0.5, freedom: 'L', steps, snapEvery: Math.max(1, Math.floor(steps / 12)) });
  const ms = performance.now() - t0;
  const s = summarize(res, P);
  const fmt = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k} ${(+v).toFixed(2)}`).join(' · ');
  const rows = res.history.map((h) => `<tr><td class="mono">${h.it.toLocaleString()}</td><td class="mono">${h.T !== undefined ? h.T.toFixed(4) : '—'}</td><td class="mono">${h.E.toFixed(2)}</td><td class="cd-terms">${esc(fmt(h.terms))}</td></tr>`).join('');
  box.innerHTML = `<p class="note">기준 세대 ${esc(u.id)} · 이동 ${steps.toLocaleString()}번 · 받아들인 이동 ${res.accepted.toLocaleString()}번 · ${ms.toFixed(0)}ms · 최종 에너지 <b>${s.total.toFixed(2)}</b></p>
    <div class="mt-scroll"><table class="gen-table cd-trace"><thead><tr><th>이동</th><th>온도 T</th><th>에너지 E</th><th>그 시점의 항(무게 곱하기 전)</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">anneal()의 history: 일정 간격마다 그 시점의 E와 항별 값입니다. 온도가 내려가며 면적·꼭짓점·인접 같은 항이 줄어드는 것을 볼 수 있습니다.</p>`;
}

document.querySelectorAll('.cd-run').forEach((wrap) => {
  const key = wrap.dataset.run;
  const out = $('[data-out]', wrap);
  $('[data-go]', wrap).addEventListener('click', async () => {
    const budget = Number($('[data-budget]', wrap).value);
    const seed = Number($('[data-seed]', wrap).value) || 1;
    out.innerHTML = '<p class="note">계산 중…</p>';
    await new Promise((r) => setTimeout(r, 30));
    if (key === 'freeform') await runFreeform(out, budget, seed);
    else runQubo(key, out, budget, seed);
  });
});

// ---------------- SA 한 걸음씩 ----------------
import { createSA } from '../generate/sa-explained.js';

const saBox = document.getElementById('sa-stepper');
if (saBox) {
  const vname = (i) => `${nameOf[q.vars[i].room] ?? q.vars[i].room}@${q.vars[i].band === 'front' ? '앞' : '뒤'}${q.vars[i].slot + 1}`;
  let sa = null;
  let last = null;
  let log = [];
  let curve = [];
  const reset = () => {
    sa = createSA(q, { seed: Number(document.getElementById('sa-seed').value) || 1 });
    last = null;
    log = [];
    curve = [[0, sa.E]];
    draw();
  };
  const run = (k) => {
    for (let t = 0; t < k; t++) {
      const rec = sa.step();
      if (!rec) break;
      last = rec;
      log.push(rec);
      if (log.length > 12) log.shift();
      if (sa.next === 0) curve.push([sa.sweep, sa.E]);
    }
    draw();
  };
  const matrix = () => {
    const out = [];
    for (const band of ['front', 'back']) {
      const { rooms, slots } = q.bands[band];
      const idx = (room, s) => q.vars.findIndex((v) => v.band === band && v.room === room && v.slot === s);
      const colSum = Array.from({ length: slots }, (_, s) => rooms.reduce((a, room) => a + sa.x[idx(room, s)], 0));
      out.push(`<table class="sa-mx"><caption>${band === 'front' ? '앞 띠' : '뒤 띠'}: 행 = 실, 열 = 칸</caption><thead><tr><th></th>${Array.from({ length: slots }, (_, s) => `<th>칸 ${s + 1}</th>`).join('')}<th>합</th></tr></thead><tbody>`);
      for (const room of rooms) {
        let rowSum = 0;
        out.push(`<tr><th>${esc(nameOf[room] ?? room)}</th>`);
        for (let s = 0; s < slots; s++) {
          const i = idx(room, s);
          rowSum += sa.x[i];
          const cls = [sa.x[i] ? 'on' : '', last && last.k === i ? (last.accepted ? 'flip' : 'try') : '', sa.next === i && sa.sweep < sa.sweeps ? 'next' : ''].join(' ');
          out.push(`<td class="${cls}" title="${esc(vname(i))}">${sa.x[i]}</td>`);
        }
        out.push(`<td class="sum ${rowSum === 1 ? '' : 'bad'}">${rowSum}</td></tr>`);
      }
      out.push(`<tr><th>합</th>${colSum.map((c) => `<td class="sum ${c === 1 ? '' : 'bad'}">${c}</td>`).join('')}<td></td></tr></tbody></table>`);
    }
    return out.join('');
  };
  const info = () => {
    const beta = sa.betaAt(Math.min(sa.sweep, sa.sweeps - 1));
    const ok = q.groups.every((g) => g.reduce((s, i) => s + sa.x[i], 0) === 1);
    let html = `<p><b>지금 상태</b>: sweep ${Math.min(sa.sweep, sa.sweeps)} / ${sa.sweeps}, 다음에 볼 변수 ${sa.sweep < sa.sweeps ? esc(vname(sa.next)) : '—(끝)'}<br>β = ${beta.toPrecision(3)} (온도 T = 1/β = ${(1 / beta).toPrecision(3)}) · 에너지 E = <b>${sa.E.toFixed(3)}</b> · 지금까지 최저 ${sa.best.E.toFixed(3)} · 원-핫 ${ok ? '<span class="good-text">모두 지킴</span>' : '<span class="error-text">어김(빨간 합)</span>'} · 최적 ${opt.toFixed(3)}</p>`;
    if (last) {
      const parts = [`q_kk ${last.qkk.toFixed(2)}`, ...last.couplings.map((c) => `${c.q >= 0 ? '+' : '−'} ${Math.abs(c.q).toFixed(2)}(${esc(vname(c.j))})`)].join(' ');
      html += `<div class="sa-last"><b>방금 걸음 #${last.step}</b>: 변수 <b>${esc(vname(last.k))}</b>(지금 ${last.before}) 을 뒤집으면?<br>
        Δ = (1 − 2·${last.before}) × ( ${parts} ) = <b>${last.delta.toFixed(3)}</b><br>
        ${last.delta <= 0 ? '→ Δ ≤ 0(에너지가 내려가거나 같음) → <b class="good-text">무조건 뒤집음</b>' : `→ 오르막: 받아들일 확률 p = e^(−β·Δ) = e^(−${last.beta.toPrecision(3)} × ${last.delta.toFixed(2)}) = <b>${last.p.toPrecision(3)}</b>, 난수 u = ${last.u.toFixed(4)} → ${last.accepted ? '<b class="good-text">u &lt; p 이므로 뒤집음</b>' : '<b class="error-text">u ≥ p 이므로 그대로 둠</b>'}`}<br>
        켜져 있는 다른 변수들과의 결합이 모두 Δ에 들어갑니다. 그래서 한 번에 하나를 바꿔도 25개가 함께 맞춰집니다.</div>`;
    } else html += '<p class="note">"한 걸음"을 누르면 첫 변수부터 차례로 뒤집을지 판단합니다. 시작 상태는 무작위라 원-핫을 대부분 어깁니다.</p>';
    return html;
  };
  const chart = () => {
    if (curve.length < 2) return '';
    const W = 640;
    const H = 150;
    const xs = curve.map((c) => c[0]);
    const es = curve.map((c) => c[1]);
    const x1 = Math.max(...xs) || 1;
    const lo = Math.min(...es, opt);
    const hi = Math.max(...es);
    const X = (v) => 40 + (v / x1) * (W - 50);
    const Y = (v) => 10 + (1 - (v - lo) / (hi - lo || 1)) * (H - 30);
    return `<svg viewBox="0 0 ${W} ${H}" class="sc-svg" role="img" aria-label="sweep별 에너지"><line x1="40" x2="${W - 10}" y1="${Y(opt)}" y2="${Y(opt)}" class="sc-opt"/><text x="44" y="${Y(opt) - 4}" class="sc-ax">최적 ${opt.toFixed(2)}</text><path d="${curve.map((c, i) => `${i ? 'L' : 'M'}${X(c[0]).toFixed(1)} ${Y(c[1]).toFixed(1)}`).join('')}" fill="none" stroke="var(--accent)" stroke-width="2"/><text x="40" y="${H - 4}" class="sc-ax">sweep 0</text><text x="${W - 10}" y="${H - 4}" text-anchor="end" class="sc-ax">sweep ${x1}</text><text x="4" y="14" class="sc-ax">E</text></svg>`;
  };
  const draw = () => {
    document.getElementById('sa-matrix').innerHTML = matrix();
    document.getElementById('sa-info').innerHTML = info();
    document.getElementById('sa-chart').innerHTML = chart();
    document.getElementById('sa-log').innerHTML = log.length
      ? `<div class="mt-scroll"><table class="gen-table cd-trace"><thead><tr><th>걸음</th><th>sweep</th><th>변수</th><th>Δ</th><th>β</th><th>p</th><th>결과</th><th>E</th></tr></thead><tbody>${[...log]
          .reverse()
          .map((r) => `<tr><td class="mono">${r.step}</td><td class="mono">${r.sweep}</td><td>${esc(vname(r.k))}</td><td class="mono">${r.delta.toFixed(2)}</td><td class="mono">${r.beta.toPrecision(3)}</td><td class="mono">${r.delta <= 0 ? '1' : r.p.toPrecision(3)}</td><td>${r.accepted ? '뒤집음' : '그대로'}</td><td class="mono">${r.E.toFixed(2)}</td></tr>`)
          .join('')}</tbody></table></div><p class="note">최근 12걸음. 오르막(Δ > 0)은 온도가 내려갈수록 p가 작아져 거의 받아들이지 않습니다. 원-핫을 지키는 배치에서 변수 하나를 뒤집으면 벌점 때문에 Δ가 크게 나오므로(예: +57), 후반에는 다른 배치로 건너가기 어렵습니다.</p>`
      : '';
  };
  saBox.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sa]');
    if (!b) return;
    const v = b.dataset.sa;
    if (v === 'reset') return reset();
    run(v === 'sweep' ? q.n : v === '100' ? 100 * q.n : v === 'end' ? Infinity : 1);
  });
  document.getElementById('sa-seed').addEventListener('change', reset);
  reset();
}

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

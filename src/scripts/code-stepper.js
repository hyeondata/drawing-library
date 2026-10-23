// 코드로 보기: 알고리즘을 "한 걸음씩" 따라가는 공용 화면.
// 실제 풀이기 코드(solvers.js·engine.js·optimize.js)에 넣어 둔 기록점(onEvent)이 남긴 기록을 차례로 보여 준다.
// 기록점은 계산에 영향을 주지 않는다(기록이 있든 없든 결과가 같음을 테스트로 확인).
import { runSolver } from '../generate/solvers.js';
import { anneal, buildProblem } from '../freeform/engine.js';
import { planSvg } from '../freeform/render.js';
import { optimize } from '../generate/optimize.js';
import { layoutSvg } from '../generate/render.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : Math.abs(v) >= 1e4 ? v.toExponential(2) : v.toFixed(d));
const MAX = 4000; // 저장할 기록 수(그 뒤도 계산은 계속, 기록만 생략)

export function setupSteppers({ q, nameOf, opt, base, spec, baseline }) {
  const vname = (i) => `${nameOf[q.vars[i].room] ?? q.vars[i].room}@${q.vars[i].band === 'front' ? '앞' : '뒤'}${q.vars[i].slot + 1}`;
  const feasible = (x) => q.groups.every((g) => g.reduce((s, i) => s + x[i], 0) === 1);

  /** 25개 변수 표(앞 띠·뒤 띠). mark: { 변수 번호: 'pick'|'chosen'|'try' }, pos: SB 연속 위치 */
  const matrix = (x, mark = {}, pos = null) => {
    if (!x) return '';
    const out = [];
    for (const band of ['front', 'back']) {
      const { rooms, slots } = q.bands[band];
      const idx = (room, s) => q.vars.findIndex((v) => v.band === band && v.room === room && v.slot === s);
      const col = Array.from({ length: slots }, (_, s) => rooms.reduce((a, room) => a + x[idx(room, s)], 0));
      out.push(`<table class="sa-mx"><caption>${band === 'front' ? '앞 띠' : '뒤 띠'}: 행 = 실, 열 = 칸</caption><thead><tr><th></th>${Array.from({ length: slots }, (_, s) => `<th>칸 ${s + 1}</th>`).join('')}<th>합</th></tr></thead><tbody>`);
      for (const room of rooms) {
        let row = 0;
        out.push(`<tr><th>${esc(nameOf[room] ?? room)}</th>`);
        for (let s = 0; s < slots; s++) {
          const i = idx(room, s);
          row += x[i];
          const m = mark[i];
          const cls = [x[i] ? 'on' : '', m === 'pick' ? 'flip' : m === 'try' ? 'try' : m === 'chosen' ? 'next' : ''].join(' ');
          const val = pos ? pos[i].toFixed(2) : x[i];
          const style = pos ? ` style="background:${pos[i] > 0 ? `rgba(91,63,240,${Math.min(1, Math.abs(pos[i])).toFixed(2)})` : `rgba(232,89,12,${Math.min(1, Math.abs(pos[i]) * 0.6).toFixed(2)})`};color:${Math.abs(pos[i]) > 0.5 && pos[i] > 0 ? '#fff' : 'inherit'}"` : '';
          out.push(`<td class="${pos ? '' : cls}"${style} title="${esc(vname(i))}">${val}</td>`);
        }
        out.push(`<td class="sum ${row === 1 ? '' : 'bad'}">${row}</td></tr>`);
      }
      out.push(`<tr><th>합</th>${col.map((c) => `<td class="sum ${c === 1 ? '' : 'bad'}">${c}</td>`).join('')}<td></td></tr></tbody></table>`);
    }
    return out.join('');
  };

  /** 기록 하나를 쉬운 문장으로. */
  const explain = (e) => {
    const ok = e.x ? (feasible(e.x) ? '<span class="good-text">원-핫 모두 지킴</span>' : '<span class="error-text">원-핫 어김(빨간 합)</span>') : '';
    switch (e.type) {
      case 'tabu':
        return `<b>tabu 걸음 #${e.iter}</b>: 지금 뒤집을 수 있는(막히지 않은) 변수 ${e.allowed}개 가운데 에너지 변화 Δ가 가장 작은 <b>${esc(vname(e.pick))}</b>(Δ = ${f(e.delta)})를 골라 뒤집었습니다${e.delta > 0 ? ' — 모두 오르막이어도 가장 덜 나빠지는 쪽으로 갑니다. 그래서 벌점 언덕을 넘을 수 있습니다' : ''}.<br>이 변수는 ${e.tabuUntil}걸음째까지 다시 못 뒤집습니다(tabu: 방금 온 길로 되돌아가지 않게).${e.aspiration ? ' <b>막혀 있었지만 지금까지 최고해보다 좋아져서 예외로 허용(aspiration).</b>' : ''}<br>E = <b>${f(e.e, 3)}</b>, 최고 ${f(e.best, 3)} · 개선 없이 ${e.stall}/${e.alpha}걸음이면 이번 tabu를 끝냄 · ${ok}`;
      case 'elite':
        return `<b>tabu 한 번이 끝남</b>: 결과 E = ${f(e.e, 3)}. 엘리트 집합(좋은 해 8개)의 에너지: ${e.elite.map((v) => f(v, 2)).join(', ')} · ${ok}`;
      case 'perturb':
        return `<b>다양화(섭동)</b>: 엘리트 하나(E = ${f(e.baseE, 3)})를 골라, 지금까지 자주 켜졌던 변수 위주로 γ = ${e.gamma}개(${e.chosen.map((i) => esc(vname(i))).join(', ')})를 뒤집어 새 시작점(E = ${f(e.e, 3)})을 만들었습니다. 같은 골짜기를 맴돌지 않게 하는 단계입니다. 이제 다시 tabu로 내려갑니다. · ${ok}`;
      case 'ref':
        return `<b>참조 집합 만들기 ${e.k + 1}/10</b>: 무작위 시작을 tabu로 다듬은 해 E = ${f(e.e, 3)}를 넣었습니다. 지금 참조 집합: ${e.refs.map((v) => f(v, 2)).join(', ')}`;
      case 'path-start':
        return `<b>경로 시작</b>: 참조 집합의 두 해 a(E = ${f(e.ea, 3)})와 b(E = ${f(e.eb, 3)})가 ${e.diff}개 변수에서 다릅니다. a에서 출발해 b 쪽으로 ${e.stop}개(경로의 1/3~2/3)만 맞춘 지점을 tabu로 다듬습니다. 좋은 해 둘 사이에도 좋은 해가 있다는 생각입니다.`;
      case 'path':
        return `<b>경로 ${e.step}/${e.stop}</b>: 아직 다른 변수 가운데 Δ가 가장 작은 <b>${esc(vname(e.pick))}</b>(Δ = ${f(e.delta)})를 b 쪽 값으로 바꿨습니다. E = ${f(e.e, 3)}, 남은 차이 ${e.left}개 · ${ok}`;
      case 'pop':
        return `<b>개체군 만들기 ${e.k + 1}/20</b>: 무작위 시작을 tabu로 다듬은 해 E = ${f(e.e, 3)}. 지금 개체군 최저 ${f(Math.min(...e.pop), 3)}`;
      case 'cross':
        return `<b>교차</b>: 부모 둘(E = ${f(e.ea, 3)}, ${f(e.eb, 3)})이 같은 변수 ${e.same}/${e.n}개는 그대로 물려주고, 다른 ${e.n - e.same}개는 반반 확률로 정했습니다. 자식 E = ${f(e.e, 3)}(대개 원-핫이 깨져 큼) → 바로 tabu로 다듬습니다. · ${ok}`;
      case 'read':
        return `<b>읽기 #${e.read + 1}</b>(D-Wave TabuSampler 방식): ${e.from === 'random' ? '무작위 해' : '지금까지의 최고해'}에서 시작(E = ${f(e.e, 3)}), tenure = ${e.tenure}로 20ms 동안 tabu를 합니다. 짝수 번째는 무작위, 홀수 번째는 최고해에서 시작해 넓게·깊게를 번갈아 합니다. · ${ok}`;
      case 'pt': {
        const sw = e.swaps.map((s) => `${s.k + 1}↔${s.k + 2}: p = ${f(s.p, 3)} → ${s.ok ? '<b>교환</b>' : '그대로'}`).join(' · ');
        return `<b>sweep ${e.sweep}</b>: 사본 8개가 각자 온도(β ${f(e.betas[0], 4)} 뜨거움 → ${f(e.betas[7], 1)} 차가움)에서 한 sweep씩 돌았습니다. 에너지(뜨거운 → 차가운): ${e.es.map((v) => f(v, 1)).join(', ')}.<br>이웃 교환 시도(확률 min(1, e^((β_k − β_{k+1})(E_k − E_{k+1})))): ${sw || '—'}<br>뜨거운 사본이 찾은 좋은 해가 교환을 거쳐 차가운 쪽으로 내려갑니다. 표는 가장 차가운 사본(8번)입니다. · ${ok}`;
      }
      case 'sqa':
        return `<b>t = ${e.t}/${e.sweeps}</b>: 횡자기장 Γ = ${f(e.G, 3)}, 사본 사이 결합 B = ${f(e.B, 3)}. Γ가 클 때는 B ≈ 0이라 사본 16개가 따로 움직이며 넓게 탐색하고(양자 요동 흉내), Γ가 0에 가까워지면 B가 커져 모든 사본이 같은 해로 묶입니다.<br>사본 에너지 범위: ${f(Math.min(...e.es), 2)} ~ ${f(Math.max(...e.es), 2)}. 표는 지금 가장 낮은 사본입니다. · ${ok}`;
      case 'sb':
        return `<b>t = ${e.t}/${e.steps}</b>: a(t) = ${f(e.a, 3)}. SB는 변수 25개를 <b>모두 동시에</b> 움직입니다(한 단계에 전부 갱신). 칸의 숫자는 연속 위치 x(−1 ~ 1)입니다: y ← y + (−(1 − a)x + c₀ Σ K·sgn(x))Δt, x ← x + yΔt. a가 0일 때는 0 근처에 머물다가, a가 커지면 각 x가 +1(보라) 또는 −1(주황)로 갈라집니다(분기). sgn(x) > 0을 1로 읽은 E = ${f(e.e, 3)} · ${ok}`;
      case 'node':
        return `<b>탐색 나무의 깊이 ${e.depth}/${e.slots}</b>: 칸을 앞 띠부터 하나씩 채우는 중입니다(표에서 채운 칸만 1, 아직 안 채운 칸은 합이 0으로 보임)${e.slot ? `. 다음에 채울 칸은 ${e.slot.band === 'front' ? '앞' : '뒤'} ${e.slot.s + 1}` : ''}.<br>지금까지 채운 것을 두고 남은 칸을 가장 유리하게 채운다고 가정한 <b>하한 = ${f(e.lb, 3)}</b>(실제로는 이보다 낮아질 수 없음), 지금까지 찾은 최고해 = ${f(e.best, 3)} → ${e.pruned ? '<b class="error-text">하한 ≥ 최고해: 이 아래를 다 봐도 더 좋은 해가 없으므로 가지를 잘라냄</b>' : '하한 &lt; 최고해: 더 좋은 해가 있을 수 있으므로 계속 내려감'}. 그래프는 마디별 하한입니다.`;
      case 'leaf':
        return `<b>모든 칸을 채운 배치</b>: E = ${f(e.e, 3)} ${e.improved ? '<b class="good-text">— 최고해 갱신</b>' : ''} (지금까지 최고 ${f(e.best, 3)}) · ${ok}`;
      case 'enum':
        return `<b>배정 하나 계산</b>: E = ${f(e.e, 3)}, 지금까지 최소 ${f(Math.min(e.e, e.best), 3)}. 원-핫을 지키는 모든 배정(앞 m! × 뒤 k!)을 차례로 다 계산하므로, 마지막의 최소가 곧 전역 최적해입니다. · ${ok}`;
      case 'model':
        return `<b>평가 #${e.i}</b>(${e.phase === 'random' ? '무작위 탐색' : '국소 탐색: 좋은 안의 변수를 조금 바꿈'}): 깊이 D = ${f(e.params.depth)}m, 앞 띠 비율 f = ${f(e.params.frontShare)}, 작은방 폭 w = ${f(e.params.bedWidth)}m, 안방 깊이 g = ${f(e.params.masterDepth)} → 평면을 만들어 채점. 목적함수 J = <b>${f(e.objective, 1)}</b>(평가 모델 ${f(e.model, 1)}, 면적 부합 ${f(e.fit, 1)}${e.narrow ? `, 좁은 실 ${e.narrow}개 감점` : ''}), 지금까지 최고 ${f(e.best, 1)}`;
      case 'ff-move': {
        const kind = { wall: '벽 밀기', cell: '칸 하나 넘기기', 'outline-add': '바깥 칸 붙이기', 'outline-remove': '바깥 벽 칸 떼기' }[e.kind] || e.kind;
        const rn = (k) => (k >= 0 ? `${ffP?.rooms[k]?.type ?? '실'}(${k}번)` : '바깥');
        return `<b>이동 #${e.it}</b>: ${kind} — 칸 ${e.n}개를 ${rn(e.from)}에서 ${rn(e.to)}으로. ${e.broken ? '<b class="error-text">실이 둘로 쪼개져서 바로 되돌림</b>' : `에너지 변화 ΔE = ${f(e.dE, 3)}, 온도 T = ${f(e.T, 4)}, 받아들일 확률 p = ${e.dE <= 0 ? '1(내리막)' : f(e.p, 4)} → ${e.accepted ? '<b class="good-text">받아들임</b>' : '되돌림'}`}. 지금 E = ${f(e.E, 2)}. 도면의 진한 칸이 방금 옮긴 칸입니다.`;
      }
      default:
        return esc(JSON.stringify(e).slice(0, 200));
    }
  };
  const markOf = (e) => {
    const m = {};
    if (e.type === 'tabu' || e.type === 'path') m[e.pick] = 'pick';
    if (e.type === 'perturb') for (const i of e.chosen) m[i] = 'chosen';
    return m;
  };

  let ffP = null;
  let shapes = null;

  document.querySelectorAll('.st-box').forEach((box) => {
    const key = box.dataset.st;
    const st = { events: [], total: 0, i: 0 };
    const view = box.querySelector('[data-view]');
    const slider = box.querySelector('[data-slider]');
    const draw = () => {
      const e = st.events[st.i];
      if (!e) {
        view.innerHTML = '<p class="note">기록 없음</p>';
        return;
      }
      slider.max = String(Math.max(0, st.events.length - 1));
      slider.value = String(st.i);
      const es = st.events.map((x) => x.E ?? x.e ?? x.objective).filter(Number.isFinite);
      const W = 640;
      const H = 120;
      const lo = Math.min(...es, key === 'model' || key === 'freeform' ? Infinity : opt);
      const hi = Math.max(...es);
      const Xc = (k) => 30 + (k / Math.max(1, st.events.length - 1)) * (W - 40);
      const Yc = (v) => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - 24);
      let path = '';
      st.events.forEach((x, k) => {
        const v = x.E ?? x.e ?? x.objective;
        if (Number.isFinite(v)) path += `${path ? 'L' : 'M'}${Xc(k).toFixed(1)} ${Yc(v).toFixed(1)}`;
      });
      const curV = e.E ?? e.e ?? e.objective;
      const chart = `<svg viewBox="0 0 ${W} ${H}" class="sc-svg" role="img" aria-label="기록별 값">${key !== 'model' && key !== 'freeform' ? `<line x1="30" x2="${W - 10}" y1="${Yc(opt)}" y2="${Yc(opt)}" class="sc-opt"/><text x="34" y="${Yc(opt) - 3}" class="sc-ax">최적 ${opt.toFixed(2)}</text>` : ''}<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="1.5"/>${Number.isFinite(curV) ? `<circle cx="${Xc(st.i)}" cy="${Yc(curV)}" r="5" fill="var(--accent)" stroke="var(--surface-1)" stroke-width="2"/>` : ''}<text x="30" y="${H - 2}" class="sc-ax">기록 1</text><text x="${W - 10}" y="${H - 2}" text-anchor="end" class="sc-ax">기록 ${st.events.length}${st.total > st.events.length ? ` (전체 ${st.total} 중 앞부분)` : ''}</text><text x="2" y="12" class="sc-ax">${key === 'model' ? 'J' : 'E'}</text></svg>`;
      let left = '';
      if (key === 'freeform') left = planSvg(e.assign, ffP, { mode: 'space', labels: true, mark: { cells: e.cells || [], color: e.broken ? '#c4314b' : e.accepted ? '#0f7b0f' : '#c4314b' } });
      else if (key === 'model') left = layoutSvg(e.layout, { mode: 'space' });
      else left = matrix(e.x, markOf(e), e.type === 'sb' ? e.pos : null);
      view.innerHTML = `<div class="st-pos mono">기록 ${st.i + 1} / ${st.events.length} · 평가 ${e.evals?.toLocaleString?.() ?? '—'}회</div><div class="sa-grid"><div class="st-left">${left}</div><div class="sa-last">${explain(e)}</div></div>${chart}`;
    };
    const record = async () => {
      st.events = [];
      st.total = 0;
      st.i = 0;
      view.innerHTML = '<p class="note">실행하며 기록하는 중…</p>';
      await new Promise((r) => setTimeout(r, 20));
      const seed = Number(box.querySelector('[data-seed]').value) || 1;
      const push = (e) => {
        st.total++;
        if (st.events.length < MAX) st.events.push(e);
      };
      if (key === 'freeform') {
        shapes ||= await (await fetch(`${base}data/shapes.json`)).json();
        const u = shapes.find((x) => x.id === '037105612-1') || shapes[0];
        ffP = buildProblem(u, {});
        anneal(ffP, { seed, jitter: 0.5, freedom: 'L', steps: Number(box.querySelector('[data-steps]')?.value || 3000), onEvent: push });
      } else if (key === 'model') {
        const ev = (e) => push(e);
        optimize(spec, { baseline: await baseline(), seed, random: 200, refine: 200, count: 1, onEvent: ev });
      } else runSolver(key, q, { seed, budgetMs: 1000, maxEvals: Number(box.querySelector('[data-budget]')?.value || 30000), onEvent: push });
      draw();
    };
    box.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-step]');
      if (!b) return;
      const v = b.dataset.step;
      if (v === 'rec') return record();
      if (!st.events.length) return;
      if (v === 'special') {
        // 다음 주요 단계: tabu 한 걸음·이동 같은 반복이 아닌 기록(섭동·경로 시작·교차·읽기 시작·잎·최고해 갱신 등)
        const routine = new Set(['tabu', 'ff-move', 'node', 'enum', 'sb', 'pt', 'sqa', 'model', 'path']);
        let k = st.i + 1;
        while (k < st.events.length && routine.has(st.events[k].type) && !(st.events[k].type === 'leaf' && st.events[k].improved)) k++;
        if (k < st.events.length) st.i = k;
      } else if (v === 'first') st.i = 0;
      else if (v === 'last') st.i = st.events.length - 1;
      else st.i = Math.max(0, Math.min(st.events.length - 1, st.i + Number(v)));
      draw();
    });
    slider.addEventListener('input', () => {
      st.i = Number(slider.value);
      draw();
    });
  });
}

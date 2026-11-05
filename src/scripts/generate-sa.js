// 도면 생성 결과 화면의 "SA로 풀기" 영역: 계산 시간(30초·1분·3분) 탭마다 따로 SA를 돌리고(탭마다 Worker 하나),
// 공간구문 에너지가 시간에 따라 어떻게 내려가는지와 전체 배치의 에너지 분포를 그린다. 탭마다 재생성 버튼이 있다.
import { layoutSvg } from '../generate/render.js';
import { syntaxSupported } from '../generate/syntax-gen.js';

export const SA_BUDGETS = [
  { key: '30s', ms: 30000, label: '30초' },
  { key: '1m', ms: 60000, label: '1분' },
  { key: '3m', ms: 180000, label: '3분' },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtT = (ms) => (ms < 1000 ? `${Math.round(ms)}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}초` : `${Math.floor(ms / 60000)}분 ${Math.round((ms % 60000) / 1000)}초`);

/**
 * getSpec(): 지금 고른 사양, onAdopt(tab, out, i): 이 안을 위 결과 칸에서 자세히 보기.
 */
export function createSaPanel({ root, getSpec, onAdopt }) {
  const tabs = Object.fromEntries(SA_BUDGETS.map((b) => [b.key, { ...b, worker: null, runId: 0, seed: 0, running: false, live: null, out: null, spec: null, cand: 0 }]));
  let active = SA_BUDGETS[0].key;
  const $ = (s) => root.querySelector(s);

  function workerOf(t) {
    if (!t.worker) t.worker = new Worker(new URL('./generate-worker.js', import.meta.url), { type: 'module' });
    return t.worker;
  }

  function run(key) {
    const t = tabs[key];
    const spec = getSpec();
    t.seed += 1;
    t.spec = spec;
    t.running = true;
    t.out = null;
    t.cand = 0;
    t.live = { ms: 0, budgetMs: t.ms, cur: null, best: null, trace: [], decoding: false, error: null };
    const id = ++t.runId;
    const w = workerOf(t);
    w.onmessage = (e) => {
      const m = e.data;
      if (m.id !== t.runId) return;
      if (m.tick) {
        t.live.ms = m.tick.ms;
        t.live.cur = m.tick.cur;
        t.live.best = m.tick.best;
        t.live.decoding = Boolean(m.tick.decoding);
        t.live.trace.push(...m.tick.trace);
      }
      if (m.error) (t.running = false), (t.live.error = m.error);
      if (m.done) (t.running = false), (t.out = m.sa);
      if (key === active) render();
      else renderTabs();
    };
    w.postMessage({ type: 'anneal', id, spec, seed: t.seed, budgetMs: t.ms });
    render();
  }

  function renderTabs() {
    $('#sa-tabs').innerHTML = SA_BUDGETS.map((b) => {
      const t = tabs[b.key];
      const badge = t.running ? ' · 실행 중' : t.out ? ' · 완료' : '';
      return `<button type="button" role="tab" data-sa-tab="${b.key}" aria-selected="${b.key === active}" aria-pressed="${b.key === active}">${b.label}<small>${badge}</small></button>`;
    }).join('');
    $('#sa-tabs').querySelectorAll('[data-sa-tab]').forEach((el) => el.addEventListener('click', () => ((active = el.dataset.saTab), render())));
  }

  function render() {
    renderTabs();
    const t = tabs[active];
    const btn = $('#sa-run');
    btn.textContent = t.running ? '실행 중…' : t.out || t.live?.error ? `${t.label} 다시 생성` : `${t.label} 동안 생성`;
    btn.disabled = t.running;
    const p = t.live ? Math.min(1, t.live.ms / t.ms) : 0;
    $('#sa-progress').hidden = !t.running;
    $('#sa-bar').style.width = `${Math.round(p * 100)}%`;
    $('#sa-progress-text').textContent = t.running
      ? t.live.decoding
        ? 'SA 끝 — 에너지가 낮은 배치를 평면으로 풀고 점검하는 중…'
        : `SA ${fmtT(t.live.ms)} / ${t.label}${t.live.best !== null ? ` · 지금까지 최저 에너지 ${t.live.best.toFixed(3)}` : ' · 기준(전수 열거) 계산 중'}`
      : '';
    const body = $('#sa-body');
    if (!t.live) {
      body.innerHTML = `<p class="note">아직 실행하지 않았습니다. 위 단계에서 고른 조건으로 ${t.label} 동안 SA를 돌립니다. 탭마다 따로 돌아가므로 여러 탭을 함께 돌려 비교할 수 있습니다.</p>`;
      return;
    }
    if (t.live.error) {
      body.innerHTML = `<p class="error-text">만들지 못했습니다: ${esc(t.live.error)}</p>`;
      return;
    }
    const o = t.out;
    const exactMin = o ? o.exactMin : null;
    body.innerHTML = `
      <div class="sa-charts">
        <figure class="sa-chart"><figcaption><b>시간에 따른 에너지</b> <span class="note">가로 = SA 경과 시간(로그 눈금), 세로 = 공간구문 에너지(낮을수록 실제 한국 아파트다움)</span></figcaption>
          <ul class="sa-legend"><li><i class="sa-key sa-key-best"></i>지금까지 최저</li><li><i class="sa-key sa-key-cur"></i>현재 상태</li>${o ? `<li><i class="sa-key sa-key-opt"></i>전수 열거 최저${o.sampled ? '(표본)' : ''}</li>` : ''}</ul>
          <div class="sa-plot" id="sa-trace">${traceSvg(t.live.trace, t.ms, exactMin, o?.hitMs ?? null)}</div>
        </figure>
        <figure class="sa-chart"><figcaption><b>배치 전체의 에너지 분포</b> <span class="note">${o ? `이 조건의 배치 ${o.total.toLocaleString()}개${o.sampled ? '(표본)' : '(전부)'}` : 'SA가 끝나면 그립니다'}</span></figcaption>
          <div class="sa-plot" id="sa-hist">${o ? histSvg(o.hist, o.bestE, o.cands.map((c) => c.syntaxE)) : ''}</div>
        </figure>
      </div>
      ${o ? resultHtml(t, o) : ''}`;
    bindHover(body.querySelector('#sa-trace svg'));
    bindHover(body.querySelector('#sa-hist svg'));
    if (o) {
      body.querySelectorAll('[data-sa-cand]').forEach((el) => el.addEventListener('click', () => ((t.cand = Number(el.dataset.saCand)), render())));
      body.querySelector('#sa-adopt')?.addEventListener('click', () => onAdopt?.(t, o, t.cand));
    }
  }

  function resultHtml(t, o) {
    if (!o.cands.length) return '<p class="error-text">조건을 만족하는 평면을 만들지 못했습니다.</p>';
    const c = o.cands[Math.min(t.cand, o.cands.length - 1)];
    const reached = o.hitMs !== null;
    const cov = o.total ? Math.min(1, o.visited / o.total) : null;
    return `
      <div class="gen-toolbar"><div class="seg gen-tabs" role="tablist">${o.cands.map((x, i) => `<button type="button" data-sa-cand="${i}" aria-pressed="${i === t.cand}">${i + 1}안 · E ${x.syntaxE.toFixed(3)}</button>`).join('')}</div>
        <button type="button" class="button-ghost small" id="sa-adopt">이 안을 위 결과 칸에서 자세히 보기</button></div>
      <div class="gen-result">
        <figure class="gen-plan">${layoutSvg(c.layout, { title: `${t.spec.area}㎡ · 방 ${t.spec.bedrooms}개 · SA ${t.label} ${t.cand + 1}안`, mode: 'full' })}</figure>
        <div class="gen-detail">
          <table class="gen-table"><tbody>
            <tr><th>이 안의 공간구문 에너지</th><td class="mono">${c.syntaxE.toFixed(3)}${c.syntaxP !== null ? ` · 확률 ${(100 * c.syntaxP).toFixed(2)}%` : ''}</td></tr>
            <tr><th>SA 최저 에너지</th><td class="mono">${o.bestE.toFixed(3)} ${reached ? `<span class="good-text">전수 열거 최저와 같음</span>` : `<span class="error-text">전수 열거 최저 ${o.exactMin.toFixed(3)}보다 높음</span>`}</td></tr>
            <tr><th>처음 최저에 닿은 시각</th><td class="mono">${reached ? fmtT(o.hitMs) : '못 닿음'}</td></tr>
            <tr><th>걸음 수 · 재시작</th><td class="mono">${o.steps.toLocaleString()}걸음 · ${o.restarts.toLocaleString()}번(한 번 ${o.stepsPerRestart}걸음)</td></tr>
            <tr><th>지나간 서로 다른 배치</th><td class="mono">${o.visited.toLocaleString()}개${cov !== null && !o.sampled ? ` / 전체 ${o.total.toLocaleString()}개(${Math.round(cov * 100)}%)` : ''}</td></tr>
            <tr><th>온도</th><td class="mono">T ${o.T0.toFixed(3)} → ${o.T1.toFixed(4)}(재시작마다 기하 감소)</td></tr>
            <tr><th>점검</th><td>${c.ok ? '<span class="good-text">필수 규칙·좁은 실·문 동선 통과</span>' : '<span class="error-text">미통과</span>'}</td></tr>
            <tr><th>시드</th><td class="mono">${t.seed}</td></tr>
          </tbody></table>
          <p class="note">에너지 E = Σ β·f는 연구 생성기와 같은 공간구문 최대 엔트로피 모형입니다(β는 AI 허브 7,275장에 맞춘 값). SA 상태는 앞·뒤 띠의 실 순서이고, 한 걸음은 같은 띠의 두 실을 맞바꾸거나(95%) 다른 템플릿으로 건너뜁니다(5%). 순서 위에서 움직이므로 원-핫 제약이 늘 지켜집니다. SA가 지나간 배치 가운데 에너지가 낮은 12개를 평면으로 풀어(치수 30번 다듬기) 점검을 통과한 서로 다른 3안을 보여 줍니다. 기준값(전수 열거 최저)은 같은 조건의 배치를 전부 계산한 값이며 SA 시간에 넣지 않았습니다(${fmtT(o.enumMs)}).</p>
          ${syntaxSupported(t.spec) ? '' : '<p class="note error-text">침실 1개·5개는 β를 맞춘 실제 데이터(침실 2~4개) 밖이라 이 에너지는 외삽입니다. 논문 결과로 쓰지 마세요.</p>'}
          ${reached && o.hitMs < 1000 ? `<p class="note">이 조건은 배치가 ${o.total.toLocaleString()}개뿐이라 SA가 ${fmtT(o.hitMs)} 만에 최저에 닿습니다. 시간을 늘려도 최저 에너지는 더 내려가지 않고, 남은 시간은 같은 배치를 되풀이해 지나갑니다.</p>` : ''}
        </div>
      </div>`;
  }

  root.querySelector('#sa-run').addEventListener('click', () => run(active));
  render();
  return { render, reset: () => Object.values(tabs).forEach((t) => ((t.out = null), (t.live = null), t.runId++, (t.running = false))) };
}

// ---------- 그림 ----------
const W = 560;
const H = 240;
const M = { l: 52, r: 14, t: 12, b: 34 };
const niceTicks = (lo, hi, n = 4) => {
  const step = (hi - lo) / n || 1;
  return Array.from({ length: n + 1 }, (_, i) => lo + i * step);
};

/** 시간(로그) × 에너지 선 그림. trace = [[ms, 현재 E, 최저 E], ...]. */
function traceSvg(trace, budgetMs, exactMin, hitMs) {
  const pts = trace.filter((p) => p[2] !== null);
  if (!pts.length) return '<p class="note sa-empty">기준 계산 중…</p>';
  const t0 = 1;
  const lx = (ms) => Math.log10(Math.max(t0, ms));
  const x = (ms) => M.l + ((lx(ms) - lx(t0)) / (lx(budgetMs) - lx(t0))) * (W - M.l - M.r);
  const es = pts.flatMap((p) => [p[1], p[2]]).concat(exactMin !== null ? [exactMin] : []).filter((v) => v !== null);
  let lo = Math.min(...es);
  let hi = Math.max(...es);
  const pad = (hi - lo) * 0.08 || 0.1;
  lo -= pad;
  hi += pad;
  const y = (e) => M.t + ((hi - e) / (hi - lo)) * (H - M.t - M.b);
  const line = (k) => pts.filter((p) => p[k] !== null).map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[k]).toFixed(1)}`).join('');
  // 최저는 계단(그 값이 다음 개선까지 유지)
  const step = pts.map((p, i) => (i ? `H${x(p[0]).toFixed(1)}V${y(p[2]).toFixed(1)}` : `M${x(p[0]).toFixed(1)} ${y(p[2]).toFixed(1)}`)).join('') + `H${x(pts.at(-1)[0]).toFixed(1)}`;
  const xt = [1, 10, 100, 1000, 10000, 60000, 180000].filter((v) => v <= budgetMs * 1.001);
  const yt = niceTicks(lo, hi);
  const grid = yt.map((v) => `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" class="sa-grid"/><text x="${M.l - 6}" y="${y(v) + 4}" text-anchor="end" class="sa-tick">${v.toFixed(2)}</text>`).join('');
  const xg = xt.map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="${M.t}" y2="${H - M.b}" class="sa-grid"/><text x="${x(v)}" y="${H - M.b + 16}" text-anchor="middle" class="sa-tick">${fmtT(v)}</text>`).join('');
  const opt = exactMin !== null ? `<line x1="${M.l}" x2="${W - M.r}" y1="${y(exactMin)}" y2="${y(exactMin)}" class="sa-opt"/>` : '';
  const hit = hitMs !== null ? `<line x1="${x(hitMs)}" x2="${x(hitMs)}" y1="${M.t}" y2="${H - M.b}" class="sa-hit"/><text x="${x(hitMs) + 4}" y="${M.t + 12}" class="sa-tick">최저 도달 ${fmtT(hitMs)}</text>` : '';
  // 마우스 위치마다 읽을 점: 점마다 투명한 세로 띠
  const hits = pts
    .map((p, i) => {
      const x0 = i ? (x(pts[i - 1][0]) + x(p[0])) / 2 : M.l;
      const x1 = i < pts.length - 1 ? (x(p[0]) + x(pts[i + 1][0])) / 2 : W - M.r;
      return `<rect x="${x0.toFixed(1)}" y="${M.t}" width="${Math.max(0.5, x1 - x0).toFixed(1)}" height="${H - M.t - M.b}" fill="transparent" data-tip="${fmtT(p[0])} · 현재 ${p[1] === null ? '—' : p[1].toFixed(3)} · 최저 ${p[2].toFixed(3)}" data-x="${x(p[0]).toFixed(1)}"/>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="SA 시간에 따른 공간구문 에너지">${grid}${xg}
    <path d="${line(1)}" class="sa-cur"/>${opt}<path d="${step}" class="sa-best"/>${hit}
    <text x="${(M.l + W - M.r) / 2}" y="${H - 4}" text-anchor="middle" class="sa-axis">SA 경과 시간</text>
    <line class="sa-cross" x1="0" x2="0" y1="${M.t}" y2="${H - M.b}" visibility="hidden"/>${hits}</svg><div class="sa-tip" hidden></div>`;
}

/** 에너지 히스토그램 + SA 최저(세로선)와 낸 3안(작은 삼각형). */
function histSvg(h, bestE, candEs) {
  const n = h.counts.length;
  const cmax = Math.max(...h.counts);
  const x = (e) => M.l + ((e - h.lo) / (h.hi - h.lo || 1)) * (W - M.l - M.r);
  const y = (c) => M.t + (1 - c / cmax) * (H - M.t - M.b);
  const bw = (W - M.l - M.r) / n;
  const bars = h.counts
    .map((c, i) => {
      const a = h.lo + i * h.w;
      const bx = M.l + i * bw;
      const vis = c ? `<rect x="${(bx + 1).toFixed(1)}" y="${y(c).toFixed(1)}" width="${Math.max(0.5, bw - 2).toFixed(1)}" height="${(H - M.b - y(c)).toFixed(1)}" rx="2" class="sa-bar"/>` : '';
      return `${vis}<rect x="${bx.toFixed(1)}" y="${M.t}" width="${bw.toFixed(1)}" height="${H - M.t - M.b}" fill="transparent" data-tip="에너지 ${a.toFixed(2)} ~ ${(a + h.w).toFixed(2)} · 배치 ${c}개" data-x="${(bx + bw / 2).toFixed(1)}"/>`;
    })
    .join('');
  const ystep = Math.max(1, Math.ceil(cmax / 4));
  const yt = Array.from({ length: Math.floor(cmax / ystep) + 1 }, (_, i) => i * ystep);
  const grid = yt.map((v) => `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" class="sa-grid"/><text x="${M.l - 6}" y="${y(v) + 4}" text-anchor="end" class="sa-tick">${v}</text>`).join('');
  const xt = niceTicks(h.lo, h.hi).map((v) => `<text x="${x(v)}" y="${H - M.b + 16}" text-anchor="middle" class="sa-tick">${v.toFixed(2)}</text>`).join('');
  const best = bestE !== null ? `<line x1="${x(bestE)}" x2="${x(bestE)}" y1="${M.t}" y2="${H - M.b}" class="sa-best-v"/><text x="${x(bestE) + 4}" y="${M.t + 12}" class="sa-tick">SA 최저 ${bestE.toFixed(3)}</text>` : '';
  const tri = candEs.map((e, i) => `<path d="M${x(e).toFixed(1)} ${H - M.b + 1}l-4 7h8z" class="sa-cand"><title>${i + 1}안 · E ${e.toFixed(3)}</title></path>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="배치 전체의 공간구문 에너지 분포">${grid}${bars}${best}${tri}${xt}
    <text x="${(M.l + W - M.r) / 2}" y="${H - 4}" text-anchor="middle" class="sa-axis">공간구문 에너지(왼쪽일수록 실제 아파트다움) · ▲ = 낸 3안</text>
    <line class="sa-cross" x1="0" x2="0" y1="${M.t}" y2="${H - M.b}" visibility="hidden"/></svg><div class="sa-tip" hidden></div>`;
}

function bindHover(svg) {
  if (!svg) return;
  const tip = svg.nextElementSibling;
  const cross = svg.querySelector('.sa-cross');
  svg.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      tip.textContent = el.dataset.tip;
      tip.hidden = false;
      const px = (Number(el.dataset.x) / W) * 100;
      tip.style.left = `${Math.min(80, Math.max(8, px))}%`;
      cross.setAttribute('x1', el.dataset.x);
      cross.setAttribute('x2', el.dataset.x);
      cross.setAttribute('visibility', 'visible');
    });
    el.addEventListener('mouseleave', () => {
      tip.hidden = true;
      cross.setAttribute('visibility', 'hidden');
    });
  });
}

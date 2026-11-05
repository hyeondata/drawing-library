// 결과 화면의 'QUBO + SA' 패널: 읽기마다의 에너지(시간 × 에너지, 전수 열거 최저 E* 점선), 배치 전체의 에너지 분포, 읽기 통계.
// 데이터는 compare.js 'quboSA' 결과의 res.sa(generateQuboSA 반환값, qubo-sa.js).
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtT = (ms) => (ms < 1000 ? `${Math.round(ms)}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}초` : `${Math.floor(ms / 60000)}분 ${Math.round((ms % 60000) / 1000)}초`);
const W = 560;
const H = 240;
const M = { l: 52, r: 14, t: 12, b: 34 };
const ticks = (lo, hi, n = 4) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) / n) * i);

/** 읽기 로그 [[ms, 템플릿 k, QUBO 에너지, 모형 에너지|null]] → 시간(로그) × 모형 에너지. 유효 읽기만 점, 최저는 계단, E*는 점선. */
function traceSvg(sa) {
  const valid = sa.readLog.filter((r) => r[3] !== null);
  if (!valid.length) return `<p class="note sa-empty">유효한 배치(원-핫을 지킨 해)를 한 번도 읽지 못했습니다(읽기 ${sa.reads.toLocaleString()}회). 시간을 늘리거나 조건을 단순하게 해 보세요.</p>`;
  const t0 = 1;
  const lx = (ms) => Math.log10(Math.max(t0, ms));
  const x = (ms) => M.l + ((lx(ms) - lx(t0)) / (lx(sa.budgetMs) - lx(t0))) * (W - M.l - M.r);
  let lo = Math.min(sa.exactMin, ...valid.map((r) => r[3]));
  let hi = Math.max(...valid.map((r) => r[3]));
  const pad = (hi - lo) * 0.08 || 0.1;
  lo -= pad;
  hi += pad;
  const y = (e) => M.t + ((hi - e) / (hi - lo)) * (H - M.t - M.b);
  let best = Infinity;
  const steps = [];
  for (const r of valid) if (r[3] < best - 1e-12) (best = r[3]), steps.push([r[0], r[3]]);
  const step = steps.map(([t, e], i) => (i ? `H${x(t).toFixed(1)}V${y(e).toFixed(1)}` : `M${x(t).toFixed(1)} ${y(e).toFixed(1)}`)).join('') + `H${x(sa.saMs).toFixed(1)}`;
  const dots = valid.map((r) => `<circle cx="${x(r[0]).toFixed(1)}" cy="${y(r[3]).toFixed(1)}" r="2.5" class="sa-dot${Math.abs(r[3] - sa.exactMin) < 1e-9 ? ' sa-dot-hit' : ''}"><title>${fmtT(r[0])} · 템플릿 앞 침실 ${r[1] + 1}개 · 모형 에너지 ${r[3].toFixed(3)}</title></circle>`).join('');
  const xt = [1, 10, 100, 1000, 10000, 60000, 180000].filter((v) => v <= sa.budgetMs * 1.001);
  const grid = ticks(lo, hi).map((v) => `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" class="sa-grid"/><text x="${M.l - 6}" y="${y(v) + 4}" text-anchor="end" class="sa-tick">${v.toFixed(2)}</text>`).join('');
  const xg = xt.map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="${M.t}" y2="${H - M.b}" class="sa-grid"/><text x="${x(v)}" y="${H - M.b + 16}" text-anchor="middle" class="sa-tick">${fmtT(v)}</text>`).join('');
  const opt = `<line x1="${M.l}" x2="${W - M.r}" y1="${y(sa.exactMin)}" y2="${y(sa.exactMin)}" class="sa-opt"/><text x="${W - M.r}" y="${y(sa.exactMin) - 4}" text-anchor="end" class="sa-tick">E* ${sa.exactMin.toFixed(3)}(전수 열거)</text>`;
  const hit = sa.hitMs !== null ? `<line x1="${x(sa.hitMs)}" x2="${x(sa.hitMs)}" y1="${M.t}" y2="${H - M.b}" class="sa-hit"/><text x="${x(sa.hitMs) + 4}" y="${M.t + 12}" class="sa-tick">E* 첫 도달 ${fmtT(sa.hitMs)}</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="SA 읽기 시간에 따른 공간구문 에너지">${grid}${xg}${dots}${opt}<path d="${step}" class="sa-best"/>${hit}<text x="${(M.l + W - M.r) / 2}" y="${H - 4}" text-anchor="middle" class="sa-axis">읽기가 끝난 시각(로그 눈금)</text></svg>`;
}

/** 배치 전체의 에너지 히스토그램 + SA 최저(세로선)와 낸 안(▲). */
function histSvg(sa, candEs) {
  const h = sa.hist;
  const n = h.counts.length;
  const cmax = Math.max(...h.counts);
  const x = (e) => M.l + ((e - h.lo) / (h.hi - h.lo || 1)) * (W - M.l - M.r);
  const y = (c) => M.t + (1 - c / cmax) * (H - M.t - M.b);
  const bw = (W - M.l - M.r) / n;
  const bars = h.counts.map((c, i) => (c ? `<rect x="${(M.l + i * bw + 1).toFixed(1)}" y="${y(c).toFixed(1)}" width="${Math.max(0.5, bw - 2).toFixed(1)}" height="${(H - M.b - y(c)).toFixed(1)}" rx="2" class="sa-bar"><title>에너지 ${(h.lo + i * h.w).toFixed(2)} ~ ${(h.lo + (i + 1) * h.w).toFixed(2)} · 배치 ${c}개</title></rect>` : '')).join('');
  const ystep = Math.max(1, Math.ceil(cmax / 4));
  const grid = Array.from({ length: Math.floor(cmax / ystep) + 1 }, (_, i) => i * ystep).map((v) => `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" class="sa-grid"/><text x="${M.l - 6}" y="${y(v) + 4}" text-anchor="end" class="sa-tick">${v}</text>`).join('');
  const xt = ticks(h.lo, h.hi).map((v) => `<text x="${x(v)}" y="${H - M.b + 16}" text-anchor="middle" class="sa-tick">${v.toFixed(2)}</text>`).join('');
  const best = sa.bestE !== null ? `<line x1="${x(sa.bestE)}" x2="${x(sa.bestE)}" y1="${M.t}" y2="${H - M.b}" class="sa-best-v"/><text x="${x(sa.bestE) + 4}" y="${M.t + 12}" class="sa-tick">SA 최저 ${sa.bestE.toFixed(3)}</text>` : '';
  const tri = candEs.map((e, i) => `<path d="M${x(e).toFixed(1)} ${H - M.b + 1}l-4 7h8z" class="sa-cand"><title>${i + 1}안 · E ${e.toFixed(3)}</title></path>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="배치 전체의 공간구문 에너지 분포">${grid}${bars}${best}${tri}${xt}<text x="${(M.l + W - M.r) / 2}" y="${H - 4}" text-anchor="middle" class="sa-axis">공간구문 에너지 E(왼쪽일수록 실제 아파트다움) · ▲ = 낸 안</text></svg>`;
}

/** 'quboSA' 결과 한 건의 패널 HTML. res = compare.js results 항목(res.sa, res.cands). */
export function saPanelHtml(res) {
  const sa = res.sa;
  if (!sa) return '';
  const reached = sa.hitMs !== null;
  const candEs = (res.cands || []).map((c) => c.syntaxE);
  const sizes = sa.sizes.map((z) => `앞 침실 ${z.k + 1}개: 변수 ${z.n.toLocaleString()}·이차항 ${z.quad.toLocaleString()}·P ${z.P.toFixed(1)}·β ${z.betaRange[0].toExponential(1)}~${z.betaRange[1].toExponential(1)}·배치 ${z.arrangements}`).join(' / ');
  return `
    <div class="sa-charts">
      <figure class="sa-chart"><figcaption><b>읽기마다의 에너지</b> <span class="note">점 = 유효한 배치로 풀린 읽기(모형 에너지), 선 = 지금까지 최저, 점선 = 전수 열거 최저 E*</span></figcaption>
        <ul class="sa-legend"><li><i class="sa-key"></i>지금까지 최저</li><li><i class="sa-key sa-key-opt"></i>E*(전수 열거, 정답 확인용)</li><li><i class="sa-key sa-key-dot"></i>유효 읽기</li></ul>
        <div class="sa-plot">${traceSvg(sa)}</div>
      </figure>
      <figure class="sa-chart"><figcaption><b>배치 전체의 에너지 분포</b> <span class="note">이 조건의 배치 ${sa.total.toLocaleString()}개 전부(정답 확인용 열거)</span></figcaption>
        <div class="sa-plot">${histSvg(sa, candEs)}</div>
      </figure>
    </div>
    <table class="gen-table sa-stats"><tbody>
      <tr><th>SA 읽기</th><td class="mono">${sa.reads.toLocaleString()}회 · 유효(원-핫 지킴) ${sa.valid.toLocaleString()}회(${sa.reads ? Math.round((100 * sa.valid) / sa.reads) : 0}%) · 서로 다른 배치 ${sa.distinct.toLocaleString()}개 · 읽기당 ${(sa.saMs / Math.max(1, sa.reads)).toFixed(1)}ms · 스위프 ${sa.sweeps.toLocaleString()}</td></tr>
      <tr><th>SA 최저 에너지</th><td class="mono">${sa.bestE === null ? '—' : sa.bestE.toFixed(3)} ${sa.bestE === null ? '' : reached ? `<span class="good-text">= E* ${sa.exactMin.toFixed(3)} (E* 읽기 ${sa.hits}회, 첫 도달 ${fmtT(sa.hitMs)})</span>` : `<span class="error-text">E* ${sa.exactMin.toFixed(3)}에 못 미침</span>`}</td></tr>
      <tr><th>QUBO 크기</th><td class="mono"><small>${esc(sizes)}</small></td></tr>
      <tr><th>시간</th><td class="mono">QUBO 만들기·E* 열거 ${fmtT(sa.prepMs)} · SA ${fmtT(sa.saMs)} · 전체 ${fmtT(sa.ms)}</td></tr>
    </tbody></table>
    <p class="note">SA는 dwave-samplers SimulatedAnnealingSampler와 같은 규칙입니다(BINARY→SPIN, 기하 β 스케줄, 기본 β 범위(|편향| < 1e-9 정리), 스위프 1,000, 변수 순서대로 Metropolis 한 번 = 스위프 하나, 무작위 초기 상태). 같은 QUBO·같은 설정에서 Python판과 유효율·E* 적중률·유효 배치 분포가 같음을 확인했습니다(evidence/results/sa-js-vs-py.md). 고른 시간 동안 읽기를 반복하고, 유효한 읽기 가운데 모형 에너지가 낮은 배치부터 평면으로 풀어 점검을 통과한 서로 다른 3안을 냅니다. E*는 배치를 전부 열거해 구한 값으로 생성에는 쓰지 않고 SA가 최적에 닿았는지 확인하는 데만 씁니다.</p>`;
}

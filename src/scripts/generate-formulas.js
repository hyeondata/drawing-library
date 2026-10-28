// 생성 화면의 '식과 변수': 이 안을 만든 변수를 바꿔 보며 식의 값·평면·영향(민감도)을 보여 주고, 식마다 근거 문헌을 단다.
// 점수(평가)는 보여 주지 않는다. 결과는 치수·면적·문 동선 같은 생성 결과만 쓴다.
import { buildLayout, MIN_SIDE, programOf } from '../generate/layout.js';
import { layoutSvg } from '../generate/render.js';
import { GEN_REFS } from '../generate/refs.js';
import { encode, features, TERMS } from '../generate/qubo.js';
import { templates } from '../generate/compare.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f2 = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const EPS = 1e-6;

const PARAMS = (spec) => {
  const s = Math.sqrt(spec.area / 84) ** 0.6;
  return [
    { key: 'depth', sym: 'D', label: '평면 깊이 D', unit: 'm', min: +(7.0 * s).toFixed(2), max: +(9.8 * s).toFixed(2), step: 0.01, delta: (v) => v * 0.05, deltaText: '±5%' },
    { key: 'frontShare', sym: 'f', label: '앞 띠 비율 f', unit: '', min: 0.46, max: 0.68, step: 0.005, delta: () => 0.04, deltaText: '±0.04' },
    { key: 'bedWidth', sym: 'w', label: '작은방 폭 w', unit: 'm', min: 2.5, max: 3.6, step: 0.01, delta: () => 0.2, deltaText: '±0.2m' },
    { key: 'masterDepth', sym: 'g', label: '안방 깊이 비율 g', unit: '', min: 0.6, max: 1, step: 0.01, delta: () => 0.08, deltaText: '±0.08' },
  ];
};
const OUTS = [
  { key: 'living', label: '거실 면적(㎡)', f: (L) => area(L.rooms.find((r) => r.key === 'living')) },
  { key: 'minBed', label: '가장 좁은 침실 폭(m)', f: (L) => Math.min(...L.rooms.filter((r) => r.type === '침실').map((r) => Math.min(r.w, r.h))) },
  { key: 'hall', label: '복도 폭(m)', f: (L) => Math.max(0, ...L.rooms.filter((r) => r.type === '기타').map((r) => Math.min(r.w, r.h))) },
  { key: 'master', label: '안방 면적(㎡)', f: (L) => area(L.rooms.find((r) => r.key === 'master')) },
  { key: 'W', label: '평면 폭 W(m)', f: (L) => L.W },
  { key: 'narrow', label: '최소 폭 미달 실(개)', f: (L) => L.rooms.filter((r) => (r.key === 'master' ? MIN_SIDE.안방 : MIN_SIDE[r.type]) && Math.min(r.w, r.h) < (r.key === 'master' ? MIN_SIDE.안방 : MIN_SIDE[r.type]) - EPS).length },
  { key: 'door', label: '문 동선 문제(개)', f: (L) => (L.doorCheck ? L.doorCheck.unreachable.length + L.doorCheck.throughBedroom.length : 0) },
];
const area = (r) => (r ? r.w * r.h : 0);
const chips = (ids) => `<span class="cites">${ids.map((id) => (GEN_REFS[id] ? `<a class="cite" href="${GEN_REFS[id].url}" target="_blank" rel="noopener" title="${esc(GEN_REFS[id].text || '')}">${esc(GEN_REFS[id].short)}</a>` : '')).join('')}</span>`;

const fx = { spec: null, cand: null, base: null, cur: null, weights: 'calibrated', out: 'living' };

export function renderFormulas({ spec, cand, weights }) {
  if (!cand?.params) {
    $('#gen-fx').hidden = true;
    return;
  }
  $('#gen-fx').hidden = false;
  fx.spec = spec;
  fx.cand = cand;
  fx.weights = weights;
  fx.base = structuredClone(cand.params);
  fx.cur = structuredClone(cand.params);
  const P = PARAMS(spec);
  $('#fx-controls').innerHTML = P.map(
    (p) => `<label class="mth-range" data-param="${p.key}">${esc(p.label)} <output id="fx-${p.key}-out"></output>
      <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${fx.cur[p.key]}" data-fx="${p.key}" /></label>`,
  ).join('');
  $('#fx-output').innerHTML = OUTS.map((o) => `<option value="${o.key}"${o.key === fx.out ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  update();
}
function clampParam(p, v) {
  return Math.min(p.max, Math.max(p.min, v));
}
function build(params) {
  return buildLayout(fx.spec, structuredClone(params));
}
function update() {
  const P = PARAMS(fx.spec);
  for (const p of P) $(`#fx-${p.key}-out`).textContent = `${f2(fx.cur[p.key], p.unit ? 2 : 3)}${p.unit}${Math.abs(fx.cur[p.key] - fx.base[p.key]) > 1e-9 ? ` (원래 ${f2(fx.base[p.key], p.unit ? 2 : 3)})` : ''}`;
  const L = build(fx.cur);
  const changed = P.some((p) => Math.abs(fx.cur[p.key] - fx.base[p.key]) > 1e-9);
  $('#fx-plan').innerHTML = layoutSvg(L, { mode: 'full', title: changed ? '바꾼 변수로 다시 만든 평면' : '이 안' });
  drawTornado(P);
  drawCards(L, P);
}
function drawTornado(P) {
  const out = OUTS.find((o) => o.key === fx.out);
  const baseV = out.f(build(fx.cur));
  const rows = P.map((p) => {
    const v = fx.cur[p.key];
    const lo = clampParam(p, v - p.delta(v));
    const hi = clampParam(p, v + p.delta(v));
    const dl = out.f(build({ ...fx.cur, [p.key]: lo })) - baseV;
    const dh = out.f(build({ ...fx.cur, [p.key]: hi })) - baseV;
    return { p, lo, hi, dl, dh, range: Math.max(Math.abs(dl), Math.abs(dh)) };
  }).sort((a, b) => b.range - a.range);
  const m = Math.max(1e-6, ...rows.map((r) => r.range)) * 1.15;
  const W = 720;
  const L = 170;
  const R = 70;
  const rowH = 34;
  const H = 30 + rows.length * rowH + 24;
  const x = (d) => L + ((d + m) / (2 * m)) * (W - L - R);
  let g = `<text x="${x(0)}" y="12" font-size="11" text-anchor="middle" fill="var(--text-muted)">지금 값 ${f2(baseV)}</text>`;
  g += `<line x1="${x(0)}" x2="${x(0)}" y1="18" y2="${H - 22}" stroke="var(--text-muted)" stroke-dasharray="4 3"/>`;
  rows.forEach((r, i) => {
    const y = 24 + i * rowH;
    g += `<text x="${L - 10}" y="${y + 13}" font-size="12" text-anchor="end" fill="var(--text-secondary)">${esc(r.p.label)}</text>`;
    g += `<text x="${L - 10}" y="${y + 26}" font-size="10" text-anchor="end" fill="var(--text-muted)">${r.p.deltaText}</text>`;
    for (const [d, c, lab, off] of [
      [r.dl, 'var(--series-1)', `−: ${d2(r.dl)}`, 0],
      [r.dh, 'var(--series-2)', `+: ${d2(r.dh)}`, 13],
    ]) {
      const x0 = Math.min(x(0), x(d));
      const w = Math.max(1, Math.abs(x(d) - x(0)));
      g += `<rect x="${x0}" y="${y + off}" width="${w}" height="11" rx="2" fill="${c}"><title>${esc(r.p.label)} ${lab.startsWith('−') ? '줄이면' : '늘리면'} ${esc(out.label)} ${d2(d)}</title></rect>`;
      g += `<text x="${d >= 0 ? x(0) + w + 4 : x(0) - w - 4}" y="${y + off + 10}" font-size="10" text-anchor="${d >= 0 ? 'start' : 'end'}" fill="var(--text-secondary)">${d2(d)}</text>`;
    }
  });
  g += `<text x="${L}" y="${H - 6}" font-size="11" fill="var(--text-muted)">← 줄어듦</text><text x="${W - R}" y="${H - 6}" font-size="11" text-anchor="end" fill="var(--text-muted)">늘어남 →</text>`;
  $('#fx-tornado').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="변수별 영향">${g}</svg>
    <ul class="mth-legend"><li><i style="background:var(--series-1)"></i>변수를 줄였을 때</li><li><i style="background:var(--series-2)"></i>변수를 늘렸을 때</li></ul>
    <p class="note">가장 위의 변수가 ${esc(out.label)}에 영향이 가장 큽니다. 값은 실 순서를 그대로 두고 그 변수만 바꿔 평면을 다시 만든 결과입니다.</p>`;
}
const d2 = (d) => (Math.abs(d) < 0.005 ? '0' : `${d > 0 ? '+' : ''}${d.toFixed(2)}`);

function drawCards(L, P) {
  const p = fx.cur;
  const spec = fx.spec;
  const living = L.rooms.find((r) => r.key === 'living');
  const Df = living ? living.h : L.D / 2;
  const Db = L.D - Df;
  const program = programOf(spec);
  const iBed = program.findIndex((r) => r.key === 'bed1');
  const aBed = iBed >= 0 ? program[iBed].area * (p.areaMul?.[iBed % 12] || 1) : null;
  const frontBed = L.rooms.find((r) => r.type === '침실' && r.key !== 'master' && Math.abs(r.y + r.h - L.D) < EPS);
  const hall = L.rooms.filter((r) => r.type === '기타');
  const master = L.rooms.find((r) => r.key === 'master');
  const suite = L.rooms.filter((r) => r.key === 'bathMaster' || r.key === 'dress');
  const front = L.rooms.filter((r) => Math.abs(r.y + r.h - L.D) < EPS && r.type !== '발코니' && r.type !== '실외기실' && r.type !== '기타').sort((a, b) => a.x - b.x);
  const minOf = (r) => (r.key === 'master' ? MIN_SIDE.안방 : MIN_SIDE[r.type] || 0);
  const vars = (keys) => `<span class="gen-fx-vars">영향 변수: ${keys.map((k) => `<button type="button" class="chip" data-focus="${k}">${esc(P.find((q) => q.key === k)?.label || k)}</button>`).join(' ')}</span>`;
  const cards = [
    {
      title: '① 전용면적 → 평면 폭',
      formula: 'W = A ÷ D',
      values: `W = ${spec.area} ÷ ${f2(L.D)} = <b>${f2(L.W)}m</b>`,
      why: '전용면적 A는 고른 값으로 고정하고 깊이 D만 탐색합니다. 위상(배치)을 먼저 정하고 치수를 나중에 맞추는 평면 생성 방식이라, 면적을 맞추는 일은 폭이 맡습니다. D가 커지면 W가 줄어 앞 띠에 들어갈 방의 폭이 좁아집니다.',
      vars: ['depth'],
      refs: ['upasani2020', 'merrell2010'],
    },
    {
      title: '② 앞 띠와 뒤 띠',
      formula: 'D_앞 = D × f,  D_뒤 = D − D_앞',
      values: `D_앞 = ${f2(L.D)} × ${f2(p.frontShare, 3)} = <b>${f2(Df)}m</b>, D_뒤 = <b>${f2(Db)}m</b>`,
      why: '거실과 침실을 남쪽(발코니 쪽) 띠에 나란히 두고, 주방·현관·욕실을 북쪽 띠에 두는 한국 판상형의 거실 중심 배치입니다. 거실·침실이 외기와 발코니에 닿게(채광) 하는 구성이기도 합니다. f가 크면 거실·침실이 깊어지고 뒤 띠의 욕실·현관이 얕아집니다.',
      vars: ['depth', 'frontShare'],
      refs: ['seo2007', 'choi2014', 'ju2020'],
    },
    {
      title: '③ 작은방 깊이와 복도',
      formula: 'd = a ÷ w,  복도 폭 = D_앞 − d  (0.4m 미만이면 복도 없음, 1.1m 미만이면 1.1m)',
      values: aBed && frontBed ? `d = ${f2(aBed, 1)}㎡ ÷ ${f2(p.bedWidth)}m = ${f2(aBed / p.bedWidth)}m → 실제 깊이 <b>${f2(frontBed.h)}m</b>, 복도 폭 <b>${hall.length ? f2(Math.min(...hall.map((h) => h.h))) : 0}m</b>` : '이 안에는 앞 띠 작은방이 없습니다.',
      why: '작은방의 폭을 먼저 정하고(최소 2.4m) 깊이는 면적에서 구합니다. 거실보다 얕은 만큼을 복도로 써서 침실이 거실을 거치지 않고 복도로 열리게 합니다(공·사 공간의 깊이 차). w가 크면 방이 얕아지고 복도가 넓어집니다.',
      vars: ['bedWidth', 'frontShare', 'depth'],
      refs: ['upasani2020', 'park2024', 'ham2017'],
    },
    {
      title: '④ 안방 깊이와 부속실',
      formula: 'd_안방 = D_앞 × g (부속실이 있고 D_앞 − d_안방 ≥ 0.6m일 때),  부속실 깊이 = D − d_안방',
      values: master ? `d_안방 = <b>${f2(master.h)}m</b>${suite.length ? `, 부속실(${suite.map((r) => esc(r.name)).join('·')}) 깊이 <b>${f2(suite[0].h)}m</b>` : ''}` : '',
      why: '안방 뒤에 부부욕실·드레스룸을 나란히 붙여 둘 다 안방과 맞닿게 합니다(master suite). g가 작으면 안방이 얕아지고 부속실이 깊어집니다.',
      vars: ['masterDepth', 'frontShare', 'depth'],
      refs: ['zeng2025'],
    },
    {
      title: '⑤ 띠 안에서 폭 나누기',
      formula: 'w_i = m_i + (W − Σm) × e_i ÷ Σe,   e_i = max(0, 원하는 폭 − m_i),  원하는 폭 = 목표 면적 ÷ 깊이',
      values: `<table class="gen-table"><thead><tr><th>앞 띠 실</th><th>최소 폭 m</th><th>받은 폭 w</th><th>남는 몫</th></tr></thead><tbody>${front
        .map((r) => `<tr><td>${esc(r.name)}</td><td class="mono">${f2(minOf(r), 1)}</td><td class="mono">${f2(r.w)}</td><td class="mono">${f2(Math.max(0, r.w - minOf(r)))}</td></tr>`)
        .join('')}<tr><td>합</td><td class="mono">${f2(front.reduce((s, r) => s + minOf(r), 0), 1)}</td><td class="mono">${f2(front.reduce((s, r) => s + r.w, 0))}</td><td></td></tr></tbody></table>`,
      why: '실마다 최소 폭(욕실 1.5, 현관 1.2, 침실 2.4, 안방 3.0, 거실 3.6m)을 먼저 보장하고, 남는 폭을 각 실이 최소 폭보다 더 원하는 만큼에 비례해 나눕니다. 치수 제약을 둔 평면 생성과 같은 생각입니다. 최소 폭 합이 W보다 크면 모두 비례해 줄어 좁은 실이 생깁니다.',
      vars: ['depth', 'frontShare'],
      refs: ['upasani2020', 'rodrigues2013'],
    },
    {
      title: '⑥ 문과 문 동선',
      formula: '현관 → (문·개구부 그래프 너비 우선 탐색) → 모든 실에 닿는가, 침실을 지나야만 닿는 실이 있는가',
      values: L.doorCheck ? `못 가는 실 <b>${L.doorCheck.unreachable.length}</b> · 침실을 지나는 실 <b>${L.doorCheck.throughBedroom.length}</b> · 문 ${(L.openings || []).filter((o) => o.kind === 'door').length}개 · 개구부 ${(L.openings || []).filter((o) => o.kind === 'opening').length}곳` : '',
      why: '현관–중앙홀–거실로 이어지는 한국 평면의 출입 구성을 따라 공용 공간끼리는 트고, 침실·욕실은 들어갈 쪽을 정해 문을 답니다. 출입 링크 하나가 사생활과 통제를 바꾸므로, 실 순서가 바뀌면 이 결과가 달라집니다.',
      vars: [],
      refs: ['seo2007', 'bafna2003'],
    },
  ];
  // QUBO 에너지 분해: 이 안이 QUBO 풀이기에서 나왔으면 항별 기여 w_t·φ_t
  if (fx.cand.algo && fx.cand.algo.key !== 'model' && fx.cand.params?.frontOrder) {
    try {
      const tpl = templates(spec, fx.weights).find((t) => t.k === fx.cand.template) || templates(spec, fx.weights)[0];
      const x = encode(tpl.q, fx.cand.params.frontOrder, fx.cand.params.backOrder);
      const phi = features(tpl.q, x);
      const contrib = TERMS.map((t, i) => ({ label: t.label, w: tpl.q.weights[t.id] ?? 0, phi: phi[i], c: (tpl.q.weights[t.id] ?? 0) * phi[i] })).filter((r) => Math.abs(r.c) > 1e-9);
      contrib.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
      const m = Math.max(1e-6, ...contrib.map((r) => Math.abs(r.c)));
      cards.push({
        title: '⑦ QUBO 에너지: 어떤 항이 이 배치를 골랐나',
        formula: 'E(x) = Σ_t w_t · φ_t(x) + P · Σ(Σx − 1)²   (제약을 지키면 벌점 항은 0)',
        values: `E = <b>${f2(contrib.reduce((s, r) => s + r.c, 0))}</b> (벌점 P = ${tpl.q.penalty}, 변수 ${tpl.q.n}개)<div class="gen-fx-bars">${contrib
          .map((r) => `<div class="gen-fx-bar"><span>${esc(r.label)}</span><i style="--w:${(Math.abs(r.c) / m) * 100}%;background:${r.c < 0 ? 'var(--series-1)' : 'var(--series-2)'}"></i><b class="mono">${d2(r.c)}</b><small class="mono">w ${f2(r.w)} × φ ${f2(r.phi)}</small></div>`)
          .join('')}</div>`,
        why: '배치는 에너지가 가장 낮은 해입니다. 음수(파랑) 항은 그 배치를 끌어오고, 양수(주황) 항은 밀어냅니다. 원-핫 벌점은 실마다 칸 하나·칸마다 실 하나를 지키게 하고, 그 크기는 한 변수를 뒤집어 얻을 수 있는 최대 이득보다 조금 크게 잡았습니다(이 도구가 정한 보수적 상한). 항 가중치 w는 실제 아파트 분포에 맞춰 다시 정한 값입니다.',
        vars: [],
        refs: ['lucas2014', 'glover2019', 'ayodele2022', 'jin2011'],
      });
    } catch {
      // 템플릿을 다시 만들 수 없으면 이 카드는 건너뛴다.
    }
  }
  $('#fx-cards').innerHTML = cards
    .map(
      (c) => `<article class="gen-fx-card"><h4>${c.title}</h4><p class="mth-formula">${esc(c.formula)}</p><p class="gen-fx-values">${c.values}</p><p class="gen-fx-why">${c.why}</p>${c.vars.length ? vars(c.vars) : ''}<p class="gen-fx-refs">근거 ${chips(c.refs)}</p></article>`,
    )
    .join('');
  $('#fx-cards').querySelectorAll('[data-focus]').forEach((b) =>
    b.addEventListener('click', () => {
      const el = $(`[data-param="${b.dataset.focus}"]`);
      el.classList.add('gen-fx-flash');
      el.querySelector('input').focus();
      setTimeout(() => el.classList.remove('gen-fx-flash'), 900);
    }),
  );
}

$('#fx-controls')?.addEventListener('input', (e) => {
  const k = e.target.dataset.fx;
  if (!k) return;
  fx.cur[k] = Number(e.target.value);
  update();
});
$('#fx-output')?.addEventListener('change', (e) => {
  fx.out = e.target.value;
  drawTornado(PARAMS(fx.spec));
});
$('#fx-reset')?.addEventListener('click', () => {
  if (!fx.base) return;
  fx.cur = structuredClone(fx.base);
  document.querySelectorAll('[data-fx]').forEach((i) => (i.value = fx.cur[i.dataset.fx]));
  update();
});

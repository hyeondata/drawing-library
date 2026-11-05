// QUBO 따라가기: 입력을 고르면 실제 생성 코드로 QUBO를 만들고, 단계마다 숫자와 '확인'(따로 계산한 값 = 코드의 값)을 보여 준다.
import { programOf, MIN_AREA, buildLayout, rng } from '../generate/layout.js';
import { buildQubo, TERMS, weightsOf, withSyntax, frontBedCount, energy, features, decode, encode } from '../generate/qubo.js';
import { buildChoices } from '../generate/choices.js';
import { SYNTAX, SYNTAX_LAMBDA } from '../generate/syntax-weights.js';
import { runSolver } from '../generate/solvers.js';
import { defaultParams, realize } from '../generate/compare.js';
import { scoreLayout } from '../generate/optimize.js';
import { layoutSvg } from '../generate/render.js';
import { ALL_CHOICES } from '../generate/preferences.js';

const { base } = JSON.parse(document.getElementById('qs-data').textContent);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : Number(v).toFixed(d));
const sg = (v, d = 2) => (v < 0 ? `− ${f(-v, d)}` : `+ ${f(v, d)}`);
const ok = (cond, what) => `<p class="qs-check ${cond ? 'pass' : 'fail'}">${cond ? '✓ 확인' : '✗ 불일치'}: ${what}</p>`;
const live = (id, html) => {
  const el = document.querySelector(`[data-live="${id}"]`);
  if (el) el.innerHTML = html;
};
const table = (head, rows, cls = '') => `<div class="mt-scroll"><table class="gen-table qs-tbl ${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

// 목표 면적비: 도면 생성 화면의 기본값(AI 허브 아파트 평면도 전체, 고른 침실 수 세대의 중앙값)
const CH = buildChoices();
const targetsOf = (bedrooms) => {
  const o = CH.byBedrooms[bedrooms] || CH.byBedrooms[3];
  const other = o.roomSize[1].share;
  return { living: o.living.standard, ...o.targets, other, master: bedrooms > 1 ? other * o.master[1].ratio : other * 1.6 };
};
const PREF = Object.fromEntries(ALL_CHOICES.map((c) => [c.key, c]));
const RULE = {
  kitchenLiving: ['vertical', '거실(앞) × 주방(뒤)'],
  entranceLiving: ['vertical', '거실(앞) × 현관(뒤)'],
  entranceKitchen: ['beside', '뒤 띠: 현관 × 주방'],
  bathKitchen: ['beside', '뒤 띠: 공용욕실 × 주방'],
  bathEntrance: ['beside', '뒤 띠: 공용욕실 × 현관'],
  bathLiving: ['vertical', '거실(앞) × 공용욕실(뒤)'],
  multiKitchen: ['beside', '뒤 띠: 다목적실 × 주방'],
  bedEntrance: ['vertical', '앞 침실들 × 현관(뒤)'],
  backBedEntrance: ['beside', '뒤 띠: 뒤 침실 × 현관'],
  backBedUnderBed: ['vertical', '앞 침실 × 뒤 침실'],
  backBedKitchen: ['beside', '뒤 띠: 뒤 침실 × 주방'],
  backBedEnd: ['at', '뒤 침실이 끝 칸이면 1'],
  bedOverBath: ['vertical', '안방 외 앞 침실 × 공용욕실(뒤)'],
  bath3Bed: ['vertical', '안방 외 앞 침실 × 욕실3(뒤)'],
  bedLiving: ['beside', '앞 띠: 침실 × 거실'],
  bedBed: ['beside', '앞 띠: 침실 × 침실'],
  masterKitchen: ['vertical', '안방(앞) × 주방(뒤)'],
  livingOffCenter: ['at', '거실 칸 s: |(s + 0.5)/m − 0.5|'],
  masterNotEnd: ['at', '안방이 끝 칸이 아니면 1'],
  entranceEnd: ['at', '현관이 끝 칸이면 1'],
  kitchenEnd: ['at', '주방이 끝 칸이면 1'],
};

let S = null; // 현재 상태(입력·QUBO·디버거 배치)

function readInput() {
  const prefs = [...document.querySelectorAll('input[name="qs-pref"]:checked')].map((e) => e.value);
  const spec = {
    area: Number($('#qs-area').value),
    bedrooms: Number($('#qs-bed').value),
    baths: Number($('#qs-bath').value),
    dress: $('#qs-dress').checked,
    multi: $('#qs-multi').checked,
    outdoorUnit: false,
    balcony: true,
    targets: targetsOf(Number($('#qs-bed').value)),
    prefs,
  };
  return { spec, wset: $('#qs-wset').value, sx: $('#qs-sx').checked, lambda: Number($('#qs-lambda').value) };
}

/** 입력 → QUBO. 가중치 객체를 직접 만들어 넘기므로 단계 6의 숫자가 곧 QUBO에 들어간 값이다. */
function build(inp, k) {
  const W0 = weightsOf(inp.wset);
  const sx = inp.sx ? withSyntax(W0, inp.spec.prefs, { lambda: inp.lambda }) : { weights: W0, added: [] };
  // 실제 생성기와 같게: 대리 몫은 선호 배수로 나눠 넣는다(w × 배수 = 기본 × 배수 + 대리 항).
  const W = Object.fromEntries(TERMS.map((t) => [t.id, (W0[t.id] ?? 0) + ((sx.weights[t.id] ?? 0) - (W0[t.id] ?? 0)) / boostOf(t, inp.spec)]));
  const q = buildQubo(inp.spec, { frontBeds: k, weights: W });
  return { q, W0, sx };
}
const boostOf = (t, spec) => (t.pref && spec.prefs.includes(t.pref[0]) ? t.pref[1] : 1);

function recompute() {
  const inp = readInput();
  $('#qs-lambda-v').textContent = inp.lambda.toFixed(2);
  const kAuto = frontBedCount(inp.spec);
  const tpls = [...new Set([kAuto, kAuto - 1])].filter((k) => k >= 0);
  const sel = $('#qs-tpl');
  const prev = Number(sel.value);
  sel.innerHTML = tpls.map((k) => `<option value="${k}">앞 띠 작은방 ${k}개${k === kAuto ? '(기본)' : ''}</option>`).join('');
  sel.value = String(tpls.includes(prev) ? prev : kAuto);
  const k = Number(sel.value);
  const { q, W0, sx } = build(inp, k);
  const nameOf = Object.fromEntries(programOf(inp.spec).map((r) => [r.key, r.name]));
  const vname = (i) => `${nameOf[q.vars[i].room] ?? q.vars[i].room}@${q.vars[i].band === 'front' ? '앞' : '뒤'}${q.vars[i].slot + 1}`;
  // 목적 항만의 행렬과 항별 기여
  const n = q.n;
  const obj = new Float64Array(n * n); // 대각 포함
  const parts = new Map(); // 'i,j' → [{ id, w, b, u }]
  for (const t of TERMS) {
    const u = q.unit[t.id];
    const w = q.weights[t.id] ?? 0;
    const b = boostOf(t, inp.spec);
    for (const [i, val] of u.lin) {
      obj[i * n + i] += w * val;
      const key = `${i},${i}`;
      if (!parts.has(key)) parts.set(key, []);
      parts.get(key).push({ id: t.id, w, b, u: val / b });
    }
    for (const [key2, val] of u.quad) {
      const a = Math.floor(key2 / n);
      const c = key2 % n;
      obj[a * n + c] += w * val;
      obj[c * n + a] += w * val;
      for (const kk of [`${a},${c}`, `${c},${a}`]) {
        if (!parts.has(kk)) parts.set(kk, []);
        parts.get(kk).push({ id: t.id, w, b, u: val / b });
      }
    }
  }
  const ex = runSolver('exact', q, { seed: 1, budgetMs: 20000 });
  S = { inp, k, kAuto, tpls, q, W0, sx, nameOf, vname, obj, parts, ex, x: Uint8Array.from(ex.samples[0].x), opt: ex.samples[0].e };
  // 실제 생성기와 같은 QUBO인가(손 가중치 + 기본 λ일 때)
  if (inp.wset === 'hand' && inp.sx && Math.abs(inp.lambda - SYNTAX_LAMBDA) < 1e-9) {
    const g = buildQubo(inp.spec, { frontBeds: k });
    const same = g.n === q.n && g.penalty === q.penalty && g.diag.every((v, i) => Math.abs(v - q.diag[i]) < 1e-9) && g.M.every((v, i) => Math.abs(v - q.M[i]) < 1e-9);
    $('#qs-same').innerHTML = same ? '<span class="good-text">✓ 지금 설정은 "도면 생성" 탭이 실제로 만드는 QUBO와 계수까지 똑같습니다.</span>' : '<span class="error-text">✗ 실제 생성기의 QUBO와 다릅니다.</span>';
  } else $('#qs-same').innerHTML = `지금 설정은 실제 생성기의 기본값(손 가중치 + 공간구문 대리 항 λ = ${SYNTAX_LAMBDA})과 다릅니다. 비교·학습용입니다.`;
  renderAll();
}

function renderAll() {
  stepProgram();
  stepBands();
  stepVars();
  stepGeom();
  stepTerms();
  stepWeights();
  stepMatrix();
  stepPenalty();
  stepProof();
  stepDebug();
  stepSolve();
  stepPlan();
  stepImprove();
}

// ---------- 1 ----------
function stepProgram() {
  const { spec } = S.inp;
  const A = spec.area;
  const t = spec.targets;
  const raw = [
    ['거실', 'living', t.living * A, null],
    ['주방/식당', 'kitchen', t.kitchen * A, null],
    ['현관', 'entrance', t.entrance * A, MIN_AREA.entrance],
    ['안방', 'master', t.master * A, MIN_AREA.master],
  ];
  for (let i = 1; i < spec.bedrooms; i++) raw.push([`침실${i + 1}`, `bed${i}`, t.other * A, MIN_AREA.bedroom]);
  raw.push([spec.baths >= 2 ? '공용욕실' : '욕실', 'bathPublic', t.bath * A, MIN_AREA.bath]);
  if (spec.baths >= 2) raw.push(['부부욕실', 'bathMaster', t.bath * A * 0.9, MIN_AREA.bath]);
  if (spec.dress) raw.push(['드레스룸', 'dress', t.dress * A, MIN_AREA.dress]);
  if (spec.multi) raw.push(['다목적실', 'multi', t.multi * A, null]);
  const a1 = raw.map(([, , v, mn]) => (mn === null ? v : Math.max(mn, v)));
  const sum = a1.reduce((s, v) => s + v, 0);
  const fac = A / sum;
  const prog = programOf(spec);
  const okAll = raw.every(([, key], i) => Math.abs(prog.find((r) => r.key === key).area - a1[i] * fac) < 1e-9);
  live(
    'program',
    table(
      ['실', '비율 × A', '최소 면적', 'a′ = max(…)', `× A/Σa′ = ${f(A)}/${f(sum)} = ${f(fac, 4)}`],
      raw.map(([nm, , v, mn], i) => [nm, `${f(v)}㎡`, mn === null ? '—' : `${mn}㎡`, `${f(a1[i])}㎡${mn !== null && mn > v ? ' <span class="qs-tag">최소로 올림</span>' : ''}`, `<b>${f(a1[i] * fac)}㎡</b>`]),
    ) +
      `<p>합 Σa′ = ${f(sum)}㎡ → 모든 실에 ${f(fac, 4)}를 곱해 합을 ${A}㎡로 맞춥니다.</p>` +
      ok(okAll, '이 표의 마지막 열 = programOf()가 돌려준 면적(모든 실)'),
  );
}

// ---------- 2 ----------
function stepBands() {
  const { spec } = S.inp;
  const A = spec.area;
  const W = A / (7.0 * Math.sqrt(A / 84) ** 0.6);
  const lines = [];
  let k = spec.bedrooms - 1;
  while (true) {
    const need = 3.0 + 3.6 + 2.6 * k;
    const fits = need <= W;
    lines.push(`k = ${k}: 3.0 + 3.6 + 2.6 × ${k} = ${f(need)}m ${fits ? '≤' : '>'} W = ${f(W)}m → ${fits || k === 0 ? `<b>k = ${k}</b>` : '하나 줄임'}`);
    if (fits || k === 0) break;
    k--;
  }
  const q = S.q;
  live(
    'bands',
    `<p>W = ${A} / (7.0 × (${A}/84)<sup>0.3</sup>) = ${A} / ${f(7.0 * Math.sqrt(A / 84) ** 0.6, 3)} = <b>${f(W)}m</b></p><ol class="qs-ol">${lines.map((l) => `<li>${l}</li>`).join('')}</ol>` +
      `<p>템플릿 ${S.tpls.map((t) => `k = ${t}`).join(', ')}를 따로 풉니다. 지금 보는 템플릿: <b>k = ${S.k}</b>.</p>` +
      table(
        ['띠', '실(변수를 갖는 실)', '칸 수'],
        [
          ['앞(남측)', q.bands.front.rooms.map((r) => S.nameOf[r]).join(', '), `m = ${q.bands.front.slots}`],
          ['뒤(북측)', q.bands.back.rooms.map((r) => S.nameOf[r]).join(', '), `k = ${q.bands.back.slots}`],
        ],
      ) +
      ok(k === S.kAuto, `손으로 센 k = ${k} = frontBedCount() = ${S.kAuto}`),
  );
}

// ---------- 3 ----------
function stepVars() {
  const q = S.q;
  const m = q.bands.front.slots;
  const kk = q.bands.back.slots;
  const grid = (band) => {
    const { rooms, slots } = q.bands[band];
    return `<table class="sa-mx"><caption>${band === 'front' ? '앞 띠' : '뒤 띠'}: 칸에 적힌 수 = 변수 번호 i</caption><thead><tr><th></th>${Array.from({ length: slots }, (_, s) => `<th>칸 ${s + 1}</th>`).join('')}</tr></thead><tbody>${rooms
      .map((r) => `<tr><th>${esc(S.nameOf[r])}</th>${Array.from({ length: slots }, (_, s) => `<td>x<sub>${q.vars.findIndex((v) => v.band === band && v.room === r && v.slot === s)}</sub></td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
  };
  live('vars', `<div class="qs-two">${grid('front')}${grid('back')}</div><p>n = m² + k² = ${m}² + ${kk}² = <b>${m * m + kk * kk}</b>개. 올바른 배치(실마다 칸 하나, 칸마다 실 하나)는 m! × k! = ${fact(m)} × ${fact(kk)} = <b>${fact(m) * fact(kk)}</b>가지뿐이지만, 변수만 보면 2ⁿ = ${(2 ** q.n).toExponential(2)}가지 조합이 가능합니다. 8단계의 벌점이 이 차이를 메웁니다.</p>` + ok(q.n === m * m + kk * kk, `변수 수 ${q.n} = ${m * m + kk * kk}`));
}
const fact = (k) => (k <= 1 ? 1 : k * fact(k - 1));

// ---------- 4 ----------
function stepGeom() {
  const q = S.q;
  const m = q.bands.front.slots;
  const k = q.bands.back.slots;
  const ov = (i, j) => Math.max(0, Math.min((i + 1) / m, (j + 1) / k) - Math.max(i / m, j / k)) / Math.min(1 / m, 1 / k);
  const rows = [];
  for (let i = 0; i < m; i++) rows.push([`앞 ${i + 1} [${f(i / m, 3)}, ${f((i + 1) / m, 3)}]`, ...Array.from({ length: k }, (_, j) => (ov(i, j) > 0 ? `<b>${f(ov(i, j), 3)}</b>` : '0'))]);
  // 예시 한 칸
  let ei = 0;
  let ej = 0;
  for (let i = 0; i < m; i++) for (let j = 0; j < k; j++) if (ov(i, j) > 0 && ov(i, j) < 1) [ei, ej] = [i, j];
  const lo = Math.max(ei / m, ej / k);
  const hi = Math.min((ei + 1) / m, (ej + 1) / k);
  live(
    'geom',
    table(['앞 칸 \\ 뒤 칸', ...Array.from({ length: k }, (_, j) => `뒤 ${j + 1} [${f(j / k, 3)}, ${f((j + 1) / k, 3)}]`)], rows) +
      `<p><b>예: 앞 ${ei + 1} × 뒤 ${ej + 1}</b> — 겹친 구간 [${f(lo, 3)}, ${f(hi, 3)}], 길이 ${f(hi - lo, 3)}; 짧은 칸 폭 min(1/${m}, 1/${k}) = ${f(Math.min(1 / m, 1 / k), 3)}; ov = ${f(hi - lo, 3)} / ${f(Math.min(1 / m, 1 / k), 3)} = <b>${f(ov(ei, ej), 3)}</b></p>` +
      ok(checkOv(ov), '이 표의 ov 값 = 거실×주방 항(kitchenLiving)에 들어간 단위 계수(모든 칸 쌍)'),
  );
}
function checkOv(ov) {
  const q = S.q;
  const t = TERMS.find((x) => x.id === 'kitchenLiving');
  const b = boostOf(t, S.inp.spec);
  const n = q.n;
  const idx = (room, band, s) => q.vars.findIndex((v) => v.room === room && v.band === band && v.slot === s);
  for (let i = 0; i < q.bands.front.slots; i++)
    for (let j = 0; j < q.bands.back.slots; j++) {
      const a = idx('living', 'front', i);
      const c = idx('kitchen', 'back', j);
      const key = a < c ? a * n + c : c * n + a;
      const got = (q.unit.kitchenLiving.quad.get(key) || 0) / b;
      if (Math.abs(got - ov(i, j)) > 1e-12) return false;
    }
  return true;
}

// ---------- 5 ----------
function stepTerms() {
  const q = S.q;
  const n = q.n;
  const blocks = TERMS.map((t) => {
    const u = q.unit[t.id];
    const b = boostOf(t, S.inp.spec);
    const items = [...[...u.lin].map(([i, v]) => `x<sub>${i}</sub>(${esc(S.vname(i))}) × ${f(v / b, 3)}`), ...[...u.quad].map(([key, v]) => `x<sub>${Math.floor(key / n)}</sub>·x<sub>${key % n}</sub>(${esc(S.vname(Math.floor(key / n)))} · ${esc(S.vname(key % n))}) × ${f(v / b, 3)}`)];
    const cnt = u.lin.size + u.quad.size;
    return `<details class="qs-term"><summary><b>${esc(t.label)}</b> <span class="mono">(${t.id})</span> — ${RULE[t.id][0]}: ${RULE[t.id][1]} · ${cnt ? `${u.lin.size ? `일차 ${u.lin.size}개` : ''}${u.quad.size ? `이차 ${u.quad.size}개` : ''}` : '<span class="note">이 입력에서는 해당 실이 없어 항이 비어 있음</span>'}</summary>${cnt ? `<p class="mono qs-items">φ = ${items.join(' + ')}</p>` : ''}</details>`;
  });
  live('terms', `<p>항 ${TERMS.length}개. 줄을 누르면 그 항이 어떤 변수(쌍)에 얼마를 주는지 모두 펼쳐 보입니다. 숫자는 가중치·선호 배수를 곱하기 전의 단위 기여입니다.</p>${blocks.join('')}`);
}

// ---------- 6 ----------
function stepWeights() {
  const { spec } = S.inp;
  const hand = weightsOf('hand');
  const W0 = S.W0;
  const l1 = (o) => Object.values(o).reduce((s, x) => s + Math.abs(x || 0), 0);
  const addedRows = S.sx.added.map((a) => {
    const v = SYNTAX[a.key].weights;
    return `<li><b>${esc(a.label)}</b>(선호 "${esc(PREF[a.pref]?.short ?? a.pref)}", ${esc(a.refs)}): ‖w‖₁ = ${f(l1(W0))}, ‖v‖₁ = ${f(l1(v), 3)} → s = ${f(l1(W0))} / ${f(l1(v), 3)} = ${f(l1(W0) / l1(v), 3)}, λ·s = ${f(S.inp.lambda, 2)} × ${f(l1(W0) / l1(v), 3)} = <b>${f(a.scale, 3)}</b></li>`;
  });
  const syn = (id) => S.sx.added.reduce((s, a) => s + a.scale * (SYNTAX[a.key].weights[id] || 0), 0);
  const rows = TERMS.map((t) => {
    const b = boostOf(t, spec);
    const w = S.q.weights[t.id] ?? 0;
    const sy = syn(t.id);
    return [esc(t.label), f(hand[t.id], 2), b === 1 ? '1' : `<b>${b}</b>(${esc(PREF[t.pref[0]]?.short ?? t.pref[0])})`, sy ? sg(sy, 3) : '—', `<b>${f(w * b, 3)}</b>`];
  });
  const okW = TERMS.every((t) => Math.abs((S.q.weights[t.id] ?? 0) * boostOf(t, spec) - ((W0[t.id] ?? 0) * boostOf(t, spec) + syn(t.id))) < 1e-9);
  live(
    'weights',
    `<p>지금 기준 가중치: <b>손</b>${S.inp.sx ? `, 공간구문 대리 항 λ = ${f(S.inp.lambda)}` : ', 공간구문 대리 항 끔'}.</p>` +
      (S.sx.added.length ? `<p>더해진 대리 항:</p><ul class="qs-ol">${addedRows.join('')}</ul>` : `<p class="note">공간구문 선호(거실 중심·사생활 깊이·주방–거실 연계)를 고르면 여기에 대리 항이 더해집니다.</p>`) +
      table(['항', '① 손 w', '× 선호 배수 b', '+ 대리 항 λ·s·v', '= 실제 계수 w·b + λ·s·v'], rows) +
      ok(okW, '실제 계수 = 기준 가중치 × 선호 배수 + Σ λ·s·v (모든 항) = QUBO가 쓴 계수'),
  );
}

// ---------- 7 ----------
function heat(vals, n, clip, sel) {
  const C = 12;
  const L = 4;
  const T = 4;
  const col = (v) => {
    const t = Math.max(-1, Math.min(1, v / clip));
    if (Math.abs(t) < 1e-9) return 'var(--surface-2)';
    return t < 0 ? `rgba(42,120,214,${(0.15 + 0.85 * -t).toFixed(3)})` : `rgba(232,89,12,${(0.15 + 0.85 * t).toFixed(3)})`;
  };
  let out = '';
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out += `<rect x="${L + j * C}" y="${T + i * C}" width="${C - 1}" height="${C - 1}" fill="${col(vals[i * n + j])}" data-ij="${i},${j}" ${sel && sel[0] === i && sel[1] === j ? 'stroke="var(--text-primary)" stroke-width="2"' : ''}><title>${esc(S.vname(i))} × ${esc(S.vname(j))}: ${f(vals[i * n + j], 3)}</title></rect>`;
  return `<svg viewBox="0 0 ${L + n * C + 4} ${T + n * C + 4}" class="qs-heat" role="img" aria-label="QUBO 행렬">${out}</svg>`;
}
let matSel = null;
function stepMatrix() {
  const n = S.q.n;
  let mx = 0;
  for (const v of S.obj) mx = Math.max(mx, Math.abs(v));
  if (!matSel) {
    // 기본: 가장 큰 계수의 칸
    let best = 0;
    for (let i = 0; i < n * n; i++) if (Math.abs(S.obj[i]) > Math.abs(S.obj[best])) best = i;
    matSel = [Math.floor(best / n), best % n];
  }
  const [i, j] = matSel[0] < n && matSel[1] < n ? matSel : [0, 0];
  const ps = S.parts.get(`${i},${j}`) || [];
  const total = ps.reduce((s, p) => s + p.w * p.b * p.u, 0);
  const lines = ps.map((p) => `<tr><td>${esc(TERMS.find((t) => t.id === p.id).label)}</td><td class="mono">${f(p.w, 3)}</td><td class="mono">${p.b}</td><td class="mono">${f(p.u, 3)}</td><td class="mono">${f(p.w * p.b * p.u, 3)}</td></tr>`);
  live(
    'matrix',
    `<div class="qs-two"><div>${heat(S.obj, n, mx, [i, j])}<p class="note">${n} × ${n} 목적 항 행렬(벌점 전). 칸을 누르세요.</p></div><div><p><b>${i === j ? `q<sub>${i}${i}</sub>(일차)` : `q<sub>${i},${j}</sub>(이차)`}</b>: ${esc(S.vname(i))}${i === j ? '' : ` × ${esc(S.vname(j))}`}</p>${
      ps.length
        ? `<table class="gen-table qs-tbl"><thead><tr><th>항</th><th>w</th><th>b</th><th>u</th><th>w·b·u</th></tr></thead><tbody>${lines.join('')}<tr><td><b>합</b></td><td></td><td></td><td></td><td class="mono"><b>${f(total, 3)}</b></td></tr></tbody></table>`
        : '<p class="note">이 두 변수 사이에는 어떤 규칙도 걸리지 않아 0입니다(같은 실의 다른 칸, 같은 칸의 다른 실 쌍은 8단계의 벌점만 받습니다).</p>'
    }${ok(Math.abs(total - S.obj[i * n + j]) < 1e-9, `항별 합 ${f(total, 3)} = 조립된 계수 ${f(S.obj[i * n + j], 3)}`)}</div></div>`,
  );
  document.querySelector('[data-live="matrix"] .qs-heat').addEventListener('click', (e) => {
    const r = e.target.closest('[data-ij]');
    if (!r) return;
    matSel = r.dataset.ij.split(',').map(Number);
    stepMatrix();
  });
}

// ---------- 8 ----------
function stepPenalty() {
  const q = S.q;
  const n = q.n;
  const P = q.penalty;
  const gains = Array.from({ length: n }, (_, i) => {
    let g = Math.abs(S.obj[i * n + i]);
    for (let j = 0; j < n; j++) if (j !== i) g += Math.abs(S.obj[i * n + j]);
    return g;
  });
  const order = gains.map((g, i) => [g, i]).sort((a, b) => b[0] - a[0]);
  const gmax = order[0][0];
  const g0 = q.groups[0];
  const g0n = g0.map((i) => `x<sub>${i}</sub>`);
  // 확인: 최종 대각 = 목적 대각 − 2P, 같은 묶음 쌍 = 목적 + 2P
  const sameGroup = (a, b) => q.groups.some((g) => g.includes(a) && g.includes(b));
  let okDiag = true;
  let okPair = true;
  for (let i = 0; i < n; i++) {
    if (Math.abs(q.diag[i] - (S.obj[i * n + i] - 2 * P)) > 1e-9) okDiag = false;
    for (let j = i + 1; j < n; j++) if (Math.abs(q.M[i * n + j] - (S.obj[i * n + j] + (sameGroup(i, j) ? 2 * P : 0))) > 1e-9) okPair = false;
  }
  S.gmax = gmax;
  live(
    'penalty',
    `<p><b>① 한 변수가 받는 목적 계수 절댓값 합 G<sub>i</sub> = |q<sub>ii</sub>| + Σ<sub>j</sub>|q<sub>ij</sub>|</b> (큰 순서 5개)</p>` +
      table(['변수', 'G_i'], order.slice(0, 5).map(([g, i]) => [`x<sub>${i}</sub> ${esc(S.vname(i))}`, `<span class="mono">${f(g, 3)}</span>`])) +
      `<p>G<sub>max</sub> = ${f(gmax, 3)} → P = ⌈1 + ${f(gmax, 3)}⌉ = <b>${P}</b></p>` +
      `<p><b>② 묶음 하나 펼치기</b> — 묶음 g₁ = {${g0n.join(', ')}} ("${esc(S.vname(g0[0]).split('@')[0])}는 칸 하나")</p><div class="mt-eq">${P}(${g0n.join(' + ')} − 1)² = ${P} − ${P}(${g0n.join(' + ')}) + ${2 * P}(${pairs(g0n).join(' + ')})</div>` +
      `<p>묶음은 모두 ${q.groups.length}개(앞 띠 실 ${q.bands.front.rooms.length} + 앞 칸 ${q.bands.front.slots} + 뒤 띠 실 ${q.bands.back.rooms.length} + 뒤 칸 ${q.bands.back.slots}). 상수 합 offset = ${P} × ${q.groups.length} = <b>${q.offset}</b>.</p>` +
      `<p><b>③ 변수 하나는 묶음 두 개에 들어감</b> → 최종 q<sub>ii</sub> = 목적 q<sub>ii</sub> − 2P. 예: x<sub>0</sub>: ${f(S.obj[0], 3)} − ${2 * P} = <b>${f(q.diag[0], 3)}</b></p>` +
      ok(Math.ceil(gmax + 1) === P, `⌈1 + G_max⌉ = ${Math.ceil(gmax + 1)} = 코드의 P = ${P}`) +
      ok(q.offset === P * q.groups.length, `offset = P × 묶음 수`) +
      ok(okDiag, '모든 i: 최종 q_ii = 목적 q_ii − 2P') +
      ok(okPair, '모든 i &lt; j: 최종 q_ij = 목적 q_ij + (같은 묶음이면 2P, 아니면 0)'),
  );
}
const pairs = (xs) => {
  const out = [];
  for (let a = 0; a < xs.length; a++) for (let b = a + 1; b < xs.length; b++) out.push(`${xs[a]}${xs[b]}`);
  return out;
};

// ---------- 9 ----------
function stepProof() {
  const q = S.q;
  const n = q.n;
  const P = q.penalty;
  const G = S.gmax;
  // 전역 최적해에서 모든 한 변수 뒤집기 Δ
  const x = Uint8Array.from(S.ex.samples[0].x);
  const E0 = energy(q, x);
  const ds = Array.from({ length: n }, (_, i) => {
    x[i] ^= 1;
    const d = energy(q, x) - E0;
    x[i] ^= 1;
    return d;
  });
  const minD = Math.min(...ds);
  // 올바른 배치 전체에서 최소 Δ (m!·k! ≤ 6!·6!까지)
  const total = fact(q.bands.front.slots) * fact(q.bands.back.slots);
  let minAll = Infinity;
  let cnt = 0;
  if (total <= 60000)
    for (const fr of perms(q.bands.front.rooms))
      for (const bk of perms(q.bands.back.rooms)) {
        const y = encode(q, fr, bk);
        const e = energy(q, y);
        for (let i = 0; i < n; i++) {
          y[i] ^= 1;
          minAll = Math.min(minAll, energy(q, y) - e);
          y[i] ^= 1;
        }
        cnt++;
      }
  live(
    'proof',
    `<ol class="qs-proof">
      <li><b>올바른 배치에서는 모든 묶음의 합이 1</b>이므로 벌점은 0입니다. E(x) = Σ w<sub>t</sub>b<sub>t</sub>φ<sub>t</sub>(x).</li>
      <li><b>변수 하나를 켜면</b>(0 → 1) 그 변수가 속한 묶음 두 개의 합이 1 → 2가 되어 벌점이 P(2−1)² × 2 = <b>2P</b> 늘어납니다. <b>끄면</b>(1 → 0) 두 묶음이 1 → 0이 되어 역시 P(0−1)² × 2 = <b>2P</b> 늘어납니다. 어느 쪽이든 벌점 변화 = +2P = +${2 * P}.</li>
      <li>같은 뒤집기에서 <b>목적 항의 변화</b>는 ±(q<sub>ii</sub> + Σ<sub>j</sub> q<sub>ij</sub>x<sub>j</sub>)이고, 그 크기는 |q<sub>ii</sub>| + Σ<sub>j</sub>|q<sub>ij</sub>| = G<sub>i</sub> ≤ G<sub>max</sub> = ${f(G, 3)}를 넘을 수 없습니다(삼각부등식).</li>
      <li>따라서 Δ<sub>i</sub> ≥ 2P − G<sub>max</sub> = ${2 * P} − ${f(G, 3)} = <b>${f(2 * P - G, 3)}</b>. P = ⌈1 + G<sub>max</sub>⌉ &gt; G<sub>max</sub>이므로 2P − G<sub>max</sub> &gt; P &gt; 0. ∎</li>
      <li><b>뜻</b>: 올바른 배치에서 변수 하나만 바꾸면 반드시 에너지가 ${f(2 * P - G, 1)} 이상 오릅니다. 그래서 SA처럼 한 변수씩 바꾸는 풀이기는 올바른 배치 사이를 건너가려면 이 언덕을 넘어야 합니다(코드로 보기 탭의 SA 한 걸음씩에서 본 +57 같은 값).</li>
    </ol>` +
      `<p><b>숫자로 확인</b> — 전역 최적해에서 변수 ${n}개를 하나씩 뒤집은 Δ의 최솟값: <b>${f(minD, 3)}</b>${cnt ? `; 올바른 배치 ${cnt.toLocaleString()}개 전부에서 모든 한 변수 뒤집기(${(cnt * n).toLocaleString()}번)의 Δ 최솟값: <b>${f(minAll, 3)}</b>` : ''} (하한 ${f(2 * P - G, 3)})</p>` +
      ok(minD >= 2 * P - G - 1e-9 && (!cnt || minAll >= 2 * P - G - 1e-9), `실제 최소 Δ ≥ 2P − G_max = ${f(2 * P - G, 3)}`) +
      `<p><b>전역에서도 맞나?</b> 위 정리는 국소 최소까지만 말합니다. 변수 ${n}개의 모든 조합 2<sup>${n}</sup> = ${(2 ** n).toLocaleString()}개를 다 계산해, 가장 낮은 에너지가 올바른 배치인지 직접 확인할 수 있습니다(Gray 코드: 한 번에 변수 하나만 바꾸며 Δ로 에너지를 갱신).</p>` +
      (n <= 25 ? `<button type="button" class="button-primary small" id="qs-brute">2<sup>${n}</sup>개 전체 확인 실행</button> <span id="qs-brute-out" class="note"></span>` : `<p class="note">변수가 ${n}개라 2<sup>${n}</sup>개는 브라우저에서 너무 많습니다. 템플릿을 바꾸거나 면적을 줄여 변수가 25개 이하일 때 실행할 수 있습니다.</p>`),
  );
  $('#qs-brute')?.addEventListener('click', brute);
}
function* perms(list) {
  if (list.length <= 1) return yield list.slice();
  for (let i = 0; i < list.length; i++) for (const p of perms([...list.slice(0, i), ...list.slice(i + 1)])) yield [list[i], ...p];
}
function brute() {
  const q = S.q;
  const { n, diag, M } = q;
  const out = $('#qs-brute-out');
  const x = new Uint8Array(n);
  const d = Float64Array.from(diag);
  let E = q.offset;
  // 묶음 합과 '어긴 묶음 수'를 같이 갱신
  const gOf = Array.from({ length: n }, () => []);
  q.groups.forEach((g, gi) => g.forEach((i) => gOf[i].push(gi)));
  const gs = new Int32Array(q.groups.length);
  let bad = q.groups.length;
  let minE = E;
  let minFeasible = bad === 0;
  let minInf = E;
  const total = 2 ** n;
  let t = 1;
  const t0 = performance.now();
  const chunk = () => {
    const end = Math.min(total, t + (1 << 20));
    for (; t < end; t++) {
      const i = 31 - Math.clz32(t & -t);
      E += d[i];
      const on = x[i] === 0;
      x[i] ^= 1;
      const s = on ? 1 : -1;
      const row = i * n;
      for (let j = 0; j < n; j++) if (j !== i) d[j] += (1 - 2 * x[j]) * M[row + j] * s;
      d[i] = -d[i];
      for (const g of gOf[i]) {
        const before = gs[g] === 1;
        gs[g] += s;
        const after = gs[g] === 1;
        if (before && !after) bad++;
        else if (!before && after) bad--;
      }
      if (E < minE - 1e-9) {
        minE = E;
        minFeasible = bad === 0;
      }
      if (bad > 0 && E < minInf) minInf = E;
    }
    out.textContent = `${((100 * t) / total).toFixed(0)}% …`;
    if (t < total) setTimeout(chunk, 0);
    else
      out.innerHTML = `${total.toLocaleString()}개를 ${((performance.now() - t0) / 1000).toFixed(1)}초에 계산. 전체 최솟값 ${f(minE, 3)} (${minFeasible ? '올바른 배치' : '<b class="error-text">제약을 어긴 배치</b>'}), 전역 최적해 ${f(S.opt, 3)}, 제약을 어긴 배치의 최솟값 ${f(minInf, 3)} (차이 ${f(minInf - minE, 3)}). ${
        minFeasible && Math.abs(minE - S.opt) < 1e-9 ? '<span class="good-text">✓ 2ⁿ개 전체에서도 가장 낮은 에너지는 올바른 배치 = 전역 최적해입니다.</span>' : '<span class="error-text">✗ 불일치</span>'
      }`;
  };
  out.textContent = '계산 중…';
  setTimeout(chunk, 0);
}

// ---------- 10 ----------
function stepDebug() {
  const q = S.q;
  const n = q.n;
  const P = q.penalty;
  const x = S.x;
  const on = [...x].map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  // 펼친 꼴
  const linRows = on.map((i) => [`x<sub>${i}</sub> ${esc(S.vname(i))}`, f(S.obj[i * n + i], 3), `− ${2 * P}`, `<b>${f(q.diag[i], 3)}</b>`]);
  const linSum = on.reduce((s, i) => s + q.diag[i], 0);
  const pairRows = [];
  let pairSum = 0;
  for (let a = 0; a < on.length; a++)
    for (let b = a + 1; b < on.length; b++) {
      const i = on[a];
      const j = on[b];
      const v = q.M[i * n + j];
      if (Math.abs(v) < 1e-12) continue;
      pairSum += v;
      const ps = (S.parts.get(`${i},${j}`) || []).map((p) => TERMS.find((t) => t.id === p.id).label);
      const pen = v - S.obj[i * n + j];
      pairRows.push([`x<sub>${i}</sub>·x<sub>${j}</sub>`, `${esc(S.vname(i))} · ${esc(S.vname(j))}`, ps.length ? esc(ps.join(', ')) : '—', f(S.obj[i * n + j], 3), pen ? `+ ${f(pen, 0)}(같은 묶음)` : '0', `<b>${f(v, 3)}</b>`]);
    }
  const expanded = q.offset + linSum + pairSum;
  // 원래 꼴
  const phi = features(q, x);
  const termRows = [];
  let objSum = 0;
  TERMS.forEach((t, k) => {
    if (Math.abs(phi[k]) < 1e-12) return;
    const w = q.weights[t.id] ?? 0;
    const b = boostOf(t, S.inp.spec);
    objSum += w * phi[k];
    termRows.push([esc(t.label), f(w, 3), String(b), f(phi[k] / b, 3), `<b>${f(w * phi[k], 3)}</b>`]);
  });
  const gRows = q.groups.map((g) => {
    const s = g.reduce((a, i) => a + x[i], 0);
    return { g, s };
  });
  const penSum = gRows.reduce((a, r) => a + P * (r.s - 1) ** 2, 0);
  const badRows = gRows.filter((r) => r.s !== 1).map((r) => [`{${r.g.map((i) => esc(S.vname(i))).join(', ')}}`, String(r.s), `${P} × (${r.s} − 1)² = <b>${P * (r.s - 1) ** 2}</b>`]);
  const Ecode = energy(q, x);
  const grid = (band) => {
    const { rooms, slots } = q.bands[band];
    const idx = (r, s) => q.vars.findIndex((v) => v.band === band && v.room === r && v.slot === s);
    const col = Array.from({ length: slots }, (_, s) => rooms.reduce((a, r) => a + x[idx(r, s)], 0));
    return `<table class="sa-mx qs-click"><caption>${band === 'front' ? '앞 띠' : '뒤 띠'} (칸을 눌러 0/1 바꾸기)</caption><thead><tr><th></th>${Array.from({ length: slots }, (_, s) => `<th>칸 ${s + 1}</th>`).join('')}<th>합</th></tr></thead><tbody>${rooms
      .map((r) => {
        const row = Array.from({ length: slots }, (_, s) => idx(r, s));
        const rs = row.reduce((a, i) => a + x[i], 0);
        return `<tr><th>${esc(S.nameOf[r])}</th>${row.map((i) => `<td class="${x[i] ? 'on' : ''}" data-x="${i}">${x[i]}</td>`).join('')}<td class="sum ${rs === 1 ? '' : 'bad'}">${rs}</td></tr>`;
      })
      .join('')}<tr><th>합</th>${col.map((c) => `<td class="sum ${c === 1 ? '' : 'bad'}">${c}</td>`).join('')}<td></td></tr></tbody></table>`;
  };
  live(
    'debug',
    `<div class="qs-two">${grid('front')}${grid('back')}</div>
     <p class="qs-ctl"><button type="button" class="button-ghost small" data-dbg="opt">전역 최적해로</button> <button type="button" class="button-ghost small" data-dbg="rand">무작위 올바른 배치</button> <button type="button" class="button-ghost small" data-dbg="clear">모두 0</button></p>
     <h3>방법 A — 펼친 꼴: offset + Σ q<sub>ii</sub>x<sub>i</sub> + Σ q<sub>ij</sub>x<sub>i</sub>x<sub>j</sub></h3>
     <p>① offset = P × 묶음 수 = ${P} × ${q.groups.length} = <b>${q.offset}</b></p>
     <p>② 켜진 변수 ${on.length}개의 일차 계수(목적 q<sub>ii</sub> − 2P)</p>${on.length ? table(['변수', '목적 q_ii', '벌점', '최종 q_ii'], linRows) : ''}<p>합 = <b>${f(linSum, 3)}</b></p>
     <p>③ 켜진 변수 쌍 가운데 계수가 0이 아닌 ${pairRows.length}쌍</p>${pairRows.length ? table(['쌍', '실·칸', '걸린 항', '목적', '벌점', 'q_ij'], pairRows) : ''}<p>합 = <b>${f(pairSum, 3)}</b></p>
     <div class="mt-eq">E = ${q.offset} ${sg(linSum, 3)} ${sg(pairSum, 3)} = <b>${f(expanded, 3)}</b></div>
     <h3>방법 B — 원래 꼴: Σ w<sub>t</sub> b<sub>t</sub> φ<sub>t</sub>(x) + P Σ (Σx − 1)²</h3>
     ${termRows.length ? table(['항', 'w', 'b', 'φ (단위)', 'w·b·φ'], termRows) : ''}<p>목적 합 = <b>${f(objSum, 3)}</b></p>
     ${badRows.length ? `<p>합이 1이 아닌 묶음 ${badRows.length}개:</p>${table(['묶음', 'Σx', '벌점'], badRows)}` : '<p>모든 묶음의 합이 1 → 벌점 0 (올바른 배치)</p>'}<p>벌점 합 = <b>${f(penSum, 3)}</b></p>
     <div class="mt-eq">E = ${f(objSum, 3)} + ${f(penSum, 3)} = <b>${f(objSum + penSum, 3)}</b></div>` +
      ok(Math.abs(expanded - Ecode) < 1e-9 && Math.abs(objSum + penSum - Ecode) < 1e-9, `방법 A ${f(expanded, 3)} = 방법 B ${f(objSum + penSum, 3)} = energy() ${f(Ecode, 3)}`),
  );
  const box = document.querySelector('[data-live="debug"]');
  box.querySelectorAll('[data-x]').forEach((td) =>
    td.addEventListener('click', () => {
      S.x[Number(td.dataset.x)] ^= 1;
      stepDebug();
      stepPlan();
    }),
  );
  box.querySelectorAll('[data-dbg]').forEach((b) =>
    b.addEventListener('click', () => {
      const v = b.dataset.dbg;
      if (v === 'opt') S.x = Uint8Array.from(S.ex.samples[0].x);
      else if (v === 'clear') S.x = new Uint8Array(q.n);
      else {
        const sh = (a) => a.map((r) => [Math.random(), r]).sort((p, z) => p[0] - z[0]).map((p) => p[1]);
        S.x = encode(q, sh(q.bands.front.rooms), sh(q.bands.back.rooms));
      }
      stepDebug();
      stepPlan();
    }),
  );
}

// ---------- 11 ----------
function stepSolve() {
  const q = S.q;
  const rows = S.ex.samples.map((s, r) => {
    const d = decode(q, s.x);
    return [String(r + 1), `<span class="mono">${f(s.e, 3)}</span>`, d.front.map((k) => S.nameOf[k]).join(' → '), d.back.map((k) => S.nameOf[k]).join(' → '), `<button type="button" class="button-ghost small" data-load="${r}">디버거로</button>`];
  });
  live('solve', `<p>올바른 배치 ${(fact(q.bands.front.slots) * fact(q.bands.back.slots)).toLocaleString()}가지를 모두 계산했습니다. 에너지가 낮은 순서 ${rows.length}개:</p>` + table(['순위', 'E', '앞 띠(왼→오)', '뒤 띠(왼→오)', ''], rows) + `<p>전역 최적해 E* = <b>${f(S.opt, 3)}</b></p>`);
  document.querySelectorAll('[data-live="solve"] [data-load]').forEach((b) =>
    b.addEventListener('click', () => {
      S.x = Uint8Array.from(S.ex.samples[Number(b.dataset.load)].x);
      stepDebug();
      stepPlan();
      document.getElementById('debug').scrollIntoView({ behavior: 'smooth' });
    }),
  );
}

// ---------- 12 ----------
function allocHtml(trace) {
  return trace
    .map((t) => {
      const minSum = t.mins.reduce((s, v) => s + v, 0);
      const extra = t.desired.map((v, i) => Math.max(0, v - t.mins[i]));
      const exSum = extra.reduce((s, v) => s + v, 0);
      const left = t.total - minSum;
      const narrow = t.total <= minSum;
      const rows = t.names.map((nm, i) => [esc(nm), `${f(t.areas[i])}㎡ ÷ ${f(t.depths[i])}m = ${f(t.desired[i])}`, f(t.mins[i], 1), f(extra[i]), narrow ? `${f(t.mins[i], 1)} × ${f(t.total)}/${f(minSum)}` : `${f(t.mins[i], 1)} + ${f(left)} × ${f(extra[i])}/${f(exSum)}`, `<b>${f(t.out[i])}m</b>${t.out[i] < t.mins[i] - 1e-9 ? ' <span class="qs-tag bad">최소 폭 미달</span>' : ''}`]);
      return `<h3>${t.band === 'front' ? '앞 띠' : '뒤 띠(열)'} — 띠 폭 ${f(t.total)}m${t.suite ? `(안방 뒤 부속실 ${f(t.suite)}m 제외)` : ''}, 깊이 ${t.band === 'front' ? `D·f = ${f(t.D)} × ${f(t.Df / t.D)} = ${f(t.Df)}` : `D − D<sub>앞</sub> = ${f(t.Db)}`}m</h3>` + `<p>Σ최소 폭 = ${f(minSum)}m, 남는 폭 = ${f(t.total)} − ${f(minSum)} = <b>${f(left)}m</b>${narrow ? ' → <b>모자람</b>: 최소 폭에 비례해 모두 줄임(최소 폭 미달 → 좁은 실 감점)' : `, Σ초과분 = ${f(exSum)}`}</p>` + table(['실', '원하는 폭 d = 면적 ÷ 깊이', '최소 m', 'max(0, d − m)', '식', '폭 w'], rows);
    })
    .join('');
}
function jLine(spec, sc) {
  if (!sc) return '분석 실패';
  const hasPref = spec.prefs.length > 0;
  const wm = hasPref ? 0.45 : 0.45 / 0.7;
  const wf = hasPref ? 0.25 : 0.25 / 0.7;
  return `J = ${f(wm, 3)} × ${f(sc.rules, 1)}(규칙 충족) + ${f(wf, 3)} × ${f(sc.fit, 1)}(면적 부합)${hasPref ? ` + 0.30 × ${f(sc.prefScore, 1)}(선호)` : ''}${sc.unit?.validity?.valid === false ? ' − 40' : ''}${sc.narrow ? ` − 15 × ${sc.narrow}(좁은 실)` : ''}${sc.doorIssues ? ` − 15 × ${sc.doorIssues}(문 동선)` : ''} = <b>${f(sc.objective, 1)}</b>`;
}
let planToken = 0;
async function stepPlan() {
  const token = ++planToken;
  const q = S.q;
  const d = decode(q, S.x);
  const spec = S.inp.spec;
  if (token !== planToken) return;
  // (가) 기본 치수 한 번
  const p0 = { ...defaultParams(spec), frontOrder: d.front, backOrder: d.back };
  const tr0 = [];
  const lay0 = buildLayout(spec, { ...structuredClone(p0), trace: tr0 });
  const sc0 = scoreLayout(spec, lay0);
  // (나) 실제 생성기와 같은 다듬기 30번(깊이 D·앞 띠 비율 f·작은방 폭 w·안방 깊이 g·면적 배수를 하나씩 조금 바꾸고 J가 오르면 채택)
  const best = realize(spec, d, rng(1), 30);
  const tr1 = [];
  const lay1 = buildLayout(spec, { ...structuredClone(best.params), trace: tr1 });
  const P = (p) => [f(p.depth), f(p.frontShare), f(p.bedWidth), f(p.masterDepth)];
  const pr = [P(p0), P(best.params)];
  const names = ['깊이 D (m)', '앞 띠 비율 f', '작은방 폭 w (m)', '안방 깊이 비율 g'];
  live(
    'plan',
    `<p>지금 디버거의 배치(${d.repaired ? '<b>제약을 어겨 탐욕 복구한 순서</b>' : '올바른 배치'}): 앞 ${d.front.map((k) => S.nameOf[k]).join(' → ')} / 뒤 ${d.back.map((k) => S.nameOf[k]).join(' → ')}.</p>
     <h3>순서는 그대로, 치수 변수만 바꿔 개선</h3>
     ${table(['변수', '(가) 기본값', '(나) 다듬기 30번 뒤'], names.map((nm, i) => [nm, pr[0][i], pr[0][i] === pr[1][i] ? pr[1][i] : `<b>${pr[1][i]}</b>`]).concat([['폭 W = A / D (m)', f(lay0.W), f(lay1.W)], ['순위 점수 J', f(sc0?.objective, 1), `<b>${f(best.objective, 1)}</b>`]]))}
     <p class="note">다듬기: 매번 변수 하나를 고르게 뽑아 조금 바꾸고(D ×0.94~1.06, f ±0.04, w ±0.2m, g ±0.08, 면적 배수 ×0.96~1.04) 평면을 다시 만들어 J가 오르면 그 값을 채택합니다. 범위: D ${f(7.0 * Math.sqrt(spec.area / 84) ** 0.6)}~${f(9.8 * Math.sqrt(spec.area / 84) ** 0.6)}m, f 0.48~0.66, w 2.5~3.6m, g 0.6~1. 도면 생성 탭과 같은 함수(realize)입니다.</p>
     <div class="qs-two"><figure>${layoutSvg(lay0, { mode: 'space' })}<figcaption>(가) 기본값 — J ${f(sc0?.objective, 1)}</figcaption></figure><figure>${layoutSvg(lay1, { mode: 'space' })}<figcaption>(나) 다듬기 뒤 — J ${f(best.objective, 1)}</figcaption></figure></div>
     <details open><summary><b>(가) 기본값의 방 폭 계산</b></summary>${allocHtml(tr0)}<div class="mt-eq">${jLine(spec, sc0)}</div></details>
     <details open><summary><b>(나) 다듬기 뒤의 방 폭 계산</b></summary>${allocHtml(tr1)}<div class="mt-eq">${jLine(spec, best)}</div></details>
     <p class="note">면적 부합 = max(0, 100 − 250 × 실별 상대 오차 평균). 규칙 충족 = 시공 가능성 규칙(선택 규칙 제외)의 가중 충족률.</p>` +
      ok(Math.abs(lay1.W * lay1.D - spec.area) < 1e-6 && Math.abs(lay0.W * lay0.D - spec.area) < 1e-6, `두 평면 모두 W × D = 전용면적 ${spec.area}㎡`) +
      ok(Math.abs(scoreLayout(spec, lay1).objective - best.objective) < 1e-9, '다듬은 매개변수로 다시 만든 평면의 J = realize()가 돌려준 J'),
  );
}

// ---------- 13 ----------
let improveToken = 0;
async function stepImprove() {
  const token = ++improveToken;
  const inp = S.inp;
  const sets = [
    ['① 손 가중치', { ...inp, wset: 'hand', sx: false }],
    [`② 손 + 공간구문 대리 항(λ = ${f(inp.lambda)})`, { ...inp, wset: 'hand', sx: true }],
  ];
  const rows = [];
  for (const [label, cfg] of sets) {
    let best = null;
    for (const k of S.tpls) {
      const { q } = build(cfg, k);
      const ex = runSolver('exact', q, { seed: 1, budgetMs: 20000 });
      const d = decode(q, ex.samples[0].x);
      const sc = realize(inp.spec, d, rng(1), 30); // 도면 생성과 같은 다듬기 30번
      if (sc && (!best || sc.objective > best.sc.objective)) best = { k, e: ex.samples[0].e, d, sc, layout: sc.layout };
    }
    rows.push({ label, ...best });
    if (token !== improveToken) return;
  }
  const same = !S.inp.spec.prefs.some((p) => ['livingCentral', 'privacy', 'kitchenLink'].includes(p));
  live(
    'improve',
    table(
      ['가중치', '템플릿', '전역 최적해 E*', '앞 띠', '뒤 띠', '규칙 충족', '순위 점수 J'],
      rows.map((r) => [r.label, `k = ${r.k}`, f(r.e, 3), r.d.front.map((k) => S.nameOf[k]).join(' → '), r.d.back.map((k) => S.nameOf[k]).join(' → '), f(r.sc.rules, 1), `<b>${f(r.sc.objective, 1)}</b>`]),
    ) +
      `<div class="qs-three">${rows.map((r) => `<figure>${layoutSvg(r.layout, { mode: 'space' })}<figcaption>${esc(r.label)}</figcaption></figure>`).join('')}</div>` +
      `<p class="note">순서마다 도면 생성과 같은 다듬기 30번을 한 뒤 J를 쟀습니다(실제 생성기는 여기에 동점·근접 해 여러 개를 재순위합니다). 에너지는 가중치 세트마다 척도가 달라 서로 비교하지 않습니다.${same ? ' 공간구문 선호를 고르지 않아 ①과 ②는 같습니다.' : ''}</p>`,
  );
}

// ---------- 입력 ----------
let timer = null;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    matSel = null;
    recompute();
  }, 120);
};
document.querySelectorAll('#qs-input select, #qs-input input').forEach((el) => el.addEventListener(el.type === 'range' ? 'input' : 'change', schedule));
recompute();

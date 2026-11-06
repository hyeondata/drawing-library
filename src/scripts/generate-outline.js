// 도면 생성 탭: 첫 단계에서 AI 허브 외곽 형태(직사각형이 아닌 것)를 고르면 자유형 엔진(칸 담금질)으로 만든다.
// 외곽 = 고른 묶음의 대표 세대 외곽(전용면적에 맞춰 늘이고 줄임), 실 구성 = 같은 묶음에서 고른 침실 수의 실제 세대,
// 실 면적 목표 = 뒤 단계에서 고른 값(거실·작은방·안방·주방·화장실·현관·드레스룸·다목적실 면적비). 데이터: scripts/build-outlines.mjs.
import { CELL, SYNTAX_TARGETS, WEIGHTS, buildProblem, roomPolygons } from '../freeform/engine.js';
import { largest, maskFromUnit, maskSvg } from '../freeform/outline.js';
import { generatedNumber, toAihubSPAPolys } from '../generate/aihub.js';
import { minSidesFor } from '../generate/layout.js';
import { planSvg, roomNames } from '../freeform/render.js';

const OUTDOOR = new Set(['발코니', '실외기실']);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let data = null;
const load = (base) => (data ??= fetch(`${base}data/outlines.json`).then((r) => r.json()));

/** 실 구성을 빌려 올 세대: 같은 묶음(없으면 전체)에서 고른 침실 수, 화장실·드레스룸·다목적실이 가장 비슷한 세대. */
export function programOf(all, o, spec) {
  const pool = o.byBeds[spec.bedrooms] ?? all.flatMap((x) => x.byBeds[spec.bedrooms] ?? []);
  const cost = (u) => 2 * Math.abs(Math.min(3, u.baths) - spec.baths) + (u.dress !== spec.dress) + (u.multi !== spec.multi);
  return [...pool].sort((a, b) => cost(a) - cost(b))[0] ?? null;
}

/** 실 종류별 목표 면적비를 칸 수 목표로. 침실은 큰 것부터 안방, 정하지 않은 실(기타)은 남는 몫을 원래 면적 비율로 나눈다. */
export function retarget(P, spec) {
  const T = spec.targets;
  const areaOf = (k) => P.unit.rooms[P.rooms[k].src].area;
  const mv = P.movable.filter((k) => P.rooms[k].src !== undefined);
  const beds = mv.filter((k) => P.rooms[k].type === '침실').sort((a, b) => areaOf(b) - areaOf(a));
  const BY = { 거실: T.living, 주방: T.kitchen, 화장실: T.bath, 현관: T.entrance, 드레스룸: T.dress, 다목적공간: T.multi };
  const share = {};
  for (const k of mv) share[k] = P.rooms[k].type === '침실' ? (k === beds[0] ? T.master : T.other) : BY[P.rooms[k].type];
  const rest = mv.filter((k) => !share[k]);
  const used = mv.reduce((s, k) => s + (share[k] || 0), 0);
  const left = Math.max(0.04 * rest.length, 1 - used);
  const restArea = rest.reduce((s, k) => s + areaOf(k), 0) || 1;
  for (const k of rest) share[k] = (left * areaOf(k)) / restArea;
  const cells = mv.reduce((s, k) => s + P.target[k], 0);
  const sum = mv.reduce((s, k) => s + share[k], 0);
  for (const k of mv) P.target[k] = (share[k] / sum) * cells;
  return P;
}

/**
 * 빌려 온 실제 세대 실 구성에 안방 표시: 가장 큰 침실 = key 'master'(retarget과 같은 규칙). 원본 데이터는 바꾸지 않는다.
 * 최소 실 폭을 베이스라인 R5(minSidesFor(사양), 안방 별도)로 쓰기 위함(변경 8, Confluence 10-12).
 */
export function withMaster(prog) {
  const beds = prog.rooms.map((r, i) => [r, i]).filter(([r]) => r.type === '침실').sort((a, b) => b[0].area - a[0].area);
  const mi = beds[0]?.[1];
  return { ...prog, rooms: prog.rooms.map((r, i) => (i === mi ? { ...r, key: 'master' } : r)) };
}

/** 자유형 평면(칸 배정) → AI 허브 SPA. 발코니·실외기실 포함, 실마다 칸 경계 다각형. */
export function freeformSPA(assign, P, number) {
  const rooms = P.rooms.filter((r) => assign.includes(r.k)).map((r) => ({ type: r.type, loops: roomPolygons(assign, P, r.k) }));
  return toAihubSPAPolys(rooms, number);
}

/**
 * 자유형 안 순서: 문 동선이 끊긴 안(현관에서 문으로 못 가는 실이 있음)은 뒤로, 그다음 에너지 낮은 순.
 * 에너지의 access 항은 칸 인접으로 도달을 보지만 문 배치는 공유 변이 문 폭보다 짧으면 문을 못 달아,
 * 현관이 고립된 안이 에너지 최저가 될 수 있다(Confluence 10-14 댓글). 계산은 그대로, 보여 주는 순서만.
 */
export function rankCands(cands) {
  return cands.sort((a, b) => (a.unreachable.length > 0) - (b.unreachable.length > 0) || a.summary.total - b.summary.total);
}

/** 자유형 생성 과정 단계(번호 = 화면 번호). */
export const FF_STAGES = [
  ['외곽', '실제 세대 외곽을 0.3 m 칸으로'],
  ['실 구성·목표', '실 목록, 목표 면적, 최소 폭(R5)'],
  ['초기 배치', '칸을 실에 처음 나눔'],
  ['담금질(SA)', '칸·벽 옮기기, 에너지 낮추기'],
  ['최저 에너지 배치', '찾은 것 중 에너지 최저'],
  ['문·창', '문 그래프와 바깥 벽 창'],
];
const TERM_KO = { area: '면적', compact: '반듯함', corner: '꺾임', thin: '최소 폭', adj: '필요 인접', extra: '금지 인접', window: '창', access: '문 동선', through: '침실 통과', entry: '현관', outline: '외곽 꺾임', syntax: '공간구문' };

export function createOutlineRunner({ base, setProgress, $ }) {
  const st = { worker: null, cands: [], current: 0, P: null, o: null, prog: null, spec: null, stage: 1, snap: -1, timer: null };
  const download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const numberOf = () => generatedNumber({ area: st.spec.area, bedrooms: st.spec.bedrooms, candidate: st.current + 1, seed: st.cands[st.current].seed });
  const namesOf = (c) => roomNames(st.P.rooms.filter((r) => c.assign.includes(r.k)), (k) => c.sizes[k] || 0);
  const titleOf = () => `${st.spec.area}㎡ · 방 ${st.spec.bedrooms}개 · 형태 ${st.o.id.slice(1)} · ${st.current + 1}안`;
  $('#ff-spa')?.addEventListener('click', () => st.cands.length && download(new Blob([JSON.stringify(freeformSPA(st.cands[st.current].assign, st.P, numberOf()))], { type: 'application/json' }), `APT_FP_SPA_${numberOf()}.json`));
  $('#ff-svg')?.addEventListener('click', () => st.cands.length && download(new Blob([$('#gen-ff-plan svg')?.outerHTML || ''], { type: 'image/svg+xml' }), `generated_${st.spec.area}m2_${st.spec.bedrooms}bed_${st.o.id}_${st.current + 1}.svg`));
  const stopPlay = () => {
    clearInterval(st.timer);
    st.timer = null;
    if ($('#ff-play')) $('#ff-play').textContent = '▶ 자동 재생';
  };
  const setStage = (k, stop = false) => {
    st.stage = Math.max(1, Math.min(FF_STAGES.length, k));
    if (stop) stopPlay();
    renderProcess();
  };
  $('#ff-prev')?.addEventListener('click', () => setStage(st.stage - 1, true));
  $('#ff-next')?.addEventListener('click', () => setStage(st.stage + 1, true));
  $('#ff-play')?.addEventListener('click', () => {
    if (st.timer) return stopPlay();
    if (st.stage >= FF_STAGES.length) st.stage = 0;
    $('#ff-play').textContent = '❚❚ 멈춤';
    setStage(st.stage + 1);
    st.timer = setInterval(() => (st.stage >= FF_STAGES.length ? stopPlay() : setStage(st.stage + 1)), 1600);
  });

  function renderProcess() {
    const c = st.cands[st.current];
    if (!c || !$('#ff-steps')) return;
    const { P, spec, o, prog } = st;
    const k = st.stage;
    $('#ff-steps').innerHTML = FF_STAGES.map(([t, sub], i) => `<li><button type="button" data-ff-stage="${i + 1}" aria-current="${k === i + 1 ? 'step' : 'false'}"><span class="gen-num">${i + 1}</span><span><b>${t}</b><small>${sub}</small></span></button></li>`).join('');
    $('#ff-steps').querySelectorAll('[data-ff-stage]').forEach((b) => b.addEventListener('click', () => setStage(Number(b.dataset.ffStage), true)));
    $('#ff-count').textContent = `${k} / ${FF_STAGES.length}`;
    const names = namesOf(c);
    const plan = (assign, title, mode = 'space', openings = []) => planSvg(assign, P, { openings, names, mode, title, areaOf: (r) => (c.sizes[r] || 0) * P.sx * P.sy });
    const snaps = c.snaps || [];
    const hist = c.history || [];
    const termsOf = (t) => Object.entries(t || {}).filter(([, v]) => v > 1e-9).map(([n, v]) => `${TERM_KO[n] || n} ${v.toFixed(2)}`).join(' · ') || '—';
    let svg = '';
    let text = '';
    if (k === 1) {
      svg = maskSvg(st.mask, { title: `1. 외곽 · 형태 ${o.id.slice(1)}`, sides: spec.balcony ? ['S'] : [] });
      text = `<p>형태 ${esc(o.id.slice(1))}의 대표 세대 <b>${esc(o.rep.id)}</b> 외곽을 전용면적 ${spec.area}㎡에 맞춰 늘이거나 줄이고 <b>0.3 m 칸 ${st.mask.n.toLocaleString()}개</b>(${st.mask.nx} × ${st.mask.ny} 상자)로 나눕니다. ${spec.balcony ? '남쪽 앞면에 발코니(깊이 1.5 m) 칸을 붙입니다.' : ''}</p><p class="note">이 외곽 × 침실 수는 외곽 투영 검증을 통과하지 못해 정확 QUBO 대신 자유형 엔진(칸 담금질)으로 만듭니다. 공간구문 정확성은 주장하지 않습니다.</p>`;
    } else if (k === 2) {
      svg = maskSvg(st.mask, { title: '2. 실 구성·목표', sides: spec.balcony ? ['S'] : [] });
      const mv = P.movable.filter((r) => !OUTDOOR.has(P.rooms[r].type));
      const rows = mv.map((r) => `<tr><td>${esc(names[r] || P.rooms[r].type)}</td><td class="mono">${(P.target[r] * CELL * CELL).toFixed(1)}</td><td class="mono">${P.minWidthM?.[r] ? P.minWidthM[r].toFixed(2) : '—'}</td></tr>`).join('');
      text = `<p>실 구성은 같은 묶음의 실제 세대 <b>${esc(prog.id)}</b>(침실 ${prog.beds}·화장실 ${prog.baths})에서 빌려 오고, 목표 면적은 앞 단계에서 고른 면적비 × 전용면적입니다. 최소 폭은 베이스라인 R5(실측 하위 5% 비 × 침실 한 변)입니다. 필요한 인접(문을 낼 쌍) <b>${P.need.length}개</b>.</p><table class="gen-table"><thead><tr><th>실</th><th>목표 ㎡</th><th>최소 폭 m</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else if (k === 3) {
      const s0 = snaps[0];
      svg = s0 ? plan(s0.assign, '3. 초기 배치') : '';
      text = `<p>실마다 씨앗 칸에서 목표 면적만큼 칸을 키워 외곽을 처음 나눕니다(시드 ${c.seed}). 에너지 <b>${s0 ? s0.E.toFixed(2) : '—'}</b>.</p><p class="note">항: ${termsOf(hist[0]?.terms)}</p>`;
    } else if (k === 4) {
      if (st.snap < 0 || st.snap >= snaps.length) st.snap = Math.floor(snaps.length / 2);
      const sn = snaps[st.snap];
      const h = hist.reduce((b, x) => (x.it <= (sn?.it ?? 0) ? x : b), hist[0]);
      svg = sn ? plan(sn.assign, `4. 담금질 ${st.snap + 1} / ${snaps.length}`) : '';
      text = `<p>칸 하나 또는 벽 한 줄을 이웃 실로 옮기고, 에너지 변화 ΔE에 따라 메트로폴리스 규칙(온도 1.5 → 0.005)으로 받아들입니다. 총 ${c.steps?.toLocaleString?.() ?? ''}번 시도 중 ${c.accepted?.toLocaleString?.() ?? ''}번 채택.</p><label class="mth-select">스냅숏 <input type="range" id="ff-snap" min="1" max="${snaps.length}" value="${st.snap + 1}"> <span class="mono">${st.snap + 1} / ${snaps.length}</span></label><p>시도 <b>${(sn?.it ?? 0).toLocaleString()}</b>번째 · 에너지 <b>${sn ? sn.E.toFixed(2) : '—'}</b>${h?.T ? ` · 온도 ${h.T.toFixed(3)}` : ''}</p><p class="note">항: ${termsOf(h?.terms)}</p>`;
    } else if (k === 5) {
      const last = hist[hist.length - 1];
      svg = plan(c.assign, '5. 최저 에너지 배치');
      text = `<p>담금질 중 찾은 배치 가운데 에너지가 가장 낮은 것을 고릅니다. 총 에너지 <b>${c.summary.total.toFixed(2)}</b>.</p><p class="note">가중치: ${Object.entries(WEIGHTS).map(([n, v]) => `${TERM_KO[n] || n} ${v}`).join(' · ')}. 마지막 기록 항: ${termsOf(last?.terms)}</p>`;
    } else {
      svg = plan(c.assign, '6. 문·창', 'full', c.openings);
      text = `<p>공용 실(현관·거실·주방·복도)을 중심으로 문 그래프를 만들어 모든 실에 문을 달고, 바깥 벽에 창을 냅니다. ${c.unreachable.length ? `<span class="error-text">현관에서 갈 수 없는 실 ${c.unreachable.length}개</span>` : '현관에서 모든 실에 갈 수 있습니다.'}</p><p><b>완성.</b> 아래 버튼으로 AI 허브 형식 SPA JSON(실 다각형)을 받을 수 있습니다.</p>`;
    }
    $('#ff-proc-plan').innerHTML = svg;
    $('#ff-proc-text').innerHTML = text;
    $('#ff-snap')?.addEventListener('input', (e) => ((st.snap = Number(e.target.value) - 1), renderProcess()));
  }

  async function run(spec, outlineId, seed) {
    const all = (await load(base)).outlines;
    const o = all.find((x) => x.id === outlineId);
    const prog0 = programOf(all, o, spec);
    if (!prog0) return render(`침실 ${spec.bedrooms}개 세대가 이 데이터 묶음에 없습니다. 침실 수를 바꿔 보세요.`);
    const prog = withMaster(prog0);
    const mask = largest(maskFromUnit(o.rep, spec.area));
    // 최소 실 폭 = 베이스라인 R5(사양의 침실 한 변 × 실측 비, 안방 별도, 복도 1.2 m). 변경 8.
    const outline = { mode: 'mask', mask, balcony: spec.balcony, balconySides: spec.balcony ? ['S'] : [], outdoorUnit: spec.outdoorUnit, minWidths: minSidesFor(spec) };
    const syntaxPrefs = spec.prefs.filter((k) => SYNTAX_TARGETS[k]);
    const P = retarget(buildProblem(prog, { outline, syntaxPrefs }), spec);
    Object.assign(st, { P, o, prog, spec, mask, cands: [], current: 0, stage: 1, snap: -1 });
    st.worker?.terminate();
    st.worker = new Worker(new URL('./freeform-worker.js', import.meta.url), { type: 'module' });
    setProgress(0, '외곽 안에 실을 나누는 중…');
    const seeds = [seed, seed + 1, seed + 2];
    st.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') setProgress((m.i + m.p) / m.n, `담금질 ${m.i + 1} / ${m.n}안… ${Math.round(m.p * 100)}%`);
      else if (m.type === 'cand') st.cands[m.i] = m.cand;
      else if (m.type === 'done') {
        rankCands(st.cands);
        render();
      }
    };
    st.worker.postMessage({ unit: prog, outline, syntaxPrefs, freedom: 'L', jitter: 0.5, seeds, steps: 30000, target: Array.from(P.target) });
  }

  function render(error = null) {
    $('#gen-progress').hidden = true;
    $('#gen-ff').hidden = false;
    if (error) {
      if ($('#ff-process')) $('#ff-process').hidden = true;
      $('#gen-ff-tabs').innerHTML = '';
      $('#gen-ff-plan').innerHTML = '';
      $('#gen-ff-detail').innerHTML = `<p class="error-text">${esc(error)}</p>`;
      return;
    }
    const { P, o, prog, spec } = st;
    const c = st.cands[st.current];
    if ($('#ff-process')) $('#ff-process').hidden = false;
    st.snap = -1;
    const names = roomNames(P.rooms.filter((r) => c.assign.includes(r.k)), (k) => c.sizes[k] || 0);
    $('#gen-ff-tabs').innerHTML = st.cands.map((x, i) => `<button type="button" data-i="${i}" aria-pressed="${i === st.current}">자유형 ${i + 1}안</button>`).join('');
    $('#gen-ff-tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => ((st.current = Number(b.dataset.i)), render())));
    const area = st.mask.n * CELL * CELL;
    $('#gen-ff-plan').innerHTML = `${planSvg(c.assign, P, { openings: c.openings, names, mode: 'full', title: titleOf(), areaOf: (k) => (c.sizes[k] || 0) * P.sx * P.sy })}<figcaption class="note">외곽: 형태 ${esc(o.id.slice(1))}의 대표 세대 ${esc(o.rep.id)} · 실 구성: 세대 ${esc(prog.id)}(침실 ${prog.beds}·화장실 ${prog.baths}) · 시드 ${c.seed} · ${(c.ms / 1000).toFixed(1)}초</figcaption>`;
    const s = c.summary;
    const rooms = s.rooms.filter((r) => !OUTDOOR.has(r.type) && !(r.fixed && r.m2 < 1.5)).sort((a, b) => b.m2 - a.m2);
    const needOk = s.need.filter((n) => n.ok).length;
    const rows = rooms
      .map((r) => {
        const d = r.target ? ((r.m2 - r.target) / r.target) * 100 : null;
        const cls = d === null ? '' : Math.abs(d) <= 5 ? 'good-text' : Math.abs(d) <= 10 ? 'warn-text' : 'error-text';
        return `<tr><td>${esc(names[r.k] || r.type)}</td><td class="mono">${r.target ? r.target.toFixed(1) : '—'}</td><td class="mono">${r.m2.toFixed(1)}</td><td class="mono ${cls}">${d === null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(0)}%`}</td><td>${esc(r.shape)}</td></tr>`;
      })
      .join('');
    const ignored = spec.prefs.filter((k) => !SYNTAX_TARGETS[k] && !['spacious', 'bath', 'storage'].includes(k));
    $('#gen-ff-detail').innerHTML = `
      <div class="gen-sumgrid">
        <div><span class="gen-k">전용면적</span><b class="mono">${area.toFixed(1)}㎡</b></div>
        <div><span class="gen-k">문 동선</span><b class="mono">${c.unreachable.length ? `<span class="error-text">${c.unreachable.length}실 끊김</span>` : '모두 연결'}</b></div>
        <div><span class="gen-k">필요한 인접 유지</span><b class="mono">${needOk} / ${s.need.length}</b></div>
        <div><span class="gen-k">이 형태의 세대</span><b class="mono">${o.n.toLocaleString()}세대(${(o.share * 100).toFixed(1)}%)</b></div>
      </div>
      <h3>실별 면적</h3>
      <table class="gen-table"><thead><tr><th>실</th><th>목표 ㎡</th><th>생성 ㎡</th><th>차이</th><th>모양</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="note">목표 면적은 앞 단계에서 고른 면적비 × 전용면적입니다(정하지 않은 복도·기타는 남는 면적). 실 사이 인접(문을 낼 쌍)은 실 구성을 빌려 온 세대에서 가져옵니다. 자유형 엔진은 0.3m 칸을 실에 나눠 주는 담금질이라 실이 직사각형이 아닐 수 있습니다(자유형 평면과 같은 엔진).</p>
      ${ignored.length ? `<p class="note">이 형태에서는 공간구문 조건과 면적·실 구성만 반영합니다. 반영하지 않은 생활 조건: ${ignored.join(', ')}.</p>` : ''}`;
    renderProcess();
  }

  return { run, stop: () => (stopPlay(), st.worker?.terminate()) };
}

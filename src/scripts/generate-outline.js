// 도면 생성 탭: 첫 단계에서 AI 허브 외곽 형태(직사각형이 아닌 것)를 고르면 자유형 엔진(칸 담금질)으로 만든다.
// 외곽 = 고른 묶음의 대표 세대 외곽(전용면적에 맞춰 늘이고 줄임), 실 구성 = 같은 묶음에서 고른 침실 수의 실제 세대,
// 실 면적 목표 = 뒤 단계에서 고른 값(거실·작은방·안방·주방·화장실·현관·드레스룸·다목적실 면적비). 데이터: scripts/build-outlines.mjs.
import { CELL, SYNTAX_TARGETS, buildProblem } from '../freeform/engine.js';
import { largest, maskFromUnit } from '../freeform/outline.js';
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

export function createOutlineRunner({ base, setProgress, $ }) {
  const st = { worker: null, cands: [], current: 0, P: null, o: null, prog: null, spec: null };

  async function run(spec, outlineId, seed) {
    const all = (await load(base)).outlines;
    const o = all.find((x) => x.id === outlineId);
    const prog = programOf(all, o, spec);
    if (!prog) return render(`침실 ${spec.bedrooms}개 세대가 이 데이터 묶음에 없습니다. 침실 수를 바꿔 보세요.`);
    const mask = largest(maskFromUnit(o.rep, spec.area));
    const outline = { mode: 'mask', mask, balcony: spec.balcony, balconySides: spec.balcony ? ['S'] : [], outdoorUnit: spec.outdoorUnit };
    const syntaxPrefs = spec.prefs.filter((k) => SYNTAX_TARGETS[k]);
    const P = retarget(buildProblem(prog, { outline, syntaxPrefs }), spec);
    Object.assign(st, { P, o, prog, spec, mask, cands: [], current: 0 });
    st.worker?.terminate();
    st.worker = new Worker(new URL('./freeform-worker.js', import.meta.url), { type: 'module' });
    setProgress(0, '외곽 안에 실을 나누는 중…');
    const seeds = [seed, seed + 1, seed + 2];
    st.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') setProgress((m.i + m.p) / m.n, `담금질 ${m.i + 1} / ${m.n}안… ${Math.round(m.p * 100)}%`);
      else if (m.type === 'cand') st.cands[m.i] = m.cand;
      else if (m.type === 'done') {
        st.cands.sort((a, b) => a.summary.total - b.summary.total);
        render();
      }
    };
    st.worker.postMessage({ unit: prog, outline, syntaxPrefs, freedom: 'L', jitter: 0.5, seeds, steps: 30000, target: Array.from(P.target) });
  }

  function render(error = null) {
    $('#gen-progress').hidden = true;
    $('#gen-ff').hidden = false;
    if (error) {
      $('#gen-ff-tabs').innerHTML = '';
      $('#gen-ff-plan').innerHTML = '';
      $('#gen-ff-detail').innerHTML = `<p class="error-text">${esc(error)}</p>`;
      return;
    }
    const { P, o, prog, spec } = st;
    const c = st.cands[st.current];
    const names = roomNames(P.rooms.filter((r) => c.assign.includes(r.k)), (k) => c.sizes[k] || 0);
    $('#gen-ff-tabs').innerHTML = st.cands.map((x, i) => `<button type="button" data-i="${i}" aria-pressed="${i === st.current}">자유형 ${i + 1}안</button>`).join('');
    $('#gen-ff-tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => ((st.current = Number(b.dataset.i)), render())));
    const area = st.mask.n * CELL * CELL;
    $('#gen-ff-plan').innerHTML = `${planSvg(c.assign, P, { openings: c.openings, names, mode: 'full', title: `${spec.area}㎡ · 방 ${spec.bedrooms}개 · 형태 ${o.id.slice(1)} · ${st.current + 1}안`, areaOf: (k) => (c.sizes[k] || 0) * P.sx * P.sy })}<figcaption class="note">외곽: 형태 ${esc(o.id.slice(1))}의 대표 세대 ${esc(o.rep.id)} · 실 구성: 세대 ${esc(prog.id)}(침실 ${prog.beds}·화장실 ${prog.baths}) · 시드 ${c.seed} · ${(c.ms / 1000).toFixed(1)}초</figcaption>`;
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
      <p class="note">목표 면적은 앞 단계에서 고른 면적비 × 전용면적입니다(정하지 않은 복도·기타는 남는 면적). 실 사이 인접(문을 낼 쌍)은 실 구성을 빌려 온 세대에서 가져옵니다. 자유형 엔진은 0.3m 칸을 실에 나눠 주는 담금질이라 실이 직사각형이 아닐 수 있습니다(<a href="${base}freeform/">자유형 평면</a>과 같은 엔진).</p>
      ${ignored.length ? `<p class="note">이 형태에서는 공간구문 조건과 면적·실 구성만 반영합니다. 반영하지 않은 생활 조건: ${ignored.join(', ')}.</p>` : ''}`;
  }

  return { run, stop: () => st.worker?.terminate() };
}

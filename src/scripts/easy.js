// 쉽게 보기: 집 퍼즐 놀이. 점수는 실제 생성 코드로 계산한다(84㎡·침실 3, 손 가중치, 선호 없음).
import { buildQubo, TERMS, energy, features, encode, decode } from '../generate/qubo.js';
import { buildLayout, rng } from '../generate/layout.js';
import { realize } from '../generate/compare.js';
import { layoutSvg } from '../generate/render.js';

const { base } = JSON.parse(document.getElementById('ez-data').textContent);
const $ = (s) => document.querySelector(s);

const spec = {
  area: 84,
  bedrooms: 3,
  baths: 2,
  dress: true,
  multi: false,
  outdoorUnit: false,
  balcony: true,
  targets: { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 },
  prefs: [],
};
const q = buildQubo(spec, { weights: 'hand', syntax: false });

const ROOM = {
  living: { e: '🛋️', n: '거실', c: 'living' },
  master: { e: '👑', n: '안방', c: 'bed' },
  bed1: { e: '🧸', n: '침실', c: 'bed' },
  bed2: { e: '🛏️', n: '침실', c: 'bed' },
  kitchen: { e: '🍳', n: '주방', c: 'kitchen' },
  entrance: { e: '🚪', n: '현관', c: 'entrance' },
  bathPublic: { e: '🚽', n: '화장실', c: 'bath' },
};
// 항마다 아이에게 하는 말(좋으면 😊, 싫으면 😢)
const SAY = {
  kitchenLiving: '🍳 주방이 🛋️ 거실 바로 뒤에 있어요. 밥 먹으러 가기 가까워요!',
  entranceLiving: '🚪 현관으로 들어오면 바로 🛋️ 거실이에요.',
  entranceKitchen: '🚪 현관 옆에 🍳 주방이 있어요. 장 본 걸 바로 넣어요.',
  bathKitchen: '🚽 화장실과 🍳 주방이 이웃이에요. 물 쓰는 곳이 모였어요.',
  bathEntrance: '🚽 화장실이 🚪 현관 옆이라 손님이 찾기 쉬워요.',
  bathLiving: '🚽 화장실이 🛋️ 거실에서 가까워요.',
  bedEntrance: '침실이 🚪 현관 바로 앞이에요. 쿵쿵, 시끄러워요.',
  bedLiving: '침실이 🛋️ 거실 옆이에요. TV 소리가 들려요.',
  bedBed: '침실끼리 딱 붙었어요. 서로 소리가 들려요.',
  livingOffCenter: '🛋️ 거실이 가운데가 아니에요. 가족이 모이기 멀어요.',
  masterNotEnd: '👑 안방이 가운데에 끼었어요. 안방 화장실을 붙일 자리가 없어요.',
  entranceEnd: '🚪 현관이 맨 끝이에요. 들어와서 걷는 길이 길어요.',
};

// ---- 가능한 모든 배치(앞 4! × 뒤 3! = 144)와 별의 기준 ----
function* perms(list) {
  if (list.length <= 1) return yield list.slice();
  for (let i = 0; i < list.length; i++) for (const p of perms([...list.slice(0, i), ...list.slice(i + 1)])) yield [list[i], ...p];
}
const ALL = [];
for (const f of perms(q.bands.front.rooms)) for (const b of perms(q.bands.back.rooms)) ALL.push({ f, b, s: -energy(q, encode(q, f, b)) });
const sMin = Math.min(...ALL.map((a) => a.s));
const sMax = Math.max(...ALL.map((a) => a.s));
const starsOf = (s) => Math.round((5 * (s - sMin)) / (sMax - sMin));
const starStr = (k) => '⭐'.repeat(k) + '☆'.repeat(5 - k);
const faceOf = (k) => ['😭', '😢', '😐', '🙂', '😊', '🤩'][k];
$('#ez-total').textContent = `${ALL.length}가지를 모두`;
$('#ez-n-all').textContent = String(ALL.length);

// ---- 1. 방 조각 ----
$('#ez-pieces').innerHTML = Object.values(ROOM)
  .map((r) => `<span class="ez-chip ez-${r.c}">${r.e} ${r.n}</span>`)
  .join('');

// ---- 5. 내 집판 ----
// 처음에는 별이 적은 배치에서 시작(바꿔 볼 거리가 있게)
const start = [...ALL].sort((a, b) => a.s - b.s)[Math.floor(ALL.length * 0.2)];
const state = { f: start.f.slice(), b: start.b.slice(), pick: null };

const roomBox = (key, row, i, extra = '') => {
  const r = ROOM[key];
  return `<button type="button" class="ez-room ez-${r.c} ${extra}" data-row="${row}" data-i="${i}"><span class="ez-emo">${r.e}</span><span>${r.n}</span></button>`;
};
const boardHtml = (f, b, pick = null, small = false) =>
  `<div class="ez-house ${small ? 'small' : ''}">
    <div class="ez-side">🌙 뒤쪽</div>
    <div class="ez-row back">${b.map((k, i) => roomBox(k, 'b', i, pick && pick.row === 'b' && pick.i === i ? 'picked' : '')).join('')}</div>
    <div class="ez-row front">${f.map((k, i) => roomBox(k, 'f', i, pick && pick.row === 'f' && pick.i === i ? 'picked' : '')).join('')}</div>
    <div class="ez-side sun">☀️ 해님 쪽</div>
  </div>`;

function scoreLines(f, b) {
  const x = encode(q, f, b);
  const phi = features(q, x);
  const lines = [];
  TERMS.forEach((t, k) => {
    const w = q.weights[t.id] ?? 0;
    if (!w || Math.abs(phi[k]) < 1e-9) return;
    lines.push({ id: t.id, pts: -w * phi[k] });
  });
  lines.sort((a, z) => z.pts - a.pts);
  return { x, lines, s: -energy(q, x) };
}

function drawPlay() {
  $('#ez-board').innerHTML = boardHtml(state.f, state.b, state.pick);
  const { lines, s } = scoreLines(state.f, state.b);
  const k = starsOf(s);
  $('#ez-score').innerHTML = `<div class="ez-face">${faceOf(k)}</div><div class="ez-stars">${starStr(k)}</div><div class="ez-small">점수 ${s.toFixed(1)}점</div>${k === 5 ? '<div class="ez-win">최고의 집이에요! 🎉</div>' : ''}`;
  $('#ez-why').innerHTML = `<ul class="ez-why">${lines
    .map((l) => `<li class="${l.pts > 0 ? 'good' : 'bad'}"><span class="ez-f">${l.pts > 0 ? '😊' : '😢'}</span> ${SAY[l.id]} <b>${l.pts > 0 ? '+' : '−'}${Math.abs(l.pts).toFixed(1)}</b></li>`)
    .join('')}</ul>`;
  const sum = lines.reduce((a, l) => a + l.pts, 0);
  $('#ez-check').textContent = `(어른용) 이유 점수의 합 ${sum.toFixed(3)} = 컴퓨터가 계산한 점수 −E ${s.toFixed(3)} ${Math.abs(sum - s) < 1e-9 ? '✓' : '✗'}`;
  drawCake();
}
$('#ez-board').addEventListener('click', (e) => {
  const btn = e.target.closest('.ez-room');
  if (!btn) return;
  const row = btn.dataset.row;
  const i = Number(btn.dataset.i);
  if (!state.pick || state.pick.row !== row) state.pick = { row, i };
  else if (state.pick.i === i) state.pick = null;
  else {
    const arr = row === 'f' ? state.f : state.b;
    [arr[state.pick.i], arr[i]] = [arr[i], arr[state.pick.i]];
    state.pick = null;
  }
  drawPlay();
});

// ---- 3. 약속 어기기 ----
$('#ez-break').addEventListener('click', () => {
  const x = encode(q, state.f, state.b);
  const before = energy(q, x);
  // 거실이 아직 없는 앞 칸 하나에 거실을 하나 더 켠다
  const li = state.f.indexOf('living');
  const other = li === 0 ? 1 : 0;
  const v = q.vars.findIndex((vv) => vv.room === 'living' && vv.band === 'front' && vv.slot === other);
  x[v] = 1;
  const after = energy(q, x);
  $('#ez-break-out').innerHTML = `😡 거실이 두 칸에 있으면 점수가 <b>${(after - before).toFixed(0)}점이나 깎여요!</b> 친구 방 점수를 다 모아도 이보다 작아서, 컴퓨터는 약속을 어기는 집은 절대 고르지 않아요.`;
});

// ---- 6. 컴퓨터 친구 ----
let runTimer = null;
$('#ez-run').addEventListener('click', () => {
  clearInterval(runTimer);
  let i = 0;
  let best = null;
  const view = $('#ez-run-view');
  runTimer = setInterval(() => {
    for (let step = 0; step < 2 && i < ALL.length; step++, i++) if (!best || ALL[i].s > best.s) best = ALL[i];
    const cur = ALL[Math.min(i, ALL.length) - 1];
    const done = i >= ALL.length;
    view.innerHTML = `<div class="ez-run-grid"><div><p class="ez-small">${done ? '다 해 봤어요!' : `해 보는 중… ${i}번째 / ${ALL.length}`}</p>${boardHtml(cur.f, cur.b, null, true)}<p>${starStr(starsOf(cur.s))}</p></div><div><p class="ez-small">지금까지 가장 좋은 집</p>${boardHtml(best.f, best.b, null, true)}<p>${starStr(starsOf(best.s))} ${done ? '🎉 찾았다!' : ''}</p></div></div>${
      done ? `<p>컴퓨터는 ${ALL.length}가지를 모두 해 보고 별 5개 집을 찾았어요. 내 집은 별 ${starsOf(-energy(q, encode(q, state.f, state.b)))}개예요.</p><button type="button" class="button-ghost ez-btn" id="ez-use">컴퓨터 집을 내 집판에 놓기</button><p class="ez-small">집이 더 크면 방법이 너무 많아서 다 해 볼 수 없어요. 그때는 "왔던 길로 안 돌아가기", "처음엔 대충, 나중엔 꼼꼼히" 같은 똑똑한 방법으로 찾아요.</p>` : ''
    }`;
    if (done) {
      clearInterval(runTimer);
      $('#ez-use').addEventListener('click', () => {
        state.f = best.f.slice();
        state.b = best.b.slice();
        state.pick = null;
        drawPlay();
        document.querySelector('.ez-play').scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, 40);
});

// ---- 7. 케이크 자르기 ----
let baselineCache = null;
let cakeToken = 0;
async function drawCake() {
  const token = ++cakeToken;
  baselineCache ||= await (await fetch(`${base}data/baseline.json`)).json();
  if (token !== cakeToken) return;
  const d = decode(q, encode(q, state.f, state.b));
  const best = realize(spec, d, baselineCache, rng(1), 30);
  const trace = [];
  const layout = buildLayout(spec, { ...structuredClone(best.params), trace });
  const fr = trace.find((t) => t.band === 'front');
  const emo = Object.fromEntries(Object.entries(ROOM).map(([k, r]) => [r.n === '침실' ? k : r.n, r.e]));
  const icon = (nm) => (nm === '거실' ? '🛋️' : nm === '안방' ? '👑' : nm.startsWith('침실') ? '🛏️' : emo[nm] || '');
  if (fr) {
    const tot = fr.out.reduce((a, v) => a + v, 0);
    $('#ez-cake').innerHTML = `<p>☀️ 해님 쪽 줄의 길이는 <b>${fr.total.toFixed(1)}m</b>예요. 이렇게 잘랐어요:</p><div class="ez-cake">${fr.names
      .map((nm, i) => `<div class="ez-slice" style="flex:${fr.out[i] / tot}"><span>${icon(nm)}</span><b>${fr.out[i].toFixed(1)}m</b></div>`)
      .join('')}</div>`;
  }
  $('#ez-plan').innerHTML = layoutSvg(layout, { mode: 'space' });
}

drawPlay();

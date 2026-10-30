// QUBO 도면 생성: 도면 생성 탭의 규칙들을 모두 QUBO 항으로 써서 평면을 만든다.
// 단계 A(실 배치 QUBO): 변수 x(칸, 실). 칸마다 실 하나, 실 면적, 둘레(모양), 앞·뒤 띠, 창, 실 사이 맞닿음, 현관 위치, 안방 끝, 거실 가운데.
// 단계 B(문·창 QUBO): 단계 A의 해가 정한 경계 위에서 문·개구부·현관문·창·발코니 문 위치를 0/1 변수로 고른다.
// QUBO로 정확히 쓸 수 없는 규칙(실이 한 덩어리로 이어짐, 현관에서 모든 실에 갈 수 있음, 최소 폭)은 근사 항으로 넣고,
// 풀고 난 뒤 따로 점검한다(evaluate). 같은 입력·같은 시드면 같은 결과다.
import { programOf } from '../generate/layout.js';
import { syntaxOf, SYNTAX_GOAL } from '../freeform/engine.js';

export const CELLS = [1.2, 0.9];
const BACK = new Set(['주방', '현관', '화장실', '드레스룸', '다목적공간']);
const FRONT = new Set(['거실', '침실']);
const PUBLIC = new Set(['현관', '거실', '주방', '기타']);
const NEEDS_WINDOW = new Set(['거실', '침실']);
export const MIN_W = { 거실: 3.0, 침실: 2.4, 주방: 1.8, 화장실: 1.2, 드레스룸: 1.0, 다목적공간: 1.2, 현관: 1.2, 기타: 0.9 };

/** 단계 A의 항(규칙 → QUBO). exact: 규칙을 그대로 이차식으로 썼는가(아니면 근사). */
export const TERMS_A = [
  { id: 'onehot', label: '칸마다 실 하나', rule: '모든 칸은 정확히 한 실에 속한다', qubo: 'P<sub>A</sub> Σ<sub>c</sub> (Σ<sub>r</sub> x<sub>c,r</sub> − 1)²', exact: true, w: 0 },
  { id: 'area', label: '실 면적', rule: '실마다 목표 면적(실 프로그램)', qubo: 'Σ<sub>r</sub> ((N<sub>r</sub> − t<sub>r</sub>) / t<sub>r</sub>)², N<sub>r</sub> = Σ<sub>c</sub> x<sub>c,r</sub>', exact: true, w: 12 },
  { id: 'perim', label: '둘레(모양)', rule: '실은 반듯하고 한 덩어리로(구불구불하지 않게)', qubo: 'Σ<sub>r</sub> (4N<sub>r</sub> − 2Σ<sub>c~c′</sub> x<sub>c,r</sub>x<sub>c′,r</sub>) / (4√t<sub>r</sub>)', exact: false, note: '둘레 자체는 정확한 이차식. "한 덩어리"는 이것으로 근사하고 풀고 나서 점검', w: 8 },
  { id: 'zone', label: '앞·뒤 띠', rule: '거실·침실은 앞(남, 발코니 쪽), 주방·현관·욕실·드레스룸은 뒤(북)', qubo: 'Σ<sub>c,r</sub> z<sub>r</sub>(행<sub>c</sub>) x<sub>c,r</sub>', exact: true, w: 2.5 },
  { id: 'window', label: '창', rule: '거실·침실은 발코니(남)나 바깥 벽에 닿는다', qubo: '−Σ<sub>c∈바깥, r∈거실·침실</sub> x<sub>c,r</sub>', exact: false, note: '"2m 이상"은 이차식이 안 되어 바깥에 닿을수록 보상으로 근사', w: 0.8 },
  { id: 'adjGood', label: '맞닿아야 할 실', rule: '주방–거실, 거실–현관·복도, 침실–복도·거실(문을 낼 공용 공간), 안방–부부욕실·드레스룸(가장 강하게), 공용욕실–복도·거실', qubo: '−Σ<sub>(a,b)</sub> Σ<sub>c~c′</sub> (x<sub>c,a</sub>x<sub>c′,b</sub> + x<sub>c,b</sub>x<sub>c′,a</sub>)', exact: false, note: '"문 폭 이상 맞닿음"은 맞닿을수록 보상으로 근사. 너무 크면 바둑판처럼 섞이므로 둘레보다 작게', w: 0.12 },
  { id: 'adjBad', label: '떨어져야 할 실', rule: '침실–현관(소음·사생활), 침실–주방, 침실끼리, 부부욕실·드레스룸–다른 침실·거실·주방, 공용욕실–안방', qubo: '+Σ<sub>(a,b)</sub> Σ<sub>c~c′</sub> (x<sub>c,a</sub>x<sub>c′,b</sub> + x<sub>c,b</sub>x<sub>c′,a</sub>)', exact: true, w: 0.3 },
  { id: 'entry', label: '현관 위치', rule: '현관은 뒤(복도 쪽) 바깥 벽에', qubo: '−Σ<sub>c∈맨 뒤 줄</sub> x<sub>c,현관</sub>', exact: true, w: 2 },
  { id: 'masterEnd', label: '안방은 끝', rule: '안방은 한쪽 끝(부속실을 뒤에 붙이려고)', qubo: '−Σ<sub>c∈양 끝 열</sub> x<sub>c,안방</sub>', exact: true, w: 0.8 },
  { id: 'livingMid', label: '거실은 가운데', rule: '거실 중심형(가족이 모이는 곳이 가운데)', qubo: 'Σ<sub>c</sub> |열<sub>c</sub> − 가운데| / 폭 · x<sub>c,거실</sub>', exact: true, w: 1.5 },
  { id: 'livingHub', label: '거실이 여러 실과 닿음', rule: '공간구문 "거실 중심형": 거실이 집에서 가장 통합된(많은 실과 이어진) 실', qubo: '−Σ<sub>r≠거실</sub> Σ<sub>c~c′</sub> x<sub>c,거실</sub>x<sub>c′,r</sub>', exact: false, note: '통합도는 그래프 경로 계산이라 이차식이 아님. "거실이 많은 실과 맞닿음"으로 근사하고, 풀고 나서 실제 통합도를 계산', w: 0, pref: 'livingCentral', on: 0.4 },
  { id: 'privacyDepth', label: '침실은 현관에서 멀리', rule: '공간구문 "사생활 깊이": 침실이 거실·주방보다 깊게(현관에서 멀게)', qubo: '+Σ<sub>c,c′</sub> 가까움(c, c′) · x<sub>c,침실</sub>x<sub>c′,현관</sub>', exact: false, note: '깊이(현관에서 문을 몇 번 지나나)는 경로 계산이라 이차식이 아님. 침실 칸과 현관 칸의 거리로 근사하고, 풀고 나서 실제 깊이를 계산', w: 0, pref: 'privacy', on: 2 },
];

/** 선호를 고르면 바뀌는 무게(도면 생성 탭의 공간구문·생활 조건과 같은 선택지). */
export const PREF_EFFECTS = {
  livingCentral: '거실 가운데 항 ×1.8, 거실이 여러 실과 닿음 항 켬(근사)',
  privacy: '침실–현관 떨어짐 ×1.7, 침실은 현관에서 멀리 항 켬(근사)',
  kitchenLink: '주방–거실 맞닿음 ×1.4',
  entryNear: '현관–거실 맞닿음 ×1.6',
  spacious: '거실 목표 면적 한 단계 크게(면적 항)',
  bath: '화장실 2개(실 목록)',
  quiet: '침실끼리 떨어짐 ×2, 침실–거실 떨어짐 항 추가',
  sunny: '앞·뒤 띠 ×1.4, 창 ×2',
  storage: '드레스룸·다목적실 추가(실 목록)',
};

/** 단계 B의 항. */
export const TERMS_B = [
  { id: 'oneDoor', label: '실마다 문 하나', rule: '침실·욕실·드레스룸·다목적실은 문이 정확히 하나', qubo: 'P<sub>B</sub> Σ<sub>r</sub> (Σ<sub>e</sub> d<sub>r,e</sub> − 1)²', exact: true },
  { id: 'doorSide', label: '문 쪽 우선순위', rule: '침실·욕실은 복도 → 거실 → 현관 → 주방 쪽, 부부욕실·드레스룸은 안방 쪽. 침실을 지나 들어가는 문은 크게 감점', qubo: 'Σ<sub>r,e</sub> 비용(이웃 실 종류) · d<sub>r,e</sub>', exact: true },
  { id: 'entryDoor', label: '현관문 하나', rule: '현관 바깥 벽에 현관문 하나(뒤쪽 우선)', qubo: 'P<sub>B</sub>(Σ<sub>e</sub> h<sub>e</sub> − 1)² + Σ 비용 · h<sub>e</sub>', exact: true },
  { id: 'opening', label: '공용 공간 트기', rule: '현관·거실·주방·복도끼리 맞닿으면 개구부 하나(가운데 우선)', qubo: 'P<sub>B</sub> Σ<sub>쌍</sub> (Σ<sub>e</sub> o<sub>e</sub> − 1)² + Σ 거리 · o<sub>e</sub>', exact: true },
  { id: 'clash', label: '문끼리 겹치지 않기', rule: '같은 벽 칸이나 이웃 벽 칸에 문 두 개를 두지 않음', qubo: '+Σ<sub>겹치는 쌍</sub> d<sub>e</sub> d<sub>e′</sub>', exact: true },
  { id: 'outdoorUnit', label: '실외기실 자리', rule: '실외기실은 바깥 줄(발코니) 끝에 이어진 칸으로, 그 칸 쪽으로는 발코니 문을 내지 않음', qubo: '3(Σ<sub>i</sub> u<sub>i</sub> − k)² + Σ 끝에서 거리 · u<sub>i</sub> − Σ u<sub>i</sub>u<sub>i+1</sub> + 6Σ s<sub>i</sub>u<sub>i</sub>', exact: true },
  { id: 'windows', label: '창·발코니 문', rule: '거실·침실·주방은 바깥 벽 길이의 일정 비율만큼 창(발코니 쪽은 발코니 문), 이어지게', qubo: 'Σ<sub>r</sub> (Σ<sub>e</sub> w<sub>r,e</sub> − k<sub>r</sub>)² − Σ<sub>이웃 e~e′</sub> w<sub>e</sub>w<sub>e′</sub>', exact: true },
];

/** QUBO 조립 도우미: 항별 기여를 따로 모아 둔다(에너지 분해·화면 표시용). */
function makeBuilder() {
  const lin = new Map(); // i → v
  const quad = new Map(); // 'i,j'(i<j) → v
  const byTerm = {}; // id → { lin: Map, quad: Map, offset }
  let offset = 0;
  const T = (id) => (byTerm[id] ||= { lin: new Map(), quad: new Map(), offset: 0 });
  return {
    lin(id, i, v) {
      if (!v) return;
      lin.set(i, (lin.get(i) || 0) + v);
      const t = T(id).lin;
      t.set(i, (t.get(i) || 0) + v);
    },
    quad(id, i, j, v) {
      if (!v || i === j) return;
      const k = i < j ? `${i},${j}` : `${j},${i}`;
      quad.set(k, (quad.get(k) || 0) + v);
      const t = T(id).quad;
      t.set(k, (t.get(k) || 0) + v);
    },
    off(id, v) {
      offset += v;
      T(id).offset += v;
    },
    /** P(Σx − 1)² = P(1 − Σx + 2Σx_a x_b) */
    oneHot(id, group, P) {
      for (const a of group) this.lin(id, a, -P);
      for (let p = 0; p < group.length; p++) for (let q = p + 1; q < group.length; q++) this.quad(id, group[p], group[q], 2 * P);
      this.off(id, P);
    },
    /** w(Σx − k)² = w(Σx + 2Σx_a x_b − 2kΣx + k²) */
    countTo(id, group, k, w) {
      for (const a of group) this.lin(id, a, w * (1 - 2 * k));
      for (let p = 0; p < group.length; p++) for (let q = p + 1; q < group.length; q++) this.quad(id, group[p], group[q], 2 * w);
      this.off(id, w * k * k);
    },
    finish(n, groups) {
      const diag = new Float64Array(n);
      const M = new Float64Array(n * n);
      for (const [i, v] of lin) diag[i] += v;
      for (const [k, v] of quad) {
        const [i, j] = k.split(',').map(Number);
        M[i * n + j] += v;
        M[j * n + i] += v;
      }
      return { n, diag, M, offset, groups, byTerm };
    },
    get offset() {
      return offset;
    },
  };
}

/** 격자·실 목록·목표. */
export function setupGrid(spec, { cell = 1.2, hall = true } = {}) {
  const A = spec.area;
  const D0 = 7.4 * (A / 84) ** 0.3;
  const ny = Math.max(4, Math.round(D0 / cell));
  const nx = Math.max(4, Math.round(A / (ny * cell * cell)));
  let prog = programOf(spec).map((r) => ({ ...r }));
  if (hall) {
    const hallA = 0.07 * A;
    for (const r of prog) r.area *= 1 - 0.07;
    prog.push({ key: 'hall', type: '기타', name: '복도', area: hallA });
  }
  // 칸 수로 바꾼 목표(실내 전체 칸 수에 맞게 비율 유지)
  const C = nx * ny;
  const sumA = prog.reduce((s, r) => s + r.area, 0);
  const rooms = prog.map((r, k) => ({ k, key: r.key, type: r.type, name: r.name, area: r.area, t: (r.area / sumA) * C, fixed: false }));
  // 맨 아래(남) 바깥 줄: 발코니가 있으면 발코니, 없으면 실외기실만 둘 바깥 자리
  const balcony = spec.balcony !== false;
  const stripRows = balcony || spec.outdoorUnit ? Math.max(1, Math.round(1.5 / cell)) : 0;
  return { spec, cell, nx, ny, C, rooms, balcony, outdoorUnit: Boolean(spec.outdoorUnit), stripRows, balconyRows: stripRows, area: C * cell * cell };
}

/** 이웃 칸 쌍(가로·세로). */
function neighbors(nx, ny) {
  const out = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (i + 1 < nx) out.push([c, c + 1]);
      if (j + 1 < ny) out.push([c, c + nx]);
    }
  return out;
}

/** 맞닿아야 할 쌍·떨어져야 할 쌍(실 key). */
export function pairsOf(G, prefs = []) {
  const has = (k) => G.rooms.some((r) => r.key === k);
  const beds = G.rooms.filter((r) => r.type === '침실').map((r) => r.key);
  const others = beds.filter((k) => k !== 'master');
  const good = [];
  const add = (a, b, m = 1) => has(a) && has(b) && good.push([a, b, m]);
  add('kitchen', 'living', prefs.includes('kitchenLink') ? 2 : 1.4);
  add('entrance', 'living', prefs.includes('entryNear') ? 1.6 : 1);
  add('entrance', 'hall', 1);
  add('living', 'hall', 1);
  // 침실은 공용 공간(복도·거실)에 닿아야 문을 낼 수 있다
  for (const b of beds) add(b, 'hall', 2);
  for (const b of beds) add(b, 'living', 1);
  // 부속실은 안방에 붙어야 한다
  add('master', 'bathMaster', 5);
  add('master', 'dress', 4);
  add('bathPublic', 'hall', 2);
  add('bathPublic', 'living', 1);
  add('bath3', 'hall', 2);
  add('multi', 'kitchen', 1.5);
  const bad = [];
  const addB = (a, b, m = 1) => has(a) && has(b) && bad.push([a, b, m]);
  for (const b of beds) addB(b, 'entrance', prefs.includes('privacy') ? 2.5 : 1.5);
  if (prefs.includes('quiet')) for (const b of beds) addB(b, 'living', 0.5);
  for (const b of beds) addB(b, 'kitchen', 0.6);
  for (let i = 0; i < beds.length; i++) for (let j = i + 1; j < beds.length; j++) addB(beds[i], beds[j], prefs.includes('quiet') ? 0.8 : 0.4);
  for (const b of others) addB(b, 'bathMaster', 2);
  for (const b of others) addB(b, 'dress', 2);
  addB('bathMaster', 'living', 1);
  addB('dress', 'living', 1);
  addB('bathMaster', 'kitchen', 1);
  addB('dress', 'kitchen', 1);
  addB('bathPublic', 'master', 1);
  return { good, bad };
}

/** 단계 A QUBO. */
/** 단계 A의 무게: 기본값에 선호를 반영(식 패널과 QUBO가 같은 함수를 쓴다). why: 항마다 바뀐 이유 */
export function weightsA(prefs = [], { weights = {}, syntaxScale = 1 } = {}) {
  const W = Object.fromEntries(TERMS_A.map((t) => [t.id, weights[t.id] ?? (t.pref && prefs.includes(t.pref) ? t.on * syntaxScale : t.w)]));
  const why = {};
  for (const t of TERMS_A) if (t.pref && prefs.includes(t.pref)) why[t.id] = [`${t.pref === 'livingCentral' ? '거실 중심형' : '사생활 깊이'} 선택${syntaxScale !== 1 ? ` · 세기 ×${syntaxScale}` : ''}`];
  if (prefs.includes('livingCentral')) ((W.livingMid *= 1.8), (why.livingMid = ['거실 중심형 ×1.8']));
  if (prefs.includes('sunny')) ((W.zone *= 1.4), (W.window *= 2), (why.zone = ['채광 확보 ×1.4']), (why.window = ['채광 확보 ×2']));
  return { W, why };
}

export function buildStageA(G, { weights = {}, prefs = [], syntaxScale = 1 } = {}) {
  const { W } = weightsA(prefs, { weights, syntaxScale });
  const { nx, ny, C, rooms } = G;
  const R = rooms.length;
  const n = C * R;
  const v = (c, r) => c * R + r;
  const b = makeBuilder();
  const rowOf = (c) => Math.floor(c / nx);
  const colOf = (c) => c % nx;
  const nb = neighbors(nx, ny);
  const keyIdx = Object.fromEntries(rooms.map((r) => [r.key, r.k]));

  // 면적: w Σ ((N − t)/t)² = (w/t²)(N² − 2tN + t²), N² = N + 2Σ_{c<c'} x x
  for (const r of rooms) {
    const a = W.area / (r.t * r.t);
    for (let c = 0; c < C; c++) b.lin('area', v(c, r.k), a * (1 - 2 * r.t));
    for (let c = 0; c < C; c++) for (let d = c + 1; d < C; d++) b.quad('area', v(c, r.k), v(d, r.k), 2 * a);
    b.off('area', a * r.t * r.t);
  }
  // 둘레: (4N − 2·같은 실 이웃 쌍) / (4√t)
  for (const r of rooms) {
    const s = W.perim / (4 * Math.sqrt(r.t));
    for (let c = 0; c < C; c++) b.lin('perim', v(c, r.k), 4 * s);
    for (const [c, d] of nb) b.quad('perim', v(c, r.k), v(d, r.k), -2 * s);
  }
  // 앞·뒤 띠: 행 j(0 = 맨 뒤/북, ny−1 = 맨 앞/남)
  for (const r of rooms) {
    for (let c = 0; c < C; c++) {
      const y = (rowOf(c) + 0.5) / ny; // 0 뒤 → 1 앞
      const z = FRONT.has(r.type) ? 1 - y : BACK.has(r.type) ? y : 0;
      b.lin('zone', v(c, r.k), W.zone * z);
    }
  }
  // 창: 거실·침실이 앞줄(발코니)·양 옆 바깥에 닿을수록 보상
  for (const r of rooms) {
    if (!NEEDS_WINDOW.has(r.type)) continue;
    for (let c = 0; c < C; c++) {
      const i = colOf(c);
      const j = rowOf(c);
      const ext = (j === ny - 1 ? 1 : 0) + (i === 0 || i === nx - 1 ? 0.4 : 0);
      if (ext) b.lin('window', v(c, r.k), -W.window * ext);
    }
  }
  // 맞닿음 보상·감점
  const { good, bad } = pairsOf(G, prefs);
  const pairTerm = (id, list, sign) => {
    for (const [ka, kb, m] of list) {
      const a = keyIdx[ka];
      const bb = keyIdx[kb];
      for (const [c, d] of nb) {
        b.quad(id, v(c, a), v(d, bb), sign * W[id] * m);
        b.quad(id, v(c, bb), v(d, a), sign * W[id] * m);
      }
    }
  };
  pairTerm('adjGood', good, -1);
  pairTerm('adjBad', bad, +1);
  // 현관: 맨 뒤 줄
  if (keyIdx.entrance !== undefined) for (let i = 0; i < nx; i++) b.lin('entry', v(i, keyIdx.entrance), -W.entry);
  // 안방: 양 끝 열
  if (keyIdx.master !== undefined) for (let c = 0; c < C; c++) if (colOf(c) === 0 || colOf(c) === nx - 1) b.lin('masterEnd', v(c, keyIdx.master), -W.masterEnd);
  // 거실: 가운데
  if (keyIdx.living !== undefined) for (let c = 0; c < C; c++) b.lin('livingMid', v(c, keyIdx.living), W.livingMid * (Math.abs(colOf(c) + 0.5 - nx / 2) / nx));
  // (거실 중심형, 근사) 거실이 다른 실과 맞닿을수록 보상
  if (W.livingHub && keyIdx.living !== undefined)
    for (const r of rooms) {
      if (r.k === keyIdx.living) continue;
      for (const [c, d] of nb) {
        b.quad('livingHub', v(c, keyIdx.living), v(d, r.k), -W.livingHub);
        b.quad('livingHub', v(d, keyIdx.living), v(c, r.k), -W.livingHub);
      }
    }
  // (사생활 깊이, 근사) 침실 칸이 현관 칸에 가까울수록 감점: 가까움 = max(0, 1 − 맨해튼 거리 / (nx + ny)/2)
  if (W.privacyDepth && keyIdx.entrance !== undefined) {
    const half = (nx + ny) / 2;
    for (const r of rooms) {
      if (r.type !== '침실') continue;
      for (let c = 0; c < C; c++)
        for (let d = 0; d < C; d++) {
          const near = Math.max(0, 1 - (Math.abs(colOf(c) - colOf(d)) + Math.abs(rowOf(c) - rowOf(d))) / half);
          if (near > 0) b.quad('privacyDepth', v(c, r.k), v(d, keyIdx.entrance), (W.privacyDepth * near) / Math.max(1, r.t));
        }
    }
  }

  // 벌점: 한 변수의 목적 계수 절댓값 합의 최댓값 + 1
  const pre = b.finish(n, []);
  let gmax = 0;
  for (let i = 0; i < n; i++) {
    let g = Math.abs(pre.diag[i]);
    for (let j = 0; j < n; j++) g += Math.abs(pre.M[i * n + j]);
    gmax = Math.max(gmax, g);
  }
  const P = Math.ceil(gmax + 1);
  const groups = [];
  for (let c = 0; c < C; c++) {
    const g = Array.from({ length: R }, (_, r) => v(c, r));
    groups.push(g);
    b.oneHot('onehot', g, P);
  }
  const q = b.finish(n, groups);
  q.penalty = P;
  q.weights = W;
  q.prefNotes = prefs.filter((k) => PREF_EFFECTS[k]).map((k) => [k, PREF_EFFECTS[k]]);
  q.vars = Array.from({ length: n }, (_, i) => ({ c: Math.floor(i / R), r: i % R }));
  return q;
}

/** 단계 A 해 → 칸 배정. 제약을 어긴 칸(0개 또는 2개 이상)은 기록만 하고 가장 계수가 낮은 실로 둔다. */
export function decodeA(G, q, x) {
  const { C, rooms } = G;
  const R = rooms.length;
  const assign = new Int16Array(C);
  let broken = 0;
  for (let c = 0; c < C; c++) {
    const on = [];
    for (let r = 0; r < R; r++) if (x[c * R + r]) on.push(r);
    if (on.length !== 1) broken++;
    if (on.length >= 1) assign[c] = on[0];
    else {
      let best = 0;
      for (let r = 1; r < R; r++) if (q.diag[c * R + r] < q.diag[c * R + best]) best = r;
      assign[c] = best;
    }
  }
  return { assign, broken };
}

/** 실 경계의 단위 벽(칸 사이 변). side: 'h'(가로 변, 위아래 칸 사이) | 'v'. */
function edgesOf(G, assign) {
  const { nx, ny, rooms } = G;
  const out = []; // { a, b, c1, c2, x1, y1, x2, y2, v, kind: 'in'|'ext'|'balc' }
  const s = G.cell;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      // 오른쪽
      if (i + 1 < nx) {
        const d = c + 1;
        if (assign[c] !== assign[d]) out.push({ kind: 'in', a: assign[c], b: assign[d], c1: c, c2: d, x1: (i + 1) * s, y1: j * s, x2: (i + 1) * s, y2: (j + 1) * s, v: true });
      } else out.push({ kind: 'ext', side: 'E', a: assign[c], c1: c, x1: nx * s, y1: j * s, x2: nx * s, y2: (j + 1) * s, v: true });
      if (i === 0) out.push({ kind: 'ext', side: 'W', a: assign[c], c1: c, x1: 0, y1: j * s, x2: 0, y2: (j + 1) * s, v: true });
      // 아래
      if (j + 1 < ny) {
        const d = c + nx;
        if (assign[c] !== assign[d]) out.push({ kind: 'in', a: assign[c], b: assign[d], c1: c, c2: d, x1: i * s, y1: (j + 1) * s, x2: (i + 1) * s, y2: (j + 1) * s, v: false });
      } else out.push({ kind: G.balcony ? 'balc' : 'ext', side: 'S', col: i, a: assign[c], c1: c, x1: i * s, y1: ny * s, x2: (i + 1) * s, y2: ny * s, v: false });
      if (j === 0) out.push({ kind: 'ext', side: 'N', a: assign[c], c1: c, x1: i * s, y1: 0, x2: (i + 1) * s, y2: 0, v: false });
    }
  return out;
}
const touchE = (e, f) => {
  // 두 단위 변이 같은 변이거나 끝점을 공유하면(문이 겹치거나 붙음)
  const pts = (x) => [
    [x.x1, x.y1],
    [x.x2, x.y2],
  ];
  return pts(e).some(([a, b]) => pts(f).some(([c, d]) => Math.abs(a - c) < 1e-9 && Math.abs(b - d) < 1e-9));
};

/** 단계 B QUBO: 문·개구부·현관문·창·발코니 문. */
export function buildStageB(G, assign) {
  const { rooms } = G;
  const E = edgesOf(G, assign);
  const vars = []; // { kind, room, edge, other }
  const add = (o) => vars.push(o) - 1;
  const b = makeBuilder();
  const groups = [];
  const typeOf = (k) => rooms[k].type;
  const keyOf = (k) => rooms[k].key;
  const COST = { 기타: 0, 거실: 1, 현관: 2, 주방: 3, 침실: 9, 화장실: 12, 드레스룸: 12, 다목적공간: 6 };
  const COST_SUITE = { master: 0 };
  // 1. 실마다 문 하나(공용 공간·발코니 제외)
  const doorVars = [];
  for (const r of rooms) {
    if (PUBLIC.has(r.type)) continue;
    if (!assign.includes(r.k)) continue;
    const g = [];
    for (const e of E) {
      if (e.kind !== 'in' || (e.a !== r.k && e.b !== r.k)) continue;
      const o = e.a === r.k ? e.b : e.a;
      const suite = r.key === 'bathMaster' || r.key === 'dress';
      let cost = suite ? (keyOf(o) === 'master' ? 0 : 6 + (COST[typeOf(o)] ?? 5)) : COST[typeOf(o)] ?? 5;
      if (keyOf(o) === 'master' && !suite) cost = 10;
      const i = add({ kind: 'door', room: r.k, other: o, e, cost });
      g.push(i);
      doorVars.push(i);
      b.lin('doorSide', i, cost);
    }
    if (g.length) groups.push({ id: 'oneDoor', g });
  }
  // 2. 현관문
  const ent = rooms.find((r) => r.type === '현관' && assign.includes(r.k));
  if (ent) {
    const g = [];
    for (const e of E) {
      if (e.kind !== 'ext' || e.a !== ent.k) continue;
      const i = add({ kind: 'entry', room: ent.k, e, cost: e.side === 'N' ? 0 : 2 });
      b.lin('entryDoor', i, e.side === 'N' ? 0 : 2);
      g.push(i);
      doorVars.push(i);
    }
    if (g.length) groups.push({ id: 'entryDoor', g });
  }
  // 3. 공용 공간끼리 개구부 하나(가운데 우선)
  const pubPairs = new Map();
  for (const e of E) {
    if (e.kind !== 'in' || !PUBLIC.has(typeOf(e.a)) || !PUBLIC.has(typeOf(e.b))) continue;
    const k = e.a < e.b ? `${e.a},${e.b}` : `${e.b},${e.a}`;
    if (!pubPairs.has(k)) pubPairs.set(k, []);
    pubPairs.get(k).push(e);
  }
  for (const list of pubPairs.values()) {
    const cx = list.reduce((s, e) => s + (e.x1 + e.x2) / 2, 0) / list.length;
    const cy = list.reduce((s, e) => s + (e.y1 + e.y2) / 2, 0) / list.length;
    const g = list.map((e) => {
      const d = Math.hypot((e.x1 + e.x2) / 2 - cx, (e.y1 + e.y2) / 2 - cy) / G.cell;
      const i = add({ kind: 'opening', room: e.b, other: e.a, e, cost: 0.3 * d });
      b.lin('opening', i, 0.3 * d);
      return i;
    });
    groups.push({ id: 'opening', g });
  }
  // 4. 문끼리 겹치지 않기
  for (let p = 0; p < doorVars.length; p++)
    for (let q = p + 1; q < doorVars.length; q++) if (touchE(vars[doorVars[p]].e, vars[doorVars[q]].e)) b.quad('clash', doorVars[p], doorVars[q], 8);
  // 5. 창·발코니 문: 거실·침실·주방
  const RATIO = { 거실: 0.7, 침실: 0.55, 주방: 0.45 };
  for (const r of rooms) {
    if (!RATIO[r.type] || !assign.includes(r.k)) continue;
    const list = E.filter((e) => (e.kind === 'ext' && e.side !== 'N') || e.kind === 'balc').filter((e) => e.a === r.k);
    const listN = E.filter((e) => e.kind === 'ext' && e.side === 'N' && e.a === r.k);
    const all = [...list, ...listN];
    if (!all.length) continue;
    const k = Math.max(1, Math.round(RATIO[r.type] * all.length));
    const ids = all.map((e) => add({ kind: e.kind === 'balc' ? 'sliding' : 'window', room: r.k, e }));
    b.countTo('windows', ids, k, 1);
    for (let p = 0; p < ids.length; p++) {
      if (vars[ids[p]].e.kind === 'balc') b.lin('windows', ids[p], -0.3); // 발코니 쪽 우선
      for (let q = p + 1; q < ids.length; q++) if (touchE(vars[ids[p]].e, vars[ids[q]].e)) b.quad('windows', ids[p], ids[q], -0.4);
    }
  }
  // 6. 실외기실: 바깥 줄(발코니 줄)의 어느 칸을 실외기실로 쓸지. 끝 칸 우선, 이어지게, 그 칸 쪽으로는 발코니 문을 내지 않음.
  if (G.outdoorUnit) {
    const { nx } = G;
    const k = Math.max(1, Math.round(1.5 / G.cell));
    const ids = [];
    for (let i = 0; i < nx; i++) {
      const id = add({ kind: 'outdoor', col: i });
      ids.push(id);
      b.lin('outdoorUnit', id, 0.6 * Math.min(i, nx - 1 - i));
    }
    b.countTo('outdoorUnit', ids, k, 3);
    for (let i = 0; i + 1 < nx; i++) b.quad('outdoorUnit', ids[i], ids[i + 1], -1);
    if (G.balcony)
      vars.forEach((vv, j) => {
        if (vv.kind === 'sliding' && vv.e.col !== undefined) b.quad('outdoorUnit', j, ids[vv.e.col], 6);
      });
  }
  const n = vars.length;
  const pre = b.finish(n, []);
  let gmax = 0;
  for (let i = 0; i < n; i++) {
    let g = Math.abs(pre.diag[i]);
    for (let j = 0; j < n; j++) g += Math.abs(pre.M[i * n + j]);
    gmax = Math.max(gmax, g);
  }
  const P = Math.ceil(gmax + 1);
  for (const { id, g } of groups) b.oneHot(id, g, P);
  const q = b.finish(n, groups.map((x) => x.g));
  q.penalty = P;
  q.vars = vars;
  return q;
}

/** 단계 B 해에서 실외기실 열. */
export const outdoorCols = (qB, x) => qB.vars.map((vv, i) => (vv.kind === 'outdoor' && x[i] ? vv.col : -1)).filter((c) => c >= 0);

/** 단계 B 해 → 문·창 목록(자유형 그림과 같은 형식, 단위 m). */
export function decodeB(G, qB, x) {
  const out = [];
  const s = G.cell;
  for (let i = 0; i < qB.n; i++) {
    if (!x[i]) continue;
    const vv = qB.vars[i];
    if (vv.kind === 'outdoor') continue;
    const e = vv.e;
    const L = s;
    const w = vv.kind === 'door' || vv.kind === 'entry' ? Math.min(0.9, L - 0.2) : vv.kind === 'opening' ? L - 0.1 : L - 0.1;
    const off = (L - w) / 2;
    const seg = e.v ? { x1: e.x1, y1: e.y1 + off, x2: e.x1, y2: e.y1 + off + w, v: true } : { x1: e.x1 + off, y1: e.y1, x2: e.x1 + off + w, y2: e.y1, v: false };
    out.push({ kind: vv.kind === 'entry' ? 'door' : vv.kind, ...seg, to: vv.room, from: vv.other ?? -1, entry: vv.kind === 'entry' });
  }
  return out;
}

/** 항별 에너지(x에서). */
export function termEnergy(q, x) {
  const out = {};
  for (const [id, t] of Object.entries(q.byTerm)) {
    let e = t.offset;
    for (const [i, v] of t.lin) if (x[i]) e += v;
    for (const [k, v] of t.quad) {
      const c = k.indexOf(',');
      if (x[+k.slice(0, c)] && x[+k.slice(c + 1)]) e += v;
    }
    out[id] = e;
  }
  return out;
}

/** 풀고 난 뒤의 점검(평가): QUBO로 정확히 쓸 수 없었던 규칙까지. */
export function evaluate(G, assign, openings) {
  const { nx, ny, rooms, cell } = G;
  const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? -1 : assign[j * nx + i]);
  const res = [];
  for (const r of rooms) {
    const cells = [];
    for (let c = 0; c < assign.length; c++) if (assign[c] === r.k) cells.push(c);
    // 연결 요소
    const seen = new Set();
    let comps = 0;
    for (const c0 of cells) {
      if (seen.has(c0)) continue;
      comps++;
      const st = [c0];
      seen.add(c0);
      while (st.length) {
        const c = st.pop();
        const i = c % nx;
        const j = Math.floor(c / nx);
        for (const [a, bb] of [
          [i + 1, j],
          [i - 1, j],
          [i, j + 1],
          [i, j - 1],
        ])
          if (at(a, bb) === r.k && !seen.has(bb * nx + a)) (seen.add(bb * nx + a), st.push(bb * nx + a));
      }
    }
    // 최소 폭: 칸마다 가로·세로로 이어진 길이 중 하나라도 최소 폭 이상이어야
    const mw = Math.max(1, Math.round((MIN_W[r.type] ?? 1) / cell - 1e-9));
    let thin = 0;
    for (const c of cells) {
      const i = c % nx;
      const j = Math.floor(c / nx);
      let h = 1;
      for (let a = i - 1; at(a, j) === r.k; a--) h++;
      for (let a = i + 1; at(a, j) === r.k; a++) h++;
      let vv = 1;
      for (let bb = j - 1; at(i, bb) === r.k; bb--) vv++;
      for (let bb = j + 1; at(i, bb) === r.k; bb++) vv++;
      if (Math.min(h, vv) < mw) thin++;
    }
    const win = openings.filter((o) => (o.kind === 'window' || o.kind === 'sliding') && o.to === r.k).length;
    res.push({ k: r.k, name: r.name, type: r.type, cells: cells.length, m2: cells.length * cell * cell, target: r.area, comps, thin, win });
  }
  // 문 그래프: 현관에서 출발
  const adj = new Map();
  const link = (a, b) => {
    if (a < 0 || b < 0) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  for (const o of openings) if (o.kind === 'door' || o.kind === 'opening') link(o.to, o.from);
  const ent = rooms.find((r) => r.type === '현관');
  const reach = new Set();
  const viaBed = new Set();
  if (ent && openings.some((o) => o.entry)) {
    // 침실을 거치지 않고 갈 수 있는 실
    const st = [ent.k];
    reach.add(ent.k);
    while (st.length) {
      const a = st.pop();
      for (const b2 of adj.get(a) || []) {
        if (reach.has(b2)) continue;
        reach.add(b2);
        if (rooms[b2].type !== '침실') st.push(b2);
      }
    }
    const st2 = [ent.k];
    const all = new Set([ent.k]);
    while (st2.length) {
      const a = st2.pop();
      for (const b2 of adj.get(a) || []) if (!all.has(b2)) (all.add(b2), st2.push(b2));
    }
    // 부부욕실·드레스룸이 안방을 거쳐 들어가는 것은 의도된 배치라 '침실 통과'로 세지 않는다
    const suiteViaMaster = (k) => ['bathMaster', 'dress'].includes(rooms[k].key) && [...(adj.get(k) || [])].some((o) => rooms[o].key === 'master');
    for (const k of all) if (!reach.has(k) && !suiteViaMaster(k)) viaBed.add(k);
    for (const k of all) reach.add(k);
  }
  const present = res.filter((r) => r.cells > 0);
  const checks = {
    missing: res.filter((r) => !r.cells).map((r) => r.name),
    split: present.filter((r) => r.comps > 1).map((r) => r.name),
    thin: present.filter((r) => r.thin > 0).map((r) => `${r.name}(${r.thin}칸)`),
    noWindow: present.filter((r) => NEEDS_WINDOW.has(r.type) && !r.win).map((r) => r.name),
    unreachable: ent && openings.some((o) => o.entry) ? present.filter((r) => !reach.has(r.k)).map((r) => r.name) : ['현관문 없음'],
    throughBed: present.filter((r) => viaBed.has(r.k)).map((r) => r.name),
    areaErr: present.reduce((s, r) => s + Math.abs(r.m2 - r.target) / r.target, 0) / Math.max(1, present.length),
  };
  const score = 100 - 25 * checks.missing.length - 15 * checks.split.length - 6 * checks.thin.length - 10 * checks.noWindow.length - 15 * checks.unreachable.length - 8 * checks.throughBed.length - 60 * checks.areaErr;
  return { rooms: res, checks, score };
}

/** 평면 그림용 P(자유형 planSvg 형식): 실내 칸 + 맨 아래 바깥 줄(발코니·실외기실). */
export function planP(G, assign, outCols = []) {
  const { nx, ny, stripRows, cell, rooms } = G;
  const balK = rooms.length;
  const ouK = rooms.length + 1;
  const full = new Int16Array(nx * (ny + stripRows));
  full.set(assign);
  for (let j = 0; j < stripRows; j++)
    for (let i = 0; i < nx; i++) full[(ny + j) * nx + i] = outCols.includes(i) ? ouK : G.balcony ? balK : -1;
  const prs = rooms.map((r) => ({ k: r.k, type: r.type, fixed: false, cells: 0 })).concat([
    { k: balK, type: '발코니', fixed: true, cells: 0 },
    { k: ouK, type: '실외기실', fixed: true, cells: 0 },
  ]);
  for (const v of full) if (v >= 0) prs[v].cells++;
  return { P: { nx, ny: ny + stripRows, sx: cell, sy: cell, rooms: prs }, assign: full, names: Object.fromEntries(rooms.map((r) => [r.k, r.name]).concat([[balK, '발코니'], [ouK, '실외기실']])) };
}

/** 공간구문(분석기·자유형과 같은 정의): 맞닿은 길이 0.6m 이상인 실을 잇는 그래프에서 통합도·깊이. */
export function syntaxGrid(G, assign) {
  const { nx, ny, rooms, cell } = G;
  const S = {};
  for (const r of rooms) S[r.k] = { n: 0, touch: new Map() };
  const touch = (a, b) => {
    if (a === b) return;
    S[a].touch.set(b, (S[a].touch.get(b) || 0) + cell / 0.3);
    S[b].touch.set(a, (S[b].touch.get(a) || 0) + cell / 0.3);
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      S[assign[c]].n++;
      if (i + 1 < nx) touch(assign[c], assign[c + 1]);
      if (j + 1 < ny) touch(assign[c], assign[c + nx]);
    }
  const P = { cellM: 0.3, sx: 0.3, sy: 0.3, rooms: rooms.map((r) => ({ k: r.k, type: r.type, fixed: false })) };
  const sx = syntaxOf(P, S);
  return { livingBedroomRatio: sx.livingBedroomRatio, kitchenBedroomRatio: sx.kitchenBedroomRatio, genotypeTau: sx.genotypeTau, privacyDepthGap: sx.privacyDepthGap, goal: SYNTAX_GOAL };
}

/**
 * 식 패널용: 지금 조건에서 단계 A·B의 에너지 식을 항과 조각(실·실 쌍)으로 나눠 돌려준다.
 * 조각마다 key가 있어 화면이 무엇이 생기고 없어지고 바뀌었는지 비교할 수 있다.
 */
export function formulaOf(spec, { cell = 1.2, syntaxScale = 1 } = {}) {
  const G = setupGrid(spec, { cell });
  const prefs = spec.prefs || [];
  const q = buildStageA(G, { prefs, syntaxScale });
  const { W, why } = weightsA(prefs, { syntaxScale });
  const R = G.rooms.length;
  const nm = (k) => G.rooms.find((r) => r.key === k)?.name || k;
  const f2 = (v) => (Math.round(v * 100) / 100).toString();
  const { good, bad } = pairsOf(G, prefs);
  const front = G.rooms.filter((r) => FRONT.has(r.type)).map((r) => r.name);
  const back = G.rooms.filter((r) => BACK.has(r.type)).map((r) => r.name);
  const termsA = [];
  const GROUP_A = { onehot: '제약(벌점)', area: '크기·모양', perim: '크기·모양', zone: '위치', window: '위치', entry: '위치', masterEnd: '위치', livingMid: '위치', adjGood: '실 사이 관계', adjBad: '실 사이 관계', livingHub: '공간구문(근사)', privacyDepth: '공간구문(근사)' };
  const T = (id, o) => {
    const t = TERMS_A.find((x) => x.id === id);
    termsA.push({ id, label: t.label, group: GROUP_A[id], rule: t.rule, general: t.qubo, note: t.note || '', approx: !t.exact, w: id === 'onehot' ? q.penalty : W[id], why: why[id] || [], ...o });
  };
  T('onehot', { wSym: 'P<sub>A</sub>', head: `Σ<sub>c=1…${G.C}</sub> (Σ<sub>r=1…${R}</sub> x<sub>c,r</sub> − 1)²` });
  T('area', { chips: G.rooms.map((r) => ({ key: `area:${r.key}`, html: `((N<sub>${r.name}</sub> − ${f2(r.t)}) / ${f2(r.t)})²` })) });
  T('perim', { chips: G.rooms.map((r) => ({ key: `perim:${r.key}`, html: `둘레<sub>${r.name}</sub> / ${f2(4 * Math.sqrt(r.t))}` })) });
  T('zone', { chips: [{ key: 'zone:front', html: `앞(남)으로: ${front.join('·')}` }, { key: 'zone:back', html: `뒤(북)으로: ${back.join('·')}` }] });
  T('window', { chips: G.rooms.filter((r) => NEEDS_WINDOW.has(r.type)).map((r) => ({ key: `win:${r.key}`, html: `−바깥 칸<sub>${r.name}</sub>` })) });
  T('adjGood', { chips: good.map(([a, b2, m]) => ({ key: `good:${a}:${b2}`, html: `${m === 1 ? '' : `${f2(m)}·`}맞닿음(${nm(a)}, ${nm(b2)})`, sign: '−' })) });
  T('adjBad', { chips: bad.map(([a, b2, m]) => ({ key: `bad:${a}:${b2}`, html: `${m === 1 ? '' : `${f2(m)}·`}맞닿음(${nm(a)}, ${nm(b2)})` })) });
  T('entry', { head: '−Σ<sub>c∈맨 뒤 줄</sub> x<sub>c,현관</sub>' });
  T('masterEnd', { head: '−Σ<sub>c∈양 끝 열</sub> x<sub>c,안방</sub>' });
  T('livingMid', { head: 'Σ<sub>c</sub> |열<sub>c</sub> − 가운데| / 폭 · x<sub>c,거실</sub>' });
  if (W.livingHub) T('livingHub', { head: '−Σ<sub>r≠거실</sub> 맞닿음(거실, r)' });
  if (W.privacyDepth) T('privacyDepth', { chips: G.rooms.filter((r) => r.type === '침실').map((r) => ({ key: `priv:${r.key}`, html: `가까움(${r.name}, 현관) / ${f2(r.t)}` })) });
  const doorRooms = G.rooms.filter((r) => !PUBLIC.has(r.type));
  const winRooms = G.rooms.filter((r) => ['거실', '침실', '주방'].includes(r.type));
  const termsB = [
    { id: 'oneDoor', label: '실마다 문 하나', wSym: 'P<sub>B</sub>', chips: doorRooms.map((r) => ({ key: `door:${r.key}`, html: `(Σ<sub>e</sub> d<sub>${r.name},e</sub> − 1)²` })) },
    { id: 'doorSide', label: '문 쪽 우선순위', w: 1, chips: doorRooms.map((r) => ({ key: `side:${r.key}`, html: `비용(${r.name}의 이웃)·d` })) },
    { id: 'entryDoor', label: '현관문 하나', wSym: 'P<sub>B</sub>', head: '(Σ<sub>e∈현관 바깥 벽</sub> h<sub>e</sub> − 1)² + 비용·h' },
    { id: 'opening', label: '공용 공간 트기', wSym: 'P<sub>B</sub>', head: 'Σ<sub>맞닿은 공용 쌍</sub> (Σ<sub>e</sub> o<sub>e</sub> − 1)² + 거리·o' },
    { id: 'clash', label: '문끼리 겹치지 않기', w: 8, head: 'Σ<sub>겹치는 쌍</sub> d<sub>e</sub>d<sub>e′</sub>' },
    { id: 'windows', label: G.balcony ? '창·발코니 문' : '창(발코니 없음 → 남쪽 벽도 창)', w: 1, chips: winRooms.map((r) => ({ key: `wb:${r.key}`, html: `(Σ<sub>e</sub> w<sub>${r.name},e</sub> − k<sub>${r.name}</sub>)²` })) },
  ];
  const GROUP_B = { oneDoor: '제약(벌점)', entryDoor: '제약(벌점)', opening: '제약(벌점)', doorSide: '문 위치', clash: '문 위치', windows: '창', outdoorUnit: '실외기실' };
  for (const t of termsB) {
    const d = TERMS_B.find((x) => x.id === t.id);
    Object.assign(t, { group: GROUP_B[t.id], rule: d?.rule || '', general: d?.qubo || '', approx: false, why: [] });
  }
  if (G.outdoorUnit) termsB.push({ id: 'outdoorUnit', label: '실외기실 자리', group: GROUP_B.outdoorUnit, rule: TERMS_B.find((x) => x.id === 'outdoorUnit').rule, general: TERMS_B.find((x) => x.id === 'outdoorUnit').qubo, approx: false, why: [], w: 3, head: `(Σ<sub>i=1…${G.nx}</sub> u<sub>i</sub> − ${Math.max(1, Math.round(1.5 / G.cell))})² + 끝에서 거리·u − 이어짐${G.balcony ? ' + 2·발코니 문×u' : ''}` });
  return { G: { nx: G.nx, ny: G.ny, C: G.C, R, cell: G.cell }, n: q.n, P: q.penalty, termsA, termsB };
}

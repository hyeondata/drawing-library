// 생성 모형의 정확 공간구문 QUBO(analysis/syntax_qubo/aligned.py AlignedQubo + gen_qubo.py의 JS판).
// 고정 기록(Confluence 09-21) ③: 제약 C1~C8(원-핫·맞닿음·복도 존재·깊이 구조·최단 깊이 하한), 벌점 P = Σ|목적 계수| + 1,
// 목적 E = Σ β_j f_j(f = O1 거실 RRA · O2 현관 RRA · O3 공·사 깊이 차 · O7 주방 RRA · O2b 현관→거실 깊이).
// Python판과 변수 이름·추가 순서·계수가 같다(test/qubo-exact.test.js가 Python이 만든 BQM과 대조). 판정 규칙 1 결과: evidence/results/gen-qubo-exact.md.

const EPS = 1e-12;
const ROOTS = ['living', 'entrance', 'kitchen'];
export const GEN_TERMS = ['O1', 'O2', 'O3', 'O7', 'O2b'];

const ov = (i, j, m, k) => Math.min((i + 1) / m, (j + 1) / k) - Math.max(i / m, j / k) > EPS;

/** dimod BinaryQuadraticModel(BINARY)과 같은 누적 규칙: 변수는 처음 나온 순서대로. */
class BQM {
  constructor() {
    this.linear = new Map();
    this.quad = new Map(); // "a\u0000b"(추가된 순서 그대로가 아니라 정규화 키) → [a, b, c]
    this.offset = 0;
  }
  addVariable(v, c = 0) {
    this.linear.set(v, (this.linear.get(v) ?? 0) + c);
  }
  addLinear(v, c) {
    this.addVariable(v, c);
  }
  addQuadratic(a, b, c) {
    if (a === b) throw new Error(`self-loop ${a}`);
    this.addVariable(a);
    this.addVariable(b);
    const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
    const e = this.quad.get(key);
    if (e) e[2] += c;
    else this.quad.set(key, a < b ? [a, b, c] : [b, a, c]);
  }
}

/** 템플릿: { front(안방 포함), back, suite, types }. */
export class AlignedQubo {
  constructor(t) {
    this.t = t;
    this.rest = t.front.filter((r) => r !== 'master');
    this.m1 = this.rest.length;
    this.k = t.back.length;
    this.bqm = new BQM();
    this.squares = []; // [lin(Map), c]: P·(c + Σ w v)²
    this.rosen = []; // [z, a, b]
    this.prodOf = new Map();
    this.adjCache = new Map();
    this.roots = new Map();
    for (const r of this.rest) for (let i = 0; i < this.m1; i++) this.bqm.addVariable(xf(r, i));
    for (const v of t.back) for (let j = 0; j < this.k; j++) this.bqm.addVariable(xb(v, j));
    this.halls = this.rest.some((r) => r !== 'living') ? ['hallA', 'hallB'] : [];
    this.nodes = ['master', ...this.rest, ...t.back, ...t.suite, ...this.halls];
  }

  prod(a, b) {
    const [p, q] = a < b ? [a, b] : [b, a];
    const key = `${p}|${q}`;
    if (!this.prodOf.has(key)) {
      const z = `z|${p}|${q}`;
      this.prodOf.set(key, z);
      this.bqm.addVariable(z);
      this.rosen.push([z, p, q]);
    }
    return this.prodOf.get(key);
  }

  /** 맞닿음 a_uv의 정확한 식 [상수, Map(변수 → 계수)]. aligned.py expr와 같은 분기. */
  expr(u, v) {
    const { t, rest: R, m1, k } = this;
    const L = 'living';
    const S = new Set([u, v]);
    const lin = new Map();
    const add = (name, c = 1) => lin.set(name, (lin.get(name) ?? 0) + c);
    const has = (x) => S.has(x);
    const other = (x) => [...S].find((y) => y !== x);
    const suite = ['dress', 'bathMaster'].filter((x) => t.suite.includes(x));
    const chain = ['master', ...suite];
    for (let i = 0; i + 1 < chain.length; i++) if (S.size === 2 && has(chain[i]) && has(chain[i + 1])) return [1, new Map()];
    const sIn = [...S].filter((x) => suite.includes(x));
    if (sIn.length) {
      const s = sIn[0];
      const o = S.size === 2 ? other(s) : null;
      if (t.back.includes(o)) {
        add(xb(o, 0));
        return [0, lin];
      }
      return [0, new Map()];
    }
    if (has('master')) {
      const o = other('master');
      if (R.includes(o)) {
        add(xf(o, 0));
        return [0, lin];
      }
      if (o === 'hallA') {
        if (R.includes(L)) add(xf(L, 0), -1);
        return [1, lin];
      }
      return [0, new Map()];
    }
    if ([...S].every((x) => R.includes(x))) {
      const [a, b] = [...S].sort();
      for (let i = 0; i < m1 - 1; i++) {
        add(this.prod(xf(a, i), xf(b, i + 1)));
        add(this.prod(xf(b, i), xf(a, i + 1)));
      }
      return [0, lin];
    }
    if ([...S].every((x) => t.back.includes(x))) {
      const [a, b] = [...S].sort();
      for (let j = 0; j < k - 1; j++) {
        add(this.prod(xb(a, j), xb(b, j + 1)));
        add(this.prod(xb(b, j), xb(a, j + 1)));
      }
      return [0, lin];
    }
    const backIn = [...S].filter((x) => t.back.includes(x));
    if (has(L) && backIn.length) {
      const vb = backIn[0];
      for (let i = 0; i < m1; i++) for (let j = 0; j < k; j++) if (ov(i, j, m1, k)) add(this.prod(xf(L, i), xb(vb, j)));
      return [0, lin];
    }
    if ([...S].some((x) => R.includes(x)) && backIn.length) return [0, new Map()];
    const h = [...S].find((x) => x === 'hallA' || x === 'hallB');
    if (!h) return [0, new Map()];
    const o = S.size === 2 ? other(h) : null;
    const A = h === 'hallA';
    if (o === 'hallA' || o === 'hallB') return [0, new Map()];
    if (o === L) {
      add(xf(L, A ? 0 : m1 - 1), -1);
      return [1, lin];
    }
    if (R.includes(o)) {
      for (let i = 0; i < m1; i++) for (let j = 0; j < m1; j++) if ((A && j > i) || (!A && j < i)) add(this.prod(xf(o, i), xf(L, j)));
      return [0, lin];
    }
    if (t.back.includes(o)) {
      for (let ls = 0; ls < m1; ls++)
        for (let j = 0; j < k; j++) {
          const hit = A ? j / k < ls / m1 - EPS : (j + 1) / k > (ls + 1) / m1 + EPS;
          if (hit) add(this.prod(xf(L, ls), xb(o, j)));
        }
      return [0, lin];
    }
    return [0, new Map()];
  }

  exists(v) {
    if (v === 'hallA') return [1, new Map([[xf('living', 0), -1]])];
    if (v === 'hallB') return [1, new Map([[xf('living', this.m1 - 1), -1]])];
    return [1, new Map()];
  }

  adjacencyTerms(u, v) {
    const key = [u, v].sort().join('\u0000');
    if (this.adjCache.has(key)) return this.adjCache.get(key);
    const [c, lin] = this.expr(u, v);
    let res;
    if (!lin.size) res = [c, []];
    else {
      const a = `A|${[u, v].sort().join('|')}`;
      this.bqm.addVariable(a);
      const sq = new Map([[a, 1]]);
      for (const [n, w] of lin) sq.set(n, -w);
      this.squares.push([sq, -c]);
      res = [0, [a]];
    }
    this.adjCache.set(key, res);
    return res;
  }

  depthStructure(root, K, lowerBound) {
    const others = this.nodes.filter((v) => v !== root);
    const e = new Map(); // "v|u|d" → [v, u, d, name]
    for (const v of others)
      for (let d = 1; d <= K; d++) {
        const parents = d === 1 ? [root] : others.filter((u) => u !== v);
        for (const u of parents) {
          const [c, a] = this.adjacencyTerms(u, v);
          if (c === 0 && !a.length) continue;
          e.set(`${v}|${u}|${d}`, [v, u, d, `e|${root}|${v}|${u}|${d}`]);
        }
      }
    const h = new Map();
    for (const v of others)
      for (let d = 1; d <= K; d++) {
        const hn = `h|${root}|${v}|${d}`;
        this.bqm.addVariable(hn);
        h.set(`${v}|${d}`, hn);
        const sq = new Map([[hn, 1]]);
        for (const [vv, , dd, n] of e.values()) if (vv === v && dd === d) sq.set(n, -1);
        this.squares.push([sq, 0]);
      }
    this.roots.set(root, { K, others, e, h, lowerBound });
  }

  totalDepth(root, weights = null) {
    const out = new Map();
    for (const [key, hn] of this.roots.get(root).h) {
      const i = key.lastIndexOf('|');
      const v = key.slice(0, i);
      const d = Number(key.slice(i + 1));
      const w = weights === null ? 1 : weights[v] ?? 0;
      if (w) out.set(hn, (out.get(hn) ?? 0) + w * d);
    }
    return out;
  }

  /** RRA의 정확한 이차식(aligned.py rra_objective). 키: 변수 이름, [a, b](곱), '' (상수). */
  rraObjective(root, weight = 1) {
    const D = (k) => (2 * (k * (Math.log2((k + 2) / 3) - 1) + 1)) / ((k - 1) * (k - 2));
    const a = (k) => 2 / ((k - 1) * (k - 2) * D(k));
    const b = (k) => -2 / ((k - 2) * D(k));
    const n2 = this.nodes.length;
    const td = this.totalDepth(root);
    const out = new Map();
    for (const [v, c] of td) out.set(v, weight * a(n2) * c);
    out.set('', weight * b(n2));
    if (!this.halls.length) return out;
    const n1 = n2 - 1;
    for (const x of new Set([xf('living', 0), xf('living', this.m1 - 1)])) {
      out.set(x, (out.get(x) ?? 0) + weight * (b(n1) - b(n2)));
      for (const [v, c] of td) {
        const key = `${x}\u0001${v}`;
        out.set(key, (out.get(key) ?? 0) + weight * (a(n1) - a(n2)) * c);
      }
    }
    return out;
  }

  sq(lin, c, P) {
    const items = [...lin];
    this.bqm.offset += P * c * c;
    for (const [n, w] of items) this.bqm.addLinear(n, P * (w * w + 2 * c * w));
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) this.bqm.addQuadratic(items[i][0], items[j][0], 2 * P * items[i][1] * items[j][1]);
  }

  finalize(objective) {
    let P = 1;
    for (const [key, c] of objective) if (key !== '') P += Math.abs(c);
    this.P = P;
    const { bqm, t } = this;
    for (const r of this.rest) this.sq(new Map(Array.from({ length: this.m1 }, (_, i) => [xf(r, i), 1])), -1, P);
    for (let i = 0; i < this.m1; i++) this.sq(new Map(this.rest.map((r) => [xf(r, i), 1])), -1, P);
    for (const v of t.back) this.sq(new Map(Array.from({ length: this.k }, (_, j) => [xb(v, j), 1])), -1, P);
    for (let j = 0; j < this.k; j++) this.sq(new Map(t.back.map((v) => [xb(v, j), 1])), -1, P);
    for (const [z, a, b] of this.rosen) {
      bqm.addQuadratic(a, b, P);
      bqm.addQuadratic(a, z, -2 * P);
      bqm.addQuadratic(b, z, -2 * P);
      bqm.addLinear(z, 3 * P);
    }
    for (const [root, info] of this.roots) {
      for (const v of info.others) {
        const [c, lin] = this.exists(v);
        const s = new Map();
        for (const [vv, , , n] of info.e.values()) if (vv === v) s.set(n, 1);
        for (const [n, w] of lin) s.set(n, -w);
        this.sq(s, -c, P);
      }
      for (const [v, u, d, en] of info.e.values()) {
        const [c, a] = this.adjacencyTerms(u, v);
        bqm.addLinear(en, P * (1 - c));
        for (const an of a) bqm.addQuadratic(en, an, -P);
        if (d >= 2) {
          bqm.addLinear(en, P);
          bqm.addQuadratic(en, info.h.get(`${u}|${d - 1}`), -P);
        }
      }
      if (info.lowerBound) this.lowerBound(root, info, P);
    }
    for (const [lin, c] of this.squares) this.sq(lin, c, P);
    for (const [key, c] of objective) {
      if (key === '') bqm.offset += c;
      else if (key.includes('\u0001')) {
        const [a, b] = key.split('\u0001');
        bqm.addQuadratic(a, b, c);
      } else bqm.addLinear(key, c);
    }
    return bqm;
  }

  lowerBound(root, info, P) {
    const { K, others } = info;
    const all = [root, ...others];
    for (const u of all)
      for (const v of all) {
        if (u === v || v === root) continue;
        const [c, a] = this.adjacencyTerms(u, v);
        if (c === 0 && !a.length) continue;
        const dus = u === root ? [0] : Array.from({ length: K }, (_, i) => i + 1);
        for (const du of dus)
          for (let dv = du + 2; dv <= K; dv++) {
            const hv = info.h.get(`${v}|${dv}`);
            if (u === root) {
              this.bqm.addLinear(hv, P * c);
              for (const an of a) this.bqm.addQuadratic(an, hv, P);
              continue;
            }
            const hu = info.h.get(`${u}|${du}`);
            const y = `y|${root}|${u}|${du}|${v}|${dv}`;
            this.bqm.addQuadratic(hu, hv, P);
            this.bqm.addQuadratic(hu, y, -2 * P);
            this.bqm.addQuadratic(hv, y, -2 * P);
            this.bqm.addLinear(y, 3 * P + P * c);
            for (const an of a) this.bqm.addQuadratic(an, y, P);
          }
      }
  }

  // ---- 배치 → 그래프 ----
  assignment(restPerm, backPerm) {
    const st = new Map();
    restPerm.forEach((r, i) => this.rest.forEach((rr) => st.set(xf(rr, i), rr === r ? 1 : 0)));
    backPerm.forEach((v, j) => this.t.back.forEach((vv) => st.set(xb(vv, j), vv === v ? 1 : 0)));
    for (const [z, a, b] of this.rosen) st.set(z, st.get(a) * st.get(b));
    return st;
  }

  /** 배치의 공간 그래프 { nodes: {이름: 유형}, adj: Map(이름 → Set) }(syntax-gen.js syntaxStats 입력 형식). */
  graph(restPerm, backPerm) {
    const st = this.assignment(restPerm, backPerm);
    const val = (c, lin) => {
      let s = c;
      for (const [n, w] of lin) s += w * (st.has(n) ? st.get(n) : this.prodValue(n, st));
      return s;
    };
    const nodes = {};
    for (const v of this.nodes) {
      const [c, lin] = this.exists(v);
      if (val(c, lin) > 0.5) nodes[v] = this.t.types[v] ?? '기타';
    }
    const keys = Object.keys(nodes);
    const adj = new Map(keys.map((k) => [k, new Set()]));
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++) {
        const [c, lin] = this.expr(keys[i], keys[j]);
        if (val(c, lin) > 0.5) adj.get(keys[i]).add(keys[j]), adj.get(keys[j]).add(keys[i]);
      }
    return { nodes, adj };
  }

  prodValue(z, st) {
    const r = this.rosen.find((x) => x[0] === z);
    const v = st.get(r[1]) * st.get(r[2]);
    st.set(z, v);
    return v;
  }
}

export function xf(r, i) {
  return `x|${r}|f${i}`;
}
export function xb(v, j) {
  return `x|${v}|b${j}`;
}

/** 항마다 목적식(gen_qubo.py term_objectives). 깊이 구조를 먼저 만들어 둬야 한다. */
export function termObjectives(q) {
  const beds = q.nodes.filter((v) => q.t.types[v] === '침실');
  const pub = q.nodes.filter((v) => q.t.types[v] === '거실' || q.t.types[v] === '주방');
  const w3 = {};
  for (const v of beds) w3[v] = -1 / beds.length;
  for (const v of pub) w3[v] = (w3[v] ?? 0) + 1 / pub.length;
  return {
    O1: q.rraObjective('living'),
    O2: q.rraObjective('entrance'),
    O3: q.totalDepth('entrance', w3),
    O7: q.rraObjective('kitchen'),
    O2b: q.totalDepth('entrance', { living: 1 }),
  };
}

export function combine(objs, beta) {
  const out = new Map();
  for (const [j, o] of Object.entries(objs)) {
    const b = beta[j] ?? 0;
    if (!b) continue;
    for (const [key, c] of o) out.set(key, (out.get(key) ?? 0) + b * c);
  }
  return out;
}

function* perms(a) {
  if (a.length <= 1) {
    yield a.slice();
    return;
  }
  for (let i = 0; i < a.length; i++) for (const p of perms([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...p];
}

function bfs(adj, s) {
  const d = new Map([[s, 0]]);
  const q = [s];
  for (let i = 0; i < q.length; i++) for (const v of adj.get(q[i])) if (!d.has(v)) d.set(v, d.get(q[i]) + 1), q.push(v);
  return d;
}

/** 템플릿의 모든 배치: [{ rp, bp, g, connected }] 와 세 뿌리의 최대 깊이 K. */
export function enumerateTemplate(t) {
  const q = new AlignedQubo(t);
  const out = [];
  let K = 1;
  for (const rp of perms(q.rest))
    for (const bp of perms(t.back)) {
      const g = q.graph(rp, bp);
      const keys = Object.keys(g.nodes);
      const connected = bfs(g.adj, keys[0]).size === keys.length;
      if (connected) for (const r of ROOTS) K = Math.max(K, Math.max(...bfs(g.adj, r).values()));
      out.push({ rp, bp, g, connected });
    }
  return { arrangements: out, K };
}

/** 생성 모형 BQM(gen_qubo.py build). beta: { O1: β, ... }(원 단위 β_raw). */
export function buildGenQubo(t, beta, K) {
  const q = new AlignedQubo(t);
  for (const r of ROOTS) q.depthStructure(r, K, true);
  const objs = termObjectives(q);
  const bqm = q.finalize(combine(objs, beta));
  return { q, bqm, objs };
}

/** 이진 해 x(Map 또는 배열 + 변수 목록)를 배치로 푼다. 원-핫을 어기면 null. */
export function decodeArrangement(q, val) {
  const rp = [];
  for (let i = 0; i < q.m1; i++) {
    const on = q.rest.filter((r) => val(xf(r, i)) === 1);
    if (on.length !== 1) return null;
    rp.push(on[0]);
  }
  const bp = [];
  for (let j = 0; j < q.k; j++) {
    const on = q.t.back.filter((v) => val(xb(v, j)) === 1);
    if (on.length !== 1) return null;
    bp.push(on[0]);
  }
  if (new Set(rp).size !== rp.length || new Set(bp).size !== bp.length) return null;
  return { rp, bp };
}

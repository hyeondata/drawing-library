"""정렬 모드(+복도) 평면의 정확 공간구문 QUBO.

기하(layout.js p.align, 안방 왼쪽 끝 — 오른쪽 끝은 좌우 대칭이라 공간구문이 같다):
  - 앞 띠: 칸 0 = 안방(고정), 칸 1..m−1 = 나머지 앞 띠 실(rest 칸 0..m1−1). 거실·안방은 앞 띠 깊이 전체.
  - 작은방 뒤에는 복도. 거실이 복도를 나눠 최대 두 개: hallA(안방 쪽 구간), hallB(거실 너머 구간).
  - 뒤 띠: 안방 아래 열 = 부속실(위에서 드레스룸 → 부부욕실), 나머지 k칸은 rest 칸과 0~1 정규화 겹침으로 맞닿는다.
맞닿음 a_uv는 배치 변수 x의 (상수 + 일차 + 곱) 식으로 정확히 쓴다. 곱은 Rosenberg 보조 변수, a_uv는 등식으로 묶은 이진 변수 A.
깊이 구조(뿌리에서 BFS)는 model.py와 같은 방식이며, 복도처럼 있을 수도 없을 수도 있는 노드는 '존재 식'으로 원-핫 합을 맞춘다.
모든 벌점은 어떤 이진 상태에서도 0 이상(제곱 또는 Rosenberg) → P > 목적 범위면 바닥 상태는 유효 배치.
"""

from __future__ import annotations

import itertools
import math

import dimod
import networkx as nx

from .model import Template


def ov(i, j, m, k) -> bool:
    return min((i + 1) / m, (j + 1) / k) - max(i / m, j / k) > 1e-12


class AlignedQubo:
    def __init__(self, t: Template):
        self.t = t
        self.rest = [r for r in t.front if r != "master"]
        self.m1 = len(self.rest)
        self.k = len(t.back)
        self.bqm = dimod.BinaryQuadraticModel("BINARY")
        self.squares: list[tuple[dict, float]] = []  # P·(c + Σ w v)²
        self.rosen: list[tuple[str, str, str]] = []  # z = a·b
        self.prod_of: dict[tuple, str] = {}
        self.adj_cache: dict[frozenset, tuple[float, list[str]]] = {}
        self.roots: dict[str, dict] = {}
        for r in self.rest:
            for i in range(self.m1):
                self.bqm.add_variable(self.xf(r, i), 0.0)
        for v in t.back:
            for j in range(self.k):
                self.bqm.add_variable(self.xb(v, j), 0.0)
        self.halls = ["hallA", "hallB"] if any(r != "living" for r in self.rest) else []
        self.nodes = ["master"] + self.rest + list(t.back) + list(t.suite) + self.halls

    # ---- 변수 ----
    @staticmethod
    def xf(r, i):
        return f"x|{r}|f{i}"

    @staticmethod
    def xb(v, j):
        return f"x|{v}|b{j}"

    def prod(self, a: str, b: str) -> str:
        key = tuple(sorted((a, b)))
        if key not in self.prod_of:
            z = f"z|{key[0]}|{key[1]}"
            self.prod_of[key] = z
            self.bqm.add_variable(z, 0.0)
            self.rosen.append((z, key[0], key[1]))
        return self.prod_of[key]

    # ---- 식: (상수, {변수: 계수}) ----
    def expr(self, u, v) -> tuple[float, dict]:
        """배치(x)가 정하는 맞닿음 a_uv의 정확한 식(원-핫이 지켜질 때 0 또는 1)."""
        t, R, m1, k = self.t, self.rest, self.m1, self.k
        L = "living"
        S = {u, v}
        lin: dict[str, float] = {}

        def add(var, c=1.0):
            lin[var] = lin.get(var, 0.0) + c

        suite = [x for x in ("dress", "bathMaster") if x in t.suite]  # 위(안방 쪽)에서 아래로: 드레스룸 → 부부욕실
        chain = ["master"] + suite
        if any(S == {a, b} for a, b in zip(chain, chain[1:])):
            return 1.0, {}
        if S & set(suite):
            s = next(iter(S & set(suite)))
            o = next(iter(S - {s})) if len(S) == 2 else None
            if o in t.back:  # 부속실 열 옆 = 뒤 칸 0
                add(self.xb(o, 0))
                return 0.0, lin
            return 0.0, {}
        if "master" in S:
            o = next(iter(S - {"master"}))
            if o in R:
                add(self.xf(o, 0))
                return 0.0, lin
            if o == "hallA":
                if L in R:
                    add(self.xf(L, 0), -1.0)
                return 1.0, lin
            return 0.0, {}
        if S <= set(R):
            a, b = sorted(S)
            for i in range(m1 - 1):
                add(self.prod(self.xf(a, i), self.xf(b, i + 1)))
                add(self.prod(self.xf(b, i), self.xf(a, i + 1)))
            return 0.0, lin
        if S <= set(t.back):
            a, b = sorted(S)
            for j in range(k - 1):
                add(self.prod(self.xb(a, j), self.xb(b, j + 1)))
                add(self.prod(self.xb(b, j), self.xb(a, j + 1)))
            return 0.0, lin
        if L in S and S & set(t.back):
            vb = next(iter(S & set(t.back)))
            for i in range(m1):
                for j in range(k):
                    if ov(i, j, m1, k):
                        add(self.prod(self.xf(L, i), self.xb(vb, j)))
            return 0.0, lin
        if S & set(R) and S & set(t.back):
            return 0.0, {}  # 작은방은 복도가 뒤 띠와 갈라 놓는다
        h = next((x for x in S if x in ("hallA", "hallB")), None)
        if h is None:
            return 0.0, {}
        o = next(iter(S - {h})) if len(S) == 2 else None
        A = h == "hallA"
        if o in ("hallA", "hallB"):
            return 0.0, {}
        if o == L:
            add(self.xf(L, 0 if A else m1 - 1), -1.0)
            return 1.0, lin
        if o in R:  # 작은방 o가 그 구간에 있음: A면 거실보다 왼쪽, B면 오른쪽
            for i in range(m1):
                for j in range(m1):
                    if (A and j > i) or (not A and j < i):
                        add(self.prod(self.xf(o, i), self.xf(L, j)))
            return 0.0, lin
        if o in t.back:  # 구간(정규화) [0, ls/m1) 또는 [(ls+1)/m1, 1)과 뒤 칸 j가 겹침
            for ls in range(m1):
                for j in range(k):
                    hit = (j / k < ls / m1 - 1e-12) if A else ((j + 1) / k > (ls + 1) / m1 + 1e-12)
                    if hit:
                        add(self.prod(self.xf(L, ls), self.xb(o, j)))
            return 0.0, lin
        return 0.0, {}

    def exists(self, v) -> tuple[float, dict]:
        if v == "hallA":
            return 1.0, {self.xf("living", 0): -1.0}
        if v == "hallB":
            return 1.0, {self.xf("living", self.m1 - 1): -1.0}
        return 1.0, {}

    def adjacency_terms(self, u, v) -> tuple[float, list[str]]:
        key = frozenset((u, v))
        if key in self.adj_cache:
            return self.adj_cache[key]
        c, lin = self.expr(u, v)
        if not lin:
            res = (c, [])
        else:
            a = f"A|{'|'.join(sorted((u, v)))}"
            self.bqm.add_variable(a, 0.0)
            self.squares.append(({a: 1.0, **{n: -w for n, w in lin.items()}}, -c))  # (A − c − Σ w t)²
            res = (0.0, [a])
        self.adj_cache[key] = res
        return res

    # ---- 깊이 구조 ----
    def depth_structure(self, root: str, K: int, lower_bound: bool):
        others = [v for v in self.nodes if v != root]
        e_vars = {}
        for v in others:
            for d in range(1, K + 1):
                parents = [root] if d == 1 else [u for u in others if u != v]
                for u in parents:
                    c, a = self.adjacency_terms(u, v)
                    if c == 0 and not a:
                        continue
                    e_vars[(v, u, d)] = f"e|{root}|{v}|{u}|{d}"
        h = {}
        for v in others:
            for d in range(1, K + 1):
                hn = f"h|{root}|{v}|{d}"
                self.bqm.add_variable(hn, 0.0)
                h[(v, d)] = hn
                self.squares.append(({hn: 1.0, **{n: -1.0 for (vv, _, dd), n in e_vars.items() if vv == v and dd == d}}, 0.0))
        self.roots[root] = {"K": K, "others": others, "e": e_vars, "h": h, "lower_bound": lower_bound}

    def total_depth(self, root, weights=None) -> dict:
        out = {}
        for (v, d), hn in self.roots[root]["h"].items():
            w = 1.0 if weights is None else weights.get(v, 0.0)
            if w:
                out[hn] = out.get(hn, 0.0) + w * d
        return out

    def rra_objective(self, root, weight=1.0) -> dict:
        """뿌리의 RRA를 정확한 이차식으로(Hillier & Hanson 1984 RA·D 값, HHG 1987).

        RRA = α_k·TD + β_k, α_k = 2/((k−1)(k−2)D_k), β_k = −2/((k−2)D_k), k = 존재하는 노드 수.
        정렬 틀에서 복도(hallA·hallB)는 거실이 앞 rest 칸의 끝에 있을 때 하나가 없어진다: e = x[거실,0] + x[거실,끝] ∈ {0,1}, k = n2 − e.
        그래서 RRA = α₂·TD + β₂ + e·((α₁−α₂)·TD + (β₁−β₂)) — e·TD는 x·h 곱이라 이차. 반환: {변수: 계수, (변수, 변수): 계수, "": 상수}.
        """
        D = lambda k: 2 * (k * (math.log2((k + 2) / 3) - 1) + 1) / ((k - 1) * (k - 2))  # noqa: E731
        a = lambda k: 2 / ((k - 1) * (k - 2) * D(k))  # noqa: E731
        b = lambda k: -2 / ((k - 2) * D(k))  # noqa: E731
        n2 = len(self.nodes)
        td = self.total_depth(root)
        out: dict = {}
        if not self.halls:
            for v, c in td.items():
                out[v] = weight * a(n2) * c
            out[""] = weight * b(n2)
            return out
        n1 = n2 - 1
        for v, c in td.items():
            out[v] = weight * a(n2) * c
        out[""] = weight * b(n2)
        ends = {self.xf("living", 0), self.xf("living", self.m1 - 1)}
        for x in ends:
            out[x] = out.get(x, 0.0) + weight * (b(n1) - b(n2))
            for v, c in td.items():
                out[(x, v)] = out.get((x, v), 0.0) + weight * (a(n1) - a(n2)) * c
        return out

    def finalize(self, objective: dict) -> dimod.BinaryQuadraticModel:
        P = sum(abs(c) for k, c in objective.items() if k != "") + 1.0
        self.P = P
        bqm, t = self.bqm, self.t
        # 원-핫(앞 rest 실·칸, 뒤 실·칸)
        for r in self.rest:
            self._sq({self.xf(r, i): 1.0 for i in range(self.m1)}, -1.0, P)
        for i in range(self.m1):
            self._sq({self.xf(r, i): 1.0 for r in self.rest}, -1.0, P)
        for v in t.back:
            self._sq({self.xb(v, j): 1.0 for j in range(self.k)}, -1.0, P)
        for j in range(self.k):
            self._sq({self.xb(v, j): 1.0 for v in t.back}, -1.0, P)
        for z, a, b in self.rosen:
            bqm.add_quadratic(a, b, P)
            bqm.add_quadratic(a, z, -2 * P)
            bqm.add_quadratic(b, z, -2 * P)
            bqm.add_linear(z, 3 * P)
        for root, info in self.roots.items():
            for v in info["others"]:
                c, lin = self.exists(v)
                es = {n: 1.0 for (vv, _, _), n in info["e"].items() if vv == v}
                self._sq({**es, **{n: -w for n, w in lin.items()}}, -c, P)  # Σe = 존재
            for (v, u, d), en in info["e"].items():
                c, a = self.adjacency_terms(u, v)
                bqm.add_linear(en, P * (1 - c))
                for an in a:
                    bqm.add_quadratic(en, an, -P)
                if d >= 2:
                    bqm.add_linear(en, P)
                    bqm.add_quadratic(en, info["h"][(u, d - 1)], -P)
            if info["lower_bound"]:
                self._lower_bound(root, info, P)
        for lin, c in self.squares:
            self._sq(lin, c, P)
        for v, c in objective.items():
            if v == "":
                bqm.offset += c
            elif isinstance(v, tuple):
                bqm.add_quadratic(v[0], v[1], c)
            else:
                bqm.add_linear(v, c)
        return bqm

    def _sq(self, lin: dict, c: float, P: float):
        """P·(c + Σ w_i v_i)², 이진 v_i² = v_i."""
        items = list(lin.items())
        self.bqm.offset += P * c * c
        for n, w in items:
            self.bqm.add_linear(n, P * (w * w + 2 * c * w))
        for (a, wa), (b, wb) in itertools.combinations(items, 2):
            self.bqm.add_quadratic(a, b, 2 * P * wa * wb)

    def _lower_bound(self, root, info, P):
        K, others = info["K"], info["others"]
        for u, v in itertools.permutations([root] + others, 2):
            if v == root:
                continue
            c, a = self.adjacency_terms(u, v)
            if c == 0 and not a:
                continue
            for du in ([0] if u == root else range(1, K + 1)):
                for dv in range(du + 2, K + 1):
                    hv = info["h"][(v, dv)]
                    if u == root:
                        self.bqm.add_linear(hv, P * c)
                        for an in a:
                            self.bqm.add_quadratic(an, hv, P)
                        continue
                    hu = info["h"][(u, du)]
                    y = f"y|{root}|{u}|{du}|{v}|{dv}"
                    self.bqm.add_quadratic(hu, hv, P)
                    self.bqm.add_quadratic(hu, y, -2 * P)
                    self.bqm.add_quadratic(hv, y, -2 * P)
                    self.bqm.add_linear(y, 3 * P + P * c)
                    for an in a:
                        self.bqm.add_quadratic(an, y, P)

    # ---- 배치 → 그래프·정준 상태 ----
    def assignment_x(self, rest_perm, back_perm) -> dict:
        st = {}
        for i, r in enumerate(rest_perm):
            for rr in self.rest:
                st[self.xf(rr, i)] = int(rr == r)
        for j, v in enumerate(back_perm):
            for vv in self.t.back:
                st[self.xb(vv, j)] = int(vv == v)
        return st

    def _eval(self, c, lin, st):
        return c + sum(w * st[n] for n, w in lin.items())

    def graph(self, rest_perm, back_perm) -> nx.Graph:
        st = self.assignment_x(rest_perm, back_perm)
        for z, a, b in self.rosen:
            st[z] = st[a] * st[b]
        g = nx.Graph()
        for v in self.nodes:
            c, lin = self.exists(v)
            if self._eval(c, lin, st) > 0.5:
                g.add_node(v)
        for u, v in itertools.combinations(list(g.nodes), 2):
            c, lin = self.expr(u, v)
            for z, a, b in self.rosen:
                st.setdefault(z, st[a] * st[b])
            if self._eval(c, lin, st) > 0.5:
                g.add_edge(u, v)
        return g

    def canonical_state(self, rest_perm, back_perm) -> dict:
        st = {v: 0 for v in self.bqm.variables}
        st.update(self.assignment_x(rest_perm, back_perm))
        for z, a, b in self.rosen:
            st[z] = st[a] * st[b]
        for key, (c, a) in self.adj_cache.items():
            if a:
                u, v = sorted(key)
                cc, lin = self.expr(u, v)
                st[a[0]] = int(round(self._eval(cc, lin, st)))
        g = self.graph(rest_perm, back_perm)
        for root, info in self.roots.items():
            dist = nx.single_source_shortest_path_length(g, root)
            for v in info["others"]:
                if v not in g:
                    continue
                d = dist[v]
                parent = next(u for u in sorted(g.neighbors(v)) if dist[u] == d - 1)
                st[f"e|{root}|{v}|{parent}|{d}"] = 1
                st[info["h"][(v, d)]] = 1
            if info["lower_bound"]:
                for n in self.bqm.variables:
                    if n.startswith(f"y|{root}|"):
                        _, _, u, du, v, dv = n.split("|")
                        st[n] = int(dist.get(u) == int(du) and dist.get(v) == int(dv))
        return st

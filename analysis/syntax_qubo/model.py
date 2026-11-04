"""공간구문 지표의 정확 QUBO (dimod BQM).

판상형 템플릿: 앞 띠 m칸, 뒤 띠 k칸. x[r,s] = 1이면 실 r이 칸 s(원-핫, src/generate/qubo.js와 같은 칸 구조).
칸 인접: 같은 띠의 이웃 칸, 앞·뒤 띠에서 위아래로 겹치는 칸(폭을 0~1로 정규화했을 때 겹침 > 0).
부속실(부부욕실·드레스룸)은 안방 뒤에 붙으므로 안방에만 맞닿은 고정 노드로 둔다.

정확 인코딩(근사 없음):
  1. 실 쌍 인접 a_uv = Σ_{(s,t)∈인접칸} x_us·x_vt. 곱마다 보조 변수 z(Rosenberg 1975 대입), 그리고 A_uv = Σ z 등식 변수.
     모든 벌점을 '어떤 이진 상태에서도 0 이상'인 형태로 둔다(제약 위반 하나당 최소 P) → 목적 범위 < P이면 바닥 상태는 반드시 유효.
  2. 뿌리 ρ에서의 깊이(BFS 거리): 실 v마다 '부모 u, 깊이 d' 원-핫 e[v,u,d] (Lucas 2014 §8.1 트리 인코딩의 변형).
       - 부모는 맞닿아야 함:      P·e[v,u,d]·(1 − a_uv)            → e·z 이차
       - 부모의 깊이는 d − 1:     P·e[v,u,d]·(1 − h[u,d−1])        → e·e 이차 (h[u,d] = Σ_w e[u,w,d])
     이것만으로 라벨 d_v ≥ 실제 거리(상한 트리)다. 깊이를 줄이는 목적(O1·O2)에서는 최소 에너지에서 d_v = 거리.
  3. 최단 깊이 하한(깊이를 늘리는 목적 O3에 필수): 맞닿은 u, v는 |d_u − d_v| ≤ 1.
       h를 명시 변수로 두고(h = Σe 등식 벌점), y = h[u,d]·h[v,d'] (d' ≥ d+2)를 Rosenberg 대입 → P·a_uv·y = Σ P·z·y 이차.
     1–3을 모두 만족하는 라벨은 BFS 거리와 같다.
  4. 총깊이 TD_ρ = Σ_v Σ_d d·h[v,d] — 보조 변수에 선형. 통합도(1/RRA)는 실 수가 고정이면 TD_ρ의 단조 감소 함수.

벌점 계수: 목적함수가 한 상태에서 바뀔 수 있는 최대폭보다 크게(Lucas 2014 p.18의 0 < B·max < A를 층마다).
"""

from __future__ import annotations

import itertools
import json
import os
from dataclasses import dataclass, field
from pathlib import Path

import dimod
import networkx as nx

HERE = Path(__file__).resolve().parent


@dataclass
class Template:
    id: str
    front: list[str]
    back: list[str]
    m: int
    k: int
    suite: list[str]
    types: dict[str, str]
    spec: dict = field(default_factory=dict)
    # 정렬 모드(layout.js p.align): 부속실이 안방 칸 안에서 안방 → 드레스룸 → 부부욕실 순으로 쌓이고, 맨 아래 부속실이 안방 대신 뒤 띠와 맞닿는다.
    aligned: bool = True

    @property
    def low_suite(self):
        return self.suite[-1] if (self.aligned and self.suite) else None

    @property
    def rooms(self) -> list[str]:
        return self.front + self.back

    @property
    def nodes(self) -> list[str]:
        return self.front + self.back + self.suite

    def band(self, r: str) -> str:
        return "front" if r in self.front else "back"

    def slots(self, band: str) -> int:
        return self.m if band == "front" else self.k


SUFFIX = "-rq4" if os.environ.get("SPECS") == "rq4" else ""  # 사양 묶음(scripts/lib/rq4-specs.mjs와 같은 규약)


def load_templates(path: Path | None = None) -> list[Template]:
    path = path or HERE / f"templates{SUFFIX}.json"
    return [Template(**o) for o in json.loads(path.read_text())]


def slot_adjacency(m: int, k: int) -> list[tuple[tuple[str, int], tuple[str, int]]]:
    """칸 인접 쌍(qubo.js의 beside·vertical과 같은 기하)."""
    pairs = [(("front", i), ("front", i + 1)) for i in range(m - 1)]
    pairs += [(("back", j), ("back", j + 1)) for j in range(k - 1)]
    for i in range(m):
        for j in range(k):
            ov = min((i + 1) / m, (j + 1) / k) - max(i / m, j / k)
            if ov > 1e-12:
                pairs.append((("front", i), ("back", j)))
    return pairs


def room_graph(t: Template, front_perm: tuple[str, ...], back_perm: tuple[str, ...]) -> nx.Graph:
    """배치(앞·뒤 띠의 칸 순서)로 정해지는 실 인접 그래프. 부속실은 안방에만 붙는다."""
    at = {("front", s): r for s, r in enumerate(front_perm)} | {("back", s): r for s, r in enumerate(back_perm)}
    g = nx.Graph()
    g.add_nodes_from(t.nodes)
    low = t.low_suite
    for a, b in slot_adjacency(t.m, t.k):
        u, v = at[a], at[b]
        if low and a[0] != b[0] and u == "master":
            u = low  # 안방 칸 아래는 부속실이 뒤 띠와 맞닿는다
        g.add_edge(u, v)
        if low and a[0] == b[0] == "front" and "master" in (u, v):
            nb = v if u == "master" else u
            for s in t.suite:
                g.add_edge(s, nb)  # 부속실은 안방 칸 안이라 안방의 앞 띠 이웃과도 맞닿는다
    if t.aligned and t.suite:
        chain = ["master"] + t.suite
        for a, b in zip(chain, chain[1:]):
            g.add_edge(a, b)
    else:
        for s in t.suite:
            g.add_edge(s, "master")
    return g


def assignments(t: Template):
    for fp in itertools.permutations(t.front):
        for bp in itertools.permutations(t.back):
            yield fp, bp


def max_depth(t: Template, root: str) -> int:
    """모든 배치에서의 최대 BFS 깊이(정확, 완전 열거). 깊이 변수의 상한 K로 쓴다 — 잘라서 생기는 오차 없음."""
    best = 0
    for fp, bp in assignments(t):
        best = max(best, max(nx.single_source_shortest_path_length(room_graph(t, fp, bp), root).values()))
    return best


class SyntaxQubo:
    """뿌리 하나 이상의 정확 깊이 구조를 담은 BQM 빌더."""

    def __init__(self, t: Template):
        self.t = t
        self.bqm = dimod.BinaryQuadraticModel("BINARY")
        self.adj_slots = slot_adjacency(t.m, t.k)
        self.roots: dict[str, dict] = {}
        self.penalty_terms: list[str] = []
        # x 변수와 원-핫
        for r in t.rooms:
            for s in range(t.slots(t.band(r))):
                self.bqm.add_variable(self.x(r, s), 0.0)
        # z 변수: 실 쌍 (u, v)가 인접 칸 쌍 (a, b)에 놓이는 곱
        self.z_of: dict[frozenset, list] = {}
        for (ba, sa), (bb, sb) in self.adj_slots:
            for u in (self.t.front if ba == "front" else self.t.back):
                for v in (self.t.front if bb == "front" else self.t.back):
                    if u == v:
                        continue
                    self.z_of.setdefault(frozenset((u, v)), []).append((self.x(u, sa), self.x(v, sb)))
        self.big = 1.0  # 목적 최대폭에 맞춰 finalize에서 정함

    # ---- 변수 이름 ----
    @staticmethod
    def x(r, s):
        return f"x|{r}|{s}"

    @staticmethod
    def zname(a, b):
        return f"z|{min(a, b)}|{max(a, b)}"

    def e(self, root, v, u, d):
        return f"e|{root}|{v}|{u}|{d}"

    def h(self, root, v, d):
        return f"h|{root}|{v}|{d}"

    # ---- 인접 a_uv: z 선형 결합. 부속실–안방은 상수 1 ----
    def adjacency_terms(self, u, v) -> tuple[float, list[str]]:
        """a_uv = const + A. 반환 (const, [A 이름])."""
        t = self.t
        if t.aligned and t.suite:
            chain = ["master"] + t.suite
            if any({u, v} == {a, b} for a, b in zip(chain, chain[1:])):
                return 1.0, []
            su = u if u in t.suite else v if v in t.suite else None
            if su is not None:
                other = v if su == u else u
                if other in t.suite or other == "master":
                    return 0.0, []
                # 부속실–앞 띠 이웃: 안방–이웃 맞닿음과 같다. 맨 아래 부속실–뒤 띠: 안방–뒤 칸 맞닿음과 같다.
                if other in t.front or (other in t.back and su == t.low_suite):
                    return self.adjacency_terms("master", other) if other in t.front else self._raw_adj("master", other)
                return 0.0, []
            if "master" in (u, v) and (v in t.back or u in t.back):
                return 0.0, []  # 정렬 모드: 안방은 뒤 띠와 맞닿지 않는다(부속실이 사이에 있음)
        elif (u in t.suite and v == "master") or (v in t.suite and u == "master"):
            return 1.0, []
        elif u in t.suite or v in t.suite:
            return 0.0, []
        return self._raw_adj(u, v)

    def _raw_adj(self, u, v) -> tuple[float, list[str]]:
        pairs = self.z_of.get(frozenset((u, v)), [])
        if not pairs:
            return 0.0, []
        name = f"A|{min(u, v)}|{max(u, v)}"
        if name not in self.bqm.variables:
            self.bqm.add_variable(name, 0.0)
            self._equality(name, {self.zname(a, b): 1.0 for a, b in pairs})  # A = Σ z
        return 0.0, [name]

    def depth_structure(self, root: str, lower_bound: bool) -> dict:
        """뿌리 root에서의 깊이 one-hot 구조를 추가하고 h[v,d]의 선형식을 돌려준다."""
        t = self.t
        K = max_depth(t, root)
        others = [v for v in t.nodes if v != root]
        e_vars: dict[tuple, str] = {}
        for v in others:
            for d in range(1, K + 1):
                parents = [root] if d == 1 else [u for u in others if u != v]
                for u in parents:
                    const, zs = self.adjacency_terms(u, v)
                    if const == 0 and not zs:
                        continue  # 어떤 배치에서도 맞닿을 수 없는 부모
                    e_vars[(v, u, d)] = self.e(root, v, u, d)
        # h[v,d]: 명시 변수(하한 제약에 필요) 또는 e의 합
        h_lin: dict[tuple, dict[str, float]] = {}
        for v in others:
            for d in range(1, K + 1):
                es = {name: 1.0 for (vv, u, dd), name in e_vars.items() if vv == v and dd == d}
                # h를 명시 변수로 두고 등식 (h − Σe)²로 묶는다. 모든 벌점이 어떤 이진 상태에서도 0 이상이 되어,
                # 원-핫을 어긴 상태가 e·(1 − h) 같은 항으로 음의 에너지를 얻는 일을 막는다.
                hn = self.h(root, v, d)
                self.bqm.add_variable(hn, 0.0)
                h_lin[(v, d)] = {hn: 1.0}
                self._equality(hn, es)
        info = {"K": K, "others": others, "e": e_vars, "h": h_lin, "lower_bound": lower_bound}
        self.roots[root] = info
        return info

    # ---- 벌점 묶음은 finalize에서 계수(P)를 곱해 넣는다 ----
    def finalize(self, objective: dict, quad_objective: dict | None = None) -> dimod.BinaryQuadraticModel:
        """objective: {var: coeff} 선형 목적(최소화). 벌점 계수 P = 목적 계수 절댓값 합 + 1(어떤 위반도 이득이 되지 않음)."""
        quad_objective = quad_objective or {}
        P = sum(abs(c) for c in objective.values()) + sum(abs(c) for c in quad_objective.values()) + 1.0
        self.P = P
        bqm = self.bqm
        t = self.t
        # 1) x 원-핫: 실마다, 칸마다
        for r in t.rooms:
            self._onehot([self.x(r, s) for s in range(t.slots(t.band(r)))], P)
        for band, rooms in (("front", t.front), ("back", t.back)):
            for s in range(t.slots(band)):
                self._onehot([self.x(r, s) for r in rooms], P)
        # 2) z = x·x (Rosenberg): P(x1x2 − 2x1z − 2x2z + 3z)
        for pairs in self.z_of.values():
            for a, b in pairs:
                z = self.zname(a, b)
                bqm.add_quadratic(a, b, P)
                bqm.add_quadratic(a, z, -2 * P)
                bqm.add_quadratic(b, z, -2 * P)
                bqm.add_linear(z, 3 * P)
        # 3) 깊이 구조
        for root, info in self.roots.items():
            e_vars, h_lin, K = info["e"], info["h"], info["K"]
            for v in info["others"]:
                self._onehot([n for (vv, _, _), n in e_vars.items() if vv == v], P)
            for (v, u, d), en in e_vars.items():
                # 부모와 맞닿음: P·e·(1 − a_uv)
                const, zs = self.adjacency_terms(u, v)
                bqm.add_linear(en, P * (1 - const))
                for z in zs:
                    bqm.add_quadratic(en, z, -P)
                # 부모 깊이 d − 1: P·e·(1 − h[u,d−1])
                if d >= 2:
                    bqm.add_linear(en, P)
                    for hn, c in h_lin[(u, d - 1)].items():
                        bqm.add_quadratic(en, hn, -P * c)
            if info["lower_bound"]:
                self._lower_bound(root, info, P)
        for hn, es in getattr(self, "_eq_list", []):
            # (h − Σe)² = h + Σe + 2Σ_{i<j} e_i e_j − 2Σ h e_i  (이진, Σe ≤ 1은 e 원-핫이 보장)
            bqm.add_linear(hn, P)
            names = list(es)
            for n in names:
                bqm.add_linear(n, P)
                bqm.add_quadratic(hn, n, -2 * P)
            for i in range(len(names)):
                for j in range(i + 1, len(names)):
                    bqm.add_quadratic(names[i], names[j], 2 * P)
        # 4) 목적
        for v, c in objective.items():
            bqm.add_linear(v, c)
        for (a, b), c in quad_objective.items():
            bqm.add_quadratic(a, b, c)
        return bqm

    def _onehot(self, names: list[str], P: float):
        # P(Σx − 1)² = P(−Σx + 2Σ_{i<j} x_i x_j + 1)
        for n in names:
            self.bqm.add_linear(n, -P)
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                self.bqm.add_quadratic(names[i], names[j], 2 * P)
        self.bqm.offset += P

    def _equality(self, hn: str, es: dict[str, float]):
        self.__dict__.setdefault("_eq_list", []).append((hn, es))

    def _lower_bound(self, root: str, info: dict, P: float):
        """맞닿은 u, v의 깊이 차 ≤ 1: P·a_uv·h[u,d]·h[v,d'] (d' ≥ d + 2), h·h는 y로 대입."""
        K, others = info["K"], info["others"]
        nodes = [root] + others
        for u, v in itertools.permutations(nodes, 2):
            const, zs = self.adjacency_terms(u, v)
            if const == 0 and not zs:
                continue
            du_range = [0] if u == root else range(1, K + 1)
            for du in du_range:
                for dv in range(du + 2, K + 1):
                    if v == root:
                        continue
                    hv = self.h(root, v, dv)
                    if u == root:
                        # h[root,0] = 1 상수 → P·a_uv·h_v
                        self.bqm.add_linear(hv, P * const)
                        for z in zs:
                            self.bqm.add_quadratic(z, hv, P)
                        continue
                    hu = self.h(root, u, du)
                    y = f"y|{root}|{u}|{du}|{v}|{dv}"
                    self.bqm.add_quadratic(hu, hv, P)
                    self.bqm.add_quadratic(hu, y, -2 * P)
                    self.bqm.add_quadratic(hv, y, -2 * P)
                    self.bqm.add_linear(y, 3 * P)
                    self.bqm.add_linear(y, P * const)
                    for z in zs:
                        self.bqm.add_quadratic(z, y, P)

    # ---- 목적 도우미 ----
    def total_depth(self, root: str, weights: dict[str, float] | None = None) -> dict[str, float]:
        """Σ_v w_v Σ_d d·h[v,d] 의 선형 계수(기본 w = 1 → TD)."""
        info = self.roots[root]
        out: dict[str, float] = {}
        for (v, d), lin in info["h"].items():
            w = 1.0 if weights is None else weights.get(v, 0.0)
            if not w:
                continue
            for n, c in lin.items():
                out[n] = out.get(n, 0.0) + w * d * c
        return out

    # ---- 배치 → 정준 상태(검증용) ----
    def canonical_state(self, fp, bp) -> dict[str, int]:
        """배치에 대한 '의도된' 보조 변수 값(BFS 거리, BFS 부모). 이 상태의 벌점은 0이어야 한다."""
        t = self.t
        st = {v: 0 for v in self.bqm.variables}
        for s, r in enumerate(fp):
            st[self.x(r, s)] = 1
        for s, r in enumerate(bp):
            st[self.x(r, s)] = 1
        for pairs in self.z_of.values():
            for a, b in pairs:
                st[self.zname(a, b)] = st[a] * st[b]
        for name in self.bqm.variables:
            if name.startswith("A|"):
                _, u, v = name.split("|")
                st[name] = sum(st[self.zname(a, b)] for a, b in self.z_of[frozenset((u, v))])
        g = room_graph(t, fp, bp)
        for root, info in self.roots.items():
            dist = nx.single_source_shortest_path_length(g, root)
            for v in info["others"]:
                d = dist[v]
                parent = next(u for u in sorted(g.neighbors(v)) if dist[u] == d - 1)
                st[self.e(root, v, parent, d)] = 1
                st[self.h(root, v, d)] = 1
            if info["lower_bound"]:
                for name in self.bqm.variables:
                    if name.startswith(f"y|{root}|"):
                        _, _, u, du, v, dv = name.split("|")
                        st[name] = int(dist[u] == int(du) and dist[v] == int(dv))
        return st

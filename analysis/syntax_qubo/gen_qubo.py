"""생성 모형의 정확 QUBO(고정 기록 09-21 ③, 판정 규칙 1).

생성 모형 E = Σ β_j f_j, f = O1 거실 RRA · O2 현관 RRA · O3 공·사 깊이 차 · O7 주방 RRA · O2b 현관→거실 깊이
(analysis/boltzmann_rq4.py stats_profile과 같은 정의). 각 항을 AlignedQubo의 깊이 구조로 정확히 쓴다:
  - O1·O2·O7: rra_objective(뿌리) — 복도 존재에 따른 노드 수 변화까지 정확(rra-exact.md).
  - O3: 현관 뿌리 총깊이의 가중합(침실 −1/침실 수, 거실·주방 +1/2) = −(침실 평균 깊이 − 공용 평균 깊이).
  - O2b: 현관 뿌리에서 거실 깊이 = Σ_d d·h(거실, d).
뿌리는 거실·현관·주방 세 개, 모두 최단 깊이 하한(y)을 켠다 — β의 부호가 어떻든(깊이를 늘리는 쪽을 보상해도) h가 최단 깊이와 같아야 하기 때문.

검증(판정 규칙 1): 템플릿 160개 × 모든 배치에서
  (a) 항마다: 정준 상태에서 그 항의 목적식 값 = 그래프에서 잰 f_j
  (b) 합친 BQM(임의 부호 β): 정준 상태 에너지 = Σ β_j f_j(벌점 항이 모두 0)
최대 오차 < 1e-9면 통과.
사용: SPECS=rq4 uv run python -m syntax_qubo.gen_qubo → ../evidence/results/gen-qubo-exact.md/json
"""

from __future__ import annotations

import itertools
import json
import math
import os
import random
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import networkx as nx

from .aligned import AlignedQubo
from .model import Template, load_templates

RES = Path(__file__).resolve().parents[2] / "evidence" / "results"
TERMS = ["O1", "O2", "O3", "O7", "O2b"]
ROOTS = ("living", "entrance", "kitchen")
TOL = 1e-9


def _rra(g, n):
    k = g.number_of_nodes()
    md = sum(nx.single_source_shortest_path_length(g, n).values()) / (k - 1)
    D = 2 * (k * (math.log2((k + 2) / 3) - 1) + 1) / ((k - 1) * (k - 2))
    return (2 * (md - 1) / (k - 2)) / D


def graph_stats(q: AlignedQubo, g: nx.Graph) -> dict:
    """그래프에서 잰 f(boltzmann_rq4.stats_profile과 같은 정의, 쓰는 다섯 항만)."""
    ty = {v: q.t.types.get(v, "기타") for v in g}
    dep = nx.single_source_shortest_path_length(g, "entrance")
    beds = [v for v in g if ty[v] == "침실"]
    pub = [v for v in g if ty[v] in ("거실", "주방")]
    return {
        "O1": _rra(g, "living"),
        "O2": _rra(g, "entrance"),
        "O3": -(sum(dep[v] for v in beds) / len(beds) - sum(dep[v] for v in pub) / len(pub)),
        "O7": _rra(g, "kitchen"),
        "O2b": float(dep["living"]),
    }


def term_objectives(q: AlignedQubo) -> dict:
    """항마다 목적식 {변수: 계수, (변수, 변수): 계수, "": 상수}. 깊이 구조는 먼저 만들어 둬야 한다."""
    beds = [v for v in q.nodes if q.t.types.get(v) == "침실"]
    pub = [v for v in q.nodes if q.t.types.get(v) in ("거실", "주방")]
    w3 = {v: -1.0 / len(beds) for v in beds}
    for v in pub:
        w3[v] = w3.get(v, 0.0) + 1.0 / len(pub)
    return {
        "O1": q.rra_objective("living"),
        "O2": q.rra_objective("entrance"),
        "O3": q.total_depth("entrance", w3),
        "O7": q.rra_objective("kitchen"),
        "O2b": q.total_depth("entrance", {"living": 1.0}),
    }


def combine(objs: dict, beta: dict) -> dict:
    out: dict = {}
    for j, o in objs.items():
        b = beta.get(j, 0.0)
        if not b:
            continue
        for key, c in o.items():
            out[key] = out.get(key, 0.0) + b * c
    return out


def depth_bound(t: Template) -> int:
    """세 뿌리에서 모든 배치의 최대 깊이(깊이 변수 범위 K)."""
    q = AlignedQubo(t)
    K = 1
    for rp, bp in itertools.product(itertools.permutations(q.rest), itertools.permutations(t.back)):
        g = q.graph(rp, bp)
        if not nx.is_connected(g):
            continue
        for r in ROOTS:
            K = max(K, max(nx.single_source_shortest_path_length(g, r).values()))
    return K


def build(t: Template, beta: dict, K: int | None = None):
    """생성 모형 BQM. 반환 (q, bqm, objs)."""
    K = K or depth_bound(t)
    q = AlignedQubo(t)
    for r in ROOTS:
        q.depth_structure(r, K, True)
    objs = term_objectives(q)
    bqm = q.finalize(combine(objs, beta))
    return q, bqm, objs


def eval_obj(o: dict, st: dict) -> float:
    s = 0.0
    for key, c in o.items():
        if key == "":
            s += c
        elif isinstance(key, tuple):
            s += c * st[key[0]] * st[key[1]]
        else:
            s += c * st[key]
    return s


def check_template(ti: int):
    t = load_templates()[ti]
    rnd = random.Random(ti)
    beta = {j: rnd.choice([-1, 1]) * rnd.uniform(0.5, 3.0) for j in TERMS}  # 부호 섞인 임의 β
    K = depth_bound(t)
    q, bqm, objs = build(t, beta, K)
    worst_term = {j: 0.0 for j in TERMS}
    worst_all = 0.0
    n = 0
    for rp, bp in itertools.product(itertools.permutations(q.rest), itertools.permutations(t.back)):
        g = q.graph(rp, bp)
        if not nx.is_connected(g):
            continue
        n += 1
        st = q.canonical_state(rp, bp)
        f = graph_stats(q, g)
        for j in TERMS:
            worst_term[j] = max(worst_term[j], abs(eval_obj(objs[j], st) - f[j]))
        worst_all = max(worst_all, abs(bqm.energy(st) - sum(beta[j] * f[j] for j in TERMS)))
    return {"id": t.id, "arr": n, "K": K, "vars": int(bqm.num_variables), "quad": int(bqm.num_interactions), "P": float(q.P), "term": {j: float(v) for j, v in worst_term.items()}, "all": float(worst_all)}


def main():
    ts = load_templates()
    with ProcessPoolExecutor(os.cpu_count() or 8) as ex:
        rows = list(ex.map(check_template, range(len(ts))))
    term = {j: max(r["term"][j] for r in rows) for j in TERMS}
    allw = max(r["all"] for r in rows)
    ok = {j: bool(term[j] < TOL) for j in TERMS}
    ok_all = bool(allw < TOL)
    vs = sorted(r["vars"] for r in rows)
    qs = sorted(r["quad"] for r in rows)
    L = ["# 생성 모형 정확 QUBO 검증(판정 규칙 1, 고정 기록 09-21)\n"]
    L.append(f"> `SPECS=rq4 uv run python -m syntax_qubo.gen_qubo` · 템플릿 {len(rows)}개 · 배치 {sum(r['arr'] for r in rows):,}개 · 뿌리 거실·현관·주방(최단 깊이 하한 포함) · 허용 오차 {TOL:g}\n")
    L.append("| 항 | 최대 오차(정준 상태 목적식 − 그래프 값) | 판정 |")
    L.append("|---|---|---|")
    for j in TERMS:
        L.append(f"| {j} | {term[j]:.1e} | {'통과' if ok[j] else '**실패**'} |")
    L.append(f"| 다섯 항 합친 BQM(템플릿마다 부호 섞인 임의 β) | {allw:.1e} | {'통과' if ok_all else '**실패**'} |")
    L.append(f"\n- 크기(합친 BQM): 변수 중앙값 {vs[len(vs) // 2]:,} (최소 {vs[0]:,}, 최대 {vs[-1]:,}), 이차항 중앙값 {qs[len(qs) // 2]:,} (최대 {qs[-1]:,}).")
    L.append("- 정준 상태: 배치 x에서 보조 변수(맞닿음 A, 곱 z, 깊이 e·h, 하한 y)를 그래프대로 채운 상태. 벌점은 모두 0 이상이고 이 상태에서 0이므로, 오차 0이면 정준 상태 에너지 = 모형 에너지다.")
    (RES / "gen-qubo-exact.md").write_text("\n".join(L) + "\n")
    (RES / "gen-qubo-exact.json").write_text(json.dumps({"tol": TOL, "term": term, "all": allw, "ok": ok, "ok_all": ok_all, "rows": rows}, ensure_ascii=False, indent=1))
    print("\n".join(L))


if __name__ == "__main__":
    main()

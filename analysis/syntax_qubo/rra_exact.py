"""RQ2: RRA 기반 목적의 정확 QUBO 검증, 그리고 비율 목적(O6)의 Dinkelbach 정확 풀이.

왜: 정렬 틀에서 복도 존재가 배치에 따라 바뀌어 노드 수 k가 템플릿 안에서도 달라진다(160개 중 73개).
  그러면 총깊이(TD) 최소 = RRA 최소가 아니다(최적 배치가 다른 템플릿: 거실 10개, 현관 21개).
  RQ4 볼츠만 판정은 RRA로 했으므로 QUBO도 RRA를 정확히 표현해야 둘이 같은 분포가 된다 → AlignedQubo.rra_objective.
검증 1: 모든 템플릿·배치에서 정준 상태 에너지 = 그래프에서 잰 RRA(뿌리: 거실·현관·주방).
검증 2: O6 = (현관·욕실 평균 RRA) ÷ (거실·주방·침실 평균 RRA)의 최대화. 비율은 QUBO가 아니지만 Dinkelbach(1967) 반복
  max N − λD(각 단계는 위 정확 RRA 식의 선형 결합 = 정확 QUBO)를 λ가 멈출 때까지 하면 비율 최적과 같다. 각 단계 최적화는 여기서 열거로 대신하고,
  수렴한 배치가 비율 최적과 같은지 모든 템플릿에서 확인한다.
사용: SPECS=rq4 uv run python -m syntax_qubo.rra_exact → ../evidence/results/rra-exact.md
"""

from __future__ import annotations

import itertools
from pathlib import Path

import networkx as nx

from .aligned import AlignedQubo
from .model import load_templates

RES = Path(__file__).resolve().parents[2] / "evidence" / "results"


def rra(g, n):
    import math

    k = g.number_of_nodes()
    md = sum(nx.single_source_shortest_path_length(g, n).values()) / (k - 1)
    D = 2 * (k * (math.log2((k + 2) / 3) - 1) + 1) / ((k - 1) * (k - 2))
    return (2 * (md - 1) / (k - 2)) / D


def main():
    ts = load_templates()
    worst, n_checked, n_tpl = 0.0, 0, 0
    sizes = []
    dink_ok = dink_n = 0
    iters = []
    vary_k = 0
    argmin_diff = {"living": 0, "entrance": 0}
    for t in ts:
        q0 = AlignedQubo(t)
        perms = [(rp, bp) for rp in itertools.permutations(q0.rest) for bp in itertools.permutations(t.back)]
        perms = [p for p in perms if nx.is_connected(q0.graph(*p))]
        K = max(max(nx.single_source_shortest_path_length(q0.graph(*p), r).values()) for p in perms for r in ("living", "entrance", "kitchen"))
        for root in ("living", "entrance", "kitchen"):
            q = AlignedQubo(t)
            q.depth_structure(root, K, False)
            bqm = q.finalize(q.rra_objective(root))
            sizes.append((t.id, root, bqm.num_variables, bqm.num_interactions))
            for p in perms:
                e = bqm.energy(q.canonical_state(*p))
                worst = max(worst, abs(e - rra(q.graph(*p), root)))
                n_checked += 1
        n_tpl += 1
        gs = [q0.graph(*p) for p in perms]
        vary_k += len({g.number_of_nodes() for g in gs}) > 1
        for r in argmin_diff:
            td = [sum(nx.single_source_shortest_path_length(g, r).values()) for g in gs]
            ra = [rra(g, r) for g in gs]
            a = {i for i, v in enumerate(td) if v == min(td)}
            b = {i for i, v in enumerate(ra) if abs(v - min(ra)) < 1e-12}
            argmin_diff[r] += a != b
        # Dinkelbach(O6): N = 평균 RRA(현관·욕실), D = 평균 RRA(거실·주방·침실). 각 단계 max N − λD를 열거로.
        ty = t.types
        vals = []
        for p in perms:
            g = q0.graph(*p)
            svc = [v for v in g if v == "entrance" or ty.get(v) == "화장실"]
            high = [v for v in g if v in ("living", "kitchen") or ty.get(v) == "침실"]
            N = sum(rra(g, v) for v in svc) / len(svc)
            Dn = sum(rra(g, v) for v in high) / len(high)
            vals.append((N, Dn))
        best_ratio = max(N / D for N, D in vals)
        lam, it = 0.0, 0
        while True:
            it += 1
            i = max(range(len(vals)), key=lambda j: vals[j][0] - lam * vals[j][1])
            F = vals[i][0] - lam * vals[i][1]
            if abs(F) < 1e-12 or it > 50:
                break
            lam = vals[i][0] / vals[i][1]
        iters.append(it)
        dink_n += 1
        dink_ok += abs(lam - best_ratio) < 1e-9
    L = ["# RQ2: RRA 목적의 정확 QUBO와 O6(비율)의 Dinkelbach 풀이\n"]
    L.append("> `SPECS=rq4 uv run python -m syntax_qubo.rra_exact` · 템플릿 160개 · 뿌리 거실·현관·주방\n")
    L.append(f"- 왜 필요한가: 복도 존재가 배치에 따라 바뀌어 노드 수 k가 템플릿 안에서 달라진다({vary_k}/{n_tpl}). 그래서 총깊이 최소와 RRA 최소의 최적 배치가 다른 템플릿이 있다(거실 {argmin_diff['living']}개, 현관 {argmin_diff['entrance']}개). RQ4 판정(RRA)과 QUBO 목적을 맞추려고 RRA를 정확한 이차식으로 넣었다.")
    L.append(f"- 검증 1(정준 상태 에너지 = 그래프 RRA): 템플릿 {n_tpl} × 뿌리 3 × 모든 배치 = {n_checked:,}건, 최대 오차 **{worst:.1e}**.")
    import numpy as np

    v = np.array([s[2] for s in sizes])
    qd = np.array([s[3] for s in sizes])
    L.append(f"- 크기: 변수 중앙값 {int(np.median(v))} (최대 {v.max()}), 이차항 중앙값 {int(np.median(qd))} (최대 {qd.max()}). 총깊이 목적과 같은 변수 — RRA는 x·h 곱 항만 더함.")
    L.append(f"- 검증 2(O6 Dinkelbach): {dink_ok}/{dink_n} 템플릿에서 수렴값 = 비율 최적, 반복 횟수 중앙값 {int(np.median(iters))} (최대 {max(iters)}). 각 반복은 정확 RRA 식의 선형 결합이라 하나의 정확 QUBO다.")
    L.append("- 정확 QUBO로 쓰지 못한 것: O9(거실 선택도 = 최단 경로 수 비율)는 경로 다중도를 세는 변수가 필요해 이 인코딩의 이차식으로 쓸 수 없다. O7h(가장 통합된 복도)는 복도가 있을 때만 뿌리가 되고 노드 수도 함께 바뀌어 3차 항이 생긴다 — 보조 변수로 2차화할 수는 있으나 구현하지 않았다. 두 목적은 RQ4에서 열거로만 판정했다.")
    RES.joinpath("rra-exact.md").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()

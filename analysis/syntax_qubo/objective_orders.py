"""RQ4 예비: 공간구문 목적마다 최적 배치를 완전 열거로 구한다(정렬 모드 + 복도, 안방 왼쪽 끝).

목적값은 정확 QUBO와 같은 그래프(AlignedQubo.graph = 실제 도면 맞닿음 그래프, 10,224/10,224 일치)에서 잰다.
동점(최적 배치가 여럿)은 모두 후보로 두고 템플릿마다 최대 20개를 고정 난수로 고른다.
SA로 그 최적에 도달하는지는 RQ3에서 따로 본다. 여기서는 '목적이 어떤 평면을 만드는가'만 본다.

목적(문헌 근거는 Confluence 09-12·09-12c):
  O0 기준선: 공간구문 목적 없음(균등 무작위 배치)
  O1 거실 중심: 거실 총깊이 최소(= 거실 통합도 최대)
  O2 얕은 깊이: 현관 총깊이 최소
  O3 공·사 위계: 현관 기준 침실 평균 깊이 − 거실·주방 평균 깊이 최대
  O6 습식·서비스 주변화: (현관·욕실 평균 RRA) ÷ (거실·주방·침실 평균 RRA) 최대
  O7 대조(주방 중심): 주방 총깊이 최소
  O9 공용실 경유: 거실 선택도(betweenness) 최대
사용: uv run python -m syntax_qubo.objective_orders → ../evidence/results/objective-orders.json
"""

from __future__ import annotations

import itertools
import json
import math
import random
from pathlib import Path

import networkx as nx

from .aligned import AlignedQubo
from .model import load_templates

RES = Path(__file__).resolve().parents[2] / "evidence" / "results"


def rra(g, n):
    k = g.number_of_nodes()
    md = sum(nx.single_source_shortest_path_length(g, n).values()) / (k - 1)
    D = 2 * (k * (math.log2((k + 2) / 3) - 1) + 1) / ((k - 1) * (k - 2))
    return (2 * (md - 1) / (k - 2)) / D


def objectives(g, types):
    td = lambda r: sum(nx.single_source_shortest_path_length(g, r).values())  # noqa: E731
    dep = nx.single_source_shortest_path_length(g, "entrance")
    beds = [v for v in g if types.get(v) == "침실"]
    pub = [v for v in ("living", "kitchen") if v in g]
    svc = [v for v in g if v == "entrance" or types.get(v) == "화장실"]
    high = [v for v in g if v in ("living", "kitchen") or types.get(v) == "침실"]
    mean = lambda vs, f: sum(f(v) for v in vs) / len(vs)  # noqa: E731
    return {
        # 모두 '작을수록 좋음'으로 맞춘다
        "O1": td("living"),
        "O2": td("entrance"),
        "O3": -(mean(beds, lambda v: dep[v]) - mean(pub, lambda v: dep[v])),
        "O6": -(mean(svc, lambda v: rra(g, v)) / mean(high, lambda v: rra(g, v))),
        "O7": td("kitchen"),
        "O9": -nx.betweenness_centrality(g)["living"],
    }


def main():
    rnd = random.Random(20261104)
    out = []
    for ti, t in enumerate(load_templates()):
        q = AlignedQubo(t)
        rows = []
        for rp in itertools.permutations(q.rest):
            for bp in itertools.permutations(t.back):
                g = q.graph(rp, bp)
                if not nx.is_connected(g):
                    continue
                rows.append((rp, bp, objectives(g, t.types)))
        pick = lambda cand: rnd.sample(cand, min(20, len(cand)))  # noqa: E731
        rec = {"t": ti, "id": t.id, "n": len(rows), "orders": {"O0": [(["master", *rp], list(bp)) for rp, bp, _ in pick(rows)]}}
        for key in rows[0][2]:
            best = min(r[2][key] for r in rows)
            ties = [r for r in rows if abs(r[2][key] - best) < 1e-9]
            rec["orders"][key] = [(["master", *rp], list(bp)) for rp, bp, _ in pick(ties)]
            rec.setdefault("ties", {})[key] = len(ties)
        out.append(rec)
        print(t.id, rec["n"], rec["ties"])
    RES.joinpath("objective-orders.json").write_text(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()

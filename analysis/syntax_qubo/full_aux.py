"""RQ2 '전체 보조 변수형' 정확 QUBO: 모든 고정 노드를 뿌리로 하는 깊이 구조를 한 BQM에 넣는다(권장형은 뿌리 1~2개).

목적: 전체 깊이 합 TD_all = Σ_뿌리 Σ_v d(뿌리, v) — 모든 고정 노드의 평균 통합도(실 수가 고정이면 평균 RRA와 단조)와 같은 정보.
  뿌리는 항상 존재하는 노드(복도 hallA·hallB 제외 — 있을 수도 없을 수도 있어 뿌리로 쓰려면 추가 정식화가 필요). 복도까지의 거리는 각 뿌리의 깊이 구조에 포함.
검증: 모든 배치에서 정준 상태 에너지 = 그래프에서 잰 TD_all(오차 0), 크기(변수·이차항)를 권장형과 비교. 정합 검증용이며 SA 성능은 rq3_scaling에서 권장형으로 본다.
사용: SPECS=rq4 uv run python -m syntax_qubo.full_aux → ../evidence/results/full-aux.md
"""

from __future__ import annotations

import itertools
import time
from pathlib import Path

import networkx as nx

from .aligned import AlignedQubo
from .model import load_templates

RES = Path(__file__).resolve().parents[2] / "evidence" / "results"


def run(t):
    q0 = AlignedQubo(t)
    perms = [(rp, bp) for rp in itertools.permutations(q0.rest) for bp in itertools.permutations(t.back)]
    perms = [p for p in perms if nx.is_connected(q0.graph(*p))]
    roots = [v for v in q0.nodes if not v.startswith("hall")]
    K = max(max(nx.single_source_shortest_path_length(q0.graph(*p), r).values()) for p in perms for r in roots)
    t0 = time.time()
    q = AlignedQubo(t)
    obj = {}
    for r in roots:
        q.depth_structure(r, K, False)
        for k, v in q.total_depth(r).items():
            obj[k] = obj.get(k, 0.0) + v
    bqm = q.finalize(obj)
    t_build = time.time() - t0
    worst = 0.0
    for p in perms:
        g = q.graph(*p)
        tv = sum(sum(nx.single_source_shortest_path_length(g, r).values()) for r in roots)
        worst = max(worst, abs(bqm.energy(q.canonical_state(*p)) - tv))
    # 권장형(뿌리 하나: 거실) 크기
    q1 = AlignedQubo(t)
    q1.depth_structure("living", K, False)
    b1 = q1.finalize(q1.total_depth("living"))
    return {"id": t.id, "rest": len(q0.rest), "back": len(t.back), "arr": len(perms), "roots": len(roots), "K": K, "vars": bqm.num_variables, "quad": bqm.num_interactions, "vars1": b1.num_variables, "quad1": b1.num_interactions, "err": worst, "t_build": t_build}


def main():
    ts = load_templates()
    pick = {}
    for t in ts:
        key = (len(t.front) - 1, len(t.back))
        pick.setdefault(key, t)
    rows = [run(t) for _, t in sorted(pick.items())]
    L = ["# RQ2 전체 보조 변수형 정확 QUBO: 크기와 정합 검증\n"]
    L.append("> `SPECS=rq4 uv run python -m syntax_qubo.full_aux` · 크기 유형별 대표 템플릿 1개 · 목적 TD_all(모든 고정 노드를 뿌리로 한 깊이 합) · 정준 상태 에너지 = 그래프 값인지 모든 배치에서 확인\n")
    L.append("| 템플릿 | 앞 rest / 뒤 | 배치 | 뿌리 수 | K | 전체형 변수 / 이차항 | 권장형(뿌리 1) 변수 / 이차항 | 정준 오차(최대) |")
    L.append("|---|---|---|---|---|---|---|---|")
    for r in rows:
        L.append(f"| {r['id']} | {r['rest']} / {r['back']} | {r['arr']} | {r['roots']} | {r['K']} | {r['vars']:,} / {r['quad']:,} | {r['vars1']:,} / {r['quad1']:,} | {r['err']:.1e} |")
    L.append("\n- 전체형은 뿌리마다 깊이 변수 묶음(e·h)이 따로 생겨 크기가 뿌리 수에 거의 비례해 커진다. 맞닿음 변수(z·A)는 뿌리들이 공유한다.")
    L.append("- 최단 깊이 하한(y)은 넣지 않았다: TD_all은 깊이를 줄이는 목적이라 최소 에너지에서 라벨 = 실제 거리(model.py 주석 2).")
    RES.joinpath("full-aux.md").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()

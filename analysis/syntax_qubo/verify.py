"""정확 공간구문 QUBO 검증.

1) 정확성: 모든 배치에서 '의도된' 보조 변수 상태의 에너지 = 그 배치의 실제 목적값(BFS로 계산), 벌점 0.
2) 바닥 상태: 완전 열거로 구한 최적 목적값 E*.
3) SA: dwave-samplers SimulatedAnnealingSampler를 CPU 코어 전부에 나눠 돌려 E*에 도달하는 비율.
사용: uv run python -m syntax_qubo.verify [--templates 0,1] [--reads 1600] [--sweeps 20000]
"""

from __future__ import annotations

import argparse
import os
import time
from concurrent.futures import ProcessPoolExecutor

import networkx as nx
import numpy as np

from .model import SyntaxQubo, assignments, load_templates, room_graph

OBJECTIVES = {
    # 이름: (뿌리, 하한 필요, 실별 가중치 함수(t) → {노드: w}, 설명)
    "O2_entrance_TD": ("entrance", False, lambda t: None, "현관에서 총깊이 최소(얕은 깊이)"),
    "O1_living_TD": ("living", False, lambda t: None, "거실에서 총깊이 최소(거실 통합도 최대)"),
    "O3_privacy_gap": (
        "entrance",
        True,
        lambda t: {v: (-1.0 / sum(1 for x in t.nodes if t.types.get(x) == "침실") if t.types.get(v) == "침실" else (1.0 / 2 if v in ("living", "kitchen") else 0.0)) for v in t.nodes},
        "침실 평균 깊이 − 거실·주방 평균 깊이 최대(공·사 위계)",
    ),
}


def build(t, name):
    root, lb, wfn, _ = OBJECTIVES[name]
    q = SyntaxQubo(t)
    q.depth_structure(root, lower_bound=lb)
    obj = q.total_depth(root, wfn(t))
    bqm = q.finalize(obj)
    return q, bqm


def true_value(t, name, fp, bp):
    root, _, wfn, _ = OBJECTIVES[name]
    w = wfn(t)
    dist = nx.single_source_shortest_path_length(room_graph(t, fp, bp), root)
    return sum((1.0 if w is None else w.get(v, 0.0)) * d for v, d in dist.items() if v != root)


def _sa_chunk(args):
    bqm_ser, reads, sweeps, seed = args
    import dimod
    from dwave.samplers import SimulatedAnnealingSampler

    bqm = dimod.BinaryQuadraticModel.from_serializable(bqm_ser)
    ss = SimulatedAnnealingSampler().sample(bqm, num_reads=reads, num_sweeps=sweeps, seed=seed)
    return ss.record.energy.tolist()


def run_sa(bqm, reads, sweeps, workers):
    per = max(1, reads // workers)
    ser = bqm.to_serializable()
    with ProcessPoolExecutor(max_workers=workers) as ex:
        out = list(ex.map(_sa_chunk, [(ser, per, sweeps, 1000 + i) for i in range(workers)]))
    return np.array([e for chunk in out for e in chunk])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--templates", default="0")
    ap.add_argument("--objectives", default=",".join(OBJECTIVES))
    ap.add_argument("--reads", type=int, default=1600)
    ap.add_argument("--sweeps", type=int, default=20000)
    ap.add_argument("--workers", type=int, default=os.cpu_count())
    a = ap.parse_args()
    ts = load_templates()
    for ti in map(int, a.templates.split(",")):
        t = ts[ti]
        for name in a.objectives.split(","):
            t0 = time.time()
            q, bqm = build(t, name)
            worst = 0.0
            vals = []
            for fp, bp in assignments(t):
                tv = true_value(t, name, fp, bp)
                en = bqm.energy(q.canonical_state(fp, bp))
                worst = max(worst, abs(en - tv))
                vals.append(tv)
            estar = min(vals)
            nq = sum(1 for (u, v) in bqm.quadratic)
            t1 = time.time()
            en = run_sa(bqm, a.reads, a.sweeps, a.workers)
            hit = float(np.mean(np.isclose(en, estar)))
            print(
                f"[{t.id} {t.m}+{t.k}] {name}: 변수 {bqm.num_variables} · 이차항 {nq} · 배치 {len(vals)} · "
                f"정준 상태 오차 최대 {worst:.2e} · E* {estar:.3f} · SA 최저 {en.min():.3f} · E* 도달 {hit:.1%} "
                f"(검증 {t1 - t0:.1f}s, SA {time.time() - t1:.1f}s, reads {len(en)}, sweeps {a.sweeps})"
            )


if __name__ == "__main__":
    main()

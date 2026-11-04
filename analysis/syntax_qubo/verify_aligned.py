"""정렬 모드 정확 QUBO 검증.
1) 모형 그래프 = 실제 평면 기하 그래프(scripts/export-aligned-graphs.mjs, 모든 배치)인가
2) 정준 상태 에너지 = BFS로 잰 실제 목적값(오차 0)
3) SA(dwave-samplers, CPU 전부)가 완전 열거 최적 E*에 도달하는가, E*보다 낮은 값이 나오는가
사용: uv run python -m syntax_qubo.verify_aligned [--templates 0,16] [--reads 1600] [--sweeps 20000]
"""

from __future__ import annotations

import argparse
import itertools
import json
import os
import time
from collections import defaultdict
from pathlib import Path

import networkx as nx
import numpy as np

from .aligned import AlignedQubo
from .model import SUFFIX, load_templates
from .verify import run_sa

DER = Path(__file__).resolve().parents[2].parent / "aihub-full" / "derived"

OBJ = {
    "O2_entrance_TD": ("entrance", False, None),
    "O1_living_TD": ("living", False, None),
    "O3_privacy_gap": ("entrance", True, "privacy"),
}


def weights(q: AlignedQubo, kind):
    if kind != "privacy":
        return None
    beds = [v for v in q.nodes if q.t.types.get(v) == "침실"]
    w = {v: -1.0 / len(beds) for v in beds}
    w["living"] = 0.5
    w["kitchen"] = 0.5
    return w


def true_value(g, root, w):
    dist = nx.single_source_shortest_path_length(g, root)
    return sum((1.0 if w is None else w.get(v, 0.0)) * d for v, d in dist.items() if v != root)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--templates", default="16,0")
    ap.add_argument("--reads", type=int, default=1600)
    ap.add_argument("--sweeps", type=int, default=20000)
    ap.add_argument("--workers", type=int, default=os.cpu_count())
    ap.add_argument("--graph-only", action="store_true", help="그래프 대조만(SA 생략)")
    a = ap.parse_args()
    ts = load_templates()
    want = set(range(len(ts))) if a.templates == "all" else set(map(int, a.templates.split(",")))
    geo = defaultdict(dict)
    for line in (DER / f"aligned-graphs{SUFFIX}.jsonl").read_text().splitlines():
        o = json.loads(line)
        if o["t"] in want:
            g = nx.Graph()
            g.add_nodes_from(o["nodes"])
            g.add_edges_from(map(tuple, o["edges"]))
            geo[o["t"]][(tuple(o["front"][1:]), tuple(o["back"]))] = g
    tot = [0, 0]
    for ti in sorted(want):
        t = ts[ti]
        q0 = AlignedQubo(t)
        mism = 0
        perms = list(itertools.product(itertools.permutations(q0.rest), itertools.permutations(t.back)))
        for rp, bp in perms:
            gm, gg = q0.graph(rp, bp), geo[ti][(rp, bp)]
            em = {frozenset(e) for e in gm.edges}
            eg = {frozenset(e) for e in gg.edges}
            if em != eg or set(gm.nodes) != set(gg.nodes):
                mism += 1
                if mism <= 2:
                    print("  불일치", rp, bp, "모형만", [tuple(e) for e in em - eg], "기하만", [tuple(e) for e in eg - em])
        print(f"[{t.id}] 모형 그래프 = 실제 평면 그래프: {len(perms) - mism}/{len(perms)}")
        tot[0] += len(perms) - mism
        tot[1] += len(perms)
        if a.graph_only:
            continue
        K = max(max(nx.single_source_shortest_path_length(q0.graph(rp, bp), r).values()) for rp, bp in perms for r in ("entrance", "living"))
        for name, (root, lb, wk) in OBJ.items():
            t0 = time.time()
            q = AlignedQubo(t)
            q.depth_structure(root, K, lb)
            w = weights(q, wk)
            bqm = q.finalize(q.total_depth(root, w))
            worst, vals = 0.0, []
            for rp, bp in perms:
                tv = true_value(q.graph(rp, bp), root, w)
                worst = max(worst, abs(bqm.energy(q.canonical_state(rp, bp)) - tv))
                vals.append(tv)
            estar = min(vals)
            t1 = time.time()
            en = run_sa(bqm, a.reads, a.sweeps, a.workers)
            print(f"  {name}: 변수 {bqm.num_variables} · 이차항 {bqm.num_interactions} · 배치 {len(vals)} · 정준 오차 {worst:.1e} · E* {estar:.3f} · SA 최저 {en.min():.3f} · 도달 {np.mean(np.isclose(en, estar)):.1%} · E*보다 낮음 {np.sum(en < estar - 1e-9)} (검증 {t1 - t0:.1f}s, SA {time.time() - t1:.1f}s)")
    print(f"합계 {tot[0]}/{tot[1]}")


if __name__ == "__main__":
    main()

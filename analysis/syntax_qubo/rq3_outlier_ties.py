"""RQ3 이상치 조사: 인스턴스별 O1(거실 RRA) 유효 배치 수와 최적(동점 포함) 배치 수.
적중률(QUBO SA, O1)이 인스턴스마다 크게 다른 이유가 동점 최적해 수인지 본다. 생성 동작은 바꾸지 않는다(읽기 전용 열거).
사용: uv run python -m syntax_qubo.rq3_outlier_ties → ../evidence/results/rq3-outlier-ties.md/json
"""
from __future__ import annotations

import itertools
import json
import math
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor

import networkx as nx

from .aligned import AlignedQubo
from .rq3_scaling import RES, WORKERS, instances
from .rra_exact import rra


def _chunk(args):
    t, rest_perms = args
    q = AlignedQubo(t)
    cnt = Counter()
    total = valid = 0
    for rp in rest_perms:
        for bp in itertools.permutations(t.back):
            total += 1
            g = q.graph(rp, bp)
            if not nx.is_connected(g):
                continue
            valid += 1
            cnt[round(rra(g, "living"), 9)] += 1
    return total, valid, cnt


def main():
    rows = []
    for label, t in instances():
        t0 = time.time()
        q = AlignedQubo(t)
        perms = list(itertools.permutations(q.rest))
        chunks = [c for c in (perms[i::WORKERS] for i in range(WORKERS)) if c]
        with ProcessPoolExecutor(WORKERS) as ex:
            res = list(ex.map(_chunk, [(t, c) for c in chunks]))
        total = sum(r[0] for r in res)
        valid = sum(r[1] for r in res)
        cnt = Counter()
        for r in res:
            cnt.update(r[2])
        vals = sorted(cnt)
        e = vals[0]
        n_opt = cnt[e]
        gap = vals[1] - e if len(vals) > 1 else None
        row = {"instance": label, "arrangements": total, "valid": valid, "distinct_values": len(vals), "estar": e, "n_opt": n_opt,
               "opt_frac_of_all": n_opt / total, "opt_frac_of_valid": n_opt / valid, "gap_to_next_level": gap,
               "n_within_1pct_of_opt": sum(c for v, c in cnt.items() if v <= e * 1.01 + 1e-9), "t": time.time() - t0}
        rows.append(row)
        print(row, flush=True)
    RES.joinpath("rq3-outlier-ties.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    L = ["# RQ3 이상치 조사: O1 동점 최적 배치 수\n",
         "> `uv run python -m syntax_qubo.rq3_outlier_ties` · 읽기 전용 열거(RRA 값은 소수 9자리 반올림으로 동점 판정) · QUBO SA p는 rq3-scaling.md 1절(1k/10k/50k 스위프)\n",
         "| 인스턴스 | 전체 배치 | 유효(연결) 배치 | 서로 다른 목적값 수 | E* | 최적 배치 수 | 최적 비율(전체) | 다음 값과의 차 |", "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        L.append(f"| {r['instance']} | {r['arrangements']:,} | {r['valid']:,} | {r['distinct_values']} | {r['estar']:.6g} | {r['n_opt']:,} | {r['opt_frac_of_all']:.4%} | {r['gap_to_next_level']} |")
    RES.joinpath("rq3-outlier-ties.md").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    main()

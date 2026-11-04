"""A1′ 그래프 수준 사전 점검(Confluence 09-15 8절): 거실을 앞 띠보다 깊게 하면 거실 양옆 열의 뒤 띠 실이 거실 옆벽과 맞닿는다.
코드(도면화·정확 QUBO)를 바꾸기 전에, 현 정렬 틀의 모형 그래프(AlignedQubo.graph)에 그 맞닿음만 더해 거실 RRA 범위가 실제(dev 평균)를 포함하는지 본다.
  - 새 맞닿음: 뒤 띠 칸 j가 거실 칸의 왼·오른 경계(안방 쪽 경계 제외 — 그 아래는 부속실 열)를 포함하거나 그 경계에 닿으면 거실–j.
  - 복도: (a) 지금처럼 둔다 (b) 없앤다(앞 띠 작은방이 그 아래 뒤 띠 실과 직접 맞닿음). 복도는 둘 다 별도 노드 규약(합치지 않음).
근사다: 실제 기하(거실 깊이 0.59, 경계 여유)를 그리지 않았으므로 결론은 '범위 안에 드는가'까지만.
사용: SPECS=rq4 uv run python a1_precheck.py → ../evidence/results/a1-precheck.md
"""

from __future__ import annotations

import itertools
from collections import defaultdict

import networkx as nx
import numpy as np

from boltzmann_rq4 import STATS, stats_profile
from heldout_compare import load_dev
from real_vs_generated import RES
from syntax_qubo.aligned import AlignedQubo, ov
from syntax_qubo.model import load_templates


def variant(q, t, rp, bp, mode):
    g0 = q.graph(rp, bp)
    g = nx.Graph()
    for v in g0:
        g.add_node(v, type=t.types.get(v, "기타"))
    g.add_edges_from(g0.edges)
    if mode == "now":
        return g
    m1, k = len(rp), len(bp)
    i = rp.index("living")
    edges = [x / m1 for x in (i, i + 1) if 0 < x / m1 < 1]  # 안방 쪽 경계(0)와 바깥벽(1) 제외
    for j, v in enumerate(bp):
        lo, hi = j / k, (j + 1) / k
        if any(lo - 1e-9 <= e <= hi + 1e-9 for e in edges):
            g.add_edge("living", v)
    if mode == "A1_nohall":
        for h in [x for x in g if x.startswith("hall")]:
            g.remove_node(h)
        for s, r in enumerate(rp):
            if r == "living":
                continue
            for j, v in enumerate(bp):
                if ov(s, j, m1, k):
                    g.add_edge(r, v)
    return g


def main():
    res = defaultdict(lambda: defaultdict(list))
    for t in load_templates():
        q = AlignedQubo(t)
        s = t.id.split("/")[0]
        for rp in itertools.permutations(q.rest):
            for bp in itertools.permutations(t.back):
                if not nx.is_connected(q.graph(rp, bp)):
                    continue
                for mode in ("now", "A1_hall", "A1_nohall"):
                    g = variant(q, t, rp, bp, mode)
                    if not nx.is_connected(g):
                        continue
                    f, _ = stats_profile(g)
                    ty = nx.get_node_attributes(g, "type")
                    beds = [n for n in g if ty[n] == "침실"]
                    res[mode][s].append((f[STATS.index("O1")], f[STATS.index("O2b")], g.degree("living"), np.mean([g.has_edge("living", b) for b in beds])))
    dev = load_dev()
    RF = np.array([stats_profile(g)[0] for g in dev])
    real = np.nanmean(RF[:, STATS.index("O1")])
    L = ["# A1′ 그래프 수준 사전 점검\n", f"> `SPECS=rq4 uv run python a1_precheck.py` · 사양 80개 · 실제 dev 서로 다른 그래프 {len(dev):,}개 · 근사(기하 미반영)\n"]
    L.append(f"실제 거실 RRA 평균 **{real:.3f}** (작을수록 거실 중심)\n")
    L.append("| 틀 | 거실 RRA 최선(사양별 최소 평균) | 균등 평균 | 최악 | 실제가 범위 안? | 거실 연결도(균등 평균) | 침실 중 거실과 맞닿음(균등) |")
    L.append("|---|---|---|---|---|---|---|")
    names = {"now": "현 정렬 틀", "A1_hall": "A1′ (복도 유지)", "A1_nohall": "A1′ (복도 없음)"}
    for mode in ("now", "A1_hall", "A1_nohall"):
        S = res[mode]
        lo = np.mean([min(x[0] for x in v) for v in S.values()])
        un = np.mean([np.mean([x[0] for x in v]) for v in S.values()])
        hi = np.mean([max(x[0] for x in v) for v in S.values()])
        deg = np.mean([np.mean([x[2] for x in v]) for v in S.values()])
        bt = np.mean([np.mean([x[3] for x in v]) for v in S.values()])
        L.append(f"| {names[mode]} | {lo:.3f} | {un:.3f} | {hi:.3f} | {'예' if lo <= real <= hi else '아니오'} | {deg:.2f} | {bt:.0%} |")
    L.append("\n실제(dev, 벽 그래프): 거실 연결도 중앙값 7, 침실 중 거실과 맞닿음 96%.")
    RES.joinpath("a1-precheck.md").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()

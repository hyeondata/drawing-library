"""뒤 띠를 거실 열에서 나누는 틀(Confluence 09-15 10절)의 직사각형 기하 그래프와 사전 점검.

정규화 좌표(실제 치수는 도면화 단계에서 정함; 그래프는 맞닿음 양상만 본다):
  앞 띠 y∈[0,1]: 안방 열 x∈[−w,0], 나머지 앞 칸 i는 [i/m1,(i+1)/m1]. 작은방은 y∈[h,1], 그 뒤 복도(별도 노드) y∈[0,h].
  거실 열 [a,b]: 거실은 y∈[−δ,1](거실 뒤에 방이 있으면) 또는 y∈[−Db,1](없으면, 뒷벽까지).
  뒤 띠 y∈[−Db,0]: 안방 아래 부속실(드레스룸 위, 부부욕실 아래), 왼쪽 구간 [0,a]에 kL실, 거실 뒤 [a,b]×[−Db,−δ]에 c실(0~2, 거실이 유일한 앞 칸이면 전부), 오른쪽 구간 [b,1]에 kR실.
  구간 안은 등분. 배치 = (앞 띠 순서, 뒤 띠 순서, kL, c). 구간에 폭이 있으면 1실 이상, 앞 칸 하나당 최대 2실.
check_current(): 같은 기하 함수로 '현 정렬 틀'(뒤 띠 k등분, 거실 연장 없음)을 그려 AlignedQubo.graph와 같은지 대조한다(기하 함수 검증).
사용: SPECS=rq4 uv run python split_frame.py → ../evidence/results/split-frame-precheck.md
"""

from __future__ import annotations

import itertools
from collections import defaultdict

import networkx as nx
import numpy as np

from boltzmann_rq4 import STATS, stats_profile
from heldout_compare import load_dev
from real_vs_generated import RES
from syntax_qubo.aligned import AlignedQubo
from syntax_qubo.model import load_templates

W, H, DB, DELTA = 0.3, 0.3, 0.8, 0.4  # 안방 열 폭, 복도 깊이, 뒤 띠 깊이, 거실 연장(정규화; 맞닿음 양상에만 영향)
EPS = 1e-9


def touch(r, s):
    (x0, x1, y0, y1), (u0, u1, v0, v1) = r, s
    ox = min(x1, u1) - max(x0, u0)
    oy = min(y1, v1) - max(y0, v0)
    if (abs(x1 - u0) < EPS or abs(u1 - x0) < EPS) and oy > EPS:
        return True
    if (abs(y1 - v0) < EPS or abs(v1 - y0) < EPS) and ox > EPS:
        return True
    return False


def rects(t, rest_perm, back_perm, kL=None, c=None, split=True):
    """방 이름 → 직사각형(x0, x1, y0, y1). split=False면 현 정렬 틀."""
    m1 = len(rest_perm)
    R = {"master": (-W, 0, 0, 1)}
    ls = rest_perm.index("living")
    a, b = ls / m1, (ls + 1) / m1
    for i, r in enumerate(rest_perm):
        x0, x1 = i / m1, (i + 1) / m1
        if r == "living":
            low = 0 if not split else (-DELTA if c else -DB)
            R[r] = (x0, x1, low, 1)
        else:
            R[r] = (x0, x1, H, 1)
    if a > EPS:
        R["hallA"] = (0, a, 0, H)
    if b < 1 - EPS:
        R["hallB"] = (b, 1, 0, H)
    suite = [s for s in ("dress", "bathMaster") if s in t.suite]
    for n, s in enumerate(suite):
        R[s] = (-W, 0, -DB * (n + 1) / len(suite), -DB * n / len(suite))
    k = len(back_perm)
    if not split:
        for j, v in enumerate(back_perm):
            R[v] = (j / k, (j + 1) / k, -DB, 0)
        return R
    kR = k - kL - c
    for j in range(kL):
        R[back_perm[j]] = (a * j / kL, a * (j + 1) / kL, -DB, 0)
    for j in range(c):
        R[back_perm[kL + j]] = (a + (b - a) * j / c, a + (b - a) * (j + 1) / c, -DB, -DELTA)
    for j in range(kR):
        R[back_perm[kL + c + j]] = (b + (1 - b) * j / kR, b + (1 - b) * (j + 1) / kR, -DB, 0)
    return R


def graph(t, R):
    g = nx.Graph()
    for v in R:
        g.add_node(v, type=t.types.get(v, "기타"))
    for u, v in itertools.combinations(R, 2):
        if touch(R[u], R[v]):
            g.add_edge(u, v)
    return g


def splits(m1, k, ls):
    nl, nr = ls, m1 - 1 - ls  # 거실 왼쪽·오른쪽 앞 칸 수
    cs = [k] if nl == 0 and nr == 0 else [0, 1, 2]  # 거실이 유일한 앞 칸이면 뒤 띠 전부가 거실 뒤
    for c in cs:
        for kL in range(0, k - c + 1):
            kR = k - kL - c
            if (nl == 0) != (kL == 0) or (nr == 0) != (kR == 0):
                continue
            if kL > 2 * nl or kR > 2 * nr:
                continue
            yield kL, c


def check_current(ts):
    bad = tot = 0
    for t in ts:
        q = AlignedQubo(t)
        for rp in itertools.permutations(q.rest):
            for bp in itertools.permutations(t.back):
                gm = q.graph(rp, bp)
                gg = graph(t, rects(t, rp, bp, split=False))
                tot += 1
                if {frozenset(e) for e in gm.edges} != {frozenset(e) for e in gg.edges} or set(gm) != set(gg):
                    bad += 1
    return tot - bad, tot


def main():
    ts = load_templates()
    ok, tot = check_current(ts)
    print("기하 함수 검증(현 틀): 일치", ok, "/", tot)
    res = defaultdict(list)
    narr = 0
    for t in ts:
        s = t.id.split("/")[0]
        rest = [r for r in t.front if r != "master"]
        for rp in itertools.permutations(rest):
            ls = rp.index("living")
            for bp in itertools.permutations(t.back):
                for kL, c in splits(len(rp), len(bp), ls):
                    g = graph(t, rects(t, rp, bp, kL, c))
                    if not nx.is_connected(g):
                        continue
                    narr += 1
                    f, _ = stats_profile(g)
                    ty = nx.get_node_attributes(g, "type")
                    beds = [n for n in g if ty[n] == "침실"]
                    res[s].append((f[STATS.index("O1")], f[STATS.index("O2b")], g.degree("living"), np.mean([g.has_edge("living", x) for x in beds])))
    dev = load_dev()
    RF = np.array([stats_profile(g)[0] for g in dev])
    real = float(np.nanmean(RF[:, STATS.index("O1")]))
    lo = np.mean([min(x[0] for x in v) for v in res.values()])
    un = np.mean([np.mean([x[0] for x in v]) for v in res.values()])
    hi = np.mean([max(x[0] for x in v) for v in res.values()])
    deg = np.mean([np.mean([x[2] for x in v]) for v in res.values()])
    bt = np.mean([np.mean([x[3] for x in v]) for v in res.values()])
    l2 = np.mean([np.mean([x[1] for x in v]) for v in res.values()])
    L = ["# 뒤 띠를 거실 열에서 나누는 틀: 직사각형 기하 사전 점검\n"]
    L.append(f"> `SPECS=rq4 uv run python split_frame.py` · 사양 {len(res)}개 · 배치 {narr:,}개 · 기하 함수 검증(현 틀을 같은 함수로 그려 정확 QUBO 그래프와 대조) {ok:,}/{tot:,}\n")
    L.append("| 틀 | 거실 RRA 최선 / 균등 / 최악 | 실제 평균이 범위 안? | 거실 연결도(균등) | 침실 중 거실과 맞닿음(균등) | 현관→거실 깊이(균등) |")
    L.append("|---|---|---|---|---|---|")
    L.append("| 현 정렬 틀(09-13 15절) | 0.304 / 0.439 / 0.661 | 아니오 | 4.80 | 67% | 1.44 |")
    L.append(f"| **뒤 띠 분할 틀** | **{lo:.3f}** / {un:.3f} / {hi:.3f} | {'**예**' if lo <= real <= hi else '아니오'} | {deg:.2f} | {bt:.0%} | {l2:.2f} |")
    L.append(f"| 실제 dev | 평균 {real:.3f} | — | 7 (중앙값) | 96% | 1.02 |")
    RES.joinpath("split-frame-precheck.md").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()

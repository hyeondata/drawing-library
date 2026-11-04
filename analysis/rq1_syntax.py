"""RQ1: 한국 아파트(AI 허브 dev 묶음)의 공간구문 구조를 여러 지표로 잰다.

입력: ../aihub-full/derived/unit-graphs.jsonl (scripts/export-unit-graphs.mjs, 평가 모델과 같은 벽 인접 그래프)
대상: dev 묶음, 침실 2~4개, 주방·화장실이 있는 세대. 덕트(작은 '기타')는 뺀다. 같은 그래프(유형 라벨 포함 동형)는 한 번만.
규약: 뿌리 = 현관(외부 노드 없음). 통합도 = 1/RRA, RRA = RA / D_k (Hillier & Hanson 1984 다이아몬드 값).

지표(노드 유형별): 연결도, 현관에서 깊이, 통합도, 통제값, 선택도(정규화 betweenness).
지표(세대별): 고리도, 공간 유형 a/b/c/d 비율(Hillier 1996), 이해도(연결도–통합도 상관), 상대 엔트로피(현관 깊이 분포),
  difference factor H*(거실·주방·침실 평균 RA), 공용실 경유율(현관→침실 최단경로가 거실·주방을 지나는 비율), 유전형 1위 유형.
사용: uv run python rq1_syntax.py  → ../evidence/results/rq1-syntax.md, .json
"""

from __future__ import annotations

import json
import math
import time
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import networkx as nx
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DER = ROOT.parent / "aihub-full" / "derived"
RES = ROOT / "evidence" / "results"
# 실제 그래프 규약: 기본 = AI 허브 라벨 그대로, REAL=P1·P2 = 거실을 볼록 공간으로 나눔(scripts/convex-living.mjs)
_REAL = __import__("os").environ.get("REAL", "")
REAL_FILE = f"unit-graphs-convex-{_REAL}.jsonl" if _REAL in ("P1", "P2") else "unit-graphs.jsonl"
OUT_SFX = f"-convex{_REAL}" if _REAL in ("P1", "P2") else ""
TYPES = ["거실", "주방", "현관", "침실", "화장실", "드레스룸", "다목적공간", "기타", "발코니"]
PUBLIC = {"거실", "주방"}


def d_value(k: int) -> float:
    if k < 3:
        return float("nan")
    return 2 * (k * (math.log2((k + 2) / 3) - 1) + 1) / ((k - 1) * (k - 2))


def graph_of(o) -> nx.Graph | None:
    keep = [i for i, n in enumerate(o["nodes"]) if not n["duct"]]
    g = nx.Graph()
    for i in keep:
        g.add_node(i, type=o["nodes"][i]["type"])
    for i, j in o["edges"]:
        if i in g and j in g and i != j:
            g.add_edge(i, j)
    ent = [n for n, t in g.nodes(data="type") if t == "현관"]
    if len(ent) != 1:
        return None
    if not nx.is_connected(g):
        g = g.subgraph(nx.node_connected_component(g, ent[0])).copy()
    # 현관에서 닿는 부분만으로 세대 구성을 확인한다(라벨이 끊긴 세대는 뺀다)
    types = Counter(nx.get_node_attributes(g, "type").values())
    if not (2 <= types["침실"] <= 4 and types["주방"] and types["화장실"] and types["거실"]):
        return None
    return g


def measures(g: nx.Graph) -> dict:
    k = g.number_of_nodes()
    t = nx.get_node_attributes(g, "type")
    ent = next(n for n in g if t[n] == "현관")
    D = d_value(k)
    sp = dict(nx.all_pairs_shortest_path_length(g))
    md = {n: sum(sp[n].values()) / (k - 1) for n in g}
    ra = {n: 2 * (md[n] - 1) / (k - 2) for n in g}
    integ = {n: (D / ra[n] if ra[n] > 0 else float("nan")) for n in g}
    deg = dict(g.degree())
    control = {n: sum(1 / deg[m] for m in g[n]) for n in g}
    choice = nx.betweenness_centrality(g, normalized=True)
    dep = sp[ent]
    # 공간 유형 a/b/c/d (Hillier 1996): a = 막다른 곳(연결도 1), b = 고리 밖 통과 공간, c = 고리 하나, d = 고리 둘 이상의 교차
    cyc_count = defaultdict(int)
    for comp in nx.biconnected_components(g):
        if len(comp) >= 3:
            sub = g.subgraph(comp)
            rings = sub.number_of_edges() - sub.number_of_nodes() + 1
            for n in comp:
                cyc_count[n] += rings
    stype = {}
    # Hillier 1996(SITM pp.250–251): a = 링크 하나(막다른), b = 링크 둘 이상·고리 밖, c = 링크 둘 이상·고리 하나,
    # d = 링크 셋 이상이고 고리 둘 이상에 걸침. (2026-11-04 고침: d에 링크 > 2 조건이 빠져 있었다)
    for n in g:
        if deg[n] <= 1:
            stype[n] = "a"
        elif cyc_count[n] == 0:
            stype[n] = "b"
        elif cyc_count[n] >= 2 and deg[n] > 2:
            stype[n] = "d"
        else:
            stype[n] = "c"
    # 상대 엔트로피(Turner 2001, Hillier et al. 1987 식; 식은 2차 자료 arXiv 2005.08106로만 확인, 부호 규약 미확인): Σ_d −p_d·ln(p_d / q_d), q_d = 평균 깊이 L의 푸아송 기대 분포. 이 식이면 −KL(≤ 0).
    # (2026-11-04 고침: 전에는 정규화 엔트로피 −Σp log₂p / log₂(최대깊이)였다 — 다른 양)
    dd = Counter(v for n, v in dep.items() if n != ent)
    Ld = sum(d * c for d, c in dd.items()) / (k - 1)
    ent_rel = 0.0
    for d, c in dd.items():
        p_d = c / (k - 1)
        q_d = (Ld**d) * math.exp(-Ld) / math.factorial(d)
        ent_rel += -p_d * math.log(p_d / q_d)
    # 이해도: 연결도와 통합도의 상관
    xs = np.array([deg[n] for n in g], float)
    ys = np.array([integ[n] for n in g], float)
    intel = float(np.corrcoef(xs, ys)[0, 1]) if xs.std() > 0 and ys.std() > 0 else float("nan")
    # difference factor H* (Hillier, Hanson & Graham 1987 p.365): 세 공간 값 a, b, c와 합 t로 H = −Σ(a/t)ln(a/t),
    # H* = (H − ln2)/(ln3 − ln2). 0에 가까울수록 분화가 강함(Hanson 1998). 세 공간 = 거실·주방·침실 평균의 RRA(이 연구의 규약).
    # (2026-11-04 고침: 전에는 H/ln3) 기저 difference factor(BDF): 세 값 = 그래프의 RRA 최대·평균·최소(SITM p.73).
    def mean_by(tp, d):
        v = [d[n] for n in g if t[n] == tp]
        return float(np.mean(v)) if v else float("nan")
    rra = {n: ra[n] / D for n in g}
    def hstar(vals):
        a3 = np.array(vals, float)
        if not np.all(a3 > 0):
            return float("nan")
        q = a3 / a3.sum()
        H = float(-(q * np.log(q)).sum())
        return (H - math.log(2)) / (math.log(3) - math.log(2))
    Hstar = hstar([mean_by("거실", rra), mean_by("주방", rra), mean_by("침실", rra)])
    rv = list(rra.values())
    BDF = hstar([max(rv), float(np.mean(rv)), min(rv)])
    # 공용실 경유율: 현관→각 침실 최단경로 중 하나라도 거실·주방을 지나는 침실의 비율
    beds = [n for n in g if t[n] == "침실"]
    through = []
    for b in beds:
        paths = list(nx.all_shortest_paths(g, ent, b))
        through.append(any(any(t[x] in PUBLIC for x in pth[1:-1]) for pth in paths))
    top = max((n for n in g if t[n] in ("거실", "주방", "현관", "침실", "화장실", "기타")), key=lambda n: integ[n])
    per_type = {}
    for tp in TYPES:
        nodes = [n for n in g if t[n] == tp]
        if nodes:
            per_type[tp] = {
                "conn": float(np.mean([deg[n] for n in nodes])),
                "depth": float(np.mean([dep[n] for n in nodes])),
                "integ": float(np.mean([integ[n] for n in nodes])),
                "control": float(np.mean([control[n] for n in nodes])),
                "choice": float(np.mean([choice[n] for n in nodes])),
            }
    st = Counter(stype.values())
    return {
        "k": k,
        "beds": len(beds),
        "ringiness": (g.number_of_edges() - k + 1) / (2 * k - 5),
        "stype": {s: st.get(s, 0) / k for s in "abcd"},
        "intelligibility": intel,
        "entropy_rel": ent_rel,
        "Hstar": Hstar,
        "BDF": BDF,
        "through_public": float(np.mean(through)) if through else float("nan"),
        "top_type": t[top],
        "living_top": t[top] == "거실",
        "per_type": per_type,
    }


def signature(g: nx.Graph) -> str:
    h = g.copy()
    nx.set_node_attributes(h, {n: f"t{TYPES.index(tp) if tp in TYPES else 99}" for n, tp in g.nodes(data="type")}, "code")
    return nx.weisfeiler_lehman_graph_hash(h, node_attr="code", iterations=3)


def work(lines):
    out = []
    for line in lines:
        o = json.loads(line)
        if o["split"] != "dev":
            continue
        g = graph_of(o)
        if g is None:
            continue
        out.append((signature(g), measures(g)))
    return out


def main():
    t0 = time.time()
    lines = (DER / REAL_FILE).read_text().splitlines()
    chunks = [lines[i::16] for i in range(16)]
    with ProcessPoolExecutor(16) as ex:
        res = [r for part in ex.map(work, chunks) for r in part]
    seen, rows = set(), []
    for sig, m in res:
        if sig in seen:
            continue
        seen.add(sig)
        rows.append(m)
    n_all = len(res)

    def q(v):
        v = np.array([x for x in v if x == x], float)
        return f"{np.median(v):.2f} [{np.quantile(v, .25):.2f}, {np.quantile(v, .75):.2f}]"

    L = ["# RQ1 한국 아파트의 공간구문 구조 (AI 허브 dev 묶음)\n"]
    L.append(f"> `uv run python rq1_syntax.py` · {time.time() - t0:.0f}초 · dev 세대 {n_all:,}개 중 그래프가 서로 다른(유형 라벨 포함 WL 해시) {len(rows):,}개, 침실 2~4개 · 뿌리 = 현관, 외부 노드 없음, 덕트 제외 · 값은 중앙값 [사분위]\n")
    L.append("## 실 유형별\n")
    L.append("| 유형 | 세대 수 | 연결도 | 현관에서 깊이 | 통합도(1/RRA) | 통제값 | 선택도 |")
    L.append("|---|---|---|---|---|---|---|")
    for tp in TYPES:
        vs = [r["per_type"][tp] for r in rows if tp in r["per_type"]]
        if not vs:
            continue
        L.append(f"| {tp} | {len(vs):,} | {q([v['conn'] for v in vs])} | {q([v['depth'] for v in vs])} | {q([v['integ'] for v in vs])} | {q([v['control'] for v in vs])} | {q([v['choice'] for v in vs])} |")
    L.append("\n## 세대별\n")
    L.append("| 지표 | 값 |")
    L.append("|---|---|")
    L.append(f"| 실 수(덕트 제외) | {q([r['k'] for r in rows])} |")
    L.append(f"| 고리도 | {q([r['ringiness'] for r in rows])} |")
    for s, name in zip("abcd", ["a 막다른", "b 통과", "c 고리 하나", "d 고리 교차"]):
        L.append(f"| 공간 유형 {name} 비율 | {q([r['stype'][s] for r in rows])} |")
    L.append(f"| 이해도(연결도–통합도 r) | {q([r['intelligibility'] for r in rows])} |")
    L.append(f"| 상대 엔트로피(Turner 식, 2차 확인; = −KL) | {q([r['entropy_rel'] for r in rows])} |")
    L.append(f"| H*(거실·주방·침실 RRA, HHG 1987 식) | {q([r['Hstar'] for r in rows])} |")
    L.append(f"| 기저 difference factor(RRA 최대·평균·최소) | {q([r['BDF'] for r in rows])} |")
    L.append(f"| 공용실(거실·주방) 경유 침실 비율 | {q([r['through_public'] for r in rows])} |")
    top = Counter(r["top_type"] for r in rows)
    L.append("\n## 가장 통합된 유형(유전형 1위) — 반례 포함\n")
    L.append("| 1위 유형 | 세대 | 비율 |")
    L.append("|---|---|---|")
    for tp, c in top.most_common():
        L.append(f"| {tp} | {c:,} | {c / len(rows):.1%} |")
    L.append("\n- '기타'는 복도·홀(문헌의 중앙홀·전이공간)이다. 홀을 거실에 합칠지에 따라 O1(거실 중심)과 O7(홀 중심)의 판정이 달라진다(Seo 2003은 독립, Choi 2014는 제외).")
    L.append("- 2026-11-04 고침(원문 대조, Confluence 09-12d): H*를 HHG 1987 식으로, 상대 엔트로피를 Turner 식으로, d형에 링크 > 2 조건을 넣었다.")
    RES.joinpath(f"rq1-syntax{OUT_SFX}.md").write_text("\n".join(L) + "\n")
    RES.joinpath(f"rq1-syntax{OUT_SFX}.json").write_text(json.dumps({"n_units": n_all, "n_graphs": len(rows), "top": dict(top)}, ensure_ascii=False, indent=1))
    print("\n".join(L))


if __name__ == "__main__":
    main()

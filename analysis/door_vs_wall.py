"""벽 인접 그래프 대 출입 그래프: SPA·STR 라벨이 둘 다 있는 dev 세대에서 공간구문 값이 얼마나 달라지는지 잰다.

입력: ../aihub-full/derived/door-vs-wall.jsonl (scripts/door-vs-wall.mjs). 출입 링크 = 문 또는 개방 경계(틈 ≤ OPEN_GAP px).
같은 세대의 두 그래프에 rq1_syntax의 graph_of·measures를 그대로 적용한다. test 세대는 쓰지 않는다.
표본이 작다(dev 세대 십수 개) — 결론이 아니라 벽 그래프 오차의 크기를 보이는 측정이다.
사용: uv run python door_vs_wall.py → ../evidence/results/door-vs-wall.md/json
"""

from __future__ import annotations

import json
from collections import Counter

import networkx as nx
import numpy as np

from real_vs_generated import RES
from rq1_syntax import DER, graph_of, measures

DROP = {"발코니", "실외기실"}


def jsig(g):
    t = nx.get_node_attributes(g, "type")
    ent = next(n for n in g if t[n] == "현관")
    d = nx.single_source_shortest_path_length(g, ent)
    return tuple(sorted((t[n], d[n]) for n in g))


def main():
    rows = [json.loads(x) for x in (DER / "door-vs-wall.jsonl").read_text().splitlines()]
    dev = [r for r in rows if r["split"] == "dev"]
    pair_all, pair_acc = Counter(), Counter()
    per, lost, edge_stats = [], [], []
    for r in dev:
        types = [n["type"] for n in r["nodes"]]
        nodes = [{**n, "duct": n["duct"] or n["type"] in DROP} for n in r["nodes"]]
        keep = {i for i, n in enumerate(nodes) if not n["duct"]}
        es = [e for e in r["edges"] if e["e"][0] in keep and e["e"][1] in keep]
        for e in es:
            k = tuple(sorted((types[e["e"][0]], types[e["e"][1]])))
            pair_all[k] += 1
            pair_acc[k] += e["door"] or e["open"]
        gw = graph_of({"nodes": nodes, "edges": [e["e"] for e in es]})
        ga = graph_of({"nodes": nodes, "edges": [e["e"] for e in es if e["door"] or e["open"]]})
        edge_stats.append((len(es), sum(e["door"] or e["open"] for e in es), sum(e["door"] for e in es), sum(e["open"] and not e["door"] for e in es)))
        if gw is None or ga is None:
            lost.append((r["drawing"], r["unit"], gw is None, ga is None, None if ga is None else 0))
            if gw is not None and ga is None:
                # 출입 그래프에서 현관에 닿지 않는 실
                g2 = nx.Graph()
                g2.add_nodes_from(i for i in keep)
                g2.add_edges_from(e["e"] for e in es if e["door"] or e["open"])
                ent = [i for i in keep if types[i] == "현관"]
                comp = nx.node_connected_component(g2, ent[0]) if ent else set()
                lost[-1] = (r["drawing"], r["unit"], False, True, sorted(types[i] for i in keep - comp))
            continue
        mw, ma = measures(gw), measures(ga)
        per.append({"drawing": r["drawing"], "unit": r["unit"], "nw": gw.number_of_nodes(), "na": ga.number_of_nodes(), "ew": gw.number_of_edges(), "ea": ga.number_of_edges(), "w": mw, "a": ma, "sig_same": jsig(gw) == jsig(ga)})
    L = ["# 벽 인접 그래프 대 출입 그래프 (SPA·STR 겹침 도면, dev)\n"]
    tot = np.sum(edge_stats, axis=0) if edge_stats else [0, 0, 0, 0]
    L.append(f"> `uv run python door_vs_wall.py` · 도면 {len({r['drawing'] for r in dev})}장 · dev 세대 {len(dev)}개 · 두 그래프 모두 유효 {len(per)}개 · test 미사용 · 발코니·실외기실 제외\n")
    L.append(f"- 벽 인접 링크 {tot[0]}개 중 출입 링크 {tot[1]}개(**{tot[1] / max(tot[0], 1):.0%}**) — 문 {tot[2]}, 개방 경계(문 없음) {tot[3]}")
    L.append(f"- 출입 그래프가 무너진 세대(현관에서 닿지 않는 실이 생겨 세대 조건 미달): {sum(1 for x in lost if x[3])}개 {[x[4] for x in lost if x[3]]}")
    L.append("\n## 실 유형 쌍별: 벽으로 맞닿은 쌍 중 출입이 있는 비율\n")
    L.append("| 쌍 | 벽 인접 | 출입 | 비율 |")
    L.append("|---|---|---|---|")
    for k, v in pair_all.most_common():
        L.append(f"| {k[0]}–{k[1]} | {v} | {pair_acc[k]} | {pair_acc[k] / v:.0%} |")
    if per:
        L.append("\n## 같은 세대에서 두 그래프의 공간구문 값\n")
        L.append("| 지표 | 벽 그래프 중앙값 | 출입 그래프 중앙값 | 차이 중앙값 [최소, 최대] |")
        L.append("|---|---|---|---|")
        def row(name, f):
            w = np.array([f(p["w"]) for p in per], float)
            a = np.array([f(p["a"]) for p in per], float)
            d = a - w
            L.append(f"| {name} | {np.nanmedian(w):.2f} | {np.nanmedian(a):.2f} | {np.nanmedian(d):+.2f} [{np.nanmin(d):+.2f}, {np.nanmax(d):+.2f}] |")
        g = lambda tp, k: (lambda m: m["per_type"].get(tp, {}).get(k, np.nan))  # noqa: E731
        row("고리도(ringiness)", lambda m: m["ringiness"])
        row("d형 공간 비율", lambda m: m["stype"]["d"])
        row("H*", lambda m: m["Hstar"])
        row("기저 DF", lambda m: m["BDF"])
        row("이해도", lambda m: m["intelligibility"])
        for tp in ("거실", "주방", "침실", "화장실"):
            row(f"{tp} 통합도", g(tp, "integ"))
            row(f"{tp} 현관 깊이", g(tp, "depth"))
        row("거실 선택도", g("거실", "choice"))
        L.append(f"\n- 가장 통합된 실이 거실: 벽 {np.mean([p['w']['living_top'] for p in per]):.0%} → 출입 {np.mean([p['a']['living_top'] for p in per]):.0%}")
        L.append(f"- 정당화 그래프 유형(G1 서명)이 같은 세대: {np.mean([p['sig_same'] for p in per]):.0%}")
        L.append(f"- 링크 수: 벽 {np.median([p['ew'] for p in per]):.0f} → 출입 {np.median([p['ea'] for p in per]):.0f} (중앙값), 노드 수 같음 {np.mean([p['nw'] == p['na'] for p in per]):.0%}")
    L.append("\n- 규약: 문 다각형이 두 실 모두에서 15 px 이내면 문 링크. 두 실이 4 px 이내로 붙은 경계가 접촉 길이의 절반 이상이고 그 절반 이상이 STR 벽체 위가 아니면 개방 경계(문 없는 출입). 발코니 창호는 문으로 세지 않는다. 사례 2장을 그림으로 대조함(원룸 주방–침실 개방, 침실–침실 벽).")
    RES.joinpath("door-vs-wall.md").write_text("\n".join(L) + "\n")
    RES.joinpath("door-vs-wall.json").write_text(json.dumps({"per": per, "lost": lost, "edges": tot.tolist() if hasattr(tot, "tolist") else tot}, ensure_ascii=False, indent=1, default=str))
    print("\n".join(L))


if __name__ == "__main__":
    main()

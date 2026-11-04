"""RQ4: 목적과 분리된 비교 지표로 공간구문 목적별 생성 도면을 실제 한국 아파트(dev)와 비교한다.

어떤 목적에도 쓰지 않은 그래프 수준의 양만 쓴다(목적은 깊이·통합도·선택도 계열):
  G1 정당화 그래프 유형: 노드마다 (실 유형, 현관에서 깊이)의 다중집합. 주의: 현관 깊이를 쓰므로 깊이 계열 목적(O2·O3)에는 일부 순환. 생성 그래프의 유형이 실제 dev에 존재하는 비율(포함률).
     Ham & Lee 2017(58유형)·최영준·이동원 2008의 평면형 분류와 같은 취지(동형류 대신 유형×깊이 서명).
  G2 그래프 커널 최근접 거리: Weisfeiler–Lehman 부분트리 특징(h = 2, 실 유형 라벨; Shervashidze et al. 2011)의 코사인 거리로
     같은 침실 수 실제 dev 그래프 중 가장 가까운 것까지의 거리. 그래프 편집 거리의 계산 가능한 대용.
  G3 difference factor: H*(거실·주방·침실 RRA, HHG 1987 식), 기저 difference factor(RRA 최대·평균·최소). Cliff's δ.
기준값: dev를 둘로 나눠 한쪽을 다른 쪽에 비교한 값(실제끼리의 포함률·거리) — 생성이 이 값에 가까울수록 실제와 구별되지 않는다.
발코니·실외기실은 뺀다(생성기 발코니는 띠 하나, 실제는 여러 조각이라 규약 차이). test 묶음은 쓰지 않는다.
사용: uv run python heldout_compare.py → ../evidence/results/heldout-compare.md
"""

from __future__ import annotations

import json
from collections import Counter

import networkx as nx
import numpy as np
from sklearn.feature_extraction import DictVectorizer
from sklearn.preprocessing import normalize

from objective_compare import OBJ, cliffs
from real_vs_generated import RES
from rq1_syntax import DER, graph_of, measures

DROP = {"발코니", "실외기실"}


def clean(o):
    o = {"nodes": [n if n["type"] not in DROP else {**n, "duct": True} for n in o["nodes"]], "edges": o["edges"]}
    return graph_of(o)


def sig(g):
    t = nx.get_node_attributes(g, "type")
    ent = next(n for n in g if t[n] == "현관")
    dep = nx.single_source_shortest_path_length(g, ent)
    return tuple(sorted((t[n], dep[n]) for n in g))


def wl(g):
    h = g.copy()
    nx.set_node_attributes(h, {n: f"t{abs(hash(tp)) % 997}" for n, tp in g.nodes(data="type")}, "c")
    feats = Counter()
    for n, hs in nx.weisfeiler_lehman_subgraph_hashes(h, node_attr="c", iterations=2).items():
        feats[f"0:{h.nodes[n]['c']}"] += 1
        for i, x in enumerate(hs):
            feats[f"{i + 1}:{x}"] += 1
    return feats


def beds(g):
    return sum(1 for _, t in g.nodes(data="type") if t == "침실")


def main():
    dev = []
    for line in (DER / "unit-graphs.jsonl").read_text().splitlines():
        o = json.loads(line)
        if o["split"] != "dev":
            continue
        g = clean(o)
        if g is not None:
            dev.append(g)
    # 같은 그래프 중복 제거(실 유형 라벨 포함 WL 해시)
    seen, uniq = set(), []
    for g in dev:
        h = g.copy()
        nx.set_node_attributes(h, {n: f"t{abs(hash(tp)) % 997}" for n, tp in g.nodes(data="type")}, "c")
        k = nx.weisfeiler_lehman_graph_hash(h, node_attr="c", iterations=3)
        if k not in seen:
            seen.add(k)
            uniq.append(g)
    dev = uniq
    gen = {}
    for line in (RES / "objective-plans.jsonl").read_text().splitlines():
        o = json.loads(line)
        f = o.get("features") or {}
        if not f.get("graph"):
            continue
        g = clean(f["graph"])
        if g is not None:
            gen.setdefault(o["obj"], []).append(g)
    dv = DictVectorizer()
    Xdev = normalize(dv.fit_transform([wl(g) for g in dev]))
    bdev = np.array([beds(g) for g in dev])
    sdev = Counter(sig(g) for g in dev)
    mdev = [measures(g) for g in dev]

    def nn_dist(graphs, X, pool_mask=None):
        out = []
        S = (X @ Xdev.T).toarray()
        for i, g in enumerate(graphs):
            mask = (bdev == beds(g)) & (pool_mask if pool_mask is not None else True)
            out.append(1 - S[i, mask].max() if mask.any() else np.nan)
        return np.array(out)

    # 기준값: dev 반으로 나눠 A → B
    rng = np.random.default_rng(0)
    half = rng.random(len(dev)) < 0.5
    A = [g for g, h in zip(dev, half) if h]
    sB = Counter(sig(g) for g, h in zip(dev, half) if not h)
    ref_cov = np.mean([sig(g) in sB for g in A])
    XA = normalize(dv.transform([wl(g) for g in A]))
    ref_nn = np.nanmedian(nn_dist(A, XA, pool_mask=~half))
    L = ["# RQ4: 목적과 분리된 지표로 본 공간구문 목적별 생성 도면 대 실제(dev)\n"]
    L.append(f"> `uv run python heldout_compare.py` · 실제 dev 서로 다른 그래프 {len(dev):,}개 · 생성은 objective-plans.jsonl(정렬 모드 + 복도) · 발코니·실외기실 제외 · test 미사용\n")
    L.append("| 목적 | n | G1 유형 포함률 | G2 최근접 그래프 거리(중앙값) | G3 H* (δ) | G3 기저 DF (δ) |")
    L.append("|---|---|---|---|---|---|")
    L.append(f"| 실제 dev 반 ↔ 반(기준) | {len(A):,} | {ref_cov:.1%} | {ref_nn:.3f} | — | — |")
    summary = {"ref": {"cov": float(ref_cov), "nn": float(ref_nn)}}
    hdev = np.array([m["Hstar"] for m in mdev])
    bdf = np.array([m["BDF"] for m in mdev])
    for o, name in OBJ.items():
        gs = gen.get(o)
        if not gs:
            continue
        cov = np.mean([sig(g) in sdev for g in gs])
        X = normalize(dv.transform([wl(g) for g in gs]))
        nn = np.nanmedian(nn_dist(gs, X))
        ms = [measures(g) for g in gs]
        dH = cliffs([m["Hstar"] for m in ms], hdev)
        dB = cliffs([m["BDF"] for m in ms], bdf)
        summary[o] = {"cov": float(cov), "nn": float(nn), "dH": dH, "dB": dB, "n": len(gs)}
        L.append(f"| {name} | {len(gs)} | {cov:.1%} | {nn:.3f} | {np.nanmedian([m['Hstar'] for m in ms]):.2f} ({dH:+.2f}) | {np.nanmedian([m['BDF'] for m in ms]):.2f} ({dB:+.2f}) |")
    L.append(f"| 실제 dev 값 | | | | {np.nanmedian(hdev):.2f} | {np.nanmedian(bdf):.2f} |")
    L.append("\n- G1·G2는 클수록/작을수록 실제와 같은 그래프가 나온다는 뜻이다. 실제끼리의 기준값과 비교해 읽는다.")
    L.append("- 모든 지표가 벽 인접 그래프(평가 모델과 같은 규약)다. 문 그래프로 다시 재야 할 수 있다(TL_STR).")
    RES.joinpath("heldout-compare.md").write_text("\n".join(L) + "\n")
    RES.joinpath("heldout-compare.json").write_text(json.dumps(summary, indent=1))
    print("\n".join(L))


if __name__ == "__main__":
    main()

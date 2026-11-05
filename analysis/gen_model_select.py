"""사이트 생성 모형 선택: 사전 등록 통계량 중 '실제 전체 평균을 함께 맞출 수 있는(적률 일치, β가 경계 안) 가장 큰 집합'을 고른다.

왜: 8개를 한꺼번에 맞추면 적률 일치가 되지 않고(O7h β 경계) O1·O9·O7h가 강하게 겹쳐 β가 수십까지 커진다(조건수 폭발) — 설명하기 어려운 모형.
규칙(결과를 보기 전에 정한 순서): ① 적률 일치(|β_z| < 49.9, 평균 오차 < 1e-3) ② 정보 행렬(모형 공분산)의 조건수 < 1,000
  ③ 그중 통계량이 가장 많은 집합 ④ 동률이면 조건수가 가장 작은 집합. 실제 규약은 볼록 분할 P1(주 규약), 데이터는 7,275장 전체.
사용: SPECS=rq4 REAL=P1 uv run python gen_model_select.py → ../evidence/results/gen-model-select.md, ../src/generate/syntax-model-data.js
"""

from __future__ import annotations

import itertools
import json
import os
from concurrent.futures import ProcessPoolExecutor

import networkx as nx
import numpy as np
from scipy.optimize import minimize
from scipy.special import logsumexp

import boltzmann_rq4 as b
from heldout_compare import load_dev
from real_vs_generated import RES
from syntax_qubo.aligned import AlignedQubo
from syntax_qubo.model import load_templates


def main():
    assert os.environ.get("REAL") == "P1"
    ts = load_templates()
    with ProcessPoolExecutor(16) as ex:
        res = [r for r in ex.map(b.enum_template, range(len(ts))) if r[2]]
    F, spec = [], []
    for _, s, out in res:
        for f, *_ in out:
            F.append(f)
            spec.append(s)
    F, spec = np.array(F), np.array(spec)
    groups = [np.where(spec == s)[0] for s in sorted(set(spec))]
    dev = load_dev()
    RF = np.array([b.stats_profile(g)[0] for g in dev])
    specs = json.loads(RES.joinpath("rq4-specs.json").read_text())["specs"]
    from collections import Counter

    sc = Counter((s["bedrooms"], s["baths"], s["dress"], s["multi"]) for s in specs)
    comp = [b.comp_of_graph(g) for g in dev]
    cnt = Counter(comp)
    w = np.array([(sc[c] / len(specs)) / cnt[c] if c in sc else 0.0 for c in comp])
    w /= w.sum()
    m = np.array([np.nansum(w * np.nan_to_num(RF[:, j])) for j in range(len(b.STATS))])
    sd = np.array([np.sqrt(np.nansum(w * (np.nan_to_num(RF[:, j]) - m[j]) ** 2)) for j in range(len(b.STATS))])
    Fz = (F - m) / sd

    def fit(idx):
        def L(beta):
            val, grad = 0.0, np.zeros(len(idx))
            for g in groups:
                e = -Fz[g][:, idx] @ beta
                lz = logsumexp(e)
                p = np.exp(e - lz)
                val += lz
                grad -= p @ Fz[g][:, idx]
            return val / len(groups), grad / len(groups)

        r = minimize(L, np.zeros(len(idx)), jac=True, method="L-BFGS-B", bounds=[(-50, 50)] * len(idx))
        mean = np.zeros(len(idx))
        cov = np.zeros((len(idx), len(idx)))
        for g in groups:
            e = -Fz[g][:, idx] @ r.x
            p = np.exp(e - logsumexp(e))
            X = Fz[g][:, idx]
            mu = p @ X
            mean += mu / len(groups)
            cov += ((X - mu).T * p) @ (X - mu) / len(groups)
        ok = bool(np.all(np.abs(r.x) < 49.9)) and np.allclose(mean, 0, atol=1e-3)
        ev = np.linalg.eigvalsh(cov)
        cond = float(ev.max() / max(ev.min(), 1e-12))
        return r.x, ok, cond

    rows = []
    n = len(b.STATS)
    # 후보 통계량(고정 기록 09-21 ③④): 정확 QUBO로 쓸 수 있는 것만. CANDS를 비우면 예전처럼 8개 전부.
    cands = [b.STATS.index(c) for c in os.environ.get("CANDS", ",".join(b.STATS)).split(",")]
    for k in range(1, len(cands) + 1):
        for idx in itertools.combinations(cands, k):
            beta, ok, cond = fit(list(idx))
            rows.append((idx, beta, ok, cond))
    good = [r for r in rows if r[2] and r[3] < 1000]
    best = max(good, key=lambda r: (len(r[0]), -r[3]))
    L = ["# 사이트 생성 모형 선택(최대 엔트로피, 볼록 분할 P1, 7,275장 전체)\n"]
    L.append(f"> `SPECS=rq4 REAL=P1 CANDS={','.join(b.STATS[i] for i in cands)} uv run python gen_model_select.py` · 통계량 부분집합 {len(rows)}개 · 실제 서로 다른 그래프 {len(dev):,}개\n")
    L.append("규칙: ① 적률 일치 ② 조건수 < 1,000 ③ 통계량 수 최대 ④ 조건수 최소.\n")
    L.append("| 크기 | 조건을 만족한 집합 수 / 전체 |")
    L.append("|---|---|")
    for k in range(1, len(cands) + 1):
        L.append(f"| {k} | {sum(1 for r in good if len(r[0]) == k)} / {sum(1 for r in rows if len(r[0]) == k)} |")
    full = [r for r in rows if len(r[0]) == len(cands)][0]
    L.append(f"\n- 후보 {len(cands)}개({', '.join(b.STATS[i] for i in cands)}) 전부: 적률 일치 {'예' if full[2] else '아니오'}, 조건수 {full[3]:.0f}")
    L.append(f"- **선택**: {', '.join(b.STATS[i] for i in best[0])} · β_z {', '.join(f'{x:+.2f}' for x in best[1])} · 조건수 {best[3]:.1f}")
    RES.joinpath("gen-model-select.md").write_text("\n".join(L) + "\n")
    idx = list(best[0])
    beta_raw = np.zeros(n)
    beta_raw[idx] = best[1] / sd[idx]
    model = {
        "about": "사이트 생성 모형: P(배치) ∝ exp(−Σ beta_raw·f). 후보(정확 QUBO로 쓸 수 있는 통계량, 고정 기록 09-21) 중 7,275장(볼록 분할 P1) 실제 평균을 함께 맞출 수 있는 가장 큰 집합(조건수 < 1,000). analysis/gen_model_select.py", "candidates": [b.STATS[i] for i in cands],
        "stats": b.STATS, "used": [b.STATS[i] for i in idx], "beta_raw": beta_raw.tolist(), "beta_z": {b.STATS[i]: float(x) for i, x in zip(idx, best[1])},
        "mean": m.tolist(), "sd": sd.tolist(), "cond": best[3], "real_graphs": int(len(dev)), "convention": "convex-P1", "frame": "aligned",
        # 적용 범위: β를 맞춘 실제 그래프(침실 2~4개, rq1_syntax.graph_of)와 사양 묶음의 침실 수. 밖은 외삽이라 쓰지 않는다.
        "support": {"bedrooms": [min(s["bedrooms"] for s in specs), max(s["bedrooms"] for s in specs)]},
    }
    (RES.parents[1] / "src" / "generate" / "syntax-model-data.js").write_text(
        "// analysis/gen_model_select.py가 만든 파일(손대지 말 것). 사이트 연구 생성기(src/generate/syntax-gen.js)의 최대 엔트로피 모형.\n"
        f"export const SYNTAX_MODEL = {json.dumps(model, ensure_ascii=False, indent=1)};\n"
    )
    vec = []
    for t in ts[:4]:
        q = AlignedQubo(t)
        for rp, bp in list(itertools.product(itertools.permutations(q.rest), itertools.permutations(t.back)))[:6]:
            g0 = q.graph(rp, bp)
            if not nx.is_connected(g0):
                continue
            g = nx.Graph()
            for v in g0:
                g.add_node(v, type=t.types.get(v, "기타"))
            g.add_edges_from(g0.edges)
            vec.append({"nodes": {v: g.nodes[v]["type"] for v in g}, "edges": [list(e) for e in g.edges], "f": b.stats_profile(g)[0].tolist()})
    (RES.parents[1] / "test" / "fixtures").mkdir(exist_ok=True)
    (RES.parents[1] / "test" / "fixtures" / "syntax-stats.json").write_text(json.dumps(vec, ensure_ascii=False))
    print("\n".join(L))


if __name__ == "__main__":
    main()

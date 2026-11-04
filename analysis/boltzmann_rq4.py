"""RQ4 판정(사전 등록 설계 evidence/18 §2.3): 공간구문 목적마다 정확한 볼츠만 분포를 dev 절반 A에 맞추고, 다른 절반 B에서 비교한다.

모형: 사양 s마다 생성 평면 = (템플릿, 배치). P(평면 | s) ∝ exp(−Σ_j β_j·f_j(평면)).
  - 분배함수는 모든 배치(정렬 모드 + 복도, 안방 왼쪽 끝)를 열거해 정확히 구한다(근사 없음).
  - 그래프는 AlignedQubo.graph(정확 QUBO와 같은 그래프 = 실제 도면 맞닿음 그래프, 16,836/16,836 일치).
  - β는 dev A의 실제 평균 f_j에 모형 평균을 맞춘다(최대 엔트로피 = 지수족 최대우도의 적률 조건, Jaynes 1957).
    볼록 쌍대 L(β) = mean_s log Z_s(β) + β·μ_A 를 최소화. 실제 평균은 사양 구성(침실·욕실·드레스룸·다목적) 비율로 가중.
  - O0 = β 0(모든 평면 균등). β → ∞ = 동점 최적 전체(이전 실험).
통계량 f(작을수록 그 원리에 맞음, 실 수가 다른 실제 평면과 비교되도록 상대화):
  O1 거실 RRA · O2 현관 RRA · O3 −(침실 평균 깊이 − 거실·주방 평균 깊이, 현관 기준) · O6 −(현관·욕실 RRA ÷ 거실·주방·침실 RRA)
  O7 주방 RRA · O9 −거실 매개 중심성(정규화) · O2b 현관에서 거실 깊이(사전 등록 O2 정의의 둘째 부분 '현관–공용 공간 1단계', Seo 2007). 템플릿 안에서는 실 수가 고정이라 O1·O2·O7은 총깊이의 일차식, O3은 깊이 원-핫의 일차식(정확 QUBO와 같은 최적),
  O6(비율)·O9(경로)는 정확 QUBO 밖(열거로만).
비교 지표(①, 2026-11-04 door-vs-wall: 거실·침실의 현관 깊이는 벽/출입 그래프에서 같음, 고리도·d형·G1은 벽 그래프에서 부풀려져 뺌):
  M1 G2 그래프 거리 기댓값(WL 커널, 같은 침실 수의 실제 B 중 최근접) — 어느 목적에도 쓰지 않음, 같은 벽 그래프 규약 안의 비교
  M2 거실 현관 깊이 분포의 총변동 거리(TV), M3 침실 현관 깊이 분포 TV — 출입 그래프와 일치가 확인된 양
  (참고) M4 주방, M5 화장실 깊이 TV — 출입 그래프와 다를 수 있음(화장실 +0.5)
  순환: O2·O3는 깊이 계열이라 M2·M3의 평균을 맞춘 셈이 된다(분포 모양은 맞추지 않음) — 표에 * 표시.
불확실성: 사양(80개) 군집과 실제 B 그래프를 함께 다시 뽑는 부트스트랩. test 묶음은 쓰지 않는다.
사용: SPECS=rq4 uv run python boltzmann_rq4.py → ../evidence/results/boltzmann-rq4.md/json
"""

from __future__ import annotations

import itertools
import json
import math
import os
from collections import Counter
from concurrent.futures import ProcessPoolExecutor

import networkx as nx
import numpy as np
from scipy.optimize import minimize
from scipy.special import logsumexp
from sklearn.feature_extraction import DictVectorizer
from sklearn.preprocessing import normalize

from heldout_compare import beds, load_dev, wl
from real_vs_generated import RES
from syntax_qubo.aligned import AlignedQubo
from syntax_qubo.model import SUFFIX, load_templates

assert SUFFIX == "-rq4", "SPECS=rq4로 실행(사양 80개 묶음)"
STATS = ["O1", "O2", "O3", "O6", "O7", "O9", "O2b"]
MODELS = {
    "O0": [],
    "O1": ["O1"],
    "O2": ["O2"],
    "O3": ["O3"],
    "O6": ["O6"],
    "O7": ["O7"],
    "O9": ["O9"],
    "O2b": ["O2b"],
    "C13": ["O1", "O3"],
    "C2b3": ["O2b", "O3"],
    "C136": ["O1", "O3", "O6"],
}
NAMES = {
    "O0": "O0 기준선(모든 평면 균등)",
    "O1": "O1 거실 중심",
    "O2": "O2 얕은 깊이(현관)",
    "O3": "O3 공·사 위계",
    "O6": "O6 습식·서비스 주변화",
    "O7": "O7 대조: 주방 중심",
    "O9": "O9 공용실 경유",
    "O2b": "O2b 현관–거실 1단계(Seo 2007)",
    "C13": "C13 거실 중심 + 공·사 위계",
    "C2b3": "C2b3 현관–거실 1단계 + 공·사 위계",
    "C136": "C136 C13 + 습식 주변화",
}
TYPES = ["거실", "침실", "주방", "화장실"]
CIRC = {"O2": {"M2", "M3", "M4", "M5"}, "O3": {"M2", "M3"}, "C13": {"M2", "M3"}, "C136": {"M2", "M3"}, "O2b": {"M2"}, "C2b3": {"M2", "M3"}}
DMAX = 8
B = 1000


def rra(g, n, sp):
    k = g.number_of_nodes()
    md = sum(sp[n].values()) / (k - 1)
    D = 2 * (k * (math.log2((k + 2) / 3) - 1) + 1) / ((k - 1) * (k - 2))
    return (2 * (md - 1) / (k - 2)) / D


def stats_profile(g):
    """통계량 f(6개)와 실 유형별 현관 깊이 분포(그래프 하나 = 가중 1)."""
    t = nx.get_node_attributes(g, "type")
    sp = dict(nx.all_pairs_shortest_path_length(g))
    ent = next(n for n in g if t[n] == "현관")
    dep = sp[ent]
    of = lambda tp: [n for n in g if t[n] == tp]  # noqa: E731
    mean = lambda xs: float(np.mean(xs)) if xs else np.nan  # noqa: E731
    R = {n: rra(g, n, sp) for n in g}
    pub = of("거실") + of("주방")
    svc = of("현관") + of("화장실")
    high = of("거실") + of("주방") + of("침실")
    bc = nx.betweenness_centrality(g)
    f = [
        mean([R[n] for n in of("거실")]),
        R[ent],
        -(mean([dep[n] for n in of("침실")]) - mean([dep[n] for n in pub])),
        -(mean([R[n] for n in svc]) / mean([R[n] for n in high])),
        mean([R[n] for n in of("주방")]),
        -mean([bc[n] for n in of("거실")]),
        mean([dep[n] for n in of("거실")]),
    ]
    prof = np.zeros((len(TYPES), DMAX + 1))
    for i, tp in enumerate(TYPES):
        ns = of(tp)
        for n in ns:
            prof[i, min(dep[n], DMAX)] += 1 / len(ns)
    return np.array(f), prof


def comp_of_graph(g):
    c = Counter(nx.get_node_attributes(g, "type").values())
    return (c["침실"], min(c["화장실"], 2), c["드레스룸"] > 0, c["다목적공간"] > 0)


FRAME = os.environ.get("FRAME", "aligned")  # aligned = 현 정렬 틀, split = 뒤 띠를 거실 열에서 나누는 틀(split_frame.py)
OUT = "boltzmann-rq4" + ("-split" if FRAME == "split" else "") + (f"-convex{os.environ['REAL']}" if os.environ.get("REAL") in ("P1", "P2") else "")


def _graphs(t):
    if FRAME == "split":
        import split_frame as sf

        rest = [r for r in t.front if r != "master"]
        for rp in itertools.permutations(rest):
            for bp in itertools.permutations(t.back):
                for kL, c in sf.splits(len(rp), len(bp), rp.index("living")):
                    yield sf.graph(t, sf.rects(t, rp, bp, kL, c))
        return
    q = AlignedQubo(t)
    for rp in itertools.permutations(q.rest):
        for bp in itertools.permutations(t.back):
            g0 = q.graph(rp, bp)
            g = nx.Graph()
            for v in g0:
                g.add_node(v, type=t.types.get(v, "기타"))
            g.add_edges_from(g0.edges)
            yield g


def enum_template(ti):
    t = load_templates()[ti]
    out = []
    for g in _graphs(t):
        if not nx.is_connected(g):
            continue
        f, prof = stats_profile(g)
        out.append((f, prof, dict(wl(g)), beds(g)))
    return ti, int(t.id.split("/")[0]), out


def main():
    ts = load_templates()
    with ProcessPoolExecutor(16) as ex:
        res = [r for r in ex.map(enum_template, range(len(ts))) if r[2]]
    spec_ids = sorted({s for _, s, _ in res})
    arr_spec, F, P, W, BD = [], [], [], [], []
    for _, s, out in res:
        for f, prof, w, b in out:
            arr_spec.append(s)
            F.append(f)
            P.append(prof)
            W.append(w)
            BD.append(b)
    arr_spec, F, P, BD = np.array(arr_spec), np.array(F), np.array(P), np.array(BD)
    groups = [np.where(arr_spec == s)[0] for s in spec_ids]
    print("평면(배치) 수", len(F), "사양", len(spec_ids))

    # 실제 dev(서로 다른 그래프), heldout_compare와 같은 A/B 분할
    dev = load_dev()
    rng = np.random.default_rng(0)
    half = rng.random(len(dev)) < 0.5
    RF, RP = zip(*[stats_profile(g) for g in dev])
    RF, RP = np.array(RF), np.array(RP)
    rcomp = [comp_of_graph(g) for g in dev]
    rbed = np.array([beds(g) for g in dev])
    # 사양 구성 비율로 실제 가중(사양에 없는 구성은 0)
    specs = json.loads(RES.joinpath("rq4-specs.json").read_text())["specs"]
    sc = Counter((s["bedrooms"], s["baths"], s["dress"], s["multi"]) for s in specs)

    def comp_w(mask):
        cnt = Counter(c for c, m in zip(rcomp, mask) if m)
        w = np.array([(sc[c] / len(specs)) / cnt[c] if m and c in sc else 0.0 for c, m in zip(rcomp, mask)])
        return w / w.sum()

    wA, wB = comp_w(half), comp_w(~half)
    # 표준화(조건수): 실제 A의 가중 표준편차
    mA = np.array([np.nansum(wA * np.nan_to_num(RF[:, j])) for j in range(len(STATS))])
    sd = np.array([math.sqrt(np.nansum(wA * (np.nan_to_num(RF[:, j]) - mA[j]) ** 2)) for j in range(len(STATS))])
    Fz = (F - mA) / sd
    muA = np.zeros(len(STATS))  # 표준화 후 실제 A 평균 = 0

    def probs(beta, idx):
        if not idx:
            return [np.full(len(g), 1 / len(g)) for g in groups]
        out = []
        for g in groups:
            e = -Fz[g][:, idx] @ beta
            out.append(np.exp(e - logsumexp(e)))
        return out

    def fit(idx):
        if not idx:
            return np.zeros(0), True, np.zeros(0)

        def L(beta):
            val, grad = 0.0, np.zeros(len(idx))
            for g in groups:
                e = -Fz[g][:, idx] @ beta
                lz = logsumexp(e)
                p = np.exp(e - lz)
                val += lz
                grad -= p @ Fz[g][:, idx]
            val, grad = val / len(groups), grad / len(groups)
            return val + beta @ muA[idx], grad + muA[idx]

        r = minimize(L, np.zeros(len(idx)), jac=True, method="L-BFGS-B", bounds=[(-50, 50)] * len(idx))
        ps = probs(r.x, idx)
        model_mean = np.mean([p @ Fz[g][:, idx] for p, g in zip(ps, groups)], axis=0)
        ok = bool(np.all(np.abs(r.x) < 49.9)) and np.allclose(model_mean, muA[idx], atol=1e-3)
        return r.x, ok, model_mean

    # 생성 평면마다 실제 B 최근접 거리(같은 침실 수)
    dv = DictVectorizer()
    Xdev = normalize(dv.fit_transform([wl(g) for g in dev]))
    X = normalize(dv.transform(W))
    nnB = np.full(len(F), np.nan)
    nnA_ref = []
    for b in np.unique(BD):
        sel = np.where(BD == b)[0]
        pool = np.where(~half & (rbed == b))[0]
        if len(pool):
            nnB[sel] = 1 - (X[sel] @ Xdev[pool].T).toarray().max(1)
    for b in np.unique(rbed):
        a = np.where(half & (rbed == b))[0]
        pool = np.where(~half & (rbed == b))[0]
        if len(a) and len(pool):
            nnA_ref += list(zip(a, 1 - (Xdev[a] @ Xdev[pool].T).toarray().max(1)))
    ref_nn = float(np.average([d for _, d in nnA_ref], weights=[wA[i] for i, _ in nnA_ref]))
    hist = lambda w, prof: np.tensordot(w, prof, axes=1)  # noqa: E731
    realB = hist(wB, RP)
    realA = hist(wA, RP)
    tv = lambda a, b: 0.5 * np.abs(a - b).sum(-1)  # noqa: E731
    ref_tv = tv(realA, realB)

    def metrics(ps, spec_sel, wreal):
        nn = np.mean([ps[s] @ nnB[groups[s]] for s in spec_sel])
        gen = np.mean([np.tensordot(ps[s], P[groups[s]], axes=1) for s in spec_sel], axis=0)
        d = tv(gen, hist(wreal, RP))
        return {"M1": float(nn), "M2": float(d[0]), "M3": float(d[1]), "M4": float(d[2]), "M5": float(d[3])}

    fits, point, PS = {}, {}, {}
    for m, sts in MODELS.items():
        idx = [STATS.index(x) for x in sts]
        beta, ok, mm = fit(idx)
        ps = probs(beta, idx)
        PS[m] = ps
        fits[m] = {"beta": beta.tolist(), "ok": ok, "stats": sts}
        point[m] = metrics(ps, range(len(groups)), wB)
        # 최적 몰림 정도: 사양마다 최고 확률 평면의 확률 중앙값, 유효 평면 수(지수 엔트로피)
        fits[m]["eff_n"] = float(np.median([np.exp(-(p * np.log(p + 1e-300)).sum()) for p in ps]))
        fits[m]["n_arr"] = float(np.median([len(g) for g in groups]))

    # 부트스트랩: 사양 군집 + 실제 B 그래프
    brng = np.random.default_rng(1)
    Bi = np.where(~half)[0]
    boot = {m: {k: [] for k in point[m]} for m in MODELS}
    for _ in range(B):
        ss = brng.choice(len(groups), len(groups), replace=True)
        rb = brng.choice(Bi, len(Bi), replace=True)
        cnt = np.bincount(rb, minlength=len(dev)).astype(float)
        w = wB * cnt
        w = w / w.sum()
        for m in MODELS:
            for k, v in metrics(PS[m], ss, w).items():
                boot[m][k].append(v)
    boot = {m: {k: np.array(v) for k, v in d.items()} for m, d in boot.items()}
    ci = lambda a: (float(np.quantile(a, 0.025)), float(np.quantile(a, 0.975)))  # noqa: E731

    # β 강건성 곡선(단일 목적): β* 배수
    mults = [0, 0.25, 0.5, 1, 2, 4]
    curve = {}
    for m in ["O1", "O2", "O3", "O6", "O7", "O9", "O2b", "C13", "C2b3"]:
        idx = [STATS.index(x) for x in MODELS[m]]
        b = np.array(fits[m]["beta"])
        curve[m] = {str(c): metrics(probs(b * c, idx), range(len(groups)), wB) for c in mults}

    # ---- 보고 ----
    L = ["# RQ4: 정확 볼츠만 분포(dev A에 맞춤) 대 실제 dev B" + (" — 뒤 띠 분할 틀(split_frame.py)" if FRAME == "split" else "") + (f" — 실제 거실 볼록 분할 {os.environ['REAL']}(convex-living.mjs)" if os.environ.get("REAL") in ("P1", "P2") else "") + "\n"]
    L.append(f"> `SPECS=rq4 uv run python boltzmann_rq4.py` · 사양 {len(groups)}개 · 평면(배치) {len(F):,}개 전부 열거 · 실제 dev 서로 다른 그래프 {len(dev):,}개(A {int(half.sum())} / B {int((~half).sum())}, 사양 구성 비율로 가중) · 부트스트랩 {B:,}회(사양 군집 + 실제 B) · test 미사용\n")
    L.append("## 1. 맞춘 β (표준화 통계량 단위, 양수 = 실제가 균등 배치보다 그 원리 쪽)\n")
    L.append("| 모형 | 통계량 | β | 적률 일치 | 사양당 유효 평면 수 (전체 중앙값) |")
    L.append("|---|---|---|---|---|")
    for m in MODELS:
        fz = fits[m]
        L.append(f"| {NAMES[m]} | {', '.join(fz['stats']) or '—'} | {', '.join(f'{x:+.2f}' for x in fz['beta']) or '0'} | {'예' if fz['ok'] else '**아니오(경계)**'} | {fz['eff_n']:.0f} / {fz['n_arr']:.0f} |")
    L.append("\n'아니오(경계)' = 실제 A 평균이 이 틀로 만들 수 있는 범위 밖이라 β가 한계(±50)에 닿음.\n")
    L.append("| 통계량 | 실제 A 평균 | 틀의 최선(사양별 최소의 평균) | 틀 균등 평균 | 틀의 최악 |")
    L.append("|---|---|---|---|---|")
    for j, n in enumerate(STATS):
        lo = np.mean([F[g][:, j].min() for g in groups])
        hi = np.mean([F[g][:, j].max() for g in groups])
        un = np.mean([F[g][:, j].mean() for g in groups])
        L.append(f"| {n} | {mA[j]:.3f} | {lo:.3f} | {un:.3f} | {hi:.3f} |")
    L.append("\n## 2. 실제 dev B와의 거리: 점추정 [95% 부트스트랩 구간] (모두 작을수록 실제에 가까움)\n")
    L.append("M1 = G2 그래프 거리 기댓값 · M2 거실 현관 깊이 TV · M3 침실 현관 깊이 TV · (참고) M4 주방 · M5 화장실 깊이 TV. `*` = 그 모형이 평균을 맞춘 양과 같은 계열(순환).\n")
    L.append("| 모형 | M1 | M2 | M3 | M4 (참고) | M5 (참고) |")
    L.append("|---|---|---|---|---|---|")
    L.append(f"| 실제 A ↔ B (기준) | {ref_nn:.3f} | {ref_tv[0]:.3f} | {ref_tv[1]:.3f} | {ref_tv[2]:.3f} | {ref_tv[3]:.3f} |")
    for m in MODELS:
        cells = []
        for k in ["M1", "M2", "M3", "M4", "M5"]:
            lo, hi = ci(boot[m][k])
            cells.append(f"{point[m][k]:.3f} [{lo:.3f}, {hi:.3f}]{'*' if k in CIRC.get(m, set()) else ''}")
        L.append(f"| {NAMES[m]} | " + " | ".join(cells) + " |")
    L.append("\n## 3. 짝지은 차이: 모형 − O0 [95% 구간] (✱ = 0을 포함하지 않음, 음수 = O0보다 실제에 가까움)\n")
    L.append("| 모형 | ΔM1 | ΔM2 | ΔM3 |")
    L.append("|---|---|---|---|")
    diff = {}
    for m in MODELS:
        if m == "O0":
            continue
        diff[m] = {}
        cells = []
        for k in ["M1", "M2", "M3"]:
            lo, hi = ci(boot[m][k] - boot["O0"][k])
            diff[m][k] = (lo, hi)
            cells.append(f"[{lo:+.3f}, {hi:+.3f}]{' ✱' if lo > 0 or hi < 0 else ''}{'*' if k in CIRC.get(m, set()) else ''}")
        L.append(f"| {NAMES[m]} | " + " | ".join(cells) + " |")
    L.append("\n## 4. β 강건성: β*의 배수에 따른 M1 / M2 / M3 (0 = O0, 1 = 맞춘 값)\n")
    L.append("| 모형 | " + " | ".join(f"×{c}" for c in mults) + " |")
    L.append("|---|" + "---|" * len(mults))
    for m, d in curve.items():
        L.append(f"| {NAMES[m]} | " + " | ".join(f"{d[str(c)]['M1']:.3f} / {d[str(c)]['M2']:.2f} / {d[str(c)]['M3']:.2f}" for c in mults) + " |")
    L.append("\n## 읽는 법과 한계\n")
    L.append("- β는 결과를 보고 고른 값이 아니라 dev A의 실제 평균에 맞춘 값이다(사전 등록 설계 evidence/18 §2.3). 판정은 B에서, 최종은 test 1회.")
    L.append("- 모든 그래프는 벽 인접 그래프다. M2·M3는 출입 그래프와 같음이 확인된 양(door-vs-wall, dev 10세대)이고, M1은 같은 규약 안의 비교, M4·M5는 참고.")
    L.append("- 생성 쪽은 판상형 정렬 모드 틀 안의 평면뿐이다. 실제와의 남은 거리(기준선 대비)는 틀이 설명하지 못하는 부분을 포함한다.")
    L.append("- 실제 쪽은 같은 그래프를 하나로 묶은 서로 다른 그래프 집합이다(빈도 정보는 쓰지 않음).")
    RES.joinpath(f"{OUT}.md").write_text("\n".join(L) + "\n")
    RES.joinpath(f"{OUT}.json").write_text(json.dumps({"fits": fits, "point": point, "diff": diff, "curve": curve, "ref": {"nn": ref_nn, "tv": ref_tv.tolist()}, "ci": {m: {k: ci(v) for k, v in d.items()} for m, d in boot.items()}}, ensure_ascii=False, indent=1))
    print("\n".join(L))


if __name__ == "__main__":
    os.environ.setdefault("OMP_NUM_THREADS", "2")
    main()

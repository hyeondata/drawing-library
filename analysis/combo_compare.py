"""RQ4: 조합 목적(O1 거실 중심 + O3 공·사 위계 등)의 가중치를 dev 절반에서 고르고, 나머지 절반에서 부트스트랩 신뢰구간으로 판정한다.

- 실제 dev 서로 다른 그래프를 반으로 나눈다(heldout_compare와 같은 시드): A = 가중치·목적 선택, B = 평가. test는 쓰지 않는다.
- 선택 기준(A): 목적과 분리된 G2 최근접 그래프 거리, |G3 H* δ|, |G3 기저 DF δ| 세 지표의 평균 순위. G1은 깊이 계열에 순환이라 선택에서 뺀다.
- 평가(B): 사양 단위 군집 부트스트랩 2,000회. 같은 사양 표본을 모든 목적에 써서 목적 간 차이를 짝지어 본다.
  사양 안의 도면들(템플릿·동점 배치)은 서로 독립이 아니므로 도면 단위가 아니라 사양 단위로 다시 뽑는다.
사용: uv run python combo_compare.py → ../evidence/results/combo-compare.md/json
"""

from __future__ import annotations

import json
import os
from collections import Counter

import numpy as np
from sklearn.feature_extraction import DictVectorizer
from sklearn.preprocessing import normalize

from heldout_compare import beds, clean, load_dev, sig, wl
from objective_compare import OBJ
from real_vs_generated import RES
from rq1_syntax import measures

B = 2000

SUFFIX = "-rq4" if os.environ.get("SPECS") == "rq4" else ""  # 사양 묶음(scripts/lib/rq4-specs.mjs)


def cliffs_fast(a, b_sorted):
    a = a[~np.isnan(a)]
    if not len(a):
        return np.nan
    m = len(b_sorted)
    lt_b = np.searchsorted(b_sorted, a, "left")  # b < a
    gt_b = m - np.searchsorted(b_sorted, a, "right")  # b > a
    return float((lt_b.sum() - gt_b.sum()) / (len(a) * m))


def main():
    dev = load_dev()
    rng = np.random.default_rng(0)
    half = rng.random(len(dev)) < 0.5
    pools = {"A": half, "B": ~half}
    dv = DictVectorizer()
    Xdev = normalize(dv.fit_transform([wl(g) for g in dev]))
    bdev = np.array([beds(g) for g in dev])
    mdev = [measures(g) for g in dev]
    Hd = np.array([m["Hstar"] for m in mdev])
    Bd = np.array([m["BDF"] for m in mdev])
    sigs = {k: Counter(sig(g) for g, h in zip(dev, m) if h) for k, m in pools.items()}

    plans = []
    for line in (RES / f"objective-plans{SUFFIX}.jsonl").read_text().splitlines():
        o = json.loads(line)
        f = o.get("features") or {}
        g = clean(f["graph"]) if f.get("graph") else None
        if g is None or o["obj"] not in OBJ:
            continue
        plans.append((o["obj"], int(str(o["t"]).split("/")[0]), g))
    X = normalize(dv.transform([wl(g) for _, _, g in plans]))
    S = (X @ Xdev.T).toarray()
    pb = np.array([beds(g) for _, _, g in plans])
    rows = {"obj": np.array([p[0] for p in plans]), "spec": np.array([p[1] for p in plans])}
    ms = [measures(g) for _, _, g in plans]
    rows["H"] = np.array([m["Hstar"] for m in ms], float)
    rows["BDF"] = np.array([m["BDF"] for m in ms], float)
    for k, m in pools.items():
        nn = np.full(len(plans), np.nan)
        for b in np.unique(pb):
            sel = pb == b
            mask = m & (bdev == b)
            if mask.any():
                nn[sel] = 1 - S[np.ix_(sel, mask)].max(1)
        rows[f"nn{k}"] = nn
        rows[f"cov{k}"] = np.array([sig(g) in sigs[k] for _, _, g in plans], float)
    ref = {k: (np.sort(Hd[m][~np.isnan(Hd[m])]), np.sort(Bd[m][~np.isnan(Bd[m])])) for k, m in pools.items()}

    def metrics(idx, k):
        h, bd = ref[k]
        return {
            "cov": float(np.mean(rows[f"cov{k}"][idx])),
            "nn": float(np.nanmedian(rows[f"nn{k}"][idx])),
            "dH": cliffs_fast(rows["H"][idx], h),
            "dB": cliffs_fast(rows["BDF"][idx], bd),
        }

    objs = [o for o in OBJ if (rows["obj"] == o).any()]
    by = {o: np.where(rows["obj"] == o)[0] for o in objs}
    # 1) 선택(A)
    selA = {o: metrics(by[o], "A") for o in objs}
    crit = {o: (selA[o]["nn"], abs(selA[o]["dH"]), abs(selA[o]["dB"])) for o in objs}
    ranks = np.mean([np.argsort(np.argsort([crit[o][j] for o in objs])) + 1 for j in range(3)], axis=0)
    rankA = dict(zip(objs, ranks.tolist()))
    best = min(objs, key=lambda o: rankA[o])
    # 2) 평가(B) + 사양 군집 부트스트랩
    point = {o: metrics(by[o], "B") for o in objs}
    specs = np.unique(rows["spec"])
    spec_idx = {o: {s: by[o][rows["spec"][by[o]] == s] for s in specs} for o in objs}
    brng = np.random.default_rng(1)
    boot = {o: {m: [] for m in ("cov", "nn", "dH", "dB")} for o in objs}
    for _ in range(B):
        draw = brng.choice(specs, len(specs), replace=True)
        for o in objs:
            idx = np.concatenate([spec_idx[o][s] for s in draw])
            if not len(idx):
                continue
            for m, v in metrics(idx, "B").items():
                boot[o][m].append(v)
    boot = {o: {m: np.array(v) for m, v in d.items()} for o, d in boot.items()}
    ci = lambda a: (float(np.nanquantile(a, 0.025)), float(np.nanquantile(a, 0.975)))  # noqa: E731
    # 짝지은 차이: 각 목적 − O0(무작위), 각 목적 − best. 부트스트랩 반복 길이가 같아야 짝지음이 성립한다.
    def diff(o, base, m, absval=False):
        a, b = boot[o][m], boot[base][m]
        if absval:
            a, b = np.abs(a), np.abs(b)
        return ci(a - b)

    L = ["# RQ4: 조합 목적 — dev 절반(A)에서 선택, 다른 절반(B)에서 부트스트랩 판정\n"]
    L.append(f"> `uv run python combo_compare.py` · 실제 dev 서로 다른 그래프 {len(dev):,}개(A {int(half.sum()):,} / B {int((~half).sum()):,}) · 사양 {len(specs)}개 군집 부트스트랩 {B:,}회 · test 미사용\n")
    L.append("## 1. 선택(A): G2 거리, |H* δ|, |기저 DF δ|의 평균 순위 (G1은 순환이라 제외)\n")
    L.append("| 목적 | G2 거리 | H* δ | 기저 DF δ | 평균 순위 |")
    L.append("|---|---|---|---|---|")
    for o in sorted(objs, key=lambda o: rankA[o]):
        a = selA[o]
        L.append(f"| {OBJ[o]} | {a['nn']:.3f} | {a['dH']:+.2f} | {a['dB']:+.2f} | {rankA[o]:.1f}{' **← 선택**' if o == best else ''} |")
    L.append(f"\n## 2. 평가(B): 점추정 [95% 부트스트랩 구간]\n")
    L.append("| 목적 | n | G1 포함률 | G2 거리 | H* δ | 기저 DF δ |")
    L.append("|---|---|---|---|---|---|")
    for o in objs:
        p, b = point[o], boot[o]
        f = lambda m, fmt: f"{format(p[m], fmt)} [{format(ci(b[m])[0], fmt)}, {format(ci(b[m])[1], fmt)}]"  # noqa: E731
        L.append(f"| {OBJ[o]} | {len(by[o])} | {f('cov', '.1%')} | {f('nn', '.3f')} | {f('dH', '+.2f')} | {f('dB', '+.2f')} |")
    L.append(f"\n## 3. 짝지은 차이(B) [95% 구간] — 구간이 0을 넘지 않으면 차이가 있다고 본다\n")
    L.append(f"G2·|δ|는 작을수록, G1은 클수록 실제에 가깝다. 비교 기준: O0 무작위 배치, 그리고 A에서 고른 {OBJ[best]}.\n")
    L.append("| 목적 | ΔG1 vs O0 | ΔG2 vs O0 | Δ\\|H*δ\\| vs O0 | Δ\\|DFδ\\| vs O0 | ΔG2 vs 선택 | Δ\\|H*δ\\| vs 선택 | Δ\\|DFδ\\| vs 선택 |")
    L.append("|---|---|---|---|---|---|---|---|")
    fmt = lambda t, f=".3f": f"[{format(t[0], f)}, {format(t[1], f)}]{' ✱' if t[0] > 0 or t[1] < 0 else ''}"  # noqa: E731
    out = {"best": best, "rankA": rankA, "selA": selA, "pointB": point, "ci": {}, "diff": {}}
    for o in objs:
        out["ci"][o] = {m: ci(boot[o][m]) for m in boot[o]}
        d = {
            "cov_O0": diff(o, "O0", "cov"), "nn_O0": diff(o, "O0", "nn"), "dH_O0": diff(o, "O0", "dH", True), "dB_O0": diff(o, "O0", "dB", True),
            "nn_best": diff(o, best, "nn"), "dH_best": diff(o, best, "dH", True), "dB_best": diff(o, best, "dB", True),
        }
        out["diff"][o] = d
        L.append(f"| {OBJ[o]} | {fmt(d['cov_O0'], '+.1%')} | {fmt(d['nn_O0'])} | {fmt(d['dH_O0'], '+.2f')} | {fmt(d['dB_O0'], '+.2f')} | {fmt(d['nn_best'])} | {fmt(d['dH_best'], '+.2f')} | {fmt(d['dB_best'], '+.2f')} |")
    L.append("\n✱ = 95% 구간이 0을 포함하지 않음.")
    L.append("\n- 조합 가중치는 템플릿 안 최소–최대 정규화 뒤의 가중치다(objective_orders.py). 템플릿별 상수 배율이라 QUBO의 선형 결합으로 그대로 옮겨진다.")
    L.append(f"- 모든 지표가 벽 인접 그래프다. 사양 {len(specs)}개 군집 부트스트랩이다. G2는 거리값이 이산적이라 중앙값 구간이 한쪽으로 치우칠 수 있다.")
    RES.joinpath(f"combo-compare{SUFFIX}.md").write_text("\n".join(L) + "\n")
    RES.joinpath(f"combo-compare{SUFFIX}.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print("\n".join(L))


if __name__ == "__main__":
    main()

"""QUBO 항 근거의 통계 보강: 전체 AI 허브 APT_FP_SPA 7,275장(현관 하나 = 세대 하나).

입력
  - <aihub-full>/derived/real-units.jsonl : scripts/term-evidence.mjs가 내보낸 세대별 측정값
    (관계 측정은 생성 평면과 같은 JS 함수 relations()로 했으므로 정의가 같다)
  - evidence/results/term-evidence.json        : 7,275장 기준 결과(같은 스크립트)
  - evidence/results/term-evidence-sample35.json: 이전 샘플 35세대 결과(비교용)
출력
  - evidence/results/term-evidence-stats.md, .json

무엇을 왜 하는가
  1. 판정 비교(35세대 → 19,196세대): 표본을 늘렸을 때 항 방향 판정이 유지되는지 확인한다.
  2. 실제 도면에서 관계 ↔ 공간구문 지표 연관: 지금까지 "관계가 지표를 어느 쪽으로 움직이는가"는
     생성 평면에서만 쟀다. 실제 도면에서도 같은 방향인지 확인해야 생성 평면 효과가 문법의 산물이 아님을 보일 수 있다.
     - OLS: 지표 ~ 관계 + C(침실 수) + log(축척 보정 면적). 세대 규모가 관계와 지표를 함께 움직이는 교란을 통제한다.
     - 표준오차: 도면 단위 군집 강건(같은 도면 = 같은 단지·동의 세대는 서로 닮아 독립이 아님).
     - 다중 비교: 항 × 지표 검정 전체에 Holm 보정.
  3. 실제 연관 부호와 생성 평면 효과 부호의 일치 여부를 표로 낸다.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.stats.multitest import multipletests

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "evidence" / "results"
_args = [a for a in sys.argv[1:] if not a.startswith("--")]
DATA = Path(_args[0]) if _args else ROOT.parent / "aihub-full" / "derived" / "real-units.jsonl"

SX = ["livingBedroomRatio", "kitchenBedroomRatio", "genotypeTau", "privacyDepthGap"]
SX_LABEL = {"livingBedroomRatio": "거실/침실 통합도 비", "kitchenBedroomRatio": "주방/침실 통합도 비", "genotypeTau": "유전형 τ", "privacyDepthGap": "사생활 깊이 차"}


def load_units(path: Path) -> pd.DataFrame:
    rows = [json.loads(line) for line in path.read_text(encoding="utf8").splitlines() if line.strip()]
    df = pd.json_normalize(rows, sep=".")
    df.columns = [c.replace("rel.", "r_").replace("sx.", "y_") for c in df.columns]
    return df


def verdict_kind(v: str) -> str:
    if "보상" in v:
        return "보상"
    if "벌점" in v:
        return "벌점"
    if v.startswith("생성 문법"):
        return "문법 강제"
    return v


def compare_verdicts(full: dict, small: dict) -> list[dict]:
    """두 결과 JSON의 항별 실제 빈도와 방향을 나란히 둔다. 방향은 term-evidence.mjs의 verdict 규칙을 그대로 재현한다."""

    def verdict(r: dict) -> str:
        if not r.get("real"):
            return "측정 불가"
        R, G = r["real"], r["gen"]
        if r["key"] == "livingOffCenter":
            lo, hi = R.get("lo"), R.get("hi")
            if lo is not None and hi is not None and lo <= G["mean"] <= hi:
                return "차이 불확실"
            d = R["mean"] - G["mean"]
            return "차이 작음" if abs(d) < 0.03 else ("벌점" if d < 0 else "보상")
        if R["n"] < 5:
            return "표본 부족"
        if G["p"] >= 0.95 or G["p"] <= 0.05:
            return "문법 강제"
        if R["lo"] <= G["p"] <= R["hi"]:
            return "차이 불확실"
        prefer = R["p"] > G["p"]
        on = prefer if r["sign"] > 0 else not prefer
        return "보상" if on else "벌점"

    s_by = {r["id"]: r for r in small["rows"]}
    out = []
    for r in full["rows"]:
        s = s_by.get(r["id"], {})
        val = (lambda x: None if not x.get("real") else (x["real"].get("p") if x["key"] != "livingOffCenter" else x["real"]["mean"]))
        out.append({
            "id": r["id"], "label": r["label"],
            "small_real": val(s) if s else None, "small_n": s.get("real", {}).get("n") if s.get("real") else None, "small_verdict": verdict(s) if s else "—",
            "full_real": val(r), "full_n": r["real"]["n"] if r.get("real") else None, "full_verdict": verdict(r),
            "gen": None if not r.get("gen") else (r["gen"].get("p") if r["key"] != "livingOffCenter" else r["gen"]["mean"]),
            "hand": r["hand"], "cal": r["cal"], "sx_gen": r.get("sx"), "key": r.get("key"),
        })
    return out


def _prep(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["logArea"] = np.log(df["areaPx"].clip(lower=1))
    df["beds"] = df["bedrooms"].clip(upper=5).astype(int).astype(str)  # 5개 이상은 한 범주
    df["gid"] = pd.factorize(df["drawing"])[0]
    return df


def real_associations_fast(df: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    """real_associations와 같은 모형을 수식 해석(patsy) 없이 numpy 설계행렬로 직접 푼다.
    patsy가 회귀 72번에서 대부분의 시간을 썼다(프로파일 3.6초 중 대부분). 결과는 --check로 원래 구현과 대조한다."""
    df = _prep(df)
    bed_levels = sorted(df["beds"].unique())
    res = []
    for key in keys:
        col = f"r_{key}"
        if col not in df:
            continue
        for y in SX:
            ycol = f"y_{y}"
            m = df[col].notna().to_numpy() & df[ycol].notna().to_numpy()
            d = df.loc[m]
            if key == "livingOffCenter":
                x = d[col].to_numpy(float) * 10  # 0.1 단위당 효과
            else:
                x = d[col].astype(bool).to_numpy(float)
                if x.min() == x.max() or min(x.sum(), (1 - x).sum()) < 30:
                    res.append({"key": key, "y": y, "n": int(len(d)), "coef": math.nan, "lo": math.nan, "hi": math.nan, "p": math.nan, "note": "한쪽 집단 30 미만"})
                    continue
            beds = d["beds"].to_numpy()
            present = [b for b in bed_levels if (beds == b).any()]
            # 수식 "Y ~ x + logArea + C(beds)"와 같은 열 구성: 절편, 첫 범주를 뺀 침실 수 더미, x, logArea
            cols = [np.ones(len(d))] + [(beds == b).astype(float) for b in present[1:]] + [x, d["logArea"].to_numpy()]
            X = np.column_stack(cols)
            xi = len(present)  # x 열 위치
            fit = sm.OLS(d[ycol].to_numpy(float), X).fit(cov_type="cluster", cov_kwds={"groups": d["gid"].to_numpy()})
            lo, hi = fit.conf_int()[xi]
            res.append({"key": key, "y": y, "n": int(len(d)), "drawings": int(d["gid"].nunique()), "coef": float(fit.params[xi]), "lo": float(lo), "hi": float(hi), "p": float(fit.pvalues[xi]), "note": ""})
    out = pd.DataFrame(res)
    ok = out["p"].notna()
    out.loc[ok, "p_holm"] = multipletests(out.loc[ok, "p"], method="holm")[1]
    return out


def _boot_one(args):
    """관계 하나의 군집 부트스트랩. 도면 번호를 batch × C 정수 행렬로 뽑아 도면별 합·개수를 모아 비율을 낸다(gather + 행 합)."""
    key, s, n, B, seed, batch = args
    rng = np.random.default_rng(seed)
    C = len(s)
    est = np.empty(B)
    for b0 in range(0, B, batch):
        m = min(batch, B - b0)
        idx = rng.integers(0, C, size=(m, C), dtype=np.int32)
        est[b0:b0 + m] = s[idx].sum(axis=1) / n[idx].sum(axis=1)
    lo, hi = np.quantile(est, [0.025, 0.975])
    return key, float(lo), float(hi)


def cluster_bootstrap(df: pd.DataFrame, keys: list[str], B: int = 10_000, seed: int = 20261103, batch: int = 500, workers: int | None = None) -> pd.DataFrame:
    """실제 빈도(관계 비율, 거실 중앙 거리 평균)의 도면 단위 군집 부트스트랩 95% 구간.
    관계마다 그 관계를 잴 수 있는 도면만 모집단으로 삼는다(JS 구현과 같은 정의).
    관계 18개를 프로세스로 나눠 동시에 돌린다. 관계마다 씨앗을 따로 둬 실행 순서와 무관하게 결과가 같다."""
    from concurrent.futures import ProcessPoolExecutor
    import os

    jobs, meta = [], {}
    for i, key in enumerate(keys):
        col = f"r_{key}"
        if col not in df:
            continue
        d = df[df[col].notna()]
        v = d[col].astype(float).to_numpy()
        g = pd.factorize(d["drawing"])[0]
        C = int(g.max() + 1)
        jobs.append((key, np.bincount(g, weights=v, minlength=C), np.bincount(g, minlength=C).astype(float), B, seed + i, batch))
        meta[key] = {"n": int(len(v)), "drawings": C, "est": float(v.mean())}
    workers = workers or min(len(jobs), max(1, (os.cpu_count() or 2) // 2))
    with ProcessPoolExecutor(max_workers=workers) as ex:
        res = list(ex.map(_boot_one, jobs))
    return pd.DataFrame([{"key": k, **meta[k], "lo": lo, "hi": hi} for k, lo, hi in res])


def real_associations(df: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    """원래 구현(statsmodels 수식). --check에서 빠른 구현의 기준값으로만 쓴다."""
    df = df.copy()
    df["logArea"] = np.log(df["areaPx"].clip(lower=1))
    df["beds"] = df["bedrooms"].clip(upper=5).astype(int).astype(str)  # 5개 이상은 한 범주
    res = []
    for key in keys:
        col = f"r_{key}"
        if col not in df:
            continue
        for y in SX:
            ycol = f"y_{y}"
            d = df[[col, ycol, "beds", "logArea", "drawing"]].dropna()
            if key == "livingOffCenter":
                d = d.assign(x=d[col].astype(float) * 10)  # 0.1 단위당 효과
            else:
                d = d.assign(x=d[col].astype(bool).astype(float))
                if d["x"].nunique() < 2 or min(d["x"].sum(), (1 - d["x"]).sum()) < 30:
                    res.append({"key": key, "y": y, "n": len(d), "coef": math.nan, "lo": math.nan, "hi": math.nan, "p": math.nan, "note": "한쪽 집단 30 미만"})
                    continue
            d = d.rename(columns={ycol: "Y"})
            # 침실 수 범주가 하나뿐이면 C(beds)를 뺀다
            formula = "Y ~ x + logArea" + (" + C(beds)" if d["beds"].nunique() > 1 else "")
            groups = pd.factorize(d["drawing"])[0]
            fit = smf.ols(formula, data=d).fit(cov_type="cluster", cov_kwds={"groups": groups})
            lo, hi = fit.conf_int().loc["x"]
            res.append({"key": key, "y": y, "n": int(len(d)), "drawings": int(d["drawing"].nunique()), "coef": float(fit.params["x"]), "lo": float(lo), "hi": float(hi), "p": float(fit.pvalues["x"]), "note": ""})
    out = pd.DataFrame(res)
    ok = out["p"].notna()
    out.loc[ok, "p_holm"] = multipletests(out.loc[ok, "p"], method="holm")[1]
    return out


def main() -> None:
    full = json.loads((RES / "term-evidence.json").read_text(encoding="utf8"))
    small = json.loads((RES / "term-evidence-sample35.json").read_text(encoding="utf8"))
    import time

    T = {}
    t = time.perf_counter()
    df = load_units(DATA)
    T["load"] = time.perf_counter() - t
    cmp_rows = compare_verdicts(full, small)
    keys = sorted({r["key"] for r in cmp_rows if r["key"]})
    t = time.perf_counter()
    assoc = real_associations_fast(df, keys)
    T["ols"] = time.perf_counter() - t
    t = time.perf_counter()
    boot = cluster_bootstrap(df, keys)
    T["boot"] = time.perf_counter() - t
    if "--check" in sys.argv:
        t = time.perf_counter()
        ref = real_associations(df, keys)
        T["ols_formula"] = time.perf_counter() - t
        a, r = assoc.dropna(subset=["coef"]), ref.dropna(subset=["coef"])
        diff = max(float(np.max(np.abs(a[c].to_numpy() - r[c].to_numpy()))) for c in ["coef", "lo", "hi", "p", "p_holm"])
        print(f"check: 빠른 OLS vs 수식 OLS 최대 차이 {diff:.2e}")
        assert diff < 1e-9, diff
    js_ci = {r["key"]: r.get("real") for r in full["rows"] if r.get("key")}

    f2 = lambda x, d=2: "—" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:+.{d}f}"
    pc = lambda x: "—" if x is None else f"{100 * x:.1f}%"

    def realcell(r, side):
        v, n = r[f"{side}_real"], r[f"{side}_n"]
        if v is None:
            return "—"
        return (f"평균 {v:.2f}" if r["key"] == "livingOffCenter" else pc(v)) + f" (n={n:,})"

    def wsign(v, w):
        if v == "보상":
            return "일치" if w < 0 else ("**반대**" if w > 0 else "0")
        if v == "벌점":
            return "일치" if w > 0 else ("**반대**" if w < 0 else "0")
        return "—"

    lines = []
    lines.append("# QUBO 항 근거 통계 보강 (AI 허브 APT_FP_SPA 7,275장)\n")
    lines.append(f"> `uv run python term_evidence_stats.py` (analysis/) · 입력 `{DATA.name}` {len(df):,}세대 / 도면 {df['drawing'].nunique():,}장 · 현관 하나 = 세대 하나, 거실 있는 세대만\n")
    lines.append("## 1. 표본 확대 전후 판정 비교 (샘플 35세대 → 전체)\n")
    lines.append("| 항 | 샘플 실제 | 샘플 판정 | 전체 실제 | 전체 판정 | 생성 우연 | 판정 유지 | 손 · 보정 부호 (전체 기준) |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for r in cmp_rows:
        same = "—" if r["full_verdict"] in ("측정 불가",) else ("유지" if r["small_verdict"] == r["full_verdict"] else "**바뀜**")
        g = "—" if r["gen"] is None else (f"평균 {r['gen']:.2f}" if r["key"] == "livingOffCenter" else pc(r["gen"]))
        lines.append(f"| `{r['id']}` {r['label']} | {realcell(r, 'small')} | {r['small_verdict']} | {realcell(r, 'full')} | {r['full_verdict']} | {g} | {same} | {wsign(r['full_verdict'], r['hand'])} · {wsign(r['full_verdict'], r['cal'])} |")
    lines.append("")
    lines.append("## 2. 실제 도면에서 관계와 공간구문 지표의 연관\n")
    lines.append("OLS `지표 ~ 관계 + C(침실 수) + log(면적)`, 도면 군집 강건 표준오차, 항 × 지표 전체 Holm 보정. 셀: 계수 [95% 구간], ✓ = Holm p < 0.05. 거실 중앙 거리는 0.1 증가당.\n")
    lines.append("괄호 안 '생성'은 생성 평면에서 잰 같은 관계의 효과(있음 − 없음)이고, ↔ 표시는 실제와 생성의 부호가 같으면 =, 다르면 ≠ 입니다.\n")
    lines.append("| 관계 | " + " | ".join(SX_LABEL[y] for y in SX) + " |")
    lines.append("|---|" + "|".join("---" for _ in SX) + "|")
    gen_by_key = {r["key"]: r["sx_gen"] for r in cmp_rows if r["key"]}
    agree_n = agree_tot = 0
    for key in keys:
        cells = []
        for y in SX:
            a = assoc[(assoc.key == key) & (assoc.y == y)]
            if a.empty or math.isnan(a.iloc[0]["coef"]):
                cells.append("—" if a.empty else a.iloc[0]["note"])
                continue
            a = a.iloc[0]
            star = " ✓" if a["p_holm"] < 0.05 else ""
            g = (gen_by_key.get(key) or {}).get(y)
            gtxt = ""
            if g:
                same = np.sign(g["mean"]) == np.sign(a["coef"])
                if a["p_holm"] < 0.05 and abs(g["mean"]) >= 0.05:
                    agree_tot += 1
                    agree_n += int(same)
                gtxt = f" (생성 {g['mean']:+.2f} {'=' if same else '≠'})"
            cells.append(f"{a['coef']:+.3f} [{a['lo']:+.3f}, {a['hi']:+.3f}]{star}{gtxt}")
        lines.append(f"| `{key}` | " + " | ".join(cells) + " |")
    lines.append("")
    lines.append(f"실제 연관이 유의(Holm)하고 생성 효과가 |0.05| 이상인 칸 {agree_tot}개 중 부호 일치 {agree_n}개.\n")
    lines.append("## 3. 실제 빈도의 군집 부트스트랩 구간 (numpy, 10,000회)\n")
    lines.append("도면 단위 복원추출. JS 보고서(`term-evidence.md`)의 2,000회 구간과 나란히 두어 반복 수에 따른 차이가 없는지 확인합니다.\n")
    lines.append("| 관계 | 실제 | 95% 구간 (numpy 10,000) | 95% 구간 (JS 2,000) | 세대 / 도면 |")
    lines.append("|---|---|---|---|---|")
    for _, b in boot.iterrows():
        j = js_ci.get(b["key"]) or {}
        fmt = (lambda x: f"{x:.3f}") if b["key"] == "livingOffCenter" else (lambda x: f"{100 * x:.1f}%")
        jtxt = f"[{fmt(j['lo'])}, {fmt(j['hi'])}]" if j.get("lo") is not None else "—"
        lines.append(f"| `{b['key']}` | {fmt(b['est'])} | [{fmt(b['lo'])}, {fmt(b['hi'])}] | {jtxt} | {b['n']:,} / {b['drawings']:,} |")
    lines.append("")
    lines.append("## 계산 시간\n")
    lines.append(" · ".join(f"{k} {v:.2f}초" for k, v in T.items()) + "\n")
    lines.append("## 쓰인 도구와 이유\n")
    lines.append("- **JS `scripts/term-evidence.mjs`**: 관계 측정과 공간구문 지표는 웹 평가 모델(`src/model`)과 같은 코드여야 정의가 어긋나지 않으므로 측정은 JS에서 하고 세대별 값을 jsonl로 내보냄.")
    lines.append("- **pandas**: 19,196세대 × 관계·지표 표를 다루기 위해.")
    lines.append("- **statsmodels**: 군집 강건 표준오차(같은 도면 세대의 상관)와 범주 통제(침실 수)를 갖춘 OLS, 그리고 Holm 다중 비교 보정을 검증된 구현으로 쓰기 위해. 수식 인터페이스(patsy)는 느려 numpy 설계행렬로 직접 넣고, `--check`로 수식 결과와 1e-9 이내 일치를 확인.")
    lines.append("- **numpy 벡터화 + 프로세스 병렬 부트스트랩**: 도면 복원추출을 batch × 도면 수 정수 행렬 한 번으로 뽑아 합을 구하고, 관계 18개를 CPU 코어 절반 수의 프로세스로 나눠 계산. 반복 수 10,000회.")
    lines.append("- **uv (analysis/pyproject.toml, uv.lock)**: 시스템 파이썬을 건드리지 않고 의존성 버전을 고정해 재현 가능하게.\n")
    lines.append("## 한계\n")
    lines.append("- 실제 연관은 관측 연관이며 인과가 아닙니다. 침실 수·면적 외의 교란(주동 형식, 연도 등)은 라벨에 없어 통제하지 못했습니다.")
    lines.append("- 표본이 커 작은 계수도 유의해집니다. 계수 크기를 함께 보십시오.")
    lines.append("- 거실·침실이 없는 현관 조각 세대(2,187)와 현관 없는 도면(59장)은 측정에서 빠졌습니다.")
    (RES / "term-evidence-stats.md").write_text("\n".join(lines) + "\n", encoding="utf8")
    (RES / "term-evidence-stats.json").write_text(json.dumps({"units": int(len(df)), "drawings": int(df["drawing"].nunique()), "timing": T, "bootstrap": boot.to_dict(orient="records"), "compare": cmp_rows, "assoc": assoc.replace({np.nan: None}).to_dict(orient="records")}, ensure_ascii=False, indent=1), encoding="utf8")
    print(f"세대 {len(df):,}, 도면 {df['drawing'].nunique():,} → {RES / 'term-evidence-stats.md'}")


if __name__ == "__main__":
    main()

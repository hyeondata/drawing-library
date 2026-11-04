"""생성 평면이 실제 한국 아파트 평면과 공간구문으로 구별되는가 (분류기 이표본 검정, C2ST).

입력
  - <aihub-full>/derived/real-units.jsonl, baseline-units.jsonl : 실제 평면(서로 다른 평면만)
  - data/split.json : 검증(test) 묶음만 비교에 쓴다(가중치를 맞춘 개발 묶음은 쓰지 않음)
  - evidence/results/generated-plans.jsonl : scripts/real-vs-generated.mjs
출력: evidence/results/real-vs-generated.md, .json

방법(Lopez-Paz & Oquab 2017, C2ST)
  - 두 집단(실제 test, 생성)을 같은 수로 맞추고(실제는 생성의 침실 수 구성에 맞춰 층화 표집) 분류기를 5겹 교차검증으로 학습해 AUC를 잰다.
    AUC 0.5 = 분류기가 구별하지 못함. 반복 20번(표집·분할 난수를 바꿔)의 평균과 95% 구간, 라벨을 섞은 영분포 200번으로 p값.
  - 기준선: 실제 dev 대 실제 test(같은 모집단)의 AUC — '구별되지 않음'이 어떤 값인지 보여 준다.
  - 사전에 정한 판정: AUC 95% 구간 상한 < 0.60이면 '실질적으로 구별되지 않음', 0.60~0.70 '약하게 구별', 0.70 이상 '구별됨'.
  - 특징: 공간구문 지표(거실/침실·주방/침실 통합도 비, 유전형 τ, 사생활 깊이 차, 거실 깊이, 고리도, 거실 통제값).
    평균 통합도는 실 수(K)에 따라 달라 실 구성이 다른 두 집단 비교에서 빼고, 부록 표에만 낸다.
"""

from __future__ import annotations

import json
import os
import sys

# 병렬 작업마다 OpenMP가 모든 코어를 잡으면 7작업 × 16스레드로 과부하가 걸려 수십 배 느려진다. 작업당 2스레드로 제한.
os.environ.setdefault("OMP_NUM_THREADS", "2")
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "evidence" / "results"
DER = ROOT.parent / "aihub-full" / "derived"
FEAT = ["livingBedroomRatio", "kitchenBedroomRatio", "genotypeTau", "privacyDepthGap", "livingDepth", "ringiness", "livingControl"]
LABEL = {"livingBedroomRatio": "거실/침실 통합도 비", "kitchenBedroomRatio": "주방/침실 통합도 비", "genotypeTau": "유전형 τ", "privacyDepthGap": "사생활 깊이 차", "livingDepth": "현관→거실 깊이", "ringiness": "고리도", "livingControl": "거실 통제값", "meanIntegration": "평균 통합도(참고)"}
SETNAME = {"hand": "손 가중치", "calibrated": "평가 모델 보정", "maxent": "최대 엔트로피(실제 빈도)"}
REPS, PERMS = 10, 50


def load_real() -> pd.DataFrame:
    keep = {(o["drawing"], o["unit"]) for o in map(json.loads, (DER / "baseline-units.jsonl").read_text().splitlines()) if o}
    test = set(json.loads((ROOT / "data" / "split.json").read_text())["test"])
    rows = []
    for line in (DER / "real-units.jsonl").read_text().splitlines():
        if not line:
            continue
        o = json.loads(line)
        if (o["drawing"], o["unit"]) not in keep:
            continue
        f = o["features"]
        rows.append({"split": "test" if o["drawing"] in test else "dev", "bedrooms": o["bedrooms"], **{k: f.get(k) for k in FEAT + ["meanIntegration"]}})
    return pd.DataFrame(rows)


def load_gen() -> pd.DataFrame:
    rows = []
    for line in (RES / "generated-plans.jsonl").read_text().splitlines():
        o = json.loads(line)
        for path in ("qubo", "full"):
            f = o.get(path)
            if not f:
                continue
            rows.append({"set": o["set"], "path": path, "bedrooms": o["spec"]["bedrooms"], **{k: f.get(k) for k in FEAT + ["meanIntegration"]}})
    return pd.DataFrame(rows)


def c2st(a: pd.DataFrame, b: pd.DataFrame, seed: int, model: str = "hgb") -> float:
    """b(생성)의 침실 수 구성에 맞춰 a(실제)에서 같은 수를 층화 표집하고 5겹 교차검증 AUC."""
    rng = np.random.default_rng(seed)
    parts = []
    for beds, n in b["bedrooms"].value_counts().items():
        pool = a[a["bedrooms"] == beds]
        if len(pool) == 0:
            continue
        parts.append(pool.iloc[rng.choice(len(pool), size=n, replace=len(pool) < n)])
    a2 = pd.concat(parts)
    b2 = b[b["bedrooms"].isin(a2["bedrooms"].unique())]
    X = pd.concat([a2[FEAT], b2[FEAT]]).to_numpy(float)
    y = np.r_[np.zeros(len(a2)), np.ones(len(b2))]
    clf = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, random_state=seed) if model == "hgb" else make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000))
    if model != "hgb":
        X = np.nan_to_num(X, nan=np.nanmedian(X, axis=0)[None, :].repeat(len(X), 0)[np.isnan(X)] if np.isnan(X).any() else 0)
    cv = StratifiedKFold(5, shuffle=True, random_state=seed)
    p = cross_val_predict(clf, X, y, cv=cv, method="predict_proba")[:, 1]
    return float(roc_auc_score(y, p)), X, y, clf, cv


def run(a: pd.DataFrame, b: pd.DataFrame, tag: str) -> dict:
    aucs = [c2st(a, b, s)[0] for s in range(REPS)]
    _, X, y, clf, cv = c2st(a, b, 0)
    rng = np.random.default_rng(1)
    null = []
    for _ in range(PERMS):
        yp = rng.permutation(y)
        p = cross_val_predict(clf, X, yp, cv=cv, method="predict_proba")[:, 1]
        null.append(roc_auc_score(yp, p))
    m = float(np.mean(aucs))
    lo, hi = np.quantile(aucs, [0.025, 0.975])
    pval = float((1 + sum(n >= m for n in null)) / (1 + PERMS))
    verdict = "실질적으로 구별되지 않음" if hi < 0.60 else ("약하게 구별" if hi < 0.70 else "구별됨")
    print(f"{tag}: AUC {m:.3f} [{lo:.3f}, {hi:.3f}] p={pval:.3f} → {verdict}", flush=True)
    return {"tag": tag, "n_gen": int(len(b)), "auc": m, "lo": float(lo), "hi": float(hi), "null_hi": float(np.quantile(null, 0.975)), "p": pval, "verdict": verdict}


def cliffs(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a[~np.isnan(a)], b[~np.isnan(b)]
    if not len(a) or not len(b):
        return float("nan")
    gt = (b[:, None] > a[None, :]).mean()
    lt = (b[:, None] < a[None, :]).mean()
    return float(gt - lt)


def main() -> None:
    real = load_real()
    gen = load_gen()
    test = real[(real.split == "test") & real.bedrooms.isin([2, 3, 4])]
    dev = real[(real.split == "dev") & real.bedrooms.isin([2, 3, 4])]
    out = {"n_test": int(len(test)), "n_dev": int(len(dev)), "rows": [], "metrics": []}
    # 기준선: 실제 대 실제(dev 표본 600개를 '생성' 자리에)
    ref = dev.sample(600, random_state=0)
    # 비교 7개를 프로세스로 나눠 동시에 돌린다(각 비교는 난수 씨앗이 고정이라 순서와 무관하게 같은 결과)
    from concurrent.futures import ProcessPoolExecutor
    jobs = [(test, ref, "기준선: 실제 dev 대 실제 test")]
    for path in ("qubo", "full"):
        for s in ("hand", "calibrated", "maxent"):
            jobs.append((test, gen[(gen.set == s) & (gen.path == path)], f"{SETNAME[s]} · {'QUBO 최적해' if path == 'qubo' else '생성기 전체(SA+J)'}"))
    with ProcessPoolExecutor(max_workers=len(jobs)) as ex:
        out["rows"] = list(ex.map(run, *zip(*jobs)))
    for path in ("qubo", "full"):
        for s in ("hand", "calibrated", "maxent"):
            b = gen[(gen.set == s) & (gen.path == path)]
            for k in FEAT + ["meanIntegration"]:
                av, bv = test[k].to_numpy(float), b[k].to_numpy(float)
                q5, q95 = np.nanquantile(av, [0.05, 0.95])
                inside = float(np.mean((bv >= q5) & (bv <= q95))) if np.isfinite(bv).any() else float("nan")
                out["metrics"].append({"set": s, "path": path, "key": k, "real_med": float(np.nanmedian(av)), "gen_med": float(np.nanmedian(bv)), "delta": cliffs(av, bv), "inside90": inside})

    L = ["# 생성 평면 대 실제 한국 아파트 평면: 공간구문으로 구별되는가\n"]
    L.append(f"> `uv run python real_vs_generated.py` (analysis/) · 실제: 검증(test) 묶음의 서로 다른 평면 {len(test):,}개(침실 2~4개, 가중치 맞춤에 쓰지 않음) · 생성: 조건 600개 × 가중치 3종 × 경로 2개(`scripts/real-vs-generated.mjs`)\n")
    L.append("## 방법\n")
    L.append("- **분류기 이표본 검정(C2ST; Lopez-Paz & Oquab 2017)**: 실제와 생성 평면을 같은 수로 맞추고(실제는 생성의 침실 수 구성에 맞춰 층화 표집) 그래디언트 부스팅 분류기를 5겹 교차검증해 AUC를 잽니다. 0.5면 분류기가 둘을 구별하지 못합니다.")
    L.append(f"- 표집·분할을 바꿔 {REPS}번 반복한 평균과 95% 구간, 라벨을 섞은 영분포 {PERMS}번으로 p값을 냅니다.")
    L.append("- 특징(공간구문, 벽 인접 그래프): " + ", ".join(LABEL[k] for k in FEAT) + ". 평균 통합도는 실 수에 따라 달라 분류 특징에서 빼고 아래 표에만 냅니다.")
    L.append("- **사전에 정한 판정**: AUC 95% 구간 상한 < 0.60 → 실질적으로 구별되지 않음, < 0.70 → 약하게 구별, 그 이상 → 구별됨. 기준선(실제 dev 대 실제 test)이 '같은 모집단'의 값입니다.\n")
    L.append("## 결과\n")
    L.append("| 비교 | 생성 n | AUC 평균 [95% 구간] | 영분포 97.5% | p | 판정 |")
    L.append("|---|---|---|---|---|---|")
    for r in out["rows"]:
        L.append(f"| {r['tag']} | {r['n_gen']} | {r['auc']:.3f} [{r['lo']:.3f}, {r['hi']:.3f}] | {r['null_hi']:.3f} | {r['p']:.3f} | {r['verdict']} |")
    L.append("")
    L.append("## 지표별 차이 (생성기 전체 경로)\n")
    L.append("Cliff's δ: 생성이 실제보다 큰 쪽이면 양수(|δ| < 0.147 무시할 만함, < 0.33 작음, < 0.474 중간, 그 이상 큼; Romano et al. 2006). '90% 범위 안' = 생성 평면 중 실제 5~95백분위 안에 드는 비율.\n")
    L.append("| 지표 | 실제 중앙값 | " + " | ".join(f"{SETNAME[s]} 중앙값 · δ · 90% 범위 안" for s in ("hand", "calibrated", "maxent")) + " |")
    L.append("|---|---|" + "|".join("---" for _ in range(3)) + "|")
    for k in FEAT + ["meanIntegration"]:
        cells = []
        rm = None
        for s in ("hand", "calibrated", "maxent"):
            m = next(x for x in out["metrics"] if x["set"] == s and x["path"] == "full" and x["key"] == k)
            rm = m["real_med"]
            cells.append(f"{m['gen_med']:.2f} · {m['delta']:+.2f} · {100 * m['inside90']:.0f}%")
        L.append(f"| {LABEL[k]} | {rm:.2f} | " + " | ".join(cells) + " |")
    L.append("")
    L.append("## 한계\n")
    L.append("- 생성기는 판상형 두 띠 문법이라 실제 평면의 형상 다양성(탑상형·ㄱ자 등)을 만들지 못합니다. 이 비교는 공간구문(그래프) 특징에 한정됩니다.")
    L.append("- 공간구문 지표는 실제와 생성 모두 벽 인접 그래프로 쟀습니다(같은 규약).")
    (RES / "real-vs-generated.md").write_text("\n".join(L) + "\n", encoding="utf8")
    (RES / "real-vs-generated.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf8")


if __name__ == "__main__":
    main()

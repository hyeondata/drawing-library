"""평가 모델 기준 분포 비교: 이전 샘플 35세대(data/baseline-sample35.json, 동결) vs 현재 기준(전체 APT_FP_SPA 7,275장).

왜: 평가 모델의 '모델 점수'(J의 0.45)는 기준 분포의 중앙값·Qn 척도에 대한 근접도다. 2026-11-04에 기준을 샘플 35세대에서
    전체 데이터(현관 하나 = 세대 하나, 거실·주방·화장실 있음, 침실 1~5개, 같은 평면 한 번 = 8,331개 평면)로 바꿨다.
    두 기준이 얼마나 다른지와, 샘플 기준이 실제 아파트를 얼마나 낮게 채점했는지를 기록한다.

입력: <aihub-full>/derived/real-units.jsonl(features), <aihub-full>/derived/baseline-units.jsonl(기준에 들어간 세대),
      data/baseline-sample35.json, 특징 정의(src/model/config.js를 node로 읽음)
출력: evidence/results/baseline-compare.md, .json

계산
  - 중앙값, Qn 척도(statsmodels.robust.scale.qn_scale: O(n log n). 직접 구현하면 1.9만 세대에서 쌍 1.8억 개가 필요)
  - 층화: 평가 모델과 같은 규칙(같은 침실 수 세대가 15 이상이면 그 층, 아니면 전체)
  - 채점 재현: z 채점 = 100·max(0, 1 − |z|/3)(방향 지표는 유리한 쪽 100), ecdf 채점 = 백분위 점수.
    전체 세대 각각을 (가) 샘플 기준, (나) 전체 기준으로 채점해 평균 점수를 비교한다.
  - 파생 지표(genotypeDistance, 실 수 보정 meanIntegration)와 가중치 0 지표는 비교에서 뺀다(정의가 기준 분포에 의존).
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from statsmodels.robust.scale import qn_scale

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "evidence" / "results"
_args = [a for a in sys.argv[1:] if not a.startswith("--")]
DATA = Path(_args[0]) if _args else ROOT.parent / "aihub-full" / "derived" / "real-units.jsonl"


def feature_defs() -> tuple[list[dict], dict, float]:
    js = (
        "import('./src/model/config.js').then(c=>{const o=[];for(const [g,v] of Object.entries(c.FEATURES))"
        "if(Array.isArray(v))for(const d of v)o.push({group:g,key:d.key,label:d.label,direction:d.direction||null,scoring:d.scoring||'z',adjust:d.adjust||null,weight:d.weight??1});"
        "console.log(JSON.stringify({defs:o,strata:c.STRATA,zZero:c.Z_ZERO_SCORE}))})"
    )
    out = json.loads(subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    return out["defs"], out["strata"], out["zZero"]


_SMALL_DN = {2: 0.399, 3: 0.994, 4: 0.512, 5: 0.844, 6: 0.611, 7: 0.857, 8: 0.669, 9: 0.872}


def qn_eval(v: np.ndarray) -> float:
    """평가 모델 JS qnScale과 같은 정의: 2.2219 × dn × (k번째 쌍 차이). statsmodels qn_scale은 상수 2.21914에
    유한표본 보정이 없어 그대로 쓰면 35세대에서 약 3.7% 달라진다. 순서통계량은 statsmodels(O(n log n))로 구하고 상수·보정만 JS에 맞춘다."""
    n = len(v)
    if n < 2:
        return 0.0
    dn = _SMALL_DN[n] if n <= 9 else (n / (n + 1.4) if n % 2 else n / (n + 3.8))
    return float(qn_scale(v, c=2.2219)) * dn


def score_z(x: np.ndarray, med: float, scale: float, direction: str | None, z0: float) -> np.ndarray:
    z = (x - med) / scale if scale > 0 else np.zeros_like(x)
    s = 100 * np.maximum(0, 1 - np.abs(z) / z0)
    if direction == "higher":
        s = np.where(z > 0, 100, s)
    elif direction == "lower":
        s = np.where(z < 0, 100, s)
    return s


def score_ecdf(x: np.ndarray, ref_sorted: np.ndarray, direction: str | None) -> np.ndarray:
    # 평가 모델 ecdf와 같은 정의: 동점은 절반으로 센다
    below = np.searchsorted(ref_sorted, x - 1e-12, side="left")
    upto = np.searchsorted(ref_sorted, x + 1e-12, side="right")
    F = (below + 0.5 * (upto - below)) / len(ref_sorted)
    if direction == "higher":
        return 100 * np.minimum(1, F / 0.5)
    if direction == "lower":
        return 100 * np.minimum(1, (1 - F) / 0.5)
    return 100 * 2 * np.minimum(F, 1 - F)


def reference(pool: pd.DataFrame, key: str, beds: float | None, strata: dict) -> np.ndarray:
    """평가 모델의 층화 규칙: 같은 침실 수 세대가 minSize 이상이면 그 층만, 아니면 전체."""
    if beds is not None:
        layer = pool.loc[pool["bedroomCount"] == beds, key].dropna().to_numpy(float)
        if len(layer) >= strata["minSize"]:
            return np.sort(layer)
    return np.sort(pool[key].dropna().to_numpy(float))


def main() -> None:
    T = {}
    t = time.perf_counter()
    defs, strata, z0 = feature_defs()
    defs = [d for d in defs if d["weight"] > 0 and not d["adjust"] and d["key"] != "genotypeDistance"]
    keep = {(r["drawing"], r["unit"]) for r in map(json.loads, (DATA.parent / "baseline-units.jsonl").read_text(encoding="utf8").splitlines()) if r}
    rows_all = [json.loads(l) for l in DATA.read_text(encoding="utf8").splitlines() if l.strip()]
    full = pd.json_normalize([r["features"] | {"drawing": r["drawing"]} for r in rows_all if (r["drawing"], r["unit"]) in keep])
    base = json.loads((ROOT / "data" / "baseline-sample35.json").read_text(encoding="utf8"))
    sample = pd.json_normalize([e["features"] for e in base["entries"]])
    T["load"] = time.perf_counter() - t

    t = time.perf_counter()
    rows = []
    for d in defs:
        k = d["key"]
        fs, ss = full[k].dropna().to_numpy(float), sample[k].dropna().to_numpy(float)
        rows.append({
            "key": k, "label": d["label"], "group": d["group"], "direction": d["direction"], "scoring": d["scoring"],
            "sample_n": int(len(ss)), "sample_median": float(np.median(ss)), "sample_qn": qn_eval(ss),
            "full_n": int(len(fs)), "full_median": float(np.median(fs)), "full_qn": qn_eval(fs),
        })
    T["qn"] = time.perf_counter() - t

    # 채점 재현: 세대마다 같은 침실 수 층의 기준으로 채점
    t = time.perf_counter()
    bed_vals = sorted(full["bedroomCount"].dropna().unique())
    for r, d in zip(rows, defs):
        k = d["key"]
        sc = {"sample": [], "full": []}
        for b in bed_vals:
            x = full.loc[(full["bedroomCount"] == b) & full[k].notna(), k].to_numpy(float)
            if not len(x):
                continue
            for name, pool in (("sample", sample), ("full", full)):
                ref = reference(pool, k, b, strata)
                if d["scoring"] == "ecdf":
                    s = score_ecdf(x, ref, d["direction"])
                else:
                    s = score_z(x, float(np.median(ref)), qn_eval(ref), d["direction"], z0)
                sc[name].append(s)
        for name in sc:
            allv = np.concatenate(sc[name])
            r[f"score_{name}"] = float(allv.mean())
            r[f"low_{name}"] = float((allv < 50).mean())
    T["score"] = time.perf_counter() - t

    # 층별 세대 수(샘플은 3침실만 층이 작동)
    layers = {
        "sample": sample["bedroomCount"].value_counts().sort_index().to_dict(),
        "full": full["bedroomCount"].value_counts().sort_index().to_dict(),
    }

    df = pd.DataFrame(rows)
    (RES / "baseline-compare.json").write_text(json.dumps({"timing": T, "layers": {k: {str(int(a)): int(b) for a, b in v.items()} for k, v in layers.items()}, "rows": rows}, ensure_ascii=False, indent=1), encoding="utf8")

    f3 = lambda x: f"{x:.3f}"
    L = ["# 평가 모델 기준 분포: 이전 샘플 35세대 vs 현재 전체 APT_FP_SPA 7,275장\n"]
    L.append(f"> `uv run python baseline_compare.py` (analysis/) · 현재 기준 {len(full):,}개 평면(7,275장, 현관 하나 = 세대 하나, 거실·주방·화장실 있음, 침실 1~5개, 같은 평면 한 번) · 이전 샘플 {len(sample)}세대(`data/baseline-sample35.json`, 동결) · 2026-11-04 기준 교체\n")
    L.append("## 1. 지표별 중앙값과 Qn 척도\n")
    L.append("| 지표 | 채점 | 샘플 중앙값 (Qn) | 전체 중앙값 (Qn) | 중앙값 이동 / 샘플 Qn | 현재 기준 평면 평균 점수: 샘플 기준 → 전체 기준 | 50점 미만 비율: 샘플 기준 → 전체 기준 |")
    L.append("|---|---|---|---|---|---|---|")
    for r in rows:
        shift = (r["full_median"] - r["sample_median"]) / r["sample_qn"] if r["sample_qn"] > 0 else float("nan")
        sc = r["scoring"] + (f", {r['direction']}" if r["direction"] else "")
        L.append(f"| {r['label']} (`{r['key']}`) | {sc} | {f3(r['sample_median'])} ({f3(r['sample_qn'])}) | {f3(r['full_median'])} ({f3(r['full_qn'])}) | {shift:+.2f} | {r['score_sample']:.1f} → {r['score_full']:.1f} | {100 * r['low_sample']:.1f}% → {100 * r['low_full']:.1f}% |")
    L.append("")
    L.append("'중앙값 이동 / 샘플 Qn'은 전체 중앙값이 샘플 기준에서 몇 척도만큼 떨어져 있는지입니다. |값|이 크면 샘플 기준이 실제 아파트의 중심을 잘못 잡고 있다는 뜻입니다.\n")
    L.append("## 2. 침실 수 층\n")
    L.append("| 침실 수 | 샘플 세대 | 전체 세대 |")
    L.append("|---|---|---|")
    for b in sorted(set(layers["sample"]) | set(layers["full"])):
        L.append(f"| {int(b)} | {layers['sample'].get(b, 0)} | {layers['full'].get(b, 0):,} |")
    L.append(f"\n층은 같은 침실 수 세대가 {strata['minSize']} 이상일 때만 작동합니다. 샘플에서는 위 표에서 {strata['minSize']} 이상인 층만, 전체에서는 거의 모든 층이 작동합니다.\n")
    L.append("## 계산 시간\n")
    L.append(" · ".join(f"{k} {v:.2f}초" for k, v in T.items()) + "\n")
    L.append("## 쓰인 도구와 이유\n")
    L.append("- **statsmodels `qn_scale`**: 평가 모델의 척도인 Qn(Rousseeuw & Croux 1993)의 순서통계량을 O(n log n)으로 계산. JS 구현(`qnScale`)은 모든 쌍 차이를 정렬해 1.9만 세대에서는 쓸 수 없음. 상수와 유한표본 보정은 JS와 같게 맞춤(`qn_eval`, 샘플 35세대에서 JS와 대조).")
    L.append("- **numpy `searchsorted`**: 백분위(ecdf) 채점을 세대 1.9만 개에 대해 한 번에 계산.")
    L.append("- **node 호출로 특징 정의 읽기**: 지표 목록·방향·채점 방식을 `src/model/config.js`에서 그대로 가져와 평가 모델과 어긋나지 않게 함.\n")
    L.append("## 한계\n")
    L.append("- 샘플은 기본 세대 규칙(현관 조각 병합), 전체는 현관 하나 = 세대 하나 규칙입니다. 정의가 완전히 같지는 않습니다.")
    L.append("- 전체 기준의 거르는 기준과 이유는 `scripts/build-baseline-full.mjs` 머리말에 있습니다.")
    L.append("- 파생 지표(유전형 거리, 실 수 보정 평균 통합도)는 기준 분포에 따라 정의가 바뀌어 이 비교에서 뺐습니다.")
    (RES / "baseline-compare.md").write_text("\n".join(L) + "\n", encoding="utf8")
    print(" · ".join(f"{k} {v:.2f}s" for k, v in T.items()))


if __name__ == "__main__":
    main()

"""RQ4 예비: 공간구문 목적별 생성 도면과 실제 한국 아파트(dev 묶음)의 공간구문 비교.

입력: ../evidence/results/objective-plans.jsonl (scripts/objective-plans.mjs), 실제는 real_vs_generated.load_real()의 dev.
실제 쪽은 생성 쪽 침실 수 비율에 맞춰 층화 재표집한다. test 묶음은 쓰지 않는다(RQ4 본 판정용으로 남겨 둠).
지표마다 Cliff's δ(생성 − 실제, |δ| < 0.147 무시할 만함, < 0.33 작음, < 0.474 중간; Romano et al. 2006)와 실제 5–95% 범위 안 비율.
주의: 목적과 같은 계열의 지표(예: O2와 현관→거실 깊이)는 그 목적의 비교에서 순환이다 — 표에 * 표시. 본 판정은 목적과 분리된 지표로.
사용: uv run python objective_compare.py → ../evidence/results/objective-compare.md
"""

from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

from real_vs_generated import FEAT, LABEL, RES, load_real

OBJ = {
    "legacy": "기존 생성기(보정 가중치, 기존 배치)",
    "O0": "O0 기준선(무작위 배치, 정렬)",
    "O1": "O1 거실 중심(거실 총깊이 최소)",
    "O2": "O2 얕은 깊이(현관 총깊이 최소)",
    "O3": "O3 공·사 위계(침실−공용 깊이 최대)",
    "O6": "O6 습식·서비스 주변화",
    "O7": "O7 대조: 주방 중심",
    "O9": "O9 공용실 경유(거실 선택도 최대)",
    "C13_0.25": "C13 조합 0.25·O1 + 0.75·O3",
    "C13_0.5": "C13 조합 0.5·O1 + 0.5·O3",
    "C13_0.75": "C13 조합 0.75·O1 + 0.25·O3",
    "C136": "C136 조합 O1 + O3 + O6",
}
# 목적과 같은 계열(순환) 지표
CIRC = {
    "O1": {"livingBedroomRatio", "livingControl"},
    "O2": {"livingDepth"},
    "O3": {"privacyDepthGap"},
    "O6": set(),
    "O7": {"kitchenBedroomRatio"},
    "O9": {"livingControl"},
    **{k: {"livingBedroomRatio", "livingControl", "privacyDepthGap"} for k in ("C13_0.25", "C13_0.5", "C13_0.75", "C136")},
}

SUFFIX = "-rq4" if os.environ.get("SPECS") == "rq4" else ""  # 사양 묶음(scripts/lib/rq4-specs.mjs)


def cliffs(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    a, b = a[~np.isnan(a)], b[~np.isnan(b)]
    if not len(a) or not len(b):
        return float("nan")
    gt = (a[:, None] > b[None, :]).mean()
    lt = (a[:, None] < b[None, :]).mean()
    return float(gt - lt)


def main():
    real = load_real()
    dev = real[real.split == "dev"]
    gen = pd.DataFrame(
        [{"obj": o["obj"], "bedrooms": o["bedrooms"], "fit": o["fit"], "narrow": o["narrow"], "door": o["door"], **{k: (o["features"] or {}).get(k) for k in FEAT}} for o in map(json.loads, (RES / f"objective-plans{SUFFIX}.jsonl").read_text().splitlines())]
    )
    rng = np.random.default_rng(0)
    L = ["# RQ4 예비: 공간구문 목적별 생성 도면 대 실제 한국 아파트(dev)\n"]
    L.append(f"> `uv run python objective_compare.py` · 생성 {len(gen):,}개(템플릿 40개 × 목적, 동점 최적 배치 최대 20개, 정렬 모드 + 복도로 도면화) · 실제 dev {len(dev):,}세대(생성 쪽 침실 수 비율로 층화 재표집) · test 미사용\n")
    L.append("값: 생성 중앙값 (Cliff's δ, 실제 5–95% 범위 안 비율). δ는 생성 − 실제. `*` = 그 목적과 같은 계열이라 순환(판정에서 제외).\n")
    hdr = "| 목적 | n | " + " | ".join(LABEL[k] for k in FEAT) + " | 평균 \\|δ\\|(순환 제외) | 면적 부합 | 좁은 실 | 문 동선 |"
    L.append(hdr)
    L.append("|" + "---|" * (len(FEAT) + 6))
    real_row = "| 실제 dev | " + f"{len(dev):,} | " + " | ".join(f"{dev[k].median():.2f}" for k in FEAT) + " | — | — | — | — |"
    summary = {}
    for o, name in OBJ.items():
        g = gen[gen.obj == o]
        if g.empty:
            continue
        w = g.bedrooms.value_counts(normalize=True)
        parts = [dev[dev.bedrooms == b].sample(n=int(2000 * p), replace=True, random_state=int(rng.integers(1e9))) for b, p in w.items() if (dev.bedrooms == b).any()]
        ref = pd.concat(parts)
        cells, ds = [], []
        for k in FEAT:
            d = cliffs(g[k], ref[k])
            lo, hi = np.nanquantile(ref[k], [0.05, 0.95])
            inr = float(((g[k] >= lo) & (g[k] <= hi)).mean())
            mark = "*" if k in CIRC.get(o, set()) else ""
            cells.append(f"{g[k].median():.2f} ({d:+.2f}, {inr:.0%}){mark}")
            if not mark:
                ds.append(abs(d))
        summary[o] = float(np.mean(ds))
        L.append(f"| {name} | {len(g)} | " + " | ".join(cells) + f" | **{np.mean(ds):.2f}** | {g.fit.median():.1f} | {g.narrow.mean():.2f} | {g.door.mean():.2f} |")
    L.append(real_row)
    L.append("\n## 읽는 법과 한계\n")
    L.append("- 평균 |δ|가 작을수록 그 목적으로 만든 도면이 실제 한국 아파트의 공간구문 분포에 가깝다. 순환 지표는 빼고 평균했다.")
    L.append("- 예비 결과다: 비교 지표가 아직 목적과 일부 겹치고(본 판정은 평면형 분포·그래프 편집 거리·difference factor 같은 분리된 지표로), 목적마다 최적 배치 하나(동점 여러 개)만 봤다. 본 판정은 볼츠만 표본(가중치를 dev에 맞춤)과 test 묶음, 외부 검증 프로그램으로 한다.")
    L.append("- 템플릿 40개는 사양 20개(59~114㎡)에서 나왔다. 도면은 정렬 모드(QUBO 맞닿음 = 실제 맞닿음)로 그렸다. 기존 생성기는 다른 배치 방식이라 맞닿음 충실도가 다르다(align-check).")
    RES.joinpath(f"objective-compare{SUFFIX}.md").write_text("\n".join(L) + "\n")
    RES.joinpath(f"objective-compare{SUFFIX}.json").write_text(json.dumps(summary, indent=1))
    print("\n".join(L))


if __name__ == "__main__":
    main()

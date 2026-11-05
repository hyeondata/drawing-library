"""실제 dev 세대에서 침실이 거실과 어떤 위치 관계로 맞닿는가(Confluence 09-15 12절). 입력: scripts/living-geometry.mjs.
앞 방향은 거실과 맞닿은 발코니 쪽(발코니 기준 세대만). 벽 인접 그래프. test 미사용.
사용: uv run python bedroom_living.py → ../evidence/results/bedroom-living.md
"""

from __future__ import annotations

import json
from collections import Counter

import numpy as np

from real_vs_generated import RES
from rq1_syntax import DER


def main():
    R = [json.loads(x) for x in (DER / "living-geometry.jsonl").read_text().splitlines()]
    R = [r for r in R if r["axisFrom"] == "balcony"]
    B = [b for r in R for b in r["beds"]]
    L = ["# 침실이 거실과 맞닿는 위치 관계 (실제 세대, 발코니 기준 — living-geometry.mjs의 범위: 기본 전체 7,275장)\n", f"> `uv run python bedroom_living.py` · 세대 {len(R):,} · 침실 {len(B):,} · 벽 인접 그래프\n"]
    L.append("## 1. 맞닿는 방향\n")
    L.append("| 침실 위치 | 수(세대당) | 거실과 맞닿음 | 옆으로 | 뒤로(거실 뒤) | 앞으로 | 안 맞닿고 복도·기타 경유 |")
    L.append("|---|---|---|---|---|---|---|")
    for band in ("front", "back"):
        bb = [b for b in B if b["band"] == band]
        d = Counter(b["dir"] for b in bb if b["touchesLiving"])
        n = len(bb)
        L.append(f"| {'앞 띠' if band == 'front' else '뒤 띠'} | {n / len(R):.2f} | {np.mean([b['touchesLiving'] for b in bb]):.0%} | {d['side'] / n:.0%} | {d['behind'] / n:.0%} | {d['front'] / n:.0%} | {np.mean([b['viaHall'] for b in bb]):.0%} |")
    L.append("\n## 2. 앞 띠 침실: 거실에서 몇 칸 떨어져 있나(앞 띠 줄 순서)\n")
    L.append("| 거실과의 칸 거리 | 침실 수 | 거실과 맞닿음 | 맞닿을 때 방향(옆/뒤/앞) |")
    L.append("|---|---|---|---|")
    fb = [b for b in B if b["band"] == "front" and b["frontRank"] is not None]
    for k in sorted({b["frontRank"] for b in fb}):
        bb = [b for b in fb if b["frontRank"] == k]
        if len(bb) < 20:
            continue
        d = Counter(b["dir"] for b in bb if b["touchesLiving"])
        L.append(f"| {k} | {len(bb)} | {np.mean([b['touchesLiving'] for b in bb]):.0%} | {d['side']}/{d['behind']}/{d['front']} |")
    L.append("\n## 3. 뒤 띠 침실: 거실과 가로로 얼마나 떨어져 있나(세대 폭 대비)\n")
    L.append("| 가로 간격 | 침실 수 | 거실과 맞닿음 |")
    L.append("|---|---|---|")
    bk = [b for b in B if b["band"] == "back"]
    for lo, hi, name in [(-1, 1e-9, "겹침(거실 바로 뒤)"), (1e-9, 0.02, "붙음(0~2%)"), (0.02, 0.15, "2~15%"), (0.15, 9, "15% 이상")]:
        bb = [b for b in bk if lo < b["latGap"] <= hi] if lo >= 0 else [b for b in bk if b["latGap"] <= hi]
        if bb:
            L.append(f"| {name} | {len(bb)} | {np.mean([b['touchesLiving'] for b in bb]):.0%} |")
    L.append("\n## 4. 앞 띠 줄 구성\n")
    rows = Counter(" | ".join(r["frontRow"]) for r in R if r["livingIndex"] >= 0)
    sides = Counter((r["livingIndex"], len(r["frontRow"]) - 1 - r["livingIndex"]) for r in R if r["livingIndex"] >= 0)
    L.append("거실 왼쪽·오른쪽 앞 띠 실 수(상위): " + ", ".join(f"({a},{b}) {v / len(R):.0%}" for (a, b), v in sides.most_common(6)))
    L.append("\n앞 띠 줄(가로 순서, 상위 8):\n")
    for k, v in rows.most_common(8):
        L.append(f"- {k} — {v / len(R):.1%}")
    L.append("\n- 침실 깊이 비(세대 깊이 대비) 중앙값: 앞 띠 %.2f, 뒤 띠 %.2f" % (np.median([b["depthFrac"] for b in B if b["band"] == "front"]), np.median([b["depthFrac"] for b in bk])))
    RES.joinpath("bedroom-living.md").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()

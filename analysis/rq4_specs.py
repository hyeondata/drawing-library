"""RQ4 검정용 사양 묶음: 실제 dev 세대의 실 구성(침실 수 × 욕실 수 × 드레스룸 × 다목적공간) 분포에서 사양 N개를 비례 배정한다.

왜: 지금 사양 20개는 서로 다른 구성이 15개뿐이고 손으로 고른 격자라 부트스트랩 군집이 적고(구간이 넓음) 실제 구성 비율과도 다르다.
방법: dev 세대(정리된 그래프, 중복 포함 = 세대 비율) 구성 중 0.5% 이상인 것만, 최대 나머지 배정(구성마다 최소 2개).
면적은 침실 수별 목록을 돌려 쓴다(2실 59·64·74, 3실 74·84·94·101, 4실 101·114·125·135㎡) — 그래프 구조에는 칸 수로만 영향.
사용: uv run python rq4_specs.py [N=80] → ../evidence/results/rq4-specs.json (scripts/lib/rq4-specs.mjs가 읽음)
"""

from __future__ import annotations

import json
import sys
from collections import Counter

from heldout_compare import clean
from real_vs_generated import RES
from rq1_syntax import DER

AREAS = {2: [59, 64, 74], 3: [74, 84, 94, 101], 4: [101, 114, 125, 135]}


def main(n=80):
    c = Counter()
    for line in (DER / "unit-graphs.jsonl").read_text().splitlines():
        o = json.loads(line)
        if o["split"] != "dev":
            continue
        g = clean(o)
        if g is None:
            continue
        t = Counter(tp for _, tp in g.nodes(data="type"))
        c[(t["침실"], min(t["화장실"], 2), t["드레스룸"] > 0, t["다목적공간"] > 0)] += 1
    tot = sum(c.values())
    keep = {k: v / tot for k, v in c.items() if v / tot >= 0.005}
    s = sum(keep.values())
    keep = {k: v / s for k, v in keep.items()}
    alloc = {k: max(2, int(n * p)) for k, p in keep.items()}
    rest = sorted(keep, key=lambda k: n * keep[k] - int(n * keep[k]), reverse=True)
    i = 0
    while sum(alloc.values()) < n:
        alloc[rest[i % len(rest)]] += 1
        i += 1
    specs, seen = [], Counter()
    for k in sorted(alloc, key=lambda k: -alloc[k]):
        bed, baths, dress, multi = k
        for j in range(alloc[k]):
            area = AREAS[bed][(j + seen[bed]) % len(AREAS[bed])]
            specs.append({"area": area, "bedrooms": bed, "baths": baths, "dress": bool(dress), "multi": bool(multi)})
        seen[bed] += alloc[k]
    out = {"n": len(specs), "units": tot, "mix": {str(k): {"share": keep[k], "specs": alloc[k]} for k in alloc}, "specs": specs}
    RES.joinpath("rq4-specs.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    for k in alloc:
        print(k, f"{keep[k]:.1%}", alloc[k])
    print(len(specs), "specs")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 80)

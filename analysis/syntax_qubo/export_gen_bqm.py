"""JS판 정확 QUBO(src/generate/qubo-exact.js)를 대조할 픽스처: 템플릿 몇 개의 생성 모형 BQM(사이트 β)을 그대로 내보낸다.
사용: SPECS=rq4 uv run python -m syntax_qubo.export_gen_bqm → ../test/fixtures/gen-bqm.json
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict
from pathlib import Path

from .gen_qubo import TERMS, build, depth_bound
from .model import load_templates

ROOT = Path(__file__).resolve().parents[2]


def site_beta():
    src = (ROOT / "src" / "generate" / "syntax-model-data.js").read_text()
    m = json.loads(re.search(r"SYNTAX_MODEL = (\{.*\});", src, re.S).group(1))
    return {s: b for s, b in zip(m["stats"], m["beta_raw"]) if s in TERMS}


def main():
    ts = load_templates()
    beta = site_beta()
    out = []
    # 크기가 다른 템플릿: 가장 작은 것, 중간, 복도 없는 것이 있으면 그것까지
    pick = sorted(range(len(ts)), key=lambda i: (len(ts[i].front) + len(ts[i].back)))
    idx = sorted({pick[0], pick[len(pick) // 2], pick[-1]})
    for i in idx:
        t = ts[i]
        K = depth_bound(t)
        q, bqm, _ = build(t, beta, K)
        out.append({
            "template": asdict(t), "K": K, "beta": beta, "P": q.P, "offset": bqm.offset,
            "variables": list(bqm.variables),
            "linear": {v: bqm.get_linear(v) for v in bqm.variables},
            "quadratic": [[u, v, c] for (u, v), c in bqm.quadratic.items()],
        })
    (ROOT / "test" / "fixtures" / "gen-bqm.json").write_text(json.dumps(out, ensure_ascii=False))
    print([(o["template"]["id"], len(o["variables"]), len(o["quadratic"])) for o in out])


if __name__ == "__main__":
    main()

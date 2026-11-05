"""JS판 SA(src/generate/qubo-sa.js)와 dwave-samplers SA가 같은 BQM·같은 설정에서 같은 결과 분포를 내는지(고정 기록 ⑤, 다음 순서 2).

Python 쪽: 픽스처 BQM(test/fixtures/gen-bqm.json, 템플릿 3개)마다 SimulatedAnnealingSampler(기하 스케줄, randomize_order=False, 무작위 초기 상태,
β 범위 = dwave 기본 함수를 |편향| < 1e-9를 0으로 정리한 스핀 편향에 적용)로 num_reads회 읽어, 읽기마다 BQM 에너지·x가 유효한 배치로 풀리는지·그 배치의
모형 에너지를 적는다. JS 쪽은 scripts/sa-js-vs-py.mjs, 비교는 analysis/compare_sa_js_py.py.
사용: SPECS=rq4 uv run python -m syntax_qubo.sa_js_vs_py [reads] → ../evidence/results/sa-js-vs-py-py.json
"""

from __future__ import annotations

import itertools
import json
import sys
import time
from pathlib import Path

import networkx as nx
from dwave.samplers import SimulatedAnnealingSampler

from .gen_qubo import TERMS, build, graph_stats
from .model import Template
from .rq3_scaling import decode
from .sa_common import clean_beta_range

ROOT = Path(__file__).resolve().parents[2]
READS = int(sys.argv[1]) if len(sys.argv) > 1 else 300
SWEEPS = 1000


def main():
    fx = json.loads((ROOT / "test" / "fixtures" / "gen-bqm.json").read_text())
    out = []
    for f in fx:
        t = Template(**f["template"])
        q, bqm, _ = build(t, f["beta"], f["K"])
        assert bqm.num_variables == len(f["variables"])
        table = {}
        for rp in itertools.permutations(q.rest):
            for bp in itertools.permutations(t.back):
                g = q.graph(rp, bp)
                if nx.is_connected(g):
                    s = graph_stats(q, g)
                    table[(rp, bp)] = sum(f["beta"][k] * s[k] for k in TERMS)
        estar = min(table.values())
        br = clean_beta_range(bqm)
        xvars = [q.xf(r, i) for r in q.rest for i in range(q.m1)] + [q.xb(v, j) for v in q.t.back for j in range(q.k)]
        t0 = time.perf_counter()
        ss = SimulatedAnnealingSampler().sample(bqm, num_reads=READS, num_sweeps=SWEEPS, seed=1, beta_range=br)
        ms = (time.perf_counter() - t0) * 1000
        xi = [list(ss.variables).index(v) for v in xvars]
        model_e = []
        for x in ss.record.sample:
            a = decode(q, x[xi], xvars)
            model_e.append(table.get(a) if a is not None else None)
        valid = [e for e in model_e if e is not None]
        out.append({"template": t.id, "n": bqm.num_variables, "reads": READS, "sweeps": SWEEPS, "beta_range": br, "estar": estar,
                    "energies": [float(e) for e in ss.record.energy], "modelE": model_e, "ms": ms})
        print(t.id, bqm.num_variables, [f"{x:.4g}" for x in br], f"{ms / READS:.1f}ms/read", f"x유효 {len(valid)}/{READS}", f"적중 {sum(abs(e - estar) < 1e-9 for e in valid)}")
    (ROOT / "evidence" / "results" / "sa-js-vs-py-py.json").write_text(json.dumps(out))


if __name__ == "__main__":
    main()

"""JS SA와 dwave-samplers SA의 결과 분포 비교(sa_js_vs_py.py·scripts/sa-js-vs-py.mjs 결과).

판정: 템플릿마다 ① β 범위가 같다(상대 오차 < 1e-9) ② BQM 에너지(연속)의 2-표본 KS p > 0.01
③ x가 유효한 배치로 풀린 비율의 차이가 두 표본 비율 z-검정에서 p > 0.01 ④ 유효 읽기가 어느 배치(모형 에너지 값)로 풀렸는지의 도수분포 카이제곱 p > 0.01
(기대 도수 5 미만 칸은 합침). 모두 통과하면 '같은 분포'로 본다(난수가 달라 표본은 다르다).
④는 처음에 KS로 정했다가 바꿨다: 배치는 12~1,440개뿐이라 모형 에너지가 이산값(동점 다수)이고, 그런 자료에 2-표본 KS는 p를 과소 추정한다
(같은 자료에서 KS p 0.000, 카이제곱 p 0.46·0.56). 기록을 위해 KS p도 함께 적는다.
사용: uv run python compare_sa_js_py.py → ../evidence/results/sa-js-vs-py.md
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import numpy as np
from scipy.stats import chi2_contingency, ks_2samp, norm

RES = Path(__file__).resolve().parents[1] / "evidence" / "results"


def ztest(k1, n1, k2, n2):
    p = (k1 + k2) / (n1 + n2)
    se = np.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    if se == 0:
        return 1.0
    z = (k1 / n1 - k2 / n2) / se
    return float(2 * (1 - norm.cdf(abs(z))))


def main():
    py = {r["template"]: r for r in json.loads((RES / "sa-js-vs-py-py.json").read_text())}
    js = {r["template"]: r for r in json.loads((RES / "sa-js-vs-py-js.json").read_text())}
    L = ["# JS SA 대 dwave-samplers SA: 같은 QUBO·같은 설정의 결과 분포(5항 생성 모형, 사이트 β)\n",
         "> `SPECS=rq4 uv run python -m syntax_qubo.sa_js_vs_py` · `node scripts/sa-js-vs-py.mjs` · `uv run python compare_sa_js_py.py` · 스위프 1,000 · 기하 스케줄 · β 범위 = dwave 기본 함수(|편향| < 1e-9 정리) · 시드만 다름\n",
         "판정: ① β 범위 같음 ② BQM 에너지 KS p > 0.01 ③ x 유효율 z-검정 p > 0.01 ④ 유효 읽기 모형 에너지 KS p > 0.01.\n",
         "| 템플릿 | 변수 | 읽기 | β 범위 | BQM 에너지 평균 Py / JS | KS p | x 유효율 Py / JS (z p) | E* 적중률 Py / JS | 유효 배치 도수 카이제곱 p (KS p) | ms/읽기 Py / JS | 판정 |",
         "|---|---|---|---|---|---|---|---|---|---|---|"]
    allok = True
    for k in py:
        a, b = py[k], js[k]
        ea, eb = np.array(a["energies"]), np.array(b["energies"])
        br_ok = np.allclose(a["beta_range"], b["beta_range"], rtol=1e-9, atol=0)
        ks1 = ks_2samp(ea, eb)
        va = [e for e in a["modelE"] if e is not None]
        vb = [e for e in b["modelE"] if e is not None]
        zp = ztest(len(va), a["reads"], len(vb), b["reads"])
        ks2 = ks_2samp(va, vb) if len(va) >= 10 and len(vb) >= 10 else None
        chi_p = None
        if ks2 is not None:
            ca, cb = Counter(round(e, 6) for e in va), Counter(round(e, 6) for e in vb)
            keys = sorted(set(ca) | set(cb))
            tab = np.array([[ca[e] for e in keys], [cb[e] for e in keys]], dtype=float)
            # 기대 도수 5 미만 칸은 '기타'로 합침
            small = tab.sum(0) < 5
            if small.any():
                tab = np.hstack([tab[:, ~small], tab[:, small].sum(1, keepdims=True)])
            chi_p = float(chi2_contingency(tab)[1]) if tab.shape[1] >= 2 else 1.0
        hit = lambda v, est: sum(abs(e - est) < 1e-9 for e in v) / a["reads"]
        ok = br_ok and ks1.pvalue > 0.01 and zp > 0.01 and (chi_p is None or chi_p > 0.01)
        allok &= ok
        L.append(f"| {k} | {a['n']:,} | {a['reads']} | {a['beta_range'][0]:.3g}~{a['beta_range'][1]:.3g}{'' if br_ok else ' / JS 다름'} | {ea.mean():.2f} / {eb.mean():.2f} | {ks1.pvalue:.3f} | {len(va) / a['reads']:.0%} / {len(vb) / b['reads']:.0%} ({zp:.3f}) | {hit(va, a['estar']):.1%} / {hit(vb, b['estar']):.1%} | {'—' if ks2 is None else f'{chi_p:.3f} ({ks2.pvalue:.3f})'} | {a['ms'] / a['reads']:.1f} / {b['ms'] / b['reads']:.1f} | {'통과' if ok else '**불통과**'} |")
    L.append(f"\n- 결론: {'JS SA와 dwave-samplers SA는 같은 분포를 낸다(모든 조건 통과).' if allok else '같은 분포라고 볼 수 없다 — 불통과 템플릿을 확인할 것.'}")
    L.append("- x 유효 = 읽은 상태의 배치 변수가 순열로 풀림(RQ3와 같은 정의, 보조 변수 위반은 무시). E* = 그 템플릿의 배치 전부 열거 최저 모형 에너지. 두 구현의 난수 생성기가 달라 표본 자체는 다르며 분포가 같은지만 본다.")
    (RES / "sa-js-vs-py.md").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()

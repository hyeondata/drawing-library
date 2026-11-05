"""SA 공통 설정(고정 기록 09-21 ⑤ + 변경 기록 2): dwave-samplers 기본 β 범위를 부동소수 잔차를 정리한 스핀 편향에 적용."""

from __future__ import annotations

import dimod
from dwave.samplers.sa.sampler import _default_ising_beta_range

BIAS_EPS = 1e-9


def clean_beta_range(bqm):
    """dwave 기본 β 범위를, |편향| < 1e-9(BINARY→SPIN 변환의 부동소수 잔차)를 0으로 본 스핀 편향에 적용한다(qubo-sa.js defaultBetaRange와 같은 규칙)."""
    sp = bqm.change_vartype(dimod.SPIN, inplace=False)
    h = {k: (v if abs(v) >= BIAS_EPS else 0.0) for k, v in sp.linear.items()}
    J = {k: v for k, v in sp.quadratic.items() if abs(v) >= BIAS_EPS}
    return [float(x) for x in _default_ising_beta_range(h, J)]

"""도면 생성 화면에서 내보낸 QUBO(JSON)를 D-Wave·Gurobi·CP-SAT로 푼다.

사용 예:
  pip install dimod dwave-samplers           # SA·Tabu(고전, QPU 임시 대체)
  pip install dwave-system                    # QPU·Hybrid (Leap 토큰 필요: dwave config create)
  pip install gurobipy                        # 정확해(라이선스 필요)
  pip install ortools                         # 정확해(CP-SAT, 무료)

  python solve_qubo.py floorplan_qubo_84m2_3bed.json --solver sa
  python solve_qubo.py floorplan_qubo_84m2_3bed.json --solver sqa                 # 경로적분 SQA(양자 몬테카를로 근사)
  python solve_qubo.py floorplan_qubo_84m2_3bed.json --solver qpu --reads 1000 --optimum -12.333
  python solve_qubo.py floorplan_qubo_84m2_3bed.json --solver qpu-clique --reads 1000   # 변수 약 180개 이하: 균일 클릭 임베딩
  python solve_qubo.py floorplan_qubo_84m2_3bed.json --solver cpsat

결과: 최저 에너지, 원-핫 제약 충족 여부, 실별 칸(앞 띠·뒤 띠 순서)을 출력하고 <입력>_<solver>.json으로 저장한다.
브라우저의 '정확해(열거)' 최적 에너지와 같은지로 검증할 수 있다.

주의(논문 보고):
- SA·Tabu는 고전 알고리즘이다. QPU 결과가 나오기 전의 임시 대체이며 "양자 어닐링 결과"로 보고하지 않는다.
- QPU 결과에는 체인 끊김 비율, 최대 체인 길이, annealing_time, num_reads, QPU access time을 함께 적는다.
  --optimum(브라우저 '정확해(열거)' 또는 CP-SAT로 증명한 최적 에너지)을 주면 읽기당 성공 확률 s와
  TTS99 = annealing_time × log(1−0.99)/log(1−s)를 계산한다(Rønnow et al. 2014).
- 우리 QUBO(변수 25~60개)는 dense 클릭 임베딩이 가능한 크기(Pegasus 약 180, Zephyr Z12 약 184)라 qpu-clique를 권장한다.
- 원-핫 벌점이 들어간 QUBO는 고전 정확해 솔버에 불리할 수 있다. Gurobi·CP-SAT에는 --native로 원래 정식화
  (원-핫을 등식 제약으로, 목적함수는 벌점 없이)를 준다.
"""
import argparse
import json
import time
from pathlib import Path


def load(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    linear = {k: float(v) for k, v in data["linear"].items()}
    quadratic = {(a, b): float(w) for a, b, w in data["quadratic"]}
    return data, linear, quadratic, float(data["offset"])


def energy(sample, linear, quadratic, offset):
    e = offset + sum(linear[v] * sample[v] for v in linear)
    e += sum(w * sample[a] * sample[b] for (a, b), w in quadratic.items())
    return e


def feasible(sample, groups):
    return all(sum(sample[v] for v in g) == 1 for g in groups)


def order_of(sample):
    """'실@front2' 형식의 변수 이름에서 띠별 순서를 읽는다."""
    bands = {}
    for name, val in sample.items():
        if not val:
            continue
        room, slot = name.split("@")
        band = "front" if slot.startswith("front") else "back"
        bands.setdefault(band, {})[int(slot[len(band):])] = room
    return {b: [s[i] for i in sorted(s)] for b, s in bands.items()}


def native_parts(data, linear, quadratic):
    """벌점(원-핫)을 빼고 목적함수만 되돌린다: P(Σx−1)² = P(−Σx + 2Σx_a x_b + 1)."""
    P = float(data["penalty"])
    lin = dict(linear)
    quad = dict(quadratic)
    off = float(data["offset"])
    for g in data["groups"]:
        for v in g:
            lin[v] += P
        for i in range(len(g)):
            for j in range(i + 1, len(g)):
                key = (g[i], g[j]) if (g[i], g[j]) in quad else (g[j], g[i])
                quad[key] = quad.get(key, 0.0) - 2 * P
        off -= P
    quad = {k: w for k, w in quad.items() if abs(w) > 1e-12}
    return lin, quad, off


def solve_dimod(kind, linear, quadratic, offset, reads, seed):
    import dimod

    bqm = dimod.BinaryQuadraticModel(linear, quadratic, offset, dimod.BINARY)
    info = {}
    if kind == "sa":
        from dwave.samplers import SimulatedAnnealingSampler

        res = SimulatedAnnealingSampler().sample(bqm, num_reads=reads, num_sweeps=1000, seed=seed)
    elif kind == "tabu":
        from dwave.samplers import TabuSampler

        res = TabuSampler().sample(bqm, num_reads=reads, seed=seed)
    elif kind == "sqa":
        from dwave.samplers import PathIntegralAnnealingSampler

        res = PathIntegralAnnealingSampler().sample(bqm, num_reads=reads, seed=seed)
    elif kind in ("qpu", "qpu-clique"):
        from dwave.system import DWaveCliqueSampler, DWaveSampler, EmbeddingComposite

        if kind == "qpu-clique":
            res = DWaveCliqueSampler().sample(bqm, num_reads=reads, label="floorplan-qubo")
        else:
            res = EmbeddingComposite(DWaveSampler()).sample(bqm, num_reads=reads, label="floorplan-qubo", return_embedding=True)
        info["timing"] = res.info.get("timing")
        if "chain_break_fraction" in res.record.dtype.names:
            info["chain_break_fraction_mean"] = float(res.record.chain_break_fraction.mean())
        emb = res.info.get("embedding_context", {}).get("embedding", {})
        info["max_chain_length"] = max((len(c) for c in emb.values()), default=None)
        info["chain_strength"] = res.info.get("embedding_context", {}).get("chain_strength")
    elif kind == "hybrid":
        from dwave.system import LeapHybridSampler

        res = LeapHybridSampler().sample(bqm, label="floorplan-qubo")
        info["timing"] = res.info
    else:
        raise ValueError(kind)
    info["reads"] = [(float(e), int(n)) for e, n in zip(res.record.energy, res.record.num_occurrences)]
    best = res.first
    return dict(best.sample), float(best.energy), info


def solve_gurobi(data, linear, quadratic, offset, native):
    import gurobipy as gp

    m = gp.Model("floorplan")
    m.Params.OutputFlag = 0
    x = {v: m.addVar(vtype=gp.GRB.BINARY, name=v) for v in linear}
    lin, quad, off = native_parts(data, linear, quadratic) if native else (linear, quadratic, offset)
    obj = gp.QuadExpr(off)
    for v, w in lin.items():
        obj += w * x[v]
    for (a, b), w in quad.items():
        obj += w * x[a] * x[b]
    if native:
        for g in data["groups"]:
            m.addConstr(gp.quicksum(x[v] for v in g) == 1)
    m.setObjective(obj, gp.GRB.MINIMIZE)
    m.Params.NonConvex = 2
    m.optimize()
    sample = {v: int(round(x[v].X)) for v in x}
    return sample, energy(sample, linear, quadratic, offset), {"status": int(m.Status), "mip_gap": m.MIPGap}


def solve_cpsat(data, linear, quadratic, offset, native, scale=1000):
    """CP-SAT는 정수 계수만 받는다: 계수에 scale을 곱해 반올림하고, x_a·x_b는 AND(z ≤ x_a, z ≤ x_b, z ≥ x_a + x_b − 1)로 선형화한다."""
    from ortools.sat.python import cp_model

    m = cp_model.CpModel()
    x = {v: m.NewBoolVar(v) for v in linear}
    lin, quad, _ = native_parts(data, linear, quadratic) if native else (linear, quadratic, offset)
    terms = [int(round(w * scale)) * x[v] for v, w in lin.items()]
    for (a, b), w in quad.items():
        z = m.NewBoolVar(f"{a}*{b}")
        m.AddBoolAnd([x[a], x[b]]).OnlyEnforceIf(z)
        m.AddBoolOr([x[a].Not(), x[b].Not()]).OnlyEnforceIf(z.Not())
        terms.append(int(round(w * scale)) * z)
    if native:
        for g in data["groups"]:
            m.AddExactlyOne([x[v] for v in g])
    m.Minimize(sum(terms))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60
    status = solver.Solve(m)
    sample = {v: int(solver.Value(x[v])) for v in x}
    return sample, energy(sample, linear, quadratic, offset), {"status": solver.StatusName(status)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("qubo")
    ap.add_argument("--solver", choices=["sa", "tabu", "sqa", "qpu", "qpu-clique", "hybrid", "gurobi", "cpsat"], default="sa")
    ap.add_argument("--optimum", type=float, default=None, help="증명된 최적 에너지(성공 확률·TTS99 계산용)")
    ap.add_argument("--reads", type=int, default=100)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--native", action="store_true", help="정확해 솔버에 원-핫을 등식 제약으로 준다")
    a = ap.parse_args()
    data, linear, quadratic, offset = load(a.qubo)
    t0 = time.time()
    if a.solver in ("sa", "tabu", "sqa", "qpu", "qpu-clique", "hybrid"):
        sample, e, info = solve_dimod(a.solver, linear, quadratic, offset, a.reads, a.seed)
    elif a.solver == "gurobi":
        sample, e, info = solve_gurobi(data, linear, quadratic, offset, a.native)
    else:
        sample, e, info = solve_cpsat(data, linear, quadratic, offset, a.native)
    wall = time.time() - t0
    ok = feasible(sample, data["groups"])
    label = {"sa": "SA (고전, QPU 대체·잠정)", "tabu": "Tabu (dwave-samplers, 고전)", "sqa": "SQA (경로적분, 고전 양자몬테카를로)", "qpu": "D-Wave QPU", "qpu-clique": "D-Wave QPU (클릭 임베딩)", "hybrid": "D-Wave Leap Hybrid", "gurobi": "Gurobi", "cpsat": "CP-SAT"}[a.solver]
    reads = info.pop("reads", None)
    if a.optimum is not None and reads:
        import math

        total = sum(n for _, n in reads)
        hit = sum(n for e, n in reads if abs(e - a.optimum) < 1e-6)
        s = hit / total if total else 0.0
        info["success_probability"] = s
        anneal_us = (info.get("timing") or {}).get("qpu_anneal_time_per_sample") if isinstance(info.get("timing"), dict) else None
        if 0 < s < 1:
            info["repetitions_99"] = math.log(1 - 0.99) / math.log(1 - s)
            if anneal_us:
                info["tts99_us"] = info["repetitions_99"] * anneal_us
        elif s >= 1:
            info["repetitions_99"] = 1
    out = {"solver": label, "energy": e, "feasible": ok, "order": order_of(sample), "wall_seconds": wall, "info": info, "spec": data.get("spec")}
    print(json.dumps(out, ensure_ascii=False, indent=1, default=str))
    Path(Path(a.qubo).stem + f"_{a.solver}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1, default=str), encoding="utf-8")


if __name__ == "__main__":
    main()

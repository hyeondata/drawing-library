"""RQ3: 정확 공간구문 QUBO를 SA가 얼마나 잘 푸는가 — 규모, 스위프, 벌점 크기, 순열 SA 기준선, D-Wave 임베딩 사전 시험.

인스턴스: 실제 사양 템플릿(배치 48~720개) + 규모를 키운 합성 템플릿(실을 더해 배치 4,320~967,680개).
  합성 템플릿은 실제 평면을 뜻하지 않는다. 같은 정렬 틀·같은 정식화에서 '실 수가 늘면 어떻게 되는가'만 본다.
목적: O1 거실 총깊이, O2 현관 총깊이, O3 공·사 깊이 차(verify_aligned.OBJ와 같음).
측정:
  - E* = 모든 배치 열거(모형 그래프 = 도면 그래프, 09-13 7절)로 구한 정확 최적.
  - QUBO SA(dwave-samplers): 스위프마다 읽기 R개 → 적중 확률 두 가지.
      p   = 읽기의 배치 변수 x를 풀어 낸 배치가 유효하고 목적값 = E*(보조 변수는 x로 정해지므로 도면은 최적).
      p_E = 읽기의 에너지 = E*(보조 변수까지 모두 맞은 QUBO 바닥 상태). 09-13 3·7절의 '도달률'은 이것.
    TTS99 = t_read·ln(0.01)/ln(1−p).
  - 벌점 배수 λ ∈ {1, 0.5, 0.25}(P = λ·(Σ|목적 계수| + 1)): λ < 1이면 바닥 상태의 유효성이 증명되지 않으므로 유효율·바닥 에너지가 E*보다 낮은지도 기록.
  - 순열 SA 기준선: 상태 = (앞 띠 순서, 뒤 띠 순서), 이동 = 같은 띠 두 실 맞바꾸기, 에너지 = 그래프에서 잰 목적값. QUBO로 바꾼 비용을 분리해 본다.
  - 임베딩: minorminer로 Pegasus P16(Advantage 위상)과 Zephyr Z12(Advantage2 위상)에 사전 임베딩(QPU 없이). 큐비트 수, 최대 체인 길이.
사용: SPECS=rq4 uv run python -m syntax_qubo.rq3_scaling → ../evidence/results/rq3-scaling.md/json
"""

from __future__ import annotations

import itertools
import json
import math
import os
import random
import time
from concurrent.futures import ProcessPoolExecutor
from dataclasses import replace
from pathlib import Path

import networkx as nx
import numpy as np

from .aligned import AlignedQubo
from .model import load_templates
from .verify_aligned import OBJ, true_value, weights

RES = Path(__file__).resolve().parents[2] / "evidence" / "results"
WORKERS = os.cpu_count() or 8


def instances():
    ts = load_templates()
    # 크기(앞 rest 실 수, 뒤 실 수)로 대표 템플릿을 고른다(사양 묶음이 바뀌어도 같은 크기 유형을 고르도록)
    by = lambda m1, k: next(t for t in ts if len(t.front) - 1 == m1 and len(t.back) == k)  # noqa: E731
    out = [(f"real {by(2, 4).id} (2+4)", by(2, 4)), (f"real {by(3, 4).id} (3+4)", by(3, 4)), (f"real {by(3, 5).id} (3+5)", by(3, 5))]
    base = by(3, 4)  # 앞 rest 3(거실·침실 둘), 뒤 4
    extra_back = [("bed4", "침실"), ("bath3", "화장실"), ("util", "다목적공간"), ("bed5", "침실")]
    extra_front = [("bedF", "침실")]
    for nb, nf in [(2, 0), (3, 0), (3, 1), (4, 1)]:
        add_b = extra_back[:nb]
        add_f = extra_front[:nf]
        types = {**base.types, **dict(add_b), **dict(add_f)}
        t = replace(base, id=f"syn+{nb}b+{nf}f", front=base.front + [n for n, _ in add_f], back=base.back + [n for n, _ in add_b], m=base.m + nf, k=base.k + nb, types=types)
        out.append((f"synthetic +{nb} back +{nf} front", t))
    return out


def _enum_chunk(args):
    t, rest_perms, K_only = args
    q = AlignedQubo(t)
    vals = {name: [] for name in OBJ}
    K = 0
    for rp in rest_perms:
        for bp in itertools.permutations(t.back):
            g = q.graph(rp, bp)
            if not nx.is_connected(g):
                continue
            for root in ("entrance", "living"):
                K = max(K, max(nx.single_source_shortest_path_length(g, root).values()))
            if K_only:
                continue
            for name, (root, _lb, wk) in OBJ.items():
                vals[name].append(true_value(g, root, weights(q, wk)))
    return K, {n: (min(v) if v else math.inf) for n, v in vals.items()}, sum(1 for _ in [0])


def enumerate_opt(t):
    q = AlignedQubo(t)
    perms = list(itertools.permutations(q.rest))
    chunks = [perms[i::WORKERS] for i in range(WORKERS)]
    chunks = [c for c in chunks if c]
    with ProcessPoolExecutor(WORKERS) as ex:
        res = list(ex.map(_enum_chunk, [(t, c, False) for c in chunks]))
    K = max(r[0] for r in res)
    estar = {n: min(r[1][n] for r in res) for n in OBJ}
    return K, estar, math.factorial(len(q.rest)) * math.factorial(len(t.back))


def build(t, name, K, lam=1.0):
    root, lb, wk = OBJ[name]
    q = AlignedQubo(t)
    q.depth_structure(root, K, lb)
    w = weights(q, wk)
    obj = q.total_depth(root, w)
    if lam != 1.0:
        # finalize는 P = Σ|목적 계수| + 1을 쓴다. 목적을 1/λ배로 키워 넣고 결과를 λ배 하면 P만 λ배가 된 것과 같다.
        obj = {k: v / lam for k, v in obj.items()}
        bqm = q.finalize(obj)
        bqm.scale(lam)
    else:
        bqm = q.finalize(obj)
    return q, bqm, w


def _sa(args):
    ser, reads, sweeps, seed, xvars = args
    import dimod
    from dwave.samplers import SimulatedAnnealingSampler

    bqm = dimod.BinaryQuadraticModel.from_serializable(ser)
    t0 = time.time()
    ss = SimulatedAnnealingSampler().sample(bqm, num_reads=reads, num_sweeps=sweeps, seed=seed)
    dt = time.time() - t0
    idx = [ss.variables.index(v) for v in xvars]
    return ss.record.energy.tolist(), ss.record.sample[:, idx].tolist(), dt


def decode(q, xs, xvars):
    st = dict(zip(xvars, xs))
    rest = [None] * q.m1
    for r in q.rest:
        on = [i for i in range(q.m1) if st[q.xf(r, i)]]
        if len(on) != 1 or rest[on[0]] is not None:
            return None
        rest[on[0]] = r
    back = [None] * q.k
    for v in q.t.back:
        on = [j for j in range(q.k) if st[q.xb(v, j)]]
        if len(on) != 1 or back[on[0]] is not None:
            return None
        back[on[0]] = v
    return tuple(rest), tuple(back)


def sa_measure(q, bqm, name, w, estar, reads, sweeps):
    xvars = [q.xf(r, i) for r in q.rest for i in range(q.m1)] + [q.xb(v, j) for v in q.t.back for j in range(q.k)]
    per = max(1, reads // WORKERS)
    ser = bqm.to_serializable()
    with ProcessPoolExecutor(WORKERS) as ex:
        out = list(ex.map(_sa, [(ser, per, sweeps, 7000 + i, xvars) for i in range(WORKERS)]))
    en = np.array([e for o in out for e in o[0]])
    xs = [x for o in out for x in o[1]]
    t_read = np.mean([o[2] / per for o in out])
    root = OBJ[name][0]
    hit = valid = 0
    for x in xs:
        a = decode(q, x, xvars)
        if a is None:
            continue
        g = q.graph(*a)
        if not nx.is_connected(g):
            continue
        valid += 1
        if abs(true_value(g, root, w) - estar) < 1e-9:
            hit += 1
    n = len(xs)
    p = hit / n
    tts = t_read * math.log(0.01) / math.log(1 - p) if 0 < p < 1 else (t_read if p >= 1 else math.inf)
    p_e = float(np.mean(np.abs(en - estar) < 1e-9))
    return {"reads": n, "p": p, "p_energy": p_e, "valid": valid / n, "below_estar": int(np.sum(en < estar - 1e-9)), "t_read": t_read, "tts99": tts}


def _perm_sa(args):
    t, name, steps, seed = args
    q = AlignedQubo(t)
    root, _lb, wk = OBJ[name]
    w = weights(q, wk)
    rnd = random.Random(seed)
    rest, back = list(q.rest), list(t.back)
    rnd.shuffle(rest)
    rnd.shuffle(back)

    def energy(r, b):
        g = q.graph(tuple(r), tuple(b))
        return true_value(g, root, w) if nx.is_connected(g) else 1e9

    e = energy(rest, back)
    best = e
    t0 = time.time()
    T0, T1 = 2.0, 0.02
    for s in range(steps):
        T = T0 * (T1 / T0) ** (s / max(1, steps - 1))
        band = rest if (len(rest) > 1 and (len(back) < 2 or rnd.random() < len(rest) / (len(rest) + len(back)))) else back
        i, j = rnd.sample(range(len(band)), 2)
        band[i], band[j] = band[j], band[i]
        e2 = energy(rest, back)
        if e2 <= e or rnd.random() < math.exp(-(e2 - e) / T):
            e = e2
            best = min(best, e)
        else:
            band[i], band[j] = band[j], band[i]
    return best, time.time() - t0


def perm_measure(t, name, estar, steps, runs=64):
    with ProcessPoolExecutor(WORKERS) as ex:
        out = list(ex.map(_perm_sa, [(t, name, steps, 9000 + i) for i in range(runs)]))
    p = np.mean([abs(b - estar) < 1e-9 for b, _ in out])
    t_run = np.mean([d for _, d in out])
    tts = t_run * math.log(0.01) / math.log(1 - p) if 0 < p < 1 else (t_run if p >= 1 else math.inf)
    return {"runs": runs, "p": float(p), "t_run": float(t_run), "tts99": tts}


def embed(bqm, target_name):
    import dwave_networkx as dnx
    import minorminer

    tg = dnx.pegasus_graph(16) if target_name == "Pegasus P16" else dnx.zephyr_graph(12)
    src = list(bqm.quadratic.keys())
    t0 = time.time()
    emb = minorminer.find_embedding(src, tg.edges, timeout=120, random_seed=1)
    dt = time.time() - t0
    if not emb:
        return {"ok": False, "time": dt}
    chains = [len(c) for c in emb.values()]
    return {"ok": True, "qubits": int(sum(chains)), "max_chain": int(max(chains)), "mean_chain": float(np.mean(chains)), "time": dt}


def main():
    rows = []
    for label, t in instances():
        t0 = time.time()
        K, estar, narr = enumerate_opt(t)
        t_enum = time.time() - t0
        for name in OBJ:
            q, bqm, w = build(t, name, K)
            r = {"instance": label, "id": t.id, "arrangements": narr, "objective": name, "vars": bqm.num_variables, "quad": bqm.num_interactions, "estar": estar[name], "t_enum": t_enum, "sa": {}, "lam": {}, "perm": {}, "embed": {}}
            for sweeps in (1000, 10000, 50000):
                reads = 640 if sweeps < 50000 else 320
                r["sa"][sweeps] = sa_measure(q, bqm, name, w, estar[name], reads, sweeps)
            if name == "O1_living_TD":
                for lam in (0.5, 0.25):
                    q2, b2, w2 = build(t, name, K, lam)
                    r["lam"][lam] = sa_measure(q2, b2, name, w2, estar[name], 640, 10000)
            for steps in (300, 3000):
                r["perm"][steps] = perm_measure(t, name, estar[name], steps)
            if name == "O1_living_TD":
                for tg in ("Pegasus P16", "Zephyr Z12"):
                    r["embed"][tg] = embed(bqm, tg)
            rows.append(r)
            print(label, name, r["vars"], r["quad"], {s: round(v["p"], 4) for s, v in r["sa"].items()}, {s: round(v["p"], 3) for s, v in r["perm"].items()}, r["embed"], flush=True)
            RES.joinpath("rq3-scaling.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1, default=float))
    report(rows)


def fmt_t(x):
    return "∞" if not math.isfinite(x) else (f"{x * 1000:.0f} ms" if x < 1 else f"{x:.1f} s")


def report(rows):
    L = ["# RQ3: 정확 공간구문 QUBO의 SA 성능 — 규모·스위프·벌점·순열 SA·임베딩\n"]
    L.append(f"> `SPECS=rq4 uv run python -m syntax_qubo.rq3_scaling` · CPU {WORKERS}코어 · dwave-samplers SA · 적중 = 유효한 배치이면서 목적값이 열거 최적 E*와 같음 · TTS99 = 99% 확률로 한 번 이상 적중하는 데 드는 시간(읽기 하나 시간 × ln0.01/ln(1−p))\n")
    L.append("## 1. QUBO SA: 규모와 스위프\n")
    L.append("| 인스턴스 | 배치 수 | 목적 | 변수 | 이차항 | p 배치 최적 (1k / 10k / 50k 스위프) | p_E 바닥 상태 (1k / 10k / 50k) | TTS99, p 기준 (1k / 10k / 50k) | E*보다 낮은 읽기 |")
    L.append("|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        s = r["sa"]
        ks = sorted(s, key=int)
        L.append(f"| {r['instance']} | {r['arrangements']:,} | {r['objective']} | {r['vars']:,} | {r['quad']:,} | " + " / ".join(f"{s[k]['p']:.2%}" for k in ks) + " | " + " / ".join(f"{s[k]['p_energy']:.2%}" for k in ks) + " | " + " / ".join(fmt_t(s[k]["tts99"]) for k in ks) + f" | {sum(s[k]['below_estar'] for k in ks)} |")
    L.append("\n## 2. 벌점 배수 λ (O1, 10k 스위프)\n")
    L.append("| 인스턴스 | λ = 1 p / 유효율 | λ = 0.5 p / 유효율 / E*보다 낮음 | λ = 0.25 p / 유효율 / E*보다 낮음 |")
    L.append("|---|---|---|---|")
    for r in rows:
        if not r["lam"]:
            continue
        b = r["sa"][10000] if 10000 in r["sa"] else r["sa"]["10000"]
        lam = {str(k): v for k, v in r["lam"].items()}
        L.append(f"| {r['instance']} | {b['p']:.2%} / {b['valid']:.0%} | " + " | ".join(f"{lam[k]['p']:.2%} / {lam[k]['valid']:.0%} / {lam[k]['below_estar']}" for k in ("0.5", "0.25")) + " |")
    L.append("\n## 3. 순열 SA 기준선(QUBO 없이 배치를 직접 탐색)\n")
    L.append("| 인스턴스 | 목적 | p (300 / 3000 걸음) | TTS99 (300 / 3000) |")
    L.append("|---|---|---|---|")
    for r in rows:
        pp = {str(k): v for k, v in r["perm"].items()}
        L.append(f"| {r['instance']} | {r['objective']} | {pp['300']['p']:.0%} / {pp['3000']['p']:.0%} | {fmt_t(pp['300']['tts99'])} / {fmt_t(pp['3000']['tts99'])} |")
    L.append("\n## 4. D-Wave 사전 임베딩(minorminer, QPU 없이, O1)\n")
    L.append("| 인스턴스 | 논리 변수 | Pegasus P16 (5,640큐비트): 큐비트 / 최대 체인 | Zephyr Z12 (4,800큐비트): 큐비트 / 최대 체인 |")
    L.append("|---|---|---|---|")
    for r in rows:
        if not r["embed"]:
            continue
        cells = []
        for tg in ("Pegasus P16", "Zephyr Z12"):
            e = r["embed"][tg]
            cells.append(f"{e['qubits']:,} / {e['max_chain']}" if e["ok"] else f"실패({e['time']:.0f}초 제한)")
        L.append(f"| {r['instance']} | {r['vars']:,} | " + " | ".join(cells) + " |")
    L.append("\n## 읽는 법과 한계\n")
    L.append("- 합성 인스턴스는 실제 평면이 아니라 규모 실험용이다(같은 정렬 틀·정식화에 실을 더함).")
    L.append("- 벌점 λ < 1은 바닥 상태가 유효하다는 보장이 없다. 'E*보다 낮음'이 0보다 크면 그 λ에서는 정식화가 틀린 답을 바닥 상태로 갖는다.")
    L.append("- 임베딩은 QPU 없이 위상 그래프에만 맞춘 것이다. 실제 QPU의 결함 큐비트·체인 강도·어닐링 시간은 반영하지 않았다.")
    L.append("- 열거 시간과 비교해 SA가 의미 있는 규모는 열거가 불가능해지는 영역이다. 열거 시간은 json의 t_enum.")
    RES.joinpath("rq3-scaling.md").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()

// 후보 C-1 외곽 실현률 판정(Confluence 10-05 결정, 10-07 사전 등록). 정확 QUBO가 고르는 그래프(정렬 틀 배치의 맞닿음 그래프)를
// 틀 없이 실제 AI 허브 외곽 안에 자유형 엔진(SA)으로 실현했을 때, 실현된 그래프가 목표 그래프와 정확히 같은 비율을 잰다.
//
// 사전 등록(결과를 보기 전에 정함, 이 파일의 첫 commit이 기록):
//   단위 = 외곽 묶음 o1~o12 × 침실 2~4(그 묶음에 세대가 있는 것) = outline-projection과 같은 34개. 투영 통과 여부로 고르지 않는다.
//   외곽 = 묶음 대표 세대 실내 외곽 largest(maskFromUnit(rep, 사양 면적)), 0.3 m 칸. 평면 상자·깊이는 outline-projection과 같다.
//   항목(목표 그래프) = (사양, 템플릿, 앞 띠 순서, 뒤 띠 순서). 연결된 그래프만.
//     (a) GEN 최적: 단위의 사양마다 GEN 에너지(Σ β·O, 사이트 β) 최소 배치 하나(동률이면 열거 순서상 첫째 = 생성기가 내는 것).
//     (b) 그래프 공간 표본: 단위의 모든 항목에서 균등 무작위 100개(비복원, 시드 = 20261106 + 단위 번호).
//         100 = 단위별 비율의 95% Wilson 구간 반폭이 p = 0.5에서 약 0.10 이하가 되는 크기.
//   보정 집합(시험과 분리) = 묶음마다 대표 세대가 아닌 첫 세대(byBeds 순서)의 실내 외곽 12개 × 3침실 대표 사양, 외곽마다 항목 9개
//     (균등 무작위, 시드 20261106 + 100 + 묶음 번호) = 108항목. 시험 외곽(대표 세대)과 겹치지 않으면서 시험과 같은 분포(실제 외곽)에서 고른다
//     (튜닝 인스턴스와 보지 않은 시험 인스턴스를 나누는 구조: irace TR/IRIDIA/2011-004, 튜닝 데이터 오차의 낙관 편향: Cawley & Talbot 2010).
//   정합성 대조 = 꽉 찬 직사각형(3침실 대표 사양, outline-projection 대조와 같은 상자), 항목 100개(시드 20261106). 보정 설정으로 한 번 돌려 보고만.
//   실현(C-1) = src/generate/realize.js realizeInOutline: 자유형 엔진 exactGraph 모드(목표 간선 = need, 목표 밖 실내 실 쌍 = forbid),
//     초기 배치는 정렬 평면의 실 중심을 외곽 상자에 옮긴 씨앗. 항목마다 한 번, 시드 = 항목 번호 + 1.
//   보정(시험 외곽 결과를 보기 전에 자동으로 끝냄): 보정 집합에서만 가중치 w(adj = extra = w) ∈ {1.5, 6, 20} × 단계 수 ∈ {30000, 100000, 300000}
//     9개 조합의 실현률을 재고 가장 높은 조합을 고정한다. 동률이면 단계 수가 작은 것, 그다음 w가 작은 것. 보정 결과는 별도 파일에 남긴다.
//   맞닿음 주 규약 = 공유 변 2칸(0.6 m) 이상. AI 허브 그래프 규약 minContact 40px(약 0.44 m)를 넘는 가장 짧은 칸 길이.
//   성공 = ① 모든 실내 실이 1칸 이상(엔진이 실마다 한 덩어리를 유지) ② 현관이 외곽 바깥에 0.9 m 이상 ③ 실현 그래프 = 목표 그래프(누락 0, 초과 0).
//   비교 방법(현행) = 외곽 투영(projection.js)을 같은 항목에 적용, 같은 주 규약으로 판정(고운 칸 0.1 m에서 공유 변 ≥ 0.6 m,
//     모든 실 남음·한 덩어리·그래프 = 목표). 결정적이므로 시드 없음.
//   주 분석 = (a)+(b) 합친 항목에서 실현률 차이 Δ = C-1 − 투영(같은 주 규약). 95% 구간은 단위(34개)를 복원 추출하는 군집 부트스트랩
//     10,000회(시드 20261106, 백분위 구간).
//   견고성(채택 규칙에 포함): 정렬 평면 배치의 53.7%가 0.6 m 미만으로 닿는 목표 간선을 하나 이상 가진다(직사각형 대조에서 사전 확인,
//     QUBO 그래프는 > 0.05 m로 센다). 그래서 투영은 주 규약에서 구조적으로 불리하다. 투영을 원래 사전 등록 규약(고운 칸 1칸 = 0.1 m 이상
//     닿으면 맞닿음, outline-projection)으로 판정한 Δ' = C-1(주 규약) − 투영(원 규약)도 같은 방법으로 구간을 낸다.
//   채택 규칙: Δ 하한 > 0 그리고 Δ' 하한 > 0 → '채택(C-1이 현행보다 낫다)'. Δ 하한 > 0이지만 Δ'는 아니면 '규약에 따른 우위(조건부)'.
//     Δ 상한 < 0 → '현행보다 못하다'. 그 밖은 '차이 확인 안 됨'. 보정이 끝난 뒤 설정을 바꾸지 않는다. 고치면 새 사전 등록(결과 후 수정임을 명시).
//   보고만(판정에 쓰지 않음): C-1·투영 각각의 실현률과 군집 부트스트랩 구간, (a)만의 같은 분석, McNemar mid-p(군집 무시, 양측;
//     정확 조건부 검정은 지나치게 보수적이라 mid-p: Fagerland, Lydersen & Laake 2013), 직사각형 대조 실현률,
//     단위별 Wilson 95% 구간, 실패 유형(누락·초과·현관·실 사라짐), 민감도 규약 1칸(0.3 m)·3칸(0.9 m)에서의 실현률,
//     실 면적 오차 중앙값, 실행 시간. (분리 삼각형은 평면 임베딩 없이 그래프만으로는 정의되지 않아 넣지 않았다: 합성 외곽 점검에서
//     임베딩 없는 판정이 모든 목표를 '있음'으로 셌다.)
// 사용: SPECS=rq4 node scripts/outline-aware/graph-realize.mjs [--workers 14] [--limit-units N(점검용)]
//   → evidence/results/outline-aware/graph-realize-calibration.json, graph-realize.json/md
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { buildLayout } from '../../src/generate/layout.js';
import { defaultParams, templates } from '../../src/generate/compare.js';
import { evalArrangement, layoutGraph } from '../../src/generate/syntax-gen.js';
import { modelBeta } from '../../src/generate/qubo-sa.js';
import { SYNTAX_MODEL } from '../../src/generate/syntax-model-data.js';
import { fineMask, project } from '../../src/generate/projection.js';
import { realizeInOutline, judgeRealized, judgeProjected } from '../../src/generate/realize.js';
import { largest, maskFromUnit, templateMask } from '../../src/freeform/outline.js';
import { rng } from '../../src/freeform/engine.js';
import { specs } from '../lib/rq4-specs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUTL = JSON.parse(fs.readFileSync(path.join(root, 'public/data/outlines.json'), 'utf8'));
let OUTDIR = path.join(root, 'evidence/results/outline-aware');
const CELL = 0.3;
const SEED = 20261106;
let N_SAMPLE = 100;
let N_CAL = 9;
let GRID = { w: [1.5, 6, 20], steps: [30000, 100000, 300000] };
let BOOT = 10000;

function* perms(a) {
  if (a.length <= 1) return yield a.slice();
  for (let i = 0; i < a.length; i++) for (const p of perms([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...p];
}

/** 사양 × 마스크 → 정렬 평면을 만들 사양·기본값(outline-projection checkSpec과 같은 상자 맞춤). */
function frame(spec, mask) {
  const W = mask.nx * CELL;
  const D = mask.ny * CELL;
  const spec2 = { ...spec, area: W * D };
  return { spec2, base: { ...defaultParams(spec2), depth: D } };
}
const layoutOf = (spec2, base, rp, bp) => buildLayout(spec2, { ...structuredClone(base), frontOrder: ['master', ...rp], backOrder: bp, align: true });
const controlMask = () => {
  const s = specs.find((x) => x.bedrooms === 3);
  const D = defaultParams(s).depth;
  const nx = Math.round(s.area / D / CELL);
  const ny = Math.round(D / CELL);
  return { spec: s, mask: { nx, ny, cells: new Uint8Array(nx * ny).fill(1) } };
};
/** 보정 외곽: 묶음마다 대표 세대가 아닌 첫 세대. */
const calUnit = (bundleId) => {
  const o = OUTL.outlines.find((x) => x.id === bundleId);
  return Object.values(o.byBeds).flat().find((u) => u.id !== o.rep.id);
};
function unitMask(unitId, specIdx) {
  const s = specs[specIdx];
  if (unitId === 'control') return controlMask().mask;
  if (unitId.startsWith('syn:')) return templateMask(unitId.slice(4), s.area); // --smoke 전용 합성 외곽(보정·시험에 쓰지 않음)
  if (unitId.startsWith('cal:')) return largest(maskFromUnit(calUnit(unitId.slice(4)), s.area));
  const o = OUTL.outlines.find((x) => x.id === unitId);
  return largest(maskFromUnit(o.rep, s.area));
}

// ---------- 작업자: 항목 하나 실현·판정 ----------
if (!isMainThread) {
  const cache = new Map();
  parentPort.on('message', (job) => {
    const key = `${job.unit}|${job.spec}`;
    if (!cache.has(key)) {
      const mask = unitMask(job.unit, job.spec);
      cache.set(key, { mask, ...frame(specs[job.spec], mask), fm: fineMask(mask, CELL) });
    }
    const { mask, spec2, base, fm } = cache.get(key);
    const lay = layoutOf(spec2, base, job.rp, job.bp);
    const t0 = Date.now();
    const r = realizeInOutline(lay, mask, { seed: job.seed, steps: job.steps, weights: { adj: job.w, extra: job.w } });
    const ms = Date.now() - t0;
    const j = r.judge;
    const out = { id: job.id, ok: j.ok, hasAll: j.hasAll, entryOk: j.entryOk, missing: j.missing.length, extra: j.extra.length, ms };
    if (job.full) {
      const s1 = judgeRealized(r.res.assign, r.P, r.unit, { minCells: 1 });
      const s3 = judgeRealized(r.res.assign, r.P, r.unit, { minCells: 3 });
      Object.assign(out, { ok1: s1.ok, ok3: s3.ok });
      const errs = r.P.movable.filter((k) => k < r.unit.keys.length).map((k) => Math.abs((j.stats[k]?.n || 0) - r.P.target[k]) / r.P.target[k]);
      errs.sort((a, b) => a - b);
      out.areaErr = errs.length ? errs[Math.floor(errs.length / 2)] : null;
      const pr = project(lay, fm);
      const jp = judgeProjected(pr, lay);
      const jp1 = judgeProjected(pr, lay, { minLen: 0.1 });
      Object.assign(out, { projOk: jp.ok, projOkOrig: jp1.ok, projMissing: jp.missing.length, projExtra: jp.extra.length});
    }
    parentPort.postMessage(out);
  });
}

// ---------- 주 스레드 ----------
const GEN_IDX = (() => {
  const beta = modelBeta();
  return SYNTAX_MODEL.stats.map((s, j) => [j, beta[s] ?? 0]).filter(([, b]) => b);
})();
const genEnergy = (f) => GEN_IDX.reduce((t, [j, b]) => t + b * f[j], 0);

/** 단위의 모든 연결 항목과 사양별 GEN 최적 항목. */
function itemsOf(unitId, specIdxs) {
  const all = [];
  const best = [];
  for (const si of specIdxs) {
    const mask = unitMask(unitId, si);
    const { spec2, base } = frame(specs[si], mask);
    let top = null;
    for (const t of templates(spec2, 'hand')) {
      const rest = t.q.bands.front.rooms.filter((x) => x !== 'master');
      for (const rp of perms(rest))
        for (const bp of perms(t.q.bands.back.rooms)) {
          const a = evalArrangement(spec2, base, t, rp, bp);
          if (!a) continue; // 연결되지 않은 그래프
          const it = { unit: unitId, spec: si, k: t.k, rp, bp };
          all.push(it);
          const E = genEnergy(a.f);
          if (!top || E < top.E) top = { E, it };
        }
    }
    if (top) best.push({ ...top.it, set: 'a', genE: top.E });
  }
  return { all, best };
}
function sample(arr, n, seed) {
  const r = rng(seed);
  const b = arr.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b.slice(0, Math.min(n, b.length));
}

async function runPool(jobs, workers, label) {
  const results = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: Math.min(workers, jobs.length) }, () => new Promise((resolve, reject) => {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: {} });
      const feed = () => {
        if (next >= jobs.length) return w.terminate().then(resolve);
        const i = next++;
        w.postMessage({ ...jobs[i], id: i });
      };
      w.on('message', (m) => {
        results[m.id] = m;
        done++;
        if (done % 50 === 0 || done === jobs.length) console.log(`${label} ${done}/${jobs.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        feed();
      });
      w.on('error', reject);
      feed();
    })),
  );
  return results;
}

const wilson = (k, n, z = 1.959964) => {
  if (!n) return [null, null];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - h, c + h];
};
/** 군집 부트스트랩: rows에 unit 필드, stat(rows) → 값. 단위를 복원 추출해 항목을 모은다. 백분위 95%. */
function clusterBoot(rows, stat, seed = SEED, B = BOOT) {
  const units = [...new Set(rows.map((x) => x.unit))];
  const by = new Map(units.map((u) => [u, rows.filter((x) => x.unit === u)]));
  const r = rng(seed);
  const vals = [];
  for (let b = 0; b < B; b++) {
    const pick = [];
    for (let i = 0; i < units.length; i++) pick.push(...by.get(units[Math.floor(r() * units.length)]));
    vals.push(stat(pick));
  }
  vals.sort((a, b) => a - b);
  return [vals[Math.floor(0.025 * B)], vals[Math.ceil(0.975 * B) - 1]];
}
/** McNemar mid-p(양측): 불일치 쌍 b(C-1만 성공), c(투영만 성공). p = 2·(P(X ≤ k) − ½·P(X = k)), X ~ Bin(b + c, ½), k = min(b, c). */
export function mcnemarMidP(b, c) {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  let cdf = 0;
  let term = Math.pow(0.5, n);
  let atK = 0;
  for (let i = 0; i <= k; i++) {
    cdf += term;
    if (i === k) atK = term;
    term *= (n - i) / (i + 1);
  }
  return Math.min(1, 2 * (cdf - 0.5 * atK));
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const workers = Number(arg('--workers', Math.max(1, os.cpus().length - 2)));
  const limitUnits = arg('--limit-units', null);
  // --smoke <dir>: 코드 경로 점검만. 합성 외곽(ㄱ자·엇갈림)과 아주 작은 격자를 쓰고, 보정 집합·시험 외곽은 건드리지 않는다.
  const smoke = arg('--smoke', null);
  if (smoke) ((OUTDIR = path.resolve(smoke)), (N_SAMPLE = 3), (N_CAL = 3), (GRID = { w: [1.5], steps: [2000] }), (BOOT = 200));
  fs.mkdirSync(OUTDIR, { recursive: true });

  // 1) 보정: 보정 집합(대표 세대가 아닌 실제 외곽)에서만
  const ctl = controlMask();
  const ctlIdx = specs.indexOf(ctl.spec);
  const calSet = smoke ? [{ id: 'syn:L' }] : OUTL.outlines.map((o) => ({ id: `cal:${o.id}` }));
  const calItems = calSet.flatMap((o, bi) => sample(itemsOf(o.id, [ctlIdx]).all, N_CAL, SEED + 100 + bi));
  const calib = [];
  for (const steps of GRID.steps)
    for (const w of GRID.w) {
      const res = await runPool(calItems.map((it, i) => ({ ...it, seed: i + 1, steps, w })), workers, `calib w=${w} steps=${steps}`);
      const k = res.filter((x) => x.ok).length;
      calib.push({ w, steps, ok: k, n: res.length, rate: k / res.length, msMedian: res.map((x) => x.ms).sort((a, b) => a - b)[Math.floor(res.length / 2)] });
    }
  // 가장 높은 실현률, 동률이면 단계 수 작은 것, 그다음 w 작은 것
  const chosen = calib.slice().sort((a, b) => b.ok - a.ok || a.steps - b.steps || a.w - b.w)[0];
  // 정합성 대조(보고만): 직사각형에서 고른 설정으로 한 번
  const ctlItems = sample(itemsOf('control', [ctlIdx]).all, N_SAMPLE, SEED);
  const ctlRes = await runPool(ctlItems.map((it, i) => ({ ...it, seed: i + 1, steps: chosen.steps, w: chosen.w })), workers, 'control');
  const control = { ok: ctlRes.filter((x) => x.ok).length, n: ctlRes.length };
  fs.writeFileSync(path.join(OUTDIR, 'graph-realize-calibration.json'), JSON.stringify({ grid: GRID, calUnits: smoke ? calSet : OUTL.outlines.map((o) => ({ bundle: o.id, unit: calUnit(o.id).id })), items: calItems.length, calib, chosen, control }, null, 1));
  console.log('chosen', chosen, 'control', control);

  // 2) 본 실행(보정 설정 고정)
  const units = [];
  let ui = 0;
  for (const o of OUTL.outlines)
    for (const b of [2, 3, 4]) {
      if (!o.byBeds[b]?.length) continue;
      units.push({ id: o.id, bedrooms: b, n: ui++, share: o.share });
    }
  const use = smoke ? [{ id: 'syn:step', bedrooms: 3, n: 0 }] : limitUnits ? units.slice(0, Number(limitUnits)) : units;
  const jobs = [];
  for (const u of use) {
    const sis = specs.map((s, i) => [s, i]).filter(([s]) => s.bedrooms === u.bedrooms).map(([, i]) => i);
    const { all, best } = itemsOf(u.id, sis);
    const tag = `${u.id}·${u.bedrooms}`;
    for (const it of best) jobs.push({ ...it, unitTag: tag });
    for (const it of sample(all, N_SAMPLE, SEED + u.n)) jobs.push({ ...it, set: 'b', unitTag: tag });
  }
  const seeded = jobs.map((j, i) => ({ ...j, seed: i + 1, steps: chosen.steps, w: chosen.w, full: true }));
  const res = await runPool(seeded, workers, 'main');
  const rows = seeded.map((j, i) => ({ unit: j.unitTag, set: j.set, spec: j.spec, k: j.k, rp: j.rp, bp: j.bp, ...res[i] }));

  // 3) 분석
  const rate = (rs, f = 'ok') => (rs.length ? rs.filter((x) => x[f]).length / rs.length : NaN);
  const delta = (rs) => rate(rs, 'ok') - rate(rs, 'projOk');
  const deltaOrig = (rs) => rate(rs, 'ok') - rate(rs, 'projOkOrig');
  const analyse = (rs) => {
    const b = rs.filter((x) => x.ok && !x.projOk).length;
    const c = rs.filter((x) => !x.ok && x.projOk).length;
    return {
      n: rs.length, c1: rate(rs), c1CI: clusterBoot(rs, (p) => rate(p)), proj: rate(rs, 'projOk'), projCI: clusterBoot(rs, (p) => rate(p, 'projOk')),
      delta: delta(rs), deltaCI: clusterBoot(rs, delta), projOrig: rate(rs, 'projOkOrig'), deltaOrig: deltaOrig(rs), deltaOrigCI: clusterBoot(rs, deltaOrig), mcnemar: { onlyC1: b, onlyProj: c, midP: mcnemarMidP(b, c) },
      sens1: rate(rs, 'ok1'), sens3: rate(rs, 'ok3'),
    };
  };
  const primary = analyse(rows);
  const verdict = primary.deltaCI[0] > 0
    ? primary.deltaOrigCI[0] > 0 ? '채택(C-1이 현행 투영보다 낫다)' : '규약에 따른 우위(조건부)'
    : primary.deltaCI[1] < 0 ? '현행보다 못하다' : '차이 확인 안 됨';
  const perUnit = use.map((u) => {
    const tag = `${u.id}·${u.bedrooms}`;
    const rs = rows.filter((x) => x.unit === tag);
    const k = rs.filter((x) => x.ok).length;
    const kp = rs.filter((x) => x.projOk).length;
    return { unit: tag, n: rs.length, c1: k / rs.length, c1W: wilson(k, rs.length), proj: kp / rs.length, projW: wilson(kp, rs.length) };
  });
  const fail = {
    lost: rows.filter((x) => !x.hasAll).length, entry: rows.filter((x) => x.hasAll && !x.entryOk).length,
    missingOnly: rows.filter((x) => x.hasAll && x.missing && !x.extra).length, extraOnly: rows.filter((x) => x.hasAll && !x.missing && x.extra).length,
    both: rows.filter((x) => x.hasAll && x.missing && x.extra).length,
  };
  const med = (a) => { const b = a.filter((x) => x != null).sort((p, q) => p - q); return b.length ? b[Math.floor(b.length / 2)] : null; };
  const summary = { smoke: !!smoke, chosen, control, primary, verdict, setA: analyse(rows.filter((x) => x.set === 'a')), setB: analyse(rows.filter((x) => x.set === 'b')), perUnit, fail, areaErrMedian: med(rows.map((x) => x.areaErr)), msMedian: med(rows.map((x) => x.ms)), units: use.length, partial: !!limitUnits };
  fs.writeFileSync(path.join(OUTDIR, 'graph-realize.json'), JSON.stringify({ summary, rows }, null, 1));

  const pct = (x) => (x == null || Number.isNaN(x) ? '—' : `${(100 * x).toFixed(1)}%`);
  const ci = ([a, b]) => `[${pct(a)}, ${pct(b)}]`;
  const L = ['# 후보 C-1 외곽 실현률: 정확 QUBO 그래프를 실제 외곽 안에 SA로 다시 실현\n'];
  L.push(`> \`SPECS=rq4 node scripts/outline-aware/graph-realize.mjs\` · 사전 등록 = 이 스크립트 첫 commit(Confluence 10-07) · 단위 ${use.length}개${limitUnits ? ' (**부분 실행, 판정 아님**)' : ''} · 항목 ${rows.length}개\n`);
  L.push(`- 보정(보정 집합 ${chosen.n}항목에서만, 대표 세대가 아닌 실제 외곽 12개): 고른 설정 w = ${chosen.w}, 단계 ${chosen.steps.toLocaleString()} (보정 실현률 ${pct(chosen.rate)}). 전체 격자는 graph-realize-calibration.json.`);
  L.push(`- 정합성 대조(꽉 찬 직사각형, 보고만): ${control.ok}/${control.n} = ${pct(control.ok / control.n)}.`);
  L.push(`- **주 분석(a+b, ${primary.n}항목): C-1 ${pct(primary.c1)} ${ci(primary.c1CI)} · 투영 ${pct(primary.proj)} ${ci(primary.projCI)} · Δ = ${pct(primary.delta)} ${ci(primary.deltaCI)} → ${verdict}**`);
  L.push(`- 견고성: 투영을 원 규약(0.1 m)으로 판정 ${pct(primary.projOrig)} · Δ' = ${pct(primary.deltaOrig)} ${ci(primary.deltaOrigCI)}.`);
  L.push(`- McNemar mid-p(군집 무시, 보고만): C-1만 성공 ${primary.mcnemar.onlyC1}, 투영만 성공 ${primary.mcnemar.onlyProj}, mid-p = ${primary.mcnemar.midP.toPrecision(3)}.`);
  for (const [name, s] of [['(a) GEN 최적', summary.setA], ['(b) 그래프 공간 표본', summary.setB]]) L.push(`- ${name}(${s.n}항목): C-1 ${pct(s.c1)} ${ci(s.c1CI)} · 투영 ${pct(s.proj)} · Δ ${pct(s.delta)} ${ci(s.deltaCI)}`);
  L.push(`- 민감도(맞닿음 규약): 1칸(0.3 m) ${pct(primary.sens1)} · 3칸(0.9 m) ${pct(primary.sens3)} (엔진은 2칸 기준으로 담금질).`);
  L.push(`- 실패 유형: 실 사라짐 ${fail.lost} · 현관 조건 ${fail.entry} · 누락만 ${fail.missingOnly} · 초과만 ${fail.extraOnly} · 둘 다 ${fail.both}.`);
  L.push(`- 실 면적 오차(실별 |칸 수 − 목표| ÷ 목표, 항목별 중앙값의 중앙값) ${pct(summary.areaErrMedian)} · 실행 시간 중앙값 ${summary.msMedian} ms.\n`);
  L.push('| 단위 | 항목 | C-1 | Wilson 95% | 투영 | Wilson 95% |');
  L.push('|---|---|---|---|---|---|');
  for (const u of perUnit) L.push(`| ${u.unit} | ${u.n} | ${pct(u.c1)} | ${ci(u.c1W)} | ${pct(u.proj)} | ${ci(u.projW)} |`);
  L.push('\n- SA는 최적이나 목표 달성을 보장하지 않는다. 실현률은 고정한 단계 예산에서 측정한 비율이다. QUBO 식의 정확성(에너지 = 공간구문 값)과는 별개다.');
  L.push('- 보정 집합이 시험 외곽과 같은 분포를 대표한다는 보장은 없다(묶음당 한 세대). 단순 분리 보정은 대략 불편향이지만 분산이 크다(Cawley & Talbot 2010).');
  L.push('- 한계: 외곽은 묶음 대표 세대 하나. 그래프 공간은 정렬 틀이 만드는 그래프로 한정(C-2에서 넓힘). 시드는 항목마다 한 번.');
  fs.writeFileSync(path.join(OUTDIR, 'graph-realize.md'), L.join('\n') + '\n');
  console.log(L.join('\n'));
}

if (isMainThread && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => {
  console.error(e);
  process.exit(1);
});

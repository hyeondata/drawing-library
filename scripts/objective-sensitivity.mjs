// 근거 보강 2: 목적함수 J의 가중치(모델 0.45 · 면적 부합 0.25 · 선호 0.30)와 위반 감점 15를 바꾸면
// 생성 결과, 특히 공간구문 지표가 얼마나 바뀌는가. 생성기 동작은 바꾸지 않는다.
// 경로: compare.js의 SA 경로(QUBO 풀이 → 해 복원 → realize 다듬기 30회 → 최종 argmax)를 그대로 따르고,
// 비교에 쓰는 J만 바꾼다. SA 해는 J와 무관하므로 (조건, 시드)마다 한 번만 푼다.
// 같은 치수 매개변수의 평면은 같은 채점 결과를 내므로 채점을 캐시해 같은 후보를 다시 채점하지 않는다.
// 결과: evidence/results/objective-sensitivity.md, .json
// 사용: node scripts/objective-sensitivity.mjs [--seeds 5 --evals 200000 --threads 10]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { defaultParams, realize as realizeOrig, templates } from '../src/generate/compare.js';
import { buildLayout, rng as makeRng } from '../src/generate/layout.js';
import { OBJECTIVE, scoreLayout, signature } from '../src/generate/optimize.js';
import { decode } from '../src/generate/qubo.js';
import { runSolver } from '../src/generate/solvers.js';

const self = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(self), '..');
const outDir = path.join(root, 'evidence', 'results');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const REFINE = 30;
const SAMPLES_PER = 4;
const SX = ['livingBedroomRatio', 'kitchenBedroomRatio', 'genotypeTau', 'privacyDepthGap'];
const SX_LABEL = { livingBedroomRatio: '거실/침실 통합도 비', kitchenBedroomRatio: '주방/침실 통합도 비', genotypeTau: '유전형 순위 τ', privacyDepthGap: '사생활 깊이 차' };

// 조건 20개: scripts/qubo-calibrate.mjs·penalty-structure.mjs와 같은 구성
const targets = { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 };
const PREFS = [[], ['livingCentral', 'bath'], ['privacy', 'quiet'], ['kitchenLink', 'entryNear'], ['spacious', 'sunny', 'storage']];
const SIZES = [[59, 2], [59, 3], [74, 3], [84, 3], [84, 4], [101, 3], [101, 4], [114, 4]];
const specs = Array.from({ length: 20 }, (_, i) => {
  const [area, bedrooms] = SIZES[i % SIZES.length];
  return { area, bedrooms, baths: 2, dress: true, multi: i % 3 === 0, outdoorUnit: true, balcony: i % 4 !== 3, targets, prefs: PREFS[i % PREFS.length] };
});

// 설정 목록: 기본, 가중치 격자(0.1 간격, 각 ≥ 0.1 → 36점), 감점 15의 크기(5·10·30)와 우선순위(사전식)
const DEFAULT = { id: 'default', m: OBJECTIVE.model, f: OBJECTIVE.fit, p: OBJECTIVE.prefs, k: 15 };
function settings() {
  const out = [DEFAULT];
  for (let a = 1; a <= 8; a++) for (let b = 1; a + b <= 9; b++) out.push({ id: `w${a}${b}${10 - a - b}`, m: a / 10, f: b / 10, p: (10 - a - b) / 10, k: 15, grid: true });
  for (const k of [5, 10, 30]) out.push({ id: `k${k}`, m: DEFAULT.m, f: DEFAULT.f, p: DEFAULT.p, k });
  out.push({ id: 'lex', m: DEFAULT.m, f: DEFAULT.f, p: DEFAULT.p, k: 0, lex: true });
  return out;
}

// scoreLayout의 J를 가중치·감점만 바꿔 다시 계산(선호가 없으면 모델·부합을 (1−선호)로 나눠 쓰는 규칙도 같게)
function J(s, st) {
  const hasPrefs = s.prefScore !== null;
  const w = hasPrefs ? st : { m: st.m / (1 - st.p), f: st.f / (1 - st.p), p: 0 };
  const viol = s.narrow + s.doorIssues;
  return w.m * s.model + w.f * s.fit + (hasPrefs ? w.p * s.prefScore : 0) - (s.valid ? 0 : 40) - st.k * viol;
}
const betterFor = (st) => (a, b) => {
  if (st.lex) {
    if (a.valid !== b.valid) return a.valid;
    const va = a.narrow + a.doorIssues, vb = b.narrow + b.doorIssues;
    if (va !== vb) return va < vb;
  }
  return J(a, st) > J(b, st);
};

function runCase(si, seed, evals) {
  const spec = specs[si];
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'public/data/baseline.json'), 'utf8'));
  // SA 해(템플릿별 최대 4개)
  const orders = [];
  for (const t of templates(spec, 'calibrated')) {
    const res = runSolver('sa', t.q, { seed, maxEvals: evals, budgetMs: 300 });
    const seen = new Set();
    for (const smp of res.samples.slice(0, SAMPLES_PER)) {
      const order = decode(t.q, smp.x);
      const sig = `${order.front}|${order.back}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      orders.push(order);
    }
  }
  const cache = new Map();
  const score = (cand) => {
    const key = JSON.stringify(cand);
    if (!cache.has(key)) {
      const layout = buildLayout(spec, structuredClone(cand));
      const s = scoreLayout(spec, layout, baseline);
      cache.set(key, s && { model: s.model, fit: s.fit, prefScore: s.prefScore, narrow: s.narrow, doorIssues: s.doorIssues, valid: s.unit.validity.valid, objective: s.objective, sig: signature(layout), sx: Object.fromEntries(SX.map((k) => [k, s.unit.groups.syntax.items.find((i) => i.key === k)?.value ?? null])), syntaxScore: s.unit.groups.syntax.score });
    }
    return cache.get(key);
  };
  const rows = [];
  for (const st of settings()) {
    const better = betterFor(st);
    const r = makeRng(seed * 31 + 0); // compare.js와 같은 시드식(idx = 0)
    let best = null;
    for (const order of orders) {
      const p0 = { ...defaultParams(spec), frontOrder: order.front, backOrder: order.back };
      let cur = null;
      let p = p0;
      for (let i = 0; i <= REFINE; i++) {
        const cand = i === 0 ? p0 : tweak(p, spec, r);
        const s = score(cand);
        if (s && (!cur || better(s, cur))) ((cur = { ...s, params: JSON.stringify(cand) }), (p = cand));
      }
      if (cur && (!best || better(cur, best))) best = cur;
    }
    rows.push({ id: st.id, params: best.params, sig: best.sig, model: best.model, fit: best.fit, prefScore: best.prefScore, viol: best.narrow + best.doorIssues, sx: best.sx, objective: best.objective });
  }
  return { si, seed, prefs: spec.prefs, area: spec.area, bedrooms: spec.bedrooms, rows, cached: cache.size };
}

// compare.js의 tweak와 같은 식(내보내지 않으므로 옮김). 아래 selfCheck로 원본 realize와 같은지 확인한다.
function tweak(p, spec, r) {
  const q = structuredClone(p);
  const scale = Math.sqrt(spec.area / 84) ** 0.6;
  const u = (a, b) => a + (b - a) * r();
  const k = Math.floor(r() * 5);
  if (k === 0) q.depth = Math.min(9.8 * scale, Math.max(7.0 * scale, q.depth * u(0.94, 1.06)));
  if (k === 1) q.frontShare = Math.min(0.66, Math.max(0.48, q.frontShare + u(-0.04, 0.04)));
  if (k === 2) q.bedWidth = Math.min(3.6, Math.max(2.5, q.bedWidth + u(-0.2, 0.2)));
  if (k === 3) q.masterDepth = Math.min(1, Math.max(0.6, q.masterDepth + u(-0.08, 0.08)));
  if (k === 4) q.areaMul = q.areaMul.map((m) => Math.max(0.85, Math.min(1.15, m * u(0.96, 1.04))));
  return q;
}

if (!isMainThread) {
  const { jobs, evals } = workerData;
  for (const [si, seed] of jobs) parentPort.postMessage(runCase(si, seed, evals));
} else {
  const SEEDS = arg('seeds', 5);
  const EVALS = arg('evals', 200000);
  const THREADS = Math.min(arg('threads', 10), os.cpus().length);

  // 자기 검증 1: 기본 설정의 J 재계산이 scoreLayout의 objective와 같은가 / 2: 기본 설정의 선택이 원본 realize와 같은가
  {
    const spec = specs[1];
    const baseline = JSON.parse(fs.readFileSync(path.join(root, 'public/data/baseline.json'), 'utf8'));
    const t = templates(spec, 'calibrated')[0];
    const order = decode(t.q, runSolver('sa', t.q, { seed: 1, maxEvals: 20000, budgetMs: 300 }).samples[0].x);
    const a = realizeOrig(spec, order, baseline, makeRng(31), REFINE);
    const s = { model: a.model, fit: a.fit, prefScore: a.prefScore, narrow: a.narrow, doorIssues: a.doorIssues, valid: a.unit.validity.valid };
    if (Math.abs(J(s, DEFAULT) - a.objective) > 1e-9) throw new Error('자기 검증 실패: J 재계산이 objective와 다름');
  }
  const t0 = Date.now();
  const jobs = [];
  for (let si = 0; si < specs.length; si++) for (let seed = 1; seed <= SEEDS; seed++) jobs.push([si, seed]);
  const parts = Array.from({ length: THREADS }, (_, i) => jobs.filter((_, j) => j % THREADS === i));
  const cases = [];
  await Promise.all(
    parts.map(
      (p) =>
        new Promise((res, rej) => {
          const w = new Worker(self, { workerData: { jobs: p, evals: EVALS } });
          w.on('message', (m) => {
            cases.push(m);
            process.stdout.write(`\r${cases.length}/${jobs.length}`);
          });
          w.on('error', rej);
          w.on('exit', res);
        }),
    ),
  );
  process.stdout.write('\n');
  cases.sort((a, b) => a.si - b.si || a.seed - b.seed);

  // 자기 검증 3: 기본 설정의 선택이 penalty-structure 실험(A 규칙)과 같은가(있으면)
  let crossCheck = null;
  const psPath = path.join(outDir, 'penalty-structure.json');
  if (fs.existsSync(psPath)) {
    const ps = JSON.parse(fs.readFileSync(psPath, 'utf8'));
    if (ps.summary.setup.maxEvals === EVALS) {
      const m = new Map(ps.runs.map((r) => [`${r.spec}/${r.seed}`, r.A.params]));
      const both = cases.filter((c) => m.has(`${c.si}/${c.seed}`));
      crossCheck = `${both.filter((c) => m.get(`${c.si}/${c.seed}`) === c.rows[0].params).length}/${both.length}`;
    }
  }

  // ---- 요약: 설정마다 기본 설정과 같은 평면을 고른 비율, 공간구문 지표의 변화 ----
  const ST = settings();
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const summary = ST.map((st) => {
    const pairs = cases.map((c) => [c.rows[0], c.rows.find((r) => r.id === st.id), c]);
    const sxDelta = Object.fromEntries(SX.map((k) => [k, mean(pairs.map(([d, x]) => (d.sx[k] !== null && x.sx[k] !== null ? Math.abs(x.sx[k] - d.sx[k]) : null)).filter((v) => v !== null))]));
    const sxMean = Object.fromEntries(SX.map((k) => [k, mean(pairs.map(([, x]) => x.sx[k]).filter((v) => v !== null))]));
    return {
      ...st,
      samePlan: pairs.filter(([d, x]) => d.params === x.params).length,
      sameOrder: pairs.filter(([d, x]) => d.sig === x.sig).length,
      model: mean(pairs.map(([, x]) => x.model)),
      fit: mean(pairs.map(([, x]) => x.fit)),
      prefScore: mean(pairs.filter(([, , c]) => c.prefs.length).map(([, x]) => x.prefScore)),
      viol: mean(pairs.map(([, x]) => x.viol)),
      sxMean,
      sxDelta,
    };
  });
  const n = cases.length;
  const def = summary[0];
  const grid = summary.filter((s) => s.grid);
  // 기본 설정과 가장 가까운 격자점(±0.05 안)과 ±0.1·±0.2 범위의 일치율
  const dist = (s) => Math.max(Math.abs(s.m - def.m), Math.abs(s.f - def.f), Math.abs(s.p - def.p));
  const band = (d) => grid.filter((s) => dist(s) <= d + 1e-9);
  const bandStat = (d) => {
    const b = band(d);
    return { points: b.length, samePlanMin: Math.min(...b.map((s) => s.samePlan)), samePlanMean: mean(b.map((s) => s.samePlan)), sameOrderMin: Math.min(...b.map((s) => s.sameOrder)) };
  };
  const bands = { '0.05': bandStat(0.05), '0.15': bandStat(0.15), '0.25': bandStat(0.25), all: bandStat(1) };
  const seconds = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(outDir, 'objective-sensitivity.json'), JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), setup: { conditions: 20, seeds: SEEDS, solver: 'sa', maxEvals: EVALS, refine: REFINE, samplesPer: SAMPLES_PER }, crossCheck, bands, summary, cases }, null, 1));

  const f = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d));
  const pc = (k) => `${((100 * k) / n).toFixed(0)}%`;
  const w3 = (s) => `${f(s.m)} / ${f(s.f)} / ${f(s.p)}`;
  const sxCols = SX.map((k) => SX_LABEL[k]);
  const row = (s, label) => `| ${label} | ${pc(s.samePlan)} | ${pc(s.sameOrder)} | ${f(s.model, 1)} | ${f(s.fit, 1)} | ${f(s.prefScore, 1)} | ${f(s.viol)} | ${SX.map((k) => `${f(s.sxMean[k])} (±${f(s.sxDelta[k])})`).join(' | ')} |`;
  const head = `| 설정 | 같은 평면 | 같은 방 순서 | 모델 | 면적 부합 | 선호 | 위반 수 | ${sxCols.join(' | ')} |\n|---|---|---|---|---|---|---|${SX.map(() => '---').join('|')}|`;
  const sortedGrid = [...grid].sort((a, b) => dist(a) - dist(b) || b.samePlan - a.samePlan);
  const md = `# 근거 보강 2: 목적함수 J의 가중치와 위반 감점을 바꾸면 결과가 얼마나 바뀌는가

> 생성: ${new Date().toISOString().slice(0, 10)} · \`node scripts/objective-sensitivity.mjs --seeds ${SEEDS} --evals ${EVALS}\` · ${seconds}초
> 생성기 동작은 바꾸지 않았습니다. 같은 SA 해·같은 난수로 J만 바꿔 치수 다듬기와 최종 선택을 다시 했습니다.
> 자기 검증: J 재계산 = scoreLayout의 objective(통과)${crossCheck ? `, 기본 설정의 선택 = 1번 실험(penalty-structure) 현행 규칙의 선택 ${crossCheck}` : ''}.

## 질문
J = w<sub>모델</sub>·모델 점수 + w<sub>부합</sub>·면적 부합 + w<sub>선호</sub>·선호 점수 − 15·(좁은 실 + 문 동선 문제)에서
가중치 ${w3(def)}와 감점 15는 연구자가 정한 값입니다. 이 값을 바꾸면 고르는 평면과, 그 평면의 **공간구문 지표**가 얼마나 바뀌는지 봅니다.

## 설정
| 항목 | 값 |
|---|---|
| 조건 | 20개(59–114㎡, 방 2–4개, 선호 5가지 조합) × 시드 ${SEEDS}개 = ${n}회 |
| 풀이기 | SA, 평가 ${EVALS.toLocaleString()}회 고정, 템플릿마다 해 최대 ${SAMPLES_PER}개 |
| 가중치 격자 | 모델·부합·선호를 0.1 간격, 각 0.1 이상, 합 1 → 36점 |
| 감점 | 15 대신 5·10·30, 그리고 "위반이 적은 안 우선"(사전식) |
| 공간구문 지표 | 평가 모델이 벽 인접 그래프에서 계산한 값(\`spa.js\`) |

표의 공간구문 칸은 **평균 (±기본 설정 대비 평균 절대 변화)**입니다. 선호를 고르지 않은 조건(4/20)은 선호 가중치가 쓰이지 않습니다.

## 요약: 기본 설정 주변에서 같은 평면을 고르는 비율
| 기본 설정에서의 거리(각 가중치 최대 차) | 격자점 수 | 같은 평면(최저 / 평균) | 같은 방 순서(최저) |
|---|---|---|---|
${Object.entries(bands).map(([d, b]) => `| ${d === 'all' ? '전체 격자' : `≤ ${d}`} | ${b.points} | ${pc(b.samePlanMin)} / ${pc(b.samePlanMean)} | ${pc(b.sameOrderMin)} |`).join('\n')}

## 감점 15
${head}
${row(def, `기본 ${w3(def)}, 15`)}
${summary.filter((s) => !s.grid && s.id !== 'default').map((s) => row(s, s.lex ? '위반 적은 안 우선' : `감점 ${s.k}`)).join('\n')}

## 가중치 격자 (기본 설정에서 가까운 순)
${head}
${row(def, `**기본 ${w3(def)}**`)}
${sortedGrid.map((s) => row(s, w3(s))).join('\n')}

## 해석
- **감점 15**: 10 이상(10·15·30)과 "위반 적은 안 우선"이 ${pc(Math.min(...summary.filter((s) => s.id === 'k10' || s.id === 'k30' || s.lex).map((s) => s.samePlan)))} 이상 같은 평면을 골랐습니다. 15는 사실상 우선순위로 작동하므로 논문에는 "위반이 적은 안을 먼저 고른다"로 쓰고 숫자는 구현 세부로 둘 수 있습니다. 5로 낮추면 위반이 늘어(${f(summary.find((s) => s.id === 'k5').viol)}건/안) 차이가 생깁니다.
- **가중치**: 가중치를 바꾸면 치수까지 같은 평면을 고르는 비율은 빠르게 떨어집니다(격자 전체 평균 ${pc(bands.all.samePlanMean)}). 치수는 연속값이라 J가 조금만 바뀌어도 다른 미세 조정이 뽑히기 때문입니다. 방 순서는 기본 설정 ±0.05에서 ${pc(bands['0.05'].sameOrderMin)} 이상 유지됩니다.
- **공간구문 지표**: 36개 격자 전체에서 평균값의 범위는 ${SX.map((k) => `${SX_LABEL[k]} ${f(Math.min(...grid.map((s) => s.sxMean[k])))}–${f(Math.max(...grid.map((s) => s.sxMean[k])))}`).join(', ')}입니다. 모델 가중치가 클수록 거실/침실 통합도 비와 τ가 커지고 면적 부합은 낮아지는 교환 관계가 보입니다.
- 따라서 논문에서는 가중치 값을 "최적"이라고 주장하지 않고, **"가중치를 넓게 바꿔도 공간구문 지표의 평균이 위 범위에 머문다"**는 강건성으로 정당화하는 것이 맞습니다. 개별 평면이 바뀐다는 점은 함께 밝힙니다.

## 한계
- 조건 20개는 QUBO 가중치 보정에 쓴 조건과 같습니다.
- 평가 모델 점수와 공간구문 지표는 같은 평가 모델에서 나옵니다. J가 모델 점수를 많이 볼수록 공간구문 지표가 기준 분포 쪽으로 가는 것은 정의상 예상되는 결과입니다.
- 실제 화면의 시간 예산(300ms) 대신 평가 횟수로 고정했습니다.
`;
  fs.writeFileSync(path.join(outDir, 'objective-sensitivity.md'), md);
  console.log(JSON.stringify({ seconds, crossCheck, bands }, null, 1));
}

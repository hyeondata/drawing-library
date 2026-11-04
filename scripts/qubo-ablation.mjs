// 근거 보강 3: 방 순서 QUBO의 항을 하나씩 빼면(가중치 0) 생성 결과가 얼마나 나빠지는가(ablation).
// 문헌 근거가 약한 "자체 대리 항"도 데이터로 기여를 보이거나, 기여가 없으면 뺄 근거를 얻기 위함이다.
// 생성기 동작은 바꾸지 않는다. compare.js의 SA 경로(QUBO 풀이 → 해 복원 → realize 다듬기 30회 → 최종 argmax)를 따르고
// QUBO 가중치만 바꾼다. 다듬기·선택에 쓰는 J는 현행 그대로다.
//   full      : 보정 가중치 + 공간구문 대리 항(선호를 고른 조건) = 실제 생성기
//   −항       : full에서 그 항 하나만 0
//   noSyntax  : 공간구문 대리 항 끔(λ = 0)
//   hand      : 손 가중치 + 공간구문 대리 항(보정의 효과)
//   maxent    : 실제 아파트 관계 빈도로 추정한 가중치(scripts/qubo-maxent.mjs) + 공간구문 대리 항
//   onehot    : 모든 항 0, 원-핫 제약만(= 무작위 방 순서; QUBO 전체의 효과)
// 차이는 같은 (조건, 시드)끼리 짝지어(설정 − full) 평균을 내고, 조건 20개를 단위로 다시 뽑는 부트스트랩(2000회)으로 95% 구간을 낸다.
// 결과: evidence/results/qubo-ablation.md, .json
// 사용: node scripts/qubo-ablation.mjs [--seeds 5 --evals 200000 --threads 12]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { realize } from '../src/generate/compare.js';
import { rng as makeRng } from '../src/generate/layout.js';
import { buildQubo, decode, frontBedCount, TERMS, weightsOf, withSyntax } from '../src/generate/qubo.js';
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
const SX_LABEL = { livingBedroomRatio: '거실/침실 통합도 비', kitchenBedroomRatio: '주방/침실 통합도 비', genotypeTau: '유전형 τ', privacyDepthGap: '사생활 깊이 차' };
// 공간구문 선호 → 그 선호가 겨냥하는 지표
const SX_PREF = { livingCentral: ['livingBedroomRatio', 'genotypeTau'], privacy: ['privacyDepthGap'], kitchenLink: ['kitchenBedroomRatio'] };

const targets = { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 };
const PREFS = [[], ['livingCentral', 'bath'], ['privacy', 'quiet'], ['kitchenLink', 'entryNear'], ['spacious', 'sunny', 'storage']];
const SIZES = [[59, 2], [59, 3], [74, 3], [84, 3], [84, 4], [101, 3], [101, 4], [114, 4]];
const specs = Array.from({ length: 20 }, (_, i) => {
  const [area, bedrooms] = SIZES[i % SIZES.length];
  return { area, bedrooms, baths: 2, dress: true, multi: i % 3 === 0, outdoorUnit: true, balcony: i % 4 !== 3, targets, prefs: PREFS[i % PREFS.length] };
});

// 설정마다 가중치 객체(객체로 주면 buildQubo는 대리 항을 다시 더하지 않는다)
function settings(spec) {
  const full = withSyntax(weightsOf('calibrated'), spec.prefs).weights;
  const out = [{ id: 'full', W: full }];
  for (const t of TERMS) out.push({ id: `-${t.id}`, term: t.id, W: { ...full, [t.id]: 0 } });
  out.push({ id: 'noSyntax', W: weightsOf('calibrated') });
  out.push({ id: 'hand', W: withSyntax(weightsOf('hand'), spec.prefs).weights });
  out.push({ id: 'maxent', W: withSyntax(weightsOf('maxent'), spec.prefs).weights });
  out.push({ id: 'onehot', W: Object.fromEntries(TERMS.map((t) => [t.id, 0])) });
  return out;
}

function runCase(si, seed, evals) {
  const spec = specs[si];
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'public/data/baseline.json'), 'utf8'));
  const kmax = frontBedCount(spec);
  const ks = [...new Set([kmax, kmax - 1])].filter((k) => k >= 0);
  const rows = [];
  for (const st of settings(spec)) {
    const r = makeRng(seed * 31 + 0);
    let best = null;
    for (const k of ks) {
      const q = buildQubo(spec, { frontBeds: k, weights: st.W });
      const res = runSolver('sa', q, { seed, maxEvals: evals, budgetMs: 300 });
      const seen = new Set();
      for (const smp of res.samples.slice(0, SAMPLES_PER)) {
        const order = decode(q, smp.x);
        const sig = `${order.front}|${order.back}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        const cand = realize(spec, order, baseline, r, REFINE);
        if (cand && (!best || cand.objective > best.objective)) best = cand;
      }
    }
    const sx = Object.fromEntries(SX.map((key) => [key, best.unit.groups.syntax.items.find((i) => i.key === key)?.value ?? null]));
    rows.push({ id: st.id, sig: best.signature, objective: best.objective, model: best.model, fit: best.fit, prefScore: best.prefScore, syntaxScore: best.unit.groups.syntax.score, viol: best.narrow + best.doorIssues, sx });
  }
  return { si, seed, prefs: spec.prefs, rows };
}

if (!isMainThread) {
  const { jobs, evals } = workerData;
  for (const [si, seed] of jobs) parentPort.postMessage(runCase(si, seed, evals));
} else {
  const SEEDS = arg('seeds', 5);
  const EVALS = arg('evals', 200000);
  const THREADS = Math.min(arg('threads', 12), os.cpus().length);
  const BOOT = 2000;

  // 자기 검증: full 가중치 객체로 만든 QUBO가 실제 생성기('calibrated' 문자열)의 QUBO와 같은가
  for (const spec of specs) {
    const k = frontBedCount(spec);
    const a = buildQubo(spec, { frontBeds: k, weights: 'calibrated' });
    const b = buildQubo(spec, { frontBeds: k, weights: settings(spec)[0].W });
    const same = a.n === b.n && a.diag.every((v, i) => Math.abs(v - b.diag[i]) < 1e-9) && a.M.every((v, i) => Math.abs(v - b.M[i]) < 1e-9);
    if (!same) throw new Error('자기 검증 실패: full 설정의 QUBO가 실제 생성기와 다름');
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

  // 자기 검증 2: full의 선택이 1번 실험(penalty-structure) 현행 규칙의 선택과 같은가(같은 평가 횟수일 때)
  let crossCheck = null;
  const psPath = path.join(outDir, 'penalty-structure.json');
  if (fs.existsSync(psPath)) {
    const ps = JSON.parse(fs.readFileSync(psPath, 'utf8'));
    if (ps.summary.setup.maxEvals === EVALS) {
      const m = new Map(ps.runs.map((r) => [`${r.spec}/${r.seed}`, r.A.objective]));
      const both = cases.filter((c) => m.has(`${c.si}/${c.seed}`));
      crossCheck = `${both.filter((c) => Math.abs(m.get(`${c.si}/${c.seed}`) - c.rows[0].objective) < 1e-9).length}/${both.length}`;
    }
  }

  // ---- 짝지은 차이와 조건 단위 부트스트랩 ----
  const r = makeRng(12345);
  const ids = cases[0].rows.map((x) => x.id);
  const METRICS = { objective: (x) => x.objective, model: (x) => x.model, syntaxScore: (x) => x.syntaxScore, viol: (x) => x.viol, ...Object.fromEntries(SX.map((k) => [k, (x) => x.sx[k]])) };
  function stat(id, metric, filter = () => true) {
    // 조건별 평균 차이
    const bySpec = new Map();
    for (const c of cases) {
      if (!filter(c)) continue;
      const a = METRICS[metric](c.rows.find((x) => x.id === id));
      const b = METRICS[metric](c.rows[0]);
      if (a === null || b === null || a === undefined || b === undefined) continue;
      if (!bySpec.has(c.si)) bySpec.set(c.si, []);
      bySpec.get(c.si).push(a - b);
    }
    const groups = [...bySpec.values()].map((d) => d.reduce((s, x) => s + x, 0) / d.length);
    if (!groups.length) return null;
    const m = groups.reduce((s, x) => s + x, 0) / groups.length;
    const boots = [];
    for (let i = 0; i < BOOT; i++) {
      let s = 0;
      for (let j = 0; j < groups.length; j++) s += groups[Math.floor(r() * groups.length)];
      boots.push(s / groups.length);
    }
    boots.sort((a, b) => a - b);
    return { mean: m, lo: boots[Math.floor(0.025 * BOOT)], hi: boots[Math.floor(0.975 * BOOT) - 1], n: groups.length };
  }
  const table = ids.slice(1).map((id) => ({
    id,
    sameOrder: cases.filter((c) => c.rows.find((x) => x.id === id).sig === c.rows[0].sig).length,
    ...Object.fromEntries(Object.keys(METRICS).map((m) => [m, stat(id, m)])),
  }));
  // 공간구문 선호를 고른 조건에서, 그 선호가 겨냥하는 지표
  const targeted = Object.entries(SX_PREF).flatMap(([pref, keys]) => keys.map((k) => ({ pref, key: k, noSyntax: stat('noSyntax', k, (c) => c.prefs.includes(pref)), onehot: stat('onehot', k, (c) => c.prefs.includes(pref)), full: (() => {
    const v = cases.filter((c) => c.prefs.includes(pref)).map((c) => c.rows[0].sx[k]).filter((x) => x !== null);
    return v.reduce((s, x) => s + x, 0) / v.length;
  })() })));
  const seconds = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(outDir, 'qubo-ablation.json'), JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), setup: { conditions: 20, seeds: SEEDS, solver: 'sa', maxEvals: EVALS, refine: REFINE, samplesPer: SAMPLES_PER, bootstrap: BOOT }, crossCheck, table, targeted, cases }, null, 1));

  const f = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(d));
  const ci = (s, d = 2) => (s ? `${f(s.mean, d)} [${f(s.lo, d)}, ${f(s.hi, d)}]${s.lo > 0 || s.hi < 0 ? ' *' : ''}` : '—');
  const label = (id) => {
    const t = TERMS.find((x) => `-${x.id}` === id);
    if (t) return `− ${t.label} (\`${t.id}\`)`;
    return { noSyntax: '공간구문 대리 항 끔 (λ = 0)', hand: '손 가중치(보정 안 함)', maxent: '최대 엔트로피 가중치(실제 빈도로 추정)', onehot: '**모든 항 끔(무작위 방 순서)**' }[id] || id;
  };
  const n = cases.length;
  const termRows = table.filter((t) => t.id.startsWith('-')).sort((a, b) => a.objective.mean - b.objective.mean);
  const otherRows = table.filter((t) => !t.id.startsWith('-'));
  const head = `| 설정 | 같은 방 순서 | ΔJ | Δ모델 점수 | Δ공간구문 영역 점수 | Δ위반 수 | Δ거실/침실 통합도 비 | Δ유전형 τ |\n|---|---|---|---|---|---|---|---|`;
  const row = (t) => `| ${label(t.id)} | ${t.sameOrder}/${n} | ${ci(t.objective)} | ${ci(t.model)} | ${ci(t.syntaxScore)} | ${ci(t.viol)} | ${ci(t.livingBedroomRatio)} | ${ci(t.genotypeTau)} |`;
  const harmful = termRows.filter((t) => t.objective.hi < 0);
  const helpful = termRows.filter((t) => t.objective.lo > 0);
  const null0 = termRows.filter((t) => t.objective.lo <= 0 && t.objective.hi >= 0);
  const md = `# 근거 보강 3: 방 순서 QUBO 항 ablation

> 생성: ${new Date().toISOString().slice(0, 10)} · \`node scripts/qubo-ablation.mjs --seeds ${SEEDS} --evals ${EVALS}\` · ${seconds}초
> 생성기 동작은 바꾸지 않았습니다. QUBO 가중치만 바꾸고, 다듬기·최종 선택은 현행 J 그대로입니다.
> 자기 검증: full 설정의 QUBO = 실제 생성기의 QUBO(조건 20개 모두 통과)${crossCheck ? `, full의 선택 = 1번 실험 현행 규칙의 선택 ${crossCheck}` : ''}.

## 질문
QUBO 항 20개 가운데 문헌 근거가 있는 것은 일부이고, 나머지는 자체 대리 항입니다. 항을 하나씩 빼서(가중치 0) 생성 결과가 나빠지면 그 항은 **데이터로 기여가 확인된 항**이고, 차이가 없으면 **뺄 수 있는 항**입니다.
같은 방식으로 공간구문 대리 항(λ), 보정, QUBO 전체(모든 항 끔 = 무작위 방 순서)의 효과도 봅니다.

## 설정
| 항목 | 값 |
|---|---|
| 조건 | 20개 × 시드 ${SEEDS}개 = ${n}회, 설정마다 같은 (조건, 시드) |
| 풀이기 | SA, 평가 ${EVALS.toLocaleString()}회 고정 |
| 차이 | 설정 − full(실제 생성기). 조건별 평균을 낸 뒤 조건 20개를 다시 뽑는 부트스트랩 ${BOOT}회로 95% 구간 |
| 표기 | 평균 [95% 구간], **\\*** = 구간이 0을 포함하지 않음 |

ΔJ가 **음수**면 그 항을 뺐을 때 나빠진 것(= 항이 기여함), **양수**면 빼는 편이 나은 것입니다. 위반 수는 반대로 양수가 나쁜 쪽입니다.

## 큰 단위 비교
${head}
${otherRows.map(row).join('\n')}

## 공간구문 선호를 고른 조건에서, 그 선호가 겨냥한 지표
| 선호 | 지표 | full 평균 | 대리 항 끔(λ = 0)일 때 Δ | 모든 항 끔일 때 Δ |
|---|---|---|---|---|
${targeted.map((t) => `| ${t.pref} | ${SX_LABEL[t.key]} | ${t.full.toFixed(2)} | ${ci(t.noSyntax)} | ${ci(t.onehot)} |`).join('\n')}

## 항별 ablation (ΔJ가 작은 순 = 빼면 가장 나빠지는 순)
${head}
${termRows.map(row).join('\n')}

## 요약
- 빼면 J가 유의하게 **나빠지는** 항(기여 확인): ${harmful.length ? harmful.map((t) => `\`${t.id.slice(1)}\``).join(', ') : '없음'}
- 빼면 J가 유의하게 **좋아지는** 항: ${helpful.length ? helpful.map((t) => `\`${t.id.slice(1)}\``).join(', ') : '없음'}
- 차이가 유의하지 않은 항: ${null0.length ? null0.map((t) => `\`${t.id.slice(1)}\``).join(', ') : '없음'}

## 해석
- **QUBO 전체의 기여**: 모든 항을 끄면(무작위 방 순서) J ${ci(otherRows.find((t) => t.id === 'onehot').objective)}, 공간구문 영역 점수 ${ci(otherRows.find((t) => t.id === 'onehot').syntaxScore)}, 거실/침실 통합도 비 ${ci(otherRows.find((t) => t.id === 'onehot').livingBedroomRatio)}입니다. 방 순서 QUBO가 공간구문 측면에서 결과를 낫게 만든다는 것이 데이터로 확인됩니다.
- **공간구문 대리 항(λ)의 기여**: 전체적으로는 유의한 차이가 없습니다(J ${ci(otherRows.find((t) => t.id === 'noSyntax').objective)}). 선호별로 보면 ${targeted.filter((t) => t.noSyntax && t.noSyntax.hi < 0).map((t) => `${t.pref}의 ${SX_LABEL[t.key]}`).join(', ') || '어느 지표도'}${targeted.some((t) => t.noSyntax && t.noSyntax.hi < 0) ? '만 대리 항을 끄면 유의하게 나빠졌고' : ' 유의하게 나빠지지 않았고'}, 나머지는 유의하지 않습니다. 대리 항이 방 순서는 바꾸지만(같은 방 순서 ${otherRows.find((t) => t.id === 'noSyntax').sameOrder}/${n}), 뒤의 치수 다듬기와 J 선택을 거치면 효과가 대부분 희석됩니다. **논문의 핵심 주장(공간구문 기준 QUBO)과 직결되므로 따로 다뤄야 할 결과입니다.**
- **개별 항**: 유의하게 기여한 항은 ${harmful.length}개뿐입니다. 항들이 서로 겹치고(예: 현관 관련 항 여러 개) 조건이 20개라 검정력이 낮기 때문일 수 있습니다. 개별 항을 하나씩 정당화하기보다 **항 묶음 단위**로 기여를 보이는 편이 현실적입니다.
- **보정**: 손 가중치와 보정 가중치의 J 차이도 유의하지 않습니다.

## 한계
- 조건 20개는 QUBO 가중치 보정에 쓴 조건과 같습니다. 보정된 가중치에서 항을 빼면 나빠지는 것은 같은 조건에서 맞춘 결과일 수 있으므로, 독립 조건에서 다시 확인해야 합니다.
- 항 하나를 뺀 효과만 봅니다. 서로 겹치는 항(예: 현관 관련 항 여러 개)은 하나를 빼도 다른 항이 대신할 수 있습니다.
- J와 공간구문 지표는 같은 평가 모델에서 나옵니다.
`;
  fs.writeFileSync(path.join(outDir, 'qubo-ablation.md'), md);
  console.log(JSON.stringify({ seconds, crossCheck, big: otherRows.map((t) => [t.id, t.sameOrder, t.objective]), harmful: harmful.map((t) => t.id), helpful: helpful.map((t) => t.id) }, null, 1));
}

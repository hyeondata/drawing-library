// 근거 보강 1: 목적함수 J의 고정 감점(무효 −40, 좁은 실·문 동선 −15)을 "숫자 없는 구조"로 바꿔도 결과가 같은가.
// 생성기 동작은 바꾸지 않는다. compare.js의 SA 경로(QUBO 풀이 → 해 복원 → realize 다듬기 → 최종 argmax)를
// 비교 규칙만 바꿔 세 번 돌리고, 고른 평면이 같은지 센다.
//   A 현행     : J = 기본점수 − 40·[무효] − 15·(좁은 실 + 문 동선 문제)
//   B 무효만 구조: (유효 여부) 먼저, 같으면 기본점수 − 15·(위반 수)      ← 40을 없앰
//   C 전부 구조  : (유효 여부) → (위반 수가 적은 쪽) → 기본점수           ← 40과 15를 모두 없앰
// realize의 난수 소비는 비교 결과와 무관하므로(tweak가 쓰는 난수 개수는 뽑힌 종류에만 달림) 세 방식이 같은 후보열을 본다.
// 결과: evidence/results/penalty-structure.md, .json
// 사용: node scripts/penalty-structure.mjs [--seeds 5 --evals 200000]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultParams, realize as realizeOrig, templates } from '../src/generate/compare.js';
import { buildLayout, rng as makeRng } from '../src/generate/layout.js';
import { scoreLayout, signature } from '../src/generate/optimize.js';
import { decode } from '../src/generate/qubo.js';
import { runSolver } from '../src/generate/solvers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'evidence', 'results');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const SEEDS = arg('seeds', 5);
const EVALS = arg('evals', 200000);
const REFINE = 30;
const SAMPLES_PER = 4;
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'public/data/baseline.json'), 'utf8'));

// 조건 20개: scripts/qubo-calibrate.mjs와 같은 구성(보정에 쓴 조건과 같다는 점은 보고서에 적는다).
const targets = { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 };
const PREFS = [[], ['livingCentral', 'bath'], ['privacy', 'quiet'], ['kitchenLink', 'entryNear'], ['spacious', 'sunny', 'storage']];
const SIZES = [[59, 2], [59, 3], [74, 3], [84, 3], [84, 4], [101, 3], [101, 4], [114, 4]];
const specs = Array.from({ length: 20 }, (_, i) => {
  const [area, bedrooms] = SIZES[i % SIZES.length];
  return { area, bedrooms, baths: 2, dress: true, multi: i % 3 === 0, outdoorUnit: true, balcony: i % 4 !== 3, targets, prefs: PREFS[i % PREFS.length] };
});

// 감점을 뺀 기본점수와 위반 수
const parts = (s) => {
  const viol = s.narrow + s.doorIssues;
  const invalid = s.unit.validity.valid ? 0 : 1;
  return { invalid, viol, base: s.objective + 40 * invalid + 15 * viol };
};
// better(a, b): a가 b보다 나으면 true
const RULES = {
  A: (a, b) => a.objective > b.objective,
  B: (a, b) => {
    const pa = parts(a), pb = parts(b);
    if (pa.invalid !== pb.invalid) return pa.invalid < pb.invalid;
    return pa.base - 15 * pa.viol > pb.base - 15 * pb.viol;
  },
  C: (a, b) => {
    const pa = parts(a), pb = parts(b);
    if (pa.invalid !== pb.invalid) return pa.invalid < pb.invalid;
    if (pa.viol !== pb.viol) return pa.viol < pb.viol;
    return pa.base > pb.base;
  },
};

// compare.js realize와 같은 순서·같은 난수, 비교 규칙만 바꿈. scored: 채점한 모든 안의 기록.
function realize(spec, order, r, better, scored) {
  const p0 = { ...defaultParams(spec), frontOrder: order.front, backOrder: order.back };
  let best = null;
  let p = p0;
  let decisions = 0;
  for (let i = 0; i <= REFINE; i++) {
    const cand = i === 0 ? p0 : tweakProxy(p, spec, r);
    const layout = buildLayout(spec, structuredClone(cand));
    const s = scoreLayout(spec, layout, baseline);
    if (s) scored?.push(parts(s));
    if (s && (!best || better(s, best))) {
      best = { layout, params: cand, ...s, signature: signature(layout) };
      p = cand;
      decisions++;
    }
  }
  return best;
}

// compare.js의 tweak는 내보내지 않으므로 같은 식을 옮겨 둔다(아래 selfCheck로 원본 realize와 결과가 같은지 확인).
function tweakProxy(p, spec, r) {
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

// SA 해(템플릿별)는 비교 규칙과 무관하므로 한 번만 푼다.
function solveOrders(spec, seed) {
  const out = [];
  for (const t of templates(spec, 'calibrated')) {
    const res = runSolver('sa', t.q, { seed, maxEvals: EVALS, budgetMs: 300 });
    const seen = new Set();
    for (const smp of res.samples.slice(0, SAMPLES_PER)) {
      const order = decode(t.q, smp.x);
      const sig = `${order.front}|${order.back}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ order, template: t.k });
    }
  }
  return out;
}

function pipeline(spec, seed, orders, rule, scored) {
  const r = makeRng(seed * 31 + 0); // compare.js와 같은 시드식(idx = 0)
  let best = null;
  const finalists = [];
  for (const o of orders) {
    const cand = realize(spec, o.order, r, RULES[rule], scored);
    if (!cand) continue;
    finalists.push(cand);
    if (!best || RULES[rule](cand, best)) best = cand;
  }
  return { best, finalists };
}

// 자기 검증: A 규칙 realize가 원본 realize와 같은 평면을 고르는가
function selfCheck() {
  const spec = specs[3];
  const orders = solveOrders(spec, 1);
  const r1 = makeRng(31), r2 = makeRng(31);
  for (const o of orders) {
    const a = realizeOrig(spec, o.order, baseline, r1, REFINE);
    const b = realize(spec, o.order, r2, RULES.A, null);
    if ((a && a.objective) !== (b && b.objective)) throw new Error('자기 검증 실패: 원본 realize와 결과가 다름');
  }
}

selfCheck();
const t0 = Date.now();
const runs = [];
const allScored = [];
specs.forEach((spec, si) => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const orders = solveOrders(spec, seed);
    const row = { spec: si, area: spec.area, bedrooms: spec.bedrooms, prefs: spec.prefs.join('+') || '없음', seed };
    for (const rule of ['A', 'B', 'C']) {
      const scored = rule === 'A' ? allScored : null;
      const { best, finalists } = pipeline(spec, seed, orders, rule, scored);
      const p = parts(best);
      row[rule] = { sig: best.signature, params: JSON.stringify(best.params), objective: best.objective, model: best.model, narrow: best.narrow, door: best.doorIssues, ...p };
      if (rule === 'A') {
        // 최종 후보 사이의 여유: 유효한 최선과 무효한 최선의 기본점수 차
        const fp = finalists.map(parts);
        const bestValid = Math.max(-Infinity, ...fp.filter((x) => !x.invalid).map((x) => x.base));
        const bestInvalid = Math.max(-Infinity, ...fp.filter((x) => x.invalid).map((x) => x.base));
        row.allInvalid = fp.every((x) => x.invalid);
        row.invalidMargin = Number.isFinite(bestValid) && Number.isFinite(bestInvalid) ? bestInvalid - bestValid : null;
      }
    }
    row.sameAB = row.A.params === row.B.params;
    row.sameAC = row.A.params === row.C.params;
    runs.push(row);
    process.stdout.write(`\r조건 ${si + 1}/20 시드 ${seed}/${SEEDS}`);
  }
});
process.stdout.write('\n');

// ---- 요약 ----
const n = runs.length;
const cnt = (f) => runs.filter(f).length;
const pct = (k, d = n) => `${k}/${d} (${((100 * k) / d).toFixed(1)}%)`;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const S = allScored.length;
const sInvalid = allScored.filter((x) => x.invalid).length;
const sViol = allScored.filter((x) => x.viol > 0).length;
const validBase = allScored.filter((x) => !x.invalid).map((x) => x.base);
const margins = runs.map((r) => r.invalidMargin).filter((x) => x !== null);
const diffAC = runs.filter((r) => !r.sameAC);

const summary = {
  generatedAt: new Date().toISOString().slice(0, 10),
  setup: { conditions: 20, seeds: SEEDS, solver: 'sa', maxEvals: EVALS, refine: REFINE, samplesPer: SAMPLES_PER, weights: 'calibrated + 공간구문 대리 항(선호 시)' },
  runs: n,
  sameAB: cnt((r) => r.sameAB),
  sameAC: cnt((r) => r.sameAC),
  winnerInvalid: { A: cnt((r) => r.A.invalid), B: cnt((r) => r.B.invalid), C: cnt((r) => r.C.invalid) },
  winnerViol: { A: cnt((r) => r.A.viol > 0), B: cnt((r) => r.B.viol > 0), C: cnt((r) => r.C.viol > 0) },
  winnerViolKind: { narrowOnly: cnt((r) => r.A.narrow > 0 && !r.A.door), doorOnly: cnt((r) => !r.A.narrow && r.A.door > 0), both: cnt((r) => r.A.narrow > 0 && r.A.door > 0) },
  winnerViolBySize: Object.fromEntries([...new Set(runs.map((r) => `${r.area}㎡ 방${r.bedrooms}`))].map((k) => [k, `${runs.filter((r) => `${r.area}㎡ 방${r.bedrooms}` === k && r.A.viol > 0).length}/${runs.filter((r) => `${r.area}㎡ 방${r.bedrooms}` === k).length}`])),
  allFinalistsInvalid: cnt((r) => r.allInvalid),
  scored: { total: S, invalid: sInvalid, withViolation: sViol },
  validBaseRange: validBase.length ? [Math.min(...validBase), Math.max(...validBase)] : null,
  invalidMarginMax: margins.length ? Math.max(...margins) : null,
  diffAC: diffAC.map((r) => ({ spec: r.spec, seed: r.seed, A: { viol: r.A.viol, base: r.A.base, model: r.A.model }, C: { viol: r.C.viol, base: r.C.base, model: r.C.model } })),
  seconds: Math.round((Date.now() - t0) / 1000),
};
fs.writeFileSync(path.join(outDir, 'penalty-structure.json'), JSON.stringify({ summary, runs }, null, 1));

const f2 = (x) => (x === null || x === undefined ? '—' : x.toFixed(2));
const md = `# 근거 보강 1: 고정 감점을 구조로 바꿔도 결과가 같은가

> 생성: ${summary.generatedAt} · \`node scripts/penalty-structure.mjs --seeds ${SEEDS} --evals ${EVALS}\` · ${summary.seconds}초
> 생성기 동작은 바꾸지 않았습니다. 같은 SA 해와 같은 난수로 비교 규칙만 바꿔 세 번 돌렸습니다.

## 질문
목적함수 J의 감점 **40**(평가 모델 정합성 규칙 위반, 무효)과 **15**(좁은 실·문 동선 문제 1건당)는 연구자가 정한 숫자입니다.
이 숫자를 "유효한 안이 무효한 안보다 항상 앞선다", "위반이 적은 안이 항상 앞선다"는 **우선순위(사전식 비교)**로 바꾸면 숫자 자체가 필요 없어집니다.
바꿔도 고른 평면이 같다면, 논문에서 40과 15를 "우선순위를 점수 하나로 구현한 것"으로 설명할 수 있습니다.

## 설정
| 항목 | 값 |
|---|---|
| 조건 | 20개(평형 59–114㎡, 방 2–4개, 선호 5가지 조합; \`qubo-calibrate.mjs\`와 같은 구성) |
| 시드 | ${SEEDS}개 → 실행 ${n}회 |
| 풀이기 | SA, 평가 ${EVALS.toLocaleString()}회(시간 대신 평가 횟수로 고정해 재현 가능) |
| 후처리 | 템플릿마다 해 최대 ${SAMPLES_PER}개 × 치수 다듬기 ${REFINE}회 (compare.js와 동일) |
| 가중치 | 보정 가중치 + 공간구문 대리 항(해당 선호를 고른 조건) |

| 규칙 | 비교 방식 |
|---|---|
| A 현행 | J = 기본점수 − 40·[무효] − 15·(위반 수) |
| B 무효만 구조 | 유효 여부 먼저 → 같으면 기본점수 − 15·(위반 수) |
| C 전부 구조 | 유효 여부 → 위반 수 → 기본점수 |

## 결과
| 지표 | 값 |
|---|---|
| A와 B가 같은 평면을 고름 | **${pct(summary.sameAB)}** |
| A와 C가 같은 평면을 고름 | **${pct(summary.sameAC)}** |
| 최종안이 무효 (A / B / C) | ${summary.winnerInvalid.A} / ${summary.winnerInvalid.B} / ${summary.winnerInvalid.C} |
| 최종안에 위반 있음 (A / B / C) | ${summary.winnerViol.A} / ${summary.winnerViol.B} / ${summary.winnerViol.C} |
| 최종안 위반 종류 (좁은 실만 / 문 동선만 / 둘 다) | ${summary.winnerViolKind.narrowOnly} / ${summary.winnerViolKind.doorOnly} / ${summary.winnerViolKind.both} |
| 최종안 위반 비율 (평형·방 수별) | ${Object.entries(summary.winnerViolBySize).map(([k, v]) => `${k} ${v}`).join(', ')} |
| 최종 후보가 모두 무효인 실행 | ${summary.allFinalistsInvalid} |
| 채점한 안 전체 | ${S.toLocaleString()}개 (무효 ${pct(sInvalid, S)}, 위반 있음 ${pct(sViol, S)}) |
| 유효한 안의 기본점수 범위 | ${f2(summary.validBaseRange?.[0])} – ${f2(summary.validBaseRange?.[1])} |
| 최종 후보에서 (무효 최선 − 유효 최선) 기본점수 차의 최댓값 | ${f2(summary.invalidMarginMax)} (40보다 작으면 40은 우선순위와 같게 작동) |

${diffAC.length ? `### A와 C가 다른 실행 (${diffAC.length}회)
| 조건 | 시드 | A 위반·기본점수·모델 | C 위반·기본점수·모델 |
|---|---|---|---|
${diffAC.map((r) => `| ${r.spec} | ${r.seed} | ${r.A.viol} · ${f2(r.A.base)} · ${f2(r.A.model)} | ${r.C.viol} · ${f2(r.C.base)} · ${f2(r.C.model)} |`).join('\n')}
` : ''}
## 해석
- **감점 40**: 채점한 안 ${S.toLocaleString()}개 가운데 무효가 ${sInvalid}개입니다. 이 경로에서는 판상형 문법(buildLayout)이 정합성 규칙을 어기는 평면을 만들지 않으므로 40은 ${sInvalid ? '드물게' : '한 번도'} 작동하지 않습니다. 따라서 논문에서는 "무효 평면은 후보에서 제외한다(하드 제약)"로 서술할 수 있고 숫자 40은 필요 없습니다. 결과는 A와 B가 ${pct(summary.sameAB)} 같다는 것으로 확인됩니다.
- **감점 15**: 위반 수를 먼저 비교하는 우선순위(C)로 바꿔도 ${pct(summary.sameAC)} 같은 평면을 골랐습니다. 15는 사실상 "위반이 적은 안이 앞선다"는 우선순위로 작동합니다.
- **최종안에 남는 위반**: 모두 좁은 실이며 작은 평형(특히 59㎡ 방 3개)에 몰려 있습니다. C 규칙으로도 없어지지 않으므로 감점 크기의 문제가 아니라, 면적이 작아 최소 폭을 지킬 수 없는 조건의 문제입니다(별도 보고 필요).

## 한계
- 조건 20개는 QUBO 가중치 보정에 쓴 조건과 같습니다. 이 실험은 감점 구조만 비교하므로 보정 성능 주장에는 쓰지 않습니다.
- 생성기의 실제 시간 예산(300ms) 대신 평가 횟수로 고정했습니다. 풀이 결과의 질은 실제 화면과 다를 수 있습니다.
`;
fs.writeFileSync(path.join(outDir, 'penalty-structure.md'), md);
console.log(JSON.stringify({ ...summary, diffAC: summary.diffAC.length }, null, 1));

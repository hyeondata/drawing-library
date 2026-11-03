// QUBO 항 정의의 근거: 항마다 (가) 실제 아파트에서 그 관계가 얼마나 자주 나타나는가, (나) 생성 문법에서 우연히 나타나는 빈도와
// 비교해 방향(보상/벌점)이 데이터로 지지되는가, (다) 그 관계가 공간구문 지표를 어느 쪽으로 움직이는가를 잰다.
// 실제 세대(AI 허브 239.건축 도면 TL_SPA의 APT_FP_SPA 7,275장, 현관 하나 = 세대 하나)와
// 생성 평면(무작위 방 순서, 기본 치수)을 **같은 분석 함수(analyze)**로 잰다. 생성기 동작은 바꾸지 않는다.
// 결과: evidence/results/term-evidence.md, .json, 세대별 측정값 <data>/../derived/real-units.jsonl(통계는 analysis/term_evidence_stats.py)
// 사용: node scripts/term-evidence.mjs [--samples 200] [--data ../aihub-full/TL_SPA] [--boot 2000] [--threads N] [--no-cache]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { rng } from '../src/generate/layout.js';
import { TERMS } from '../src/generate/qubo.js';
import { CALIBRATED } from '../src/generate/qubo-weights.js';
import { END, SX, specs } from './lib/term-measure.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'evidence', 'results');
const argStr = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const arg = (name, def) => Number(argStr(name, def));
const SAMPLES = arg('samples', 200);
const BOOT = arg('boot', 2000);
// 실제 도면 기준은 전체 APT_FP_SPA 7,275장(샘플 20장이 아님). 없으면 멈춘다(샘플로 조용히 바꾸지 않음).
const dataDir = path.resolve(argStr('data', path.join(root, '..', 'aihub-full', 'TL_SPA')));
const PREFIX = 'APT_FP_SPA_';
if (!fs.existsSync(dataDir)) {
  console.error(`실제 도면 폴더가 없습니다: ${dataDir}\nDrive 도면_논문/1download.tar를 받아 TL_SPA.zip.part0을 이 폴더에 푸십시오.`);
  process.exit(1);
}
const SX_LABEL = { livingBedroomRatio: '거실/침실 통합도 비', kitchenBedroomRatio: '주방/침실 통합도 비', genotypeTau: '유전형 τ', privacyDepthGap: '사생활 깊이 차' };

// QUBO 항 ↔ 측정 관계. sign: 관계가 있을 때 항이 켜지는 방향(+1) 또는 반대(−1; masterNotEnd는 끝이 "아닐 때" 켜짐)
const MAP = {
  kitchenLiving: ['kitchenLiving', 1, '주방–거실 맞닿음'],
  entranceLiving: ['entranceLiving', 1, '현관–거실 맞닿음'],
  entranceKitchen: ['entranceKitchen', 1, '현관–주방 맞닿음'],
  bathKitchen: ['bathKitchen', 1, '공용욕실–주방 맞닿음'],
  bathEntrance: ['bathEntrance', 1, '공용욕실–현관 맞닿음'],
  bathLiving: ['bathLiving', 1, '공용욕실–거실 맞닿음'],
  multiKitchen: ['multiKitchen', 1, '다목적실–주방 맞닿음'],
  bedEntrance: ['bedEntrance', 1, '침실–현관 맞닿음'],
  backBedEntrance: ['bedEntrance', 1, '침실–현관 맞닿음(뒤 침실 항, 같은 관계로 측정)'],
  backBedKitchen: ['backBedKitchen', 1, '작은 침실–주방 맞닿음'],
  bedLiving: ['bedLiving', 1, '침실–거실 맞닿음'],
  bedBed: ['bedBed', 1, '침실끼리 맞닿음'],
  masterKitchen: ['masterKitchen', 1, '안방–주방 맞닿음'],
  bedOverBath: ['bedOverBath', 1, '작은 침실–공용욕실 맞닿음'],
  masterNotEnd: ['masterEnd', -1, '안방이 장축 끝 20% 안'],
  entranceEnd: ['entranceEnd', 1, '현관이 장축 끝 20% 안'],
  kitchenEnd: ['kitchenEnd', 1, '주방이 장축 끝 20% 안'],
  backBedEnd: ['otherBedEnd', 1, '작은 침실이 장축 끝 20% 안'],
  livingOffCenter: ['livingOffCenter', 1, '거실 중심의 장축 중앙 거리(0–0.5)'],
  backBedUnderBed: [null, 1, '생성 문법 고유(앞·뒤 띠)라 실제 도면에서 같은 정의로 잴 수 없음'],
};

// ---- 병렬 측정(worker_threads) + 캐시 ----
// 7,275장 분석이 한 스레드로 약 77초 걸려 CPU 스레드 수만큼 나눠 돌린다. 작업은 작은 묶음으로 쪼개 남는 worker가 바로 가져가게 한다.
// 실제 도면 측정값은 (해석기 코드, 측정 코드, 파일 목록)의 해시가 같으면 다시 계산하지 않는다(--no-cache로 끔).
// 기본 8: 7,275장 측정이 4스레드 6.0초, 8스레드 4.8초, 15스레드 5.2초로 8에서 가장 빠르다(한 스레드 20.7초).
const THREADS = Math.max(1, Math.min(arg('threads', Math.min(8, os.availableParallelism() - 1)), os.availableParallelism()));
function runPool(jobs) {
  return new Promise((resolve, reject) => {
    const results = new Array(jobs.length);
    let next = 0, done = 0;
    const workers = Array.from({ length: Math.min(THREADS, jobs.length) }, () => new Worker(new URL('./lib/term-measure-worker.mjs', import.meta.url)));
    const feed = (w) => {
      if (next < jobs.length) w.postMessage({ ...jobs[next], id: next++ });
    };
    for (const w of workers) {
      w.on('message', (m) => {
        results[m.id] = m;
        done++;
        if (done % 20 === 0 || done === jobs.length) process.stdout.write(`\r  ${done}/${jobs.length}`);
        if (done === jobs.length) {
          process.stdout.write('\n');
          workers.forEach((x) => x.terminate());
          resolve(results);
        } else feed(w);
      });
      w.on('error', reject);
      feed(w);
    }
  });
}
const hashOf = (parts) => crypto.createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 16);
const modelDir = path.join(root, 'src', 'model');
const codeHash = hashOf([
  ...fs.readdirSync(modelDir).sort().map((f) => fs.readFileSync(path.join(modelDir, f), 'utf8')),
  fs.readFileSync(path.join(root, 'scripts', 'lib', 'term-measure.mjs'), 'utf8'),
]);

// ---- (가) 실제 세대 ----
const realFiles = fs.readdirSync(dataDir).filter((f) => f.startsWith(PREFIX) && f.endsWith('.json')).sort();
const derivedDir = path.join(dataDir, '..', 'derived');
fs.mkdirSync(derivedDir, { recursive: true });
const unitsPath = path.join(derivedDir, 'real-units.jsonl');
const metaPath = path.join(derivedDir, 'real-units.meta.json');
const cacheKey = hashOf([codeHash, ...realFiles]);
let real, census;
const tReal = Date.now();
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : null;
if (!process.argv.includes('--no-cache') && meta?.key === cacheKey && fs.existsSync(unitsPath)) {
  real = fs.readFileSync(unitsPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  census = meta.census;
  console.log(`실제 도면: 캐시 사용(${meta.key}) ${census.drawings}장, 측정 ${real.length}세대`);
} else {
  console.log(`실제 도면 ${realFiles.length}장 측정(${THREADS}스레드)`);
  const CHUNK = 40;
  const jobs = [];
  for (let i = 0; i < realFiles.length; i += CHUNK) jobs.push({ type: 'real', dataDir, files: realFiles.slice(i, i + CHUNK) });
  const res = await runPool(jobs);
  real = res.flatMap((r) => r.rows); // 묶음 순서 = 파일 이름 순서라 결과 순서가 실행마다 같다
  census = { drawings: 0, noEntranceDrawings: 0, units: 0, noLiving: 0 };
  for (const r of res) for (const k in census) census[k] += r.census[k];
  fs.writeFileSync(unitsPath, real.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(metaPath, JSON.stringify({ key: cacheKey, codeHash, files: realFiles.length, census, createdAt: new Date().toISOString() }, null, 1));
}
const realSec = (Date.now() - tReal) / 1000;
console.log(`  세대 ${census.units}, 측정 ${real.length} (${realSec.toFixed(1)}초)`);

// ---- (나)(다) 생성 평면 ----
const t0 = Date.now();
console.log(`생성 평면: 조건 ${specs.length}개(${THREADS}스레드)`);
const gen = (await runPool(specs.map((_, si) => ({ type: 'gen', si, samples: SAMPLES })))).flatMap((r) => r.rows);
const genSec = (Date.now() - t0) / 1000;
console.log(`  생성 ${gen.length}개 (${genSec.toFixed(1)}초)`);


// ---- 요약 ----
const wilson = (k, n) => {
  if (!n) return [null, null];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - h, c + h];
};
// 실제 세대는 같은 도면(같은 단지·동) 안에서 닮아 독립이 아니다. 구간은 도면 단위 군집 부트스트랩(백분위)으로 낸다.
// 생성 평면은 Wilson 구간(참고)만 쓴다.
const bootRng = rng(20261103);
function clusterBoot(rows, key) {
  const byD = new Map();
  for (const r of rows) {
    const x = r.rel[key];
    if (x === null || x === undefined) continue;
    const c = byD.get(r.drawing) || byD.set(r.drawing, [0, 0]).get(r.drawing);
    c[0] += Number(x);
    c[1] += 1;
  }
  const cl = [...byD.values()];
  if (cl.length < 2) return [null, null];
  const est = [];
  for (let b = 0; b < BOOT; b++) {
    let s = 0, n = 0;
    for (let i = 0; i < cl.length; i++) {
      const c = cl[Math.floor(bootRng() * cl.length)];
      s += c[0];
      n += c[1];
    }
    est.push(s / n);
  }
  est.sort((x, y) => x - y);
  return [est[Math.floor(0.025 * BOOT)], est[Math.ceil(0.975 * BOOT) - 1]];
}
const rate = (rows, key, cluster = false) => {
  const v = rows.map((r) => r.rel[key]).filter((x) => x !== null && x !== undefined);
  const drawings = cluster ? new Set(rows.filter((r) => r.rel[key] !== null && r.rel[key] !== undefined).map((r) => r.drawing)).size : undefined;
  if (key === 'livingOffCenter') {
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    const [lo, hi] = cluster ? clusterBoot(rows, key) : [null, null];
    return { n: v.length, drawings, mean, lo, hi };
  }
  const k = v.filter(Boolean).length;
  const [lo, hi] = cluster ? clusterBoot(rows, key) : wilson(k, v.length);
  return { n: v.length, drawings, p: v.length ? k / v.length : null, lo, hi };
};
// 공간구문 효과: 생성 평면에서 같은 그룹(조건·템플릿) 안에서 관계 있음 − 없음의 지표 평균 차, 그룹 평균
function sxEffect(key) {
  const byG = new Map();
  for (const g of gen) (byG.get(g.group) || byG.set(g.group, []).get(g.group)).push(g);
  const out = {};
  for (const s of SX) {
    const diffs = [];
    for (const rows of byG.values()) {
      if (key === 'livingOffCenter') {
        // 중앙에 가까운 절반 − 먼 절반
        const v = rows.filter((r) => r.rel[key] !== null && r.sx[s] !== null).sort((a, b) => a.rel[key] - b.rel[key]);
        if (v.length < 4) continue;
        const h = Math.floor(v.length / 2);
        const m = (a) => a.reduce((t, r) => t + r.sx[s], 0) / a.length;
        diffs.push(m(v.slice(h)) - m(v.slice(0, h)));
        continue;
      }
      const yes = rows.filter((r) => r.rel[key] === true && r.sx[s] !== null);
      const no = rows.filter((r) => r.rel[key] === false && r.sx[s] !== null);
      if (yes.length < 3 || no.length < 3) continue;
      const m = (a) => a.reduce((t, r) => t + r.sx[s], 0) / a.length;
      diffs.push(m(yes) - m(no));
    }
    out[s] = diffs.length ? { mean: diffs.reduce((a, b) => a + b, 0) / diffs.length, groups: diffs.length, pos: diffs.filter((d) => d > 0).length } : null;
  }
  return out;
}
const lit = Object.fromEntries(TERMS.map((t) => [t.id, t.why]));
const rows = TERMS.map((t) => {
  const [key, sign, def] = MAP[t.id];
  if (!key) return { id: t.id, label: t.label, def, why: lit[t.id], hand: t.hand, cal: CALIBRATED.weights[t.id] };
  const R = rate(real, key, true);
  const G = rate(gen, key);
  return { id: t.id, label: t.label, key, sign, def, why: lit[t.id], hand: t.hand, cal: CALIBRATED.weights[t.id], real: R, gen: G, sx: sxEffect(key) };
});
fs.writeFileSync(path.join(outDir, 'term-evidence.json'), JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), dataDir: path.relative(root, dataDir), unitRule: 'entrance', census, bootstrap: BOOT, realUnits: real.length, genLayouts: gen.length, rows }, null, 1));

// 판정: 실제 빈도가 생성 문법의 우연 빈도보다 높으면 "실제 아파트가 이 관계를 택함" → 항이 켜질 때 보상(음수)이 데이터 방향
const f2 = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d));
const pc = (x) => (x === null || x === undefined ? '—' : `${Math.round(100 * x)}%`);
const pc1 = (x) => (x === null || x === undefined ? '—' : `${(100 * x).toFixed(1)}%`);
function verdict(r) {
  if (!r.real) return '측정 불가';
  if (r.key === 'livingOffCenter') {
    const d = r.real.mean - r.gen.mean;
    if (r.real.lo !== null && r.gen.mean >= r.real.lo && r.gen.mean <= r.real.hi) return '차이 불확실';
    return Math.abs(d) < 0.03 ? '차이 작음' : d < 0 ? '실제가 더 중앙 → 벌점 방향' : '실제가 덜 중앙 → 보상 방향';
  }
  if (r.real.n < 5) return '표본 부족';
  // 생성 문법이 그 관계를 거의 강제하면(우연 빈도 ≥ 95% 또는 ≤ 5%) 비교할 수 없다. 실제 빈도만 적는다.
  if (r.gen.p >= 0.95 || r.gen.p <= 0.05) return `생성 문법이 거의 강제(우연 비교 불가). 실제 ${pc(r.real.p)}`;
  // 실제 95% 구간이 생성 빈도를 포함하면 판단 보류
  if (r.gen.p >= r.real.lo && r.gen.p <= r.real.hi) return '차이 불확실';
  const prefer = r.real.p > r.gen.p; // 실제 아파트가 이 관계를 더 자주 택함
  const termOnPrefers = r.sign > 0 ? prefer : !prefer; // 항이 켜지는 상태를 실제가 선호하는가
  return termOnPrefers ? '항이 켜진 상태를 실제가 선호 → 보상(음수) 방향' : '항이 켜진 상태를 실제가 피함 → 벌점(양수) 방향';
}
const agree = (r, w) => {
  const v = verdict(r);
  if (v.startsWith('생성 문법')) return '—';
  if (v.includes('보상')) return w < 0 ? '일치' : w > 0 ? '**반대**' : '0';
  if (v.includes('벌점')) return w > 0 ? '일치' : w < 0 ? '**반대**' : '0';
  return '—';
};
const sxCell = (r, s) => {
  const e = r.sx?.[s];
  return e ? `${e.mean >= 0 ? '+' : ''}${e.mean.toFixed(2)} (${e.pos}/${e.groups})` : '—';
};
const md = `# QUBO 항 정의의 근거: 실제 아파트 빈도 · 생성 문법의 우연 빈도 · 공간구문 효과

> 생성: ${new Date().toISOString().slice(0, 10)} · \`node scripts/term-evidence.mjs --samples ${SAMPLES} --boot ${BOOT}\` · 실제 ${realSec.toFixed(1)}초, 생성 ${genSec.toFixed(1)}초, ${THREADS}스레드
> 실제 도면: AI 허브 239.건축 도면 데이터 학습 라벨 \`APT_FP_SPA_*\` ${census.drawings.toLocaleString()}장. **현관 하나 = 세대 하나**로 세어 ${census.units.toLocaleString()}세대(현관 없는 도면 ${census.noEntranceDrawings}장은 0세대). 그중 거실이 없는 ${census.noLiving.toLocaleString()}세대(대부분 한 세대의 현관이 두 폴리곤으로 나뉜 조각)는 관계를 정의할 수 없어 빼고 **${real.length.toLocaleString()}세대**를 측정했습니다.
> 실제 세대 ${real.length.toLocaleString()}개와 생성 평면 ${gen.length.toLocaleString()}개(조건 20개 × 템플릿, 무작위 방 순서, 기본 치수)를 같은 분석 함수(\`analyze\`)로 쟀습니다. 생성기 동작은 바꾸지 않았습니다.

## 질문
QUBO 항은 "어떤 관계를 보상하거나 벌점 줄 것인가"의 선언입니다. 항마다 세 가지를 확인합니다.
1. **실제 아파트에서 그 관계가 얼마나 자주 나타나는가** (실제 빈도, 95% 구간은 도면 단위 군집 부트스트랩 ${BOOT}회; 같은 도면의 세대는 서로 닮아 독립 표본으로 보지 않음)
2. **생성 문법에서 아무 순서나 골랐을 때 우연히 나타나는 빈도**와 비교해, 실제 아파트가 그 관계를 택하는가 피하는가 → 항의 **방향(부호)**의 데이터 근거
3. **그 관계가 공간구문 지표를 어느 쪽으로 움직이는가** (생성 평면에서, 같은 조건·템플릿 안의 "관계 있음 − 없음" 평균 차; 괄호는 양수인 그룹 수/전체)

## 측정 정의
- 맞닿음: 평가 모델의 벽 인접 그래프(\`spa.js\`)에서 두 실이 이웃인가. 안방 = 가장 큰 침실, 공용욕실 = 안방과 맞닿지 않은 화장실.
- 끝: 세대 실 중심들의 장축 범위에서 양 끝 ${END * 100}% 안. 거실 중앙 거리: 장축 위치의 0.5와의 차.
- QUBO 항은 띠의 칸으로 정의되어 있어 위 측정은 **같은 관계의 근사**입니다(예: QUBO의 "옆 칸"과 벽 인접은 다를 수 있음).

## 결과
| 항 | 측정 관계 | 실제 빈도 [95%] (세대 n / 도면 수) | 생성 우연 빈도 | 데이터 방향 | 손 / 보정 가중치 | 손 · 보정 부호 | 문헌·설계 의도 |
|---|---|---|---|---|---|---|---|
${rows
  .map((r) => {
    if (!r.real) return `| \`${r.id}\` ${r.label} | ${r.def} | — | — | 측정 불가 | ${r.hand} / ${r.cal} | — | ${r.why} |`;
    const realCell = r.key === 'livingOffCenter' ? `평균 ${f2(r.real.mean)} [${f2(r.real.lo)}, ${f2(r.real.hi)}] (${r.real.n.toLocaleString()} / ${r.real.drawings.toLocaleString()})` : `${pc1(r.real.p)} [${pc1(r.real.lo)}, ${pc1(r.real.hi)}] (${r.real.n.toLocaleString()} / ${r.real.drawings.toLocaleString()})`;
    const genCell = r.key === 'livingOffCenter' ? `평균 ${f2(r.gen.mean)}` : pc(r.gen.p);
    return `| \`${r.id}\` ${r.label} | ${r.def} | ${realCell} | ${genCell} | ${verdict(r)} | ${r.hand} / ${r.cal} | ${agree(r, r.hand)} · ${agree(r, r.cal)} | ${r.why} |`;
  })
  .join('\n')}

## 관계가 공간구문 지표에 주는 효과(생성 평면, 관계 있음 − 없음)
| 항 | ${SX.map((s) => SX_LABEL[s]).join(' | ')} |
|---|${SX.map(() => '---').join('|')}|
${rows.filter((r) => r.sx).map((r) => `| \`${r.id}\` ${r.label} | ${SX.map((s) => sxCell(r, s)).join(' | ')} |`).join('\n')}

거실 중앙 거리는 "중앙에서 먼 절반 − 가까운 절반"입니다.

## 한계
- 실제 도면은 학습 라벨(TL)만 썼습니다. 검증 라벨(VL)은 받지 않았습니다.
- 표본이 커서 구간이 좁습니다. "차이 있음"이 곧 "차이가 큼"은 아니므로 실제·우연 빈도의 차 크기를 함께 보십시오.
- 실제 도면의 관계와 공간구문 지표의 연관(침실 수·면적 통제, 도면 군집 표준오차)은 \`analysis/term_evidence_stats.py\` 결과(\`term-evidence-stats.md\`)에 따로 있습니다.
- 생성 우연 빈도는 이 생성 문법(판상형 두 띠) 안에서의 빈도입니다. 문법 자체가 이미 어떤 관계를 강제하면(예: 현관–주방) 비교가 의미 없을 수 있습니다.
- 공간구문 효과는 생성 평면에서의 연관이며, 다른 관계와 함께 바뀌는 효과가 섞여 있습니다.
`;
fs.writeFileSync(path.join(outDir, 'term-evidence.md'), md);
console.log(`실제 ${real.length}세대, 생성 ${gen.length}개`);

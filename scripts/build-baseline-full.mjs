// 평가 모델의 SPA 기준 분포를 AI 허브 전체 APT_FP_SPA 7,275장(현관 하나 = 세대 하나)으로 만든다.
// 결과: data/baseline-spa.json(요약형, 웹에는 baseline.json 안에 들어가 한 번만 실린다). build-baseline.mjs가 이것을 baseline.json에 넣는다.
// 데이터가 있는 PC에서만 실행한다(결과 파일은 저장소에 커밋). 평가 모델(config.js)을 바꾸면 다시 실행한다.
// 사용: node scripts/build-baseline-full.mjs [--data ../aihub-full/TL_SPA] [--threads N] [--keep-duplicates]
//
// 거르는 기준(이유)
//   1. 거실이 있는 세대(측정 단계): 거실 없는 현관 조각은 세대가 아니다.
//   2. 침실 1~5개: 6개 이상(678세대)은 대부분 현관 규칙이 두 세대를 한 세대로 묶은 결과(예: 침실 6·화장실 4·주방 1, 옆 조각은 주방만).
//      침실 0개는 원룸 아파트가 아니라 현관 조각이 거실을 가져간 경우다.
//   3. 주방·화장실이 있는 세대: 없는 세대(주방 555·화장실 145)는 이웃 조각에 실을 빼앗긴 세대라 면적비가 틀린다.
//   4. 같은 평면은 한 번만: 같은 평면형이 여러 도면에 반복 수록돼 세대의 55%가 다른 세대와 특징이 완전히 같다
//      (한 평면이 263번). 그대로 두면 많이 수록된 평면형이 기준을 끌고 간다. --keep-duplicates로 끈다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_VERSION, summarizePool } from '../src/model/index.js';
import { STRATA } from '../src/model/config.js';
import { defaultThreads, loadRealUnits } from './lib/real-units.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argStr = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const dataDir = path.resolve(argStr('data', path.join(root, '..', 'aihub-full', 'TL_SPA')));
const threads = Math.max(1, Number(argStr('threads', defaultThreads())));
const dedup = !process.argv.includes('--keep-duplicates');

const t0 = Date.now();
const { real, census } = await loadRealUnits({ root, dataDir, threads });
const tLoad = (Date.now() - t0) / 1000;

const removed = { bedrooms0: 0, bedrooms6plus: 0, noKitchen: 0, noBath: 0, duplicate: 0 };
const seen = new Set();
// 특징 비교는 소수 6자리까지(부동소수점 끝자리 차이를 같은 평면으로 본다)
const keyOf = (f) => JSON.stringify(f, (_, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));
const kept = [];
for (const r of real) {
  const f = r.features;
  if (f.bedroomCount < 1) removed.bedrooms0++;
  else if (f.bedroomCount > 5) removed.bedrooms6plus++;
  else if (!(f['ratio_주방'] > 0)) removed.noKitchen++;
  else if (!(f['ratio_화장실'] > 0)) removed.noBath++;
  else {
    const k = keyOf(f);
    if (dedup && seen.has(k)) removed.duplicate++;
    else {
      seen.add(k);
      kept.push(r);
    }
  }
}

const t1 = Date.now();
const summary = summarizePool(
  kept.map((r) => r.features),
  STRATA,
);
const tSum = (Date.now() - t1) / 1000;

const byBed = {};
for (const r of kept) byBed[r.features.bedroomCount] = (byBed[r.features.bedroomCount] || 0) + 1;
const out = {
  modelVersion: MODEL_VERSION,
  source: `AI 허브 239.건축 도면 데이터 TL_SPA, APT_FP_SPA ${census.drawings.toLocaleString('en-US')}장(현관 하나 = 세대 하나)`,
  filters: {
    unitRule: 'entrance',
    living: true,
    bedrooms: [1, 5],
    kitchen: true,
    bath: true,
    dedup,
  },
  census: { ...census, measured: real.length, removed, kept: kept.length, drawingsKept: new Set(kept.map((r) => r.drawing)).size, byBedrooms: byBed },
  summary,
};
const file = path.join(root, 'data', 'baseline-spa.json');
fs.writeFileSync(file, JSON.stringify(out));
// 기준에 들어간 세대 목록(분석 스크립트가 같은 세대를 쓰도록): <data>/../derived/baseline-units.jsonl
fs.writeFileSync(path.join(dataDir, '..', 'derived', 'baseline-units.jsonl'), kept.map((r) => JSON.stringify({ drawing: r.drawing, unit: r.unit })).join('\n') + '\n');
console.log(
  `SPA 기준 분포: ${census.drawings}장 → 측정 ${real.length}세대 → 기준 ${kept.length}평면(도면 ${out.census.drawingsKept}장)\n` +
    `  제외: ${Object.entries(removed).map(([k, v]) => `${k} ${v}`).join(', ')}\n` +
    `  층: ${Object.keys(summary.strata.layers).map((v) => `침실 ${v}(${summary.strata.layers[v].n})`).join(', ')}\n` +
    `  ${(fs.statSync(file).size / 1024).toFixed(0)}KB · 읽기 ${tLoad.toFixed(1)}초 · 요약 ${tSum.toFixed(1)}초`,
);

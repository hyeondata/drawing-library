// AI 허브 SPA 라벨 전체(TL_SPA, 9,645건)를 분석해 생성 조건과 판정 기준값의 근거 통계를 만든다.
// 출력: data/aihub-spa.json(세대별 행, 다시 만들 수 있어 커밋하지 않음)과 src/generate/aihub-stats.js(요약, 생성 화면이 읽음).
// 요약 기준: 아파트 평면도(APT_FP) 세대 중 필수 실(현관·거실·주방·침실·화장실)이 모두 있는 세대, 실 구성·면적비·변수가 똑같은 반복 세대는 하나로.
// 사용: node scripts/build-aihub-stats.mjs <TL_SPA 폴더>   (분석을 건너뛰고 요약만: --reuse)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unitRow } from '../src/generate/choices.js';
import { THRESHOLDS } from '../src/model/config.js';
import { bboxGap, polygonDistance } from '../src/model/geometry.js';
import { analyze } from '../src/model/index.js';
import { parseLabel } from '../src/model/labels.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2];
const REUSE = process.argv.includes('--reuse');
const cache = path.join(root, 'data', 'aihub-spa.json');
if (!REUSE && (!dir || !fs.existsSync(dir))) {
  console.error('사용: node scripts/build-aihub-stats.mjs <TL_SPA 폴더>');
  process.exit(1);
}

const FEATURE_KEYS = ['genotypeTau', 'privacyDepthGap', 'kitchenBedroomRatio', 'livingBedroomRatio', 'publicPrivateRatio', 'roomAspectRatio', 'roomRectangularity', 'exteriorExposure', 'bedroomMinWidth'];
const EXTERIOR = new Set(['발코니', '실외기실', '다목적공간']);
const round = (x, d = 4) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

function analyzeAll() {
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const units = [];
  const bedSide = []; // 도면별 침실 한 변(√면적) 중앙값(px)
  const gapHist = { interior: Array(101).fill(0), exterior: Array(101).fill(0) }; // 실 쌍 사이 최소 거리(0~100px, 1px 칸)
  const failed = [];
  const t0 = Date.now();
  files.forEach((f, i) => {
    const id = f.replace(/\.json$/, '');
    const [housing, plan] = id.split('_');
    let label;
    let a;
    try {
      label = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      a = analyze(label, 'SPA');
    } catch (e) {
      failed.push([id, String(e.message || e)]);
      return;
    }
    bedSide.push(round(a.scale * THRESHOLDS.referenceBedSide, 1));
    // 간격 분포: 경계 상자가 100px 안에 있는 실 쌍의 다각형 최소 거리
    const sp = parseLabel(label).items.filter((it) => it.group === '공간');
    for (let x = 0; x < sp.length; x++)
      for (let y = x + 1; y < sp.length; y++) {
        if (bboxGap(sp[x].bbox, sp[y].bbox) > 100) continue;
        const d = polygonDistance(sp[x].polys, sp[y].polys);
        if (d <= 100) gapHist[EXTERIOR.has(sp[x].type) || EXTERIOR.has(sp[y].type) ? 'exterior' : 'interior'][Math.floor(d)]++;
      }
    for (const u of a.units) {
      const r = unitRow(a, u);
      units.push({
        id,
        housing,
        plan,
        count: r.count,
        ...Object.fromEntries(['living', 'kitchen', 'entrance', 'master', 'other', 'masterRatio', 'bathEach', 'dress', 'multi'].map((k) => [k, round(r[k])])),
        f: Object.fromEntries(FEATURE_KEYS.map((k) => [k, round(u.features[k])])),
        pass: Object.fromEntries(u.rules.map((x) => [x.id, x.pass ? 1 : 0])),
      });
    }
    if ((i + 1) % 1000 === 0) console.log(`${i + 1}/${files.length} (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
  });
  
  return {
    source: { dataset: 'AI 허브 건축 도면 데이터 SPA 라벨(TL_SPA)', files: files.length, failed: failed.length, units: units.length, generatedAt: new Date().toISOString().slice(0, 10), referenceBedSide: THRESHOLDS.referenceBedSide },
    calib: { bedSide, gapHist },
    failed,
    units,
  };
}

const all = REUSE ? JSON.parse(fs.readFileSync(cache, 'utf8')) : analyzeAll();
if (!REUSE) {
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify(all));
  console.log(`도면 ${all.source.files}건(실패 ${all.source.failed}) → 세대 ${all.source.units}개 → data/aihub-spa.json`);
}

// ---- 요약 ----
const quantile = (values, p) => {
  const v = values.filter((x) => x !== null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!v.length) return null;
  const i = (v.length - 1) * p;
  const lo = Math.floor(i);
  return round(v[lo] + (v[Math.min(v.length - 1, lo + 1)] - v[lo]) * (i - lo));
};
const qs = (v, ps = [0.1, 0.25, 0.5, 0.75, 0.9]) => Object.fromEntries(ps.map((p) => [`p${Math.round(p * 100)}`, quantile(v, p)]));
const share = (rows, pred) => (rows.length ? round(rows.filter(pred).length / rows.length, 3) : null);
const REQUIRED = ['현관', '거실', '주방', '침실', '화장실'];
const complete = all.units.filter((u) => u.housing === 'APT' && u.plan === 'FP' && REQUIRED.every((t) => u.count[t] > 0));
const seen = new Set();
const apt = complete.filter((u) => {
  const sig = JSON.stringify([u.count, u.living, u.kitchen, u.entrance, u.master, u.other, u.f]);
  if (seen.has(sig)) return false;
  seen.add(sig);
  return true;
});
const n = (u, t) => u.count[t] || 0;
const col = (rows, k) => rows.map((u) => u[k]);
const comp = (rows) => ({
  baths2: share(rows, (u) => n(u, '화장실') >= 2),
  baths3: share(rows, (u) => n(u, '화장실') >= 3),
  dress: share(rows, (u) => n(u, '드레스룸') > 0),
  multi: share(rows, (u) => n(u, '다목적공간') > 0),
  outdoorUnit: share(rows, (u) => n(u, '실외기실') > 0),
  balcony: share(rows, (u) => n(u, '발코니') > 0),
});
const BEDS = [1, 2, 3, 4, 5];
const byBedrooms = Object.fromEntries(
  BEDS.map((b) => {
    const rows = apt.filter((u) => n(u, '침실') === b);
    return [b, {
      n: rows.length,
      other: qs(col(rows, 'other'), [0.25, 0.5, 0.75]),
      masterRatio: qs(col(rows, 'masterRatio'), [0.25, 0.5, 0.75]),
      master: quantile(col(rows, 'master'), 0.5),
      kitchen: quantile(col(rows, 'kitchen'), 0.5),
      entrance: quantile(col(rows, 'entrance'), 0.5),
      bath: quantile(col(rows, 'bathEach'), 0.5),
      dress: quantile(col(rows, 'dress'), 0.5),
      multi: quantile(col(rows, 'multi'), 0.5),
      composition: comp(rows),
    }];
  }),
);
const rulePass = {};
for (const u of apt) for (const [id, p] of Object.entries(u.pass)) (rulePass[id] ||= [0, 0]), (rulePass[id][0] += p), rulePass[id][1]++;
const histQ = (h, p) => {
  const tot = h.reduce((s, x) => s + x, 0);
  let acc = 0;
  for (let i = 0; i < h.length; i++) if ((acc += h[i]) >= p * tot) return i;
  return h.length - 1;
};
const bedHist = {};
for (const u of apt) bedHist[n(u, '침실')] = (bedHist[n(u, '침실')] || 0) + 1;
const bathHist = {};
for (const u of apt) bathHist[n(u, '화장실')] = (bathHist[n(u, '화장실')] || 0) + 1;
const summary = {
  source: {
    ...all.source,
    byType: Object.fromEntries([...new Set(all.units.map((u) => `${u.housing}_${u.plan}`))].sort().map((k) => [k, all.units.filter((u) => `${u.housing}_${u.plan}` === k).length])),
    aptComplete: complete.length,
    aptUnique: apt.length,
  },
  calib: {
    bedSide: qs(all.calib.bedSide),
    gap: Object.fromEntries(Object.entries(all.calib.gapHist).map(([k, h]) => [k, { p50: histQ(h, 0.5), p75: histQ(h, 0.75), p90: histQ(h, 0.9) }])),
  },
  rulePass: Object.fromEntries(Object.entries(rulePass).map(([id, [a, b]]) => [id, round(a / b, 3)])),
  bedrooms: bedHist,
  baths: bathHist,
  living: qs(col(apt, 'living')),
  byBedrooms,
  composition: comp(apt),
  targets: { kitchen: quantile(col(apt, 'kitchen'), 0.5), entrance: quantile(col(apt, 'entrance'), 0.5), bath: quantile(col(apt, 'bathEach'), 0.5), dress: quantile(col(apt, 'dress'), 0.5), multi: quantile(col(apt, 'multi'), 0.5) },
  features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, qs(apt.map((u) => u.f[k]))])),
};
fs.writeFileSync(
  path.join(root, 'src', 'generate', 'aihub-stats.js'),
  `// scripts/build-aihub-stats.mjs가 만든 파일(손대지 말 것). AI 허브 SPA 라벨 전체(TL_SPA)의 아파트 평면도(APT_FP) 세대 요약.\n// 도면 ${summary.source.files}건 → 세대 ${summary.source.units}개, 그중 필수 실이 모두 있는 아파트 평면도(APT_FP) ${summary.source.aptComplete}개, 반복 세대를 뺀 ${summary.source.aptUnique}개.\nexport const AIHUB = ${JSON.stringify(summary, null, 1)};\n`,
);
console.log(`요약: APT_FP 완결 세대 ${complete.length}개 → 반복 제외 ${apt.length}개 → src/generate/aihub-stats.js`);

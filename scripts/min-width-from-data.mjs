// 실별 최소 폭을 실제 한국 아파트(dev 묶음)에서 정한다.
// 왜: 생성기의 MIN_SIDE(거실 3.6 m, 침실 2.4 m 등)는 근거가 없고, 법정 최소 실 폭도 없다(주택건설기준 규정 제13조).
//   도면 축척은 상대값만 검증되어(scale-check) 절대 m로 바꿀 수 없으므로, 폭을 '그 세대 침실 한 변 중앙값'에 대한 비로 잰다.
//   생성기는 이 비에 자기 침실 한 변(√침실 면적)을 곱해 m로 쓴다 — 축척과 무관.
// 폭 = 회전 최소 외접 사각형(MBR)의 짧은 변. 안방 = 세대에서 가장 큰 침실.
// 사용: node scripts/min-width-from-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/model/index.js';
import { minAreaRect } from '../src/model/geometry.js';
import { requireDataDir } from './lib/real-units.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '..', 'aihub-full', 'TL_SPA');
requireDataDir(dataDir);
const test = new Set(JSON.parse(fs.readFileSync(path.join(root, 'data', 'split.json'), 'utf8')).test);
const files = fs.readdirSync(dataDir).filter((f) => f.startsWith('APT_FP_SPA_') && f.endsWith('.json') && !test.has(f));
const TYPES = ['안방', '침실', '거실', '주방', '화장실', '현관', '드레스룸', '다목적공간'];
const vals = Object.fromEntries(TYPES.map((t) => [t, []]));
const seen = new Set();
let units = 0, dup = 0;
const t0 = Date.now();
for (const f of files) {
  const a = analyze(JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')), 'SPA', { unitRule: 'entrance' });
  for (const u of a.units) {
    const sp = u.members.map((g) => a.spaces[g]);
    const beds = sp.filter((s) => s.type === '침실');
    if (beds.length < 2 || beds.length > 4 || !sp.some((s) => s.type === '주방') || !sp.some((s) => s.type === '화장실')) continue;
    const sides = beds.map((b) => Math.sqrt(b.area)).sort((x, y) => x - y);
    const ref = sides.length % 2 ? sides[sides.length >> 1] : (sides[sides.length / 2 - 1] + sides[sides.length / 2]) / 2;
    const master = beds.reduce((m, b) => (b.area > m.area ? b : m));
    const rows = [];
    for (const s of sp) {
      const t = s === master ? '안방' : s.type;
      if (!vals[t]) continue;
      rows.push([t, minAreaRect(s.polys).short / ref]);
    }
    // 같은 평면 중복은 한 번만(축척에 무관한 비의 서명)
    const sig = rows.map(([t, r]) => `${t}${r.toFixed(3)}`).sort().join('|');
    if (seen.has(sig)) { dup++; continue; }
    seen.add(sig);
    units++;
    for (const [t, r] of rows) vals[t].push(r);
  }
}
const q = (v, p) => { const s = v.slice().sort((a, b) => a - b); const k = (s.length - 1) * p; return s[Math.floor(k)] + (s[Math.ceil(k)] - s[Math.floor(k)]) * (k % 1); };
const out = { drawings: files.length, units, duplicatesSkipped: dup, ratio: {} };
for (const t of TYPES) if (vals[t].length) out.ratio[t] = { n: vals[t].length, q05: q(vals[t], 0.05), q10: q(vals[t], 0.1), median: q(vals[t], 0.5) };
fs.writeFileSync(path.join(root, 'evidence', 'results', 'min-width-from-data.json'), JSON.stringify(out, null, 1));
const ratio = Object.fromEntries(Object.entries(out.ratio).map(([t, r]) => [t, Number(r.q05.toFixed(3))]));
fs.writeFileSync(
  path.join(root, 'src', 'generate', 'min-width.js'),
  `// scripts/min-width-from-data.mjs가 만든 파일(손대지 말 것).\n// 실별 최소 폭 = 이 비 × 그 평면 침실 한 변(√침실 면적 중앙값). 비는 한국 실제 아파트(AI 허브 dev 묶음, 서로 다른 평면 ${units.toLocaleString('en-US')}세대)의\n// 실별 짧은 변(회전 MBR) ÷ 같은 세대 침실 한 변 중앙값의 하위 5% 분위수. 법정 최소 실 폭은 없다(주택건설기준 규정 제13조).\nexport const MIN_WIDTH_RATIO = ${JSON.stringify(ratio, null, 2)};\n`,
);
console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s units ${units} dup ${dup}`);
for (const [t, r] of Object.entries(out.ratio)) console.log(t.padEnd(6), r.n, 'q05', r.q05.toFixed(3), 'q10', r.q10.toFixed(3), 'med', r.median.toFixed(3));

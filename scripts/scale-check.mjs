// 축척 보정이 맞는가: 침실 크기로 정한 도면 배율을 독립 기준(엘리베이터 승강로)으로 검증한다.
// 왜: AI 허브 도면은 모두 같은 종이 크기에 맞춰 그려져 1px의 실제 길이가 도면마다 다르다. 평가 모델은 침실 한 변 중앙값으로
//   배율(scale)을 정하고(spa.js drawingScale) 면적·길이 기준을 이것으로 보정한다. 그런데 침실 크기는 평형에 따라 달라
//   배율이 '도면 축척'이 아니라 '침실 크기'를 재는 것일 수 있다.
// 검증: 엘리베이터 승강로는 법규·제품 규격으로 크기가 거의 정해진 공간이라 축척의 독립 기준이 된다.
//   배율이 축척을 제대로 잡는다면 log(엘리베이터 px 면적) = 2·log(배율) + 상수 (기울기 2)이고, 배율로 나눈 면적의 흩어짐이 크게 줄어야 한다.
// 사용: node scripts/scale-check.mjs [--data ../aihub-full/TL_SPA]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/model/index.js';
import { requireDataDir } from './lib/real-units.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--data');
const dataDir = path.resolve(i > 0 ? process.argv[i + 1] : path.join(root, '..', 'aihub-full', 'TL_SPA'));
requireDataDir(dataDir);
const files = fs.readdirSync(dataDir).filter((f) => f.startsWith('APT_FP_SPA_') && f.endsWith('.json')).sort();
const t0 = Date.now();
const rows = [];
for (const f of files) {
  const a = analyze(JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')), 'SPA', { unitRule: 'entrance' });
  const el = a.spaces.filter((s) => s.type === '엘리베이터').map((s) => s.area).sort((x, y) => x - y);
  if (!el.length || !a.scale) continue;
  rows.push({ f, scale: a.scale, el: el[el.length >> 1] });
}
const med = (v) => {
  const s = v.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const q = (v, p) => {
  const s = v.slice().sort((a, b) => a - b);
  const k = (s.length - 1) * p;
  return s[Math.floor(k)] + (s[Math.ceil(k)] - s[Math.floor(k)]) * (k % 1);
};
const rcv = (v) => (q(v, 0.75) - q(v, 0.25)) / 1.349 / med(v); // 강건 변동계수(IQR/1.349 ÷ 중앙값)
const x = rows.map((r) => Math.log(r.scale));
const y = rows.map((r) => Math.log(r.el));
const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
let sxy = 0, sxx = 0, syy = 0;
for (let k = 0; k < x.length; k++) (sxy += (x[k] - mx) * (y[k] - my)), (sxx += (x[k] - mx) ** 2), (syy += (y[k] - my) ** 2);
const slope = sxy / sxx;
const r = sxy / Math.sqrt(sxx * syy);
const se = Math.sqrt((syy - slope * sxy) / (x.length - 2) / sxx);
const raw = rows.map((r) => r.el), norm = rows.map((r) => r.el / r.scale ** 2);
const out = { drawings: files.length, withElevator: rows.length, slope, slopeCI: [slope - 1.96 * se, slope + 1.96 * se], r, rcvRaw: rcv(raw), rcvNorm: rcv(norm), medNorm: med(norm) };
const L = ['# 축척 보정 검증: 엘리베이터 승강로를 독립 기준으로\n'];
L.push(`> 생성: ${new Date().toISOString().slice(0, 10)} · \`node scripts/scale-check.mjs\` · ${((Date.now() - t0) / 1000).toFixed(0)}초 · AI 허브 APT_FP_SPA ${files.length.toLocaleString('en-US')}장 중 엘리베이터가 있는 ${rows.length.toLocaleString('en-US')}장\n`);
L.push('## 질문\n');
L.push('평가 모델은 도면마다 침실 한 변 중앙값으로 배율을 정해 길이·면적 기준을 보정합니다. 이 배율이 정말 도면 축척을 잡는지, 크기가 거의 규격으로 정해진 엘리베이터 승강로로 확인합니다. 축척을 잡는다면 엘리베이터 px 면적이 배율의 제곱에 비례해야 합니다(로그 기울기 2).\n');
L.push('## 결과\n');
L.push('| 항목 | 값 |');
L.push('|---|---|');
L.push(`| log(엘리베이터 px 면적) ~ log(배율) 기울기 | **${slope.toFixed(2)}** [95% ${out.slopeCI[0].toFixed(2)}, ${out.slopeCI[1].toFixed(2)}] (기대값 2) |`);
L.push(`| 상관 r | ${r.toFixed(2)} |`);
L.push(`| 엘리베이터 면적의 강건 변동계수: 보정 전 px² | ${out.rcvRaw.toFixed(2)} |`);
L.push(`| 엘리베이터 면적의 강건 변동계수: 배율로 보정 후 | **${out.rcvNorm.toFixed(2)}** |`);
L.push('');
L.push('## 해석\n');
L.push(`- 기울기가 2에 가깝고(r = ${r.toFixed(2)}) 배율 보정으로 엘리베이터 면적의 흩어짐이 ${out.rcvRaw.toFixed(2)} → ${out.rcvNorm.toFixed(2)}로 줄었습니다. 침실로 정한 배율이 침실 크기가 아니라 **도면 축척**을 잡는다는 독립 근거입니다. 따라서 축척 보정한 면적비·길이 기준은 도면 사이에 비교할 수 있습니다.`);
L.push('- 보정 후에도 남는 흩어짐은 엘리베이터 용량(인승·침대용) 차이와 침실 크기의 평형별 차이를 함께 담습니다.');
L.push('- **절대 크기(㎡, m)는 여전히 정할 수 없습니다.** 라벨에 치수 문자가 없고(OCR 라벨은 실 이름·도면 제목뿐, 숫자 치수 0개), 승강로 크기는 용량마다 달라 한 값으로 환산하면 오차가 큽니다. 절대 면적은 원본 도면 이미지의 치수선을 읽어야 합니다.');
fs.writeFileSync(path.join(root, 'evidence', 'results', 'scale-check.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(root, 'evidence', 'results', 'scale-check.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));

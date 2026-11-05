// 검증: 8px 미만으로 붙은 현관 라벨 쌍을 묶지 않고 따로 세대로 나누면, 두 쪽이 모두 진짜 세대(거실·침실 있음)가 되는지 센다.
// 사용: node scripts/verify-entrance-split.mjs . <TL_SPA 폴더>
import fs from 'node:fs';
const dl = process.argv[2], dir = process.argv[3];
const { THRESHOLDS } = await import(dl + '/src/model/config.js');
const { analyze } = await import(dl + '/src/model/index.js');
const { parseLabel } = await import(dl + '/src/model/labels.js');
const { polygonDistance } = await import(dl + '/src/model/geometry.js');
const GAP = THRESHOLDS.entranceSplitGap;
THRESHOLDS.entranceSplitGap = 0; // 묶지 않고 현관 라벨마다 세대 하나
let pairs = 0, bothReal = 0, oneFragment = 0, files = 0;
const areaRatio = [];
for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('APT_FP_SPA_'))) {
  const label = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  const ents = parseLabel(label).items.filter((it) => it.type === '현관');
  const close = [];
  for (let a = 0; a < ents.length; a++) for (let b = a + 1; b < ents.length; b++) if (polygonDistance(ents[a].polys, ents[b].polys) < GAP) close.push([a, b]);
  if (!close.length) continue;
  files++;
  const an = analyze(label, 'SPA');
  // 분석기의 spaces는 '공간' 항목 순서. 현관 id로 세대를 찾는다.
  const unitOfId = new Map();
  an.units.forEach((u) => u.members.forEach((m) => unitOfId.set(an.spaces[m].id, u)));
  for (const [a, b] of close) {
    pairs++;
    const real = (e) => { const u = unitOfId.get(e.id); const t = u ? u.nodes.map((n) => n.type) : []; return t.includes('거실') && t.includes('침실'); };
    const ra = real(ents[a]), rb = real(ents[b]);
    if (ra && rb) bothReal++; else oneFragment++;
    areaRatio.push(Math.min(ents[a].area, ents[b].area) / Math.max(ents[a].area, ents[b].area));
  }
}
areaRatio.sort((x, y) => x - y);
console.log({ files, closePairs: pairs, bothRealHouseholds: bothReal, oneIsFragment: oneFragment, areaRatioP50: areaRatio[Math.floor(areaRatio.length / 2)].toFixed(2) });

// 검증: APT_FP 도면마다 세대 수 = 현관 묶음 수(entranceSplitGap 미만으로 맞닿은 현관 라벨은 하나)인지 대조한다.
// 사용: node scripts/build-aihub-stats.mjs <TL_SPA> 뒤에 node scripts/verify-units.mjs . <TL_SPA>
import fs from 'node:fs';
const dl = process.argv[2], dir = process.argv[3];
const { parseLabel } = await import(dl + '/src/model/labels.js');
const { polygonDistance } = await import(dl + '/src/model/geometry.js');
const { THRESHOLDS } = await import(dl + '/src/model/config.js');
const rows = JSON.parse(fs.readFileSync(dl + '/data/aihub-spa.json', 'utf8')).units.filter((u) => u.housing === 'APT' && u.plan === 'FP');
const unitsOf = new Map();
for (const u of rows) unitsOf.set(u.id, (unitsOf.get(u.id) || 0) + 1);
let files = 0, ann = 0, groupsTotal = 0, noEnt = 0, match = 0;
const bad = [];
for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('APT_FP_SPA_'))) {
  files++;
  const id = f.replace(/\.json$/, '');
  const ents = parseLabel(JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'))).items.filter((it) => it.type === '현관');
  ann += ents.length;
  const p = ents.map((_, k) => k);
  const find = (k) => (p[k] === k ? k : (p[k] = find(p[k])));
  for (let a = 0; a < ents.length; a++) for (let b = a + 1; b < ents.length; b++) if (polygonDistance(ents[a].polys, ents[b].polys) < THRESHOLDS.entranceSplitGap) p[find(b)] = find(a);
  const groups = new Set(ents.map((_, k) => find(k))).size;
  const expected = groups || 1; // 현관이 없으면 거실 기준 1세대
  if (!groups) noEnt++;
  groupsTotal += groups;
  if ((unitsOf.get(id) || 0) === expected) match++;
  else bad.push([id, groups, unitsOf.get(id) || 0]);
}
console.log({ files, entranceLabels: ann, entranceGroups: groupsTotal, drawingsWithoutEntrance: noEnt, unitsTotal: rows.length, drawingsMatching: match, mismatches: bad.length });
console.log(bad.slice(0, 5));

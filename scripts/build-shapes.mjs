// AI 허브 아파트 평면도(APT_FP) SPA 라벨에서 '사각형이 아닌 실'이 있는 세대를 뽑아 자유형 평면 생성 페이지의 기준 세대 목록을 만든다.
// 전체 데이터(TL_SPA)를 주면 침실 수(2~5개)마다 비정형 실이 많은 세대를 PER_BEDS개씩, 같은 세대 반복과 원본이 접근 규칙을 어기는 세대는 빼고 고른다.
// 출력: public/data/shapes.json
// 축척: 도면마다 1px의 실제 길이가 달라, 분석기와 같은 방법(침실 한 변 중앙값을 자로)으로 m를 추정한다.
//       기준 침실 한 변 297px(축척 1) ≈ 3.2m로 가정. 화면에서 전용면적을 고르면 그 값에 맞춰 다시 늘이거나 줄인다.
// 사용: node scripts/build-shapes.mjs <TL_SPA 폴더>   (폴더를 안 주면 public/data/labels의 Sample)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/model/index.js';
import { THRESHOLDS } from '../src/model/config.js';
import { access, energy, openings, setup } from '../src/freeform/engine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] || path.join(root, 'public', 'data', 'labels');
const PER_BEDS = 15;
const BED_SIDE_M = 3.2;
const KEEP = new Set(['거실', '침실', '주방', '현관', '화장실', '발코니', '실외기실', '드레스룸', '다목적공간', '기타']);
const OUTDOOR = new Set(['발코니', '실외기실']);

const area = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
};
const bbox = (pts) => {
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

const out = [];
for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('APT_FP_SPA_') && x.endsWith('.json')).sort()) {
  const drawing = f.replace(/\.json$/, '');
  const a = analyze(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), 'SPA');
  const pxPerM = (THRESHOLDS.referenceBedSide * a.scale) / BED_SIDE_M;
  a.units.forEach((u, ui) => {
    const members = u.members.filter((i) => KEEP.has(a.spaces[i].type));
    const types = members.map((i) => a.spaces[i].type);
    if (!types.includes('현관') || !types.includes('거실') || !types.includes('주방') || !types.includes('침실')) return;
    if (members.length < 6) return;
    const all = members.flatMap((i) => a.spaces[i].polys.flat());
    const [x0, y0] = bbox(all);
    const rooms = members.map((i) => {
      const s = a.spaces[i];
      const polys = s.polys.map((p) => p.map(([x, y]) => [+((x - x0) / pxPerM).toFixed(3), +((y - y0) / pxPerM).toFixed(3)]));
      const ar = polys.reduce((t, p) => t + area(p), 0);
      const b = bbox(polys.flat());
      const rect = ar / Math.max(1e-9, (b[2] - b[0]) * (b[3] - b[1]));
      return { type: s.type, polys, area: +ar.toFixed(2), rect: +rect.toFixed(2) };
    });
    const index = new Map(members.map((m, k) => [m, k]));
    const edges = u.edges.filter(([i, j]) => index.has(i) && index.has(j)).map(([i, j]) => [index.get(i), index.get(j)]);
    const interior = rooms.filter((r) => !OUTDOOR.has(r.type)).reduce((t, r) => t + r.area, 0);
    // 사각형이 아닌 실: 면적이 외접 사각형의 85% 미만이고 2㎡ 이상인 실내 실
    const nonrect = rooms.filter((r) => !OUTDOOR.has(r.type) && r.rect < 0.85 && r.area >= 2);
    if (!nonrect.length || interior < 35 || interior > 200) return;
    const b = bbox(rooms.flatMap((r) => r.polys.flat()));
    // 세대 분리가 잘못돼 여러 세대·복도가 이어진 경우(너무 길쭉하거나 실이 너무 많음)는 뺀다.
    const aspect = b[2] / b[3];
    if (aspect > 2.6 || aspect < 0.4 || rooms.length > 24) return;
    out.push({
      id: `${drawing.replace('APT_FP_SPA_', '')}-${ui + 1}`,
      drawing,
      unit: ui + 1,
      W: +b[2].toFixed(2),
      H: +b[3].toFixed(2),
      interior: +interior.toFixed(1),
      rooms,
      edges,
      nonrect: nonrect.map((r) => r.type),
      beds: types.filter((t) => t === '침실').length,
      baths: types.filter((t) => t === '화장실').length,
    });
  });
}
out.sort((p, q) => q.nonrect.length - p.nonrect.length || p.interior - q.interior);
// 같은 세대 반복(실 구성·면적이 같음)은 하나만, 침실 수마다 PER_BEDS개까지
const seen = new Set();
const perBeds = {};
const picked = out.filter((u) => {
  const sig = `${u.rooms.map((r) => `${r.type}${r.area}`).sort().join()}`;
  if (seen.has(sig) || u.beds < 2 || u.beds > 5 || (perBeds[u.beds] || 0) >= PER_BEDS) return false;
  // 원본 배치가 접근 규칙을 통과하고 문이 현관에서 이어지는 세대만(세대 분리가 어긋난 세대를 거름)
  const P = setup(u);
  const g = Int16Array.from(P.grid);
  if (access(P, energy(g, P).stats).unreach.length || openings(g, P).unreachable.length) return false;
  seen.add(sig);
  perBeds[u.beds] = (perBeds[u.beds] || 0) + 1;
  return true;
});
fs.writeFileSync(path.join(root, 'public', 'data', 'shapes.json'), JSON.stringify(picked));
console.log(`후보 세대 ${out.length}개 → ${picked.length}개(침실 수별 ${JSON.stringify(perBeds)}, 원본이 접근 규칙을 통과한 세대만) → public/data/shapes.json`);
for (const u of picked) console.log(u.id, `${u.interior}㎡`, `침실${u.beds} 욕실${u.baths}`, '사각형 아님:', u.nonrect.join(','));

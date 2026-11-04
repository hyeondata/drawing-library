// 벽 인접 그래프 대 출입(문) 그래프: AI 허브 SPA(공간)와 STR(벽·문·창) 라벨이 둘 다 있는 아파트 평면에서 같은 세대의 두 그래프를 만든다.
// 왜: 공간구문 정당화 그래프의 표준은 출입 관계(문·개방 경계)인데, 이 연구의 실제 평면 그래프는 SPA만으로 만든 벽 인접 그래프다.
//   두 라벨이 겹치는 도면에서 벽 그래프의 오차를 직접 잰다(SCI(E) 점검 2026-11-04, Confluence 09-13 13절).
// 출입 링크 = 벽 인접 링크 중 (a) 문 다각형이 두 실 모두에 tol 이내로 붙어 있거나 (b) 두 실 사이 틈이 openGap 이하이고 그 사이에 STR 벽체가 없는 것(개방 경계).
// 세대 구분은 벽 그래프 기준(현관 하나 = 세대 하나)으로 고정하고 그 안의 링크만 비교한다.
// 사용: node scripts/door-vs-wall.mjs <TL_STR 폴더> → ../aihub-full/derived/door-vs-wall.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/model/index.js';
import { pointInPolygon, polygonDistance } from '../src/model/geometry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spaDir = path.join(root, '..', 'aihub-full', 'TL_SPA');
const strDir = process.argv[2];
const test = new Set(JSON.parse(fs.readFileSync(path.join(root, 'data', 'split.json'), 'utf8')).test);
const num = (f) => f.match(/(\d+)\.json$/)[1];
const strByNum = new Map(fs.readdirSync(strDir).filter((f) => f.startsWith('APT_FP_STR_')).map((f) => [num(f), f]));
const files = fs.readdirSync(spaDir).filter((f) => f.startsWith('APT_FP_SPA_') && strByNum.has(num(f)));
const TOL = Number(process.env.DOOR_TOL ?? 15);
const OPEN = Number(process.env.OPEN_GAP ?? 4);
const out = [];
for (const f of files) {
  const spa = analyze(JSON.parse(fs.readFileSync(path.join(spaDir, f), 'utf8')), 'SPA', { unitRule: 'entrance' });
  const str = analyze(JSON.parse(fs.readFileSync(path.join(strDir, strByNum.get(num(f))), 'utf8')), 'STR');
  const doors = str.elements.filter((e) => e.type === '출입문');
  const walls = str.elements.filter((e) => e.type === '벽체');
  // 틈이 거의 없어도 그 경계에 STR 벽체가 있으면 개방 경계가 아니다(SPA 다각형이 벽 중심선까지 그려진 경우).
  // 판정: 실 i 경계를 4 px 간격으로 걸으며 실 j 경계에서 (틈 + 4 px) 이내인 '맞닿은 점'을 모으고,
  //   그중 벽체 다각형 안이거나 벽체에서 3 px 이내인 점이 절반 이상이면 벽, 아니면 개방 경계.
  const segs = (polys) => polys.flatMap((pts) => pts.map((a, k) => [a, pts[(k + 1) % pts.length]]));
  const dseg = (x, y, [[ax, ay], [bx, by]]) => {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
  };
  const dto = (x, y, ss) => ss.reduce((m, sg) => Math.min(m, dseg(x, y, sg)), Infinity);
  const wallSegs = walls.map((w) => ({ w, ss: segs(w.polys), bb: w.polys.flat().reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]) }));
  const onWall = (x, y) => wallSegs.some(({ w, ss, bb }) => x >= bb[0] - 3 && x <= bb[2] + 3 && y >= bb[1] - 3 && y <= bb[3] + 3 && (w.polys.some((q) => pointInPolygon(x, y, q)) || dto(x, y, ss) <= 3));
  // 최소 틈(gap)은 모서리 한 점에서 0이 될 수 있어(다각형 꼭짓점이 벽 속으로 들어간 경우) 개방 판정에 쓰지 않는다.
  // 대신 4 px 이내로 붙은 경계 길이가 벽 인접 접촉 길이의 절반 이상이고, 그 구간 절반 이상이 벽체 위가 아닐 때만 개방 경계로 본다.
  const wallBetween = (i, j, gap, contact) => {
    const sj = segs(spa.spaces[j].polys);
    const pts = [];
    for (const [[ax, ay], [bx, by]] of segs(spa.spaces[i].polys)) {
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
      for (let k = 0; k < n; k++) {
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
        if (dto(x, y, sj) <= 4) pts.push([x, y]);
      }
    }
    if (pts.length * 4 < 0.5 * contact) return true;
    return pts.filter(([x, y]) => onWall(x, y)).length / pts.length >= 0.5;
  };
  const near = doors.map((d) => new Set(spa.spaces.map((s, i) => (polygonDistance(d.polys, s.polys) <= TOL ? i : -1)).filter((i) => i >= 0)));
  for (const u of spa.units) {
    const mem = u.members;
    const idx = new Map(mem.map((g, l) => [g, l]));
    const edges = spa.edges.filter(([i, j]) => idx.has(i) && idx.has(j)).map(([i, j, contact, gap]) => {
      const door = near.some((s) => s.has(i) && s.has(j));
      const thin = gap <= OPEN;
      const wall = thin ? wallBetween(i, j, gap, contact) : true;
      return { e: [idx.get(i), idx.get(j)], contact, gap, door, open: thin && !wall, thinButWall: thin && wall };
    });
    // 벽 인접 링크가 아닌데 문이 두 실에 걸친 경우(라벨 어긋남 점검용)
    const extra = near.filter((s) => [...s].filter((i) => idx.has(i)).length >= 2).filter((s) => {
      const a = [...s].filter((i) => idx.has(i));
      return !a.every((i, p) => a.slice(p + 1).every((j) => spa.edges.some(([x, y]) => (x === i && y === j) || (x === j && y === i))));
    }).length;
    out.push({ drawing: f, unit: u.index, split: test.has(f) ? 'test' : 'dev', nodes: u.nodes.map((x) => ({ type: x.type, duct: x.duct })), edges, doors: doors.length, extraDoorPairs: extra });
  }
}
fs.writeFileSync(path.join(root, '..', 'aihub-full', 'derived', 'door-vs-wall.jsonl'), out.map((o) => JSON.stringify(o)).join('\n') + '\n');
console.log('drawings', files.length, 'units', out.length, 'dev', out.filter((o) => o.split === 'dev').length);
const gaps = out.flatMap((o) => o.edges.map((e) => e.gap)).sort((a, b) => a - b);
console.log('gap quantiles', [0.1, 0.25, 0.5, 0.75, 0.9].map((q) => gaps[Math.floor(q * gaps.length)]));

// 실제 세대에서 거실이 어디까지 깊고 어느 방과 어떤 방향으로 맞닿는지 잰다(RQ4 생성 틀 A1 설계 근거, Confluence 09-15 7절).
// 앞(남) 방향 = 거실과 가장 길게 맞닿은 발코니 쪽(축에 맞춰 반올림). 깊이는 세대(발코니·실외기실·덕트 제외)의 앞–뒤 폭에 대한 비.
// 거실 이웃 분류: 이웃이 거실 뒷변보다 완전히 뒤에 있으면 '뒤', 깊이 범위가 겹치면 '옆'. 앞 띠/뒤 띠 침실: 앞변이 세대 앞변에서 깊이의 20% 안이면 앞 띠.
// 벽 인접 그래프(평가 모델과 같은 규약). dev만, test 미사용.
// 사용: node scripts/living-geometry.mjs → ../aihub-full/derived/living-geometry.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/model/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '..', 'aihub-full', 'TL_SPA');
const test = new Set(JSON.parse(fs.readFileSync(path.join(root, 'data', 'split.json'), 'utf8')).test);
const files = fs.readdirSync(dataDir).filter((f) => f.startsWith('APT_FP_SPA_') && !test.has(f));
const out = fs.createWriteStream(path.join(root, '..', 'aihub-full', 'derived', 'living-geometry.jsonl'));
const OUTSIDE = new Set(['발코니', '실외기실']);
let n = 0, skipped = Counter();
function Counter() { return {}; }
const bump = (o, k) => (o[k] = (o[k] || 0) + 1);
for (const f of files) {
  const a = analyze(JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')), 'SPA', { unitRule: 'entrance' });
  const contact = new Map(a.edges.map(([i, j, c]) => [`${Math.min(i, j)}-${Math.max(i, j)}`, c]));
  const C = (i, j) => contact.get(`${Math.min(i, j)}-${Math.max(i, j)}`) || 0;
  for (const u of a.units) {
    const mem = u.members.filter((g, l) => !u.nodes[l].duct);
    const sp = (g) => a.spaces[g];
    const liv = mem.filter((g) => sp(g).type === '거실');
    if (liv.length !== 1) { bump(skipped, 'living!=1'); continue; }
    const L = liv[0];
    const balc = mem.filter((g) => sp(g).type === '발코니' && C(L, g) > 0).sort((p, q) => C(L, q) - C(L, p));
    // 앞 방향: 거실과 맞닿은 발코니 쪽. 발코니가 없으면(확장형 등) 현관에서 거실로 가는 방향. 둘 다 있으면 일치 여부를 기록.
    const snap = (from, to) => { const dx = sp(to).center[0] - sp(from).center[0], dy = sp(to).center[1] - sp(from).center[1]; return Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]; };
    const ent = mem.find((g) => sp(g).type === '현관');
    const axB = balc.length ? snap(L, balc[0]) : null;
    const axE = ent !== undefined ? snap(ent, L) : null;
    const ax = axB || axE;
    if (!ax) { bump(skipped, 'no axis'); continue; }
    const axisFrom = axB ? 'balcony' : 'entrance';
    const agree = axB && axE ? axB[0] === axE[0] && axB[1] === axE[1] : null;
    const pr = (g) => { const v = sp(g).polys.flat().map(([x, y]) => x * ax[0] + y * ax[1]); return [Math.min(...v), Math.max(...v)]; };
    const inside = mem.filter((g) => !OUTSIDE.has(sp(g).type));
    const ext = inside.map(pr);
    const BU = Math.min(...ext.map((e) => e[0])), FU = Math.max(...ext.map((e) => e[1])), DU = FU - BU;
    const [BL, FL] = pr(L);
    const nb = inside.filter((g) => g !== L && C(L, g) > 0).map((g) => {
      const [b, fr] = pr(g);
      return { type: sp(g).type, side: fr <= BL + 0.1 * (FL - BL) ? 'behind' : 'beside' };
    });
    // 가로축(앞–뒤에 수직): 거실 가로 범위와 침실 가로 범위의 관계
    const lat = [-ax[1], ax[0]];
    const pl = (g) => { const v = sp(g).polys.flat().map(([x, y]) => x * lat[0] + y * lat[1]); return [Math.min(...v), Math.max(...v)]; };
    const latAll = inside.map(pl);
    const WU = Math.max(...latAll.map((e) => e[1])) - Math.min(...latAll.map((e) => e[0]));
    const [l0, l1] = pl(L);
    // 앞 띠 줄: 앞변이 세대 앞변에서 깊이 20% 안인 실(발코니 제외)을 가로 순서로
    const frontRow = inside.filter((g) => FU - pr(g)[1] <= 0.2 * DU).sort((p, q) => pl(p)[0] - pl(q)[0]);
    const li = frontRow.indexOf(L);
    const beds = inside.filter((g) => sp(g).type === '침실').map((g) => {
      const [b, fr] = pr(g);
      const [q0, q1] = pl(g);
      const latOv = Math.min(l1, q1) - Math.max(l0, q0);
      const gap = latOv > 0 ? 0 : (q0 >= l1 ? q0 - l1 : l0 - q1) / WU;
      const band = FU - fr <= 0.2 * DU ? 'front' : 'back';
      const touches = C(L, g) > 0;
      const dir = !touches ? null : latOv > 0.1 * Math.min(l1 - l0, q1 - q0) ? (b >= FL - 0.1 * DU ? 'front' : 'behind') : 'side';
      const rank = band === 'front' && li >= 0 ? Math.abs(frontRow.indexOf(g) - li) : null;
      const viaHall = !touches && inside.some((h) => sp(h).type === '기타' && C(h, g) > 0 && C(h, L) > 0);
      return { band, touchesLiving: touches, dir, latGap: gap, frontRank: rank, viaHall, depthFrac: (fr - b) / DU };
    });
    const halls = inside.filter((g) => sp(g).type === '기타').map((g) => ({ touchesLiving: C(L, g) > 0, touchesBed: inside.some((h) => sp(h).type === '침실' && C(g, h) > 0) }));
    out.write(JSON.stringify({ drawing: f, unit: u.index, axisFrom, agree, frontRow: frontRow.map((g) => sp(g).type), livingIndex: li, livingDepth: (FL - BL) / DU, livingFront: (FU - FL) / DU, behindLiving: (BL - BU) / DU, nb, beds, halls, kinds: inside.map((g) => sp(g).type) }) + '\n');
    n++;
  }
}
out.end();
console.log('units', n, 'skipped', skipped);

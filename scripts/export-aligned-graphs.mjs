// 정렬 모드 평면의 실제 기하 그래프(공유 변 > 0.05 m)를 모든 배치(안방 왼쪽 끝)에 대해 내보낸다.
// Python 정확 QUBO(analysis/syntax_qubo/aligned.py)의 칸 모형 그래프가 실제 평면 그래프와 같은지 대조하는 데 쓴다.
// 사용: node scripts/export-aligned-graphs.mjs → ../aihub-full/derived/aligned-graphs.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLayout, sharedEdge } from '../src/generate/layout.js';
import { defaultParams } from '../src/generate/compare.js';
import { specs } from './lib/term-measure.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = JSON.parse(fs.readFileSync(path.join(root, 'analysis', 'syntax_qubo', 'templates.json'), 'utf8'));
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((q) => [x, ...q])));
const out = fs.createWriteStream(path.join(root, '..', 'aihub-full', 'derived', 'aligned-graphs.jsonl'));
let n = 0;
T.forEach((t, ti) => {
  const spec = { ...specs[Number(t.id.split('/')[0])], prefs: [] };
  const rest = t.front.filter((r) => r !== 'master');
  for (const fr of perms(rest)) for (const bp of perms(t.back)) {
    const fp = ['master', ...fr];
    const L = buildLayout(spec, { ...defaultParams(spec), frontOrder: fp, backOrder: bp, align: true });
    const R = L.rooms.filter((r) => !['발코니', '실외기실'].includes(r.type));
    // 복도 이름: 안방 쪽 구간 = hallA, 거실 너머 = hallB
    const name = (r) => {
      if (r.type !== '기타') return r.key;
      const li = fp.indexOf('living');
      const above = fp.findIndex((k, i) => i > 0 && k !== 'living' && L.rooms.find((q) => q.key === k).x < r.x + r.w - 1e-6 && L.rooms.find((q) => q.key === k).x + L.rooms.find((q) => q.key === k).w > r.x + 1e-6);
      return above < li ? 'hallA' : 'hallB';
    };
    const edges = [];
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (sharedEdge(R[i], R[j]) > 0.05) edges.push([name(R[i]), name(R[j])]);
    out.write(JSON.stringify({ t: ti, front: fp, back: bp, nodes: R.map(name), edges }) + '\n');
    n++;
  }
});
out.end();
console.log('graphs', n);

// 실제 세대(현관 하나 = 세대 하나)의 공간 그래프를 내보낸다: RQ1(한국 아파트의 공간구문 구조)을 Python에서 여러 지표로 재기 위해.
// 노드 = 공간(유형·면적·덕트 여부), 간선 = 평가 모델과 같은 벽 인접 링크(analyze의 unit.edges). dev/test 표시는 data/split.json.
// 사용: node scripts/export-unit-graphs.mjs → ../aihub-full/derived/unit-graphs.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/model/index.js';
import { requireDataDir } from './lib/real-units.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '..', 'aihub-full', 'TL_SPA');
requireDataDir(dataDir);
const test = new Set(JSON.parse(fs.readFileSync(path.join(root, 'data', 'split.json'), 'utf8')).test);
const files = fs.readdirSync(dataDir).filter((f) => f.startsWith('APT_FP_SPA_') && f.endsWith('.json'));
const out = fs.createWriteStream(path.join(root, '..', 'aihub-full', 'derived', 'unit-graphs.jsonl'));
let n = 0;
const t0 = Date.now();
for (const f of files) {
  const a = analyze(JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')), 'SPA', { unitRule: 'entrance' });
  for (const u of a.units) {
    const idx = new Map(u.members.map((g, l) => [g, l]));
    out.write(JSON.stringify({ drawing: f, unit: u.index, split: test.has(f) ? 'test' : 'dev', scale: a.scale,
      nodes: u.nodes.map((x) => ({ type: x.type, area: Math.round(a.spaces[x.space].area), duct: x.duct })),
      edges: u.edges.map(([i, j]) => [idx.get(i), idx.get(j)]) }) + '\n');
    n++;
  }
}
out.end();
console.log(`세대 ${n} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);

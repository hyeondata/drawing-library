// QUBO 템플릿(사양 × 앞 띠 침실 수)의 실·칸 구조를 Python(analysis/syntax_qubo)으로 넘긴다.
// 왜: 정확 공간구문 QUBO를 dimod BQM으로 만들어 CPU SA(dwave-samplers)와 나중에 D-Wave QPU에서 같은 모형을 풀기 위해.
//   칸 구조(앞 m칸·뒤 k칸, 위아래 겹침)는 src/generate/qubo.js와 똑같아야 하므로 JS에서 그대로 꺼낸다.
// 사용: node scripts/export-qubo-specs.mjs → analysis/syntax_qubo/templates.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { templates } from '../src/generate/compare.js';
import { programOf } from '../src/generate/layout.js';
import { specs } from './lib/term-measure.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = [];
specs.forEach((spec0, si) => {
  const spec = { ...spec0, prefs: [] };
  const types = Object.fromEntries(programOf(spec).map((r) => [r.key, r.type]));
  for (const t of templates(spec, 'hand')) {
    const { front, back } = t.q.bands;
    const suite = ['bathMaster', 'dress'].filter((k) => types[k]);
    out.push({ id: `${si}/${t.k}`, spec: { area: spec.area, bedrooms: spec.bedrooms, multi: spec.multi }, front: front.rooms, back: back.rooms, m: front.slots, k: back.slots, suite, types });
  }
});
fs.writeFileSync(path.join(root, 'analysis', 'syntax_qubo', 'templates.json'), JSON.stringify(out, null, 1));
console.log(out.length, 'templates', out.map((o) => `${o.m}+${o.k}`).join(' '));

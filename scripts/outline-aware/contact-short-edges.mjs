// 맞닿음 규약 민감도(보고만, 판정 없음, Confluence 10-09): 정렬 틀 배치에서 QUBO 그래프(공유 변 > 0.05 m)의 간선 중 AI Hub 규약(0.44 m) 미만인 것.
// 그런 간선을 가진 배치 비율, 빼면 그래프가 끊기는지, GEN 항(β·f)이 얼마나 바뀌는지. 사용: SPECS=rq4 node scripts/outline-aware/contact-short-edges.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLayout, sharedEdge } from '../../src/generate/layout.js';
import { defaultParams, templates } from '../../src/generate/compare.js';
import { layoutGraph, syntaxStats } from '../../src/generate/syntax-gen.js';
import { modelBeta } from '../../src/generate/qubo-sa.js';
import { SYNTAX_MODEL } from '../../src/generate/syntax-model-data.js';
import { specs } from '../lib/rq4-specs.mjs';
const TH = 0.44, OUT = new Set(['발코니', '실외기실']);
function* perms(a) { if (a.length <= 1) return yield a.slice(); for (let i = 0; i < a.length; i++) for (const p of perms([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...p]; }
const beta = modelBeta(); const GI = SYNTAX_MODEL.stats.map((s, j) => [s, j]).filter(([s]) => beta[s]);
const conn = (adj) => { const k = [...adj.keys()]; const seen = new Set([k[0]]); const q = [k[0]]; while (q.length) for (const v of adj.get(q.pop())) if (!seen.has(v)) (seen.add(v), q.push(v)); return seen.size === k.length; };
const pairs = new Map(); let n = 0, withShort = 0, disc = 0, changed = 0; const dE = [], dTerm = Object.fromEntries(GI.map(([s]) => [s, []]));
const lens = [];
for (const s of specs) {
  const base = defaultParams(s);
  for (const t of templates(s, 'hand')) { const rest = t.q.bands.front.rooms.filter((x) => x !== 'master');
    for (const rp of perms(rest)) for (const bp of perms(t.q.bands.back.rooms)) {
      const lay = buildLayout(s, { ...structuredClone(base), frontOrder: ['master', ...rp], backOrder: bp, align: true });
      const g = layoutGraph(lay); if (!conn(g.adj)) continue; n++;
      const R = new Map(lay.rooms.filter((r) => !OUT.has(r.type)).map((r) => [r.key, r]));
      const adj2 = new Map([...g.adj].map(([k, v]) => [k, new Set(v)])); let short = false;
      for (const [a, sa] of g.adj) for (const b of sa) if (a < b) { const L = sharedEdge(R.get(a), R.get(b)); if (L < TH) { short = true; lens.push(L);
        const key = [R.get(a).type + '(' + a.replace(/\d+$/, '') + ')', R.get(b).type + '(' + b.replace(/\d+$/, '') + ')'].sort().join(' – ');
        pairs.set(key, (pairs.get(key) || 0) + 1); adj2.get(a).delete(b); adj2.get(b).delete(a); } }
      if (!short) continue; withShort++;
      if (!conn(adj2)) { disc++; continue; }
      const f1 = syntaxStats(g), f2 = syntaxStats({ nodes: g.nodes, adj: adj2 });
      let E1 = 0, E2 = 0, any = false;
      for (const [st, j] of GI) { E1 += beta[st] * f1[j]; E2 += beta[st] * f2[j]; const d = f2[j] - f1[j]; dTerm[st].push(Math.abs(d)); if (Math.abs(d) > 1e-9) any = true; }
      if (any) changed++; dE.push(Math.abs(E2 - E1));
    } }
}
const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b.length ? +b[Math.floor(p * (b.length - 1))].toFixed(3) : null; };
const res = {
  layouts: n, withShort, frac: withShort / n, disconnectedIfDropped: disc, termsChanged: changed, termsChangedFrac: changed / n,
  lenQ: [q(lens, 0.1), q(lens, 0.5), q(lens, 0.9)],
  topPairs: [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 8),
  termAbsChange: Object.fromEntries(GI.map(([st]) => [st, [q(dTerm[st], 0.5), q(dTerm[st], 0.9), q(dTerm[st], 1)]])),
  dE: [q(dE, 0.5), q(dE, 0.9), q(dE, 1)],
};
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../evidence/results/outline-aware');
fs.writeFileSync(path.join(dir, 'contact-short-edges.json'), JSON.stringify(res, null, 1));
const pc = (x) => `${(100 * x).toFixed(1)}%`;
const L = ['# 맞닿음 규약 민감도: QUBO 그래프 간선 중 AI Hub 0.44 m 미만 (보고만)\n', '> `SPECS=rq4 node scripts/outline-aware/contact-short-edges.mjs` · 연결된 정렬 틀 배치 전부(사양 80개 기본 치수)\n',
  `- 0.44 m 미만 간선이 있는 배치: ${withShort.toLocaleString()} / ${n.toLocaleString()} = **${pc(res.frac)}**`,
  `- 그 간선을 빼면 그래프가 끊기는 배치: ${disc}`,
  `- GEN 항(β·f) 중 하나라도 바뀌는 배치: ${changed.toLocaleString()} = **${pc(res.termsChangedFrac)}**`,
  `- 짧은 간선 길이 10%·50%·90%: ${res.lenQ.join(' · ')} m`,
  `- 많은 쌍: ${res.topPairs.map(([k, v]) => `${k} ${v}`).join('; ')}`,
  `- abs(ΔE_GEN) 중앙값·90%·최대: ${res.dE.join(' · ')}`,
  '- 한계: 사양 기본 치수만 봄. 판정 없음(현 규약 유지는 10-08 K1에서 결정).'];
fs.writeFileSync(path.join(dir, 'contact-short-edges.md'), L.join('\n') + '\n');
console.log(L.join('\n'));

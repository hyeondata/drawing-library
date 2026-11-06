// 맞닿음 규약 점검(Confluence 10-08 사전 등록, 읽기 전용): QUBO 모형 그래프(공유 변 > 0.05 m)를 AI 허브 규약(≥ 0.44 m, minContact 40px)으로
// 바꿔도 그래프가 배치 순서만으로 정해지는가(K1), 생성 결과가 달라지는가(K2), C-1 목표 (a)에 스침 간선이 얼마나 있는가(K3).
//
// 판정(결과를 보기 전에 정함):
//   K1 열쇠 = (실내 실 key·type 목록, 템플릿 앞·뒤 띠 구성, 앞 띠 순서, 뒤 띠 순서). 사양 80개(SPECS=rq4) 기본 치수에서 같은 열쇠가
//      서로 다른 그래프를 내는 열쇠 수 = 어긋남. 대조: 0.05 m에서 어긋남 0이어야 함(아니면 점검 무효).
//      0.44 m에서 어긋남 0 → '규약 변경 후보(정확 QUBO 유지 가능)', 1 이상 → 'QUBO 규약 변경 불가(현행 유지, 민감도 보고)'.
//      열쇠를 공유하는 사양이 하나뿐인 배치 수도 보고(비교 불가). 한계: 사양 기본 치수만 봄.
//   K2(보고만) 사양마다 GEN 최적 배치(열거, 동률이면 열거 순서상 첫째)가 0.05 m → 0.44 m에서 바뀌는 사양 수, 최적 그래프가 바뀌는 사양 수.
//   K3(보고만) 0.05 m 기준 GEN 최적 배치 중 0.44 m 미만 간선을 가진 비율.
// 사용: SPECS=rq4 node scripts/outline-aware/contact-convention-check.mjs → evidence/results/outline-aware/contact-convention-check.md/json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLayout, sharedEdge } from '../../src/generate/layout.js';
import { defaultParams, templates } from '../../src/generate/compare.js';
import { syntaxStats } from '../../src/generate/syntax-gen.js';
import { modelBeta } from '../../src/generate/qubo-sa.js';
import { SYNTAX_MODEL } from '../../src/generate/syntax-model-data.js';
import { specs } from '../lib/rq4-specs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = new Set(['발코니', '실외기실']);
const TH = { old: 0.05, aihub: 0.44 };

function* perms(a) {
  if (a.length <= 1) return yield a.slice();
  for (let i = 0; i < a.length; i++) for (const p of perms([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...p];
}
/** 공유 변 > th(old, layoutGraph와 같은 규칙) 또는 ≥ th(aihub)인 실내 실 쌍의 그래프. */
function graphAt(layout, th, strict) {
  const R = layout.rooms.filter((r) => !OUT.has(r.type));
  const nodes = Object.fromEntries(R.map((r) => [r.key, r.type]));
  const adj = new Map(R.map((r) => [r.key, new Set()]));
  for (let i = 0; i < R.length; i++)
    for (let j = i + 1; j < R.length; j++) {
      const L = sharedEdge(R[i], R[j]);
      if (strict ? L > th : L >= th) adj.get(R[i].key).add(R[j].key), adj.get(R[j].key).add(R[i].key);
    }
  return { nodes, adj };
}
const sig = (g) => [...g.adj].flatMap(([a, s]) => [...s].filter((b) => a < b).map((b) => `${a}|${b}`)).sort().join(',');
const connected = (adj) => {
  const k = [...adj.keys()];
  const seen = new Set([k[0]]);
  const q = [k[0]];
  while (q.length) for (const v of adj.get(q.pop())) if (!seen.has(v)) (seen.add(v), q.push(v));
  return seen.size === k.length;
};
const beta = modelBeta();
const GI = SYNTAX_MODEL.stats.map((s, j) => [s, j]).filter(([s]) => beta[s]);
const genE = (g) => {
  const f = syntaxStats(g);
  return GI.reduce((t, [s, j]) => t + beta[s] * f[j], 0);
};

const seen = { old: new Map(), aihub: new Map() }; // 열쇠 → Map(그래프 서명 → 사양 목록)
const keySpecs = new Map();
const k2 = [];
let n = 0;
specs.forEach((s, si) => {
  const base = defaultParams(s);
  const best = { old: null, aihub: null };
  for (const t of templates(s, 'hand')) {
    const rest = t.q.bands.front.rooms.filter((x) => x !== 'master');
    for (const rp of perms(rest))
      for (const bp of perms(t.q.bands.back.rooms)) {
        const lay = buildLayout(s, { ...structuredClone(base), frontOrder: ['master', ...rp], backOrder: bp, align: true });
        const rooms = lay.rooms.filter((r) => !OUT.has(r.type)).map((r) => `${r.key}:${r.type}`).sort().join(',');
        const key = `${rooms}#${t.q.bands.front.rooms.join(',')}/${t.q.bands.back.rooms.join(',')}#${rp.join(',')}/${bp.join(',')}`;
        n++;
        (keySpecs.get(key) ?? keySpecs.set(key, new Set()).get(key)).add(si);
        for (const [c, th] of Object.entries(TH)) {
          const g = graphAt(lay, th, c === 'old');
          const m = seen[c].get(key) ?? seen[c].set(key, new Map()).get(key);
          const sg = sig(g);
          (m.get(sg) ?? m.set(sg, []).get(sg)).push(si);
          if (!connected(g.adj)) continue;
          const E = genE(g);
          if (!best[c] || E < best[c].E) best[c] = { E, order: `${t.k}|${rp.join(',')}|${bp.join(',')}`, sg, short: c === 'old' ? sg !== sig(graphAt(lay, TH.aihub, false)) : null };
        }
      }
  }
  k2.push({ spec: si, bedrooms: s.bedrooms, area: s.area, sameOrder: best.old?.order === best.aihub?.order, sameGraph: best.old?.sg === best.aihub?.sg, oldOptHasShort: best.old?.short });
});
const conflicts = (c) => [...seen[c]].filter(([, m]) => m.size > 1);
const res = {
  arrangements: n,
  keys: keySpecs.size,
  singleSpecKeys: [...keySpecs.values()].filter((v) => v.size === 1).length,
  K1: { old: conflicts('old').length, aihub: conflicts('aihub').length, aihubExamples: conflicts('aihub').slice(0, 5).map(([k, m]) => ({ key: k, graphs: [...m].map(([g, ss]) => ({ edges: g, specs: ss.length })) })) },
  K2: { specs: k2.length, optOrderChanged: k2.filter((x) => !x.sameOrder).length, optGraphChanged: k2.filter((x) => !x.sameGraph).length },
  K3: { oldOptWithShort: k2.filter((x) => x.oldOptHasShort).length, of: k2.length },
  perSpec: k2,
};
const valid = res.K1.old === 0;
res.verdict = !valid ? '점검 무효(대조 실패)' : res.K1.aihub === 0 ? '규약 변경 후보(정확 QUBO 유지 가능)' : 'QUBO 규약 변경 불가(현행 유지, 민감도 보고)';
const dir = path.join(root, 'evidence/results/outline-aware');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'contact-convention-check.json'), JSON.stringify(res, null, 1));
const L = ['# 맞닿음 규약 점검: QUBO 그래프 0.05 m 대 AI 허브 0.44 m (Confluence 10-08 사전 등록)\n'];
L.push(`> \`SPECS=rq4 node scripts/outline-aware/contact-convention-check.mjs\` · 배치 ${n.toLocaleString()}개 · 열쇠 ${res.keys.toLocaleString()}개(사양 하나에만 있는 열쇠 ${res.singleSpecKeys.toLocaleString()}개는 비교 불가)\n`);
L.push(`- K1 대조(0.05 m): 어긋난 열쇠 ${res.K1.old} → ${valid ? '대조 통과' : '**대조 실패, 점검 무효**'}`);
L.push(`- **K1(0.44 m): 어긋난 열쇠 ${res.K1.aihub} → ${res.verdict}**`);
L.push(`- K2: GEN 최적 배치가 바뀐 사양 ${res.K2.optOrderChanged}/${res.K2.specs}, 최적 그래프가 바뀐 사양 ${res.K2.optGraphChanged}/${res.K2.specs}`);
L.push(`- K3: 0.05 m 기준 GEN 최적 배치 중 0.44 m 미만 간선을 가진 사양 ${res.K3.oldOptWithShort}/${res.K3.of}`);
L.push('- 한계: 사양 기본 치수만 봄(치수 다듬기·외곽 상자 치수는 별도).');
fs.writeFileSync(path.join(dir, 'contact-convention-check.md'), L.join('\n') + '\n');
console.log(L.join('\n'));

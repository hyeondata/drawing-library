// JS판 SA(src/generate/qubo-sa.js)를 Python과 같은 BQM(test/fixtures/gen-bqm.json)·같은 설정(스위프 1,000, 정리한 기본 β 범위, 기하 스케줄)으로 돌려
// 읽기마다 BQM 에너지, x가 유효한 배치로 풀리는지, 그 배치의 모형 에너지를 적는다. Python 쪽은 analysis/syntax_qubo/sa_js_vs_py.py, 비교는 analysis/compare_sa_js_py.py.
// 사용: node scripts/sa-js-vs-py.mjs [reads] → evidence/results/sa-js-vs-py-js.json
import fs from 'node:fs';
import { buildGenQubo, decodeArrangement, enumerateTemplate } from '../src/generate/qubo-exact.js';
import { anneal, defaultBetaRange, geomspace, isingEnergy, saRng, SWEEPS, toIsing } from '../src/generate/qubo-sa.js';
import { syntaxEnergy, syntaxStats } from '../src/generate/syntax-gen.js';

const READS = Number(process.argv[2] || 300);
const fx = JSON.parse(fs.readFileSync(new URL('../test/fixtures/gen-bqm.json', import.meta.url), 'utf8'));
const out = [];
for (const f of fx) {
  const { q, bqm } = buildGenQubo(f.template, f.beta, f.K);
  const { arrangements } = enumerateTemplate(f.template);
  const table = new Map();
  for (const a of arrangements) if (a.connected) table.set(`${a.rp.join()}|${a.bp.join()}`, syntaxEnergy(syntaxStats(a.g)));
  const estar = Math.min(...table.values());
  const is = toIsing(bqm);
  const br = defaultBetaRange(is);
  const betas = geomspace(br[0], br[1], SWEEPS);
  const r = saRng(1);
  const t0 = performance.now();
  const energies = [];
  const modelE = [];
  for (let i = 0; i < READS; i++) {
    const s = anneal(is, betas, r);
    energies.push(isingEnergy(is, s));
    const arr = decodeArrangement(q, (name) => (s[is.idx.get(name)] === 1 ? 1 : 0));
    const e = arr ? table.get(`${arr.rp.join()}|${arr.bp.join()}`) : undefined;
    modelE.push(e === undefined ? null : e);
  }
  const ms = performance.now() - t0;
  const valid = modelE.filter((e) => e !== null);
  out.push({ template: f.template.id, n: is.n, reads: READS, sweeps: SWEEPS, beta_range: br, estar, energies, modelE, ms });
  console.log(f.template.id, is.n, br.map((x) => x.toPrecision(4)), `${(ms / READS).toFixed(1)}ms/read`, `x유효 ${valid.length}/${READS}`, `적중 ${valid.filter((e) => Math.abs(e - estar) < 1e-9).length}`);
}
fs.writeFileSync(new URL('../evidence/results/sa-js-vs-py-js.json', import.meta.url), JSON.stringify(out));

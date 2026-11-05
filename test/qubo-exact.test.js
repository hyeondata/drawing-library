// JS판 생성 모형 정확 QUBO(src/generate/qubo-exact.js)가 Python(analysis/syntax_qubo/gen_qubo.py)과 같은 BQM을 만드는지,
// 그리고 정준 상태 에너지가 그래프에서 잰 모형 에너지와 같은지.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildGenQubo, enumerateTemplate } from '../src/generate/qubo-exact.js';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/gen-bqm.json', import.meta.url), 'utf8'));
const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

for (const f of fx)
  test(`정확 QUBO가 Python과 같다(템플릿 ${f.template.id}, 변수 ${f.variables.length}개)`, () => {
    const { arrangements, K } = enumerateTemplate(f.template);
    assert.equal(K, f.K);
    assert.ok(arrangements.length > 0);
    const { q, bqm } = buildGenQubo(f.template, f.beta, f.K);
    assert.ok(close(q.P, f.P), `P ${q.P} vs ${f.P}`);
    assert.ok(close(bqm.offset, f.offset), `offset ${bqm.offset} vs ${f.offset}`);
    assert.deepEqual([...bqm.linear.keys()], f.variables, '변수 이름·순서');
    for (const v of f.variables) assert.ok(close(bqm.linear.get(v), f.linear[v]), `linear ${v}`);
    const quad = new Map([...bqm.quad.values()].map(([a, b, c]) => [[a, b].sort().join('\u0000'), c]));
    const pyq = f.quadratic.filter(([, , c]) => c !== 0);
    const jsq = [...quad].filter(([, c]) => c !== 0);
    assert.equal(jsq.length, pyq.length, '이차항 수');
    for (const [a, b, c] of pyq) assert.ok(close(quad.get([a, b].sort().join('\u0000')) ?? 0, c), `quad ${a} ${b}`);
  });

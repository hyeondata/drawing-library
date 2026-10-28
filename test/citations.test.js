// 생성 규칙의 문헌 근거는 원문 대조 표(citations.js)에만 기대야 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAIMS, LEVEL, REFS } from '../src/generate/gen-rules.js';
import fs from 'node:fs';

test('문헌 근거마다 원문 문장·위치·검증 수준이 있고, 재해석이면 이 도구에서 바꾼 점을 적는다', () => {
  for (const [k, c] of Object.entries(CLAIMS)) {
    assert.ok(REFS[c.ref], `${k}: REFS에 ${c.ref} 없음`);
    assert.ok(LEVEL[c.level], `${k}: level`);
    assert.ok(c.ko && c.loc && c.quote, `${k}: ko·loc·quote`);
    if (c.level !== 'direct') assert.ok(c.how, `${k}: 재해석·미확인은 how 필요`);
  }
});

test('코드에 남은 옛 형식 문헌 근거(lit(id, 설명))가 없다', () => {
  for (const f of ['src/generate/gen-rules.js', 'src/generate/pipeline.js']) {
    const s = fs.readFileSync(f, 'utf8');
    assert.ok(!/lit\('[a-z0-9]+', '/.test(s), f);
    for (const [, key] of s.matchAll(/lit\('([a-z0-9-]+)'\)/g)) assert.ok(CLAIMS[key], `${f}: ${key}`);
  }
});

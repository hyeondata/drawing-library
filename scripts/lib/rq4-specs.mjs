// RQ4 검정용 사양 묶음(analysis/rq4_specs.py → evidence/results/rq4-specs.json): 실제 dev 구성 비율로 배정한 사양.
// SPECS=rq4 이면 이 묶음을, 아니면 기존 20개(term-measure.mjs)를 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { specs as base } from './term-measure.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const targets = base[0].targets;
export const SET = process.env.SPECS === 'rq4' ? 'rq4' : 'base';
export const specs =
  SET === 'rq4'
    ? JSON.parse(fs.readFileSync(path.join(root, 'evidence/results/rq4-specs.json'), 'utf8')).specs.map((s) => ({ ...s, outdoorUnit: true, balcony: true, targets, prefs: [] }))
    : base;
// 파일 이름 접미사: 기존 묶음은 그대로, rq4는 -rq4
export const suffix = SET === 'rq4' ? '-rq4' : '';

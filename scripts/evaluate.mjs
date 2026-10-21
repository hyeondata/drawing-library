// 명령줄 평가. 팀원이 만든 도면 JSON이나 샘플 전체를 같은 모델로 채점한다.
//   npm run evaluate                    샘플 전체(자기 자신은 기준 분포에서 제외)
//   npm run evaluate -- my-plan.json    특정 파일
//   npm run evaluate -- --json a.json   결과를 JSON으로 출력
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../src/model/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
let files = args.filter((a) => a !== '--json');
const labelsDir = path.join(root, 'public', 'data', 'labels');
// OCR 라벨은 예시 도면으로만 쓰고 채점하지 않는다.
if (!files.length)
  files = fs
    .readdirSync(labelsDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('APT_FP_OCR_'))
    .sort()
    .map((f) => path.join(labelsDir, f));

const baseline = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'baseline.json'), 'utf8'));
const results = [];
for (const file of files) {
  const id = path.basename(file).replace(/\.json$/, '');
  try {
    const r = evaluate(JSON.parse(fs.readFileSync(file, 'utf8')), { baseline, drawingId: id });
    results.push(r);
    if (!asJson) {
      const groups = Object.values(r.units[0]?.groups || {}).map((g) => `${g.label} ${g.score.toFixed(0)}`).join(' · ');
      console.log(`${id.padEnd(22)} ${r.kind}  ${r.score.toFixed(1).padStart(5)}점 ${r.grade}  세대 ${r.units.length}  [${groups}]`);
    }
  } catch (err) {
    console.error(`${id}: ${err.message}`);
    process.exitCode = 1;
  }
}
if (asJson) {
  console.log(JSON.stringify(results.map(({ analysis, ...rest }) => rest), null, 2));
}

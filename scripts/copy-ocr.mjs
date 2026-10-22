// 글자 인식(Tesseract.js) 파일을 public/ocr/에 복사한다. CDN 없이 같은 사이트에서 내려받게 한다.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');
mkdirSync(out, { recursive: true });
const nm = (p) => join(root, 'node_modules', p);
const files = [
  [nm('tesseract.js/dist/worker.min.js'), 'worker.min.js'],
  // 브라우저 지원(SIMD·relaxed SIMD)에 따라 하나를 고른다. LSTM 전용 코어만 쓴다.
  [nm('tesseract.js-core/tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [nm('tesseract.js-core/tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [nm('tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js'), 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  [nm('@tesseract.js-data/kor/4.0.0_best_int/kor.traineddata.gz'), 'kor.traineddata.gz'],
];
for (const [src, name] of files) copyFileSync(src, join(out, name));
console.log(`글자 인식 파일 ${files.length}개를 public/ocr/에 복사했습니다.`);

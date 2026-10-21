import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const base = resolve(import.meta.dirname, '../public');
const catalog = JSON.parse(await readFile(resolve(base, 'catalog.json'), 'utf8'));
if (!Array.isArray(catalog) || catalog.length === 0) {
  throw new Error('도면 목록이 비어 있습니다. npm run data:prepare를 실행해 주세요.');
}
const ids = new Set();
for (const drawing of catalog) {
  if (ids.has(drawing.id)) throw new Error(`중복 도면 ID: ${drawing.id}`);
  ids.add(drawing.id);
  if (!(drawing.width > 0 && drawing.height > 0) || !Array.isArray(drawing.annotations)) {
    throw new Error(`도면 메타데이터 오류: ${drawing.id}`);
  }
  for (const key of ['label', 'image', 'thumbnail']) {
    if (key !== 'label' && drawing[key] == null) continue;
    const file = resolve(base, drawing[key]);
    if (!file.startsWith(base + sep)) throw new Error(`허용되지 않은 경로: ${drawing.id}`);
    if (!(await stat(file)).isFile()) throw new Error(`파일 누락: ${drawing[key]}`);
  }
}
console.log(`Validated ${catalog.length} labels and ${catalog.filter(d => d.image).length} drawing images.`);

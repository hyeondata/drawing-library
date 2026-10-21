// AI 허브 아파트 평면도 COCO 라벨을 모델 입력 형태로 바꾼다.
import { bboxOf, centroid, polygonArea, toPolygons } from './geometry.js';

/** '공간_거실' → { group: '공간', type: '거실' } */
function splitName(name) {
  const i = name.indexOf('_');
  return i < 0 ? { group: name, type: name } : { group: name.slice(0, i), type: name.slice(i + 1) };
}

export function parseLabel(label) {
  if (!label || !Array.isArray(label.annotations) || !Array.isArray(label.categories)) {
    throw new Error('COCO 형식(categories, annotations)의 JSON이 아닙니다.');
  }
  const names = new Map(label.categories.map((c) => [c.id, c.name]));
  const image = (label.images && label.images[0]) || {};
  const items = [];
  for (const a of label.annotations) {
    const name = names.get(a.category_id) || 'unknown';
    if (name === 'background') continue;
    const polys = toPolygons(a);
    if (!polys.length) continue;
    const { group, type } = splitName(name);
    const area = polys.reduce((s, p) => s + polygonArea(p), 0);
    items.push({
      id: a.id,
      name,
      group,
      type,
      polys,
      bbox: bboxOf(polys),
      area,
      center: centroid(polys[0]),
      attrs: a.attributes || {},
    });
  }
  return { width: image.width || 0, height: image.height || 0, fileName: image.file_name || '', items };
}

/** 라벨에 들어 있는 주된 데이터 종류(SPA/STR/OBJ/OCR)를 판별한다. */
export function detectKind(label) {
  const { items } = parseLabel(label);
  const count = (g) => items.filter((it) => it.group === g).length;
  const scores = { SPA: count('공간'), STR: count('구조'), OBJ: count('객체'), OCR: count('OCR') };
  const [best, n] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : null;
}

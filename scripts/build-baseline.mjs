// public/data/labels의 AI 허브 샘플로 기준 분포(baseline.json)와 도면 목록(catalog.json)을 만든다.
// 평가 모델(config.js)을 바꾸면 다시 실행한다: npm run baseline
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_VERSION, analyze, extractFeatures } from '../src/model/index.js';
import { parseLabel } from '../src/model/labels.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const labelsDir = path.join(root, 'public', 'data', 'labels');
const thumbsDir = path.join(root, 'public', 'thumbs');
const THUMB = 220;

/** 썸네일용 SVG 경로: 전체 도형 범위에 맞춰 축소하고 정수로 반올림한다. */
function thumbPaths(parsed) {
  const items = parsed.items;
  if (!items.length) return { viewBox: `0 0 ${THUMB} ${THUMB}`, layers: {} };
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const it of items) {
    x0 = Math.min(x0, it.bbox[0]);
    y0 = Math.min(y0, it.bbox[1]);
    x1 = Math.max(x1, it.bbox[2]);
    y1 = Math.max(y1, it.bbox[3]);
  }
  const pad = 0.04 * Math.max(x1 - x0, y1 - y0);
  x0 -= pad;
  y0 -= pad;
  const s = THUMB / Math.max(x1 - x0 + pad, y1 - y0 + pad);
  const layers = {};
  for (const it of items) {
    const d = it.polys
      .map((pts) => 'M' + pts.map(([x, y]) => `${Math.round((x - x0) * s)} ${Math.round((y - y0) * s)}`).join('L') + 'Z')
      .join('');
    (layers[it.type] ||= []).push(d);
  }
  for (const k of Object.keys(layers)) layers[k] = layers[k].join('');
  return { viewBox: `0 0 ${Math.round((x1 - x0 + pad) * s)} ${Math.round((y1 - y0 + pad) * s)}`, layers };
}

const files = fs.readdirSync(labelsDir).filter((f) => f.endsWith('.json')).sort();
const entries = { SPA: [], STR: [], OBJ: [] };
const catalog = [];

for (const file of files) {
  const id = file.replace(/\.json$/, '');
  const kind = id.split('_')[2];
  if (!entries[kind]) continue;
  const label = JSON.parse(fs.readFileSync(path.join(labelsDir, file), 'utf8'));
  const analysis = analyze(label, kind);
  for (const { unit, features } of extractFeatures(analysis)) entries[kind].push({ drawing: id, unit, features });
  const parsed = parseLabel(label);
  const hasImage = fs.existsSync(path.join(thumbsDir, `${id}.webp`));
  catalog.push({
    id,
    kind,
    number: id.split('_')[3],
    width: parsed.width,
    height: parsed.height,
    label: `data/labels/${file}`,
    image: hasImage ? `images/${id}.webp` : null,
    thumbnail: hasImage ? `thumbs/${id}.webp` : null,
    units: analysis.units.length,
    elements: parsed.items.length,
    sketch: hasImage ? null : thumbPaths(parsed),
  });
}

const baseline = {
  modelVersion: MODEL_VERSION,
  source: 'AI 허브 아파트 평면도 샘플(../Sample). 실제 준공 도면을 정답지로 본다.',
  counts: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, { drawings: new Set(v.map((e) => e.drawing)).size, units: v.length }])),
  entries,
};

const kindOrder = { SPA: 0, STR: 1, OBJ: 2 };
catalog.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || (b.image ? 1 : 0) - (a.image ? 1 : 0) || a.number.localeCompare(b.number));

fs.writeFileSync(path.join(root, 'public', 'data', 'baseline.json'), JSON.stringify(baseline));
fs.writeFileSync(path.join(root, 'public', 'data', 'catalog.json'), JSON.stringify(catalog));
console.log(
  `기준 분포 v${MODEL_VERSION}: ` +
    Object.entries(baseline.counts).map(([k, c]) => `${k} 도면 ${c.drawings}·단위 ${c.units}`).join(', ') +
    ` / 목록 ${catalog.length}건`,
);

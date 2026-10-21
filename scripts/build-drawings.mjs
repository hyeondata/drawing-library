// Sample 라벨로 '예시 도면'을 만든다.
// - 원본 PNG가 있는 설비(OBJ) 도면은 그 이미지를 그대로 쓴다.
// - 나머지는 라벨 좌표로 도면 SVG(public/drawings/)를 그린다.
// - 예시 도면 페이지가 읽는 목록을 public/data/examples.json에 쓴다.
// 사용: npm run drawings
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLabel } from '../src/model/labels.js';
import { FIXTURE_COLORS, OCR_STYLE, STR_STYLE, roomGroupOf } from '../src/model/drawing-style.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const labelsDir = path.join(root, 'public', 'data', 'labels');
const imagesDir = path.join(root, 'public', 'images');
const outDir = path.join(root, 'public', 'drawings');

const KIND_ORDER = ['SPA', 'STR', 'OBJ', 'OCR'];
const r1 = (v) => Math.round(v);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pathOf = (polys) => polys.map((pts) => 'M' + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L') + 'Z').join('');

/** 도형 전체 범위에 여백을 더한 viewBox. */
function frame(boxes) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [a, b, c, d] of boxes) {
    x0 = Math.min(x0, a);
    y0 = Math.min(y0, b);
    x1 = Math.max(x1, c);
    y1 = Math.max(y1, d);
  }
  const pad = 0.05 * Math.max(x1 - x0, y1 - y0);
  return [r1(x0 - pad), r1(y0 - pad), r1(x1 - x0 + 2 * pad), r1(y1 - y0 + 2 * pad)];
}

function svgDoc(vb, title, body) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}">` +
    `<title>${esc(title)}</title>` +
    `<style>text{font-family:'Pretendard Variable',Pretendard,'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif;fill:#22212b}</style>` +
    `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#ffffff"/>` +
    body +
    `</svg>`
  );
}

function inside([x, y], polys) {
  let hit = false;
  for (const pts of polys)
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  return hit;
}
function edgeDistance([x, y], polys) {
  let best = Infinity;
  for (const pts of polys)
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, ay] = pts[j];
      const [bx, by] = pts[i];
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
  return best;
}
/** 실 안에서 경계와 가장 먼 점(라벨 자리)과 그 거리. 격자로 찾고 한 번 더 좁혀 찾는다. */
function labelSpot(item) {
  let [x0, y0, x1, y1] = item.bbox;
  let best = { pt: item.center, r: inside(item.center, item.polys) ? edgeDistance(item.center, item.polys) : 0 };
  for (let pass = 0; pass < 2; pass++) {
    const n = 16;
    const sx = (x1 - x0) / n;
    const sy = (y1 - y0) / n;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) {
        const pt = [x0 + i * sx, y0 + j * sy];
        if (!inside(pt, item.polys)) continue;
        const r = edgeDistance(pt, item.polys);
        if (r > best.r) best = { pt, r };
      }
    [x0, y0, x1, y1] = [best.pt[0] - sx, best.pt[1] - sy, best.pt[0] + sx, best.pt[1] + sy];
  }
  return best;
}
/** 실 이름 글자 크기: 안쪽 여유(r)와 실의 긴 변에 맞추되 너무 작거나 크지 않게. */
function labelSize(item, r) {
  const [x0, y0, x1, y1] = item.bbox;
  const byWidth = (Math.min(2 * r * 1.6, x1 - x0) * 0.85) / Math.max(2, item.type.length);
  return Math.min(44, r * 0.9, byWidth);
}

function drawSPA(parsed, title) {
  const rooms = [...parsed.items].sort((a, b) => b.area - a.area);
  const vb = frame(rooms.map((it) => it.bbox));
  const fills = rooms
    .map((it) => `<path d="${pathOf(it.polys)}" fill="${roomGroupOf(it.type).fill}" stroke="#4a4856" stroke-width="3" stroke-linejoin="round"/>`)
    .join('');
  const labels = rooms
    .filter((it) => it.type !== '기타' && it.area > 4000)
    .map((it) => {
      const { pt, r } = labelSpot(it);
      const size = labelSize(it, r);
      if (size < 12) return '';
      const [cx, cy] = pt;
      return `<text x="${r1(cx)}" y="${r1(cy)}" font-size="${r1(size)}" text-anchor="middle" dominant-baseline="central" font-weight="600">${esc(it.type)}</text>`;
    })
    .join('');
  return svgDoc(vb, title, fills + labels);
}

const strAttrs = (st) => `fill="${st.fill}"` + (st.stroke ? ` stroke="${st.stroke}" stroke-width="3"` : '');
function strClass(it) {
  if (it.type === '창호') return 'window';
  if (it.type === '출입문') return 'door';
  return Object.values(it.attrs).includes('철근콘크리트벽') ? 'wall_rc' : 'wall';
}
function drawSTR(parsed, title) {
  const vb = frame(parsed.items.map((it) => it.bbox));
  const order = ['wall', 'wall_rc', 'window', 'door'];
  const body = order
    .map((cls) => {
      const d = parsed.items.filter((it) => strClass(it) === cls).map((it) => pathOf(it.polys)).join('');
      return d ? `<path d="${d}" ${strAttrs(STR_STYLE[cls])} stroke-linejoin="round"/>` : '';
    })
    .join('');
  return svgDoc(vb, title, body);
}

function drawOBJ(parsed, title) {
  const vb = frame(parsed.items.map((it) => it.bbox));
  const body = parsed.items
    .map((it) => {
      const [x0, y0, x1, y1] = it.bbox;
      const c = FIXTURE_COLORS[it.type] || '#6f6c7e';
      const size = Math.max(16, Math.min(30, (x1 - x0) / Math.max(2, it.type.length)));
      return (
        `<rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(x1 - x0)}" height="${r1(y1 - y0)}" rx="8" fill="${c}" fill-opacity=".16" stroke="${c}" stroke-width="4"/>` +
        `<text x="${r1((x0 + x1) / 2)}" y="${r1((y0 + y1) / 2)}" font-size="${r1(size)}" text-anchor="middle" dominant-baseline="central" font-weight="600">${esc(it.type)}</text>`
      );
    })
    .join('');
  return svgDoc(vb, title, body);
}

/** OCR 라벨: 도면에 적힌 글자를 원래 자리와 크기로 다시 쓴다. */
function readOCR(label) {
  return label.annotations
    .filter((a) => a.attributes?.OCR && Array.isArray(a.bbox))
    .map((a) => {
      const [x, y, w, h] = a.bbox;
      return { text: String(a.attributes.OCR), bbox: [x, y, x + w, y + h] };
    });
}
function drawOCR(texts, title) {
  const vb = frame(texts.map((t) => t.bbox));
  const body = texts
    .map(({ text, bbox: [x0, y0, x1, y1] }) => {
      const h = y1 - y0;
      return (
        `<rect x="${r1(x0 - 4)}" y="${r1(y0 - 4)}" width="${r1(x1 - x0 + 8)}" height="${r1(h + 8)}" rx="4" fill="${OCR_STYLE.stroke}" fill-opacity=".07" stroke="${OCR_STYLE.stroke}" stroke-opacity=".45" stroke-width="2"/>` +
        `<text x="${r1(x0)}" y="${r1(y0 + h * 0.84)}" font-size="${r1(h * 0.95)}" textLength="${r1(x1 - x0)}" lengthAdjust="spacingAndGlyphs">${esc(text)}</text>`
      );
    })
    .join('');
  return svgDoc(vb, title, body);
}

const countBy = (list, key) => {
  const m = new Map();
  for (const x of list) m.set(key(x), (m.get(key(x)) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const old of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, old));

  const examples = [];
  const files = fs.readdirSync(labelsDir).filter((f) => f.endsWith('.json')).sort();
  for (const file of files) {
    const id = file.replace(/\.json$/, '');
    const kind = id.split('_')[2];
    if (!KIND_ORDER.includes(kind)) continue;
    const label = JSON.parse(fs.readFileSync(path.join(labelsDir, file), 'utf8'));
    const number = id.split('_')[3];
    const title = `${kind} 도면 ${number}`;
    const hasImage = fs.existsSync(path.join(imagesDir, `${id}.webp`));
    const entry = { id, kind, number, original: hasImage, evaluable: kind !== 'OCR' };

    let svg = null;
    if (kind === 'OCR') {
      const texts = readOCR(label);
      svg = drawOCR(texts, title);
      entry.counts = [['글자', texts.length]];
      entry.texts = texts.map((t) => t.text);
    } else {
      const parsed = parseLabel(label);
      if (kind === 'SPA') {
        svg = drawSPA(parsed, title);
        entry.counts = countBy(parsed.items, (it) => it.type);
      } else if (kind === 'STR') {
        svg = drawSTR(parsed, title);
        entry.counts = countBy(parsed.items, (it) => STR_STYLE[strClass(it)].label);
      } else {
        if (!hasImage) svg = drawOBJ(parsed, title);
        entry.counts = countBy(parsed.items, (it) => it.type);
      }
    }

    if (hasImage) {
      entry.image = `images/${id}.webp`;
      entry.thumbnail = `thumbs/${id}.webp`;
    } else {
      fs.writeFileSync(path.join(outDir, `${id}.svg`), svg);
      entry.image = `drawings/${id}.svg`;
      entry.thumbnail = entry.image;
      const [, , w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
      entry.aspect = +(w / h).toFixed(3);
    }
    examples.push(entry);
  }

  examples.sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      Number(b.original) - Number(a.original) ||
      a.number.localeCompare(b.number),
  );
  fs.writeFileSync(path.join(root, 'public', 'data', 'examples.json'), JSON.stringify(examples));
  const drawn = examples.filter((e) => !e.original).length;
  console.log(`예시 도면 ${examples.length}건: 원본 이미지 ${examples.length - drawn}건, 라벨로 그린 도면 ${drawn}건`);
}

main();

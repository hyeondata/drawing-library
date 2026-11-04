// 실제 도면을 개발(dev) 70% / 검증(test) 30%로 나눈다. 결과: data/split.json(저장소에 커밋, 모든 분석이 같은 분할을 씀)
// 왜: 가중치를 맞춘 데이터로 다시 검증하면 과적합을 못 잡는다. 개발 묶음으로만 가중치·기준을 정하고, 검증 묶음은 마지막 판정에만 쓴다.
// 묶는 단위: 도면. 같은 도면의 세대는 같은 단지라 닮았고, 같은 평면(특징이 완전히 같은 세대)이 여러 도면에 반복 수록되므로
//   '같은 평면을 가진 도면끼리'를 한 덩어리(연결 요소)로 묶어 덩어리째 한쪽에 넣는다. 그래야 검증 묶음에 개발 묶음의 복사본이 없다.
// 배정: 덩어리 이름의 해시(sha256) 순서로 줄 세워, 개발 묶음 세대 수가 70%를 넘지 않게 채운다(난수 없음, 재현 가능).
// 사용: node scripts/build-split.mjs [--data ../aihub-full/TL_SPA]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadRealUnits } from './lib/real-units.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--data');
const dataDir = path.resolve(i > 0 ? process.argv[i + 1] : path.join(root, '..', 'aihub-full', 'TL_SPA'));
const DEV = 0.7;

const { real, census } = await loadRealUnits({ root, dataDir });
const keyOf = (f) => JSON.stringify(f, (_, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));

const parent = new Map();
const find = (x) => {
  if (!parent.has(x)) parent.set(x, x);
  while (parent.get(x) !== x) {
    parent.set(x, parent.get(parent.get(x)));
    x = parent.get(x);
  }
  return x;
};
const firstDrawing = new Map();
for (const r of real) {
  find(r.drawing);
  const k = keyOf(r.features);
  if (firstDrawing.has(k)) parent.set(find(r.drawing), find(firstDrawing.get(k)));
  else firstDrawing.set(k, r.drawing);
}
const comps = new Map(); // root -> { drawings:Set, units }
for (const r of real) {
  const c = find(r.drawing);
  if (!comps.has(c)) comps.set(c, { drawings: new Set(), units: 0 });
  comps.get(c).drawings.add(r.drawing);
  comps.get(c).units++;
}
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const order = [...comps.entries()].sort((a, b) => (hash(a[0]) < hash(b[0]) ? -1 : 1));
// 가장 큰 덩어리는 크기 때문에 비율을 흔들므로 먼저 개발 묶음에 넣는다(검증 묶음이 한 평면군에 쏠리지 않게).
const largest = Math.max(...[...comps.values()].map((c) => c.units));
order.sort((a, b) => (b[1].units === largest) - (a[1].units === largest));
const total = real.length;
let devUnits = 0;
const test = [];
const dev = [];
for (const [, c] of order) {
  if (devUnits + c.units <= DEV * total) {
    devUnits += c.units;
    dev.push(...c.drawings);
  } else test.push(...c.drawings);
}
const sizes = [...comps.values()].map((c) => c.units).sort((a, b) => b - a);
const out = {
  note: '실제 도면 분할(도면 단위, 같은 평면을 가진 도면은 같은 쪽). test에 없는 도면은 dev. scripts/build-split.mjs',
  source: `APT_FP_SPA ${census.drawings}장, 거실 있는 세대 ${total}개`,
  rule: { dev: DEV, unit: 'drawing component (shared identical plan)', order: 'sha256(component root), largest component → dev' },
  counts: { components: comps.size, largestComponentUnits: sizes[0], devUnits, testUnits: total - devUnits, devDrawings: dev.length, testDrawings: test.length },
  test: test.sort(),
};
fs.writeFileSync(path.join(root, 'data', 'split.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.counts));

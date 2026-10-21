import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { analyze, detectKind, evaluate, robustStats } from '../src/model/index.js';
import { diamondValue, nodeMetrics } from '../src/model/syntax.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const baseline = readJson('public/data/baseline.json');

// ---- 합성 도면 도우미 ----
const NAMES = ['공간_현관', '공간_거실', '공간_주방', '공간_침실', '공간_화장실', '구조_벽체', '구조_출입문', '구조_창호', '객체_변기', '객체_세면대', '객체_싱크대', '객체_가스레인지', '객체_욕조'];
const categories = NAMES.map((name, i) => ({ id: i + 1, name }));
const rect = (name, x, y, w, h, attributes = {}) => ({ name, x, y, w, h, attributes });
function coco(shapes) {
  return {
    categories,
    images: [{ id: 1, width: 1000, height: 1000, file_name: 'synthetic.png' }],
    annotations: shapes.map((s, i) => ({
      id: i,
      image_id: 1,
      category_id: NAMES.indexOf(s.name) + 1,
      segmentation: [[s.x, s.y, s.x + s.w, s.y, s.x + s.w, s.y + s.h, s.x, s.y + s.h]],
      bbox: [s.x, s.y, s.w, s.h],
      area: s.w * s.h,
      attributes: s.attributes,
    })),
  };
}

// 벽 두께 15px로 떨어진 실들. 현관→거실→주방/침실, 현관→화장실.
const goodPlan = [
  rect('공간_현관', 0, 0, 100, 100),
  rect('공간_거실', 115, 0, 300, 300),
  rect('공간_주방', 430, 0, 200, 150),
  rect('공간_침실', 430, 165, 200, 135),
  rect('공간_화장실', 0, 115, 100, 100),
];

test('D값과 RRA는 Hillier & Hanson 정의를 따른다', () => {
  // k=5: D = 2{5[log2(7/3) - 1] + 1} / (4·3)
  assert.ok(Math.abs(diamondValue(5) - (2 * (5 * (Math.log2(7 / 3) - 1) + 1)) / 12) < 1e-12);
  // 별형 그래프: 중심의 평균깊이 1 → RA 0, 가장자리는 MD 7/4
  const star = [[1, 2, 3, 4], [0], [0], [0], [0]];
  const m = nodeMetrics(star);
  assert.equal(m[0].meanDepth, 1);
  assert.equal(m[0].ra, 0);
  assert.equal(m[1].meanDepth, 1.75);
  assert.ok(Math.abs(m[1].ra - (2 * 0.75) / 3) < 1e-12);
});

test('정상 합성 평면은 모든 정합성 규칙을 통과한다', () => {
  const a = analyze(coco(goodPlan), 'SPA');
  assert.equal(a.units.length, 1);
  const failed = a.units[0].rules.filter((r) => !r.pass).map((r) => r.id);
  assert.deepEqual(failed, []);
  assert.equal(a.units[0].features.livingDepth, 1);
});

test('침실을 통해서만 갈 수 있는 침실은 프라이버시 규칙에서 걸린다', () => {
  const plan = [...goodPlan, rect('공간_침실', 645, 165, 150, 135)];
  const rules = analyze(coco(plan), 'SPA').units[0].rules;
  assert.equal(rules.find((r) => r.id === 'bedroomPrivacy').pass, false);
});

test('거실이 없고 떨어진 실이 있으면 필수 실·연결 규칙에서 걸린다', () => {
  const plan = goodPlan.filter((s) => s.name !== '공간_거실').concat(rect('공간_침실', 900, 900, 80, 80));
  const rules = analyze(coco(plan), 'SPA').units[0].rules;
  assert.equal(rules.find((r) => r.id === 'program').pass, false);
  assert.equal(rules.find((r) => r.id === 'reachable').pass, false);
});

test('문·창 겹침과 벽에서 떨어진 창을 찾아낸다', () => {
  const wall = rect('구조_벽체', 0, 0, 400, 20, { 구조_벽체: '철근콘크리트벽' });
  const ok = analyze(coco([wall, rect('구조_출입문', 20, 20, 80, 10), rect('구조_창호', 200, 20, 80, 10, { 창호: '미닫이창' })]), 'STR');
  assert.ok(ok.units[0].rules.every((r) => r.pass));
  const bad = analyze(coco([wall, rect('구조_출입문', 20, 20, 80, 10), rect('구조_창호', 40, 20, 80, 10), rect('구조_창호', 300, 300, 80, 10)]), 'STR');
  const byId = Object.fromEntries(bad.units[0].rules.map((r) => [r.id, r]));
  assert.equal(byId.noOverlap.pass, false);
  assert.equal(byId.onWall.pass, false);
});

test('짝 없는 변기·가스레인지를 찾아낸다', () => {
  const a = analyze(coco([rect('객체_변기', 0, 0, 40, 60), rect('객체_가스레인지', 800, 800, 60, 40), rect('객체_싱크대', 100, 900, 80, 40)]), 'OBJ');
  const byId = Object.fromEntries(a.units[0].rules.map((r) => [r.id, r]));
  assert.equal(byId.toiletBasin.pass, false);
  assert.equal(byId.stoveSink.pass, false);
});

test('강건 통계는 한 값으로 모인 분포에서 최소 척도를 쓴다', () => {
  const s = robustStats([1, 1, 1, 1], 0.5);
  assert.equal(s.median, 1);
  assert.equal(s.scale, 0.5);
});

test('평가 시 자기 자신은 기준 분포에서 빠진다', () => {
  const id = baseline.entries.SPA[0].drawing;
  const label = readJson(`public/data/labels/${id}.json`);
  const own = baseline.entries.SPA.filter((e) => e.drawing === id).length;
  const r = evaluate(label, { baseline, drawingId: id });
  assert.equal(r.baselineSize, baseline.entries.SPA.length - own);
  assert.equal(detectKind(label), 'SPA');
});

test('실제 샘플에서 거실을 지우면 점수가 떨어진다', () => {
  const id = 'APT_FP_SPA_001168733';
  const label = readJson(`public/data/labels/${id}.json`);
  const livingId = label.categories.find((c) => c.name === '공간_거실').id;
  const broken = { ...label, annotations: label.annotations.filter((a) => a.category_id !== livingId) };
  const before = evaluate(label, { baseline, drawingId: id }).score;
  const after = evaluate(broken, { baseline, drawingId: id }).score;
  assert.ok(after < before - 10, `거실 삭제 전 ${before.toFixed(1)}, 후 ${after.toFixed(1)}`);
});

test('모든 샘플을 오류 없이 평가하고 점수는 0~100이다', () => {
  for (const kind of ['SPA', 'STR', 'OBJ']) {
    for (const id of new Set(baseline.entries[kind].map((e) => e.drawing))) {
      const r = evaluate(readJson(`public/data/labels/${id}.json`), { baseline, drawingId: id });
      assert.ok(r.score >= 0 && r.score <= 100, `${id}: ${r.score}`);
    }
  }
});

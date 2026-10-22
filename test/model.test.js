import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { GATE_CAP } from '../src/model/config.js';
import { analyze, closenessScore, detectKind, ecdf, evaluate, percentileScore, qnScale, robustStats } from '../src/model/index.js';
import { minAreaRect } from '../src/model/geometry.js';
import { diamondValue, kendallTauB, nodeMetrics } from '../src/model/syntax.js';

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

test('Kendall τ_b: 같은 순서 1, 뒤집힌 순서 -1, 동점 보정', () => {
  assert.equal(kendallTauB([5, 4, 3, 2, 1], [5, 4, 3, 2, 1]), 1);
  assert.equal(kendallTauB([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), -1);
  const t = kendallTauB([3, 3, 1], [3, 2, 1]);
  assert.ok(t > 0.8 && t < 1);
});

test('방향이 정해진 지표는 유리한 쪽으로 벗어나도 감점하지 않는다', () => {
  assert.equal(closenessScore(2, 'higher'), 100);
  assert.ok(closenessScore(-1.5, 'higher') < 60);
  assert.equal(closenessScore(1.5), 50);
});

test('공간구문 그래프는 작은 기타(덕트)를 빼고 외부 노드를 붙인다', () => {
  const duct = { name: '공간_기타', x: 0, y: 230, w: 40, h: 40 }; // 1,600px² < 축척 보정한 ductMaxArea, 화장실과 맞닿음
  const names = [...NAMES, '공간_기타'];
  const label = coco(goodPlan);
  label.categories = names.map((name, i) => ({ id: i + 1, name }));
  label.annotations.push({ id: 99, image_id: 1, category_id: names.length, segmentation: [[0, 230, 40, 230, 40, 270, 0, 270]], bbox: [0, 230, 40, 40], area: 1600, attributes: {} });
  const u = analyze(label, 'SPA').units[0];
  const ductNode = u.nodes.find((n) => n.type === '기타');
  assert.equal(ductNode.duct, true);
  assert.equal(ductNode.integration, null);
  // 거실이 가장 통합된 기능실이고, 유전형 순서와 양의 상관
  assert.equal(u.rules.find((r) => r.id === 'livingCentral').pass, true);
  assert.ok(u.features.genotypeTau > 0);
  assert.ok(u.features.livingBedroomRatio > 1);
});

test('관문 규칙을 어기면 총점이 상한에 묶인다', () => {
  const plan = [...goodPlan, rect('공간_침실', 645, 165, 150, 135)]; // 침실 통과 동선
  const r = evaluate(coco(plan), { baseline, kind: 'SPA' });
  assert.ok(r.units[0].failedGates.length > 0);
  assert.ok(r.units[0].score <= GATE_CAP);
});

test('Qn 척도: 한 값으로 모이면 0, 정규 표본에서는 표준편차에 가깝다', () => {
  assert.equal(robustStats([1, 1, 1, 1]).scale, 0);
  // 표준정규 분위수 50개로 만든 표본: Qn ≈ 1
  const z = Array.from({ length: 50 }, (_, i) => {
    const p = (i + 0.5) / 50;
    // Acklam 근사 대신 간단한 로지스틱 근사(충분히 정확)
    return Math.log(p / (1 - p)) / 1.702;
  }).sort((a, b) => a - b);
  const q = qnScale(z);
  assert.ok(q > 0.85 && q < 1.15, `Qn=${q}`);
});

test('백분위 점수: 중앙은 100, 양끝은 0에 가깝고, 단측은 유리한 쪽을 감점하지 않는다', () => {
  const sorted = [0, 0.2, 0.4, 0.6, 0.8, 1];
  assert.equal(percentileScore(ecdf(0.5, sorted), undefined), 100);
  assert.ok(percentileScore(ecdf(-1, sorted), undefined) === 0);
  assert.equal(percentileScore(ecdf(1, sorted), 'higher'), 100);
  assert.ok(percentileScore(ecdf(0, sorted), 'higher') < 20);
});

test('회전 최소 외접 사각형은 도면이 기울어도 같은 직사각형도를 준다', () => {
  const rot = (pts, a) => pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
  const sq = [[0, 0], [300, 0], [300, 200], [0, 200]];
  const r0 = minAreaRect([sq]);
  const r1 = minAreaRect([rot(sq, 0.6)]);
  assert.ok(Math.abs(r0.area - 60000) < 1 && Math.abs(r1.area - 60000) < 1);
  assert.ok(Math.abs(r1.long / r1.short - 1.5) < 1e-6);
});

test('축척 보정: 도면을 2배로 그려도 지표와 규칙 판정이 같다', () => {
  const big = goodPlan.map((r) => ({ ...r, x: r.x * 2, y: r.y * 2, w: r.w * 2, h: r.h * 2 }));
  const a = analyze(coco(goodPlan), 'SPA');
  const b = analyze(coco(big), 'SPA');
  assert.ok(Math.abs(b.scale / a.scale - 2) < 1e-9);
  assert.deepEqual(b.units[0].rules.map((r) => r.pass), a.units[0].rules.map((r) => r.pass));
  for (const k of ['livingBedroomRatio', 'genotypeTau', 'roomRectangularity', 'bedroomMinWidth']) {
    assert.ok(Math.abs((a.units[0].features[k] ?? 0) - (b.units[0].features[k] ?? 0)) < 0.02, k);
  }
  // 외기 접면은 벽 간격 기준(고정 px)을 써서 축척 불변이 아니다(문서의 한계 참고). 여기서는 검사하지 않는다.
});

test('관문 결과는 점수와 별도로 유효성으로 출력되고, 상한은 끌 수 있다', () => {
  const plan = [...goodPlan, rect('공간_침실', 645, 165, 150, 135)];
  const r = evaluate(coco(plan), { baseline, kind: 'SPA', options: { gateCap: null } });
  assert.equal(r.units[0].validity.valid, false);
  assert.equal(r.units[0].capped, false);
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

// ---- 이미지로 평가: 합성 평면 이미지 → 영역 찾기 → 실 지정 → COCO → 평가 ----
test('이미지에서 실 영역을 찾아 지정하면 같은 모델로 평가된다', async () => {
  const { segment, applyAssignments, regionPolygon, toCoco, drawLine } = await import('../src/image/segment.js');
  const W = 1000;
  const H = 700;
  const gray = new Uint8Array(W * H).fill(255);
  const ink = new Uint8Array(W * H);
  const wall = (a, b) => drawLine(ink, W, H, a, b, 3);
  const box = (x0, y0, x1, y1) => {
    wall([x0, y0], [x1, y0]);
    wall([x1, y0], [x1, y1]);
    wall([x1, y1], [x0, y1]);
    wall([x0, y1], [x0, y0]);
  };
  // 이중선 벽 대신 굵은 선 하나로 그린 단순 평면(현관·거실·주방·침실 2·화장실)
  box(100, 100, 900, 600); // 외벽
  wall([300, 100], [300, 350]); // 현관 | 거실
  wall([100, 250], [300, 250]); // 현관 | 화장실
  wall([100, 350], [600, 350]); // 위 | 아래
  wall([600, 100], [600, 600]); // 거실·주방 | 침실
  wall([450, 100], [450, 350]); // 거실 | 주방
  wall([600, 350], [900, 350]); // 침실1 | 침실2
  wall([300, 350], [300, 600]); // 아래 왼쪽 | 침실3
  for (let i = 0; i < ink.length; i++) if (ink[i]) gray[i] = 0;
  const seg = segment(gray, W, H, { close: 1 });
  const at = { 현관: [200, 170], 화장실: [200, 300], 거실: [370, 220], 주방: [520, 220], 침실: [750, 220] };
  const seeds = Object.entries(at).map(([type, [x, y]]) => ({ x, y, type }));
  seeds.push({ x: 750, y: 480, type: '침실' }, { x: 450, y: 480, type: '침실' }, { x: 200, y: 480, type: '드레스룸' });
  const { groups } = applyAssignments(seg.labels, W, seg.regions, seeds, []);
  const rooms = [...groups.values()].filter((g) => g.type).map((g) => ({ type: g.type, polygon: regionPolygon(seg.labels, W, H, g.members) }));
  assert.equal(rooms.length, 8);
  const label = toCoco(rooms, W, H);
  assert.equal(label.images[0].width, 4963);
  const r = evaluate(label, { baseline, kind: 'SPA' });
  assert.equal(r.units.length, 1);
  assert.equal(r.units[0].validity.valid, true, r.units[0].validity.failed.join(','));
  assert.ok(r.score > 0 && r.score <= 100);
});

test('실 이름 글자: 오인식을 자모 유사도로 맞추고 설명문은 버린다', async () => {
  const { matchRoomName, namesFromText, seedsFromNames } = await import('../src/image/room-names.js');
  const t = (s) => matchRoomName(s)?.type ?? null;
  assert.equal(t('침실 1'), '침실');
  assert.equal(t('[주방/식당]'), '주방');
  assert.equal(t('혀과'), '현관');
  assert.equal(t('뇨레스룸'), '드레스룸');
  assert.equal(t('욕실2||'), '화장실');
  assert.equal(t('ELEV.홀'), '엘리베이터홀');
  assert.equal(t('청실2'), '침실');
  assert.equal(t('7695석고보드/실크벽지'), null);
  assert.equal(t('단위세대평면도(확장형)'), null);
  assert.equal(t('1500'), null);
  // "실외기실" 뒷부분만 따로 읽힌 "기실"은 긴 이름에 밀려 버린다.
  const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
  const names = namesFromText([
    { text: '실외기실', bbox: box(100, 100, 160, 115) },
    { text: '기실', bbox: box(130, 100, 160, 115) },
    { text: '거실', bbox: box(400, 300, 430, 315) },
    { text: '주방/식당', bbox: box(500, 300, 560, 315) },
  ]);
  assert.deepEqual(names.map((n) => n.type).sort(), ['거실', '실외기실', '주방']);
  // 거실과 주방 이름이 한 영역에 있으면 거실로 지정하고 나누라고 알린다.
  const groupAt = (x) => (x < 300 ? 1 : 2);
  const { seeds, shared, missing } = seedsFromNames(names, groupAt);
  assert.equal(seeds.find((s) => s.x > 300).type, '거실');
  assert.deepEqual(shared, [['거실', '주방']]);
  assert.equal(missing.length, 0);
});

test('도면 생성: 84㎡ 방 3개는 유효하고 규칙을 모두 통과하며 면적을 채운다', async () => {
  const { optimize, MIN_SIDE } = await import('../src/generate/optimize.js');
  const { buildChoices } = await import('../src/generate/choices.js');
  const dir = path.join(root, 'public/data/labels');
  const files = fs.readdirSync(dir);
  const choices = buildChoices({
    spaLabels: files.filter((f) => f.includes('_SPA_')).map((f) => ({ id: f, label: readJson(`public/data/labels/${f}`) })),
    ocrLabels: files.filter((f) => f.includes('_OCR_')).map((f) => readJson(`public/data/labels/${f}`)),
  });
  assert.equal(choices.source.units, 35);
  assert.ok(choices.living[0].share < choices.living[3].share);
  const t = choices.targets;
  const other = choices.roomSize[1].share;
  const spec = {
    area: 84, bedrooms: 3, baths: 2, dress: true, multi: false, outdoorUnit: true, balcony: true,
    targets: { living: choices.living[1].share, kitchen: t.kitchen, master: other * choices.master[1].ratio, other, bath: t.bath, entrance: t.entrance, dress: t.dress, multi: t.multi },
    prefs: ['livingCentral', 'bath'],
  };
  const top = optimize(spec, { baseline: readJson('public/data/baseline.json'), seed: 1 });
  assert.equal(top.length, 3);
  const best = top[0];
  assert.ok(best.unit.validity.valid);
  assert.ok(best.unit.groups.rules.items.every((r) => r.pass), best.unit.groups.rules.items.filter((r) => !r.pass).map((r) => r.id).join());
  assert.equal(best.narrow, 0);
  const inner = best.layout.rooms.filter((r) => r.type !== '발코니' && r.type !== '실외기실');
  const area = inner.reduce((s, r) => s + r.w * r.h, 0);
  assert.ok(Math.abs(area - 84) < 0.5, `전용면적 ${area}`);
  for (const r of inner) if (MIN_SIDE[r.type] && r.type !== '침실') assert.ok(Math.min(r.w, r.h) >= MIN_SIDE[r.type] - 1e-6, `${r.name} ${r.w}x${r.h}`);
  // 세 안은 배치가 서로 다르다.
  assert.equal(new Set(top.map((c) => c.signature)).size, 3);
  // 문·창·설비: 현관문이 있고 문으로 모든 실에 가며, 욕실마다 변기·세면대, 주방에 싱크대·가스레인지
  assert.equal(best.doorIssues, 0, JSON.stringify(best.layout.doorCheck));
  assert.ok(best.layout.openings.some((o) => o.entry));
  assert.ok(best.layout.openings.some((o) => o.kind === 'window') && best.layout.openings.some((o) => o.kind === 'sliding'));
  const fx = best.layout.fixtures.map((f) => f.type);
  assert.equal(fx.filter((t) => t === '변기').length, 2);
  assert.ok(fx.includes('싱크대') && fx.includes('가스레인지'));
  for (const f of best.layout.fixtures) {
    const room = best.layout.rooms.find((r) => r.key === f.room);
    assert.ok(f.x >= room.x - 1e-6 && f.y >= room.y - 1e-6 && f.x + f.w <= room.x + room.w + 1e-6 && f.y + f.h <= room.y + room.h + 1e-6, `${f.type} 밖으로 나감`);
  }
  const { toFullLabel } = await import('../src/generate/layout.js');
  const names = toFullLabel(best.layout).categories.map((c) => c.name);
  assert.ok(names.includes('구조_출입문') && names.includes('구조_창호') && names.includes('객체_변기') && names.includes('공간_거실'));
});

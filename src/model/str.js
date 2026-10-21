// STR(구조) 라벨 분석: 벽·문·창의 시공 정합성.
import { THRESHOLDS } from './config.js';
import { bboxGap, bboxIntersectionArea, overlapRatio, polygonDistance } from './geometry.js';

const subtype = (it) => it.attrs[it.name] || it.attrs['창호'] || it.attrs['구조_창호'] || '';

function overlaps(a, b) {
  if (bboxIntersectionArea(a.bbox, b.bbox) <= 0) return false;
  return Math.max(overlapRatio(a.polys, b.polys), overlapRatio(b.polys, a.polys)) >= THRESHOLDS.openingOverlap;
}

export function analyzeSTR(parsed) {
  const els = parsed.items.filter((it) => it.group === '구조');
  const walls = els.filter((e) => e.type === '벽체');
  const doors = els.filter((e) => e.type === '출입문');
  const windows = els.filter((e) => e.type === '창호');
  const openings = [...doors, ...windows];

  // 개구부가 벽에 붙어 있는가
  const floating = openings.filter((o) => {
    for (const w of walls) {
      if (bboxGap(o.bbox, w.bbox) > THRESHOLDS.openingToWall) continue;
      if (polygonDistance(o.polys, w.polys) <= THRESHOLDS.openingToWall) return false;
    }
    return true;
  });

  // 문-창, 같은 종류끼리의 겹침
  const conflicts = [];
  for (let i = 0; i < openings.length; i++) {
    for (let j = i + 1; j < openings.length; j++) {
      if (overlaps(openings[i], openings[j])) conflicts.push([openings[i].id, openings[j].id, openings[i].type === openings[j].type ? '중복' : '문·창 겹침']);
    }
  }
  const conflicted = new Set(conflicts.flat().filter((x) => typeof x === 'number'));
  const doorWindow = conflicts.filter((c) => c[2] === '문·창 겹침').length;
  const dupes = conflicts.length - doorWindow;

  const rules = [];
  const rule = (id, label, weight, ratio, detail) =>
    rules.push({ id, label, weight, ratio: Math.max(0, Math.min(1, ratio)), pass: ratio >= 1, detail });
  rule('elements', '벽·문·창이 모두 있음', 1, [walls, doors, windows].filter((x) => x.length).length / 3,
    `벽 ${walls.length} · 문 ${doors.length} · 창 ${windows.length}`);
  rule('onWall', '모든 문·창이 벽에 붙어 있음', 2, openings.length ? 1 - floating.length / openings.length : 0,
    floating.length ? `벽에서 떨어진 개구부 ${floating.length}개` : '모두 벽에 붙음');
  rule('noOverlap', '문과 창이 겹치지 않음', 2, openings.length ? 1 - conflicted.size / openings.length : 1,
    conflicts.length ? `문·창 겹침 ${doorWindow}건 · 같은 종류 중복 ${dupes}건` : '겹침 없음');

  const wallArea = walls.reduce((s, w) => s + w.area, 0);
  const rcArea = walls.filter((w) => subtype(w) === '철근콘크리트벽').reduce((s, w) => s + w.area, 0);
  const features = {
    windowsPerDoor: doors.length ? windows.length / doors.length : null,
    rcWallShare: wallArea ? rcArea / wallArea : null,
    slidingWindowShare: windows.length ? windows.filter((w) => subtype(w) === '미닫이창').length / windows.length : null,
  };

  return {
    kind: 'STR',
    elements: els.map((e) => ({
      id: e.id,
      type: e.type,
      subtype: subtype(e),
      polys: e.polys,
      flag: floating.includes(e) ? 'floating' : conflicted.has(e.id) ? 'conflict' : null,
    })),
    conflicts,
    units: [{ index: 0, features, rules }],
  };
}

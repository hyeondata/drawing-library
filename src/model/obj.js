// OBJ(설비) 라벨 분석: 위생·주방 설비의 짝 정합성.
import { THRESHOLDS } from './config.js';

const PAIRS = [
  { id: 'toiletBasin', from: '변기', to: '세면대', label: '변기 옆에 세면대가 있음', weight: 2 },
  { id: 'stoveSink', from: '가스레인지', to: '싱크대', label: '가스레인지 옆에 싱크대가 있음', weight: 2 },
  { id: 'sinkStove', from: '싱크대', to: '가스레인지', label: '싱크대 옆에 가스레인지가 있음', weight: 1 },
  { id: 'bathToilet', from: '욕조', to: '변기', label: '욕조가 화장실(변기) 안에 있음', weight: 1 },
];

export function analyzeOBJ(parsed) {
  const fixtures = parsed.items.filter((it) => it.group === '객체');
  const byType = (t) => fixtures.filter((f) => f.type === t);
  const dist = (a, b) => Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]);
  const unpaired = new Set();

  const rules = [];
  const rule = (id, label, weight, ratio, detail) =>
    rules.push({ id, label, weight, ratio: Math.max(0, Math.min(1, ratio)), pass: ratio >= 1, detail });

  const counts = Object.fromEntries(['변기', '세면대', '욕조', '싱크대', '가스레인지'].map((t) => [t, byType(t).length]));
  rule('program', '주방(싱크대)과 화장실(변기)이 모두 있음', 2, ((counts['싱크대'] > 0) + (counts['변기'] > 0)) / 2,
    `싱크대 ${counts['싱크대']} · 변기 ${counts['변기']}`);

  for (const p of PAIRS) {
    const from = byType(p.from);
    const to = byType(p.to);
    const lonely = from.filter((f) => !to.some((t) => dist(f, t) <= THRESHOLDS.fixturePair));
    lonely.forEach((f) => unpaired.add(f.id));
    rule(p.id, p.label, p.weight, from.length ? 1 - lonely.length / from.length : 1,
      from.length ? (lonely.length ? `짝 없는 ${p.from} ${lonely.length}/${from.length}` : `${from.length}개 모두 짝 있음`) : `${p.from} 없음`);
  }

  const features = {
    bathPerToilet: counts['변기'] ? counts['욕조'] / counts['변기'] : null,
    toiletPerKitchen: counts['싱크대'] ? counts['변기'] / counts['싱크대'] : null,
  };

  return {
    kind: 'OBJ',
    elements: fixtures.map((f) => ({ id: f.id, type: f.type, polys: f.polys, flag: unpaired.has(f.id) ? 'unpaired' : null })),
    counts,
    units: [{ index: 0, features, rules }],
  };
}

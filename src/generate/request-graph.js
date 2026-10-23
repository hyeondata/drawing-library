// '요청한 연결'과 생성 결과의 연결을 비교한다(그래프 겹쳐 보기).
// 요청: 판상형 기본 규칙 + 사용자가 고른 선호. 결과: 실끼리 0.9m 이상 맞닿음(벽 공유)과 문·개구부 연결.
// 판정: 원함(want)이 이어짐 → 충족, 안 이어짐 → 빠짐 / 피함(avoid)이 맞닿음 → 어김, 아니면 지킴.
// 평면 생성 논문들이 요청한 인접 그래프와 결과 그래프를 겹쳐 맞음·빠짐·초과를 색으로 보여 주는 방식을 따른다
// (House-GAN++, HouseDiffusion의 그래프 비교 그림; 조사: reports/평면 생성 화면 추가 시각화.md).
import { sharedEdge } from './layout.js';

const MIN_CONTACT = 0.9; // 문 하나가 들어갈 길이

/**
 * 요청 목록. 각 항목 { a, b: [후보 key...], kind: 'want'|'avoid', strength: 'base'|'pref', label, why }
 * b가 여러 개면 그중 하나와 이어지면 된다(want) / 하나라도 맞닿으면 어김(avoid).
 */
export function requestedPairs(spec, layout) {
  const has = new Set(layout.rooms.map((r) => r.key));
  const halls = layout.rooms.filter((r) => r.type === '기타').map((r) => r.key);
  const beds = layout.rooms.filter((r) => r.type === '침실' && r.key !== 'master').map((r) => r.key);
  const prefs = new Set(spec.prefs || []);
  const out = [];
  const add = (a, b, kind, label, why, strength = 'base') => {
    const bs = (Array.isArray(b) ? b : [b]).filter((k) => has.has(k));
    if (has.has(a) && bs.length) out.push({ a, b: bs, kind, label, why, strength });
  };
  add('kitchen', 'living', 'want', '주방–거실', prefs.has('kitchenLink') ? '선호: 주방과 거실을 잇기(대면형)' : '규칙 kitchenLiving(가족 공용 공간)', prefs.has('kitchenLink') ? 'pref' : 'base');
  add('entrance', ['living', 'kitchen', ...halls], 'want', '현관–공용 공간', prefs.has('entryNear') ? '선호: 현관에서 거실 가까이' : '현관은 공용 공간으로 열림(규칙 entry)', prefs.has('entryNear') ? 'pref' : 'base');
  add('bathPublic', ['living', 'kitchen', 'entrance', ...halls], 'want', '공용욕실–공용 공간', '규칙 publicBath(침실을 거치지 않고 감)');
  add('bathMaster', 'master', 'want', '부부욕실–안방', '안방 전용 부속실');
  add('dress', 'master', 'want', '드레스룸–안방', '안방 전용 부속실');
  add('master', ['living', ...halls], 'want', '안방–거실·복도', '침실은 공용 공간 쪽으로 문을 냄');
  for (const b of beds) add(b, ['living', ...halls], 'want', `${layout.rooms.find((r) => r.key === b)?.name}–거실·복도`, '침실은 공용 공간 쪽으로 문을 냄');
  if (has.has('multi')) add('multi', ['kitchen', 'living', ...halls], 'want', '다목적실–주방·공용', '팬트리·가사 공간');
  for (const b of ['master', ...beds]) add(b, 'entrance', 'avoid', `${layout.rooms.find((r) => r.key === b)?.name}–현관`, prefs.has('privacy') ? '선호: 사생활(공·사 분리)' : '공·사 분리(현관에서 침실이 바로 보이지 않게)', prefs.has('privacy') ? 'pref' : 'base');
  if (prefs.has('quiet'))
    for (const b of ['master', ...beds]) {
      add(b, 'kitchen', 'avoid', `${layout.rooms.find((r) => r.key === b)?.name}–주방`, '선호: 조용한 침실(소음원과 맞댐 피함)', 'pref');
    }
  return out;
}

/** 결과 판정. 반환 { pairs: [{...요청, status, hit, contact, door}], counts } */
export function compareGraph(spec, layout) {
  const by = Object.fromEntries(layout.rooms.map((r) => [r.key, r]));
  const doorBetween = (a, b) => (layout.openings || []).some((o) => (o.kind === 'door' || o.kind === 'opening') && ((o.from === a && o.to === b) || (o.from === b && o.to === a)));
  const pairs = requestedPairs(spec, layout).map((p) => {
    const cands = p.b.map((k) => ({ k, contact: sharedEdge(by[p.a], by[k]), door: doorBetween(p.a, k) }));
    cands.sort((x, y) => Number(y.door) - Number(x.door) || y.contact - x.contact);
    const hit = cands[0];
    const touch = hit.contact >= MIN_CONTACT - 1e-6;
    let status;
    if (p.kind === 'want') status = hit.door ? 'met' : touch ? 'wall' : 'missing';
    else status = touch ? 'violated' : 'kept';
    return { ...p, hit: hit.k, contact: hit.contact, door: hit.door, status };
  });
  const counts = { met: 0, wall: 0, missing: 0, violated: 0, kept: 0 };
  for (const p of pairs) counts[p.status]++;
  // 그래프 편집 거리의 간이판: 빠진 요청 + 어긴 요청(벽만 맞닿은 원함은 0.5)
  counts.ged = counts.missing + counts.violated + 0.5 * counts.wall;
  return { pairs, counts };
}

export const STATUS = {
  met: { label: '충족(문·개구부로 이어짐)', color: '#0f7b0f', dash: '' },
  wall: { label: '맞닿았지만 문 없음', color: '#b7791f', dash: '7 4' },
  missing: { label: '빠짐(떨어져 있음)', color: '#d4a017', dash: '3 4' },
  violated: { label: '어김(피할 연결이 맞닿음)', color: '#c4314b', dash: '' },
  kept: { label: '지킴(피할 연결이 떨어져 있음)', color: '#8a8794', dash: '2 5' },
};

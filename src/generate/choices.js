// 도면 생성 화면의 선택지. AI 허브 SPA 라벨 전체에서 아파트 평면도(APT_FP) 세대를 요약한 aihub-stats.js를 쓴다
// (scripts/build-aihub-stats.mjs가 만듦). 크기 선택지는 전용 면적 대비 실 면적비(발코니·실외기실 제외) 분위수,
// 개수·구성 선택지는 그 구성을 가진 세대 비율이다. 작은방·안방·주방과 구성 비율은 침실 수별로 나눈다.
import { AIHUB } from './aihub-stats.js';

/** 세대 하나의 실 개수와 전용 대비 면적비(발코니·실외기실 제외). scripts/build-aihub-stats.mjs가 전체 데이터에 쓴다. */
export function unitRow(analysis, u) {
  const count = {};
  const area = {};
  for (const n of u.nodes) {
    count[n.type] = (count[n.type] || 0) + 1;
    area[n.type] = (area[n.type] || 0) + analysis.spaces[n.space].area;
  }
  const interior = u.totalArea - (area['발코니'] || 0) - (area['실외기실'] || 0);
  const beds = u.nodes.filter((n) => n.type === '침실').map((n) => analysis.spaces[n.space].area).sort((x, y) => y - x);
  const share = (t) => (area[t] || 0) / interior;
  return {
    count,
    living: share('거실'),
    kitchen: share('주방'),
    entrance: share('현관'),
    master: beds.length ? beds[0] / interior : null,
    other: beds.length > 1 ? beds.slice(1).reduce((s, x) => s + x, 0) / (beds.length - 1) / interior : null,
    masterRatio: beds.length > 1 ? beds[0] / (beds.slice(1).reduce((s, x) => s + x, 0) / (beds.length - 1)) : null,
    bathEach: count['화장실'] ? share('화장실') / count['화장실'] : null,
    dress: count['드레스룸'] ? share('드레스룸') : null,
    multi: count['다목적공간'] ? share('다목적공간') : null,
  };
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const share = (x) => `${Math.round(x * 100)}%`;
/** 생성기가 다루는 침실 수. 6개 이상은 면적비가 한 값에 몰려(반복 도면·세대 분리 오류로 보임) 판상형 한 줄에도 들어가지 않아 뺐다. */
export const BEDROOMS = [1, 2, 3, 4, 5];

/** 침실 수별 선택지: 작은방 크기·안방 비중·나머지 실 목표 면적비·구성 비율. 침실 1개는 작은방이 없어 2개 층의 값을 쓴다. */
function bedroomOptions(stats, b) {
  const s = stats.byBedrooms[b];
  const ref = b === 1 ? stats.byBedrooms[2] : s;
  const tag = b === 1 ? ' (방 2개 기준)' : '';
  return {
    n: s.n,
    roomSize: [
      { key: 'small', label: '작게', share: ref.other.p25, sub: `작은방 하위 25% · ${pct(ref.other.p25)}${tag}` },
      { key: 'standard', label: '보통', share: ref.other.p50, sub: `작은방 중앙값 · ${pct(ref.other.p50)}${tag}` },
      { key: 'large', label: '넓게', share: ref.other.p75, sub: `작은방 상위 25% · ${pct(ref.other.p75)}${tag}` },
    ],
    master: [
      { key: 'even', label: '방 크기 고르게', ratio: ref.masterRatio.p25, sub: `안방 = 작은방 × ${ref.masterRatio.p25.toFixed(2)} (하위 25%)${tag}` },
      { key: 'standard', label: '보통', ratio: ref.masterRatio.p50, sub: `안방 = 작은방 × ${ref.masterRatio.p50.toFixed(2)} (중앙값)${tag}` },
      { key: 'master', label: '안방 크게', ratio: ref.masterRatio.p75, sub: `안방 = 작은방 × ${ref.masterRatio.p75.toFixed(2)} (상위 25%)${tag}` },
    ],
    targets: { kitchen: s.kitchen, entrance: s.entrance, bath: s.bath, dress: s.dress ?? stats.targets.dress, multi: s.multi ?? stats.targets.multi },
    composition: s.composition,
  };
}

export function buildChoices(stats = AIHUB) {
  const n = stats.source.aptUnique;
  const L = stats.living;
  const c = stats.composition;
  const byBedrooms = Object.fromEntries(BEDROOMS.map((b) => [b, bedroomOptions(stats, b)]));
  return {
    source: { units: n, complete: stats.source.aptComplete, files: stats.source.files, all: stats.source.units },
    // 1. 전용면적: 국민주택 규모(85㎡) 안팎의 대표 주택형. 라벨에는 실측 축척이 없어 면적 자체는 라벨에서 정할 수 없다.
    area: [
      { value: 59, label: '59㎡', sub: '약 18평 · 25평형', bedrooms: 3, note: '소형 대표 주택형' },
      { value: 74, label: '74㎡', sub: '약 22평 · 30평형', bedrooms: 3 },
      { value: 84, label: '84㎡', sub: '약 25평 · 34평형', bedrooms: 3, note: '국민주택 규모 상한(85㎡)의 대표 주택형' },
      { value: 101, label: '101㎡', sub: '약 31평 · 40평형', bedrooms: 4 },
      { value: 114, label: '114㎡', sub: '약 35평 · 45평형', bedrooms: 4 },
      { value: 135, label: '135㎡', sub: '약 41평 · 50평형', bedrooms: 5, note: '대형(방 5개 세대용)' },
    ],
    // 2. 거실 크기: 전용 대비 거실 면적비 분위수(침실 수별 차이가 작아 전체로 잡음)
    living: [
      { key: 'compact', label: '아담하게', share: L.p25, sub: `하위 25% · ${pct(L.p25)}` },
      { key: 'standard', label: '보통', share: L.p50, sub: `중앙값 · ${pct(L.p50)}` },
      { key: 'wide', label: '넓게', share: L.p75, sub: `상위 25% · ${pct(L.p75)}` },
      { key: 'xwide', label: '아주 넓게', share: L.p90, sub: `상위 10% · ${pct(L.p90)}` },
    ],
    // 3. 방 개수: 침실 수 분포
    bedrooms: BEDROOMS.map((k) => ({ value: k, label: `방 ${k}개`, sub: `${(stats.bedrooms[k] || 0).toLocaleString()}세대 · ${share((stats.bedrooms[k] || 0) / n)}` })),
    // 4. 방 크기(침실 수별, 처음 화면은 방 3개)
    byBedrooms,
    roomSize: byBedrooms[3].roomSize,
    master: byBedrooms[3].master,
    // 5. 방 구성: 그 구성을 가진 세대 비율(전체, 침실 수별 값은 byBedrooms)
    composition: [
      { key: 'baths2', label: '화장실 2개(공용·부부욕실)', sub: `${share(c.baths2)}의 세대가 2개 이상(3개 이상 ${share(c.baths3)})`, default: true },
      { key: 'dress', label: '드레스룸', sub: `${share(c.dress)}의 세대`, default: true },
      { key: 'multi', label: '다목적실(알파룸·팬트리·다용도실)', sub: `${share(c.multi)}의 세대`, default: false },
      { key: 'outdoorUnit', label: '실외기실', sub: `${share(c.outdoorUnit)}의 세대`, default: true },
      { key: 'balcony', label: '전면 발코니(비확장)', sub: `${share(c.balcony)}의 세대(나머지는 확장형)`, default: true },
    ],
    // 나머지 실의 목표 면적비(중앙값, 침실 3개 기준. 침실 수를 바꾸면 byBedrooms[b].targets)
    targets: byBedrooms[3].targets,
  };
}

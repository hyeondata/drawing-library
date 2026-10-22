// 도면 생성 화면의 선택지를 AI 허브 라벨에서 만든다(빌드 때 Node에서 실행).
// 크기 선택지는 기준 SPA 세대의 전용 면적 대비 실 면적 비율(발코니·실외기실 제외) 분위수,
// 개수·구성 선택지는 그 구성을 가진 세대 수, 실 이름은 OCR 라벨에서 센다.
import { analyze } from '../model/index.js';

const quantile = (values, p) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = (v.length - 1) * p;
  const lo = Math.floor(i);
  return v[lo] + (v[Math.min(v.length - 1, lo + 1)] - v[lo]) * (i - lo);
};
const median = (v) => quantile(v, 0.5);

/** 세대마다 실 개수와 전용 대비 면적비를 센다. */
export function unitStats(spaLabels) {
  const rows = [];
  for (const { id, label } of spaLabels) {
    const a = analyze(label, 'SPA');
    for (const u of a.units) {
      const count = {};
      const area = {};
      for (const n of u.nodes) {
        count[n.type] = (count[n.type] || 0) + 1;
        area[n.type] = (area[n.type] || 0) + a.spaces[n.space].area;
      }
      const interior = u.totalArea - (area['발코니'] || 0) - (area['실외기실'] || 0);
      const beds = u.nodes.filter((n) => n.type === '침실').map((n) => a.spaces[n.space].area).sort((x, y) => y - x);
      const share = (t) => (area[t] || 0) / interior;
      rows.push({
        drawing: id,
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
      });
    }
  }
  return rows;
}

/** OCR 라벨에 나온 실 이름별 도면 수. */
export function ocrNameCounts(ocrLabels) {
  const counts = {};
  for (const label of ocrLabels) {
    const seen = new Set();
    for (const a of label.annotations || []) {
      const t = String(a.attributes?.OCR || '').replace(/\s+/g, '');
      if (t) seen.add(t);
    }
    for (const t of seen) counts[t] = (counts[t] || 0) + 1;
  }
  return { drawings: ocrLabels.length, counts };
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

export function buildChoices({ spaLabels, ocrLabels }) {
  const rows = unitStats(spaLabels);
  const n = rows.length;
  const col = (k) => rows.map((r) => r[k]).filter((x) => x !== null && Number.isFinite(x));
  const ocr = ocrNameCounts(ocrLabels);
  const ocrOf = (...names) => names.reduce((s, name) => s + (ocr.counts[name] || 0), 0);
  const has = (pred) => rows.filter(pred).length;

  const living = col('living');
  const other = col('other');
  const masterRatio = col('masterRatio');
  const bedHist = {};
  for (const r of rows) bedHist[r.count['침실'] || 0] = (bedHist[r.count['침실'] || 0] || 0) + 1;

  return {
    source: { units: n, drawings: new Set(rows.map((r) => r.drawing)).size, ocrDrawings: ocr.drawings },
    // 1. 전용면적: 국민주택 규모(85㎡) 안팎의 대표 주택형. 라벨에는 실측 축척이 없어 면적 자체는 라벨에서 정할 수 없다.
    area: [
      { value: 59, label: '59㎡', sub: '약 18평 · 25평형', bedrooms: 3, note: '소형 대표 주택형' },
      { value: 74, label: '74㎡', sub: '약 22평 · 30평형', bedrooms: 3 },
      { value: 84, label: '84㎡', sub: '약 25평 · 34평형', bedrooms: 3, note: '국민주택 규모 상한(85㎡)의 대표 주택형' },
      { value: 101, label: '101㎡', sub: '약 31평 · 40평형', bedrooms: 4 },
      { value: 114, label: '114㎡', sub: '약 35평 · 45평형', bedrooms: 4 },
    ],
    // 2. 거실 크기: 전용 대비 거실 면적비 분위수
    living: [
      { key: 'compact', label: '아담하게', share: quantile(living, 0.25), sub: `하위 25% · ${pct(quantile(living, 0.25))}` },
      { key: 'standard', label: '보통', share: median(living), sub: `중앙값 · ${pct(median(living))}` },
      { key: 'wide', label: '넓게', share: quantile(living, 0.75), sub: `상위 25% · ${pct(quantile(living, 0.75))}` },
      { key: 'xwide', label: '아주 넓게', share: quantile(living, 0.9), sub: `상위 10% · ${pct(quantile(living, 0.9))}` },
    ],
    // 3. 방 개수: 침실 수 분포
    bedrooms: [2, 3, 4].map((k) => ({ value: k, label: `방 ${k}개`, sub: `기준 ${n}세대 중 ${bedHist[k] || 0}세대` })),
    // 4. 방 크기: 작은방 면적비와 안방/작은방 면적비 분위수
    roomSize: [
      { key: 'small', label: '작게', share: quantile(other, 0.25), sub: `작은방 하위 25% · ${pct(quantile(other, 0.25))}` },
      { key: 'standard', label: '보통', share: median(other), sub: `작은방 중앙값 · ${pct(median(other))}` },
      { key: 'large', label: '넓게', share: quantile(other, 0.75), sub: `작은방 상위 25% · ${pct(quantile(other, 0.75))}` },
    ],
    master: [
      { key: 'even', label: '방 크기 고르게', ratio: quantile(masterRatio, 0.25), sub: `안방 = 작은방 × ${quantile(masterRatio, 0.25).toFixed(2)} (하위 25%)` },
      { key: 'standard', label: '보통', ratio: median(masterRatio), sub: `안방 = 작은방 × ${median(masterRatio).toFixed(2)} (중앙값)` },
      { key: 'master', label: '안방 크게', ratio: quantile(masterRatio, 0.75), sub: `안방 = 작은방 × ${quantile(masterRatio, 0.75).toFixed(2)} (상위 25%)` },
    ],
    // 5. 방 구성: 그 구성을 가진 세대 수(SPA)와 그 이름이 적힌 도면 수(OCR)
    composition: [
      {
        key: 'baths2',
        label: '화장실 2개(공용·부부욕실)',
        sub: `SPA ${has((r) => (r.count['화장실'] || 0) >= 2)}/${n}세대 · OCR '부부욕실·가족욕실' ${ocrOf('부부욕실', '가족욕실')}장`,
        default: true,
      },
      { key: 'dress', label: '드레스룸', sub: `SPA ${has((r) => r.count['드레스룸'])}/${n}세대 · OCR '드레스룸' ${ocrOf('드레스룸')}장`, default: true },
      {
        key: 'multi',
        label: '다목적실(알파룸·팬트리·다용도실)',
        sub: `SPA ${has((r) => r.count['다목적공간'])}/${n}세대 · OCR '팬트리·알파룸·다용도실' ${ocrOf('팬트리', '펜트리', '알파룸', '다용도실')}장`,
        default: false,
      },
      { key: 'outdoorUnit', label: '실외기실', sub: `SPA ${has((r) => r.count['실외기실'])}/${n}세대 · OCR '실외기실' ${ocrOf('실외기실')}장`, default: true },
      {
        key: 'balcony',
        label: '전면 발코니(비확장)',
        sub: `SPA ${has((r) => r.count['발코니'])}/${n}세대(나머지는 확장형) · OCR '발코니' ${ocrOf('발코니', '발코니1', '발코니2', '발코니3')}장`,
        default: true,
      },
    ],
    // 나머지 실의 목표 면적비(중앙값)
    targets: {
      kitchen: median(col('kitchen')),
      entrance: median(col('entrance')),
      bath: median(col('bathEach')),
      dress: median(col('dress')),
      multi: median(col('multi')),
    },
  };
}

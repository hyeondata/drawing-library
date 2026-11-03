// term-evidence 측정 코드(메인 스크립트와 worker가 같이 쓴다). 실제 도면과 생성 평면을 같은 relations()로 잰다.
import fs from 'node:fs';
import path from 'node:path';
import { defaultParams } from '../../src/generate/compare.js';
import { buildLayout, rng, toLabel } from '../../src/generate/layout.js';
import { buildQubo, decode, encode, frontBedCount } from '../../src/generate/qubo.js';
import { analyze } from '../../src/model/index.js';

export const SX = ['livingBedroomRatio', 'kitchenBedroomRatio', 'genotypeTau', 'privacyDepthGap'];
export const END = 0.2; // 장축 양 끝 20% 안이면 "끝"

// ---- 세대 하나에서 관계 측정(실제·생성 공통) ----
// 반환: { 관계 id: true/false/null(해당 실이 없어 판단 불가) , offCenter: 0~0.5 }
export function relations(analysis, unit) {
  const sp = analysis.spaces;
  const nodes = unit.nodes.filter((n) => !n.duct);
  const idx = new Map(unit.nodes.map((n, i) => [i, n]));
  const adj = new Map(unit.nodes.map((_, i) => [i, new Set()]));
  // unit.edges는 전역 공간 번호(spa.js localEdges)이므로 세대 안 번호로 바꾼다
  const loc = new Map(unit.nodes.map((n, i) => [n.space, i]));
  for (const [ga, gb] of unit.edges) {
    const a = loc.get(ga), b = loc.get(gb);
    if (a === undefined || b === undefined) continue;
    adj.get(a).add(b);
    adj.get(b).add(a);
  }
  const of = (t) => [...idx.entries()].filter(([, n]) => n.type === t && !n.duct).map(([i]) => i);
  const area = (i) => sp[idx.get(i).space].area;
  const beds = of('침실').sort((a, b) => area(b) - area(a));
  const master = beds[0];
  const others = beds.slice(1);
  const baths = of('화장실');
  const pubBaths = master === undefined ? baths : baths.filter((b) => !adj.get(master).has(b));
  const touch = (A, B) => (A.length && B.length ? A.some((a) => B.some((b) => a !== b && adj.get(a).has(b))) : null);
  const living = of('거실');
  const kitchen = of('주방');
  const entrance = of('현관');
  const multi = of('다목적공간');
  // 장축 위치
  const pts = nodes.map((n) => sp[n.space].center).filter(Boolean);
  const xs = pts.map((p) => p[0] ?? p.x);
  const ys = pts.map((p) => p[1] ?? p.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const axis = spanX >= spanY ? 0 : 1;
  const lo = axis ? Math.min(...ys) : Math.min(...xs);
  const len = Math.max(spanX, spanY) || 1;
  const pos = (i) => {
    const c = sp[idx.get(i).space].center;
    return ((axis ? (c[1] ?? c.y) : (c[0] ?? c.x)) - lo) / len;
  };
  const atEnd = (I) => (I.length ? I.some((i) => pos(i) <= END || pos(i) >= 1 - END) : null);
  return {
    kitchenLiving: touch(kitchen, living),
    entranceLiving: touch(entrance, living),
    entranceKitchen: touch(entrance, kitchen),
    bathKitchen: touch(pubBaths, kitchen),
    bathEntrance: touch(pubBaths, entrance),
    bathLiving: touch(pubBaths, living),
    multiKitchen: multi.length ? touch(multi, kitchen) : null,
    bedEntrance: touch(beds, entrance),
    backBedKitchen: touch(others, kitchen),
    bedLiving: touch(beds, living),
    bedBed: beds.length >= 2 ? beds.some((a) => beds.some((b) => a !== b && adj.get(a).has(b))) : null,
    masterKitchen: master === undefined ? null : touch([master], kitchen),
    bedOverBath: touch(others, pubBaths),
    masterEnd: master === undefined ? null : atEnd([master]),
    entranceEnd: atEnd(entrance),
    kitchenEnd: atEnd(kitchen),
    otherBedEnd: atEnd(others),
    livingOffCenter: living.length ? Math.abs(pos(living[0]) - 0.5) : null,
  };
}

// ---- (가) 실제 도면 한 장: 현관 하나 = 세대 하나(unitRule 'entrance') ----
// 관계는 거실이 있어야 정의되므로 거실이 있는 세대만 측정하고, 빠진 수는 census로 센다.
export function measureDrawing(dataDir, file) {
  const a = analyze(JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')), 'SPA', { unitRule: 'entrance' });
  const census = { drawings: 1, noEntranceDrawings: a.units.length ? 0 : 1, units: a.units.length, noLiving: 0 };
  const rows = [];
  for (const u of a.units) {
    const types = u.nodes.filter((n) => !n.duct).map((n) => n.type);
    if (!types.includes('거실')) {
      census.noLiving++;
      continue;
    }
    rows.push({
      drawing: file,
      unit: u.index,
      bedrooms: types.filter((t) => t === '침실').length,
      // 축척 보정 면적(기준 도면 px²): 도면마다 1px의 실제 길이가 달라 scale²로 나눈다
      areaPx: Math.round(u.totalArea / (a.scale * a.scale)),
      rel: relations(a, u),
      sx: Object.fromEntries(SX.map((k) => [k, u.features[k] ?? null])),
    });
  }
  return { rows, census };
}

// ---- (나)(다) 생성 평면: 조건 20개 × 템플릿, 무작위 방 순서(보정 스크립트와 같은 표집), 기본 치수 ----
const targets = { living: 0.239, kitchen: 0.1576, master: 0.1254, other: 0.0877, bath: 0.032, entrance: 0.0389, dress: 0.0499, multi: 0.0303 };
const PREFS = [[], ['livingCentral', 'bath'], ['privacy', 'quiet'], ['kitchenLink', 'entryNear'], ['spacious', 'sunny', 'storage']];
const SIZES = [[59, 2], [59, 3], [74, 3], [84, 3], [84, 4], [101, 3], [101, 4], [114, 4]];
export const specs = Array.from({ length: 20 }, (_, i) => {
  const [area, bedrooms] = SIZES[i % SIZES.length];
  return { area, bedrooms, baths: 2, dress: true, multi: i % 3 === 0, outdoorUnit: true, balcony: i % 4 !== 3, targets, prefs: PREFS[i % PREFS.length] };
});
const shuffle = (a, r) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** 조건 하나(si)의 생성 평면 측정. 난수 씨앗이 조건·템플릿별로 고정이라 어느 스레드에서 돌려도 같은 결과. */
export function measureCondition(si, samples) {
  const spec = specs[si];
  const out = [];
  const kmax = frontBedCount(spec);
  for (const k of [...new Set([kmax, kmax - 1])].filter((x) => x >= 0)) {
    const q = buildQubo(spec, { frontBeds: k, weights: 'hand', syntax: false });
    const r = rng(5000 + si * 10 + k);
    const seen = new Set();
    for (let i = 0; i < samples; i++) {
      const d = decode(q, encode(q, shuffle(q.bands.front.rooms, r), shuffle(q.bands.back.rooms, r)));
      const key = `${d.front}|${d.back}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const layout = buildLayout(spec, { ...defaultParams(spec), frontOrder: d.front, backOrder: d.back });
      let a;
      try {
        a = analyze(toLabel(layout), 'SPA');
      } catch {
        continue;
      }
      if (a.units.length !== 1) continue;
      out.push({ group: `${si}/${k}`, rel: relations(a, a.units[0]), sx: Object.fromEntries(SX.map((kk) => [kk, a.units[0].features[kk] ?? null])) });
    }
  }
  return out;
}

// 도면 글자(OCR 결과)를 실 종류로 바꾼다. 브라우저와 Node 테스트가 함께 쓴다.
// 사전은 AI 허브 OCR 라벨 674개에 나온 실 이름(침실·발코니·욕실·실외기실·거실·현관·드레스룸·주방/식당 …)에서 만들었다.

/** 도면 실 이름 → 평가 모델의 실 종류. 긴 이름을 먼저 비교한다. */
export const ROOM_NAME_DICTIONARY = [
  ['엘리베이터홀', '엘리베이터홀'],
  ['ELEV홀', '엘리베이터홀'],
  ['승강기홀', '엘리베이터홀'],
  ['주방식당', '주방'],
  ['주방', '주방'],
  ['식당', '주방'],
  ['키친', '주방'],
  ['부엌', '주방'],
  ['거실', '거실'],
  ['침실', '침실'],
  ['안방', '침실'],
  ['서재', '침실'],
  ['부부욕실', '화장실'],
  ['가족욕실', '화장실'],
  ['공용욕실', '화장실'],
  ['욕실', '화장실'],
  ['화장실', '화장실'],
  ['파우더룸', '드레스룸'],
  ['드레스룸', '드레스룸'],
  ['드레스', '드레스룸'],
  ['WIC', '드레스룸'],
  ['현관', '현관'],
  ['발코니', '발코니'],
  ['테라스', '발코니'],
  ['실외기실', '실외기실'],
  ['다용도실', '다목적공간'],
  ['팬트리', '다목적공간'],
  ['펜트리', '다목적공간'],
  ['알파룸', '다목적공간'],
  ['맘스오피스', '다목적공간'],
  ['계절수납', '다목적공간'],
  ['대피공간', '기타'],
  ['복도', '기타'],
  ['계단실', '계단실'],
];

/** 한 영역에 이름이 여럿이면(트인 거실·주방 등) 이 순서로 고른다. */
export const TYPE_PRIORITY = ['거실', '침실', '주방', '화장실', '현관', '드레스룸', '다목적공간', '실외기실', '발코니', '엘리베이터홀', '계단실', '기타'];

/** 한글 음절을 자모로 나눈다(초성·중성·종성). 그 밖의 글자는 그대로 둔다. */
export function toJamo(text) {
  const out = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) - 0xac00;
    if (c >= 0 && c < 11172) {
      out.push(`c${Math.floor(c / 588)}`, `v${Math.floor((c % 588) / 28)}`);
      if (c % 28) out.push(`j${c % 28}`);
    } else out.push(ch);
  }
  return out;
}

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** 자모 편집 거리 기반 유사도(0~1). */
export function similarity(a, b) {
  const x = toJamo(a);
  const y = toJamo(b);
  const n = Math.max(x.length, y.length);
  return n ? 1 - levenshtein(x, y) / n : 0;
}

/** 글자만 남긴다: 한글과 영문(ELEV, WIC). 숫자·괄호·공백·구분선은 버린다. */
export const cleanText = (text) => String(text).toUpperCase().replace(/[^가-힣A-Z]/g, '');

/**
 * 글자 한 줄을 실 종류로 바꾼다.
 * 사전 이름이 그대로 들어 있으면 그것을, 아니면 길이가 비슷한 이름 중 자모 유사도가 minScore 이상인 것을 고른다.
 * 반환: { type, name, score } 또는 null.
 */
export function matchRoomName(text, { minScore = 0.65 } = {}) {
  const s = cleanText(text);
  if (s.length < 2) return null;
  // 긴 설명문(마감재·도면 제목)에 우연히 섞인 이름은 버린다.
  const contained = ROOM_NAME_DICTIONARY.filter(([name]) => s.includes(name)).sort((a, b) => b[0].length - a[0].length)[0];
  if (contained && s.length <= contained[0].length + 2) return { type: contained[1], name: contained[0], score: 1 };
  let best = null;
  for (const [name, type] of ROOM_NAME_DICTIONARY) {
    if (Math.abs(s.length - name.length) > 1) continue;
    const score = similarity(s, name);
    // 동점이면 첫 자모(초성)가 같은 이름을 고른다("청실"은 거실보다 침실).
    const rank = score + (toJamo(s)[0] === toJamo(name)[0] ? 0.01 : 0);
    if (score >= minScore && (!best || rank > best.rank)) best = { type, name, score, rank };
  }
  if (best) delete best.rank;
  return best;
}

/**
 * 인식한 글자 줄에서 실 이름만 골라낸다(두 해상도에서 같은 자리를 읽은 이름은 하나만 남긴다).
 * lines: [{ text, bbox: {x0, y0, x1, y1} }] (처리 해상도 좌표)
 * 반환: [{ type, name, score, text, x, y, bbox }]
 */
export function namesFromText(lines) {
  const names = [];
  for (const l of lines) {
    const m = matchRoomName(l.text);
    if (!m) continue;
    names.push({ ...m, text: String(l.text).trim(), x: (l.bbox.x0 + l.bbox.x1) / 2, y: (l.bbox.y0 + l.bbox.y1) / 2, bbox: l.bbox });
  }
  // 겹치는 이름은 하나만 남긴다. 같은 종류면 중복이고, 다른 종류면 긴 이름을 더 믿는다
  // ("실외기실"의 뒷부분만 "기실"로 따로 읽힌 경우 등). 근거 = 유사도 × 이름 길이.
  const weight = (n) => n.score * n.name.length;
  const overlaps = (a, b) => {
    const m = Math.max(a.bbox.y1 - a.bbox.y0, b.bbox.y1 - b.bbox.y0) * 0.5;
    return a.bbox.x0 - m < b.bbox.x1 && b.bbox.x0 - m < a.bbox.x1 && a.bbox.y0 - m < b.bbox.y1 && b.bbox.y0 - m < a.bbox.y1;
  };
  const unique = [];
  for (const n of names.sort((a, b) => weight(b) - weight(a))) if (!unique.some((u) => overlaps(u, n))) unique.push(n);
  return unique;
}

/**
 * 실 이름을 영역 묶음에 붙여 자동 지정 씨앗을 만든다.
 * groupAt(x, y): 그 점의 영역 묶음 id(없으면 0)
 * 반환: { seeds, shared: 이름이 여럿 붙은 묶음의 이름 목록, missing: 영역이 없는 이름 }
 */
export function seedsFromNames(names, groupAt) {
  const byGroup = new Map();
  const missing = [];
  for (const n of names) {
    const g = groupAt(n.x, n.y);
    if (!g) {
      missing.push(n);
      continue;
    }
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(n);
  }
  const seeds = [];
  const shared = [];
  for (const list of byGroup.values()) {
    // 확실히 읽은 이름(유사도 0.8 이상)을 먼저, 그 안에서는 TYPE_PRIORITY 순서로 고른다.
    const sure = (n) => (n.score >= 0.8 ? 0 : 1);
    list.sort((a, b) => sure(a) - sure(b) || TYPE_PRIORITY.indexOf(a.type) - TYPE_PRIORITY.indexOf(b.type));
    seeds.push({ x: list[0].x, y: list[0].y, type: list[0].type, auto: true });
    if (new Set(list.map((n) => n.type)).size > 1) shared.push([...new Set(list.map((n) => n.type))]);
  }
  return { seeds, shared, missing };
}

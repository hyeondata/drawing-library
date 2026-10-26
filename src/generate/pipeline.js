// 생성 과정의 단계마다 "어떤 방식으로 정하는가"를 한곳에 정의한다(모든 탭이 같은 구분과 같은 배지를 쓰도록).
import { basisHtml, lit, data, assume } from './gen-rules.js';

// 방식: rule(정해진 규칙·식) · qubo(QUBO 최적화) · search(탐색: 조금씩 바꿔 점수가 오르면 채택) · sa(담금질 최적화, QUBO 아님) · eval(평가 모델로 채점·비교)

export const KINDS = {
  rule: {
    label: '규칙',
    desc: '정해진 식·규칙으로 바로 계산합니다. 같은 입력이면 언제나 같은 결과입니다. 최적화가 아닙니다.',
    what: '정해진 식이나 "이럴 때는 이렇게 한다"는 규칙을 그대로 적용해 값을 <b>한 번에 계산</b>합니다. 여러 후보를 만들어 비교하거나 더 좋은 답을 찾지 않습니다.',
    example: '방 폭 나누기 w = m + (W − Σm)·(d − m)/Σ(d − m), "침실 문은 복도 → 거실 → 현관 쪽 순으로 단다", "부부욕실은 안방 뒤에 붙인다"',
    random: '없음 — 같은 입력이면 언제나 같은 결과',
    why: '건축 상식·치수 기준처럼 답이 정해진 것, 그리고 다른 단계가 정한 값을 실제 도면(벽·문·창)으로 바꾸는 계산',
    analogy: '레시피대로 요리하기',
    basis: [lit('seo2007', '판상형 아파트의 띠 구성 문법(앞 거실·침실, 뒤 서비스)'), lit('upasani2020', '최소 폭·종횡비를 지키는 치수 규칙'), assume('개별 치수·비율 값은 통상 치수에서 정함(규칙 표에서 항목별로 표시)')],
  },
  qubo: {
    label: 'QUBO 최적화',
    desc: '0/1 변수의 에너지 식(QUBO)을 만들고 풀이기로 에너지가 가장 낮은 해를 찾습니다.',
    what: '결정을 0/1 변수로 쓰고(x(실, 칸) = 1이면 그 실이 그 칸에 감), 좋은 배치일수록 낮아지는 <b>에너지 식(이차식)</b>을 만든 뒤, 풀이기로 에너지가 <b>가장 낮은 조합</b>을 찾습니다. 규칙(실마다 칸 하나)은 어기면 큰 벌점이 붙는 항으로 넣습니다.',
    example: '방 순서: 주방–거실 맞닿음은 보상, 침실–현관 맞닿음은 감점, 같은 칸에 실 둘은 벌점',
    random: '풀이기에 따라 있음(같은 시드면 같은 결과). 전수 열거·분기한정은 없음',
    why: '경우의 수가 많은 이산 결정(어느 실을 어느 칸에)이고, 양자 어닐러(D-Wave)에 그대로 보낼 수 있는 형식이기 때문',
    analogy: '퍼즐 조각을 놓는 모든 방법 가운데 벌점 합이 가장 작은 방법 찾기',
    basis: [lit('lucas2014', '배정 문제를 이징·QUBO로, 제약은 원-핫 벌점으로'), lit('glover2019', 'QUBO 정식화 튜토리얼(배정 문제 형식)'), lit('ayodele2022', '순열 QUBO의 벌점 크기'), lit('glover2010', '이 사이트 기본 풀이기 계열(tabu)의 대표 알고리즘 D²TS'), lit('dunning2018', '같은 예산으로 풀이기를 공정하게 비교')],
  },
  search: {
    label: '국소 탐색',
    desc: '값을 무작위로 조금씩 바꿔 평면을 다시 만들고, 평가 점수 J가 오르면 채택합니다. QUBO가 아닙니다.',
    what: '지금 값에서 출발해 <b>무작위로 조금 바꾼 안</b>을 만들어 평면을 다시 그리고 <b>평가 점수 J로 채점</b>해 보아, 점수가 오르면 그 값으로 옮겨 가는 것을 정해진 횟수만큼 되풀이합니다(국소 탐색). 식을 풀어 최적을 구하는 대신, 평가 모델에게 직접 물어 가며 고칩니다. 나빠지는 쪽으로는 가지 않습니다.',
    example: '치수 다듬기: 깊이 D ×0.94~1.06, 앞 띠 비율 f ±0.04, 작은방 폭 w ±0.2m 중 하나를 바꾸기를 30번',
    random: '있음(어떤 값을 얼마나 바꿀지 무작위, 시드로 고정하면 같은 결과)',
    why: '깊이·폭 같은 연속값과 평가 모델 점수(통합도 등 경로 계산 포함)는 QUBO의 이차식으로 쓸 수 없기 때문',
    analogy: '간을 보며 소금을 조금씩 더하기 — 맛이 나아지면 그대로 두고, 아니면 되돌림',
    basis: [lit('michalek2002', '배치 최적화에서 무작위 탐색 + 국소 탐색 혼합이 SA·GA 단독보다 나음'), lit('merrell2010', '주거 평면 생성에서 점수를 보며 고쳐 가는 확률 탐색')],
  },
  sa: {
    label: '담금질(SA)',
    desc: '칸 배정의 에너지를 담금질(Simulated Annealing)로 줄입니다. QUBO가 아닙니다.',
    what: '배치를 조금 바꾸는 이동을 제안해, 에너지가 내려가면 받아들이고 <b>올라가도 "온도"에 따라 가끔 받아들이며</b>, 온도를 천천히 낮춰 가며 되풀이합니다. 탐색과 비슷하지만 나빠지는 이동도 가끔 받아들여 막다른 배치에서 빠져나올 수 있습니다. 점수 대신 직접 정의한 에너지 식을 줄입니다.',
    example: '자유형: 벽 한 줄을 한 칸 미는 이동, 받아들일 확률 e^(−ΔE/T), 온도 1.5 → 0.005',
    random: '있음(시드로 고정하면 같은 결과)',
    why: 'ㄱ자·ㄷ자 실은 "칸이 서로 이어져야 한다"는 조건이 필요해 QUBO 이차식으로 쓰기 어렵기 때문',
    analogy: '쇠를 뜨겁게 했다가 천천히 식혀 단단하게 만드는 담금질 — 처음엔 많이 흔들고 나중엔 조금만',
    basis: [lit('kirk1983', '담금질(Simulated Annealing) 원전: 받아들일 확률 e^(−ΔE/T)'), lit('lopes2010', '처음 배치를 만드는 제약 성장법'), lit('merrell2010', '주거 평면의 메트로폴리스 탐색')],
  },
  eval: {
    label: '평가',
    desc: '평가 모델로 채점하고 점수로 후보를 고릅니다.',
    what: '이미 만들어진 평면을 <b>채점</b>합니다: 실제 아파트 35세대와 얼마나 닮았는지(평가 모델) + 목표 면적에 얼마나 맞는지 + 고른 선호를 얼마나 만족하는지 − 감점. 이 점수 J로 후보를 비교해 고릅니다. 평면 자체를 바꾸지는 않습니다.',
    example: 'J = 0.45·모델 점수 + 0.25·면적 부합 + 0.30·선호 − 40·[무효] − 15·(좁은 실 + 문 동선 문제)',
    random: '없음',
    why: 'QUBO 에너지는 평가의 대리(근사)라서, 마지막 판단은 원래 목표인 평가 점수로 해야 하기 때문',
    analogy: '심사위원이 완성된 작품에 점수 매기기',
    basis: [data('실제 아파트 35세대(AI 허브 라벨)의 지표 분포와 비교하는 평가 모델'), lit('hillier1984', '공간구문 지표(통합도·깊이)'), lit('byun2016', '한국 아파트 거실 중심 유형의 통합도 비'), lit('zeng2025', '생성 평면 평가 지표(안방 우위·실 형태)'), lit('jin2011', 'QUBO 에너지는 평가의 대리 → 마지막 판단은 원래 평가로')],
  },
};

/** 배지 HTML(서버·브라우저 공용). */
export const badge = (kind) => `<span class="pl-badge pl-${kind}" title="${KINDS[kind].desc}">${KINDS[kind].label}</span>`;
export const badges = (kinds) => kinds.map(badge).join(' ');

/** QUBO로 바꿀 수 있나: done(이미 QUBO) · other(가능, QUBO 도면 생성 탭에 구현) · possible(가능, 미구현) · no(불가) · na(최적화 대상 아님) */
export function quboHtml(q, base = '/') {
  if (!q) return '';
  const T = { done: ['QUBO 사용', 'q-done'], other: ['가능 — QUBO 도면 생성 탭에 구현', 'q-other'], possible: ['가능(미구현)', 'q-pos'], no: ['불가', 'q-no'], na: ['대상 아님', 'q-na'] }[q.s];
  const lab = q.s === 'other' ? `<a href="${base}qubo-gen/">${T[0]}</a>` : T[0];
  return `<span class="q-chip ${T[1]}">${lab}</span>${q.why ? `<small class="q-why">${q.why}</small>` : ''}`;
}

/** 방식 설명표(HTML). kinds를 주면 그 방식만. */
export function kindsTable(kinds = Object.keys(KINDS)) {
  const rows = kinds
    .map((k) => {
      const v = KINDS[k];
      return `<tr><td>${badge(k)}</td><td>${v.what}</td><td>${v.example}</td><td>${v.random}</td><td>${v.why}</td><td>${v.analogy}</td><td>${basisHtml(v.basis || [])}</td></tr>`;
    })
    .join('');
  return `<div class="mt-scroll"><table class="gen-table pl-kinds"><thead><tr><th>방식</th><th>무엇을 하나</th><th>이 사이트의 예</th><th>무작위성</th><th>왜 이 방식을 썼나</th><th>비유</th><th>근거</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** 선택형(도면 생성 탭). */
export const SELECT_STAGES = [
  { what: '실 목록과 목표 면적', kinds: ['rule'], algo: '닫힌 식(직접 계산)', q: { s: 'na', why: '고를 것이 없는 계산이라 최적화 대상이 아님' }, how: '면적 비율 × 전용면적 → 최소 면적으로 올림 → 합을 전용면적에 맞춤', code: 'layout.js programOf' },
  { what: '앞 띠 작은방 수(템플릿)', kinds: ['rule', 'eval'], algo: '조건식 + 후보 2개 비교(argmax)', q: { s: 'no', why: '고르는 기준이 평가 점수 J(경로·분포 계산)라 이차식이 아님' }, how: '최소 폭 합(3.0 + 3.6 + 2.6k)이 띠 폭에 들어가는 k를 식으로 계산. k개·k−1개 두 템플릿을 모두 풀고 마지막에 점수로 고름', code: 'qubo.js frontBedCount, compare.js templates' },
  { what: '방 순서: 어느 실이 띠의 몇 번째 칸에 가나', kinds: ['qubo'], algo: 'QUBO + 풀이기 11종(D²TS·Tabu·SA·PT·SQA·SB·CP·전수 열거 등)', q: { s: 'done', why: '' }, how: 'x(실, 칸) 0/1 변수 + 인접 보상·감점 + 원-핫 벌점으로 만든 QUBO를 고른 풀이기로 풂(템플릿마다 한 번). 좋은 해 최대 4개를 다음 단계로 넘김', code: 'qubo.js buildQubo, solvers.js', key: true },
  { what: 'QUBO 해 → 실 순서', kinds: ['rule'], algo: '탐욕 복구(greedy repair)', q: { s: 'na', why: 'QUBO 해를 읽는 단계라 최적화 대상이 아님' }, how: '제약을 어긴 해는 켜진 변수부터 빈 칸에 채우는 탐욕 복구, 안방이 가운데면 가까운 끝으로 옮김', code: 'qubo.js decode' },
  { what: '치수 변수: 깊이 D·앞 띠 비율 f·작은방 폭 w·안방 깊이 g·면적 배수', kinds: ['search'], algo: '확률적 언덕 오르기(stochastic hill climbing, 30회)', q: { s: 'no', why: '연속값이고 목적(평가 점수 J)이 이차식이 아님. 값을 몇 단계로 나누고 J를 이차식으로 근사하면 QUBO로 쓸 수는 있으나 J와 어긋남' }, how: '기본값에서 출발해 30번, 변수 하나를 조금 바꿔 평면을 다시 만들고 J가 오르면 채택(순서는 그대로)', code: 'compare.js realize · tweak' },
  { what: '방의 폭·깊이(직사각형 크기)', kinds: ['rule'], algo: '비례 배분 식(닫힌 식)', q: { s: 'na', why: '치수 변수가 정해지면 바로 계산됨' }, how: '위 치수 변수가 주어지면 식으로 계산: 띠 폭을 최소 폭 먼저 주고 남는 폭은 (원하는 폭 − 최소 폭)에 비례해 나눔', code: 'layout.js buildLayout · allocate' },
  { what: '복도·부속실(부부욕실·드레스룸)', kinds: ['rule'], algo: '조건 분기 규칙(if-then)', q: { s: 'na', why: '치수가 정해지면 위치가 바로 정해짐' }, how: '작은방이 거실보다 얕으면 그 뒤를 복도로, 부속실은 안방 뒤에 붙임', code: 'layout.js buildLayout' },
  { what: '문·개구부·창·발코니 문', kinds: ['rule'], algo: '우선순위 탐욕 선택(greedy)', q: { s: 'other', why: '실마다 문 하나(원-핫) + 이웃 실 비용으로 쓸 수 있음' }, how: '현관문 1개, 공용 공간끼리는 트기, 방마다 우선순위(복도 → 거실 → 현관 → 주방) 쪽에 문 하나, 가장 긴 바깥 벽에 창', code: 'openings.js placeOpenings' },
  { what: '설비(변기·세면대·싱크대 등)', kinds: ['rule'], algo: '배치 규칙(if-then)', q: { s: 'possible', why: '벽 칸 선택 원-핫으로 쓸 수 있으나 구현하지 않음' }, how: '문에서 먼 벽을 따라 놓음', code: 'fixtures.js placeFixtures' },
  { what: '채점', kinds: ['eval'], algo: '평가 모델: 실제 35세대 분포와의 거리 + 공간구문 그래프 계산 + 감점', q: { s: 'no', why: '그래프 경로(통합도·깊이)와 분포 비교는 이차식이 아님. QUBO 에너지는 이것의 대리' }, how: 'J = 0.45·모델 + 0.25·면적 부합 + 0.30·선호 − 감점. 문을 단 뒤 현관에서 못 가는 방·침실을 지나야 하는 방도 감점', code: 'optimize.js scoreLayout' },
  { what: '최종안 고르기', kinds: ['eval'], algo: '최댓값 선택(argmax)', q: { s: 'na', why: '후보 몇 개의 점수 비교' }, how: '템플릿 × 해 후보(최대 8개) 가운데 J가 가장 높은 평면', code: 'compare.js compareAlgorithms' },
];

/** 기존: 모델 직접 탐색(QUBO 없이). */
export const MODEL_STAGES = [
  { what: '방 순서와 치수 변수를 함께', kinds: ['search'], algo: '무작위 탐색 400회 + 확률적 언덕 오르기 400회', q: { s: 'no', why: '평가 점수 J를 그대로 쓰는 방식이라 QUBO가 아님(비교 기준)' }, how: '무작위로 400개 만들어 채점한 뒤, 좋은 4개에서 조금씩 바꿔 400번 더(J가 오르면 채택). QUBO를 쓰지 않음', code: 'optimize.js optimize' },
];

/** 자유형 평면 탭. */
export const FREE_STAGES = [
  { what: '외곽·고정 실(현관·발코니·실외기실)', kinds: ['rule'], algo: '격자화(rasterize)', q: { s: 'na', why: '입력 준비' }, how: '기준 세대 또는 사용자가 고른 외곽을 0.3m 칸으로 나누고, 고정 실은 제자리에 둠', code: 'engine.js buildProblem · setupMask' },
  { what: '실마다 목표 칸 수', kinds: ['rule'], algo: '닫힌 식(비례)', q: { s: 'na', why: '고를 것이 없는 계산' }, how: '기준 세대에서의 면적 비율 × 움직일 수 있는 칸 수', code: 'engine.js buildProblem' },
  { what: '처음 배치', kinds: ['rule'], algo: '제약 성장(constrained growth, Lopes 2010)', q: { s: 'na', why: '담금질의 출발점을 만드는 휴리스틱' }, how: '제약 성장: 씨앗(위치만 무작위로 조금 옮김) → 모자란 실부터 직사각형으로 → 막히면 ㄱ자로', code: 'engine.js initial' },
  { what: '칸 배정: 실의 모양과 크기', kinds: ['sa'], algo: '담금질(Simulated Annealing, 메트로폴리스 규칙)', q: { s: 'other', why: '"실의 칸이 이어져야 함"은 이차식으로 정확히 못 씀 → 근사 항으로 QUBO화' }, how: '에너지(면적·모양·인접·창·동선·공간구문)를 벽 밀기·칸 넘기기 이동과 담금질로 줄임', code: 'engine.js anneal · energy', key: true },
  { what: '문·개구부·창', kinds: ['rule'], algo: '우선순위 탐욕 선택(greedy)', q: { s: 'other', why: '원-핫 + 비용 항으로 쓸 수 있음' }, how: '선택형과 같은 원칙의 규칙으로 붙임(담금질 에너지는 "문을 낼 수 있는 맞닿음"만 확보)', code: 'engine.js openings' },
  { what: '진단과 여러 안', kinds: ['eval'], algo: '요약 지표 계산 + 시드별 반복', q: { s: 'na', why: '평가 단계' }, how: '실별 면적·모양·연결·공간구문을 요약. 후보 개수만큼 시드만 바꿔 처음 배치 + 담금질을 반복', code: 'engine.js summarize, freeform-worker.js' },
];

/**
 * 도면 생성 탭 "생성 과정" 8단계: 단계마다 방식(배지), 그 규칙·알고리즘이 어떻게 이루어지는지, 실행되는 코드 위치.
 * code: [파일, 함수 이름] 또는 [파일, 시작 문자열, 끝 문자열] — index.astro가 빌드 때 실제 코드를 잘라 붙인다.
 */
export const GEN_STAGES = [
  {
    algo: '닫힌 식(W = A ÷ D) + 확률적 언덕 오르기(D)', q: { s: 'no', why: '깊이 D는 연속값이고 기준이 평가 점수 J라 이차식이 아님' },
    kinds: ['rule', 'search'],
    method: ['<b>규칙(식)</b>: 폭 W = 전용면적 A ÷ 깊이 D. 사각형의 넓이가 언제나 A가 되도록 폭을 식으로 정합니다.', '<b>탐색</b>: 깊이 D 자체는 고정값이 아닙니다. 기본값 7.4 × (A/84)<sup>0.3</sup>m에서 출발해 "치수 다듬기" 30번 동안 ×0.94~1.06씩 바꿔 보고 점수 J가 오르면 채택합니다(범위 7.0~9.8 × (A/84)<sup>0.3</sup>m).'],
    code: [['src/generate/layout.js', '// 면적 배수는 실 사이 비율만 바꾸고', 'const Db = D - Df;'], ['src/generate/compare.js', 'tweak']],
  },
  {
    algo: '닫힌 식 + 후보 2개 비교(argmax)', q: { s: 'no', why: '템플릿을 고르는 기준이 평가 점수 J라 이차식이 아님' },
    kinds: ['rule', 'search', 'eval'],
    method: ['<b>규칙(식)</b>: 앞 띠 깊이 = D × f, 뒤 띠 깊이 = D − D×f. 앞 띠에 둘 작은방 수 k는 최소 폭 합 3.0 + 3.6 + 2.6k가 띠 폭에 들어가는 가장 큰 값입니다.', '<b>탐색</b>: 앞 띠 비율 f는 다듬기에서 ±0.04씩 바꿔 봅니다(0.48~0.66).', '<b>평가</b>: k개와 k−1개 두 템플릿을 모두 풀고, 마지막에 점수로 더 좋은 쪽을 고릅니다.'],
    code: [['src/generate/qubo.js', 'frontBedCount']],
  },
  {
    algo: 'QUBO + 고른 풀이기', modelAlgo: '무작위 탐색 + 확률적 언덕 오르기', q: { s: 'done', why: '' }, modelQ: { s: 'no', why: '평가 점수 J를 그대로 쓰는 비교 기준이라 QUBO가 아님' },
    kinds: ['qubo'],
    modelKinds: ['search'],
    method: ['<b>QUBO 최적화</b> — 이 단계만 QUBO입니다. 변수 x(실, 칸) = 1이면 그 실이 그 칸에 갑니다.', 'E(x) = Σ<sub>t</sub> w<sub>t</sub>·b<sub>t</sub>·φ<sub>t</sub>(x) + P·Σ<sub>묶음</sub>(Σx − 1)²: 앞의 합은 실 사이 관계(예: 주방–거실 맞닿음)의 보상·감점, 뒤의 합은 "실마다 칸 하나, 칸마다 실 하나"를 어기면 받는 벌점입니다.', '고른 풀이기가 이 에너지를 가장 낮게 만드는 x를 찾고(템플릿마다 한 번), 에너지가 낮은 해 최대 4개를 실 순서로 바꿔 다음 단계로 넘깁니다. 제약을 어긴 해는 규칙으로 복구합니다.', '위 행렬의 부부욕실·드레스룸은 QUBO 변수가 아닙니다. 안방 뒤에 붙이는 <b>규칙</b>(5단계)으로 놓입니다.', '단계별 식과 숫자: <a href="{base}qubo-step/">QUBO 따라가기</a>'],
    modelMethod: ['<b>탐색</b> — 이 안은 "기존: 모델 직접 탐색"이라 QUBO를 쓰지 않았습니다. 실 순서와 치수를 무작위로 400번 뽑아 채점하고, 좋은 4개에서 조금씩 바꿔 400번 더 찾았습니다(J가 오르면 채택).', '부부욕실·드레스룸은 안방 뒤에 붙이는 <b>규칙</b>(5단계)으로 놓입니다.'],
    code: [['src/generate/qubo.js', 'buildQubo'], ['src/generate/qubo.js', 'decode']],
    modelCode: [['src/generate/optimize.js', 'optimize']],
  },
  {
    algo: '비례 배분 식 + 확률적 언덕 오르기(w·g·면적 배수)', q: { s: 'no', why: '연속값이고 기준이 평가 점수 J라 이차식이 아님' },
    kinds: ['rule', 'search'],
    method: ['<b>규칙(식)</b>: 띠 폭 W를 실들이 나눠 가집니다. w<sub>i</sub> = m<sub>i</sub> + (W − Σm) · max(0, d<sub>i</sub> − m<sub>i</sub>) / Σ max(0, d<sub>j</sub> − m<sub>j</sub>). m = 최소 폭, d = 실 면적 ÷ 깊이(원하는 폭). 최소 폭 합이 W보다 크면 최소 폭에 비례해 모두 줄입니다(좁은 실 감점).', '<b>탐색</b>: 작은방 폭 w(±0.2m), 안방 깊이 비율 g(±0.08), 실별 면적 배수(×0.96~1.04)는 다듬기 30번에서 바꿔 봅니다. 이 값들이 정해지면 폭은 위 식으로 바로 나옵니다.'],
    code: [['src/generate/layout.js', 'allocate'], ['src/generate/compare.js', 'realize']],
  },
  {
    algo: '조건 분기 규칙(if-then)', q: { s: 'na', why: '치수가 정해지면 위치가 바로 정해짐' },
    kinds: ['rule'],
    method: ['<b>규칙</b>: 작은방 깊이 = 면적 ÷ 작은방 폭. 앞 띠보다 0.4m 이상 얕으면 그 뒤를 복도로 쓰고(복도 폭이 1.1m보다 좁아지면 1.1m를 확보), 0.4m 미만이면 앞 띠 깊이에 맞춥니다.', '<b>규칙</b>: 안방 깊이 = 앞 띠 깊이 × g(0.6m 이상 남을 때만), 그 뒤에 부부욕실·드레스룸을 붙입니다.'],
    code: [['src/generate/layout.js', '// 작은방은 폭(bedWidth)을 먼저 정하고', 'const depthOf']],
  },
  {
    algo: '우선순위 탐욕 선택(greedy)', q: { s: 'other', why: '실마다 문 하나(원-핫) + 이웃 실 비용으로 쓸 수 있음' },
    kinds: ['rule'],
    method: ['<b>규칙</b>(최적화하지 않음): ① 현관의 가장 긴 바깥 벽 가운데에 현관문 1.0m. ② 공용 공간(현관·거실·주방·복도)끼리 0.8m 넘게 맞닿으면 벽 없이 틈(개구부, 최대 1.6m). ③ 나머지 실마다 문 하나 — 침실·욕실은 복도 → 거실 → 현관 → 주방 순으로 먼저 맞닿은 쪽, 부부욕실·드레스룸은 안방 쪽, 그중 가장 길게 맞닿은 벽의 모서리에서 0.15m 띄워 문 폭(침실 0.9, 욕실 0.8m). 침실은 다른 침실이나 부속실을 거쳐 들어가게 하지 않습니다(공용 공간에 못 닿으면 문을 내지 않고 감점).', '문을 단 뒤 문·개구부로 이어진 그래프(발코니 문은 제외)에서 현관부터 못 가는 실, 침실을 지나야 하는 실을 셉니다. 이 수는 점수 J에서 하나에 15점씩 빠지므로, 문을 제대로 낼 수 없는 평면은 다듬기·후보 고르기에서 떨어집니다.'],
    code: [['src/generate/openings.js', '// 1. 현관 바깥문', '// 4. 발코니']],
  },
  {
    algo: '규칙(가장 긴 바깥 벽 가운데)', q: { s: 'other', why: '창 개수·이어짐 항으로 쓸 수 있음' },
    kinds: ['rule'],
    method: ['<b>규칙</b>: 발코니와 맞닿은 거실·침실·주방에는 맞닿은 길이의 75% 미닫이 창(발코니 문), 발코니 바깥 벽에는 85% 창.', '<b>규칙</b>: 거실·침실·주방·욕실은 가장 긴 바깥 벽 가운데에 창(거실 70%, 침실 55%, 주방 45%, 욕실 35% 길이).'],
    code: [['src/generate/openings.js', '// 4. 발코니', "openings.push({ kind: 'window', ...s, to: room.key });"]],
  },
  {
    algo: '배치 규칙(if-then)', q: { s: 'possible', why: '벽 칸 선택 원-핫으로 쓸 수 있으나 구현하지 않음' },
    kinds: ['rule'],
    method: ['<b>규칙</b>: 욕실은 문에서 먼 벽을 따라 변기·세면대(공용욕실은 욕조), 주방은 거실 맞은편 벽에 싱크대·가스레인지를 놓습니다.'],
    code: [['src/generate/fixtures.js', 'placeFixtures']],
  },
];

/** QUBO 도면 생성 탭: 규칙으로 하던 것까지 QUBO 항으로. */
export const QG_STAGES = [
  { what: '격자와 목표 칸 수', kinds: ['rule'], algo: '격자화 + 닫힌 식', q: { s: 'na', why: 'QUBO에 넣을 입력 준비' }, how: '전용면적을 1.2m(또는 0.9m) 칸 격자로 바꾸고, 실 프로그램(+ 복도 7%)에서 목표 칸 수를 계산. QUBO에 넣을 입력 준비', code: 'qubogen/model.js setupGrid' },
  { what: '칸마다 어느 실인지: 방 순서·크기·모양·복도·부속실 위치', kinds: ['qubo'], algo: 'QUBO(단계 A) + 풀이기', q: { s: 'done', why: '' }, how: '단계 A QUBO: 칸마다 실 하나(벌점) + 면적 + 둘레 + 앞·뒤 띠 + 창 + 맞닿음·떨어짐 + 현관 위치 + 안방 끝 + 거실 가운데', code: 'qubogen/model.js buildStageA', key: true },
  { what: '문·개구부·현관문·창·발코니 문', kinds: ['qubo'], algo: 'QUBO(단계 B) + 풀이기', q: { s: 'done', why: '' }, how: '단계 B QUBO: 실마다 문 하나(벌점) + 이웃 실 종류 비용 + 문끼리 겹침 감점 + 창 개수·이어짐', code: 'qubogen/model.js buildStageB', key: true },
  { what: '점검과 고르기', kinds: ['eval'], algo: '그래프 탐색(BFS 연결·도달 검사) + argmax', q: { s: 'no', why: '연결·도달은 경로 조건이라 이차식이 아님' }, how: 'QUBO로 정확히 못 쓰는 규칙(실의 연결, 현관에서 가는 길, 최소 폭)을 풀고 나서 점검하고, 후보 중 점검 점수가 가장 높은 안', code: 'qubogen/model.js evaluate' },
];

// 평가 모델 설정. 팀원이 근거 논문에 맞춰 바꿀 값은 모두 여기에 둔다.
// 바꾸면 `npm run baseline`으로 기준 분포를 다시 만들고 버전을 올린다.

export const MODEL_VERSION = '0.1.0';

/** 판정 기준값(픽셀). Sample 80건의 실측 분포에서 정했다(README 참고). */
export const THRESHOLDS = {
  // 실 사이 간격은 대부분 25px 이하(벽 두께). 32px 이내면 같은 벽을 공유한다고 본다.
  adjacencyGap: 32,
  // 발코니·실외기실·다목적공간과의 경계는 외벽이라 더 두껍다(실측 37~48px).
  exteriorGap: 50,
  // 문 폭보다 짧게 스치는 접촉은 인접으로 보지 않는다.
  minContact: 40,
  // 개구부(문·창)가 벽에서 이 거리 안에 있어야 벽에 붙어 있다고 본다. 실측 최대 10px.
  openingToWall: 12,
  // 문과 창이 서로 이 비율 이상 겹치면 모순으로 본다.
  openingOverlap: 0.2,
  // 설비 짝 거리. 실측에서 거의 모든 짝이 300px 이내.
  fixturePair: 300,
};

/** 공용 공간: 세대 분리 시 제외하고 공용부로만 표시한다. */
export const COMMON_TYPES = new Set(['엘리베이터홀', '계단실', '엘리베이터']);

/** 세대 안에서 통과되면 안 되는 주요 실(침실 비통과 규칙). */
export const MAIN_TYPES = new Set(['현관', '거실', '주방', '침실', '다목적공간']);

/**
 * 영역별 가중치(합 100). 정합성은 '시공 가능한 도면인가'(회의 결정),
 * 공간구문·면적 구성은 'AI 허브 실제 도면 분포에 얼마나 가까운가'를 본다.
 */
export const WEIGHTS = {
  SPA: { syntax: 40, area: 30, rules: 30 },
  STR: { rules: 60, profile: 40 },
  OBJ: { rules: 70, profile: 30 },
};

/** 기준 분포와 비교할 때 강건 z가 이 값이면 0점, 0이면 100점(선형). */
export const Z_ZERO_SCORE = 3;

/**
 * 분포 비교 지표 정의. key는 특징 이름, label은 화면 표시명.
 * minScale: 기준 분포가 거의 한 값으로 모여 있을 때 쓰는 최소 척도(이만큼 벗어나면 z=1).
 */
export const FEATURES = {
  syntax: [
    { key: 'livingDepth', label: '현관→거실 깊이', minScale: 0.5 },
    { key: 'bedroomMeanDepth', label: '현관→침실 평균 깊이', minScale: 0.25 },
    { key: 'meanDepthFromEntrance', label: '현관 기준 평균 깊이', minScale: 0.15 },
    { key: 'meanIntegration', label: '평균 통합도(1/RRA)', minScale: 0.1 },
    { key: 'livingIntegrationPct', label: '거실 통합도 순위(0=최상위)', minScale: 0.1 },
    { key: 'ringiness', label: '순환성(고리 비율)', minScale: 0.05 },
  ],
  area: [
    { key: 'ratio_거실', label: '거실 면적비', minScale: 0.02 },
    { key: 'ratio_주방', label: '주방 면적비', minScale: 0.02 },
    { key: 'ratio_침실', label: '침실 면적비', minScale: 0.02 },
    { key: 'ratio_화장실', label: '화장실 면적비', minScale: 0.01 },
    { key: 'ratio_발코니', label: '발코니 면적비', minScale: 0.02 },
  ],
  profile: {
    STR: [
      { key: 'windowsPerDoor', label: '창/문 개수 비', minScale: 0.1 },
      { key: 'rcWallShare', label: '철근콘크리트벽 비율', minScale: 0.05 },
      { key: 'slidingWindowShare', label: '미닫이창 비율', minScale: 0.05 },
    ],
    OBJ: [
      { key: 'bathPerToilet', label: '욕조/변기 비', minScale: 0.25 },
      { key: 'toiletPerKitchen', label: '변기/싱크대 비', minScale: 0.5 },
    ],
  },
};

/** 등급 경계(점수 이상). */
export const GRADES = [
  [90, 'A'],
  [80, 'B'],
  [70, 'C'],
  [60, 'D'],
  [0, 'F'],
];

export const REFERENCES = [
  {
    id: 'hillier1984',
    text: 'Hillier, B., & Hanson, J. (1984). The Social Logic of Space. Cambridge University Press.',
    url: 'https://doi.org/10.1017/CBO9780511597237',
    usedFor: '접근 그래프, 깊이, RA·RRA(D값 정규화) 정의',
  },
  {
    id: 'ostwald2011',
    text: 'Ostwald, M. J. (2011). The Mathematics of Spatial Configuration. Nexus Network Journal, 13, 445–470.',
    url: 'https://doi.org/10.1007/s00004-011-0075-3',
    usedFor: 'Justified graph 계산 절차와 해석 범위',
  },
  {
    id: 'hku-tbd',
    text: '홍콩대 연구진 SCI 논문(회의 결정, 서지 미확정)',
    url: '',
    usedFor: '세부 평가 항목·가중치 — 서지 확정 후 이 파일에서 반영',
  },
];

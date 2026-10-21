// 평가 모델 설정. 팀원이 근거 논문에 맞춰 바꿀 값은 모두 여기에 둔다.
// 바꾸면 `npm run baseline`으로 기준 분포를 다시 만들고 버전을 올린다.

export const MODEL_VERSION = '0.2.0';

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
  // 이보다 작은 '기타' 실은 덕트·PS로 보고 공간구문 그래프에서 뺀다.
  // 침실 중앙값(약 305px 변)으로 환산하면 1px ≈ 1.1cm, 12,000px² ≈ 1.5㎡.
  ductMaxArea: 12000,
};

/** 공용 공간: 세대 분리 시 제외하고 공용부로만 표시한다. */
export const COMMON_TYPES = new Set(['엘리베이터홀', '계단실', '엘리베이터']);

/** 세대 안에서 통과되면 안 되는 주요 실(침실 비통과 규칙). */
export const MAIN_TYPES = new Set(['현관', '거실', '주방', '침실', '다목적공간']);

/**
 * 한국 아파트 거실 중심 유전형: 통합도가 높은 순서.
 * Choi et al. (2014) 한국 3침실 평균 통합도 순위(복도 제외): 거실 > 주방·식당 > 현관 > 침실 > 화장실.
 */
export const GENOTYPE_ORDER = ['거실', '주방', '현관', '침실', '화장실'];

/** 거실 통합도 순위를 셀 때 비교에서 빼는 실(복도성·외부·공용 공간). Choi et al. (2014)은 복도를 빼고 중심 공간을 정했다. */
export const LIVING_RANK_EXCLUDE = new Set(['기타', '현관', '발코니', '실외기실', '엘리베이터홀', '계단실', '엘리베이터']);

/** 관문 규칙: 하나라도 어기면 다른 점수로 메울 수 없게 총점을 GATE_CAP으로 묶는다(비보상형). */
export const GATE_RULES = new Set(['program', 'reachable', 'bedroomPrivacy']);
export const GATE_CAP = 69;

/**
 * 영역별 가중치(합 100). 정합성은 '시공 가능한 도면인가'(회의 결정),
 * 공간구문·면적 구성은 'AI 허브 실제 도면 분포에 얼마나 가까운가'를 본다.
 */
export const WEIGHTS = {
  SPA: { syntax: 35, area: 25, shape: 10, rules: 30 },
  STR: { rules: 60, profile: 40 },
  OBJ: { rules: 70, profile: 30 },
};

/** 기준 분포와 비교할 때 강건 z가 이 값이면 0점, 0이면 100점(선형). */
export const Z_ZERO_SCORE = 3;

/**
 * 분포 비교 지표 정의. key는 특징 이름, label은 화면 표시명.
 * minScale: 기준 분포가 거의 한 값으로 모여 있을 때 쓰는 최소 척도(이만큼 벗어나면 z=1).
 * direction: 'higher'면 중앙값보다 클 때 감점하지 않는다(문헌이 방향을 정한 지표). 없으면 양쪽 모두 감점.
 * weight: 영역 안에서의 가중치(기본 1).
 * refs: 근거 문헌 id(REFERENCES).
 *
 * v0.2.0: 기준 분포에서 분산이 0이던 현관→거실 깊이·현관→침실 평균 깊이·거실 통합도 순위와,
 * 실 개수를 따라가는 현관 기준 평균 깊이, 인접 그래프에서 벽 공유를 재는 순환성을 채점에서 뺐다(보고서 참고).
 * 거실 전면 폭/깊이(Lee & Wohn 2016)는 발코니 확장 세대가 많아 SPA만으로는 43%가 계산되지 않아 보류했다.
 */
export const FEATURES = {
  syntax: [
    { key: 'livingBedroomRatio', label: '거실/침실 통합도 비', minScale: 0.1, refs: ['byun2016', 'choi2014'] },
    { key: 'kitchenBedroomRatio', label: '주방/침실 통합도 비', minScale: 0.1, refs: ['byun2016', 'choi2014'] },
    { key: 'genotypeTau', label: '거실 중심 유전형 부합도(τ)', minScale: 0.1, direction: 'higher', refs: ['hillier1987', 'choi2014'] },
    { key: 'privacyDepthGap', label: '공·사 깊이 차(침실−거실·주방)', minScale: 0.25, direction: 'higher', refs: ['park2024', 'ham2017'] },
    { key: 'meanIntegration', label: '기능실 평균 통합도', minScale: 0.1, refs: ['hillier1984', 'ostwald2011'] },
    { key: 'livingControl', label: '거실 통제값', minScale: 0.2, weight: 0.5, refs: ['ostwald2011'] },
  ],
  area: [
    { key: 'ratio_거실', label: '거실 면적비', minScale: 0.02 },
    { key: 'ratio_주방', label: '주방 면적비', minScale: 0.02 },
    { key: 'ratio_침실', label: '침실 면적비', minScale: 0.02 },
    { key: 'ratio_화장실', label: '화장실 면적비', minScale: 0.01 },
    { key: 'ratio_발코니', label: '발코니 면적비', minScale: 0.02 },
    { key: 'publicPrivateRatio', label: '공용/개인 면적비', minScale: 0.05, refs: ['park2024'] },
    { key: 'masterBedroomRatio', label: '안방/다른 침실 면적비', minScale: 0.1, refs: ['zeng2025'] },
  ],
  shape: [
    { key: 'roomRectangularity', label: '실 직사각형도', minScale: 0.03, direction: 'higher', refs: ['rodrigues2013', 'zeng2025'] },
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

// 등재 상태(index)는 조사 시점의 판단이며 Clarivate MJL로 확인해야 한다.
export const REFERENCES = [
  {
    id: 'hillier1984',
    short: 'Hillier & Hanson 1984',
    text: 'Hillier, B., & Hanson, J. (1984). The Social Logic of Space. Cambridge University Press.',
    url: 'https://doi.org/10.1017/CBO9780511597237',
    index: '단행본',
    usedFor: '접근 그래프, 깊이, RA·RRA(D값 정규화), 통합도 정의',
  },
  {
    id: 'hillier1987',
    short: 'Hillier et al. 1987',
    text: 'Hillier, B., Hanson, J., & Graham, H. (1987). Ideas are in Things: An Application of the Space Syntax Method to Discovering House Genotypes. Environment and Planning B, 14(4), 363–385.',
    url: 'https://doi.org/10.1068/b140363',
    index: 'SSCI',
    usedFor: '기능실 통합도 순위로 본 유전형(inequality genotype)',
  },
  {
    id: 'ostwald2011',
    short: 'Ostwald 2011',
    text: 'Ostwald, M. J. (2011). The Mathematics of Spatial Configuration. Nexus Network Journal, 13, 445–470.',
    url: 'https://doi.org/10.1007/s00004-011-0075-3',
    index: 'SCIE 아님',
    usedFor: '깊이 계열 지표의 중복, 통제값, D값 정규화의 한계',
  },
  {
    id: 'choi2014',
    short: 'Choi et al. 2014',
    text: 'Choi, J., Kim, Y., Kang, J., & Choi, Y.-J. (2014). Comparative Analysis of the Spatial Structure of Apartment Unit Plans in Asia: Apartments in Korea, Vietnam, and Kazakhstan. JAABE, 13(3), 563–570.',
    url: 'https://doi.org/10.3130/jaabe.13.563',
    index: 'SCIE',
    usedFor: '한국 통합도 순위(거실 > 주방 > 현관 > 침실 > 화장실), 복도 제외',
  },
  {
    id: 'byun2016',
    short: 'Byun & Choi 2016',
    text: 'Byun, N., & Choi, J. (2016). A Typology of Korean Housing Units: In Search of Spatial Configuration. JAABE, 15(1), 41–48.',
    url: 'https://doi.org/10.3130/jaabe.15.41',
    index: 'SCIE',
    usedFor: '서울 2,500세대의 거실 중심 유형, 거실/침실 통합도 비 1.56~2.29',
  },
  {
    id: 'seo2007',
    short: 'Seo 2007',
    text: 'Seo, K. W. (2007). Space Puzzle in a Concrete Box: Finding Design Competence that Generates the Modern Apartment Houses in Seoul. Environment and Planning B, 34(6), 1071–1084.',
    url: 'https://doi.org/10.1068/b32134',
    index: 'SSCI',
    usedFor: '한국 평면 97%가 현관–중앙홀로 시작, 출입 링크와 인접 링크 구분',
  },
  {
    id: 'ham2017',
    short: 'Ham & Lee 2017',
    text: 'Ham, S., & Lee, H.-S. (2017). Topological Transitions in Collective Housing Units of South Korea. Sustainability, 9(1), 31.',
    url: 'https://doi.org/10.3390/su9010031',
    index: 'SCIE·SSCI',
    usedFor: '침실 깊이의 시대 변화',
  },
  {
    id: 'park2024',
    short: 'Park et al. 2024',
    text: 'Park, Ergan, & Feng (2024). Quality assessment of residential layout designs generated by relational GANs. Automation in Construction, 158, 105243.',
    url: 'https://doi.org/10.1016/j.autcon.2023.105243',
    index: 'SCIE',
    usedFor: '공용·개인 공간 면적과 깊이로 본 평면 품질',
  },
  {
    id: 'zeng2025',
    short: 'Zeng et al. 2025',
    text: 'Zeng, Yin, Gao, Li, Jin, & Lu (2025). Comprehensive and Dedicated Metrics for Evaluating AI-Generated Residential Floor Plans. Buildings, 15(10), 1674.',
    url: 'https://doi.org/10.3390/buildings15101674',
    index: 'SCIE',
    usedFor: '안방이 다른 침실보다 큼, 면적·종횡비 평가',
  },
  {
    id: 'lee2016',
    short: 'Lee & Wohn 2016',
    text: 'Lee & Wohn (2016). Occupants’ Perceptions of Amenity and Efficiency for Verification of Spatial Design Adequacy. IJERPH, 13(1), 128.',
    url: 'https://doi.org/10.3390/ijerph13010128',
    index: 'SCIE(2016년 당시)',
    usedFor: '넓고 얕은 거실(폭/깊이 비) — 같은 도면의 창 정보가 생기면 반영(보류)',
  },
  {
    id: 'rodrigues2013',
    short: 'Rodrigues et al. 2013',
    text: 'Rodrigues, E., Gaspar, A. R., & Gomes, Á. (2013). An evolutionary strategy enhanced with a local search technique for the space allocation problem in architecture, Part 2. Computer-Aided Design, 45(5), 898–910.',
    url: 'https://doi.org/10.1016/j.cad.2013.01.003',
    index: 'SCIE',
    usedFor: '실 형태(최소 변, 조밀도) 벌점',
  },
];

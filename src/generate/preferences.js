// 도면 생성의 공간구문·생활 조건 선택지. 모두 평가 모델의 지표·규칙(src/model/config.js FEATURES, spa.js 규칙)에 묶이고,
// 근거 문헌은 모델과 같은 REFERENCES id를 쓴다. score(ctx)는 0~100.
// ctx: { unit(평가 결과 세대), item(groupKey, featureKey), rule(id), layout, noise }

const pct = (it) => (it && it.percentile !== null && it.percentile !== undefined ? 100 * it.percentile : null);
const avg = (...xs) => {
  const v = xs.filter((x) => x !== null && x !== undefined && Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
};

export const SYNTAX_CHOICES = [
  {
    key: 'livingCentral',
    short: '거실 중심',
    title: '거실 중심형',
    desc: '거실이 집에서 가장 통합된(가장 많이 지나가는) 실이 되게 합니다. 한국 아파트의 대표 유전형입니다.',
    metrics: ['규칙: 거실이 가장 통합된 기능실', '유전형 순위 부합도 τ', '유전형 프로필 거리'],
    refs: ['hillier1987', 'choi2014', 'byun2016'],
    score: (c) => avg(100 * c.rule('livingCentral'), c.item('syntax', 'genotypeTau')?.score ?? c.item('syntax', 'genotypeDistance')?.score),
  },
  {
    key: 'privacy',
    short: '사생활 깊이',
    title: '사생활 깊이',
    desc: '침실을 거실·주방보다 한 단계 더 안쪽에 두고, 침실을 지나야만 갈 수 있는 실을 없앱니다.',
    metrics: ['공·사 깊이 차(침실−거실·주방)', '규칙: 침실을 거치지 않고 다른 실에 갈 수 있음'],
    refs: ['park2024', 'ham2017'],
    score: (c) => avg(c.item('syntax', 'privacyDepthGap')?.score, 100 * c.rule('bedroomPrivacy')),
  },
  {
    key: 'kitchenLink',
    short: '주방–거실 연계',
    title: '주방–거실 연계',
    desc: '주방이 거실과 맞닿고, 주방도 침실보다 잘 이어지게 합니다(주방/침실 통합도 비).',
    metrics: ['규칙: 주방과 거실이 맞닿음', '주방/침실 통합도 비'],
    refs: ['byun2016', 'choi2014'],
    score: (c) => avg(100 * c.rule('kitchenLiving'), c.item('syntax', 'kitchenBedroomRatio')?.score),
  },
  {
    key: 'entryNear',
    short: '현관–거실 연결',
    title: '현관–거실 직접 연결',
    desc: '현관이 거실·주방·복도로 바로 열리고, 거실까지 2단계 안에 닿게 합니다(현관–중앙홀 구성).',
    metrics: ['규칙: 거실이 현관에서 2단계 이내', '규칙: 현관이 거실·주방·복도로 바로 열림'],
    refs: ['seo2007'],
    score: (c) => avg(100 * c.rule('livingNear'), 100 * c.rule('entry')),
  },
];

export const LIFESTYLE_CHOICES = [
  {
    key: 'spacious',
    short: '넓은 공용 공간',
    title: '넓은 공용 공간',
    desc: '거실을 한 단계 넓게 잡고, 공용 공간 비중을 키우며, 실을 반듯하고 덜 길쭉하게 만듭니다.',
    metrics: ['공용/개인 면적비(높을수록)', '실 종횡비', '실 직사각형도'],
    refs: ['park2024', 'upasani2020', 'rosin1999'],
    effect: '거실 크기 +1단계',
    score: (c) => avg(pct(c.item('area', 'publicPrivateRatio')), c.item('shape', 'roomAspectRatio')?.score, c.item('shape', 'roomRectangularity')?.score),
  },
  {
    key: 'bath',
    short: '화장실 2개',
    title: '화장실 2개(공용·부부욕실)',
    desc: '화장실을 2개(공용·부부욕실)로 하고, 안방에 부부욕실을 붙이며, 침실을 거치지 않는 공용 화장실을 둡니다.',
    metrics: ['규칙: 안방에 딸린 화장실(·드레스룸)', '규칙: 침실을 거치지 않는 공용 화장실'],
    refs: ['zeng2025'],
    effect: '화장실 2개',
    score: (c) => avg(100 * c.rule('masterSuite'), 100 * c.rule('publicBath')),
  },
  {
    key: 'quiet',
    short: '침실 소음 분리',
    title: '침실 소음 분리(방음 배치)',
    desc: '침실이 거실·주방·현관과 맞댄 벽을 줄이고(드레스룸·화장실을 완충으로), 침실을 공용 공간보다 깊게 둡니다.',
    metrics: ['소음원과 맞댄 침실 벽 비율(근사)', '공·사 깊이 차'],
    refs: ['park2024', 'ham2017'],
    note: '차음 성능은 벽체 사양이 정하므로, 여기서는 배치로 줄일 수 있는 부분만 근사합니다. 모델에 차음 지표는 없습니다.',
    score: (c) => avg(100 * Math.max(0, 1 - c.noise / 0.35), c.item('syntax', 'privacyDepthGap')?.score),
  },
  {
    key: 'sunny',
    short: '채광 확보',
    title: '채광 확보(거실·침실 외기 접면)',
    desc: '거실·침실이 바깥이나 발코니에 닿는 둘레를 늘립니다.',
    metrics: ['거주실 외기 접면비(높을수록)', '규칙: 모든 거실·침실이 외기·발코니에 접함'],
    refs: ['ju2020', 'zeng2025'],
    score: (c) => avg(pct(c.item('exposure', 'exteriorExposure')), 100 * c.rule('daylight')),
  },
  {
    key: 'storage',
    short: '수납 공간',
    title: '수납 공간(드레스룸·다목적실)',
    desc: '드레스룸과 다목적실(팬트리·다용도실)을 넣습니다.',
    metrics: ['실 구성: 드레스룸·다목적공간'],
    refs: [],
    effect: '드레스룸·다목적실 추가',
    score: (c) => {
      const has = (t) => c.layout.rooms.some((r) => r.type === t);
      return 50 * Number(has('드레스룸')) + 50 * Number(has('다목적공간'));
    },
  },
];

export const ALL_CHOICES = [...SYNTAX_CHOICES, ...LIFESTYLE_CHOICES];

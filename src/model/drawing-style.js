// 예시 도면(라벨로 그린 SVG)의 색. 도면 생성 스크립트와 예시 도면 페이지 범례가 함께 쓴다.
// 도면은 흰 종이 위에 그리므로 화면 테마와 상관없이 같은 색을 쓴다.

// 실 이름을 글자로 함께 쓰므로 색은 보조 정보다.
export const ROOM_GROUPS = [
  { key: 'living', label: '거실·주방', types: ['거실', '주방'], fill: '#f6e7c8' },
  { key: 'private', label: '침실·드레스룸', types: ['침실', '드레스룸'], fill: '#d9e7f7' },
  { key: 'wet', label: '화장실', types: ['화장실'], fill: '#cdeae3' },
  { key: 'entry', label: '현관·다목적공간', types: ['현관', '다목적공간'], fill: '#eadff4' },
  { key: 'outdoor', label: '발코니·실외기실', types: ['발코니', '실외기실'], fill: '#e4eed8' },
  { key: 'common', label: '공용(계단·승강기)', types: ['엘리베이터홀', '계단실', '엘리베이터'], fill: '#e2e1e7' },
  { key: 'etc', label: '기타(덕트 등)', types: ['기타'], fill: '#f1f0f3' },
];
export const roomGroupOf = (type) => ROOM_GROUPS.find((g) => g.types.includes(type)) || ROOM_GROUPS.at(-1);

export const STR_STYLE = {
  wall_rc: { label: '철근콘크리트벽', fill: '#2b2a33' },
  wall: { label: '기타벽', fill: '#7c7a8a' },
  window: { label: '창호', fill: '#bfe0f7', stroke: '#2a78d6' },
  door: { label: '출입문', fill: '#fbd9c2', stroke: '#d95926' },
};

// 평가 화면의 범주 색과 같은 고정 순서.
export const FIXTURE_COLORS = { 변기: '#2a78d6', 세면대: '#eb6834', 욕조: '#1baf7a', 싱크대: '#eda100', 가스레인지: '#e87ba4' };

export const OCR_STYLE = { stroke: '#5b3ff0' };

// 이미지 평가 화면에서 실 종류를 칠하는 색. 실 이름을 글자로 함께 쓰므로 색은 보조 정보다.
export const ROOM_TYPES = [
  { type: '거실', color: '#f59e0b' },
  { type: '주방', color: '#ef4444' },
  { type: '침실', color: '#3b82f6' },
  { type: '드레스룸', color: '#7dd3fc' },
  { type: '화장실', color: '#14b8a6' },
  { type: '현관', color: '#a855f7' },
  { type: '다목적공간', color: '#ec4899' },
  { type: '발코니', color: '#84cc16' },
  { type: '실외기실', color: '#4d7c0f' },
  { type: '기타', color: '#94a3b8' },
  { type: '엘리베이터홀', color: '#a8a29e' },
  { type: '계단실', color: '#78716c' },
  { type: '엘리베이터', color: '#57534e' },
];

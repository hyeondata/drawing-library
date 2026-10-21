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

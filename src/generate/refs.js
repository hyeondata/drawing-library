// 도면 생성 화면의 '식과 변수'에서 근거로 보여 주는 문헌. 분석 문헌(REFERENCES)에 생성·QUBO 문헌을 더한다.
// 전체 서지와 Crossref 대조는 evidence/07-참고-문헌.md(20~52번).
import { REFERENCES } from '../model/config.js';

const EXTRA = [
  { id: 'bafna2003', short: 'Bafna 2003', url: 'https://doi.org/10.1177/0013916502238863', text: 'Space syntax: 출입 링크가 사생활·통제를 바꿈' },
  { id: 'lucas2014', short: 'Lucas 2014', url: 'https://doi.org/10.3389/fphy.2014.00005', text: '원-핫 벌점 A(1−Σx)², 제약을 어기는 것이 이득이 되지 않게 0 < B·max(W) < A(§7.1–7.2)' },
  { id: 'glover2019', short: 'Glover et al. 2019', url: 'https://doi.org/10.1007/s10288-019-00424-y', text: '이차 배정 문제(QAP)를 P(Σx−1)² 벌점으로 QUBO화(§5.4)' },
  { id: 'ayodele2022', short: 'Ayodele 2022', url: 'https://arxiv.org/abs/2206.11040', text: '벌점이 너무 작으면 실행 불가능한 해, 너무 크면 느린 수렴. 어느 방법이 최선인지는 문제·풀이기마다 다름(p.10)' },
  { id: 'jin2011', short: 'Jin 2011', url: 'https://doi.org/10.1016/j.swevo.2011.05.001', text: '대리 모델은 진짜 적합도 함수와 함께 써야 가짜 최적에 속지 않음(p.61)' },
  { id: 'merrell2010', short: 'Merrell et al. 2010', url: 'https://doi.org/10.1145/1882261.1866203', text: '베이지안 망으로 실 프로그램, 메트로폴리스 탐색으로 평면 최적화(p.5)' },
  { id: 'michalek2002', short: 'Michalek et al. 2002', url: 'https://doi.org/10.1080/03052150214016', text: 'SA로 출발점을 찾고 SQP(기울기)로 다듬는 혼합(pp.471–472)' },
  { id: 'dunning2018', short: 'Dunning et al. 2018', url: 'https://doi.org/10.1287/ijoc.2017.0798', text: '같은 종료 조건으로 비교한 논문은 14%뿐, 모든 문제에서 이기는 단일 휴리스틱 없음(p.1)' },
];

export const GEN_REFS = Object.fromEntries([...REFERENCES.map((r) => [r.id, { short: r.short, url: r.url, text: r.usedFor }]), ...EXTRA.map((r) => [r.id, r])]);

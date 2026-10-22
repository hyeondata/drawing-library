// 도면 생성 화면의 '식과 변수'에서 근거로 보여 주는 문헌. 평가 모델 문헌(REFERENCES)에 생성·QUBO 문헌을 더한다.
// 전체 서지와 Crossref 대조는 evidence/07-참고-문헌.md(20~52번).
import { REFERENCES } from '../model/config.js';

const EXTRA = [
  { id: 'bafna2003', short: 'Bafna 2003', url: 'https://doi.org/10.1177/0013916502238863', text: 'Space syntax: 출입 링크가 사생활·통제를 바꿈' },
  { id: 'lucas2014', short: 'Lucas 2014', url: 'https://doi.org/10.3389/fphy.2014.00005', text: '원-핫 벌점 P(Σx−1)², 벌점은 최대 목적 이득보다 커야 함' },
  { id: 'glover2019', short: 'Glover et al. 2019', url: 'https://doi.org/10.1007/s10288-019-00424-y', text: '배정 문제의 QUBO 형식' },
  { id: 'ayodele2022', short: 'Ayodele 2022', url: 'https://arxiv.org/abs/2206.11040', text: '순열 QUBO는 작은 유효 벌점이 가장 좋음' },
  { id: 'jin2011', short: 'Jin 2011', url: 'https://doi.org/10.1016/j.swevo.2011.05.001', text: '대리 모델(surrogate)로 보정' },
  { id: 'merrell2010', short: 'Merrell et al. 2010', url: 'https://doi.org/10.1145/1882261.1866203', text: '주거 평면 생성과 확률적 탐색' },
  { id: 'michalek2002', short: 'Michalek et al. 2002', url: 'https://doi.org/10.1080/03052150214016', text: '배치 최적화: 전역 탐색 + 국소 다듬기' },
  { id: 'dunning2018', short: 'Dunning et al. 2018', url: 'https://doi.org/10.1287/ijoc.2017.0798', text: '같은 예산으로 풀이기 비교' },
];

export const GEN_REFS = Object.fromEntries([...REFERENCES.map((r) => [r.id, { short: r.short, url: r.url, text: r.usedFor }]), ...EXTRA.map((r) => [r.id, r])]);

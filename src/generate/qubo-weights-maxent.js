// scripts/qubo-maxent.mjs가 만든 파일(손대지 말 것). 한국 실제 아파트(AI 허브 개발 묶음) 관계 빈도로 추정한 QUBO 항 가중치(최대 엔트로피 모멘트 맞춤).
// 규칙 항 masterNotEnd, backBedUnderBed은 손 가중치 고정.
export const MAXENT = {
  "weights": {
    "kitchenLiving": -4.26,
    "entranceLiving": -4.89,
    "entranceKitchen": 0,
    "bathKitchen": 1.96,
    "bathEntrance": 0,
    "bathLiving": 0,
    "multiKitchen": 0,
    "bedEntrance": 4.89,
    "backBedEntrance": 0,
    "backBedUnderBed": -2,
    "backBedKitchen": 3.88,
    "bedLiving": 0.64,
    "bedBed": -0.64,
    "livingOffCenter": 1.17,
    "masterNotEnd": 6,
    "entranceEnd": -0.16,
    "kitchenEnd": 4.86,
    "backBedEnd": 0,
    "masterKitchen": -3.51,
    "bedOverBath": 9.96
  },
  "meta": {
    "generatedAt": "2026-11-04",
    "method": "maxent moment matching (Boltzmann, T=1), Adam, ridge 1e-3, sign-constrained to data direction",
    "data": "dev 5431 plans / test 2900 plans (data/split.json)",
    "groups": 40,
    "configs": 9538,
    "fixed": [
      "masterNotEnd",
      "backBedUnderBed"
    ],
    "errDev": 0.7591531784666836,
    "errTest": 0.7853370196405562
  }
};

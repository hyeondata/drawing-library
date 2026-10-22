// scripts/qubo-calibrate.mjs가 만든 파일(손대지 말 것). 평가 모델 점수로 다시 맞춘 QUBO 항 가중치.
// 조건 20개 × 템플릿, 배치 9567개, 방법 direct(조건 단위 5겹 교차검증으로 고름).
export const CALIBRATED = {
  "weights": {
    "kitchenLiving": 2.18,
    "entranceLiving": -0.58,
    "entranceKitchen": -4.82,
    "bathKitchen": 2.76,
    "bathEntrance": -0.83,
    "bathLiving": -0.6,
    "multiKitchen": 3.76,
    "bedEntrance": 4.96,
    "backBedEntrance": 2.99,
    "backBedUnderBed": -2.03,
    "backBedKitchen": 4.66,
    "bedLiving": -4.37,
    "bedBed": 2.32,
    "livingOffCenter": 7.09,
    "masterNotEnd": 3.69,
    "entranceEnd": -1.41,
    "kitchenEnd": 8,
    "backBedEnd": -7.1,
    "masterKitchen": -0.56,
    "bedOverBath": -0.2
  },
  "meta": {
    "generatedAt": "2026-10-22",
    "specs": 20,
    "groups": 40,
    "samples": 9567,
    "lambda": "direct",
    "method": "direct",
    "cv": {
      "hand": {
        "rho": -0.3335584277410407,
        "regret": -16.100635800561985,
        "topPct": 0.697424931478075
      },
      "calibrated": {
        "rho": -0.5333554149646889,
        "regret": -10.613434970326038,
        "topPct": 0.7921560077328852
      },
      "all": {
        "hand": {
          "rho": -0.3335584277410407,
          "regret": -16.100635800561985,
          "topPct": 0.697424931478075
        },
        "ridge λ=0.01": {
          "rho": -0.5442156572376096,
          "regret": -18.38358669202893,
          "topPct": 0.7647652021092217
        },
        "ridge λ=1": {
          "rho": -0.544983844101133,
          "regret": -18.38358669202893,
          "topPct": 0.7633123282928818
        },
        "ridge λ=100": {
          "rho": -0.5554399807810306,
          "regret": -19.253001257810865,
          "topPct": 0.7812493316928125
        },
        "direct": {
          "rho": -0.5333554149646889,
          "regret": -10.613434970326038,
          "topPct": 0.7921560077328852
        }
      }
    },
    "insample": {
      "hand": {
        "rho": -0.3335584277410407,
        "regret": -16.10063580056198,
        "topPct": 0.697424931478075
      },
      "calibrated": {
        "rho": -0.5472295354459067,
        "regret": -7.5883824901381915,
        "topPct": 0.8511270196770516
      }
    }
  }
};

// scripts/qubo-calibrate.mjs가 만든 파일(손대지 말 것). 평가 모델 점수로 다시 맞춘 QUBO 항 가중치.
// 조건 20개 × 템플릿, 배치 9567개, 방법 direct-signed(조건 단위 5겹 교차검증으로 고름).
export const CALIBRATED = {
  "weights": {
    "kitchenLiving": -1.51,
    "entranceLiving": 0,
    "entranceKitchen": 0,
    "bathKitchen": 5.24,
    "bathEntrance": -1.51,
    "bathLiving": 0,
    "multiKitchen": 0,
    "bedEntrance": 2.12,
    "backBedEntrance": 3.28,
    "backBedUnderBed": -2,
    "backBedKitchen": 6.39,
    "bedLiving": -6.26,
    "bedBed": 0,
    "livingOffCenter": 9.49,
    "masterNotEnd": 6,
    "entranceEnd": 0,
    "kitchenEnd": 11.42,
    "backBedEnd": -10.29,
    "masterKitchen": -3.7,
    "bedOverBath": -2.34
  },
  "meta": {
    "generatedAt": "2026-11-04",
    "specs": 20,
    "groups": 40,
    "samples": 9567,
    "lambda": "direct-signed",
    "method": "direct-signed",
    "cv": {
      "hand": {
        "rho": -0.3268267246623058,
        "regret": -18.806780745198953,
        "topPct": 0.707806680504498
      },
      "calibrated": {
        "rho": -0.5090356652366254,
        "regret": -9.962297440286758,
        "topPct": 0.8062256225160055
      },
      "all": {
        "hand": {
          "rho": -0.3268267246623058,
          "regret": -18.806780745198953,
          "topPct": 0.707806680504498
        },
        "ridge λ=0.01": {
          "rho": -0.5622882513206766,
          "regret": -15.149374295381483,
          "topPct": 0.758018404284285
        },
        "ridge λ=1": {
          "rho": -0.5625274603565066,
          "regret": -15.046927603172305,
          "topPct": 0.750939955991915
        },
        "ridge λ=100": {
          "rho": -0.5697699658129517,
          "regret": -18.780483165657696,
          "topPct": 0.7632554403697716
        },
        "direct": {
          "rho": -0.5462173428279004,
          "regret": -10.905129004904708,
          "topPct": 0.7949894932134258
        },
        "direct-signed": {
          "rho": -0.5090356652366254,
          "regret": -9.962297440286758,
          "topPct": 0.8062256225160055
        }
      }
    },
    "insample": {
      "hand": {
        "rho": -0.32682672466230567,
        "regret": -18.806780745198957,
        "topPct": 0.7078066805044978
      },
      "calibrated": {
        "rho": -0.5730220622766105,
        "regret": -7.9713885740817805,
        "topPct": 0.856053604610219
      }
    }
  }
};

// scripts/qubo-calibrate.mjs가 만든 파일(손대지 말 것). 평가 모델 점수로 다시 맞춘 QUBO 항 가중치.
// 조건 20개 × 템플릿, 배치 9567개, 방법 direct-signed(조건 단위 5겹 교차검증으로 고름).
export const CALIBRATED = {
  "weights": {
    "kitchenLiving": -1.18,
    "entranceLiving": -5,
    "entranceKitchen": 0,
    "bathKitchen": 7.79,
    "bathEntrance": -0.19,
    "bathLiving": 0,
    "multiKitchen": 0,
    "bedEntrance": 0.68,
    "backBedEntrance": 0,
    "backBedUnderBed": -2,
    "backBedKitchen": 17.14,
    "bedLiving": -9.19,
    "bedBed": -1.03,
    "livingOffCenter": 2.38,
    "masterNotEnd": 6,
    "entranceEnd": -4.18,
    "kitchenEnd": 15.77,
    "backBedEnd": -6.45,
    "masterKitchen": -0.86,
    "bedOverBath": -0.51
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
        "rho": -0.2945378035392604,
        "regret": -26.55348110867914,
        "topPct": 0.6276644724814675
      },
      "calibrated": {
        "rho": -0.4935598625730642,
        "regret": -15.549422428423608,
        "topPct": 0.8165323187650588
      },
      "all": {
        "hand": {
          "rho": -0.2945378035392604,
          "regret": -26.55348110867914,
          "topPct": 0.6276644724814675
        },
        "ridge λ=0.01": {
          "rho": -0.5364614774307578,
          "regret": -14.216736315095071,
          "topPct": 0.8443181489887865
        },
        "ridge λ=1": {
          "rho": -0.5368664972175837,
          "regret": -14.216736315095071,
          "topPct": 0.8454051055105256
        },
        "ridge λ=100": {
          "rho": -0.5439918332338992,
          "regret": -11.735201667028504,
          "topPct": 0.8567113669924606
        },
        "direct": {
          "rho": -0.5466090766146257,
          "regret": -15.570785970748382,
          "topPct": 0.8165728915850566
        },
        "direct-signed": {
          "rho": -0.4935598625730642,
          "regret": -15.549422428423608,
          "topPct": 0.8165323187650588
        }
      }
    },
    "insample": {
      "hand": {
        "rho": -0.2945378035392603,
        "regret": -26.553481108679136,
        "topPct": 0.6276644724814673
      },
      "calibrated": {
        "rho": -0.5591389851265955,
        "regret": -10.100065476047346,
        "topPct": 0.8633999235866785
      }
    }
  }
};

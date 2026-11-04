// scripts/syntax-surrogate.mjs가 만든 파일(손대지 말 것). 공간구문 변수의 QUBO 대리 항 가중치 v(낮은 에너지 = 변수가 큼).
// 생성 때 선호를 고르면 E = E_보정 + λ·s·Σ_t v_t φ_t, s = ‖w_보정‖₁ / ‖v‖₁, λ = 0.5(교차검증 표 참고).
// 조건 20개 × 템플릿, 배치 9567개.
export const SYNTAX_LAMBDA = 0.5;
export const SYNTAX = {
 "livingBedroomRatio": {
  "label": "거실/침실 통합도 비",
  "pref": "livingCentral",
  "refs": "Byun & Choi 2016; Choi et al. 2014",
  "cv": {
   "0": {
    "rho": 0.8024610825688234,
    "varPct": 0.8581490604087672,
    "objPct": 0.8846080313705116
   },
   "1": {
    "rho": 0.8024610825688234,
    "varPct": 0.8614296747832242,
    "objPct": 0.8250953883726385
   },
   "2": {
    "rho": 0.8024610825688234,
    "varPct": 0.8781794982334941,
    "objPct": 0.8262970312835438
   },
   "0.25": {
    "rho": 0.8024610825688234,
    "varPct": 0.8543894232879738,
    "objPct": 0.8426282220965917
   },
   "0.5": {
    "rho": 0.8024610825688234,
    "varPct": 0.8615975653629967,
    "objPct": 0.8441925063278801
   }
  },
  "weights": {
   "kitchenLiving": 0.0182,
   "entranceLiving": 0.0062,
   "entranceKitchen": -0.1019,
   "bathKitchen": -0.0534,
   "bathEntrance": 0.0474,
   "bathLiving": 0.0091,
   "multiKitchen": -0.0731,
   "bedEntrance": 0.0565,
   "backBedEntrance": -0.0471,
   "backBedUnderBed": 0.013,
   "backBedKitchen": 0.0521,
   "bedLiving": -0.0908,
   "bedBed": 0.0908,
   "livingOffCenter": 0.7408,
   "masterNotEnd": 0,
   "entranceEnd": -0.0361,
   "kitchenEnd": 0.0817,
   "backBedEnd": 0.0702,
   "masterKitchen": -0.0557,
   "bedOverBath": -0.0035
  }
 },
 "genotypeTau": {
  "label": "거실 중심 유전형 순위 부합도 τ",
  "pref": "livingCentral",
  "refs": "Hillier, Hanson & Graham 1987; Byun & Choi 2016",
  "cv": {
   "0": {
    "rho": 0.4722186378909238,
    "varPct": 0.7206281408527362,
    "objPct": 0.8846080313705116
   },
   "1": {
    "rho": 0.4722186378909238,
    "varPct": 0.6709952450791753,
    "objPct": 0.8224234331481717
   },
   "2": {
    "rho": 0.4722186378909238,
    "varPct": 0.6785633063156179,
    "objPct": 0.8197099199715254
   },
   "0.25": {
    "rho": 0.4722186378909238,
    "varPct": 0.6934843868660384,
    "objPct": 0.8507248010038988
   },
   "0.5": {
    "rho": 0.4722186378909238,
    "varPct": 0.6918254033069855,
    "objPct": 0.8450974325756191
   }
  },
  "weights": {
   "kitchenLiving": 0.038,
   "entranceLiving": 0.0089,
   "entranceKitchen": -0.0402,
   "bathKitchen": 0.0118,
   "bathEntrance": 0.0554,
   "bathLiving": -0.1123,
   "multiKitchen": -0.0161,
   "bedEntrance": 0.0028,
   "backBedEntrance": 0.0106,
   "backBedUnderBed": -0.0141,
   "backBedKitchen": -0.0051,
   "bedLiving": -0.029,
   "bedBed": 0.029,
   "livingOffCenter": 0.1557,
   "masterNotEnd": 0,
   "entranceEnd": 0.034,
   "kitchenEnd": 0.1615,
   "backBedEnd": -0.025,
   "masterKitchen": -0.1133,
   "bedOverBath": -0.1141
  }
 },
 "privacyDepthGap": {
  "label": "공·사 깊이 차",
  "pref": "privacy",
  "refs": "Ham & Lee 2017",
  "cv": {
   "0": {
    "rho": 0.6298247830362195,
    "varPct": 0.69341161814414,
    "objPct": 0.8846080313705116
   },
   "1": {
    "rho": 0.6298247830362195,
    "varPct": 0.7749090945062964,
    "objPct": 0.7749929556602204
   },
   "2": {
    "rho": 0.6298247830362195,
    "varPct": 0.806137527362742,
    "objPct": 0.7535934320745472
   },
   "0.25": {
    "rho": 0.6298247830362195,
    "varPct": 0.7293345053750574,
    "objPct": 0.8136370563437485
   },
   "0.5": {
    "rho": 0.6298247830362195,
    "varPct": 0.7536817434934857,
    "objPct": 0.7691426753401914
   }
  },
  "weights": {
   "kitchenLiving": -0.0435,
   "entranceLiving": -0.0683,
   "entranceKitchen": -0.1103,
   "bathKitchen": 0.0265,
   "bathEntrance": 0.0024,
   "bathLiving": 0.0138,
   "multiKitchen": 0.0523,
   "bedEntrance": 0.0775,
   "backBedEntrance": 0.1062,
   "backBedUnderBed": -0.0649,
   "backBedKitchen": 0.0949,
   "bedLiving": -0.0065,
   "bedBed": 0.0065,
   "livingOffCenter": -0.0999,
   "masterNotEnd": 0,
   "entranceEnd": 0.0671,
   "kitchenEnd": 0.1738,
   "backBedEnd": -0.071,
   "masterKitchen": -0.1364,
   "bedOverBath": 0.0308
  }
 },
 "kitchenBedroomRatio": {
  "label": "주방/침실 통합도 비",
  "pref": "kitchenLink",
  "refs": "Byun & Choi 2016; Choi et al. 2014",
  "cv": {
   "0": {
    "rho": 0.7082292756089628,
    "varPct": 0.5623006212572028,
    "objPct": 0.8846080313705116
   },
   "1": {
    "rho": 0.7082292756089628,
    "varPct": 0.8121332322763569,
    "objPct": 0.7242797904740212
   },
   "2": {
    "rho": 0.7082292756089628,
    "varPct": 0.881677712326363,
    "objPct": 0.6789919919850261
   },
   "0.25": {
    "rho": 0.7082292756089628,
    "varPct": 0.5931411604779026,
    "objPct": 0.8488937611124199
   },
   "0.5": {
    "rho": 0.7082292756089628,
    "varPct": 0.6886138924603663,
    "objPct": 0.7254600288532694
   }
  },
  "weights": {
   "kitchenLiving": -0.0408,
   "entranceLiving": -0.0093,
   "entranceKitchen": -0.0052,
   "bathKitchen": -0.0036,
   "bathEntrance": -0.0253,
   "bathLiving": 0.0157,
   "multiKitchen": 0.0273,
   "bedEntrance": 0.0012,
   "backBedEntrance": 0.0991,
   "backBedUnderBed": 0.0046,
   "backBedKitchen": -0.0148,
   "bedLiving": -0.0117,
   "bedBed": 0.0117,
   "livingOffCenter": 0.2071,
   "masterNotEnd": 0,
   "entranceEnd": 0.0547,
   "kitchenEnd": 0.1513,
   "backBedEnd": -0.177,
   "masterKitchen": -0.3391,
   "bedOverBath": 0.024
  }
 }
};

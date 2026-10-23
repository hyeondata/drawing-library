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
    "varPct": 0.67186569524934,
    "objPct": 0.8415650595798948
   },
   "1": {
    "rho": 0.8024610825688234,
    "varPct": 0.8574381840016746,
    "objPct": 0.7775774979850739
   },
   "2": {
    "rho": 0.8024610825688234,
    "varPct": 0.8686332642055382,
    "objPct": 0.77284713568127
   },
   "0.25": {
    "rho": 0.8024610825688234,
    "varPct": 0.7937118528489944,
    "objPct": 0.7972315544369191
   },
   "0.5": {
    "rho": 0.8024610825688234,
    "varPct": 0.8321124378113778,
    "objPct": 0.7764848045737965
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
    "varPct": 0.6889076165869465,
    "objPct": 0.8415650595798948
   },
   "1": {
    "rho": 0.4722186378909238,
    "varPct": 0.7347369663981789,
    "objPct": 0.7813049849747612
   },
   "2": {
    "rho": 0.4722186378909238,
    "varPct": 0.7273395123014781,
    "objPct": 0.7996243764826074
   },
   "0.25": {
    "rho": 0.4722186378909238,
    "varPct": 0.7199981759546574,
    "objPct": 0.8147469862797174
   },
   "0.5": {
    "rho": 0.4722186378909238,
    "varPct": 0.737028015197115,
    "objPct": 0.8079087389640147
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
  "refs": "Ham & Lee 2017; Park et al. 2024",
  "cv": {
   "0": {
    "rho": 0.6298247830362195,
    "varPct": 0.7560766247631332,
    "objPct": 0.8415650595798948
   },
   "1": {
    "rho": 0.6298247830362195,
    "varPct": 0.8045234521107225,
    "objPct": 0.7434967823566484
   },
   "2": {
    "rho": 0.6298247830362195,
    "varPct": 0.824822533781375,
    "objPct": 0.7216020562392709
   },
   "0.25": {
    "rho": 0.6298247830362195,
    "varPct": 0.792551621124807,
    "objPct": 0.7480742471453807
   },
   "0.5": {
    "rho": 0.6298247830362195,
    "varPct": 0.7985375366177647,
    "objPct": 0.7438488950327047
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
    "varPct": 0.7409915872504546,
    "objPct": 0.8415650595798948
   },
   "1": {
    "rho": 0.7082292756089628,
    "varPct": 0.8695701420231452,
    "objPct": 0.7107352910857768
   },
   "2": {
    "rho": 0.7082292756089628,
    "varPct": 0.8966830700401942,
    "objPct": 0.7083995535002413
   },
   "0.25": {
    "rho": 0.7082292756089628,
    "varPct": 0.8252396868759686,
    "objPct": 0.7566867619294741
   },
   "0.5": {
    "rho": 0.7082292756089628,
    "varPct": 0.8452039977266441,
    "objPct": 0.7334201181330385
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

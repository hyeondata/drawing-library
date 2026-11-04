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
    "varPct": 0.6437916037479646,
    "objPct": 0.8476289759481541
   },
   "1": {
    "rho": 0.8024610825688234,
    "varPct": 0.8265740192935424,
    "objPct": 0.805709573613199
   },
   "2": {
    "rho": 0.8024610825688234,
    "varPct": 0.8683505387311701,
    "objPct": 0.7524010948366692
   },
   "0.25": {
    "rho": 0.8024610825688234,
    "varPct": 0.702148172063707,
    "objPct": 0.8428683452404384
   },
   "0.5": {
    "rho": 0.8024610825688234,
    "varPct": 0.7518885375594289,
    "objPct": 0.8255533180011093
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
    "varPct": 0.7072252673652741,
    "objPct": 0.8476289759481541
   },
   "1": {
    "rho": 0.4722186378909238,
    "varPct": 0.703405184021039,
    "objPct": 0.854064825278458
   },
   "2": {
    "rho": 0.4722186378909238,
    "varPct": 0.7376690277677982,
    "objPct": 0.8413048253891626
   },
   "0.25": {
    "rho": 0.4722186378909238,
    "varPct": 0.7048297969819988,
    "objPct": 0.8465401257739381
   },
   "0.5": {
    "rho": 0.4722186378909238,
    "varPct": 0.7146783512993871,
    "objPct": 0.854392322831336
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
    "varPct": 0.7593481785187512,
    "objPct": 0.8476289759481541
   },
   "1": {
    "rho": 0.6298247830362195,
    "varPct": 0.7785876654254233,
    "objPct": 0.7839158406982408
   },
   "2": {
    "rho": 0.6298247830362195,
    "varPct": 0.7844019960553952,
    "objPct": 0.7856521943492173
   },
   "0.25": {
    "rho": 0.6298247830362195,
    "varPct": 0.7929173304667593,
    "objPct": 0.7898463908370974
   },
   "0.5": {
    "rho": 0.6298247830362195,
    "varPct": 0.7758112962570665,
    "objPct": 0.7886825749781596
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
    "varPct": 0.7465606189366142,
    "objPct": 0.8476289759481541
   },
   "1": {
    "rho": 0.7082292756089628,
    "varPct": 0.8600892622655124,
    "objPct": 0.8003298872493809
   },
   "2": {
    "rho": 0.7082292756089628,
    "varPct": 0.8760114819630153,
    "objPct": 0.7739000025099492
   },
   "0.25": {
    "rho": 0.7082292756089628,
    "varPct": 0.8424279000089394,
    "objPct": 0.7975074523153489
   },
   "0.5": {
    "rho": 0.7082292756089628,
    "varPct": 0.851611573478327,
    "objPct": 0.8053070039541863
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

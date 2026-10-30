// scripts/syntax-surrogate.mjs가 만든 파일(손대지 말 것). 공간구문 변수의 QUBO 대리 항 가중치 v(낮은 에너지 = 변수가 큼).
// 생성 때 선호를 고르면 E = E_손 + λ·s·Σ_t v_t φ_t, s = ‖w_손‖₁ / ‖v‖₁, λ = 0.5(교차검증 표 참고).
// 조건 20개 × 템플릿, 배치 9567개.
export const SYNTAX_LAMBDA = 0.5;
export const SYNTAX = {
 "livingBedroomRatio": {
  "label": "거실/침실 통합도 비",
  "pref": "livingCentral",
  "refs": "Byun & Choi 2016; Choi et al. 2014",
  "cv": {
   "0": {
    "rho": 0.8024728659825304,
    "varPct": 0.4929423956606793,
    "objPct": 0.7259318837652113
   },
   "1": {
    "rho": 0.8024728659825304,
    "varPct": 0.8650606593442005,
    "objPct": 0.6910456531389484
   },
   "2": {
    "rho": 0.8024728659825304,
    "varPct": 0.8866450604705637,
    "objPct": 0.6284010456516925
   },
   "0.25": {
    "rho": 0.8024728659825304,
    "varPct": 0.7706179960456769,
    "objPct": 0.7117485254500048
   },
   "0.5": {
    "rho": 0.8024728659825304,
    "varPct": 0.812679222783949,
    "objPct": 0.707281268021497
   }
  },
  "weights": {
   "kitchenLiving": 0.0061,
   "entranceLiving": 0.0016,
   "entranceKitchen": -0.1048,
   "bathKitchen": -0.0517,
   "bathEntrance": 0.0451,
   "bathLiving": 0.0063,
   "multiKitchen": -0.0729,
   "bedEntrance": 0.056,
   "backBedEntrance": -0.0495,
   "backBedUnderBed": 0.0194,
   "backBedKitchen": 0.054,
   "bedLiving": -0.0901,
   "bedBed": 0.0901,
   "livingOffCenter": 0.7512,
   "masterNotEnd": 0,
   "entranceEnd": -0.0407,
   "kitchenEnd": 0.0854,
   "backBedEnd": 0.0696,
   "masterKitchen": -0.0638,
   "bedOverBath": -0.0031
  }
 },
 "genotypeTau": {
  "label": "거실 중심 유전형 순위 부합도 τ",
  "pref": "livingCentral",
  "refs": "Hillier, Hanson & Graham 1987; Byun & Choi 2016",
  "cv": {
   "0": {
    "rho": 0.47660034647519045,
    "varPct": 0.4789246981310804,
    "objPct": 0.7259318837652113
   },
   "1": {
    "rho": 0.47660034647519045,
    "varPct": 0.7377194882117619,
    "objPct": 0.8310302710965667
   },
   "2": {
    "rho": 0.47660034647519045,
    "varPct": 0.7661622378332065,
    "objPct": 0.8463250562154576
   },
   "0.25": {
    "rho": 0.47660034647519045,
    "varPct": 0.6191404676516161,
    "objPct": 0.791325812449728
   },
   "0.5": {
    "rho": 0.47660034647519045,
    "varPct": 0.6647575291593575,
    "objPct": 0.792369906427215
   }
  },
  "weights": {
   "kitchenLiving": 0.0349,
   "entranceLiving": 0.0063,
   "entranceKitchen": -0.0397,
   "bathKitchen": -0.0045,
   "bathEntrance": 0.0631,
   "bathLiving": -0.1107,
   "multiKitchen": -0.0221,
   "bedEntrance": 0.0003,
   "backBedEntrance": 0.0211,
   "backBedUnderBed": -0.0137,
   "backBedKitchen": -0.0076,
   "bedLiving": -0.0275,
   "bedBed": 0.0275,
   "livingOffCenter": 0.1724,
   "masterNotEnd": 0,
   "entranceEnd": 0.0503,
   "kitchenEnd": 0.1657,
   "backBedEnd": -0.0116,
   "masterKitchen": -0.1134,
   "bedOverBath": -0.1144
  }
 },
 "privacyDepthGap": {
  "label": "공·사 깊이 차",
  "pref": "privacy",
  "refs": "Ham & Lee 2017; Park et al. 2024",
  "cv": {
   "0": {
    "rho": 0.6292180409175286,
    "varPct": 0.6694364957480072,
    "objPct": 0.7259318837652113
   },
   "1": {
    "rho": 0.6292180409175286,
    "varPct": 0.8037512164356908,
    "objPct": 0.7125230495343746
   },
   "2": {
    "rho": 0.6292180409175286,
    "varPct": 0.8185738032929457,
    "objPct": 0.7039944731891465
   },
   "0.25": {
    "rho": 0.6292180409175286,
    "varPct": 0.7502756334139749,
    "objPct": 0.8121064749792539
   },
   "0.5": {
    "rho": 0.6292180409175286,
    "varPct": 0.7831665434561709,
    "objPct": 0.767549475431754
   }
  },
  "weights": {
   "kitchenLiving": -0.0462,
   "entranceLiving": -0.0673,
   "entranceKitchen": -0.1153,
   "bathKitchen": 0.0252,
   "bathEntrance": -0.0092,
   "bathLiving": 0.0104,
   "multiKitchen": 0.0581,
   "bedEntrance": 0.0767,
   "backBedEntrance": 0.0977,
   "backBedUnderBed": -0.0637,
   "backBedKitchen": 0.0948,
   "bedLiving": -0.0054,
   "bedBed": 0.0054,
   "livingOffCenter": -0.0907,
   "masterNotEnd": 0,
   "entranceEnd": 0.0542,
   "kitchenEnd": 0.1713,
   "backBedEnd": -0.0752,
   "masterKitchen": -0.1353,
   "bedOverBath": 0.0216
  }
 },
 "kitchenBedroomRatio": {
  "label": "주방/침실 통합도 비",
  "pref": "kitchenLink",
  "refs": "Byun & Choi 2016; Choi et al. 2014",
  "cv": {
   "0": {
    "rho": 0.711458943652266,
    "varPct": 0.5608608452094632,
    "objPct": 0.7259318837652113
   },
   "1": {
    "rho": 0.711458943652266,
    "varPct": 0.8662158994790277,
    "objPct": 0.834431570124587
   },
   "2": {
    "rho": 0.711458943652266,
    "varPct": 0.8961486714195028,
    "objPct": 0.8163909001781444
   },
   "0.25": {
    "rho": 0.711458943652266,
    "varPct": 0.7987986190337582,
    "objPct": 0.8141308230741173
   },
   "0.5": {
    "rho": 0.711458943652266,
    "varPct": 0.8473062640793729,
    "objPct": 0.8327466428173429
   }
  },
  "weights": {
   "kitchenLiving": -0.0392,
   "entranceLiving": -0.0115,
   "entranceKitchen": -0.0046,
   "bathKitchen": -0.0043,
   "bathEntrance": -0.0356,
   "bathLiving": 0.0152,
   "multiKitchen": 0.0342,
   "bedEntrance": -0.0001,
   "backBedEntrance": 0.098,
   "backBedUnderBed": 0.0046,
   "backBedKitchen": -0.0133,
   "bedLiving": -0.0134,
   "bedBed": 0.0134,
   "livingOffCenter": 0.1934,
   "masterNotEnd": 0,
   "entranceEnd": 0.0559,
   "kitchenEnd": 0.1565,
   "backBedEnd": -0.1759,
   "masterKitchen": -0.3391,
   "bedOverBath": 0.0211
  }
 }
};

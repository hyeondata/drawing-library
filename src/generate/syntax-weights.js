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
    "rho": 0.8024136239047822,
    "varPct": 0.49255784931484226,
    "objPct": 0.7324735297945876
   },
   "1": {
    "rho": 0.8024136239047822,
    "varPct": 0.8633643704593543,
    "objPct": 0.6897642309017041
   },
   "2": {
    "rho": 0.8024136239047822,
    "varPct": 0.8848964703304872,
    "objPct": 0.6275694953555588
   },
   "0.25": {
    "rho": 0.8024136239047822,
    "varPct": 0.7761952263245937,
    "objPct": 0.7250768037292029
   },
   "0.5": {
    "rho": 0.8024136239047822,
    "varPct": 0.8118540140384756,
    "objPct": 0.7142203077158027
   }
  },
  "weights": {
   "kitchenLiving": 0.0029,
   "entranceLiving": 0.0028,
   "entranceKitchen": -0.1088,
   "bathKitchen": -0.0588,
   "bathEntrance": 0.0432,
   "bathLiving": 0.0081,
   "multiKitchen": -0.0789,
   "bedEntrance": 0.0554,
   "backBedEntrance": -0.0476,
   "backBedUnderBed": 0.0189,
   "backBedKitchen": 0.0508,
   "bedLiving": -0.0904,
   "bedBed": 0.0904,
   "livingOffCenter": 0.7509,
   "masterNotEnd": 0,
   "entranceEnd": -0.0372,
   "kitchenEnd": 0.0843,
   "backBedEnd": 0.0741,
   "masterKitchen": -0.0701,
   "bedOverBath": -0.0043,
   "bath3Bed": 0
  }
 },
 "genotypeTau": {
  "label": "거실 중심 유전형 순위 부합도 τ",
  "pref": "livingCentral",
  "refs": "Hillier, Hanson & Graham 1987; Byun & Choi 2016",
  "cv": {
   "0": {
    "rho": 0.47990102614298974,
    "varPct": 0.4824189015820425,
    "objPct": 0.7324735297945876
   },
   "1": {
    "rho": 0.47990102614298974,
    "varPct": 0.723233238413209,
    "objPct": 0.8302212131936373
   },
   "2": {
    "rho": 0.47990102614298974,
    "varPct": 0.7426138201517234,
    "objPct": 0.8294371607787734
   },
   "0.25": {
    "rho": 0.47990102614298974,
    "varPct": 0.6247291006196221,
    "objPct": 0.796226551915221
   },
   "0.5": {
    "rho": 0.47990102614298974,
    "varPct": 0.6843177968135291,
    "objPct": 0.816804490744677
   }
  },
  "weights": {
   "kitchenLiving": 0.0432,
   "entranceLiving": 0.0109,
   "entranceKitchen": -0.0404,
   "bathKitchen": 0.0044,
   "bathEntrance": 0.0549,
   "bathLiving": -0.1107,
   "multiKitchen": -0.0181,
   "bedEntrance": 0.0052,
   "backBedEntrance": 0.0172,
   "backBedUnderBed": -0.0131,
   "backBedKitchen": 0.0018,
   "bedLiving": -0.0374,
   "bedBed": 0.0374,
   "livingOffCenter": 0.1203,
   "masterNotEnd": 0,
   "entranceEnd": 0.0422,
   "kitchenEnd": 0.1727,
   "backBedEnd": -0.0126,
   "masterKitchen": -0.1056,
   "bedOverBath": -0.1129,
   "bath3Bed": 0
  }
 },
 "privacyDepthGap": {
  "label": "공·사 깊이 차",
  "pref": "privacy",
  "refs": "Ham & Lee 2017; Park et al. 2024",
  "cv": {
   "0": {
    "rho": 0.6287426442080715,
    "varPct": 0.6697027288568014,
    "objPct": 0.7324735297945876
   },
   "1": {
    "rho": 0.6287426442080715,
    "varPct": 0.8078338004425517,
    "objPct": 0.7162068896759675
   },
   "2": {
    "rho": 0.6287426442080715,
    "varPct": 0.8288120458505825,
    "objPct": 0.688094414493297
   },
   "0.25": {
    "rho": 0.6287426442080715,
    "varPct": 0.7543582174208358,
    "objPct": 0.8235164784275539
   },
   "0.5": {
    "rho": 0.6287426442080715,
    "varPct": 0.7925780748314528,
    "objPct": 0.7486983563132719
   }
  },
  "weights": {
   "kitchenLiving": -0.0486,
   "entranceLiving": -0.0685,
   "entranceKitchen": -0.1127,
   "bathKitchen": 0.0285,
   "bathEntrance": 0.0018,
   "bathLiving": 0.0128,
   "multiKitchen": 0.0494,
   "bedEntrance": 0.0769,
   "backBedEntrance": 0.1017,
   "backBedUnderBed": -0.0636,
   "backBedKitchen": 0.0909,
   "bedLiving": -0.0069,
   "bedBed": 0.0069,
   "livingOffCenter": -0.0967,
   "masterNotEnd": 0,
   "entranceEnd": 0.0562,
   "kitchenEnd": 0.1637,
   "backBedEnd": -0.0809,
   "masterKitchen": -0.1399,
   "bedOverBath": 0.0264,
   "bath3Bed": 0
  }
 },
 "kitchenBedroomRatio": {
  "label": "주방/침실 통합도 비",
  "pref": "kitchenLink",
  "refs": "Byun & Choi 2016; Choi et al. 2014",
  "cv": {
   "0": {
    "rho": 0.7148294240938824,
    "varPct": 0.554013961427035,
    "objPct": 0.7324735297945876
   },
   "1": {
    "rho": 0.7148294240938824,
    "varPct": 0.8680560816221257,
    "objPct": 0.8338288940148844
   },
   "2": {
    "rho": 0.7148294240938824,
    "varPct": 0.8909863076440718,
    "objPct": 0.8051366714106736
   },
   "0.25": {
    "rho": 0.7148294240938824,
    "varPct": 0.7868910668924904,
    "objPct": 0.8237718777958709
   },
   "0.5": {
    "rho": 0.7148294240938824,
    "varPct": 0.8353987119381052,
    "objPct": 0.8386147134697455
   }
  },
  "weights": {
   "kitchenLiving": -0.0347,
   "entranceLiving": -0.0059,
   "entranceKitchen": -0.0018,
   "bathKitchen": 0.0037,
   "bathEntrance": -0.0264,
   "bathLiving": 0.0175,
   "multiKitchen": 0.0388,
   "bedEntrance": 0.0026,
   "backBedEntrance": 0.0998,
   "backBedUnderBed": 0.004,
   "backBedKitchen": -0.0124,
   "bedLiving": -0.0155,
   "bedBed": 0.0155,
   "livingOffCenter": 0.1896,
   "masterNotEnd": 0,
   "entranceEnd": 0.0516,
   "kitchenEnd": 0.1528,
   "backBedEnd": -0.1801,
   "masterKitchen": -0.3404,
   "bedOverBath": 0.0227,
   "bath3Bed": 0
  }
 }
};

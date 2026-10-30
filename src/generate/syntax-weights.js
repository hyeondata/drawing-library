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
    "rho": 0.8202316058444304,
    "varPct": 0.49255784931484226,
    "objPct": 0.7330695274372716
   },
   "1": {
    "rho": 0.8202316058444304,
    "varPct": 0.8785594123591267,
    "objPct": 0.6537204363534621
   },
   "2": {
    "rho": 0.8202316058444304,
    "varPct": 0.8914974780033067,
    "objPct": 0.6421424347743027
   },
   "0.25": {
    "rho": 0.8202316058444304,
    "varPct": 0.7901419501457816,
    "objPct": 0.7131175219452058
   },
   "0.5": {
    "rho": 0.8202316058444304,
    "varPct": 0.8226554077666985,
    "objPct": 0.698517787093602
   }
  },
  "weights": {
   "kitchenLiving": 0.0033,
   "entranceLiving": -0.0304,
   "entranceKitchen": -0.1152,
   "bathKitchen": -0.0328,
   "bathEntrance": 0.0259,
   "bathLiving": 0.009,
   "multiKitchen": -0.0451,
   "bedEntrance": 0.0304,
   "backBedEntrance": -0.0764,
   "backBedUnderBed": 0.0194,
   "backBedKitchen": 0.0858,
   "bedLiving": -0.2563,
   "bedBed": 0.2563,
   "livingOffCenter": -0.07,
   "masterNotEnd": 0,
   "entranceEnd": -0.0574,
   "kitchenEnd": 0.1073,
   "backBedEnd": 0.0716,
   "masterKitchen": -0.069,
   "bedOverBath": -0.0034,
   "bath3Bed": 0
  }
 },
 "genotypeTau": {
  "label": "거실 중심 유전형 순위 부합도 τ",
  "pref": "livingCentral",
  "refs": "Hillier, Hanson & Graham 1987; Byun & Choi 2016",
  "cv": {
   "0": {
    "rho": 0.4923953130640102,
    "varPct": 0.4823052652184061,
    "objPct": 0.7330695274372716
   },
   "1": {
    "rho": 0.4923953130640102,
    "varPct": 0.7305005309033274,
    "objPct": 0.8450153922278372
   },
   "2": {
    "rho": 0.4923953130640102,
    "varPct": 0.7613011125185989,
    "objPct": 0.8355501366697059
   },
   "0.25": {
    "rho": 0.4923953130640102,
    "varPct": 0.596732133423361,
    "objPct": 0.789002909530049
   },
   "0.5": {
    "rho": 0.4923953130640102,
    "varPct": 0.6311300276735858,
    "objPct": 0.7870713318597735
   }
  },
  "weights": {
   "kitchenLiving": 0.0627,
   "entranceLiving": 0.0075,
   "entranceKitchen": -0.0665,
   "bathKitchen": -0.0203,
   "bathEntrance": 0.0572,
   "bathLiving": -0.103,
   "multiKitchen": -0.0419,
   "bedEntrance": -0.0075,
   "backBedEntrance": 0.0252,
   "backBedUnderBed": -0.0215,
   "backBedKitchen": -0.0207,
   "bedLiving": -0.1125,
   "bedBed": 0.1125,
   "livingOffCenter": -0.2791,
   "masterNotEnd": 0,
   "entranceEnd": 0.0461,
   "kitchenEnd": 0.1494,
   "backBedEnd": -0.0101,
   "masterKitchen": -0.1012,
   "bedOverBath": -0.1149,
   "bath3Bed": 0
  }
 },
 "privacyDepthGap": {
  "label": "공·사 깊이 차",
  "pref": "privacy",
  "refs": "Ham & Lee 2017; Park et al. 2024",
  "cv": {
   "0": {
    "rho": 0.6317455781175504,
    "varPct": 0.6695285128289268,
    "objPct": 0.7330695274372716
   },
   "1": {
    "rho": 0.6317455781175504,
    "varPct": 0.8063597315215749,
    "objPct": 0.7480837358356505
   },
   "2": {
    "rho": 0.6317455781175504,
    "varPct": 0.8115570999426276,
    "objPct": 0.7218995253093345
   },
   "0.25": {
    "rho": 0.6317455781175504,
    "varPct": 0.7602610621307331,
    "objPct": 0.8029771925616611
   },
   "0.5": {
    "rho": 0.6317455781175504,
    "varPct": 0.7621445277087506,
    "objPct": 0.7935312831199324
   }
  },
  "weights": {
   "kitchenLiving": -0.0651,
   "entranceLiving": -0.0872,
   "entranceKitchen": -0.1732,
   "bathKitchen": -0.0175,
   "bathEntrance": -0.0003,
   "bathLiving": 0.0052,
   "multiKitchen": 0.0059,
   "bedEntrance": 0.0872,
   "backBedEntrance": 0.1202,
   "backBedUnderBed": -0.0556,
   "backBedKitchen": 0.0644,
   "bedLiving": -0.0575,
   "bedBed": 0.0575,
   "livingOffCenter": -0.4224,
   "masterNotEnd": 0,
   "entranceEnd": 0.0554,
   "kitchenEnd": 0.1204,
   "backBedEnd": -0.0765,
   "masterKitchen": -0.142,
   "bedOverBath": 0.0262,
   "bath3Bed": 0
  }
 },
 "kitchenBedroomRatio": {
  "label": "주방/침실 통합도 비",
  "pref": "kitchenLink",
  "refs": "Byun & Choi 2016; Choi et al. 2014",
  "cv": {
   "0": {
    "rho": 0.7215352449520872,
    "varPct": 0.5537639878234029,
    "objPct": 0.7330695274372716
   },
   "1": {
    "rho": 0.7215352449520872,
    "varPct": 0.8634059895410944,
    "objPct": 0.8370003514558241
   },
   "2": {
    "rho": 0.7215352449520872,
    "varPct": 0.880011332037907,
    "objPct": 0.8103701271316887
   },
   "0.25": {
    "rho": 0.7215352449520872,
    "varPct": 0.7867395517409752,
    "objPct": 0.8245816318347763
   },
   "0.5": {
    "rho": 0.7215352449520872,
    "varPct": 0.8390829224644211,
    "objPct": 0.8374457694024706
   }
  },
  "weights": {
   "kitchenLiving": -0.0433,
   "entranceLiving": -0.0066,
   "entranceKitchen": -0.0267,
   "bathKitchen": -0.0355,
   "bathEntrance": -0.0139,
   "bathLiving": 0.0132,
   "multiKitchen": -0.0039,
   "bedEntrance": 0.0066,
   "backBedEntrance": 0.1345,
   "backBedUnderBed": 0.0077,
   "backBedKitchen": -0.0507,
   "bedLiving": -0.0383,
   "bedBed": 0.0383,
   "livingOffCenter": 0.0993,
   "masterNotEnd": 0,
   "entranceEnd": 0.0669,
   "kitchenEnd": 0.1167,
   "backBedEnd": -0.1753,
   "masterKitchen": -0.341,
   "bedOverBath": 0.0215,
   "bath3Bed": 0
  }
 }
};

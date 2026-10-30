// scripts/build-aihub-stats.mjs가 만든 파일(손대지 말 것). AI 허브 SPA 라벨 전체(TL_SPA)의 아파트 평면도(APT_FP) 세대 요약.
// 도면 9645건 → 세대 23116개, 그중 필수 실이 모두 있는 아파트 평면도(APT_FP) 18961개, 반복 세대를 뺀 15018개.
export const AIHUB = {
 "source": {
  "dataset": "AI 허브 건축 도면 데이터 SPA 라벨(TL_SPA)",
  "files": 9645,
  "failed": 0,
  "units": 23116,
  "generatedAt": "2026-10-30",
  "referenceBedSide": 297,
  "byType": {
   "APT_CS": 640,
   "APT_FP": 19895,
   "DEH_CS": 130,
   "DEH_FP": 869,
   "ROW_CS": 170,
   "ROW_FP": 1412
  },
  "aptComplete": 18961,
  "aptUnique": 15018
 },
 "calib": {
  "bedSide": {
   "p10": 184.9,
   "p25": 221.8,
   "p50": 297,
   "p75": 390.2,
   "p90": 485.26
  },
  "gap": {
   "interior": {
    "p50": 15,
    "p75": 51,
    "p90": 83
   },
   "exterior": {
    "p50": 18,
    "p75": 28,
    "p90": 69
   }
  }
 },
 "rulePass": {
  "program": 1,
  "reachable": 0.968,
  "livingCentral": 0.973,
  "livingNear": 1,
  "entry": 1,
  "kitchenLiving": 0.957,
  "bedroomPrivacy": 0.997,
  "publicBath": 0.998,
  "daylight": 0.792,
  "masterSuite": 0.778
 },
 "bedrooms": {
  "1": 77,
  "2": 892,
  "3": 10176,
  "4": 3052,
  "5": 290,
  "6": 511,
  "7": 16,
  "8": 4
 },
 "baths": {
  "1": 355,
  "2": 10867,
  "3": 2866,
  "4": 647,
  "5": 278,
  "6": 4,
  "7": 1
 },
 "living": {
  "p10": 0.2256,
  "p25": 0.2368,
  "p50": 0.2612,
  "p75": 0.2846,
  "p90": 0.3103
 },
 "byBedrooms": {
  "1": {
   "n": 77,
   "other": {
    "p25": null,
    "p50": null,
    "p75": null
   },
   "masterRatio": {
    "p25": null,
    "p50": null,
    "p75": null
   },
   "master": 0.1818,
   "kitchen": 0.1516,
   "entrance": 0.0436,
   "bath": 0.0607,
   "dress": 0.0388,
   "multi": 0.2027,
   "composition": {
    "baths2": 0.364,
    "baths3": 0,
    "dress": 0.455,
    "multi": 0.403,
    "outdoorUnit": 0.623,
    "balcony": 0.896
   }
  },
  "2": {
   "n": 892,
   "other": {
    "p25": 0.0975,
    "p50": 0.119,
    "p75": 0.1497
   },
   "masterRatio": {
    "p25": 1.0404,
    "p50": 1.2049,
    "p75": 1.6907
   },
   "master": 0.1557,
   "kitchen": 0.1382,
   "entrance": 0.0491,
   "bath": 0.046,
   "dress": 0.0558,
   "multi": 0.0332,
   "composition": {
    "baths2": 0.785,
    "baths3": 0.059,
    "dress": 0.743,
    "multi": 0.113,
    "outdoorUnit": 0.833,
    "balcony": 0.92
   }
  },
  "3": {
   "n": 10176,
   "other": {
    "p25": 0.079,
    "p50": 0.0923,
    "p75": 0.1038
   },
   "masterRatio": {
    "p25": 1.2962,
    "p50": 1.5904,
    "p75": 1.9041
   },
   "master": 0.147,
   "kitchen": 0.1421,
   "entrance": 0.0351,
   "bath": 0.0359,
   "dress": 0.0534,
   "multi": 0.0369,
   "composition": {
    "baths2": 0.989,
    "baths3": 0.225,
    "dress": 0.766,
    "multi": 0.157,
    "outdoorUnit": 0.786,
    "balcony": 0.728
   }
  },
  "4": {
   "n": 3052,
   "other": {
    "p25": 0.0675,
    "p50": 0.0753,
    "p75": 0.0832
   },
   "masterRatio": {
    "p25": 1.5586,
    "p50": 1.6516,
    "p75": 1.9231
   },
   "master": 0.1259,
   "kitchen": 0.1195,
   "entrance": 0.0302,
   "bath": 0.0326,
   "dress": 0.0445,
   "multi": 0.026,
   "composition": {
    "baths2": 0.998,
    "baths3": 0.253,
    "dress": 0.897,
    "multi": 0.1,
    "outdoorUnit": 0.85,
    "balcony": 0.968
   }
  },
  "5": {
   "n": 290,
   "other": {
    "p25": 0.0476,
    "p50": 0.0553,
    "p75": 0.0665
   },
   "masterRatio": {
    "p25": 1.599,
    "p50": 1.818,
    "p75": 2.0436
   },
   "master": 0.112,
   "kitchen": 0.1054,
   "entrance": 0.0212,
   "bath": 0.0236,
   "dress": 0.0366,
   "multi": 0.0147,
   "composition": {
    "baths2": 1,
    "baths3": 0.569,
    "dress": 0.855,
    "multi": 0.252,
    "outdoorUnit": 0.752,
    "balcony": 0.993
   }
  }
 },
 "composition": {
  "baths2": 0.976,
  "baths3": 0.253,
  "dress": 0.799,
  "multi": 0.145,
  "outdoorUnit": 0.783,
  "balcony": 0.8
 },
 "targets": {
  "kitchen": 0.1391,
  "entrance": 0.0342,
  "bath": 0.0345,
  "dress": 0.051,
  "multi": 0.0335
 },
 "features": {
  "genotypeTau": {
   "p10": 0.2,
   "p25": 0.4,
   "p50": 0.6,
   "p75": 0.8,
   "p90": 1
  },
  "privacyDepthGap": {
   "p10": 0.3,
   "p25": 0.5,
   "p50": 0.75,
   "p75": 0.9,
   "p90": 1.1
  },
  "kitchenBedroomRatio": {
   "p10": 0.8556,
   "p25": 0.9464,
   "p50": 1.1667,
   "p75": 1.3664,
   "p90": 1.5429
  },
  "livingBedroomRatio": {
   "p10": 1.7947,
   "p25": 2.0667,
   "p50": 2.4224,
   "p75": 2.9412,
   "p90": 3.4159
  },
  "publicPrivateRatio": {
   "p10": 0.967,
   "p25": 1.0503,
   "p50": 1.1843,
   "p75": 1.2692,
   "p90": 1.4129
  },
  "roomAspectRatio": {
   "p10": 1.2635,
   "p25": 1.3703,
   "p50": 1.5326,
   "p75": 1.7736,
   "p90": 2.0953
  },
  "roomRectangularity": {
   "p10": 0.7293,
   "p25": 0.7659,
   "p50": 0.8123,
   "p75": 0.8378,
   "p90": 0.859
  },
  "exteriorExposure": {
   "p10": 0.1209,
   "p25": 0.229,
   "p50": 0.2688,
   "p75": 0.3059,
   "p90": 0.3394
  },
  "bedroomMinWidth": {
   "p10": 0.6794,
   "p25": 0.758,
   "p50": 0.8202,
   "p75": 0.8777,
   "p90": 0.9317
  }
 }
};

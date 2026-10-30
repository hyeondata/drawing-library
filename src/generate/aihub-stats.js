// scripts/build-aihub-stats.mjs가 만든 파일(손대지 말 것). AI 허브 SPA 라벨 전체(TL_SPA)의 아파트 평면도(APT_FP) 세대 요약.
// 도면 9645건 → 세대 22732개, 그중 필수 실이 모두 있는 아파트 평면도(APT_FP) 18931개, 반복 세대를 뺀 7970개.
export const AIHUB = {
 "source": {
  "dataset": "AI 허브 건축 도면 데이터 SPA 라벨(TL_SPA)",
  "files": 9645,
  "failed": 0,
  "units": 22732,
  "generatedAt": "2026-10-30",
  "referenceBedSide": 297,
  "byType": {
   "APT_CS": 676,
   "APT_FP": 19449,
   "DEH_CS": 130,
   "DEH_FP": 890,
   "ROW_CS": 181,
   "ROW_FP": 1406
  },
  "aptComplete": 18931,
  "aptUnique": 7970
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
  "reachable": 0.943,
  "livingCentral": 0.977,
  "livingNear": 0.999,
  "entry": 0.999,
  "kitchenLiving": 0.977,
  "bedroomPrivacy": 0.996,
  "publicBath": 0.996,
  "daylight": 0.905,
  "masterSuite": 0.798
 },
 "bedrooms": {
  "1": 76,
  "2": 476,
  "3": 5087,
  "4": 1896,
  "5": 264,
  "6": 151,
  "7": 16,
  "8": 4
 },
 "baths": {
  "1": 350,
  "2": 6074,
  "3": 1047,
  "4": 369,
  "5": 125,
  "6": 4,
  "7": 1
 },
 "living": {
  "p10": 0.2242,
  "p25": 0.2407,
  "p50": 0.2628,
  "p75": 0.2888,
  "p90": 0.3177
 },
 "byBedrooms": {
  "1": {
   "n": 76,
   "living": {
    "p25": 0.2427,
    "p50": 0.2738,
    "p75": 0.3589,
    "p90": 0.3867
   },
   "etc": {
    "p50": 0.117,
    "p75": 0.2024,
    "p90": 0.2501
   },
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
   "master": 0.1823,
   "kitchen": 0.1518,
   "entrance": 0.0439,
   "bath": 0.0612,
   "dress": 0.0464,
   "multi": 0.2027,
   "composition": {
    "baths2": 0.355,
    "baths3": 0,
    "dress": 0.447,
    "multi": 0.395,
    "outdoorUnit": 0.618,
    "balcony": 0.895
   }
  },
  "2": {
   "n": 476,
   "living": {
    "p25": 0.2501,
    "p50": 0.2814,
    "p75": 0.3136,
    "p90": 0.3389
   },
   "etc": {
    "p50": 0.1,
    "p75": 0.1551,
    "p90": 0.2475
   },
   "other": {
    "p25": 0.0914,
    "p50": 0.1177,
    "p75": 0.1474
   },
   "masterRatio": {
    "p25": 1.1282,
    "p50": 1.3452,
    "p75": 1.6907
   },
   "master": 0.1642,
   "kitchen": 0.1413,
   "entrance": 0.041,
   "bath": 0.0448,
   "dress": 0.051,
   "multi": 0.0332,
   "composition": {
    "baths2": 0.613,
    "baths3": 0.08,
    "dress": 0.54,
    "multi": 0.2,
    "outdoorUnit": 0.695,
    "balcony": 0.866
   }
  },
  "3": {
   "n": 5087,
   "living": {
    "p25": 0.239,
    "p50": 0.2629,
    "p75": 0.2886,
    "p90": 0.3177
   },
   "etc": {
    "p50": 0.0911,
    "p75": 0.1261,
    "p90": 0.1662
   },
   "other": {
    "p25": 0.0781,
    "p50": 0.0913,
    "p75": 0.1036
   },
   "masterRatio": {
    "p25": 1.3099,
    "p50": 1.5823,
    "p75": 1.9344
   },
   "master": 0.1471,
   "kitchen": 0.1387,
   "entrance": 0.0359,
   "bath": 0.0377,
   "dress": 0.0514,
   "multi": 0.0327,
   "composition": {
    "baths2": 0.979,
    "baths3": 0.103,
    "dress": 0.738,
    "multi": 0.212,
    "outdoorUnit": 0.747,
    "balcony": 0.826
   }
  },
  "4": {
   "n": 1896,
   "living": {
    "p25": 0.2453,
    "p50": 0.2676,
    "p75": 0.2862,
    "p90": 0.3068
   },
   "etc": {
    "p50": 0.0939,
    "p75": 0.1238,
    "p90": 0.182
   },
   "other": {
    "p25": 0.0651,
    "p50": 0.0753,
    "p75": 0.0825
   },
   "masterRatio": {
    "p25": 1.5572,
    "p50": 1.6495,
    "p75": 1.9102
   },
   "master": 0.1228,
   "kitchen": 0.1195,
   "entrance": 0.0311,
   "bath": 0.0308,
   "dress": 0.0454,
   "multi": 0.0256,
   "composition": {
    "baths2": 0.994,
    "baths3": 0.355,
    "dress": 0.885,
    "multi": 0.16,
    "outdoorUnit": 0.726,
    "balcony": 0.946
   }
  },
  "5": {
   "n": 264,
   "living": {
    "p25": 0.2162,
    "p50": 0.2418,
    "p75": 0.2615,
    "p90": 0.3064
   },
   "etc": {
    "p50": 0.1314,
    "p75": 0.2881,
    "p90": 0.3606
   },
   "other": {
    "p25": 0.0469,
    "p50": 0.0559,
    "p75": 0.0669
   },
   "masterRatio": {
    "p25": 1.5987,
    "p50": 1.8099,
    "p75": 2.0436
   },
   "master": 0.1109,
   "kitchen": 0.0975,
   "entrance": 0.0209,
   "bath": 0.0236,
   "dress": 0.0363,
   "multi": 0.0147,
   "composition": {
    "baths2": 1,
    "baths3": 0.572,
    "dress": 0.841,
    "multi": 0.212,
    "outdoorUnit": 0.727,
    "balcony": 0.992
   }
  }
 },
 "composition": {
  "baths2": 0.956,
  "baths3": 0.194,
  "dress": 0.766,
  "multi": 0.201,
  "outdoorUnit": 0.734,
  "balcony": 0.863
 },
 "targets": {
  "kitchen": 0.133,
  "entrance": 0.035,
  "bath": 0.0349,
  "dress": 0.0496,
  "multi": 0.0312
 },
 "features": {
  "genotypeTau": {
   "p10": 0.2,
   "p25": 0.4,
   "p50": 0.7379,
   "p75": 0.8,
   "p90": 1
  },
  "privacyDepthGap": {
   "p10": 0.25,
   "p25": 0.5,
   "p50": 0.75,
   "p75": 0.8333,
   "p90": 1.1
  },
  "kitchenBedroomRatio": {
   "p10": 0.8442,
   "p25": 0.946,
   "p50": 1.1172,
   "p75": 1.3218,
   "p90": 1.5
  },
  "livingBedroomRatio": {
   "p10": 1.8182,
   "p25": 2.0579,
   "p50": 2.4159,
   "p75": 2.9971,
   "p90": 3.5
  },
  "publicPrivateRatio": {
   "p10": 0.967,
   "p25": 1.0587,
   "p50": 1.1707,
   "p75": 1.2757,
   "p90": 1.4473
  },
  "roomAspectRatio": {
   "p10": 1.2626,
   "p25": 1.3678,
   "p50": 1.537,
   "p75": 1.7449,
   "p90": 2.038
  },
  "roomRectangularity": {
   "p10": 0.7269,
   "p25": 0.7626,
   "p50": 0.8081,
   "p75": 0.8378,
   "p90": 0.8607
  },
  "exteriorExposure": {
   "p10": 0.2187,
   "p25": 0.2526,
   "p50": 0.283,
   "p75": 0.3205,
   "p90": 0.3567
  },
  "bedroomMinWidth": {
   "p10": 0.6976,
   "p25": 0.7646,
   "p50": 0.8329,
   "p75": 0.8858,
   "p90": 0.9352
  }
 }
};

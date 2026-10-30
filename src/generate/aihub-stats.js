// scripts/build-aihub-stats.mjs가 만든 파일(손대지 말 것). AI 허브 SPA 라벨 전체(TL_SPA)의 아파트 평면도(APT_FP) 세대 요약.
// 도면 9645건 → 세대 23116개, 그중 필수 실이 모두 있는 아파트 평면도(APT_FP) 18961개, 반복 세대를 뺀 7912개.
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
  "aptUnique": 7912
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
  "livingCentral": 0.982,
  "livingNear": 1,
  "entry": 0.999,
  "kitchenLiving": 0.979,
  "bedroomPrivacy": 0.996,
  "publicBath": 0.996,
  "daylight": 0.913,
  "masterSuite": 0.802
 },
 "bedrooms": {
  "1": 76,
  "2": 475,
  "3": 5169,
  "4": 1761,
  "5": 258,
  "6": 153,
  "7": 16,
  "8": 4
 },
 "baths": {
  "1": 344,
  "2": 6075,
  "3": 1186,
  "4": 245,
  "5": 57,
  "6": 4,
  "7": 1
 },
 "living": {
  "p10": 0.2254,
  "p25": 0.2409,
  "p50": 0.2643,
  "p75": 0.2897,
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
   "n": 475,
   "living": {
    "p25": 0.2501,
    "p50": 0.281,
    "p75": 0.3136,
    "p90": 0.3382
   },
   "etc": {
    "p50": 0.1,
    "p75": 0.1551,
    "p90": 0.2475
   },
   "other": {
    "p25": 0.0914,
    "p50": 0.1177,
    "p75": 0.1475
   },
   "masterRatio": {
    "p25": 1.1282,
    "p50": 1.3452,
    "p75": 1.6907
   },
   "master": 0.1642,
   "kitchen": 0.1413,
   "entrance": 0.0411,
   "bath": 0.0448,
   "dress": 0.0509,
   "multi": 0.0332,
   "composition": {
    "baths2": 0.613,
    "baths3": 0.078,
    "dress": 0.539,
    "multi": 0.2,
    "outdoorUnit": 0.695,
    "balcony": 0.865
   }
  },
  "3": {
   "n": 5169,
   "living": {
    "p25": 0.2397,
    "p50": 0.2638,
    "p75": 0.2891,
    "p90": 0.3177
   },
   "etc": {
    "p50": 0.0907,
    "p75": 0.1245,
    "p90": 0.1655
   },
   "other": {
    "p25": 0.0784,
    "p50": 0.0913,
    "p75": 0.1033
   },
   "masterRatio": {
    "p25": 1.3107,
    "p50": 1.5846,
    "p75": 1.9311
   },
   "master": 0.1471,
   "kitchen": 0.1387,
   "entrance": 0.0362,
   "bath": 0.0375,
   "dress": 0.0517,
   "multi": 0.0325,
   "composition": {
    "baths2": 0.98,
    "baths3": 0.118,
    "dress": 0.743,
    "multi": 0.211,
    "outdoorUnit": 0.742,
    "balcony": 0.826
   }
  },
  "4": {
   "n": 1761,
   "living": {
    "p25": 0.2481,
    "p50": 0.2696,
    "p75": 0.2885,
    "p90": 0.3072
   },
   "etc": {
    "p50": 0.0974,
    "p75": 0.1246,
    "p90": 0.1845
   },
   "other": {
    "p25": 0.0645,
    "p50": 0.0739,
    "p75": 0.0832
   },
   "masterRatio": {
    "p25": 1.5423,
    "p50": 1.6516,
    "p75": 1.9193
   },
   "master": 0.1235,
   "kitchen": 0.1195,
   "entrance": 0.0309,
   "bath": 0.0314,
   "dress": 0.0474,
   "multi": 0.026,
   "composition": {
    "baths2": 0.997,
    "baths3": 0.307,
    "dress": 0.877,
    "multi": 0.157,
    "outdoorUnit": 0.766,
    "balcony": 0.957
   }
  },
  "5": {
   "n": 258,
   "living": {
    "p25": 0.2162,
    "p50": 0.2429,
    "p75": 0.2615,
    "p90": 0.3065
   },
   "etc": {
    "p50": 0.1366,
    "p75": 0.2887,
    "p90": 0.3616
   },
   "other": {
    "p25": 0.0469,
    "p50": 0.0559,
    "p75": 0.067
   },
   "masterRatio": {
    "p25": 1.5977,
    "p50": 1.7994,
    "p75": 2.0436
   },
   "master": 0.1079,
   "kitchen": 0.0958,
   "entrance": 0.0207,
   "bath": 0.024,
   "dress": 0.0361,
   "multi": 0.0147,
   "composition": {
    "baths2": 1,
    "baths3": 0.562,
    "dress": 0.837,
    "multi": 0.194,
    "outdoorUnit": 0.721,
    "balcony": 0.992
   }
  }
 },
 "composition": {
  "baths2": 0.957,
  "baths3": 0.189,
  "dress": 0.764,
  "multi": 0.2,
  "outdoorUnit": 0.739,
  "balcony": 0.864
 },
 "targets": {
  "kitchen": 0.1337,
  "entrance": 0.0349,
  "bath": 0.0349,
  "dress": 0.0495,
  "multi": 0.0313
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
   "p10": 0.25,
   "p25": 0.5,
   "p50": 0.75,
   "p75": 0.8333,
   "p90": 1.1
  },
  "kitchenBedroomRatio": {
   "p10": 0.8404,
   "p25": 0.9429,
   "p50": 1.1142,
   "p75": 1.3194,
   "p90": 1.5052
  },
  "livingBedroomRatio": {
   "p10": 1.8,
   "p25": 2.0579,
   "p50": 2.4231,
   "p75": 2.9971,
   "p90": 3.5044
  },
  "publicPrivateRatio": {
   "p10": 0.967,
   "p25": 1.062,
   "p50": 1.1746,
   "p75": 1.2777,
   "p90": 1.4574
  },
  "roomAspectRatio": {
   "p10": 1.262,
   "p25": 1.3667,
   "p50": 1.5337,
   "p75": 1.7603,
   "p90": 2.0599
  },
  "roomRectangularity": {
   "p10": 0.7244,
   "p25": 0.7612,
   "p50": 0.8085,
   "p75": 0.8382,
   "p90": 0.8607
  },
  "exteriorExposure": {
   "p10": 0.2226,
   "p25": 0.2532,
   "p50": 0.2835,
   "p75": 0.3213,
   "p90": 0.3571
  },
  "bedroomMinWidth": {
   "p10": 0.6968,
   "p25": 0.7639,
   "p50": 0.8312,
   "p75": 0.884,
   "p90": 0.9311
  }
 }
};

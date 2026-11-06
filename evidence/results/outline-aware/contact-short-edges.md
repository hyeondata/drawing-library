# 맞닿음 규약 민감도: QUBO 그래프 간선 중 AI Hub 0.44 m 미만 (보고만)

> `SPECS=rq4 node scripts/outline-aware/contact-short-edges.mjs` · 연결된 정렬 틀 배치 전부(사양 80개 기본 치수)

- 0.44 m 미만 간선이 있는 배치: 2,464 / 15,072 = **16.3%**
- 그 간선을 빼면 그래프가 끊기는 배치: 0
- GEN 항(β·f) 중 하나라도 바뀌는 배치: 1,246 = **8.3%**
- 짧은 간선 길이 10%·50%·90%: 0.1 · 0.2 · 0.25 m
- 많은 쌍: 기타(hall) – 화장실(bathPublic) 638; 기타(hall) – 현관(entrance) 638; 기타(hall) – 다목적공간(multi) 572; 기타(hall) – 주방(kitchen) 348; 기타(hall) – 침실(bed) 280; 거실(living) – 현관(entrance) 76; 거실(living) – 화장실(bathPublic) 76; 거실(living) – 다목적공간(multi) 52
- abs(ΔE_GEN) 중앙값·90%·최대: 0.015 · 0.526 · 1.304
- 한계: 사양 기본 치수만 봄. 판정 없음(현 규약 유지는 10-08 K1에서 결정).

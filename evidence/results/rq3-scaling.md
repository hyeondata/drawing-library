# RQ3: 정확 공간구문 QUBO의 SA 성능 — 규모·스위프·벌점·순열 SA·임베딩

> `SPECS=rq4 uv run python -m syntax_qubo.rq3_scaling` · CPU 16코어 · dwave-samplers SA · 적중 = 유효한 배치이면서 목적값이 열거 최적 E*와 같음 · TTS99 = 99% 확률로 한 번 이상 적중하는 데 드는 시간(읽기 하나 시간 × ln0.01/ln(1−p))

## 1. QUBO SA: 규모와 스위프

| 인스턴스 | 배치 수 | 목적 | 변수 | 이차항 | p 배치 최적 (1k / 10k / 50k 스위프) | p_E 바닥 상태 (1k / 10k / 50k) | TTS99, p 기준 (1k / 10k / 50k) | E*보다 낮은 읽기 |
|---|---|---|---|---|---|---|---|---|
| real 0/1 (2+4) | 48 | O1_living_RRA | 340 | 2,656 | 35.31% / 34.38% / 31.56% | 0.00% / 0.47% / 0.00% | 49 ms / 493 ms / 2.7 s | 0 |
| real 0/1 (2+4) | 48 | O2_entrance_RRA | 340 | 2,638 | 42.50% / 44.69% / 46.25% | 0.16% / 0.00% / 0.00% | 39 ms / 353 ms / 1.7 s | 0 |
| real 0/1 (2+4) | 48 | O3_privacy_gap | 508 | 3,242 | 3.12% / 4.38% / 3.12% | 0.00% / 0.47% / 1.56% | 1.6 s / 11.2 s / 78.5 s | 0 |
| real 0/1 (2+4) | 48 | GEN_model | 1,276 | 9,044 | 0.00% / 0.00% / 1.56% | 0.00% / 0.00% / 0.00% | ∞ / ∞ / 225.9 s | 0 |
| real 47/2 (3+4) | 144 | O1_living_RRA | 409 | 3,281 | 8.59% / 7.97% / 7.19% | 0.00% / 0.00% / 0.00% | 302 ms / 3.1 s / 17.2 s | 0 |
| real 47/2 (3+4) | 144 | O2_entrance_RRA | 414 | 3,387 | 17.81% / 20.78% / 22.50% | 0.00% / 0.00% / 0.00% | 140 ms / 1.1 s / 5.2 s | 0 |
| real 47/2 (3+4) | 144 | O3_privacy_gap | 612 | 4,103 | 1.56% / 2.34% / 2.81% | 0.00% / 0.47% / 1.25% | 4.0 s / 26.3 s / 108.8 s | 0 |
| real 47/2 (3+4) | 144 | GEN_model | 1,497 | 10,942 | 0.00% / 0.00% / 0.00% | 0.00% / 0.00% / 0.00% | ∞ / ∞ / ∞ | 0 |
| real 72/2 (3+5) | 720 | O1_living_RRA | 643 | 7,179 | 5.62% / 4.53% / 6.88% | 0.00% / 0.00% / 0.00% | 781 ms / 9.6 s / 31.1 s | 0 |
| real 72/2 (3+5) | 720 | O2_entrance_RRA | 650 | 7,357 | 0.62% / 1.25% / 0.31% | 0.00% / 0.00% / 0.00% | 7.7 s / 37.6 s / 750.5 s | 0 |
| real 72/2 (3+5) | 720 | O3_privacy_gap | 1,142 | 9,217 | 0.00% / 2.50% / 1.88% | 0.00% / 0.00% / 0.00% | ∞ / 48.6 s / 341.0 s | 0 |
| real 72/2 (3+5) | 720 | GEN_model | 2,901 | 24,995 | 0.00% / 0.00% / 0.00% | 0.00% / 0.00% / 0.00% | ∞ / ∞ / ∞ | 0 |
| synthetic +2 back +0 front | 4,320 | O1_living_RRA | 845 | 10,145 | 3.59% / 2.97% / 2.19% | 0.00% / 0.00% / 0.00% | 1.8 s / 21.1 s / 139.3 s | 0 |
| synthetic +2 back +0 front | 4,320 | O2_entrance_RRA | 852 | 10,315 | 0.47% / 1.41% / 0.31% | 0.00% / 0.00% / 0.00% | 13.4 s / 43.0 s / 979.3 s | 0 |
| synthetic +2 back +0 front | 4,320 | O3_privacy_gap | 1,452 | 12,601 | 0.00% / 0.00% / 0.31% | 0.00% / 0.00% / 0.00% | ∞ / ∞ / 2757.9 s | 0 |
| synthetic +2 back +0 front | 4,320 | GEN_model | 3,583 | 33,397 | 0.00% / 0.00% / 0.00% | 0.00% / 0.00% / 0.00% | ∞ / ∞ / ∞ | 0 |
| synthetic +3 back +0 front | 30,240 | O1_living_RRA | 1,096 | 14,472 | 4.69% / 4.06% / 4.69% | 0.00% / 0.00% / 0.00% | 1.8 s / 20.3 s / 86.4 s | 0 |
| synthetic +3 back +0 front | 30,240 | O2_entrance_RRA | 1,103 | 14,634 | 1.56% / 2.03% / 0.62% | 0.00% / 0.00% / 0.00% | 5.6 s / 41.0 s / 672.4 s | 0 |
| synthetic +3 back +0 front | 30,240 | O3_privacy_gap | 1,823 | 17,394 | 0.00% / 0.00% / 0.00% | 0.00% / 0.00% / 0.00% | ∞ / ∞ / ∞ | 0 |
| synthetic +3 back +0 front | 30,240 | GEN_model | 4,366 | 44,256 | 0.00% / 0.00% / 0.00% | 0.00% / 0.00% / 0.00% | ∞ / ∞ / ∞ | 0 |
| synthetic +3 back +1 front | 120,960 | O1_living_RRA | 1,242 | 16,474 | 48.12% / 85.16% / 92.19% | 0.00% / 0.00% / 0.00% | 152 ms / 504 ms / 1.9 s | 0 |
| synthetic +3 back +1 front | 120,960 | O2_entrance_RRA | 1,256 | 16,946 | 0.31% / 0.00% / 0.31% | 0.00% / 0.00% / 0.00% | 32.4 s / ∞ / 1563.7 s | 0 |
| synthetic +3 back +1 front | 120,960 | O3_privacy_gap | 2,048 | 19,984 | 0.00% / 0.00% / 0.00% | 0.00% / 0.00% / 0.00% | ∞ / ∞ / ∞ | 0 |
| synthetic +3 back +1 front | 120,960 | GEN_model | 4,822 | 49,490 | 0.00% / 0.00% / 0.00% | 0.00% / 0.00% / 0.00% | ∞ / ∞ / ∞ | 0 |
| synthetic +4 back +1 front | 967,680 | O1_living_RRA | 1,563 | 21,737 | 0.31% / 0.47% / 0.31% | 0.00% / 0.00% / 0.00% | 41.9 s / 271.4 s / 2036.7 s | 0 |
| synthetic +4 back +1 front | 967,680 | O2_entrance_RRA | 1,577 | 22,217 | 0.00% / 0.16% / 0.00% | 0.00% / 0.00% / 0.00% | ∞ / 827.3 s / ∞ | 0 |
| synthetic +4 back +1 front | 967,680 | O3_privacy_gap | 2,501 | 25,777 | 0.00% / 0.00% / 0.00% | 0.00% / 0.00% / 0.00% | ∞ / ∞ / ∞ | 0 |
| synthetic +4 back +1 front | 967,680 | GEN_model | 5,727 | 62,573 | 0.00% / 0.00% / 0.00% | 0.00% / 0.00% / 0.00% | ∞ / ∞ / ∞ | 0 |

## 2. 벌점 배수 λ (O1·GEN, 10k 스위프)

| 인스턴스 | 목적 | λ = 1 p / 유효율 | λ = 0.5 p / 유효율 / E*보다 낮음 | λ = 0.25 p / 유효율 / E*보다 낮음 |
|---|---|---|---|---|
| real 0/1 (2+4) | O1_living_RRA | 34.38% / 99% | 34.53% / 99% / 0 | 35.78% / 100% / 0 |
| real 0/1 (2+4) | GEN_model | 0.00% / 35% | 0.31% / 30% / 0 | 0.16% / 33% / 0 |
| real 47/2 (3+4) | O1_living_RRA | 7.97% / 100% | 7.66% / 99% / 0 | 8.28% / 99% / 0 |
| real 47/2 (3+4) | GEN_model | 0.00% / 47% | 0.16% / 45% / 0 | 0.00% / 47% / 0 |
| real 72/2 (3+5) | O1_living_RRA | 4.53% / 97% | 3.59% / 97% / 0 | 5.62% / 98% / 0 |
| real 72/2 (3+5) | GEN_model | 0.00% / 0% | 0.00% / 0% / 0 | 0.00% / 0% / 0 |
| synthetic +2 back +0 front | O1_living_RRA | 2.97% / 92% | 4.38% / 92% / 0 | 3.28% / 95% / 0 |
| synthetic +2 back +0 front | GEN_model | 0.00% / 0% | 0.00% / 0% / 0 | 0.00% / 0% / 0 |
| synthetic +3 back +0 front | O1_living_RRA | 4.06% / 87% | 4.69% / 87% / 0 | 4.22% / 88% / 0 |
| synthetic +3 back +0 front | GEN_model | 0.00% / 0% | 0.00% / 0% / 0 | 0.00% / 0% / 0 |
| synthetic +3 back +1 front | O1_living_RRA | 85.16% / 89% | 81.25% / 85% / 0 | 84.06% / 89% / 0 |
| synthetic +3 back +1 front | GEN_model | 0.00% / 0% | 0.00% / 0% / 0 | 0.00% / 0% / 0 |
| synthetic +4 back +1 front | O1_living_RRA | 0.47% / 76% | 1.09% / 80% / 0 | 0.78% / 81% / 0 |
| synthetic +4 back +1 front | GEN_model | 0.00% / 0% | 0.00% / 0% / 0 | 0.00% / 0% / 0 |

## 3. 순열 SA 기준선(QUBO 없이 배치를 직접 탐색)

| 인스턴스 | 목적 | p (300 / 3000 걸음) | TTS99 (300 / 3000) |
|---|---|---|---|
| real 0/1 (2+4) | O1_living_RRA | 100% / 100% | 167 ms / 1.7 s |
| real 0/1 (2+4) | O2_entrance_RRA | 100% / 100% | 164 ms / 1.7 s |
| real 0/1 (2+4) | O3_privacy_gap | 98% / 100% | 183 ms / 1.7 s |
| real 0/1 (2+4) | GEN_model | 97% / 100% | 234 ms / 1.8 s |
| real 47/2 (3+4) | O1_living_RRA | 100% / 100% | 270 ms / 2.7 s |
| real 47/2 (3+4) | O2_entrance_RRA | 100% / 100% | 268 ms / 2.7 s |
| real 47/2 (3+4) | O3_privacy_gap | 98% / 100% | 297 ms / 2.7 s |
| real 47/2 (3+4) | GEN_model | 89% / 100% | 570 ms / 2.7 s |
| real 72/2 (3+5) | O1_living_RRA | 100% / 100% | 479 ms / 4.8 s |
| real 72/2 (3+5) | O2_entrance_RRA | 100% / 100% | 489 ms / 4.8 s |
| real 72/2 (3+5) | O3_privacy_gap | 95% / 100% | 758 ms / 4.9 s |
| real 72/2 (3+5) | GEN_model | 81% / 100% | 1.3 s / 4.7 s |
| synthetic +2 back +0 front | O1_living_RRA | 100% / 100% | 803 ms / 8.1 s |
| synthetic +2 back +0 front | O2_entrance_RRA | 100% / 100% | 789 ms / 7.9 s |
| synthetic +2 back +0 front | O3_privacy_gap | 66% / 100% | 3.5 s / 8.3 s |
| synthetic +2 back +0 front | GEN_model | 80% / 100% | 2.3 s / 8.0 s |
| synthetic +3 back +0 front | O1_living_RRA | 100% / 100% | 1.3 s / 13.5 s |
| synthetic +3 back +0 front | O2_entrance_RRA | 100% / 100% | 1.3 s / 13.1 s |
| synthetic +3 back +0 front | O3_privacy_gap | 66% / 100% | 5.8 s / 13.4 s |
| synthetic +3 back +0 front | GEN_model | 48% / 98% | 9.1 s / 14.5 s |
| synthetic +3 back +1 front | O1_living_RRA | 100% / 100% | 1.9 s / 18.8 s |
| synthetic +3 back +1 front | O2_entrance_RRA | 100% / 100% | 1.8 s / 18.0 s |
| synthetic +3 back +1 front | O3_privacy_gap | 75% / 100% | 6.3 s / 18.8 s |
| synthetic +3 back +1 front | GEN_model | 70% / 100% | 6.8 s / 17.9 s |
| synthetic +4 back +1 front | O1_living_RRA | 100% / 100% | 2.8 s / 28.4 s |
| synthetic +4 back +1 front | O2_entrance_RRA | 98% / 100% | 3.0 s / 27.6 s |
| synthetic +4 back +1 front | O3_privacy_gap | 53% / 97% | 17.4 s / 38.4 s |
| synthetic +4 back +1 front | GEN_model | 52% / 100% | 17.4 s / 27.4 s |

## 4. D-Wave 사전 임베딩(minorminer, QPU 없이, O1·GEN)

| 인스턴스 | 목적 | 논리 변수 | Pegasus P16 (5,640큐비트): 큐비트 / 최대 체인 | Zephyr Z12 (4,800큐비트): 큐비트 / 최대 체인 |
|---|---|---|---|---|
| real 0/1 (2+4) | O1_living_RRA | 340 | 2,376 / 26 | 2,115 / 23 |
| real 0/1 (2+4) | GEN_model | 1,276 | 실패(126초 제한) | 실패(122초 제한) |
| real 47/2 (3+4) | O1_living_RRA | 409 | 3,054 / 33 | 2,639 / 28 |
| real 47/2 (3+4) | GEN_model | 1,497 | 실패(126초 제한) | 실패(124초 제한) |
| real 72/2 (3+5) | O1_living_RRA | 643 | 실패(125초 제한) | 실패(123초 제한) |
| real 72/2 (3+5) | GEN_model | 2,901 | 실패(138초 제한) | 실패(134초 제한) |
| synthetic +2 back +0 front | O1_living_RRA | 845 | 실패(125초 제한) | 실패(126초 제한) |
| synthetic +2 back +0 front | GEN_model | 3,583 | 실패(138초 제한) | 실패(134초 제한) |
| synthetic +3 back +0 front | O1_living_RRA | 1,096 | 실패(126초 제한) | 실패(126초 제한) |
| synthetic +3 back +0 front | GEN_model | 4,366 | 실패(143초 제한) | 실패(145초 제한) |
| synthetic +3 back +1 front | O1_living_RRA | 1,242 | 실패(128초 제한) | 실패(128초 제한) |
| synthetic +3 back +1 front | GEN_model | 4,822 | 실패(141초 제한) | 실패(158초 제한) |
| synthetic +4 back +1 front | O1_living_RRA | 1,563 | 실패(135초 제한) | 실패(130초 제한) |
| synthetic +4 back +1 front | GEN_model | 5,727 | 실패(154초 제한) | 실패(157초 제한) |

## 읽는 법과 한계

- GEN_model = 사이트·논문의 생성 모형(5항 합친 정확 QUBO, 사이트 β). 나머지 셋은 단일 원리 목적(RQ4 목적별 생성과 같은 형태).
- β 범위는 dwave 기본 함수를 부동소수 잔차(|편향| < 1e-9)를 0으로 정리한 편향에 적용했다(json의 beta_range). 2026-11-05 이전 실행은 정리하지 않은 기본값이었다.
- 순열 SA 기준선의 온도(2.0 → 0.02, 기하)와 걸음 수는 조정하지 않은 고정값이다.
- 합성 인스턴스는 실제 평면이 아니라 규모 실험용이다(같은 정렬 틀·정식화에 실을 더함).
- 벌점 λ < 1은 바닥 상태가 유효하다는 보장이 없다. 'E*보다 낮음'이 0보다 크면 그 λ에서는 정식화가 틀린 답을 바닥 상태로 갖는다.
- 임베딩은 QPU 없이 위상 그래프에만 맞춘 것이다. 실제 QPU의 결함 큐비트·체인 강도·어닐링 시간은 반영하지 않았다.
- 열거 시간과 비교해 SA가 의미 있는 규모는 열거가 불가능해지는 영역이다. 열거 시간은 json의 t_enum.

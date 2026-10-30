# 평면 생성 랩 (floorplan-gen)

> **브랜치 안내** · `main`은 **도면 생성** 전용입니다(배포 주소의 첫 화면). 평가하기·이미지로 평가·예시 도면을 포함한 이전 전체 사이트(샘플 35세대 기준 채점 모델)는 [`full-site`](https://github.com/hyeondata/drawing-library/tree/full-site) 브랜치에 그대로 있습니다.

조건(전용면적·거실·침실·실 구성·공간구문·생활 선호)을 고르면 판상형 아파트 평면을 만드는 Astro 웹 서비스입니다.
목표는 **점수가 아니라 조건과 시공 가능성 규칙을 지키는 평면**입니다. 생성기는 실제 도면과 닮은 정도로 채점하지 않습니다.
이전 판은 샘플 35세대 기준 분포와의 근접도를 목적함수에 넣고 같은 점수로 결과를 쟀는데, 이는 만든 자로 다시 재는 순환이라 지웠습니다.

- 저장소: https://github.com/hyeondata/drawing-library
- 배포 주소: https://drawing-library.kimyonghyeondata.workers.dev

## 실행

Node.js 24 이상이 필요합니다(`.nvmrc`).

```bash
npm ci
npm run dev          # http://127.0.0.1:8790
npm test             # 테스트
npm run build        # 정적 사이트(dist/)
npm run preview
```

## 데이터: AI 허브 아파트 평면도 전체

선택지·목표값·판정 기준값은 AI 허브 건축 도면 SPA 라벨 전체(TL_SPA, 9,645건)를 같은 분석기로 돌려 정합니다.

```bash
npm run stats -- <TL_SPA 폴더>            # 전체 분석(약 3분) → src/generate/aihub-stats.js
npm run stats -- --reuse                  # 저장해 둔 세대별 행(data/, 커밋 안 함)으로 요약만
node scripts/build-shapes.mjs <TL_SPA 폴더> # 자유형 평면의 기준 세대(public/data/shapes.json)
npm run syntax                            # 공간구문 대리 항 다시 맞추기
npm run qubo:bench                        # 풀이기 비교 실험
node scripts/sa-budget.mjs                # SA 시간 예산별 전역 최적 도달률
```

| 단계 | 세대 수 |
| --- | --- |
| 도면 9,645건 → 세대 분리 | 22,732 |
| 아파트 평면도(APT_FP) 중 필수 실(현관·거실·주방·침실·화장실)이 모두 있는 세대 | 18,931 |
| 실 구성·면적비·변수가 똑같은 반복 세대를 하나로 | **7,970** |

생성기가 판상형 아파트용이라 APT_FP만 씁니다. 모든 수치는 스크립트가 직접 쓰는 [`evidence/results/aihub-summary.md`](evidence/results/aihub-summary.md)에 있고, 바뀐 설계는 [`evidence/17-전체-데이터-분석.md`](evidence/17-전체-데이터-분석.md)에 정리했습니다.

### 전체 데이터로 바꾼 설계

- **선택지 확장**: 침실 1~5개(6개 이상은 41%에 거실이 2개라 세대 분리 오류로 보고 뺌), 화장실 1~3개(3개 이상이 방 4개 세대의 36%, 방 5개의 57%), 135㎡ 주택형.
- **침실 수별 분위수**: 거실·작은방·안방·주방·현관·화장실 목표와 실 구성 기본값을 고른 침실 수의 세대만으로 냅니다. 복도·홀이 같은 침실 수 세대의 p75보다 넓으면 면적 오차로 셉니다.
- **선택 규칙**: 실제 통과율이 90% 미만인 규칙만 모든 평면에 요구하지 않습니다(안방 부속실 79.8%). 테스트가 이 목록과 데이터를 대조합니다.
- **선호 목표**: 변수가 실제 분포의 p10이면 0점, p90 이상이면 100점.
- **축척 기준**: 침실 한 변 기준값 305px → 297px(전체 도면별 중앙값).
- **QUBO 가중치**: 점수로 보정한 값을 지우고 손 가중치를 씁니다.

## 도면 생성

- **생성·선택**: 판상형 배치 문법(`src/generate/layout.js`)으로 평면을 만들고 적합성 J = 0.45·규칙 충족률 + 0.25·목표 면적 부합 + 0.30·선호 − 감점(필수 규칙 위반 40, 좁은 실·문 동선 문제 15)으로 고릅니다(`src/generate/optimize.js` `scoreLayout`).
- **풀이기는 SA 하나**: 실 배치를 QUBO(실×칸 이진 변수, 원-핫 벌점 + 실 쌍 인접 항)로 만들어 SA(풀이기당 기본 3초, 전역 최적 도달 98%)로 풀고, 좋은 해를 평면으로 풀어 J로 서로 다른 3안을 고릅니다. 다른 풀이기 10종과 직접 탐색은 꺼 두고 비교 실험에만 씁니다. 근거: [`evidence/18-SA-선택-근거.md`](evidence/18-SA-선택-근거.md). QUBO JSON은 `public/qubo/solve_qubo.py`로 D-Wave(SA·QPU 등)·Gurobi·CP-SAT에서 풀 수 있습니다.
- QUBO 도면 생성 탭(격자 칸 단위, 변수 약 600개)은 SA가 실이 흩어진 해를 내서 예외로 Tabu를 기본으로 둡니다.
- 결과는 AI 허브 Sample과 같은 형식의 SPA·STR·OBJ JSON과 SVG로 받을 수 있습니다.

## 분석기

`src/model/`은 라벨 JSON을 실 인접 그래프·공간구문 변수·시공 가능성 규칙으로 바꿉니다(채점 없음). 문 정보가 없어 벽을 맞댄 인접 그래프를 쓰고, 덕트를 빼고 현관에 외부 노드를 붙여 통합도(1/RRA)를 계산합니다. 기준값·실 종류·근거 문헌은 `src/model/config.js`에 있습니다.

## 한계

- 화장실 4개 이상(고유 세대의 6%)은 지원하지 않습니다. 작은 평형에 화장실 3개를 넣으면 거실이 목표보다 작아집니다(84㎡ 방 3개: −20%).
- 라벨에 축척이 없어 전용면적 선택지(59~135㎡)는 대표 주택형이며 라벨에서 정하지 않습니다.
- 공간 라벨에 문이 없어 규칙의 링크는 출입이 아닌 인접 관계입니다(생성 평면은 문 동선을 따로 점검).
- 생성 결과가 좋은 평면인지에 대한 외부 검증(전문가 평가 등)은 아직 없습니다.

## 배포 (Cloudflare Workers)

`main`에 push하면 Cloudflare Workers Builds가 `npm run build` → `npm run deploy`로 `drawing-library` Worker에 배포합니다(`wrangler.jsonc`).

## 구성

```
src/model/       분석기 (config, geometry, labels, syntax, spa, str, obj, index)
src/generate/    생성(layout, optimize, preferences, choices, aihub-stats, qubo, solvers …)
src/pages/       Astro 페이지
src/scripts/     화면 동작
scripts/         전체 데이터 요약, 자유형 기준 세대, 대리 항, 풀이기 실험
test/            테스트
evidence/        근거 문서
```

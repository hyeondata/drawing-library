# 평면 평가 랩 (floorplan-eval)

AI 허브 아파트 평면도 샘플을 **정답지(기준 분포)** 로 삼아 도면을 채점하는 평가 모델과 Astro 웹 서비스입니다.
샘플 도면을 누르면 브라우저 안에서 평가 모델이 라벨 JSON을 분석해 점수를 냅니다.

2026-10-21 회의 결정을 반영했습니다.

| 회의 결정 | 반영 |
| --- | --- |
| PNG 대신 JSON 입력 | 모델 입력은 AI 허브 COCO 라벨 JSON. 원본 PNG는 화면 표시용으로만 씀 |
| AI 허브 데이터를 정답지로 | 지표마다 샘플 분포의 중앙값·강건 척도와 비교해 근접도 점수화 |
| 스페이스 신택스 기반 평가 | 실 인접 그래프의 깊이, RA·RRA, 통합도, 순환성 |
| 주관적 미적 평가 대신 시공 가능성 검증 | 정합성 규칙(필수 실, 도달성, 침실 비통과, 문·창 겹침, 개구부-벽 접합, 설비 짝) |
| 각자 평가 모델을 만들어 비교 | 모델 버전 관리, `npm run evaluate`로 같은 샘플에 대한 점수표 출력 |

- 저장소: https://github.com/hyeondata/drawing-library (이전 '도면 서재' 뷰어를 이 서비스로 교체)
- 배포 주소: https://drawing-library.kimyonghyeondata.workers.dev

## 실행

Node.js 24 이상이 필요합니다(`.nvmrc`).

```bash
npm ci
npm run dev          # http://127.0.0.1:8790
npm test             # 모델 테스트
npm run build        # 기준 분포 재생성 + 정적 사이트(dist/)
npm run preview
```

명령줄 채점:

```bash
npm run evaluate                        # 샘플 60건 점수표
npm run evaluate -- path/to/plan.json   # 생성한 도면 JSON 채점
npm run evaluate -- --json plan.json    # 상세 결과 JSON
```

화면의 **JSON 올려 평가** 버튼으로도 COCO 형식 도면 JSON을 바로 채점할 수 있습니다(SPA/STR/OBJ 자동 판별).

## 평가 모델 (v0.1.0)

`src/model/`의 같은 코드가 브라우저, CLI, 테스트에서 돌아갑니다.

| 종류 | 데이터 | 점수 구성 |
| --- | --- | --- |
| SPA 공간 | 실 폴리곤 | 공간구문 40 · 면적 구성 30 · 정합성 30 |
| STR 구조 | 벽·문·창 폴리곤 | 정합성 60 · 구성 분포 40 |
| OBJ 설비 | 위생·주방 설비 상자 | 정합성 70 · 구성 분포 30 |

- **공간구문 그래프**: 실 하나가 노드입니다. 벽 하나를 사이에 두고 40px 이상 맞닿으면 링크로 봅니다(내벽 32px, 외벽 50px 이내).
- **지표**: 현관을 뿌리로 한 깊이, Hillier & Hanson의 RA·RRA(D값 정규화)와 통합도 1/RRA, 순환성을 씁니다.
- **세대 분리**: 한 도면에 세대가 여럿이면 현관마다 벽 두께를 비용으로 한 최단경로로 세대를 나눕니다. 거실·침실이 없는 조각 세대는 이웃 세대에 합칩니다.
- **분포 근접도**: 강건 z = (값 − 중앙값) / (MAD×1.4826)로 구합니다. z=0이면 100점, |z|≥3이면 0점입니다. 평가하는 도면 자신은 기준 분포에서 뺍니다.
- **판정 기준값**: Sample 80건에서 실측해 정했습니다.
  - 실 사이 간격은 대부분 25px 이하(벽 두께)이고, 외벽 쪽은 37~48px입니다.
  - 개구부와 벽 사이 거리는 최대 10px입니다.
  - 설비 짝은 거의 모두 300px 이내입니다.

가중치, 기준값, 지표 목록, 참고 문헌은 모두 `src/model/config.js`에 있습니다.

## 한계

- 공간(SPA) 라벨에는 문이 없습니다. 그래서 링크는 출입 관계가 아니라 **인접 관계**이고, 깊이가 실제보다 얕게 나올 수 있습니다.
- 샘플의 SPA·STR·OBJ는 서로 다른 도면이라 한 도면을 세 측면으로 함께 평가할 수 없습니다. 원본 PNG는 OBJ 12장만 있습니다.
- 기준 분포는 샘플 20건(35세대)뿐입니다. 회의에서 정한 대로 전체 데이터에서 최다 빈도 평형을 골라 기준을 다시 만들어야 합니다.
- 근거로 정한 홍콩대 SCI 논문은 서지가 아직 확정되지 않았습니다. 확정되면 세부 항목과 가중치를 `config.js`에 반영합니다.

## 데이터 다시 준비

원본 `../Sample` 폴더가 있을 때만 실행합니다(Python 3 + Pillow 필요).

```bash
npm run data:prepare   # 라벨 복사, PNG → WebP
npm run baseline       # 기준 분포·목록 재생성
```

`public/`에는 화면용 데이터 약 2.4MB가 들어 있어, 저장소만 복제해도 바로 빌드할 수 있습니다.

## Git으로 평가 모델 관리하기

- `main`이 기준 브랜치입니다. 팀원은 각자 `model/<이름>-<내용>` 브랜치에서 평가 모델을 고치고 PR로 비교합니다.
- 모델을 바꾸면 다음 순서로 작업합니다.
  1. `config.js`의 `MODEL_VERSION`을 올립니다.
  2. `npm run check`(테스트 + 기준 분포 재생성)를 실행합니다.
  3. 바뀐 `public/data/baseline.json`을 함께 커밋합니다.
- PR에는 `npm run evaluate` 점수표의 전후 차이를 붙여, 어떤 도면의 점수가 왜 바뀌었는지 보여 줍니다.
- 모델 버전마다 태그(`model-v0.1.0`)를 달면 논문에 쓴 점수를 그대로 재현할 수 있습니다.
- GitHub Actions(`.github/workflows/check.yml`)가 push와 PR마다 테스트, 기준 분포 최신 여부, 빌드, 배포 사전 검증(dry-run)을 확인하고 점수표를 실행 요약에 남깁니다.

## 배포 (Cloudflare Workers)

`main`에 push하면 Cloudflare Workers Builds가 `npm run build` → `npm run deploy`로 `drawing-library` Worker에 배포합니다(정적 자산, `wrangler.jsonc`).
수동 배포는 `npx wrangler login` 후 `npm run build && npm run deploy`입니다.
배포된 커밋은 페이지의 `<meta name="build-revision">`으로 확인합니다.

## 구성

```
src/model/       평가 모델 (config, geometry, labels, syntax, spa, str, obj, index)
src/pages/       Astro 페이지
src/scripts/     화면 동작(목록, 클릭 평가, 시각화)
src/styles/      스타일
scripts/         데이터 준비, 기준 분포 생성, CLI 채점
test/            모델 테스트
public/data/     라벨 JSON, baseline.json, catalog.json
```

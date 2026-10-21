# 도면 서재 · Astro

Astro 7로 구성한 도면 탐색 웹앱입니다. Cloudflare Workers Static Assets에 배포합니다. 코드와 화면 표시용 샘플은 비공개 GitHub 저장소에서 버전 관리합니다.

현재 주소: https://drawing-library.kimyonghyeondata.workers.dev

## 기능

- 도면 번호 검색, OBJ/SPA/STR/OCR 유형 및 이미지 보유 여부 필터
- 이미지 12개, COCO 라벨 JSON 80개
- 도면 확대·축소, 드래그 이동, 키보드 이동, 화면 맞춤
- 대응 라벨 영역 표시, 카테고리 필터, 라벨 선택 시 영역 확대
- 이미지 미포함 라벨의 명시적 빈 화면, JSON 및 WebP 다운로드
- 선택한 도면을 해시 주소로 공유

## 실행과 배포

Node.js 22.12 이상이 필요합니다. 화면 표시용 WebP, 라벨과 목록이 `public`에 포함되어 있어 저장소를 복제한 뒤 바로 빌드할 수 있습니다.

```bash
npm ci
npm run build
npm run dev
```

로컬 주소는 http://127.0.0.1:8788 입니다. 빌드 결과 확인은 `npm run preview`로 실행합니다.

```bash
npx wrangler login --device
npm run build
npm run deploy
```

배포 대상은 `wrangler.jsonc`의 사용자 계정과 `drawing-library` Worker입니다. 생성되는 `dist`에 도면·라벨 데이터가 포함되며, 이 사이트는 URL로 접근할 수 있습니다. Drive와 실시간 동기화하지 않습니다.

## Git 관리와 자동 배포

GitHub 저장소: https://github.com/hyeondata/drawing-library (비공개)

`main`이 운영 브랜치입니다. 기능 변경은 별도 브랜치에서 작업하고 PR로 검토한 뒤 병합합니다. GitHub Actions가 push/PR마다 데이터 파일 검증, Astro 빌드, Wrangler 배포 사전 검증을 수행합니다. Actions 검증은 배포 자격 증명을 사용하지 않습니다.

Cloudflare에서 기존 Worker의 Settings → Builds → Connect에서 이 저장소를 연결합니다. GitHub App 접근 범위는 이 저장소만 선택합니다.

| 항목 | 값 |
| --- | --- |
| 저장소 | `hyeondata/drawing-library` |
| 운영 브랜치 | `main` |
| 루트 디렉터리 | `/` |
| 빌드 명령 | `npm run build` |
| 배포 명령 | `npm run deploy` |
| Node.js 버전 | `22` (`.nvmrc`) |

이 대시보드 연결을 완료해야 push에 따른 자동 배포가 활성화됩니다. Cloudflare의 빌드 토큰 생성/선택 절차는 대시보드에서 처리하며, 로컬 Wrangler OAuth 자격 증명은 GitHub에 저장하지 않습니다.

## 데이터 업데이트

원본 PNG는 Git에 포함하지 않고 Drive 및 인접한 `../Sample` 폴더에 보관합니다. 표시용 무손실 WebP와 라벨은 약 8MB의 샘플로 저장소에 포함합니다. 데이터 규모가 커지면 별도 객체 저장소로 이전할 수 있습니다.

원본에서 표시용 데이터를 다시 준비하려면 Python 3와 Pillow가 필요합니다.

```bash
npm run data:prepare
npm run check
npm run build
git add public
git commit -m "Update drawing samples"
git push
```

원본 `Sample`이 없는 환경에서는 `data:prepare`를 실행하지 않습니다.

## 구성

- `src/components`: 헤더, 도면 목록, 도면 캔버스, 라벨 패널
- `src/layouts/LibraryLayout.astro`: 공통 문서 레이아웃
- `src/pages/index.astro`: 페이지 구성
- `src/scripts/viewer.js`: 검색, 필터, 확대·이동, 라벨 선택
- `src/styles/global.css`: 반응형 화면 스타일
- `scripts/build.py`: Sample 데이터 준비 및 무손실 WebP 생성

이미지와 라벨은 유형 및 정확한 파일명으로 연결합니다. COCO 메타데이터의 좌표계를 사용하며, PNG가 1px 차이 나는 경우 그 좌표계에 맞춰 표시합니다. 원본 PNG는 `../Sample`에 보관합니다.

`npm run build`가 생성하는 `dist` 폴더를 Cloudflare Workers Static Assets로 배포합니다.

공식 문서:
- https://docs.astro.build/en/guides/deploy/cloudflare/
- https://developers.cloudflare.com/agent-setup/prompt.md

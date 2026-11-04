> **보조 조사 노트(2026-11-04, 조사 에이전트 작성).** 'direct' 인용 중 국외 문헌은 웹 요약 도구로 뽑은 것이 있어 원문 재대조 전에는 논문에 그대로 쓰지 않는다. 등재 상태는 출판 연도 기준으로 확인한 것이 없다(MJL 로그인 필요). 설계 판단은 [18. 연구 설계](../18-연구-설계-RQ1-4.md).

# 문헌 조사: QUBO 정식화·깊이 인코딩·가중치 추정·평면 생성(Part A)과 비공간구문 생성 규칙(Part B)

- 조사일: 2026-11-04. 서지는 Crossref API로 대조했다. Clarivate MJL은 로그인이 필요해 조회하지 못했다. 그래서 등재 상태는 **이름 있는 출처에서 확인한 경우만** 적고, 나머지는 "미확인"으로 둔다(프로젝트 `evidence/07-참고-문헌.md`에 적힌 등재는 이번에 다시 확인하지 않았다).
- 검증 수준: **direct** = 전문(출판본·arXiv·저자 원고·법령 원문)을 열어 원문을 인용하고 쪽을 적음. 쪽은 내려받은 PDF의 쪽이라 인쇄본 쪽과 다를 수 있다. **abstract** = 초록이나 2차 요약까지만 확인. **메타** = 서지만 확인.
- 이미 프로젝트가 원문을 대조한 문헌(Seo 2007, Ju & Oh 2020, Ham & Lee 2017, Zeng 2025, Michalek 2002, Merrell 2010, Rodrigues 2013, Lopes 2010, Upasani 2020; `src/generate/citations.js`, `evidence/16-문헌-원문-대조.md`)은 다시 적지 않는다. 새 출처와 새 쪽만 더했다.
- 구성: 요약표 → A-1~A-3(QUBO·깊이·가중치 추정) → A-4(평면 생성·평가) → Part B(법령·비공간구문 규칙) → **RQ2 정식화 제안**.
- 원본 PDF: `scratchpad/dl-a/`, `dl-a4/`, `dl-b/`.

## 요약표

### A-1~A-3. QUBO 정식화, 깊이 인코딩, 데이터로 계수 맞추기

| # | 문헌 | 등재(출처) | 검증 | 우리 설계에서 뒷받침하는 것 |
|---|---|---|---|---|
| A1-1 | Lucas 2014, Front. Phys. 2:5, doi:10.3389/fphy.2014.00005 | SCIE·Scopus(Frontiers 페이지, 현재) | direct | 원-핫 벌점, B·max(W)<A. **§8.1 깊이 보조 변수 x_{v,i}** |
| A1-2 | Glover, Kochenberger & Du 2019, 4OR 17:335, doi:10.1007/s10288-019-00424-y | 미확인 | direct | QAP→QUBO, 벌점 'Goldilocks', 목적값 추정치의 75–150% |
| A1-3 | Ayodele 2022, EvoCOP/LNCS, doi:10.1007/978-3-031-04148-8_11 | 학회 | direct | 순열 QUBO 벌점에 최선의 규칙이 없음 |
| A1-4 | García, Ayodele & Moraglio 2022, GECCO Comp., doi:10.1145/3520304.3528925 | 학회 | abstract | 전역 최적을 보존하는 정확한 벌점 상한, 순차 축소 |
| A1-5 | Liu & Moraglio 2025, GECCO Comp., doi:10.1145/3712255.3726759 | 학회 | 메타 | 벌점 여러 개를 자동으로 설정(본문 확인 전 인용 보류) |
| A1-6 | Verma & Lewis 2022, Discrete Optim. 44:100594, doi:10.1016/j.disopt.2020.100594 | 미확인 | abstract | 벌점 M의 상한 계산 |
| A1-7 | Zaborniak & Stege, arXiv:2305.00568 | 프리프린트 | direct | 벌점이 크면 원-핫의 모든 유효해가 1비트 국소 최소 → SA 이동 설계 |
| A1-8 | Rovara, Quetschlich & Wille 2026, ISMVL, doi:10.1109/ISMVL68998.2026.00036 | 학회 | direct(arXiv) | 원-핫은 유효 상태 사이를 2비트 뒤집기로만 오감; 고차 항 자동 축소 |
| A1-9 | Kuramata, Katsuki & Nakata 2021, ICIEA, doi:10.1109/ICIEA52957.2021.9436749 | 학회 | direct(arXiv) | 원-핫 QAP는 D-Wave Advantage에서 크기 12까지만 풀림 |
| A1-10 | Klar et al. 2022, Mfg. Lett. 32:59 / Wu et al. 2025, CIRP Ann. 74:627 | 미확인 | abstract | 가장 가까운 선행 연구는 공장 배치 QA. **주거 평면을 QUBO로 쓴 논문은 찾지 못함** |
| A1-11 | Kochenberger et al. 2014, J. Comb. Optim. 28:58, doi:10.1007/s10878-014-9734-0 | 미확인 | 메타 | UBQP 개관 |
| A2-2 | Krauss & McCollum 2020, IEEE TQE 1:1–12, doi:10.1109/TQE.2020.3021921 | 미확인 | abstract | 고정 그래프의 최단 경로 QUBO(홉·흐름 기반) |
| A2-3 | Rosenberg 1975, Cahiers CERO 17:71–74 | — | abstract(Dattani 경유) | 곱 대입으로 고차→이차, 보조 변수 재사용 |
| A2-4 | Ishikawa 2011, IEEE TPAMI 33(6):1234, doi:10.1109/TPAMI.2010.91 | 미확인 | abstract(Dattani 경유) | 양(+) 계수 k차 항에 보조 변수 ⌊(k−1)/2⌋개 |
| A2-5 | Boros & Hammer 2002, DAM 123:155, doi:10.1016/S0166-218X(01)00341-9 | 미확인 | 메타 | 유사 불 함수 이론(정확한 HUBO가 존재) |
| A2-6 | Dattani 2019, arXiv:1901.04405 | 프리프린트 | direct | 이차화 방법 비교(쪽 번호 근거) |
| A3-1 | Jaynes 1957, Phys. Rev. 106:620, doi:10.1103/PhysRev.106.620 | 미확인 | 메타 | 최대 엔트로피 원리 |
| A3-2 | Nguyen, Zecchina & Berg 2017, Adv. Phys. 66:197, doi:10.1080/00018732.2017.1341604 | 미확인 | direct(arXiv) | 1·2차 적률을 맞추는 최대 엔트로피 분포 = 이징 모형 |
| A3-3 | Ackley, Hinton & Sejnowski 1985, Cogn. Sci. 9:147, doi:10.1207/s15516709cog0901_7 | 미확인 | 메타 | 볼츠만 머신 학습 규칙 |
| A3-4 | Hinton 2002, Neural Comput. 14:1771, doi:10.1162/089976602760128018 | 미확인 | 메타 | 대조 발산(큰 문제에서의 대안) |
| A3-5 | Ziebart et al. 2008, AAAI-08 (DOI 없음) | 학회 | direct | **최대 엔트로피 역강화학습: 특징 기대값 맞춤, 부최적 관측 허용** |
| A3-6 | Ahuja & Orlin 2001, Oper. Res. 49:771, doi:10.1287/opre.49.5.771.10607 | 미확인 | 메타 | 고전적 역최적화 |
| A3-7 | Chan, Mahmood & Zhu 2025, Oper. Res. 73:1046, doi:10.1287/opre.2022.0382 | 미확인 | direct(arXiv) | 역최적화 리뷰. 이산 문제·최대 엔트로피 IRL과의 관계 |
| A3-8 | Ratliff, Bagnell & Zinkevich 2006, ICML, doi:10.1145/1143844.1143936 | 학회 | 메타 | 최대 마진 방식(강건성 점검) |
| A3-9 | Keshavarz, Wang & Boyd 2011, ISIC, doi:10.1109/ISIC.2011.6045410 | 학회 | 메타 | 근사 최적 해로 목적함수 추정 |
| A3-10 | Kitai et al. 2020, Phys. Rev. Res. 2:013319, doi:10.1103/PhysRevResearch.2.013319 | ESCI·Scopus(APS 페이지) | direct(arXiv) | **FMQA: 데이터로 맞춘 이차 대리 모형 → QUBO → 어닐링** |
| A3-11 | Rendle 2010, ICDM, doi:10.1109/ICDM.2010.127 | 학회 | 메타 | 인수분해 머신 |
| A3-12 | Baptista & Poloczek 2018, ICML (PMLR 80) | 학회 | direct(arXiv) | **이차 대리 모형 + SA**, 계수에 선형이라 회귀로 맞춤 |

### A-4. 평면 생성·공간 배치 최적화와 실제감 평가

| # | 문헌 | 방법 | 실제감·품질 평가 방식 | 실제 분포 비교(RQ4) | 검증 | 색인 |
|---|---|---|---|---|---|---|
| 1 | Nauata et al. 2020 House-GAN (ECCV) | 그래프 제약 GAN | 사용자 연구(쌍 비교), FID(다양성), GED(호환성) | ◐/● (FID는 실제 래스터 분포와 비교) | direct | 학회 |
| 2 | Nauata et al. 2021 House-GAN++ (CVPR) | GAN + 반복 정제 | House-GAN과 같은 3지표, 아마추어 10명 + 건축가 10명 | ◐/● | direct | 학회 |
| 3 | Hu et al. 2020 Graph2Plan (ACM TOG) | 레이아웃 그래프 → 평면 (GNN+CNN) | 실제 도면(GT)과 쌍 비교한 사용자 연구(30명, 600응답) | ◐ | direct | 미확인 |
| 4 | Wu et al. 2019 RPLAN (ACM TOG) | 거실 먼저 놓고 실 반복 생성 | 사람이 만든 도면과 그럴듯함 비교(형성 평가 사용자 연구) | ◐ | abstract | 미확인 |
| 5 | Shabani et al. 2023 HouseDiffusion (CVPR) | 벡터 확산 모델 | FID, 수정 GED, GT 대비 사용자 연구 | ◐/● | direct | 학회 |
| 6 | Para et al. 2021 (ICCV) | 제약 그래프 기반 트랜스포머 | FID + **배치 통계 분포**(그래프 거리, 차수, 면적, 종횡비 히스토그램)를 GT와 비교 | ● | direct | 학회 |
| 7 | Jiang et al. 2026 (arXiv 프리프린트) | 공간구문 통합도 기반 평가와 사후학습 | 실제 말뭉치의 **통합도 프로파일 분포 거리(IPD)**, 거실 우위(PIA) | ● | direct | 프리프린트(동료심사 미확인) |
| 8 | Liu et al. 2025 리뷰 (Computational Visual Media) | 레이아웃 생성 종설 | 사실주의, FID, 다양성, 호환성 지표 정리 | (종설) | direct (arXiv판) | 미확인 |
| 9 | Çiçek & Turhan 2022 (IJAC) | 다목적 진화 최적화 | JGA와 통합도를 적합도 기준으로 사용 | ○ | abstract | 미확인 |
| 10 | Lee, Ostwald & Gu 2015 (Archit. Sci. Rev.) | JPG 분석 + 형태문법 생성 | 실제 주택 10채의 JPG 구문을 생성 근거로 사용 | ○ (분석 대상은 실제 사례) | abstract | 미확인 |
| 11 | Huang 2026 (Buildings) | JPG + 이진 필터(신경망용) | JPG로 유효 설계 거르기 | ○ | abstract | 미확인 (Buildings는 07 문서에 SCIE로 기재) |
| 12 | Maeng & Hyun 2021 (한국실내디자인학회 논문집) | 한국 아파트 대규모 평면 분석(딥러닝) | 34,132 단위세대의 면적비, 직접 연결성 통계 | (분석 연구, 실제 분포 기준선 자료) | abstract | 미확인 |
| 13 | Liggett 2000 (Autom. Constr.) | 시설 배치 종설 | QAP, 그래프, 제약 만족의 세 계열 | (종설) | 메타 + 2차(Calixto 인용) | 미확인 (07 문서: 학술지 SCIE) |
| 14 | Medjdoub & Yannou 2000 (CAD) | 위상과 기하를 분리한 제약 열거 | 제약 충족 (실제감 평가 없음) | ○ | direct (저자 arXiv판) | 미확인 |
| 15 | Guo & Li 2017 (Front. Archit. Res.) | 다중 에이전트 위상 탐색 + 진화 최적화 | 사전 정의한 건축 기준 | ○ | abstract | 미확인 |
| 16 | Laignel et al. 2021 (Autom. Constr.) | 격자 셀 할당, CP + GA | 건축적·기능적 타당성 | ○ | abstract(간접) | 미확인 (07 문서: 학술지 SCIE) |
| 17 | Weber, Mueller & Reinhart 2022 (Autom. Constr.) | 자동 평면 생성 종설 | bottom-up, top-down, referential 분류 | (종설) | abstract(간접) | 미확인 (07 문서: 학술지 SCIE) |
| 18 | Calixto & Celani 2015 (SIGraDi) | 진화 알고리즘 공간계획 종설(31편) | QAP를 대표 평가식으로 정리 | (종설) | direct | 학회 |
| 19 | Yi & Yi 2014 (SimBuild) | 3D 격자 할당 + **SA** | 환경 성능(PMV, 일사 등) | ○ | direct | 학회 |
| 20 | Grzesiak-Kopeć, Strug & Ślusarczyk 2021 (Appl. Sci.) | 진화 기법(벽 끝점 벡터) | 요구조건 가중 적합도 | ○ | abstract | 미확인 |
| 21 | Gurcan Bahadir & Tong 2025 (IJAC) | 공간계획 체계적 종설(2013–2023) | 규칙 기반에서 데이터 기반으로의 이동 | (종설) | abstract | 미확인 |
| 부록 | Dutta & Sarthak 2011; Wang, Yang & Zhang 2018; Aalaei et al. 2023 | — | — | — | 메타 | 미확인 |

---

### Part B. 비공간구문 생성 규칙(법령·문헌)

| # | 출처 | 종류 / 등재 | 확인 수준 | 뒷받침하는 규칙 | 도구 값과의 관계 |
|---|---|---|---|---|---|
| L1 | 주택건설기준 등에 관한 규정 제13조 + 규칙 제3조 | 법령 | direct | 3 | **실 최소 폭·면적 규정 없음**. 5cm 단위 기준척도만 정함 → 도구 값은 법정 값이 아님 |
| L2 | 규정 제44조 + 규칙 제11조 | 법령 | direct | 6 | 욕실은 "창 **또는** 배기설비" → 창 없는 욕실 합법. 도구와 일치 |
| L3 | 건축법 제2조제1항제6호, 시행령 제51조, 피난·방화규칙 제17조 | 법령 | direct | 1(간접) | 거실(침실 포함) 채광 1/10, 환기 1/20 → 거실·침실을 바깥 벽에 두는 근거. 욕실·현관에는 해당 없음 |
| L4 | 피난·방화규칙 제16조, 규칙 제3조제4호 | 법령 | direct | — | 반자높이 2.1m(피난·방화규칙), 거실·침실 2.2m(규칙). 평면 폭과 무관 |
| L5 | 피난·방화규칙 제15조의2 | 법령 | direct | 4(간접) | 공동주택 복도 1.8m(양옆 거실)/1.2m(기타). **공용 복도 기준**이라 세대 안 복도에는 바로 적용 안 됨 |
| L6 | 편의증진법 시행규칙 별표 1 제6호·제7호·제14호 | 법령 | direct | 3·4 | 출입문 유효폭 0.9m, 전면 1.2m, 복도 1.2m. **편의시설 대상시설용**이며 세대 안 적용 여부는 미확인 |
| L7 | 건축법 시행령 제46조제4항·제5항 | 법령 | direct | 1(간접) | 4층 이상 아파트 대피공간 2㎡(세대별)/3㎡(공동), 발코니에 둠 |
| L8 | 건축법 시행령 제2조제14호, 제119조제1항제3호나목 | 법령 | direct | 1 | 발코니를 거실·침실로 쓸 수 있음. 노대 면적 산정의 1.5m 공제 |
| S1 | 윤재신 외 2008, 한국주거학회논문집 19(6) | 국내 학술지 / 미확인 | direct | 3 | 120세대 실별 폭·깊이·비례 실측. **거실 3.6, 침실 2.4가 25평형 최솟값보다 큼(반대 근거)**. 장단변비는 모두 2:1 안 |
| S2 | 박인석 외 2014, 한국주거학회논문집 25(2) | 국내 학술지 / 미확인 | direct | 1·3 | 1998·2005 법 개정 뒤 거실·침실은 기본형 면적을 유지하고 발코니 확장으로 커짐 |
| S3 | 박준영 외 2012, 한국생태환경건축학회논문집 12(1) | 국내 학술지 / 미확인 | direct | 1·6 | 합법화 뒤 베이 수 증가(84㎡ 3기 4베이 77.8%). 물 쓰는 공간은 가운데·뒤쪽 |
| S4 | 박경옥·이상운 2008, 한국농촌건축학회논문집 10(2) | 국내 학술지 / 미확인 | direct | 1 | 합법화 뒤 3~4.5베이에 집중, 4~4.5베이는 거실+방3 전면 약 70% |
| S5 | Seo 2003, 4th Space Syntax Symposium | 학술대회 / 해당 없음 | direct | 2·4·5 | 중앙홀이 계단실형의 보편 해법, 안방–거실 인접은 "규칙처럼" 나타남, 침실로 가는 길이 주방을 거치는 것은 설계 의도에 어긋난 결과 |
| S6 | NDSS 2015 (영국 정부 지침) | 정부 기준 / 해당 없음 | direct | 3 | 1인실 2.15m, 첫 2인실 2.75m, 나머지 2인실 2.55m. 도구의 침실 2.4·안방 3.0과 같은 범위 |
| S7 | London Housing Design Guide 2010 interim | 지방정부 지침 / 해당 없음 | direct | 3·4 | 거실(주 거주부) 폭 2.8m(2–3인)/3.2m(4인 이상), 2인실 2.75m, 세대 안 복도 0.9m |
| X1 | Morgan & Cruickshank 2014, BRI 42(6) | 국제 학술지 / 미확인 | 미열람 | 3 | 원문 받기 실패(403). 내용은 인용하지 않음 |
| X2 | Hillier 1996, *Space is the Machine* (a/b/c/d형 공간) | 단행본 | 미열람 | 4 | UCL 저장소가 봇 차단 페이지를 돌려줌. 인용하지 않음 |

---

# Part A

## A-1. 배정·QAP·배치 문제의 QUBO 정식화, 원-핫, 벌점 계수

### A1-1. Lucas (2014)
- 서지: Lucas, A. (2014). Ising formulations of many NP problems. *Frontiers in Physics*, 2, 5. doi:10.3389/fphy.2014.00005
- 등재: SCIE·Scopus (Frontiers in Physics 'About' 페이지 "indexed in Scopus, Web of Science (SCIE)…", 2026-11-04 조회. 현재 상태이며 2014년 당시 등재는 미확인)
- 검증: **direct** (arXiv 1302.5843v3)
- 인용 1(원-핫·벌점 하한, 프로젝트가 이미 대조): "with B small enough that it is never favorable to violate the constraints of H_A; one such constraint is 0 < B max(W_uv) < A" (arXiv p.18, §7.2)
- 인용 2(깊이 변수, 이번에 새로 확인): "We also place a large number of binary variables x_{v,i} on each vertex … the number i = 0, 1, . . . , N/2 will be used to keep track of the depth a node in the tree" (arXiv p.18, §8.1)
- 인용 3(비용): "this Ising formulation may require a cubic number of spins in the size of the vertex set." (arXiv p.19, §8.1)
- 우리 설계에서: (1) 원-핫 벌점 A(1−Σx)²와 B·max(W) < A 조건의 원전. (2) **깊이를 보조 이진 변수 x_{v,i}(정점 v가 깊이 i)로 두는 QUBO 선례**. 다만 Lucas의 깊이는 '고른 신장 트리' 안의 깊이로, 그래프가 주어졌을 때의 최단 경로(BFS) 깊이와 같지 않다. 트리를 고르는 문제라서 깊이를 일관되게 붙이는 제약만 있고, "가장 짧은 깊이"를 강제하지 않는다. 우리 쪽으로 옮길 때는 BFS 깊이가 되도록 하한 제약을 더 걸어야 한다(아래 'RQ2 정식화 제안' 참조). 변수 수가 정점 수의 세제곱까지 커질 수 있다는 점도 원문이 밝힌다.

### A1-2. Glover, Kochenberger & Du (2019)
- 서지: Glover, F., Kochenberger, G., & Du, Y. (2019). Quantum Bridge Analytics I: a tutorial on formulating and using QUBO models. *4OR*, 17, 335–371. doi:10.1007/s10288-019-00424-y
- 등재: 미확인 (프로젝트 07번 노트에는 SCIE로 적혀 있음. 이번에 Springer 색인 페이지를 열지 못함)
- 검증: **direct** (arXiv 1811.11538)
- 인용(벌점 크기, 새로 확인): "A penalty value that is too large can impede the solution process as the penalty terms overwhelm the original objective function information … a penalty value that is too small jeopardizes the search for feasible solutions. Generally, there is a 'Goldilocks region' of considerable size that contains penalty values that work well. … Taking P to be some percentage (75% to 150%) of this estimate is often a good place to start." (arXiv p.13, 'Comment on the Scalar Penalty P')
- QAP: §5.4에서 x_ij(시설 i → 위치 j)와 행·열 원-핫 벌점으로 QAP를 QUBO로 바꾼다(프로젝트 citations.js `glover-qap`이 이미 대조).
- 우리 설계에서: 띠별 배정(QAP) 형식의 원전. 우리 벌점 P = ⌈1 + max_i(|q_ii| + Σ_j|q_ij|)⌉은 Glover의 '목적값 추정치의 75–150%' 출발점보다 훨씬 보수적인 상한이다. 논문에서는 "우리는 안전한 상한을 택했고, 실행 가능성은 해마다 검사했다"고 쓰고, 벌점 크기 민감도(evidence/results/penalty-structure.md)를 함께 보이는 것이 맞다.

### A1-3. Ayodele (2022)
- 서지: Ayodele, M. (2022). Penalty Weights in QUBO Formulations: Permutation Problems. In *Evolutionary Computation in Combinatorial Optimization (EvoCOP 2022)*, LNCS 13222, pp. 159–174. Springer. doi:10.1007/978-3-031-04148-8_11 (Crossref로 DOI·쪽 대조)
- 등재: 학회 논문집(LNCS). 색인 상태 미확인
- 검증: **direct** (arXiv 2206.11040; 프로젝트가 이미 대조)
- 인용: "values that are too small will lead to infeasible solutions … while values that are too large may lead to slower convergence" (arXiv p.1) · "There is therefore no clear evidence of one method being the best." (arXiv p.10)
- 우리 설계에서: 순열(배정) QUBO에서 벌점을 고르는 방법 비교. 최선의 벌점 규칙은 문제·풀이기마다 다르다는 결론이므로, 우리 벌점 규칙을 고정하고 민감도를 보고하는 근거.

### A1-4. García, Ayodele & Moraglio (2022)
- 서지: Diez García, M., Ayodele, M., & Moraglio, A. (2022). Exact and sequential penalty weights in quadratic unconstrained binary optimisation with a digital annealer. *GECCO '22 Companion*, pp. 184–187. doi:10.1145/3520304.3528925
- 등재: 학회(4쪽 짧은 논문). 미확인
- 검증: **abstract** (Exeter 저장소 초록·메타데이터. 전문 PDF 내려받기 실패)
- 내용(초록): 어떤 QUBO에도 쓸 수 있는 '정확한' 벌점 계산법을 제안한다. 이 값은 '제약 없는 전역 최적해 = 실행 가능한 전역 최적해'를 보장하는 가장 작은 벌점의 단순 상한이며, 순차 벌점법으로 좁혀 갈 수 있다.
- 우리 설계에서: 우리 P(행 절댓값 합 + 1)도 같은 성격의 '보장 상한'이다. 순차적으로 P를 줄여 가며 전역 최적해가 바뀌지 않는지 완전 열거로 확인하면(RQ3와 같은 장치) 벌점 선택을 정량적으로 정당화할 수 있다.

### A1-5. Liu & Moraglio (2025)
- 서지: Liu, … & Moraglio, A. (2025). A Framework for Automatically Setting Multiple Penalty Weights in Quadratic Unconstrained Binary Optimization. *GECCO '25 Companion*, pp. 575–578. doi:10.1145/3712255.3726759
- 등재: 학회. 미확인
- 검증: **abstract 미만**(Crossref 서지만 확인. 초록·본문 미열람)
- 우리 설계에서: 띠마다, 실마다 다른 벌점을 줄 수 있다는 선택지의 최근 선례 후보. 본문을 확인하기 전에는 인용하지 않는 것이 안전하다.

### A1-6. Verma & Lewis (2022)
- 서지: Verma, A., & Lewis, M. (2022). Penalty and partitioning techniques to improve performance of QUBO solvers. *Discrete Optimization*, 44, 100594. doi:10.1016/j.disopt.2020.100594 (Crossref 대조; 온라인 공개 2020)
- 등재: 미확인
- 검증: **abstract** (도서관 메타데이터의 초록)
- 내용(초록): 큰 벌점은 해 공간을 압도하고, 작은 벌점은 실행 불가능한 최적해를 허용한다. 등식 제약 하나가 있는 문제에서 벌점 M의 상한을 구하는 방법을 제시한다.
- 우리 설계에서: 벌점 상한을 문제 구조에서 계산한다는 우리 방식의 직접 선례.

### A1-7. Zaborniak & Stege (2023/2024, 프리프린트)
- 서지: Zaborniak, T., & Stege, U. Discrete quadratic model QUBO solution landscapes. arXiv:2305.00568v3 (2024-02-15). DOI 없음(출판처 미확인)
- 등재: 프리프린트
- 검증: **direct** (arXiv v3)
- 인용: "For one-hot QUBO-encoded DQMs, no invalid solution occupies a local minimum for sufficiently large penalty strengths. Similarly, all valid solutions occupy local minima for sufficiently large penalty strengths. Furthermore, no valid solution occupies a local minimum for sufficiently small penalty strengths." (arXiv p.2)
- 우리 설계에서: **SA 이동 규칙과 직결되는 근거.** 벌점이 충분히 크면 모든 실행 가능한 배정이 1비트 뒤집기 기준 국소 최소가 된다. 즉 1비트 뒤집기 SA는 한 배정에서 다른 배정으로 가려면 반드시 벌점 장벽(실행 불가능 상태)을 넘어야 한다. 우리 P가 보수적 상한이라 이 장벽이 높다. RQ3(SA가 정확 최적에 닿는가)에서 실패가 나오면 원인 후보로 이 점을 적고, 대안으로 (a) 두 실을 맞바꾸는 이동(원-핫 유지), (b) 벌점 축소를 비교해야 한다.

### A1-8. Rovara, Quetschlich & Wille (2024/2026)
- 서지: Rovara, D., Quetschlich, N., & Wille, R. (2026). A Framework to Formulate Pathfinding Problems for Quantum Computing. *2026 IEEE 56th International Symposium on Multiple-Valued Logic (ISMVL)*, pp. 158–164. doi:10.1109/ISMVL68998.2026.00036 (Crossref). 프리프린트 arXiv:2404.10820
- 등재: 학회
- 검증: **direct** (arXiv v1)
- 인용: "Compared to the one-hot encoding, which uses the same number of variables, this encoding has the advantage of allowing the transition between two valid states with just one bitflip, while the one-hot encoding requires two bitflips" (arXiv p.6, 도메인 월 인코딩 설명)
- 우리 설계에서: 원-핫·도메인 월·이진 인코딩 비교와 고차 항을 보조 변수로 줄이는 자동화(MQT QUBOMaker). Zaborniak & Stege와 함께 '원-핫에서 1비트 SA는 유효 상태 사이를 바로 못 건너간다'의 근거.

### A1-9. Kuramata, Katsuki & Nakata (2021)
- 서지: Kuramata, M., Katsuki, R., & Nakata, K. (2021). Larger Sparse Quadratic Assignment Problem Optimization Using Quantum Annealing and a Bit-Flip Heuristic Algorithm. *2021 IEEE 8th International Conference on Industrial Engineering and Applications (ICIEA)*, pp. 556–565. doi:10.1109/ICIEA52957.2021.9436749
- 등재: 학회
- 검증: **direct** (arXiv 2012.10135v3)
- 인용: "the quadratic assignment problem (QAP) with linear equality constraints can be solved only up to size 12 in the quantum annealer D-Wave Advantage, which has 5640 qubits." (arXiv p.1 초록)
- 우리 설계에서: 프로젝트 07번 노트의 'QAP n=12가 D-Wave에 임베딩되지 않음'(Codognet 2022로 적힌 것)을 출판본 DOI가 있는 문헌으로 받칠 수 있다. 우리 띠별 QAP(n=18–41 변수, 실 6–9개)는 양자 하드웨어로도 들어가는 크기라는 주장의 상한 근거. 단, 깊이 보조 변수를 넣으면(아래) 이 한계를 넘을 수 있다.

### A1-10. Klar et al. (2022), Wu et al. (2025): 공장 배치의 양자 어닐링
- 서지: Klar, M., Schworm, P., Wu, X., Glatt, M., & Aurich, J. C. (2022). Quantum Annealing based factory layout planning. *Manufacturing Letters*, 32, 59–62. doi:10.1016/j.mfglet.2022.03.003 / Wu, X., Schworm, P., Klar, M., & Aurich, J. C. (2025). Factory layout planning using quantum annealing. *CIRP Annals*, 74, 627–631. doi:10.1016/j.cirp.2025.03.013 (둘 다 Crossref 대조)
- 등재: 미확인 (프로젝트 07번 노트: Klar = ESCI, Wu = SCIE. 이번에 재확인 못함)
- 검증: **abstract**
- 우리 설계에서: '기능 단위를 위치에 배정하는 배치 문제를 QUBO로 풀었다'는 가장 가까운 선행 연구. **이번 검색(2026-11-04)에서 주거 평면의 실 배정을 QUBO/양자 어닐링으로 푼 동료 심사 논문은 찾지 못했다.** Grasshopper 플러그인 'Qalico'(food4rhino)가 평면 구역 나누기에 양자 어닐링을 쓴다고 소개하나 논문이 없다. 그래서 "주거 평면 실 배정을 공간구문 목적의 QUBO로 쓴 첫 시도"라는 주장은 가능하나, '찾지 못했다'로 표현을 낮추는 것이 안전하다.

### A1-11. Kochenberger et al. (2014)
- 서지: Kochenberger, G., Hao, J.-K., Glover, F., Lewis, M., Lü, Z., Wang, H., & Wang, Y. (2014). The unconstrained binary quadratic programming problem: a survey. *Journal of Combinatorial Optimization*, 28(1), 58–81. doi:10.1007/s10878-014-9734-0
- 등재: 미확인
- 검증: **abstract** (Crossref 서지만)
- 우리 설계에서: UBQP 응용·풀이기 개관. QUBO가 배정 문제를 포함하는 일반 틀이라는 서론 인용용.

---

## A-2. 그래프 거리·깊이·중심성을 QUBO/Ising으로 쓰는 법, 고차 항 축소

### A2-1. Lucas (2014) §8 — 깊이 보조 변수
위 A1-1 참조. 정점별 깊이 원-핫 x_{v,i}, 간선 방향·깊이 x_{uv,i}, 연결성 제약을 전부 이차 벌점으로 쓴 예. 비용은 |V|(⌊|V|+1⌋+2)/2 + |E|(|V|+1) + |V|⌊1+log Δ⌋ 스핀(arXiv p.19). **'깊이 층 보조 변수'의 직접 선례**로 쓸 수 있는 유일한 1차 문헌이다.

### A2-2. Krauss & McCollum (2020)
- 서지: Krauss, T., & McCollum, J. (2020). Solving the Network Shortest Path Problem on a Quantum Annealer. *IEEE Transactions on Quantum Engineering*, 1, 1–12. doi:10.1109/TQE.2020.3021921
- 등재: 미확인
- 검증: **abstract** (TQE 소개 페이지·DOAJ 요약; IEEE 전문 페이지가 열리지 않음)
- 내용(초록 요약): 단일 출발·도착 최단 경로를 QUBO 세 가지로 쓴다. 홉(순번) 기반 |V||P| 큐비트, 선형계획(흐름 보존) 기반 |E|(방향)·2|E|(무방향), 무방향 전용 |E|+|V|. 벌점 배율을 명시한다.
- 우리 설계에서: **그래프가 고정되어 있을 때** 거리(경로)를 QUBO로 쓰는 방법. 우리 문제는 그래프 자체가 x에 따라 바뀌므로(배정이 인접을 정함) 그대로 쓸 수 없고, 간선 존재 a_uv(x)가 이차식이라 흐름 제약에 곱해지면 3차 이상이 된다. 그래서 아래 '층 지시 변수 + 축소'가 필요하다.

### A2-3. Rosenberg (1975) — 대입에 의한 축소
- 서지: Rosenberg, I. G. (1975). Reduction of bivalent maximization to the quadratic case. *Cahiers du Centre d'Études de Recherche Opérationnelle*, 17, 71–74. DOI 없음
- 등재: 해당 없음(1975년 학술지)
- 검증: **abstract 수준(2차 문헌 경유)** — 원문 미열람. 내용은 Dattani(2019) 리뷰로 확인.
- Dattani 리뷰 인용: "Pick a variable pair (b_i, b_j) and substitute b_i b_j with a new auxiliary variable b_a_ij. Enforce equality in the ground states by adding some scalar multiple of the penalty P = b_i b_j − 2b_i b_a_ij − 2b_j b_a_ij + 3b_a_ij … Since P > 0 if and only if b_a_ij ≠ b_i b_j" (Dattani arXiv 1901.04405 p.45) · 비용: "1 auxiliary variable per reduction" · 장점: "Variable can be used across the entire objective function, reducing many terms at once."
- 우리 설계에서: 깊이·통제값을 정확히 쓰면 생기는 3·4차 항(x·x·y)을 이차로 줄이는 기본 방법. 같은 곱 x_us·x_vt가 여러 깊이 층에서 반복되므로 대입 변수를 재사용할 수 있어 Rosenberg 방식이 잘 맞는다.

### A2-4. Ishikawa (2011)
- 서지: Ishikawa, H. (2011). Transformation of General Binary MRF Minimization to the First-Order Case. *IEEE Transactions on Pattern Analysis and Machine Intelligence*, 33(6), 1234–1249. doi:10.1109/TPAMI.2010.91
- 등재: 미확인
- 검증: **abstract 수준(2차 문헌 경유)**. Dattani 리뷰 인용: "This method re-writes a positive monomial using symmetric polynomials … ⌊(k−1)/2⌋ auxiliary variables for each k-order term" (arXiv 1901.04405 p.14)
- 우리 설계에서: 양(+) 계수 고차 항 하나를 줄일 때 Rosenberg보다 보조 변수가 적다. 음(−) 계수 항은 Kolmogorov–Zabih/Freedman–Drineas 방식(항당 보조 변수 1개, Dattani p.8)이 더 싸다. 실제로는 항 부호에 따라 섞어 쓴다.

### A2-5. Boros & Hammer (2002)
- 서지: Boros, E., & Hammer, P. L. (2002). Pseudo-Boolean optimization. *Discrete Applied Mathematics*, 123(1–3), 155–225. doi:10.1016/S0166-218X(01)00341-9
- 등재: 미확인
- 검증: **abstract** (Crossref 서지만)
- 우리 설계에서: 모든 유사 불 함수(이진 변수의 실수 함수)는 다항식으로 유일하게 쓸 수 있고 이차로 줄일 수 있다는 이론적 배경의 표준 인용. 공간구문 지표도 x의 유사 불 함수이므로 원리상 정확한 다항식(HUBO)이 존재한다는 논증에 쓴다.

### A2-6. Dattani (2019)
- 서지: Dattani, N. (2019). Quadratization in Discrete Optimization and Quantum Mechanics. arXiv:1901.04405. DOI 없음
- 등재: 프리프린트(리뷰)
- 검증: **direct**
- 우리 설계에서: 축소 방법(Rosenberg, Ishikawa, Kolmogorov–Zabih, Boros–Crama–Rodríguez-Heck 등)의 비용·장단점 비교표. 원전 대신 이 리뷰를 함께 인용하면 쪽 번호가 있는 근거가 된다.

---

## A-3. 데이터로 QUBO 계수 맞추기

### A3-1. Jaynes (1957)
- 서지: Jaynes, E. T. (1957). Information Theory and Statistical Mechanics. *Physical Review*, 106(4), 620–630. doi:10.1103/PhysRev.106.620
- 등재: 미확인
- 검증: **abstract** (Crossref 서지만; 원문 미열람)
- 우리 설계에서: 최대 엔트로피 원리. 관측 평균(관계 빈도)만 제약으로 둘 때 엔트로피 최대 분포가 지수형(볼츠만)이라는 원전. 프로젝트 `scripts/qubo-maxent.mjs`가 이미 인용.

### A3-2. Nguyen, Zecchina & Berg (2017)
- 서지: Nguyen, H. C., Zecchina, R., & Berg, J. (2017). Inverse statistical problems: from the inverse Ising problem to data science. *Advances in Physics*, 66(3), 197–261. doi:10.1080/00018732.2017.1341604
- 등재: 미확인
- 검증: **direct** (arXiv 1702.01522v4)
- 인용: "The connection between maximum entropy and the inverse Ising problem is simple: For a set of N binary variables, the distribution with given first and second moments maximizing the information entropy is the Boltzmann distribution (1) with the Ising Hamiltonian (2). … The Lagrange multipliers h and J need to be chosen to reproduce the first and second moments (magnetisations and correlations) of the data" (arXiv p.14, §3)
- 우리 설계에서: **'QUBO 계수 = 데이터의 1·2차 적률을 재현하는 라그랑주 승수'**라는 정식 근거. 우리 QUBO는 변수 x 수준이 아니라 '항 특징 φ_t(x)' 수준에서 맞추므로(지수족 + 충분통계량 φ), 정확히는 '특징 기대값 맞춤'이다. 리뷰의 유사가능도(pseudolikelihood) 절은 분배함수를 못 셀 때의 대안이지만, 우리는 배정 수가 적어 분배함수를 완전 열거로 정확히 계산할 수 있다.

### A3-3. Ackley, Hinton & Sejnowski (1985)
- 서지: Ackley, D. H., Hinton, G. E., & Sejnowski, T. J. (1985). A Learning Algorithm for Boltzmann Machines. *Cognitive Science*, 9(1), 147–169. doi:10.1207/s15516709cog0901_7
- 등재: 미확인
- 검증: **abstract** (Crossref 서지만)
- 우리 설계에서: 볼츠만 머신 학습(가중치 기울기 = 데이터 상관 − 모델 상관)의 원전. 우리 적률 맞춤의 경사 갱신과 같은 식이다.

### A3-4. Hinton (2002)
- 서지: Hinton, G. E. (2002). Training Products of Experts by Minimizing Contrastive Divergence. *Neural Computation*, 14(8), 1771–1800. doi:10.1162/089976602760128018
- 등재: 미확인 / 검증: **abstract** (서지만)
- 우리 설계에서: 모델 기대값을 MCMC 짧은 사슬로 근사하는 방법. 우리 규모에서는 완전 열거가 가능해 쓸 필요가 없다는 대비용. 더 큰 평면(4베이 이상)으로 넓힐 때의 대안.

### A3-5. Ziebart, Maas, Bagnell & Dey (2008) — 최대 엔트로피 역강화학습
- 서지: Ziebart, B. D., Maas, A., Bagnell, J. A., & Dey, A. K. (2008). Maximum Entropy Inverse Reinforcement Learning. *Proceedings of the Twenty-Third AAAI Conference on Artificial Intelligence (AAAI-08)*. DOI 없음. 논문집 쪽 범위 미확인
- 등재: 학회
- 검증: **direct** (AAAI 출판본 PDF)
- 인용: "We employ the principle of maximum entropy, which resolves this ambiguity by choosing the distribution that does not exhibit any additional preferences beyond matching feature expectations (Equation 1). … Under this model, plans with equivalent rewards have equal probabilities, and plans with higher rewards are exponentially more preferred." (p.2) · "At the maxima, the feature expectations match" (p.3)
- 우리 설계에서: **RQ4의 핵심 근거.** '관측된 해(실제 평면)를 설명하는 목적함수 가중치를 찾는' 문제를 최대 엔트로피·최대우도로 푸는 표준 방법. 관측 행동이 최적이 아니어도(실제 평면이 한 목적의 최적해가 아니어도) 쓸 수 있다는 점이 고전적 역최적화와 다르다.(쪽은 PDF 6쪽 중 몇째 쪽인지로 적음)

### A3-6. Ahuja & Orlin (2001)
- 서지: Ahuja, R. K., & Orlin, J. B. (2001). Inverse Optimization. *Operations Research*, 49(5), 771–783. doi:10.1287/opre.49.5.771.10607
- 등재: 미확인 / 검증: **abstract** (서지만)
- 우리 설계에서: 고전적 역최적화(관측 해가 최적이 되도록 비용 벡터를 최소로 바꿈)의 원전.

### A3-7. Chan, Mahmood & Zhu (2025)
- 서지: Chan, T. C. Y., Mahmood, R., & Zhu, I. Y. (2025). Inverse Optimization: Theory and Applications. *Operations Research*, 73, 1046–1074. doi:10.1287/opre.2022.0382 (권·쪽 Crossref; 호수 미확인)
- 등재: 미확인
- 검증: **direct** (arXiv 2109.03920v2)
- 인용: "inverse optimization takes decisions as input and determines an objective and/or constraints that render these decisions approximately or exactly optimal" (arXiv p.1) · 정수 모형: "this program requires an exponential number of variables … and an exponential number of constraints" (arXiv p.13, §3.4) · IRL과의 관계: "the Maximum Entropy literature posits that … the observed trajectories τ are drawn from an optimal policy … This can recast IRL as a maximum likelihood problem … [that] follows a Boltzmann distribution." (arXiv p.34)
- 우리 설계에서: 역최적화 전반의 최신 리뷰. 이산(정수) 순방향 문제에서는 역문제의 제약이 실행 가능 해(극점) 수만큼 생기지만, **우리 배정 공간은 실 수가 작아(띠별 순열 ≤ 5!·5!) 전부 열거할 수 있어 정확한 역문제를 풀 수 있다.** 같은 리뷰가 최대 엔트로피 IRL을 볼츠만 분포의 최대우도로 정리하므로, 프로젝트의 maxent 적률 맞춤을 '역최적화의 확률적 변형'으로 자리매김할 수 있다.

### A3-8. Ratliff, Bagnell & Zinkevich (2006) — 최대 마진 계획
- 서지: Ratliff, N. D., Bagnell, J. A., & Zinkevich, M. A. (2006). Maximum margin planning. *Proceedings of the 23rd ICML*, pp. 729–736. doi:10.1145/1143844.1143936
- 등재: 학회 / 검증: **abstract** (서지만)
- 우리 설계에서: '관측 해가 다른 모든 해보다 마진만큼 낮은 에너지를 갖도록' 가중치를 맞추는 대안. 결론이 추정 방법에 좌우되지 않는지 보는 강건성 점검용.

### A3-9. Keshavarz, Wang & Boyd (2011)
- 서지: Keshavarz, A., Wang, Y., & Boyd, S. (2011). Imputing a convex objective function. *2011 IEEE International Symposium on Intelligent Control*, pp. 613–619. doi:10.1109/ISIC.2011.6045410
- 등재: 학회 / 검증: **abstract** (서지만)
- 우리 설계에서: 근사 최적 관측 해로 목적함수를 추정(부최적성 잔차 최소화). 연속 볼록 문제라 직접 쓰지는 않고 관련 연구로만.

### A3-10. Kitai et al. (2020) — FMQA
- 서지: Kitai, K., Guo, J., Ju, S., Tanaka, S., Tsuda, K., Shiomi, J., & Tamura, R. (2020). Designing metamaterials with quantum annealing and factorization machines. *Physical Review Research*, 2(1), 013319. doi:10.1103/PhysRevResearch.2.013319
- 등재: Scopus·ESCI (APS 'About PRResearch' 페이지 "currently included in the Emerging Sources Citation Index", 2026-11-04 조회. SCIE 아님)
- 검증: **direct** (arXiv 1902.06573, 제목이 출판본과 다른 프리프린트 'Expanding the horizon of automated metamaterials discovery via quantum annealing')
- 인용: "First, a factorization machine (FM) is trained with available data to model the material's property of interest. Selection of a new candidate with respect to an acquisition function based on a trained FM boils down to a QUBO and solved by the quantum annealer. … a new point is added to training data, and the FM is retrained." (arXiv p.4)
- 우리 설계에서: **'비선형 목적을 데이터로 맞춘 이차 대리 모형 → QUBO → 어닐링'의 대표 선례.** 우리 공간구문 대리 항(정확 지표를 φ로 회귀, Spearman 0.47–0.80)과 구조가 같다. 차이: FMQA는 대리 모형을 반복 재학습(능동 학습)하지만 우리는 한 번 맞춘다. FMQA처럼 SA 해에서 정확 지표를 다시 재고 대리 모형을 갱신하면 대리 오차가 최적해 근처에서 줄어든다.

### A3-11. Rendle (2010) — Factorization Machines
- 서지: Rendle, S. (2010). Factorization Machines. *2010 IEEE International Conference on Data Mining*, pp. 995–1000. doi:10.1109/ICDM.2010.127
- 등재: 학회 / 검증: **abstract** (서지만)
- 우리 설계에서: FMQA의 대리 모형. 이차 계수를 저랭크 V·Vᵀ로 묶어 데이터가 적을 때 과적합을 줄인다. 우리 대리 항 회귀의 대안 모형.

### A3-12. Baptista & Poloczek (2018) — BOCS
- 서지: Baptista, R., & Poloczek, M. (2018). Bayesian Optimization of Combinatorial Structures. *Proceedings of the 35th ICML*, PMLR 80. DOI 없음(PMLR). 쪽 범위 미확인
- 등재: 학회
- 검증: **direct** (arXiv 1806.08838)
- 인용: "We found that second-order models provide an excellent trade-off in practice … While the so-called interaction terms are quadratic in x ∈ D, the regression model is linear in α" (arXiv p.2) · "we also investigated alternative techniques to solve the problem in (5) and have found good performance with stochastic local search, specifically with simulated annealing." (arXiv p.4)
- 우리 설계에서: **이차(2차) 대리 모형 + SA**를 이진 조합 공간에서 쓴 선례. '이차 모형은 x에 대해 이차지만 계수에 대해 선형이라 회귀로 맞출 수 있다'는 문장이 우리 에너지 E = Σ w_t φ_t(x)(가중치에 선형) 설계와 같은 논리다. 2차까지로 자른 이유('표현력과 데이터 부족 사이의 맞바꿈')의 근거.

## A-4. 평면 생성·공간 배치 최적화(하위 조사 원문)

### (A-4 머리말) Part A4: 평면 생성·공간 배치 최적화 문헌과 "실제감(realism)" 평가 방식

조사일: 2026-11-04. 서지 정보는 모두 Crossref API(`api.crossref.org/works/DOI`)로 확인했고, 주요 DOI는 doi.org에서 302 응답(정상 해석)을 받았다.
전문은 `scratchpad/dl-a4/`에 받아 두었다(arXiv, 학회 공개본, 저자 공개본만 사용).

**표기 규칙**
- **검증 수준**: `direct`는 전문을 읽고 원문 그대로 인용한 경우다. 쪽수는 내려받은 PDF의 쪽 번호이며, 학술지 인쇄 쪽과 다를 수 있다. `abstract`는 초록만 읽은 경우다. `메타`는 서지(Crossref)만 확인하고 초록이나 전문은 보지 못한 경우다.
- **색인**: 명명된 출처에서 확인하지 못했으면 "미확인"으로 적었다. Clarivate MJL은 로그인이 필요해 이번 조사에서 조회하지 못했다. 같은 학술지가 프로젝트 `evidence/07-참고-문헌.md`에 SCIE로 이미 적혀 있으면 "(07 문서 기재, 본 조사 재확인 안 함)"으로 덧붙였다.
- **RQ4 열**: 생성안을 *실제 도면의 분포*와 비교하는지(●), 실제 도면과 일대일 또는 쌍으로만 비교하는지(◐), 실제 도면과 비교하지 않는지(○)를 표시했다.

### 1. House-GAN (Nauata et al., 2020)

- **서지**: Nauata, N., Chang, K.-H., Cheng, C.-Y., Mori, G., & Furukawa, Y. (2020). House-GAN: Relational Generative Adversarial Networks for Graph-Constrained House Layout Generation. In *Computer Vision – ECCV 2020* (LNCS, pp. 162–177). Springer. doi:10.1007/978-3-030-58452-8_10
- **색인**: 학회(ECCV, LNCS). **검증**: direct (arXiv:2003.06988).
- **평가 방식**:
  - 실제감은 사용자 쌍 비교로 측정했다. 다양성은 실-타입 색으로 래스터화한 배치의 FID로, 호환성은 입력 버블다이어그램과 출력에서 재구성한 그래프 사이의 GED로 측정했다.
  - 데이터는 LIFULL HOME'S의 실제 평면 117,587장이다.
- **원문 인용**:
  - p.4: "The realism is measured by an average user rating. We present a generated house layout against a ground-truth or another method."
  - p.4: "The diversity is measured by the FID score [10] with the rasterized layout images."
  - p.5: "The compatibility with the bubble diagram is a graph editing distance [2] between the input bubble diagram and the bubble diagram constructed from the output layout in the same way as the GT preparation above."
  - p.10: "We conducted a user study with 12 graduate students and 10 professional architectures."
- **RQ4 관련**: FID는 생성 배치 집합과 실제 배치 집합의 분포 거리다. 따라서 "실제 분포 비교"에 해당하지만 이미지 특징 공간에서의 비교이고, 위상(출입 구조)을 직접 재지는 않는다. GED는 *입력 조건*과의 일치도일 뿐 실제 도면과의 비교가 아니다.
- **우리 설계에서 뒷받침하는 점**: 그래프 조건 생성 연구의 표준 3지표(실제감, 다양성, 호환성)가 있다는 근거다. 우리는 입력 버블그래프 없이 목적함수로 생성하므로 GED형 호환성 지표는 그대로 쓸 수 없다. 이 점을 방법론에서 밝혀야 한다.

### 2. House-GAN++ (Nauata et al., 2021)

- **서지**: Nauata, N., Hosseini, S., Chang, K.-H., Chu, H., Cheng, C.-Y., & Furukawa, Y. (2021). House-GAN++: Generative Adversarial Layout Refinement Network towards Intelligent Computational Agent for Professional Architects. *2021 IEEE/CVF CVPR*, 13627–13636. doi:10.1109/CVPR46437.2021.01342
- **색인**: 학회(CVPR). **검증**: direct (arXiv:2103.02574).
- **평가 방식**: House-GAN의 3지표를 그대로 이었다. 실제감은 방법 쌍마다 100쌍을 아마추어 10명과 건축가 10명에게 보여 승(+1), 패(−1), 무(0)로 매겼다.
- **원문 인용**:
  - p.3: "Roughly speaking, realism is an average user rating, diversity is the Fréchet Inception Distance (FID) [13], and the compatibility is the graph edit distance (GED) [1] between the input bubble-diagram and the one constructed from the output layout."
  - p.5: "A subject is presented a pair of layouts as in Fig. 5, and asked which one is more realistic or a tie. A method scores (+1) for a win, (−1) for a loss, and (0) for a tie."
- **RQ4 관련**: 실제감은 GT를 포함한 쌍 비교라서 분포 수준의 비교가 아니다. 사람 판단에 의존한다.
- **우리 설계에서 뒷받침하는 점**: 사용자 연구는 비용이 크고 재현이 어렵다. 우리가 사람 평가 대신 **실제 도면 분포와의 통계 비교**를 주 평가로 삼는 근거의 대조군으로 쓸 수 있다.

### 3. Graph2Plan (Hu et al., 2020)

- **서지**: Hu, R., Huang, Z., Tang, Y., van Kaick, O., Zhang, H., & Huang, H. (2020). Graph2Plan: Learning Floorplan Generation from Layout Graphs. *ACM Transactions on Graphics*, 39(4), Article 118. doi:10.1145/3386569.3392391
  - Crossref 제목 필드에는 "Graph2Plan"만 나온다. 논문 번호 118은 Crossref에 없고 arXiv판에는 "Article 1"로 찍혀 있으므로 출판본에서 확인이 필요하다.
- **색인**: 미확인. **검증**: direct (arXiv:2004.13204).
- **평가 방식**: RPLAN(8만 장)으로 학습했다. 실제감은 테스트셋의 실제 도면(GT)과 생성안을 나란히 보여 주고 "더 그럴듯한 것"을 고르게 했다. 결과는 GT/ours/구분 불가 = 304/218/78이었다. 무작위 상자로 만든 필터 과제로 불성실 응답을 걸렀다.
- **원문 인용**:
  - p.11: "We evaluate the quality of a sample of floorplans generated by Graph2Plan in a user study where we asked users to compare generated floorplans with ground-truth (GT) floorplans taken from the test set."
  - p.11: "We asked 30 participants to do the user study, all of which are graduate students in computer science, and collected 600 answers in total. The votes for the options “GT/ours/cannot tell” are 304/218/78"
- **RQ4 관련**: ◐. GT와 일대일로 짝지은 사람 비교다. 참가자가 모두 컴퓨터과학 대학원생이라는 한계가 있다.
- **우리 설계에서 뒷받침하는 점**: "실제 도면을 기준선으로 쓴다"는 발상의 선례다. 다만 우리는 사람 판단 대신 지표 분포로 비교한다는 차별점을 기술할 수 있다.

### 4. RPLAN: Data-driven interior plan generation (Wu et al., 2019)

- **서지**: Wu, W., Fu, X.-M., Tang, R., Wang, Y., Qi, Y.-H., & Liu, L. (2019). Data-driven interior plan generation for residential buildings. *ACM Transactions on Graphics*, 38(6), 1–12 (Article 234는 미확인). doi:10.1145/3355089.3356556
- **색인**: 미확인. **검증**: abstract (Crossref 초록). 저자 페이지의 PDF 링크는 공유 저장소로 연결돼 있어 전문을 받지 못했다.
- **초록의 요지**: 경계가 주어지면 거실 위치를 먼저 정하고 나머지 실을 반복해서 생성한다. 실제 주거 평면을 수작업으로 주석한 RPLAN 데이터셋을 구축했다. 초록에는 "formative user studies"로 그럴듯함을 비교했고, 많은 경우 사람이 만든 도면과 견줄 만했다고 적혀 있다.
- **RQ4 관련**: ◐ (사용자 연구). 다만 "거의 모든 평면에 거실이 있다"는 관찰을 생성 순서에 반영한 점이 우리와 맞닿는다.
- **우리 설계에서 뒷받침하는 점**: 거실을 중심(앵커)에 두는 설계(현관이 거실로 열림, 거실 통제값)를 데이터 기반 생성 연구도 채택했다는 정황 근거다. 초록 수준이므로 "거실 우선 배치"라는 사실만 인용해야 한다.

### 5. HouseDiffusion (Shabani et al., 2023)

- **서지**: Shabani, M. A., Hosseini, S., & Furukawa, Y. (2023). HouseDiffusion: Vector Floorplan Generation via a Diffusion Model with Discrete and Continuous Denoising. *2023 IEEE/CVF CVPR*, 5466–5475. doi:10.1109/CVPR52729.2023.00529
- **색인**: 학회(CVPR). **검증**: direct (arXiv:2211.13287).
- **평가 방식**:
  - RPLAN에서 FID(다양성), 수정 GED(호환성), 사용자 연구(실제감)를 측정했다. 실제감은 House-GAN++와 달리 **GT와의 대결 점수만** 보고했고, GT 대비 −0.19였다.
  - 비맨해튼 데이터에서는 GT 자체가 비현실적일 수 있어 실제감 점수를 쓰지 않았다.
- **원문 인용**:
  - p.6: "Diversity is the Frechet Inception Distance (FID) [13]. Compatibility is the modified Graph Edit Distance [1] between the input bubble diagram and the one reconstructed from the generated floorplan. Realism is based on user studies"
  - p.6: "HouseDiffusion achieves significant improvements with a score of −0.19 even against the ground-truth"
- **RQ4 관련**: ◐/●. GT와의 쌍 비교와 FID 분포 비교를 함께 쓴다.
- **우리 설계에서 뒷받침하는 점**: "기준선 자체가 실제적이어야 실제감 비교가 성립한다"는 점을 저자들도 인정했다. AI Hub 실제 세대(현관 하나 = 세대 하나)를 기준선으로 엄격히 정의하는 우리 방식의 정당화에 쓸 수 있다.

### 6. Generative Layout Modeling using Constraint Graphs (Para et al., 2021)

- **서지**: Para, W., Guerrero, P., Kelly, T., Guibas, L., & Wonka, P. (2021). Generative Layout Modeling using Constraint Graphs. *2021 IEEE/CVF ICCV*, 6670–6680. doi:10.1109/ICCV48922.2021.00662
- **색인**: 학회(ICCV). **검증**: direct (arXiv:2011.13417).
- **평가 방식**:
  - FID에 더해 **배치 통계 집합**을 GT 분포와 비교했다.
  - 위상 통계에는 실-유형 쌍의 평균 그래프 거리, 외부까지의 그래프 거리 히스토그램, 차수 히스토그램, 접근 불가 실의 수가 들어간다.
  - 형태 통계(위치, 면적, 종횡비 히스토그램)와 정렬 통계도 비교했다.
  - FID가 위상을 잘 잡지 못한다고 명시했다.
- **원문 인용**:
  - p.1: "Realism of such generated content is often assessed by comparing distributions of their properties, both topological and spatial, against those from real-world statistics."
  - p.6: "We compare generated layouts to ground truth layouts using two metrics: The Fréchet Inception Distance (FID) [16] computed on rendered layouts, and a metric based on a set of layout statistics that measure layout properties that the image-based FID is less suitable for."
  - p.7: "The FID score correlates most strongly with the adjacency statistics, since adjacencies can be captured by only considering small spatial neighborhoods around corners and walls of a floor plan, but does not capture topology or room shape statics accurately that require considering larger-scale features."
- **RQ4 관련**: ● **가장 직접적인 선례다.** 출입 그래프 위의 거리 지표 분포(공간구문 깊이와 유사)를 실제 분포와 비교했다.
- **우리 설계에서 뒷받침하는 점**:
  - RQ4에서 생성안과 AI Hub 실제 세대의 *지표 분포*(깊이, 통합도, 면적비 등)를 비교하는 설계의 핵심 근거다.
  - "이미지 기반 FID로는 위상을 못 잡으므로 쓰지 않는다"는 판단의 직접 인용 근거다.

### 7. Space Syntax 기반 평면 생성 평가 (Jiang et al., 2026, 프리프린트)

- **서지**: Jiang, Z., Zhang, D., Liu, Q., & Liang, Y. (2026). Rethinking Floorplan Generation with Space Syntax: From Design Theory to Model Improvement. arXiv:2602.22507 (v3, 2026-10-10). doi:10.48550/arXiv.2602.22507
  - doi.org에서 arxiv.org/abs/2602.22507로 해석된다. 검색 결과에는 "Space Syntax-guided Post-training for Residential Floor Plan Generation"이라는 v1 제목이 나타났다.
- **색인**: 프리프린트. 동료심사 게재는 미확인이다. **검증**: direct (arXiv v3).
- **평가 방식**:
  - 볼록공간 출입 그래프를 복원해 통합도를 계산하는 연산자(SSIO)를 정의했다. 4개 실제 주거 말뭉치(RPLAN, LIFULL 등, 15개국)에 적용한 결과 공용공간 통합도가 가장 높았다.
  - RPLAN을 기준으로, 실-유형별 통합도 프로파일의 평균 절대 차이(IPD)와 거실의 통합도 우위(PIA)로 생성 모델을 평가했다.
  - 생성 평면은 공용공간의 통합도 우위가 실제보다 작다는 "설계 격차"를 보고했다.
- **원문 인용**:
  - p.1: "Comparison with this reference reveals a design gap: public spaces in generated floorplans have a smaller integration advantage over other spaces."
  - p.1: "Common evaluation metrics assess visual similarity, geometric validity, and constraint satisfaction (Regenwetter et al., 2023; Zeng et al., 2025a), but do not directly measure how well spaces are organized for use"
  - p.4: "Integration Profile Distance (IPD) measures the mean absolute mismatch between the accepted and reference functional profiles (Eq. (1))."
- **RQ4 관련**: ● 공간구문 지표의 **실제 말뭉치 분포를 기준선으로** 생성안을 평가하는, 우리와 가장 가까운 설계다. 실 수를 맞춘(room-count-matched) 비교라는 통제도 우리에게 유용하다.
- **우리 설계에서 뒷받침하는 점**:
  - 공간구문을 근거 축으로 삼고 실제 도면 분포와 비교하는 우리 RQ4가 최신 연구 흐름과 일치한다는 근거다.
  - 거실 통합도 우위는 우리의 "거실 중심" 제약과 같은 방향이다.
  - 실 수 맞춤 비교는 우리 비교군 설계(같은 실 구성 세대끼리)에 그대로 차용할 수 있다.
  - 단, 프리프린트이므로 본문 인용 시 "preprint"로 명시해야 한다. 말뭉치 의존성(한국 데이터 없음)은 우리 연구의 차별점이 된다.

### 8. Computer-Aided Layout Generation for Building Design: A Review (Liu et al., 2025)

- **서지**: Liu, J., Xue, Y., Ni, H., Yu, R., Zhou, Z., & Huang, S. X. (2025). Computer-Aided Layout Generation for Building Design: A Review. *Computational Visual Media*, 11(4), 677–707. doi:10.26599/CVM.2025.9450484
- **색인**: 미확인. **검증**: direct. arXiv:2504.09694 v1을 읽었으며, 출판본과의 문구 동일성은 미확인이다.
- **내용**: 평면 생성의 평가 지표를 정리했다. 실제감(전문가·아마추어 점수), FID(실제 분포와의 거리, 다양성을 간접 반영), 호환성(GED), PRD, Intra-FID 등을 다룬다.
- **원문 인용**: p.9: "In the context of floorplan generation, the entire test set of generated floorplans and their corresponding real counterparts are considered for FID computation. As a result, the FID score can also indirectly account for diversity, as low diversity in generated images may lead to a poor match with the real image distribution."
- **우리 설계에서 뒷받침하는 점**: "분야의 표준 지표는 실제감 사용자 연구, FID, GED"라고 정리할 때의 종설 근거다. 이 지표들이 모두 학습형 이미지·그래프 생성기를 전제로 한다는 점을 우리 방법과 대비할 수 있다.

### 9. Çiçek & Turhan (2022): 구문 평가를 적합도로 쓴 다목적 진화 최적화

- **서지**: Cicek, S., & Turhan, G. D. (2022). Computational generation of a spatial layout through syntactical evaluation and multi-objective evolutionary optimization. *International Journal of Architectural Computing*, 20(3), 610–629. doi:10.1177/14780771221120576
- **색인**: 미확인. **검증**: abstract (Crossref).
- **초록의 요지**: 공간구문의 Justified Graph Analysis와 Integration Value를 다목적 진화 최적화의 적합도 기준으로 통합했다. 대상은 단지(site) 수준의 배치다.
- **RQ4 관련**: ○ 실제 분포와 비교했다는 기술은 초록에 없다.
- **우리 설계에서 뒷받침하는 점**: "공간구문 지표를 메타휴리스틱 목적함수로 쓴다"는 선례다. 우리는 SA·QUBO라는 차이가 있고, 실제 도면 분포 비교를 더한다는 차별점이 있다. 대상이 세대 내부가 아니라 단지라는 점을 정확히 적어야 한다.

### 10. Lee, Ostwald & Gu (2015): JPG 분석과 형태문법 생성

- **서지**: Lee, J. H., Ostwald, M. J., & Gu, N. (2015). A syntactical and grammatical approach to architectural configuration, analysis and generation. *Architectural Science Review*, 58(3), 189–204. doi:10.1080/00038628.2015.1015948
- **색인**: 미확인. **검증**: abstract (OpenAlex 초록).
- **초록의 요지**: 정당화 평면 그래프(JPG) 문법 분석으로 건축 양식의 구문을 파악하고, 이를 3D 형태문법으로 옮겨 변형안을 생성한다. Glenn Murcutt 주택 10채로 시연했다.
- **우리 설계에서 뒷받침하는 점**: 실제 사례의 출입 그래프 구문에서 출발해 생성으로 넘어가는 흐름의 선례다. 프로젝트에 이미 있는 Lee, Ostwald & Gu (2018) EPB 논문의 전신으로 함께 인용할 수 있다.

### 11. Huang (2026): 중국 전형 아파트의 JPG 분석과 이진 필터

- **서지**: Huang, Y. (2026). A Justified Plan Graph Analysis of a Typical Apartment in China: Focusing on Interior Traffic Spaces and a Binary Filtration System for Neural Network. *Buildings*, 16(2), 364. doi:10.3390/buildings16020364
- **색인**: 미확인 (Buildings는 07 문서에 SCIE로 기재, 본 조사 재확인 안 함). **검증**: abstract. MDPI 페이지는 403으로 막혀 전문을 받지 못했다.
- **초록의 요지**: 방 3개 아파트의 7개 구성에 JPG를 적용했다. L자형 다기능 동선 핵심공간을 찾아내고, 가능한 이진 설계 중 유효한 것을 거르는 필터를 제안했다.
- **우리 설계에서 뒷받침하는 점**: 동아시아 아파트에서 JPG(공간구문)와 생성 AI를 결합하는 시도의 최근 사례다. 다만 사례 수가 작다(전형 평면 1종).

### 12. Maeng & Hyun (2021): 한국 아파트 단위세대 대규모 평면 분석

- **서지**: Maeng, H., & Hyun, K. H. (2021). A Deep Learning Driven Method to Analyze Large Scale Dataset of Korean Apartment Unit Floor Plan: Focused on the Korean Apartment from 1970 to 2020. *한국실내디자인학회 논문집 (Journal of the Korean Institute of Interior Design)*, 30(3), 65–76. doi:10.14774/JKIID.2021.30.3.065
- **색인**: 미확인 (KCI 등재 여부를 본 조사에서 확인하지 못함). **검증**: abstract (OpenAlex 초록).
- **초록의 요지**:
  - 단위세대 34,132개와 평면 이미지 5,344장에서 실루엣, 실 수와 면적, 직접 연결성, 인접 연결성을 추출했다.
  - 실 유형별 면적비, 면적과 직접 연결성의 관계, 침실 모듈화 패턴을 분석했다.
  - 한국 아파트 단위평면의 배치가 균일하지 않다고 보고했다.
- **RQ4 관련**: 생성 연구는 아니다. 한국 실제 평면의 분포(면적비, 연결성)를 대규모로 기술한 선행 연구다.
- **우리 설계에서 뒷받침하는 점**: AI Hub 전수 자료로 실제 분포 기준선을 세우는 우리 작업의 국내 선례다. "평면이 균일하지 않다"는 결론은 단일 대표 평면이 아니라 **분포 전체**와 비교해야 한다는 근거가 된다. 원문 수치를 인용하려면 전문 확인이 필요하다.

### 13. Liggett (2000): 자동 시설 배치 종설

- **서지**: Liggett, R. S. (2000). Automated facilities layout: past, present and future. *Automation in Construction*, 9(2), 197–215. doi:10.1016/S0926-5805(99)00005-9
- **색인**: 미확인 (Automation in Construction은 07 문서에 SCIE로 기재). **검증**: 메타. 원문과 초록은 보지 못했다.
- **2차 확인**: Calixto & Celani (2015, #18) 전문 p.1은 Liggett을 인용해 세 계열을 소개한다. "According to Ligget (2000), there are three main methods for solving SP problems. The first method implies the optimization of a function that uses a single criterion ... The second method is related to graph theory ... The third method is ... to satisfy a diverse set of constraint relations." 이는 2차 인용이다.
- **우리 설계에서 뒷받침하는 점**: QAP형 단일 목적함수 최적화(우리 QUBO의 계보), 그래프 기반, 제약 만족이라는 고전적 분류다. 본문에서 Liggett을 직접 인용하려면 원문을 확인해야 한다.

### 14. Medjdoub & Yannou (2000): 위상과 기하의 분리

- **서지**: Medjdoub, B., & Yannou, B. (2000). Separating topology and geometry in space planning. *Computer-Aided Design*, 32(1), 39–61. doi:10.1016/S0010-4485(99)00084-6
- **색인**: 미확인. **검증**: direct. 저자 공개본 arXiv:1303.4017(32쪽)을 읽었다.
- **원문 인용**: p.2: "Starting with design specifications in terms of constraints over spaces, a specific enumeration heuristics leads to a complete set of consistent conceptual design solutions named topological solutions. These topological solutions which do not presume any precise definitive dimension correspond to the sketching step"
- **RQ4 관련**: ○ 제약 충족이 기준이고, 실제 도면과 비교하지 않는다.
- **우리 설계에서 뒷받침하는 점**: 우리가 2띠(two-band) 슬롯에 실을 할당하는 *위상 단계*를 먼저 풀고 치수는 별도로 다루는 구조의 고전적 근거다.

### 15. Guo & Li (2017): 다중 에이전트 위상 탐색과 진화 최적화

- **서지**: Guo, Z., & Li, B. (2017). Evolutionary approach for spatial architecture layout design enhanced by an agent-based topology finding system. *Frontiers of Architectural Research*, 6(1), 53–62. doi:10.1016/j.foar.2016.11.003 (CC BY-NC-ND 4.0)
- **색인**: 미확인. **검증**: abstract (OpenAlex). ScienceDirect는 403으로 막혔다.
- **초록의 요지**: 다중 에이전트 위상 탐색으로 위상을 만족하는 배치를 먼저 만들고, 진화 최적화로 사전 정의한 건축 기준을 정제한다. 위상 탐색이 탐색 공간을 줄여 최적화 성능을 높인다.
- **RQ4 관련**: ○
- **우리 설계에서 뒷받침하는 점**: "위상을 먼저 고정하거나 제약하면 메타휴리스틱 탐색이 효율화된다"는 근거다. 우리의 현관-거실 하드 제약과 슬롯 구조의 정당화에 쓸 수 있다.

### 16. Laignel et al. (2021): CP + GA 혼합 평면 생성

- **서지**: Laignel, G., Pozin, N., Geffrier, X., Delevaux, L., Brun, F., & Dolla, B. (2021). Floor plan generation through a mixed constraint programming-genetic optimization approach. *Automation in Construction*, 123, 103491. doi:10.1016/j.autcon.2020.103491
- **색인**: 미확인 (07 문서에 학술지 SCIE 기재). **검증**: abstract(간접). Crossref와 OpenAlex에 초록이 없어, 웹 검색 결과가 요약한 초록 내용만 확인했다.
- **요지**:
  - 다각형 세대 외곽과 실 목록·면적을 입력받는다.
  - 공간을 격자로 이산화하고 **셀 할당 문제로 환원**한 뒤 제약 프로그래밍과 유전 최적화를 결합해 푼다.
  - 출력이 건축적·기능적으로 타당하고, 대부분 약 1분 안에 생성된다고 보고했다.
- **RQ4 관련**: ○ (확인 범위 안에서)
- **우리 설계에서 뒷받침하는 점**: "평면 생성을 이산 할당 문제로 환원해 메타휴리스틱으로 푼다"는 우리 QUBO 정식화의 가장 가까운 공학 선례다. 본문에 인용하기 전에 전문을 확인할 것을 권한다.

### 17. Weber, Mueller & Reinhart (2022): 자동 평면 생성 종설

- **서지**: Weber, R. E., Mueller, C., & Reinhart, C. (2022). Automated floorplan generation in architectural design: A review of methods and applications. *Automation in Construction*, 140, 104385. doi:10.1016/j.autcon.2022.104385
  - Crossref 제목 표기는 "floorplan"(한 단어)이다. 요청서의 "floor plan"과 다르다.
- **색인**: 미확인 (07 문서에 학술지 SCIE 기재). **검증**: abstract(간접).
  - eScholarship 공개본(CC BY-NC-ND)은 내려받기에 실패했다(빈 응답, 봇 차단).
  - 웹 검색 요약으로만 "bottom-up, top-down, referential" 세 분류를 확인했다.
- **우리 설계에서 뒷받침하는 점**: 최근 종설 인용처다. 우리 방법은 목적함수 최적화(bottom-up 또는 top-down)와 실제 도면 참조(referential)를 평가 단계에서 결합하는 위치로 설명할 수 있다. 다만 이 분류명을 본문에 쓰려면 원문 확인이 필요하다.

### 18. Calixto & Celani (2015): 진화 알고리즘 공간계획 종설(1992–2014)

- **서지**: Calixto, V., & Celani, G. (2015). A literature review for space planning optimization using an evolutionary algorithm approach: 1992-2014. In *Anais do XIX Congresso da SIGraDi* (pp. 662–671). doi:10.5151/despro-sigradi2015-110166
- **색인**: 학회. **검증**: direct (Blucher 공개 PDF).
- **원문 인용**: PDF p.5 (평가 방법 절): "Quadratic assignment problem is one of the most popular methods to solve space planning problems (LIGGET, 2000). ... A Quadratic Assignment Problem (QAP) is developed to search for optimal locations for a set of interrelated elements (LIGGET,2000)."
- **우리 설계에서 뒷받침하는 점**: 공간계획에서 평가식으로 QAP가 가장 널리 쓰였다는 근거다. QAP는 이진 변수로 쓰면 QUBO가 되므로, 우리 QUBO 정식화의 계보를 설명할 수 있다.

### 19. Yi & Yi (2014): SA를 이용한 3D 공간 배치

- **서지**: Yi, H., & Yi, Y. K. (2014). Performance Based Architectural Design Optimization: Automated 3D Space Layout Using Simulated Annealing. In *Proceedings of the 2014 ASHRAE/IBPSA-USA Building Simulation Conference (SimBuild 2014)*, Atlanta. doi:10.26868/25746308.2014.37
- **색인**: 학회. **검증**: direct (IBPSA 공개 PDF).
- **원문 인용**:
  - PDF p.1 초록: "space layouts are constrained into three-dimensional grid allocation of functional typological relationship"
  - PDF p.4: "As the integer linear programming is NP-complete, this instance is intractable with an exact method in a large set, so heuristic methods must be used instead."
- **RQ4 관련**: ○ 환경 성능 지표로만 평가했다.
- **우리 설계에서 뒷받침하는 점**: 격자·슬롯 할당과 SA의 조합이 주거 배치 문제에 쓰인 선례다. 정확해법이 어렵기 때문에 SA를 쓴다는 논리도 우리와 같다.

### 20. Grzesiak-Kopeć, Strug & Ślusarczyk (2021): 주택 평면 진화 기법

- **서지**: Grzesiak-Kopeć, K., Strug, B., & Ślusarczyk, G. (2021). Evolutionary Methods in House Floor Plan Design. *Applied Sciences*, 11(17), 8229. doi:10.3390/app11178229
- **색인**: 미확인. **검증**: abstract (OpenAlex). MDPI 전문 페이지는 403이었다.
- **초록의 요지**: 벽 끝점 좌표 벡터를 유전형으로 쓰는 진화 기법과 요구조건 가중 적합도 평가법을 제안했다. 단층 주택 사례로 시연했다.
- **우리 설계에서 뒷받침하는 점**: 메타휴리스틱 평면 생성의 평가가 *요구조건 충족 적합도*에 머무는 전형적 사례다. 실제 도면 분포 비교가 비어 있다는 공백을 보여 주는 근거로 쓸 수 있다.

### 21. Gurcan Bahadir & Tong (2025): 공간계획 계산 기법 체계적 종설

- **서지**: Gurcan Bahadir, C. G., & Tong, T. (2025). Computational approaches to space planning: A systematic review of enhancing architectural layouts. *International Journal of Architectural Computing*, 24(1), 141–180. doi:10.1177/14780771241310215
  - Crossref 발행일은 2025-01-06(온라인)이고 권호는 24(1)이다.
- **색인**: 미확인. **검증**: abstract (Crossref).
- **초록의 요지**: 2013–2023년 공간계획 계산 기법을 체계적으로 검토했다. 규칙 기반에서 데이터 기반으로 옮겨 가는 흐름을 확인했다.
- **우리 설계에서 뒷받침하는 점**: "최근 체계적 종설"로 Weber et al. (2022), Liu et al. (2025)와 함께 인용할 수 있다.

### 부록: 서지만 확인한 문헌 (본문 인용 전 원문 확인 필요)

- Dutta, K., & Sarthak, S. (2011). Architectural space planning using evolutionary computing approaches: a review. *Artificial Intelligence Review*, 36(4), 311–321. doi:10.1007/s10462-011-9217-y. 메타만 확인했다.
- Wang, X.-Y., Yang, Y., & Zhang, K. (2018). Customization and generation of floor plans based on graph transformations. *Automation in Construction*, 94, 405–416. doi:10.1016/j.autcon.2018.07.017. 메타만 확인했다.
  - 요청서는 이 논문을 "GA 기반 평면 생성"으로 적었지만, 제목상 **그래프 변환** 기반이다. GA 논문으로 인용하면 안 된다.
- Aalaei, M., Saadi, M., Rahbar, M., & Ekhlassi, A. (2023). Architectural layout generation using a graph-constrained conditional Generative Adversarial Network (GAN). *Automation in Construction*, 155, 105053. doi:10.1016/j.autcon.2023.105053. 메타만 확인했다.
- 찾지 못한 문헌: Homayouni의 종설은 이번 조사에서 서지를 확인하지 못했다. Calixto & Celani가 "HOMAYOUNI, 2007"을 인용하는 것만 보였다.
- 이미 프로젝트에 있는 Zeng et al. (2025, Buildings 15:1674)는 중복이므로 다시 다루지 않았다. 참고로 이 논문의 초록은 "existing metrics can not reflect the quality of generated designs well"이라고 적고 있으며, RQ4 논거에 함께 쓸 수 있다.

---

### RQ4 평가 설계에 주는 시사점

1. **분야 표준은 학습형 생성기를 전제로 한다.** 그래프 조건 생성 연구(House-GAN, House-GAN++, HouseDiffusion)의 표준은 실제감(사용자 쌍 비교), 다양성(FID), 호환성(입력 버블그래프와의 GED)의 세 축이다.
   - GED는 *입력 조건과의 일치도*일 뿐 실제 도면과의 비교가 아니다.
   - 실제감 사용자 연구는 GT와의 쌍 비교라서 표본이 작고(20–30명) 재현하기 어렵다.
   - 우리 SA·QUBO 생성기는 입력 버블그래프가 없으므로 GED를 그대로 쓸 수 없다. 이 차이를 방법론에 명시해야 한다.
2. **실제 분포와의 통계 비교가 더 적합한 선례가 있다.** Para et al. (2021)은 FID가 위상을 잡지 못한다고 보고, 출입 그래프의 거리, 차수, 외부까지 깊이, 면적, 종횡비의 **히스토그램을 실제 분포와 비교**했다. Jiang et al. (2026, 프리프린트)은 공간구문 통합도 프로파일을 실제 말뭉치 분포와 비교해(IPD, PIA), 생성 평면의 공용공간 통합도 우위가 실제보다 작다는 격차를 보고했다. 따라서 RQ4는 다음처럼 설계하는 것이 문헌상 정당하다.
   - AI Hub 실제 세대 분포(깊이, 통합도 순위, 거실 우위, 면적비)와 생성안 분포를 **같은 실 구성끼리 맞춰(room-count-matched)** 비교한다.
   - 분포 거리(예: 평균 절대 차이, 히스토그램 거리)와 개별 세대 수준의 순위 일치를 함께 보고한다.
3. **메타휴리스틱 계열에는 이런 비교가 거의 없다.** SA, GA, CP를 쓴 공간 배치 연구(Yi & Yi 2014, Guo & Li 2017, Laignel et al. 2021, Grzesiak-Kopeć et al. 2021, Çiçek & Turhan 2022)는 확인한 범위 안에서 자기 목적함수, 제약, 성능 지표로만 평가했다. 실제 도면 분포와는 비교하지 않았다.
   - 이것이 우리 연구가 메울 수 있는 공백이다. "최적화 기반 생성안을 대규모 실제 도면 분포에 대어 검증한다"는 기여 문장의 근거가 된다.
   - 다만 각 문헌의 전문을 모두 확인하지는 않았으므로 "확인한 범위에서"라는 단서를 붙여야 한다.
4. **기준선은 실제적이어야 한다.** HouseDiffusion은 비맨해튼 GT가 비현실적일 수 있다며 그 데이터에서 실제감 점수를 쓰지 않았다. 따라서 기준선 정의(현관 하나 = 세대 하나, 21,383세대 전수)의 엄밀성을 평가 설계의 일부로 기술하는 것이 좋다.
5. **채점 독립성과 연결된다.** 생성기와 평가 지표가 같은 공간구문 지표를 공유하면 순환 평가 위험이 있다. Jiang et al.도 통합도를 보상으로 쓴 뒤 같은 지표로 평가하면서, FID와 호환성 상한을 별도로 걸어 두었다. 우리도 목적함수에 들어가지 않은 지표(예: 면적비, 종횡비, 외부까지 깊이 분포)를 RQ4의 보조 비교에 포함하는 것을 권한다. 이는 판단(권고)이다.

---

# Part B

### (B 머리말) Part B — 비(非)공간구문 생성 규칙의 법령·문헌 근거 조사

- 조사일: 2026-11-04
- 대상 규칙: (1) 판상형 앞·뒤 2열 구성과 거실·침실 남향, (2) 안방을 앞 띠 끝(모서리)에 둠, (3) 실 최소 폭과 장단변비 상한 2:1, (4) 침실을 거치지 않는 동선, (5) 현관이 거실/중앙홀로 바로 열림, (6) 욕실을 세대 가운데에 창 없이 둠
- 이 도구의 최소 폭: 욕실 1.5 · 현관 1.2 · 주방 2.2 · 침실 2.4 · 안방 3.0 · 거실 3.6 m. 이 값들은 도구가 정한 값이다.
- 이미 검증된 4편(Seo 2007, Ju & Oh 2020, Zeng 2025, Ham & Lee 2017)은 다시 조사하지 않았다. 이 문서는 새 법령 조문과 새 문헌만 다룬다.
- 확인 수준
  - **direct**: 원문(조문·PDF)을 직접 받아 텍스트로 바꾼 뒤 문장을 그대로 옮긴 것. 쪽 번호는 PDF에 인쇄된 쪽이다.
  - **abstract**: 초록이나 2차 자료만 본 것.
- 학술지 등재 상태: 이름을 밝힌 출처에서 확인하지 못하면 "미확인"으로 적었다. KCI 포털 검색은 결과가 스크립트로 불러와져 받지 못했다. 한국주거학회 누리집에는 ISSN만 있고 KCI 등재 표기는 없다. 그래서 아래 국내 학술지는 모두 "미확인"이다.

### 0. 법령 원문 확보 방법

- law.go.kr의 DRF/OpenAPI(`lawService.do?OC=test…`)는 등록되지 않은 IP라서 막혔다("사용자 정보 검증에 실패하였습니다").
- 대신 law.go.kr 본 사이트의 조문 iframe 주소에서 현행 조문을 직접 받았다. 미러 사이트는 쓰지 않았다.
  - 조문 iframe: `https://www.law.go.kr/LSW/lsSideInfoP.do?lsiSeq=…&joNo=…&joBrNo=…&docCls=jo&urlMode=lsScJoRltInfoR`
  - 법령 전문: `https://www.law.go.kr/LSW/lsInfoR.do` (POST)
  - 별표 텍스트: `https://www.law.go.kr/LSW/lsBylTextDownLoad.do` (POST, bylSeq)
- 사람이 여는 주소는 `https://www.law.go.kr/법령/<법령명>/제NN조` 형식이며, 이 주소가 위 iframe을 띄운다.
- 받은 판본

| 법령 | lsiSeq | 시행일 | 판본 |
|---|---|---|---|
| 주택건설기준 등에 관한 규정 | 289501 | 2026. 9. 8. | 대통령령 제36658호 |
| 주택건설기준 등에 관한 규칙 | 288501 | 2026. 7. 29. | 국토교통부령 제1605호 |
| 건축법 시행령 | 290833 | 2026. 10. 6. | 대통령령 제36746호 |
| 건축법 | — | 2026. 2. 27. | — |
| 건축물의 피난·방화구조 등의 기준에 관한 규칙 | 291033 | 2026. 10. 6. | 국토교통부령 제1631호 |
| 장애인·노인·임산부 등의 편의증진 보장에 관한 법률 시행규칙 | 285263 | 2026. 7. 2. | 보건복지부령 제1166호 |

- 시행규칙 별표 1의 본문 머리에는 "<개정 2023. 12. 11.>"이라고 적혀 있다.

### L1. 실 최소 폭·면적: 한국 법령에는 없다 (규칙 3)

**결론**
- 「주택건설기준 등에 관한 규정」 본문과 「주택건설기준 등에 관한 규칙」 본문 전체에서 "침실·거실·욕실·현관"이 나오는 곳을 모두 찾아 읽었다(위 POST 전문 사용).
- 실의 최소 폭이나 최소 면적을 정한 조문은 없다.
- 평면 치수에 대한 규정은 기준척도(5cm 단위, 안목치수 원칙)뿐이다.
- 따라서 도구의 최소 폭(욕실 1.5 ~ 거실 3.6m)에는 법령 근거가 없다. 논문에는 "설계 가정"으로 적어야 한다.
- 남은 공백: 규칙 제3조제6호가 위임한 국토교통부 고시는 받지 못했다.

**규정 제13조(기준척도)** — 시행 2026. 9. 8.
> "주택의 평면 및 각 부위의 치수는 국토교통부령으로 정하는 치수 및 기준척도에 적합하여야 한다. 다만, 사업계획승인권자가 인정하는 특수한 설계ㆍ구조 또는 자재로 건설하는 주택의 경우에는 그러하지 아니하다."

- 출처: https://www.law.go.kr/법령/주택건설기준등에관한규정/제13조

**규칙 제3조(치수 및 기준척도)** — 시행 2026. 7. 29.
> "1. 치수 및 기준척도는 안목치수를 원칙으로 할 것. … 2. 거실 및 침실의 평면 각변의 길이는 5센티미터를 단위로 한 것을 기준척도로 할 것 3. 부엌ㆍ식당ㆍ욕실ㆍ화장실ㆍ복도ㆍ계단 및 계단참등의 평면 각 변의 길이 또는 너비는 5센티미터를 단위로 한 것을 기준척도로 할 것. 다만, 한국산업규격에서 정하는 주택용 조립식 욕실을 사용하는 경우에는 한국산업규격에서 정하는 표준모듈호칭치수에 따른다. 4. 거실 및 침실의 반자높이(반자를 설치하는 경우만 해당한다)는 2.2미터이상으로 하고 층높이는 2.4미터이상으로 하되, 각각 5센티미터를 단위로 한 것을 기준척도로 할 것 … 6. 제1호 내지 제5호에서 규정한 사항외의 구체적인 사항은 국토교통부장관이 정하여 고시하는 기준에 적합할 것"

- 출처: https://www.law.go.kr/법령/주택건설기준등에관한규칙/제3조
- 도구에 주는 의미: 실 치수를 5cm 단위로 반올림하면 이 기준척도를 지킬 수 있다(선택 사항).

**참고: 최저주거기준**
- 주거기본법에 따른 최저주거기준(국토부 공고)은 가구원 수별 총면적과 방 수를 정한다. 실 폭은 정하지 않는다.
- 이번에는 원문을 받지 않았다. 기존 노트(korean_criteria.md)는 언론 보도로만 확인한 상태다.

### L2. 욕실 배기: 창이 없어도 된다 (규칙 6)

**규정 제44조(배기설비 등)** — 시행 2026. 9. 8.
> "①주택의 부엌ㆍ욕실 및 화장실에는 바깥의 공기에 면하는 창을 설치하거나 국토교통부령이 정하는 바에 따라 배기설비를 하여야 한다."

- 출처: https://www.law.go.kr/법령/주택건설기준등에관한규정/제44조

**규칙 제11조(배기설비)** — 시행 2026. 7. 29.
> "영 제44조에 따라 주택의 부엌ㆍ욕실 및 화장실에 설치하는 배기설비는 다음 각 호에 적합해야 한다. … 1. 배기구는 반자 또는 반자아래 80센티미터이내의 높이에 설치하고, 항상 개방될 수 있는 구조로 할 것 … 4. 배기통의 최상부는 직접 외기에 개방되게 하되, 빗물등을 막을 수 있는 설비를 할 것 5. 부엌에 설치하는 배기구에는 전동환기설비를 설치할 것"

- 출처: https://www.law.go.kr/법령/주택건설기준등에관한규칙/제11조
- 의미
  - 법령은 욕실에 "창 또는 배기설비" 중 하나를 요구한다.
  - 그래서 Ju & Oh 2020(p.12)의 "가운데·창 없는 욕실"은 합법이다. 도구가 욕실에 바깥 창을 달지 않는 방식(2026-11-04 수정)과도 맞는다.
  - 이 도구는 배기설비를 모델링하지 않는다. "창 없는 욕실은 기계 배기를 전제한다"고 한 줄 적어 두면 된다.

### L3. 채광·환기: 거실(침실 포함)을 바깥 벽에 둔다 (규칙 1, 간접)

**건축법 제2조제1항제6호** — 시행 2026. 2. 27.
> "“거실”이란 건축물 안에서 거주, 집무, 작업, 집회, 오락, 그 밖에 이와 유사한 목적을 위하여 사용되는 방을 말한다."

- 이 정의에 따라 건축법에서 말하는 "거실"에는 침실도 들어간다.

**건축법 시행령 제51조(거실의 채광 등) 제1항** — 시행 2026. 10. 6.
> "법 제49조제2항 본문에 따라 단독주택 및 공동주택의 거실, 교육연구시설 중 학교의 교실, 의료시설의 병실 및 숙박시설의 객실에는 국토교통부령으로 정하는 기준에 따라 채광 및 환기를 위한 창문등이나 설비를 설치해야 한다."

- 출처: https://www.law.go.kr/법령/건축법시행령/제51조

**피난·방화규칙 제17조(채광 및 환기를 위한 창문등)** — 시행 2026. 10. 6.
> "① 영 제51조에 따라 채광을 위하여 거실에 설치하는 창문등의 면적은 그 거실의 바닥면적의 10분의 1 이상이어야 한다. 다만, 거실의 용도에 따라 별표 1의3에 따라 조도 이상의 조명장치를 설치하는 경우에는 그러하지 아니하다. ② 영 제51조의 규정에 의하여 환기를 위하여 거실에 설치하는 창문등의 면적은 그 거실의 바닥면적의 20분의 1 이상이어야 한다. 다만, 기계환기장치 및 중앙관리방식의 공기조화설비를 설치하는 경우에는 그러하지 아니하다. ③제1항 및 제2항의 규정을 적용함에 있어서 수시로 개방할 수 있는 미닫이로 구획된 2개의 거실은 이를 1개의 거실로 본다."

- 출처: https://www.law.go.kr/법령/건축물의피난ㆍ방화구조등의기준에관한규칙/제17조
- 의미
  - 거실·침실은 창이 있어야 하므로 바깥 벽(앞·뒤 띠)에 둔다. 이 점이 2열 구성을 간접적으로 뒷받침한다.
  - 다만 조명장치나 기계환기가 있으면 예외가 된다. "남향"까지 요구하는 법 조문은 없다. 남향 근거는 문헌(Ju & Oh 2020, S3, S4)이다.

### L4. 반자높이 (평면 규칙과 무관, 참고)

**피난·방화규칙 제16조①** — 시행 2026. 10. 6.
> "영 제50조의 규정에 의하여 설치하는 거실의 반자(반자가 없는 경우에는 보 또는 바로 윗층의 바닥판의 밑면 기타 이와 유사한 것을 말한다. 이하같다)는 그 높이를 2.1미터 이상으로 하여야 한다."

- 출처: https://www.law.go.kr/법령/건축물의피난ㆍ방화구조등의기준에관한규칙/제16조
- 공동주택의 거실·침실은 규칙 제3조제4호에 따라 반자높이 2.2m 이상, 층높이 2.4m 이상이다(L1 인용).

### L5. 복도 폭 (규칙 4, 간접)

**피난·방화규칙 제15조의2①** — 시행 2026. 10. 6.
> "영 제48조의 규정에 의하여 건축물에 설치하는 복도의 유효너비는 다음 표와 같이 하여야 한다"

- 표는 이미지이며, 이미지의 alt 텍스트를 그대로 옮긴다: "구분 / 양옆에 거실이 있는 복도 / 기타의 복도 … 공동주택ㆍ오피스텔 1.8미터 이상 1.2미터 이상 / 당해 층 거실의 바닥면적 합계가 200제곱미터 이상인 경우 1.5미터 이상(의료시설의 복도 1.8미터 이상) 1.2미터 이상"
- 출처: https://www.law.go.kr/법령/건축물의피난ㆍ방화구조등의기준에관한규칙/제15조의2
- 적용 범위
  - 건축법 시행령 제48조①은 "연면적 200제곱미터를 초과하는 건축물에 설치하는 계단 및 복도"에 적용한다.
  - 세대 안 복도가 아니라 건물의 공용 복도 기준으로 읽어야 한다.
  - 규정 제17조(복도)도 "복도형인 공동주택의 복도"(공용 복도)에 관한 조항이다.
- 의미: 세대 안 복도 폭을 정한 한국 법령은 찾지 못했다. 도구의 복도 폭 1.1m는 설계 가정이다. 영국 LHDG의 세대 안 복도 0.9m(S7)보다는 넓다.

### L6. 문 유효폭·복도 (편의증진법 시행규칙 별표 1) (규칙 3·4, 적용 범위 주의)

- 별표 1 원문은 law.go.kr의 텍스트 내려받기로 받았다(bylSeq=18078323, 시행 2026. 7. 2.판, 별표 머리 "<개정 2023. 12. 11.>").
- 제6호 가목(1): "출입구(문)은 아래의 그림과 같이 그 통과유효폭을 0.9미터 이상으로 하고, 출입구(문)의 전면 유효거리는 1.2미터 이상으로 하며, 연속된 출입문의 경우 문의 개폐에 소요되는 공간은 유효거리에 포함하지 아니한다."
- 제6호 가목(3): "자동문이 아닌 경우에는 아래의 그림과 같이 출입문 옆에 0.6미터 이상의 활동공간을 확보하여야 한다."
- 제7호 가목: "복도의 유효폭은 1.2미터 이상으로 하되, 복도의 양옆에 거실이 있는 경우에는 1.5미터 이상으로 할 수 있다."
- 제14호 나목(1)(욕실): "출입문의 형태는 미닫이문 또는 접이문으로 할 수 있다."
- 출처: https://www.law.go.kr/법령/장애인ㆍ노인ㆍ임산부등의편의증진보장에관한법률시행규칙/제2조 (제2조①이 별표 1을 세부기준으로 정함)
- 적용 범위
  - 이 기준은 법 제8조와 영 제4조의 "편의시설"에 대한 것이다.
  - 주택건설기준 규정 제22조는 "주택단지안의 부대시설 및 복리시설에 설치하여야 하는 장애인관련 편의시설"에 이 법을 따르게 한다.
  - 일반 분양 세대의 내부 문에도 적용되는지는 확인하지 못했다(시행령 별표 2는 열람하지 않음).
- 의미
  - 현관 최소 폭 1.2m는 "출입문 전면 유효거리 1.2m"와 같은 값이므로 비교 근거로 쓸 수 있다. 다만 세대 안에 법적으로 강제되는 값은 아니다.
  - 문 폭 0.9m는 무장애 기준으로만 인용해야 한다.

### L7. 대피공간 (규칙 1, 간접: 발코니 배치)

**건축법 시행령 제46조④** — 시행 2026. 10. 6.
> "공동주택 중 아파트로서 4층 이상인 층의 각 세대가 2개 이상의 직통계단을 사용할 수 없는 경우에는 발코니(발코니의 외부에 접하는 경우를 포함한다)에 인접 세대와 공동으로 또는 각 세대별로 다음 각 호의 요건을 모두 갖춘 대피공간을 하나 이상 설치해야 한다. … 1. 대피공간은 바깥의 공기와 접할 것 2. 대피공간은 실내의 다른 부분과 방화구획으로 구획될 것 3. 대피공간의 바닥면적은 인접 세대와 공동으로 설치하는 경우에는 3제곱미터 이상, 각 세대별로 설치하는 경우에는 2제곱미터 이상일 것 4. 대피공간으로 통하는 출입문은 제64조제1항제1호에 따른 60분+ 방화문으로 설치할 것"

- 제46조⑤: 경량구조 경계벽, 경계벽 피난구, 하향식 피난구, 대체시설이 있으면 대피공간을 두지 않을 수 있다.
- 출처: https://www.law.go.kr/법령/건축법시행령/제46조
- 의미
  - 기존 노트에서 [UNVERIFIED]였던 2㎡/3㎡를 현행 원문으로 확인했다.
  - 도구는 대피공간을 모델링하지 않는다. 한계로 적어 둘 수 있다.

### L8. 발코니 정의와 노대 1.5m (규칙 1: 2005 합법화의 현행 근거)

**건축법 시행령 제2조제14호** — 시행 2026. 10. 6.
> "“발코니”란 건축물의 내부와 외부를 연결하는 완충공간으로서 전망이나 휴식 등의 목적으로 건축물 외벽에 접하여 부가적(附加的)으로 설치되는 공간을 말한다. 이 경우 주택에 설치되는 발코니로서 국토교통부장관이 정하는 기준에 적합한 발코니는 필요에 따라 거실ㆍ침실ㆍ창고 등의 용도로 사용할 수 있다."

**건축법 시행령 제119조제1항제3호나목**
> "건축물의 노대등의 바닥은 난간 등의 설치 여부에 관계없이 노대등의 면적(외벽의 중심선으로부터 노대등의 끝부분까지의 면적을 말한다)에서 노대등이 접한 가장 긴 외벽에 접한 길이에 1.5미터를 곱한 값을 뺀 면적을 바닥면적에 산입한다."

- 출처: https://www.law.go.kr/법령/건축법시행령/제2조 , https://www.law.go.kr/법령/건축법시행령/제119조
- 합법화 시점은 S3이 적은 "2005년 12월"이다. 제2조 조문의 개정 이력에서 날짜를 따로 확인하지는 않았다.

---

### S1. 윤재신·전남일·김도연·김민경·김준래 (2008) — 실 폭·깊이·비례 실측 (규칙 3)

- 서지
  - 윤재신, 전남일, 김도연, 김민경, 김준래 (2008). 아파트 전형적 평면의 실 크기와 치수 특성에 관한 연구 — 21세기 강남권, 강북권, 수도권 아파트를 중심으로. *한국주거학회논문집* 19(6), pp.21–32 (PDF 인쇄 쪽 기준).
  - DOI: Crossref에서 찾지 못함(10.6107/jkha.2008.19.6.021 조회 결과 404) → **DOI 미확인**
  - 원문: https://koreascience.kr/article/JAKO200805441022448.pdf
- 등재: 미확인
- 확인 수준: **direct**
- 표본: 2000–2007년 입주 민간 아파트 120세대. 강남·강북·수도권 3권역 × 32평형대(A그룹, "전용면적 85 m²")와 25평형대(B그룹, 원문 "전용면적 65 m²")를 20세대씩 뽑았다.
  - p.22: "평형별로 32평형대(A그룹)와 25평형대(B그룹)로 각각 20개씩, 총 120개를 선별하였다."
- 원문 인용(p.24–26)
  - p.24 본문: "거실 전면 폭은 4,500 mm 전후이며, 깊이는 3,700 mm 전후의 평균값을 가지고 있는 것으로 나타났다. 안방의 전면 폭은 4,200 mm 전후이며, 깊이는 3,800 mm 전후로" (A그룹)
  - p.24 <표 3> A그룹 최솟값(전면폭, mm): 거실 4,100 / 3,860 / 4,100, 안방 3,600 / 3,900 / 3,790, 방1 2,602 / 2,870 / 2,700, 방2 2,610 / 2,590 / 2,590, 부엌 2,700 / 2,400 / 2,770 (강남 / 강북 / 수도권)
  - p.25 <표 4> B그룹 최솟값(전면폭, mm): 거실 3,000 / 3,000 / 3,490, 안방 3,300 / 3,400 / 3,100, 방1 2,390 / 2,235 / 2,400, 방2 2,400 / 2,100 / 2,400, 부엌 2,485 / 2,200 / 2,440
  - p.25 <표 4> B그룹 평균(전면폭, mm): 거실 3,698 / 3,723 / 3,755, 안방 3,602 / 3,658 / 3,638
  - <표 4> B그룹 깊이 최솟값(mm): 거실 2,200(강남), 방2 2,200(강남·수도권)
  - <표 3·4> "전면폭과 깊이의 비례"(전면폭 ÷ 깊이) 범위: 최소 0.59(A 강남 거실), 최대 1.82(B 수도권 부엌)
  - p.26: "거실을 제외한 거의 모든 실의 비례가 0.9~1.1 사이에 위치하여 정방형에 가까우며, 거실은 전면 폭이 긴 장방형이며, 부엌은 깊이가 긴 형태를 띤다."
- 이 도구와의 관계(전면폭과 깊이를 따로 집계한 값이다. 실마다 짧은 변을 집계한 값은 아니다)
  - **거실 3.6m: 반대 근거**
    - 25평형대의 거실 전면폭 최솟값은 3,000mm이고 평균도 3,698–3,755mm다. 3.6m를 하한으로 두면 실제 25평형 평면의 상당수를 배제할 수 있다.
    - 32평형대(최소 3,860–4,100)에는 3.6이 문제 없다.
  - **침실 2.4m: 부분적 반대 근거**
    - 25평형 방2의 전면폭 최솟값은 2,100(강북)이고 깊이 최솟값은 2,200이다. 2.4 미만인 실제 침실이 있다.
    - 32평형은 최소 2,590 이상이라 2.4와 맞는다.
  - **안방 3.0m: 지지**. 전면폭 최솟값이 3,100 이상이다(깊이 최솟값 2,200은 예외).
  - **주방 2.2m: 지지**. 부엌 전면폭 최솟값이 2,200이다.
  - **장단변비 2:1 상한: 지지(느슨함)**
    - 관측 비례는 0.59–1.82로 모두 2:1 안에 든다.
    - 평균은 0.79–1.14로 정사각형에 가깝다. 실제 분포는 2:1보다 훨씬 좁다는 뜻이다.
  - 욕실·현관 치수는 이 논문에 없다.

### S2. 박인석·박노학·천현숙 (2014) — 1998·2005 법 개정이 평면에 준 영향 (규칙 1·3)

- 서지: Park, In-Seok; Park, No-Hak; Chun, Hyun-Sook (2014). 전용면적 산정기준 변화와 발코니 용도변환 허용이 아파트 단위주거 평면설계에 미친 영향 — 전용면적 60 m²와 85 m² 평면의 실별 규모 변화를 중심으로. *Journal of the Korean Housing Association* 25(2), 27–36.
- DOI: **10.6107/JKHA.2014.25.2.027** (PDF 머리와 Crossref 둘 다 확인)
- 원문: https://koreascience.kr/article/JAKO201414753675382.pdf
- 등재: 미확인
- 확인 수준: **direct**
- 원문 인용
  - p.35: "단위주거 전면 폭과 베이 수가 꾸준히 증가하면서 발코니면적이 평균 25~30 m2에 이르는 수준으로 늘어났으며, 이렇게 늘어난 발코니면적 중 2005년 법 개정에 따라 침실·거실·식사실·부엌을 확장하는 데 사용된 면적은 전용 60 m2는 평균 16.43 m2, 전용 85 m2는 평균 20.65 m2에 이르는 것으로 나타났다."
  - p.35: "실구성은 전용 60, 85 m2 모두 침실3개+거실+식사실ㆍ부엌(3LDK) 평면으로 고정화되고 있으며 침실, 거실, 식사실, 부엌 면적 역시 큰 변화 없이 비슷한 면적으로 유지되고 있다."
  - p.36(결론): "침실, 거실, 식사실, 부엌은 과거 수준의 면적을 유지하면서 발코니 확장을 통해 면적을 확대하고 … 증가된 실질사용면적은 욕실, 현관, 드레스룸에 배분하여 이들 부대기능공간의 충실화를 도모한 것" (PDF 10쪽 = 27+9)
- 이 도구와의 관계
  - (규칙 1) 2005년 이후 앞면 폭과 베이 수가 늘어난 경향을 뒷받침한다.
  - (규칙 3) 최소 폭을 정할 때 **확장 전(기본형) 치수인지 확장 후 치수인지** 밝혀야 한다는 점을 보여준다. 도구 값이 확장 후 기준이면 S1(2000–2007, 확장 전후 혼재)과 직접 비교하기 어렵다.
  - 2005년 이후 욕실·현관 면적이 커졌다는 점은 욕실 1.5, 현관 1.2를 하한으로 두는 데 불리하지 않다.

### S3. 박준영·정상규·정소이·박우장 (2012) — 2000년대 베이 구성과 물 쓰는 공간 위치 (규칙 1·6)

- 서지: Park, Joon Young; Jeong, Sang Kyu; Cheong, So Yi; Park, Woo Jang (2012). 2000년대 한국 아파트 단위세대의 공간구성 동향 변화 (Trend Changes of Spatial Configuration in Housing Units of Korean Apartments in the 2000s). *한국생태환경건축학회논문집 (Journal of the KIEAE)* 12(1), 21–27.
- DOI: **미확인** (Crossref 서지 검색에 나오지 않음, 10.12813/kieae.2012.12.1.021 조회 404)
- 원문: https://koreascience.kr/article/JAKO201230360545273.pdf
- 등재: 미확인
- 확인 수준: **direct**
- 표본: 상위 7개 건설사의 59㎡·84㎡ 단위세대를 3기로 나눔. 1기 12개(2000–05), 2기 35개(2006, 은평·판교), 3기 19개(2011, 김포 한강).
- 원문 인용
  - p.21–22: "2005년 12월 아파트 수요자들의 지속적인 요구를 반영하여 아파트 발코니 구조 변경을 허용하는 건축법 시행령이 시행됨에 따라 발코니 확장에 따른 위법 논란이 종식되었다."
  - p.23(제2기): "제2기에 지어진 아파트의 소형 단위세대는 주로 전면에 안방, 침실, 거실이 병렬된 3베이 형식이 대부분(84.6%)이었고"
  - p.23–24(제3기): "일반형 단위세대는 모두 4베이 이상의 형식으로 나타났는데 4베이 형식이 가장 많이(77.8%) 나타났고 4.5베이 형식이 부분적(22.2%)으로 나타났다. 이로써 3기에는 단위세대에서도 실을 일렬로 나란히 배치하여 조망․일조․통풍에 유리하도록 많은 Bay를 확보하여 공간을 구성하는 경향이 나타난다"
  - p.24(제1기 물 쓰는 공간): "소형 단위세대의 물사용공간은 주로 실들 사이의 중앙에 배치되는 공용욕실이 있는 중간 깊이(D3)와 주로 주방이 있는 후면부(D4)에 주로 배치되는 것으로 나타났다."
  - p.25(제2기): "주방의 물사용공간은 주로 중앙부 후방(B2D4)에 집중되고 공용욕실 및 안방 부속욕실의 물사용 공간은 주로 측면(B1 또는 B3)의 중간부(D2 또는 D3)에 위치한 경우가 많았다. … 1기와 달리 전면부(D1)에 물사용공간이 설치되는 경향은 나타나지 않았다."
  - p.26(제3기, 일반형): "물사용 공간이 후면부 만에 형성된 경우(33.3%)도 나타났지만 상당수(66.6%)가 전면부, 중간부, 후면부에 걸쳐 고르게 분산된 배치로 나타났다"
- 이 도구와의 관계
  - (규칙 1) 앞면에 안방·침실·거실을 나란히 두는 3–4베이 구성은 2005년 합법화 뒤 주류가 되었다. 2열(앞 거주실 띠 / 뒤·가운데 주방·욕실)을 지지한다.
  - (규칙 6) 1·2기에는 욕실이 세대 가운데 깊이, 주방은 뒤쪽 가운데에 있다. 도구와 일치한다.
  - **주의(부분 반대 근거)**: 2011년 84㎡ 표본의 66.6%는 물 쓰는 공간이 앞·가운데·뒤에 흩어져 있다. "욕실은 항상 가운데"는 2000년대 말 일반형에는 덜 맞는다.
  - 1기 소형에서 안방 부속욕실이 전면 발코니(D1)에 놓인 예도 있다.

### S4. 박경옥·이상운 (2008) — 발코니 확장 합법화 뒤 베이 수 (규칙 1)

- 서지: Park, Kyoung-Ok; Lee, Sang-Un (2008). 발코니 확장 합법화 이후 분양된 아파트 평면의 발코니 특성과 활용에 관한 연구 — 수도권과 군 이하지역의 아파트 평면비교를 중심으로. *韓國農村建築學會論文集* 10(2) (통권 29호), 시작 쪽 61.
- DOI: 미확인
- 원문: https://koreascience.kr/article/JAKO200807665316229.pdf
- 등재: 미확인
- 확인 수준: **direct**
- 표본: 2006–2007년 분양 평면. 수도권 상위 10개사 168개 + 군 이하 지역 92개.
- 원문 인용
  - 초록(p.61): "(3) The balcony expansion tended to increase the number of bays. (4) In almost cases, the living rooms were expanded to balcony."
  - p.63: "전면에 단위실이 배치된 수인 베이(bay)는 지역별 차이 없이 3~3.5베이가 50.8%로 가장 많았으며 그 다음은 4~4.5베이가 31.1%로 대부분의 평면이 3~4.5베이에 집중해 있다(표 3 참조)."
  - p.64: "3~3.5베이인 경우는 거실과 2개의 방(L+R)이 수도권 77.2%와 군 이하지역 90.6%로 많았다. 4~4.5베이에서는 거실과 3개방(L+R)으로 구성한 것이 수도권 70.2%와 군 이하지역 69.6%로 가장 높았다."
- 이 도구와의 관계
  - (규칙 1) 앞 띠에 거실과 침실들을 나란히 두는 구성(3베이 L+2R, 4베이 L+3R)이 다수형이다.
  - 앞 띠의 순서(안방 끝, R1-L-R)는 이 논문에서 확인하지 않았다. 순서 근거는 Seo 2007 p.21이다.

### S5. Seo, K. W. (2003) — Topological paths in housing evolution (규칙 2·4·5)

- 서지: Seo, Kyung Wook (2003). Topological paths in housing evolution. In *Proceedings of the 4th International Space Syntax Symposium*, London, paper 80, pp.80.1–80.14.
- DOI: 없음(학술대회 논문집)
- 원문: https://www.spacesyntax.net/symposia-archive/SSS4/fullpapers/80Seopaper.pdf
- 등재: 해당 없음(학술대회)
- 확인 수준: **direct**
- 원문 인용
  - p.80.7: "The only indication that suggests the initial code structure is the adjacency between the main bedroom and the living room, which, like a rule, appears in every typical plan. The central hall emerges as a universal solution for the circulation in the staircase type apartments in Seoul, and it links the three remaining essential spaces."
  - p.80.11: "The second bathroom in the 1992 house inevitably blocks the direct access from the central hall to the bedroom in the north, thus causing the alternative access via the kitchen (see its plan in Figure 5). This has to happen for geometric reasons against the designer's intention, hence the value again goes up when this problem is solved in the 1993 plan where the second bathroom is placed in the opposite corner."
- 이 도구와의 관계
  - (규칙 5) 계단실형에서 동선은 중앙홀이 맡는다는 관찰이다. Seo 2007 p.16의 97%를 보완한다.
  - (규칙 2) 안방–거실 인접이 "규칙처럼" 나타난다. 앞 띠에서 안방이 거실 옆 끝에 오는 배치와 맞는다.
  - (규칙 4) 침실에 갈 때 다른 실(주방)을 거치는 것을 "설계자 의도에 어긋난" 결과로 보고, 다음 해 평면에서 고쳐졌다고 적는다. "침실로 가는 길은 홀에서 바로"라는 규칙의 정성적 근거다.
  - 반대 방향 근거로 Ham & Lee 2017 p.13이 있다. 시간이 지나며 거실·주방을 거쳐 침실로 가는 방식이 늘었다는 내용이다. 두 근거 모두 "침실을 거쳐 다른 실로 가지 않음"(도구 규칙 4)과는 충돌하지 않는다.

### S6. Nationally Described Space Standard (영국, 2015) (규칙 3)

- 서지: Department for Communities and Local Government (2015). *Technical housing standards – nationally described space standard*. Published 27 March 2015, applies to England.
  - 현재 게시 주체: Ministry of Housing, Communities & Local Government
- 원문: https://www.gov.uk/government/publications/technical-housing-standards-nationally-described-space-standard/technical-housing-standards-nationally-described-space-standard
- DOI: 없음
- 등재: 해당 없음(정부 지침)
- 확인 수준: **direct** (gov.uk HTML)
- 원문 인용(Technical requirements, para 10)
  > "c. in order to provide 1 bedspace, a single bedroom has a floor area of at least 7.5m2 and is at least 2.15m wide d. in order to provide 2 bedspaces, a double (or twin bedroom) has a floor area of at least 11.5m2 e. 1 double (or twin bedroom) is at least 2.75m wide and every other double (or twin) bedroom is at least 2.55m wide"
- 이 도구와의 관계
  - 도구의 침실 2.4m는 영국 1인실(2.15)과 2인실(2.55) 사이에 있다.
  - 도구의 안방 3.0m는 영국 첫 2인실(2.75)보다 크다.
  - 같은 자릿수라서 "국제 기준과 같은 범위"라는 근거로 쓸 수 있다. 다만 영국 기준이므로 한국 법정 값은 아니다.

### S7. London Housing Design Guide, Interim Edition (2010) (규칙 3·4)

- 서지: Design for London / London Development Agency (2010). *London Housing Design Guide, Interim Edition*. August 2010.
- 원문: https://www.london.gov.uk/media/8395/download
- 등재: 해당 없음(지방정부 지침, 이후 London Plan/SPG로 대체됨)
- 확인 수준: **direct** (PDF, 인쇄 쪽 = PDF 쪽)
- 원문 인용
  - p.50, 4.3.1: "The minimum width of hallways and other circulation spaces inside the home should be 900mm. This may reduce to 750mm at 'pinch points' e.g. next to radiators"
  - p.52, 4.4.2: "The minimum width of the main sitting area should be 2.8m in 2-3 person dwellings and 3.2m in dwellings designed for four or more people."
  - p.53, 4.5.2: "The minimum width of double and twin bedrooms should be 2.75m in most of the length of the room."
- 이 도구와의 관계
  - 거실 3.6m는 런던 기준(3.2m, 4인 이상)보다 크다. "국제 최소 기준보다 보수적"이라고 쓸 수 있다.
  - 다만 S1의 한국 25평형 거실 최소 3.0m와 함께 보면, 3.6m는 "최소"라기보다 "통상 값"에 가깝다.
  - 세대 안 복도 0.9m 기준은 도구의 복도 폭 1.1m가 넉넉하다는 근거가 된다.

---

### 확인하지 못한 것과 공백

- **X1** Morgan, M. & Cruickshank, H. (2014). Quantifying the extent of space shortages: English dwellings. *Building Research & Information* 42(6), 710–724. doi:10.1080/09613218.2014.922271.
  - Crossref로 서지는 확인했다.
  - 출판사 PDF·HTML은 403으로 막혀 원문과 초록 모두 인용하지 않았다.
- **X2** Hillier (1996) *Space is the Machine*의 a/b/c/d형 공간(막다른 공간으로서의 침실)
  - UCL Discovery와 CORE가 봇 차단 페이지를 돌려주었다. 다른 사본(univ-blida)은 1쪽짜리 판권면뿐이었다.
  - 규칙 4의 국제 공간구문 근거는 이번에 확보하지 못했다.
  - 대안 후보는 Yamu, van Nes & Garau (2021) *Sustainability* 13(6):3394, doi:10.3390/su13063394. Crossref로 서지만 확인했고 원문은 받지 못했다.
- MDPI 원문(Ju & Oh 2020, Ham & Lee 2017)은 추가 쪽을 찾으려 했으나 403으로 막혔다. 기존 검증 내용만 유효하다.
- 다음 원문은 받지 못했다.
  - 김민경·윤재신 (2010). *한국주거학회논문집* 21(1), 53–65, doi:10.6107/jkha.2010.21.1.053. 서울 60·85㎡ 실 치수 통계. S1의 후속 연구로 보인다.
  - 규칙 제3조제6호가 위임한 국토교통부 고시.
  - 편의증진법 시행령 별표 2. 세대 안 적용 여부를 판단하려면 필요하다.
- 욕실 최소 폭 1.5m와 현관 1.2m를 직접 뒷받침하는 학술 근거는 찾지 못했다.
  - 현관 1.2m에 가장 가까운 값은 편의증진법 별표 1 "출입문 전면 유효거리 1.2m"(L6)다. 적용 범위에 주의해야 한다.
  - 욕실은 KS 조립식 욕실 표준모듈(규칙 제3조제3호 단서)이 단서가 될 수 있지만 KS 원문은 확인하지 않았다.
- 한국 학술지의 KCI 등재 여부는 하나도 확인하지 못했다(위 방법론 참고).

### 논문에 쓸 때의 정리(판단)

1. "한국 법령에는 실 최소 폭·면적 규정이 없다"고 원문 조문(L1)을 근거로 단정할 수 있다. 도구의 최소 폭은 설계 가정이다. S1(한국 실측), S6·S7(영국 기준)과 비교해 범위가 합리적이라고 쓰는 것이 맞다.
2. 거실 3.6m와 침실 2.4m는 한국 25평형대 실측 최솟값(거실 3.0, 방2 2.1)보다 크다. 소형 세대에는 지나치게 보수적일 수 있다는 한계를 적어야 한다.
3. 장단변비 상한 2:1은 실측 범위(0.59–1.82) 안이므로 제약으로서 타당하다. 다만 실제 평균은 0.8–1.1이다.
4. 창 없는 가운데 욕실은 법령(규정 제44조: 창 **또는** 배기설비)과 문헌(Ju & Oh 2020, S3)이 모두 지지한다. 단, 2000년대 말 84㎡에서는 흩어진 배치도 많았다(S3 p.26).

---

## RQ2 정식화 제안

> 이 절은 위 문헌을 바탕으로 한 **판단(제안)**이다. 식과 보조 변수 수는 이 조사에서 직접 유도한 것이며, 어느 문헌도 공간구문 지표를 이 형태로 QUBO화하지 않았다(찾지 못함). 변수 수는 `buildQubo`로 잰 실제 사양(n = 18–41, 실 N = 6–9개, 앞 띠 m = 3–5칸, 뒤 띠 k = 3–5칸)을 기준으로 어림했다.

### 0. 기호와 전제

- x_{r,s} ∈ {0,1}: 실 r이 칸 s. 띠별 원-핫(실마다 하나, 칸마다 하나).
- 칸 인접 집합 S_adj: 같은 띠의 이웃 칸, 앞·뒤 띠에서 위아래로 겹치는 칸 쌍(최대 m+k−1개). 실 인접 지시
  **a_uv(x) = Σ_{(s,t)∈S_adj} x_{u,s}·x_{v,t}**.
  u와 v는 칸을 하나씩만 가지므로, 원-핫이 지켜지면 a_uv ∈ {0,1}이고 **x에 대해 정확히 이차**다.
- 주의(정확성의 범위): 여기서 '정확'은 *칸 인접 그래프*에 대해서다. 실제 평면의 접근(문) 그래프는 `layout.js`가 폭·문 규칙으로 정하므로 다를 수 있다(Seo 2007 p.6의 출입/인접 구분, 프로젝트 `evidence/results/door-vs-adjacency.md`). 논문에서는 "QUBO는 칸 인접 그래프 위의 공간구문을 최적화하고, 평가는 생성된 평면의 그래프로 한다"를 명시해야 한다.
- 실 수 N이 고정이므로 RA = 2(MD−1)/(N−2), RRA = RA/D_N(D_N은 N만의 상수)는 **총깊이 TD에 대해 선형**이다. 통합도 = 1/RRA는 TD의 단조 감소 함수다.

### 1. 보조 변수 없이 정확히 이차인 것

| 지표 | 식 | 비고 |
|---|---|---|
| 두 실의 인접(맞닿음) | a_uv(x) | 현재 TERMS 대부분이 이것 |
| 연결도(degree) | deg_v = Σ_u a_uv | 이차 |
| 현관에서 깊이 1 | a_{entrance,v} | 이차(이미 쓰는 항) |
| 간선 수·순환 수(ringiness) | E = Σ_{u<v} a_uv, 순환 수 = E − N + 1(연결 그래프) | N 고정이라 E에 선형 → 이차 |
| 위치 선호(끝 칸, 가운데) | Σ_s c_s x_{r,s} | 일차 |

### 2. '칸 쌍 곱' 보조 변수(Rosenberg 대입)만 있으면 정확히 이차가 되는 것

곱 x_{u,s}x_{v,t}를 보조 변수 z_{us,vt}로 바꾸고 벌점 P_R(x_{us}x_{vt} − 2x_{us}z − 2x_{vt}z + 3z)를 더한다(Rosenberg 1975, Dattani 2019 p.45). 그러면 **a_uv = Σ z가 z에 대해 선형**이 되어, a_uv에 다른 변수를 곱한 항이 이차로 내려온다.

- 보조 변수 수: 칸 인접 쌍마다 '그 칸들에 올 수 있는 실 순서쌍' 수. m = k = 4(실 8개)에서 앞 띠 이웃 3쌍 × 12 + 뒤 띠 3쌍 × 12 + 위아래 4쌍 × 16 ≈ **136개**(원래 n = 32의 약 4배).
- **통제값(control)**: ctrl_v = Σ_u a_uv / deg_u. 연결도 원-핫 g_{u,j}(deg_u = j, j = 1..Δ)를 두고 연결 벌점 (Σ_j j·g_{u,j} − Σ_w a_uw)²(z에 대해 이차)를 걸면 ctrl_v = Σ_u Σ_j (1/j)·a_uv·g_{u,j} — **z·g의 이차식으로 정확**. 추가 보조 변수 N·Δ(실 8개·Δ ≤ 5 → 약 40개).
- 현관에서 2단계 경로 수 Σ_u a_{e,u}a_{u,v}: z·z 이차(정확). 단 '깊이가 정확히 2'는 경로 존재 여부(OR)라 3절이 필요하다.

### 3. BFS 깊이 층 보조 변수가 필요한 것 (Lucas 2014 §8.1 방식 변형)

**깊이 k를 정확히 쓰는 방법.** 뿌리 ρ(현관 또는 바깥)를 정하고, 뿌리가 아닌 실 v마다 '부모 u, 깊이 k' 원-핫 변수 e_{v,u,k}를 둔다(Σ_{u,k} e_{v,u,k} = 1). h_{v,k} = Σ_u e_{v,u,k}(실 v의 깊이가 k), h_{ρ,0} = 1.

1. 부모는 이웃이어야 함: P_B · e_{v,u,k}(1 − a_uv) → z와 e의 이차.
2. 부모의 깊이는 k−1: P_B · e_{v,u,k}(1 − h_{u,k−1}) → e·e 이차.
3. **최단 깊이 강제(하한)**: 맞닿은 두 실의 깊이 차는 1 이하: P_B · a_uv · Σ_{k'≥k+2} h_{u,k}h_{v,k'} → 3차(z·h·h). h·h 곱을 한 번 더 대입해 이차로 줄인다.

1–2만 있으면 '뿌리에서 자란 신장 트리의 깊이'(Lucas와 같음)로, BFS 깊이의 **상한**이다. 목적이 깊이를 *줄이는* 쪽(거실 통합도↑, 현관–공용 공간 얕게)뿐이면 최적해에서 풀이기가 스스로 최단 트리를 고르므로 1–2로 정확하다. 목적이 깊이를 *늘리는* 항을 포함하면(사생활: 침실을 깊게) 풀이기가 일부러 돌아가는 트리를 골라 '가짜 깊이'를 만들 수 있으므로 **3이 반드시 필요**하다. 1–3을 모두 만족하는 표지는 BFS 거리와 같다(뿌리 0, 모든 비뿌리 실에 깊이가 하나 작은 이웃이 있고, 이웃끼리 깊이 차 ≤ 1).

- 보조 변수 수(실 8개, 최대 깊이 K = 4로 자를 때): e = 7×7×4 ≈ 196, 하한용 h·h 대입 ≈ N²K²/2 ≈ 500, z ≈ 136 → **약 850개**(n = 32의 약 27배), 이차 항 수만 개. K는 AI 허브 실제 평면의 최대 깊이를 보고 정하고, K를 넘는 배치는 벌점으로 막는다.
- 이 위에서 정확해지는 것:
  - **뿌리 하나의 TD, MD, RA, RRA**: TD = Σ_v Σ_k k·h_{v,k} — 보조 변수에 **선형**.
  - **뿌리 하나의 통합도(=1/RRA) 최대화**: TD 최소화와 같으므로 선형 목적으로 정확.
  - **통합도 값 자체(목표값 맞추기, 실 여럿의 합)**: TD 값 원-핫 t_{d}(TD = d)를 두고 (Σ d·t_d − TD)²로 묶으면 1/RRA(d)를 t의 선형식으로 정확히 쓸 수 있다. TD 범위(실 8개에서 약 10–20)만큼 보조 변수.
  - **평균 통합도(모든 실을 뿌리로)**: 위 구조를 뿌리 N개만큼 복제 → 약 N배(실 8개 ≈ 6,000–7,000개).
  - **유전형 순서(통합도 순위의 켄달 τ)**: 실 a, b의 TD 값 원-핫 t_{a,d}, t_{b,d'}가 있으면 비교 지시 1[TD_a < TD_b] = Σ_{d<d'} t_{a,d}t_{b,d'}가 **이차**. 따라서 τ도 정확한 이차식이 되지만, 비교 대상 실 수만큼 뿌리 구조가 필요해 평균 통합도와 비슷한 규모가 된다.
- 벌점 계층: 원-핫(A), Rosenberg(P_R), BFS 구조(P_B) 벌점이 모두 목적 이득보다 커야 한다(Lucas p.18의 0 < B·max(W) < A를 층마다 적용). 보조 변수가 많아지면 Zaborniak & Stege(p.2)가 말한 '큰 벌점 → 모든 유효 상태가 1비트 국소 최소' 문제가 심해져 1비트 SA가 더 어려워진다.
- 하드웨어: Kuramata et al.(2021 p.1)은 원-핫 등식 제약이 있는 QAP가 D-Wave Advantage에서 크기 12까지만 풀린다고 보고했다. 깊이 보조 변수를 넣은 정확 QUBO는 양자 하드웨어에 올리기 어려우므로, 정확판은 SA·완전 열거 검증용으로만 쓰는 것이 현실적이다.

### 4. 대리 항(현재 방식)이 합리적인 것

- 평균 통합도, 통제값, 유전형 순서 τ, RRA 비(거실/침실) — 2–3절로 정확히 쓸 수 있지만 변수가 수십~수백 배로 늘어난다.
- 현재 대리 항(정확 지표를 φ로 회귀, Spearman 0.47–0.80)은 BOCS(Baptista & Poloczek 2018 p.2: 이차 모형은 x에 이차, 계수에 선형)와 FMQA(Kitai et al. 2020)의 '데이터로 맞춘 이차 대리 + 어닐링' 계열이다. 다만 Jin(2011 p.61)처럼 진짜 적합도와 함께 써야 하므로 다음을 보고해야 한다:
  1. **대리 후회(surrogate regret)**: 대리 QUBO의 최적 배정에서 잰 *정확* 지표와, 정확 지표의 최적값(완전 열거)의 차. 배정 공간이 띠별 순열(≤ 5!·5! = 14,400)이라 완전 열거로 정확히 잴 수 있다. Spearman보다 이것이 RQ2의 직접 증거다.
  2. FMQA처럼 SA 해 주변에서 정확 지표를 다시 재고 대리 항을 다시 맞추는 반복(능동 학습)을 1–2회 돌려 후회가 줄어드는지.
- **SA는 이차식이 필요 없다.** SA는 임의의 에너지 함수를 쓸 수 있으므로, 공간구문 지표를 *정확히 계산*하는 에너지로 SA를 돌리는 것이 가장 정확하다. 논문에서 QUBO가 필요한 이유(양자·이징 하드웨어 호환, 가중치에 선형인 구조 → 데이터 맞춤)를 밝히고, **정확 에너지 SA vs 대리 QUBO SA vs 정확 QUBO(3절, 뿌리 하나)를 완전 열거 최적과 비교**하면 RQ2·RQ3가 함께 답해진다.

### 권장 구성(요약)

| 층 | 무엇을 | 형태 |
|---|---|---|
| 기본 QUBO | 인접·연결도·현관 깊이 1·순환 수·위치 | x만으로 정확한 이차 |
| 정확 확장(시연용) | 현관(또는 거실) 뿌리 하나의 TD/RRA·통제값 | z(+g) 또는 BFS 층 보조 변수, 약 4–27배 변수 |
| 대리 | 평균 통합도·유전형 순서·통합도 비 | 데이터로 맞춘 이차 대리, 대리 후회로 검증 |
| 기준선 | 정확 지표 에너지 + SA, 완전 열거 | QUBO 없이 정확 |

### 5. RQ4를 위한 공정한 가중치 맞춤 방법(권장)

목표: '어느 공간구문 목적이 실제 한국 평면을 가장 잘 설명하는가'를 비교한다. 후보 목적 O_j마다 특징 벡터 φ_j(x)(정확 지표 또는 그 QUBO 항)가 있다.

1. **최대 엔트로피 = 볼츠만 최대우도로 맞춘다.** 사양(면적·침실 수·앞 띠 침실 수)별로 p_θ(x | spec) ∝ exp(−θ·φ_j(x))를 두고, 학습 분할의 실제 평면(띠 배정으로 투영한 것)에 대한 로그가능도를 최대화한다. 최적점에서 모형의 특징 기대값 = 실제 평면의 특징 평균(Nguyen et al. 2017 p.14; Ziebart et al. 2008 p.3 "At the maxima, the feature expectations match"). 프로젝트의 `qubo-maxent.mjs`가 이미 이 방식이다.
   - 실제 평면이 한 목적의 최적해가 아니라 여러 설계자의 다양한 선택이라는 점에서, '관측 해가 최적이 되도록' 맞추는 고전적 역최적화(Ahuja & Orlin 2001; Chan et al. 2025)보다 부최적 관측을 허용하는 최대 엔트로피가 맞다(Ziebart et al. 2008 p.2).
   - **분배함수 Z(θ)를 완전 열거로 정확히 계산**할 수 있어(사양별 배정 ≤ 14,400) MCMC 근사(Ackley et al. 1985; Hinton 2002)나 유사가능도가 필요 없다. 기울기가 정확하므로 후보 간 비교가 추정 잡음에 흔들리지 않는다.
2. **같은 조건으로 비교한다.**
   - 같은 데이터 분할(개발/시험), 같은 사양 층화, 같은 정규화(능선 계수), 같은 원-핫 벌점 규칙, 같은 SA 예산(Dunning et al. 2018).
   - 모수 수가 다른 후보는 **시험 분할 로그가능도**와 함께 AIC/BIC로 보정한다. 특징끼리 공선성이 크면(예: 인접 수와 연결도) 계수 부호 해석은 하지 않고 가능도만 비교한다.
   - 모든 후보에 공통 '기본 특징'(인접·위치)을 넣고 공간구문 특징만 바꾸는 **중첩 모형** 비교(가능도비)를 주 분석으로 두면, '공간구문 항이 기본 배치 규칙 위에 설명력을 더하는가'를 직접 검정할 수 있다.
3. **평가 모형으로 맞춘 가중치는 RQ4에 쓰지 않는다.** 현재 기본값 'calibrated'는 평가 모델 점수로 회귀한 가중치라, 외부 비교 프로그램이 같은 계열의 지표를 쓰면 순환이 된다. RQ4에는 실제 평면 빈도로만 맞춘 maxent 가중치를 쓰고, calibrated는 부록 비교로 둔다.
4. **생성물은 두 가지로 낸다.** (a) SA 최적해(T → 0, RQ3와 연결), (b) 맞춘 θ에서의 볼츠만 표본(T = 1, 완전 열거로 정확 표본 가능). 실제 평면은 분포이므로, 외부 프로그램에서 실제 평면 분포와 비교할 때는 (b)가 공정하다. (a)만 비교하면 최빈값 하나와 분포를 비교하게 된다.
5. **투영 손실을 보고한다.** 띠 배정으로 표현할 수 없는 실제 평면(타워형·3띠 등)은 맞춤에서 빠지므로, 포함 비율과 빠진 평면의 특성을 함께 적는다.
6. **강건성 점검**: 최대 마진(Ratliff et al. 2006) 방식으로 같은 비교를 다시 해 순위가 같은지 본다.

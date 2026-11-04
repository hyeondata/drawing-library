> **보조 조사 노트(2026-11-04, 조사 에이전트 작성).** 'direct' 인용 중 국외 문헌은 웹 요약 도구로 뽑은 것이 있어 원문 재대조 전에는 논문에 그대로 쓰지 않는다. 등재 상태는 출판 연도 기준으로 확인한 것이 없다(MJL 로그인 필요). 설계 판단은 [18. 연구 설계](../18-연구-설계-RQ1-4.md).

# 주거 평면 공간구문 문헌 조사 (국내·국외)

- 조사일: 2026-11-04
- 범위: 주거 평면에 공간구문(접근 그래프, 정당화 그래프 J-graph, JPG, 유전형)을 적용한 연구. 한국 아파트 단위평면을 중심으로 하고, 정의의 원전과 '생성 평면 대 실제 평면' 비교 연구를 함께 다룸.
- 저장소에서 이미 확인한 것(evidence/07, 16, research/도면생성-선행연구-원문대조, src/generate/citations.js)은 다시 확인하지 않고 그 결과를 옮겼습니다. 이번에 새로 확인한 것은 따로 표시했습니다.

## 표기 규칙

### 검증 수준
- **direct**: 전문의 해당 대목을 읽음. 인용과 쪽을 붙임.
- **abstract**: 초록, 서지, 검색 스니펫까지만 확인.
- (2차): 다른 논문이 그 문헌을 인용한 것으로만 확인.

### 등재 상태
- 출처를 열어 확인한 것만 적고 출처 이름을 붙였습니다. 그 밖에는 모두 **미확인**입니다.
- **출판 연도 기준 등재 여부는 이번에 한 건도 확인하지 못했습니다.** Clarivate MJL·JCR 연도별 이력은 로그인이 필요하고, KCI 포털 조회는 실패했습니다.
- 아래 '현재' 표기는 출판사 페이지에 적힌 현재 색인입니다. 그 페이지도 직접 열지는 못했고 검색 결과의 발췌로 확인했으므로, 투고 전에 MJL에서 다시 확인해야 합니다.

### 그래프 규약 약어
- **A**: 출입(문·개구부) 그래프
- **Adj**: 벽 인접 그래프
- **CV**: 볼록공간 그래프
- **Ext 루트**: 외부(carrier) 노드를 루트로 포함
- **E 루트**: 세대 현관을 루트로 둠

### 통합도 척도가 논문마다 다름
같은 이름(integration)을 쓰더라도 실제 값은 다음 중 하나입니다.
- RA = 2(MD−1)/(k−2): 낮을수록 통합. HHG 1987 식 1, Femenías
- 1/RA: Ostwald의 i
- RRA = RA/D_k: 낮을수록 통합. Amorim, Hwang, Dawson
- 1/RRA: 높을수록 통합. Choi, Byun, Guney, Wu, Jiang

논문끼리 수치를 비교하려면 이 척도를 먼저 맞춰야 합니다.

---

## 요약표

| # | 문헌 | 저널(연도) | 등재(확인 출처) | 표본 | 그래프 | 핵심 수치 | 검증 |
|---|---|---|---|---|---|---|---|
| 1 | Hillier & Hanson 1984 | 단행본 | 해당 없음 | — | A, Ext 루트 | 깊이·RA·RRA·통합도·ringiness 정의 | 서론만 direct(저장소) |
| 2 | Hillier, Hanson & Graham 1987 | EPB 14(4) | 현재 SSCI(Sage 페이지, 검색 발췌). 1987년 당시 미확인 | 노르망디 농가 17채 | A, Ext 루트(포함·제외 둘 다) | 유전형 sc 통합값 0.47(외부 포함), difference factor 0.79 대 0.90 | direct(보조 에이전트, UCL 스캔본) |
| 3 | Bafna 2003 | Environment and Behavior 35(1) | 미확인 | 개론 | — | 정의만 | 전문 미확보(2차) |
| 4 | Ostwald 2011a | Nexus Netw. J. 13(2) | 현재 SCIE·A&HCI(Springer 페이지, 검색 발췌). 2011년 당시 미확인 | 예제 1채 | A, Ext 루트 | 9단계 절차, CV 비판, difference factor 재정의 | direct(저자 최종본) |
| 5 | Ostwald 2011b (Murcutt) | Nexus Netw. J. 13(3) | 4와 같음 | 주택 5채 | A, Ext 루트 | 4채에서 홀이 최다 통합. H* 0.38~0.80 | direct(저자본) |
| 6 | Lee, Ostwald & Gu 2015 | Architectural Science Review 58(3) | 미확인 | Murcutt 10채 | A, Ext 루트 | JPG 생성 문법 7단계 | direct(수락본) |
| 7 | Lee, Ostwald & Gu 2018 | EPB:UA&CS 45(1) | 현재 SSCI(Sage). 당시 미확인 | Murcutt | A, Ext 루트 | JPG 문법으로 유전형 생성 | abstract |
| 8 | Seo 2003 | 4th SSS 학술대회 | 해당 없음(학술대회) | 강남구 3침실 75개(1974–99) + 대표 7개 | CV·A, Ext 루트(C) | 저층(서비스)/고층 평균 RRA 비 1.61~1.69 | **direct(이번에 확인)** |
| 9 | Seo 2007 | EPB 34(6) | 현재 SSCI(Sage). 2007년 당시 미확인 | 강남구 3침실 75개 | A와 Adj 구분 | 현관–중앙홀 97%, 안방 최원단 89% | direct(저장소) |
| 10 | Choi et al. 2014 | JAABE 13(3) | 현재 SCIE·A&HCI(T&F 페이지, 검색 발췌). 2014년 당시 미확인 | 한·베·카 3침실 각 20개 | CV | 한국: 복도 2.72 > 거실 1.64 > DK 1.34 > 안방 1.31 > 현관 1.24 > 침실 1.14 | **direct(이번에 재확인)** |
| 11 | Byun & Choi 2016 | JAABE 15(1) | 10과 같음. 2016년 당시 미확인 | 서울 2001–13 평면 2,500개 | CV, 외부(Outdoor) 노드 포함 | 군집 평균 순위에서 거실 1위인 군집이 군집 배정 2,224건 중 1,873건(84%, 계산값) | **direct(이번에 재확인)** |
| 12 | Ham & Lee 2017 | Sustainability 9(1) | 미확인(저장소 기록은 SCIE·SSCI) | 서울 85㎡ 2베이 계단실형 890개(1970–2015) | A, j-graph, E 루트 | 58개 위상형. DK 경유형이 90.2%(803개) | direct(이번 재확인 + 저장소) |
| 13 | Jeong & Ban 2014 | Habitat International 42 | 미확인 | 청주 아파트 1972–2000 | 미확인 | 각 실의 기능 확장과 독립성 증가 | abstract(목록 요약) |
| 14 | Choi, Kim & Yun 2015 | 대한건축학회논문집 계획계 31(1) | 미확인(KCI 조회 실패) | 한·카 3LDK | 미확인 | 한국은 거실 중심, 카자흐스탄은 현관 중심 | abstract |
| 15 | Hwang 2016 | 한국실내디자인학회논문집 25(2) | 미확인 | 분당·위례 46개 타입 | CV, RRA | 안방의 통합성이 높음. 분당 평면의 62.1%가 RRA 평균 1 이하 | 일부 direct |
| 16 | Hwang 2019 | 한국산학기술학회논문지 20(8) | 미확인 | 아파트와 한옥 표준평면 | CV | 두 유형 모두 거실 통합도 최고, 안방 통합성 높음 | abstract |
| 17 | Kim & Kwak 2021 | JAABE 21(2) | 10과 같음 | 1930년대 도시한옥 | J-graph | 마당 중심 유전형, 트리형·고리형 | abstract |
| 18 | Guney & Wineman 2008 | EPB 35(4) | 현재 SSCI(Sage). 당시 미확인 | 앙카라 아파트 108개(1920–90s) | CV·A, Ext 루트(포함·제외) | 83/108에서 전이공간(홀)이 1위, 25개는 거실 1위. BDF 0.59~0.88 | direct(보조 에이전트) |
| 19 | Amorim 1997 | 1st SSS | 해당 없음 | 헤시피 근대주택 140채 | 섹터 그래프, Ext 루트 | 사적 섹터가 항상 가장 깊음. s=se<p 57.9% | direct(보조 에이전트) |
| 20 | Femenías & Geromel 2020 | J. Housing Built Env. 35(2) | 미확인(저장소 기록은 SSCI) | 스웨덴 313가구 | CV, E 루트 | 거실 최다 통합 58%, 고리 있는 집 87% | direct(보조 에이전트) |
| 21 | Dawson 2003 / 2002 | SSS4 / J. Anthropol. Archaeol. 21(4) | 미확인 | 이누이트 47가구 / 눈집 | A | 거실 > 침실 > 부엌 | 2003 direct, 2002 abstract |
| 22 | Barkat, Bada & Guney 2021 | ICONARP 9(2) | 미확인 | 비스크라 전통주택 15채 | Ext 루트 | 홀이 최다 통합. 트리형 10채, 고리형 5채 | direct(보조 에이전트) |
| 23 | Wu, Lee, Ostwald & Dawes 2025 | Open House International 51(2) | 미확인 | 시드니 공공임대 45세대(1914–2020) | 기능실 노드, E 루트 | 유형별 평균 i 1.34~0.92 | direct(보조 에이전트) |
| 24 | Conroy Dalton & Kirsan 2008 | EPB 35 | 현재 SSCI(Sage). 당시 미확인 | — | 소그래프 정합 | 유전형을 그래프 매칭으로 비교 | 서지만(Ham 2017 참고문헌) |
| 25 | Park, Ergan & Feng 2024 | Autom. Constr. 158 | 미확인(저장소 기록은 SCIE) | 건축가 평면 8만+와 생성 평면 | 미확인(VGA 추정) | Mann-Whitney 유의차 | abstract |
| 26 | Jiang et al. 2026 | arXiv 2602.22507(심사 전) | 해당 없음 | RPLAN 20,348개와 생성기 9종 | CV 접근 그래프 | 도메인 적분도 프로파일 L1(IPD), 거실 우위(PIA) | direct(보조 에이전트, HTML v3) |
| 27 | Zhou, Song & Lu 2025 | Frontiers of Arch. Research | 미확인 | 박물관 263개 | VGA(픽셀) | 생성 평면의 공용부 connectivity가 낮음 | direct(보조 에이전트) |

---

## A. 정의의 원전과 방법론 문헌

### 1. Hillier & Hanson (1984)
- **서지**: Hillier, B., & Hanson, J. (1984). *The Social Logic of Space*. Cambridge University Press. doi:10.1017/CBO9780511597237
- **등재**: 단행본이라 해당 없음.
- **정의하는 것**
  - 실을 점, 출입구를 선으로 한 그래프를 외부를 기준으로 정당화(justify)하는 방법
  - 깊이, 평균 깊이(MD), RA = 2(MD−1)/(k−2), RRA = RA/D_k
  - 통합도와 분리도, 대칭·비대칭, 분포·비분포(ringiness)
  - D_k 표는 pp.109–113에 있다고 HHG 1987 각주가 인용함(2차).
- **검증**: 서론 p.14만 direct(저장소 `hillier-access`). 식이 실린 쪽은 열람하지 못함.
- **관련성**: 모든 후보 목적의 정의 근거.

### 2. Hillier, Hanson & Graham (1987)
- **서지**: Hillier, B., Hanson, J., & Graham, H. (1987). Ideas are in things: an application of the space syntax method to discovering house genotypes. *Environment and Planning B: Planning and Design*, 14(4), 363–385. doi:10.1068/b140363
- **등재**: 현재 SSCI(Sage 저널 페이지, 검색 발췌). 1987년 당시는 미확인.
- **표본**: 노르망디 농가 17채. 너무 작은 집을 빼고 유전형 8채와 비유전형 6채로 나눔(p.381).
- **그래프**: 출입 그래프, 외부를 루트로 함. 원문: "justified permeability graphs were drawn … using the exterior as root"(p.372). 통합값은 외부를 포함한 경우와 뺀 경우를 모두 계산함.
- **정의**
  - 식 1의 'integration value' = 2(d̄−1)/(k−2)(p.364). 사실상 RA이며, 0이 가장 통합된 값.
  - **inequality genotype**: 기능별 통합값 순서가 표본 전체에서 일관될 때의 이름(p.364).
  - **difference factor**: 이 논문이 처음 정의함(p.365). 원문: "we have developed an entropy-based measure called *difference factor*".
    - H = −Σ(a/t)ln(a/t). a, b, c는 세 공간의 통합값이고 t는 그 합.
    - H* = (H − ln2)/(ln3 − ln2)
    - 원문의 범위 표기 "between 0 … and 2"는 오식으로 보임.
- **결과**(Table 4, pp.381–382)
  - 유전형 집단에서 salle commune(sc)가 가장 통합됨. sc 평균값은 외부 포함 0.47, 제외 0.6. 비유전형은 1.32와 1.81.
  - 주 기능 공간의 difference factor는 유전형 0.79, 비유전형 0.90.
- **검증**: direct(보조 에이전트가 UCL Discovery 스캔본을 판독).
- **관련성**
  - '거실 중심 유전형' 목적의 개념 근거.
  - **difference factor는 순위(τ)와 다른 정보인 분화 강도를 재므로 held-out 지표 후보**입니다.

### 3. Bafna (2003)
- **서지**: Bafna, S. (2003). Space Syntax: A Brief Introduction to Its Logic and Analytical Techniques. *Environment and Behavior*, 35(1), 17–29. doi:10.1177/0013916502238863
- **등재**: 미확인(저장소 기록은 SSCI).
- **정의하는 것**: 깊이, 통합도, 분포·비분포(ringiness), 대칭·비대칭의 개론.
  - Guney & Wineman 2008이 relative ringiness를 "distributed and nondistributed properties"로 쓰고, Femenías 2020이 RA 정의의 출처로 Bafna를 인용한 것을 2차로 확인함.
- **검증**: 전문 미확보.
- **관련성**: 순환성(ringiness) 후보의 개념 근거.

### 4. Ostwald (2011a)
- **서지**: Ostwald, M. J. (2011). The Mathematics of Spatial Configuration: Revisiting, Revising and Critiquing Justified Plan Graph Theory. *Nexus Network Journal*, 13(2), 445–470. doi:10.1007/s00004-011-0075-3
- **등재**: 현재 SCIE·A&HCI(Springer 저널 페이지, 검색 발췌. 2022년 같은 저널의 계량서지 논문도 SCI-E와 AHCI를 적음). 2011년 당시는 미확인.
  - 저장소 02번 문서의 'SCIE 아님'과 07번 문서의 'SCIE·A&HCI(현재)'가 서로 다르니 통일해야 함.
- **그래프**: 루트(carrier)는 흔히 외부. 원문: "The carrier node, often the outside world, is located on the lowest line". 예제 Villa Alpha는 K=7이며 외부를 포함함.
- **정의(9단계)**
  - TD = Σ L·n_L
  - MD = TD/(K−1)
  - RA, RRA = RA/D_K(K=7일 때 D=0.34). D값 표의 기원은 Periklaki & Peponis 1985로 봄.
  - i = 1/RA, 또는 i = 1/RRA
  - CV(통제값) = 각 이웃이 나눠 주는 1/연결 수의 합(Shapiro 2005 방식)
  - difference factor는 최대·평균·최소 RA로 계산함. 1987년 원 정의(지정한 세 기능 공간)와 다름.
- **주장**
  - TD, MD, RA, i는 공간 순위가 같거나 정반대일 뿐이라 같은 정보를 반복함.
  - CV 비판: "the CV has relatively little to do with power or control". 원문은 '자연스러운 모임 장소'로 읽자고 제안함.
  - MD=1이면 RA=0이 되어 i와 H*를 계산할 수 없음(미주 vi).
- **검증**: direct(figshare에 올라온 저자 최종본, 쪽 대신 Step 번호로 위치 표시).
- **관련성**
  - 통제(control) 후보에 대해서는 **약하거나 반대 방향의 근거**입니다.
  - 깊이 계열 지표끼리 held-out으로 쓰면 순환이 생긴다는 경고 근거입니다.

### 5. Ostwald (2011b), Murcutt 초기 주택
- **서지**: Ostwald, M. J. (2011). A Justified Plan Graph Analysis of the Early Houses (1975–1982) of Glenn Murcutt. *Nexus Network Journal*, 13(3), 737–762. doi:10.1007/s00004-011-0089-x
- **등재**: 4번과 같음.
- **표본**: 주택 5채. 외부를 루트로 하고, 기능별로 묶은 공간을 노드로 씀.
- **결과**
  - 원문: "In four of these cases hallways dominate the genotype being the most integrated spaces".
  - H*는 0.382~0.799이고, 가장 낮은 Ball-Eastaway(0.382)만 강한 유전형으로 해석함.
- **검증**: direct(저자본).

### 6–7. Lee, Ostwald & Gu (2015, 2018)
- **서지(2015)**: A syntactical and grammatical approach to architectural configuration, analysis and generation. *Architectural Science Review*, 58(3), 189–204. doi:10.1080/00038628.2015.1015948
  - 등재: 미확인.
  - 검증: direct(수락본).
- **서지(2018)**: A Justified Plan Graph (JPG) grammar approach to identifying spatial design patterns in an architectural style. *EPB: Urban Analytics and City Science*, 45(1), 67–89. doi:10.1177/0265813516665618
  - 등재: 현재 SSCI(Sage). 당시는 미확인.
  - 검증: abstract.
- **내용(2015)**: JPG 생성 문법 7단계.
  - Step 1: "designate the exterior node as the carrier"
  - Step 2: 주 출입구를 가진 core node가 외부와 바로 이어짐
  - Step 3–4: 깊이 2, 3의 링크를 추가함
  - Step 6: 고리(ring)를 만드는 링크를 추가함
- **관련성**
  - 생성 규칙을 위상 그래프로 쓴 선례로, 이 연구의 QUBO 생성과 직접 비교할 수 있음.
  - Lee·Ostwald의 한국 주택 JPG 연구는 찾지 못함.

### 24. Conroy Dalton & Kirsan (2008)
- **서지**: Conroy Dalton, R., & Kirsan, C. (2008). Small-graph matching and building genotypes. *EPB*, 35, 810–830.
- **DOI**: Ham 2017의 참고문헌에 [CrossRef]로만 표시되어 있어 DOI는 미확인.
- **등재**: 미확인.
- **검증**: 서지만 확인(Ham 2017 참고문헌).
- **관련성**: 유전형을 그래프 매칭(정합)으로 비교하는 방법. **가장 가까운 실제 평면까지의 그래프 거리**를 held-out 지표로 쓸 때의 근거 후보. 전문 확인이 필요함.

---

## B. 한국 아파트·주거

### 8. Seo (2003): 새로 찾음
- **서지**: Seo, K. W. (2003). Topological paths in housing evolution. *Proceedings, 4th International Space Syntax Symposium*, London, 80.1–80.14.
  - 원문: https://www.spacesyntax.net/symposia-archive/SSS4/fullpapers/80Seopaper.pdf
- **등재**: 학술대회 논문집이라 해당 없음.
- **표본**
  - 1945년 도시한옥부터 1993년 아파트까지 대표 평면 7개
  - 강남구 3침실 계단실형 75개(1974–1999)
- **그래프**: 볼록공간·출입 J-graph(Figure 7)이고, 바닥 노드 C를 루트로 둠.
  - 거실·식당주방에 트여 있는 중앙 동선 구역도 독립 볼록공간('central hall')으로 봄(p.80.6).
- **지표**
  - 평균 RRA를 공간 '수준'별로 나눔. 수준은 신발을 신는 낮은 공간(현관, 욕실, 발코니, 다용도 등)과 마루가 높은 공간(거실, 침실 등)임.
  - 상대화 값 = 낮은 공간 평균 RRA ÷ 높은 공간 평균 RRA
  - 원문: "This value is gained by dividing the mean RRA of low-level rooms by that of high-level rooms"(p.80.11)
- **결과**
  - 대표 평면의 상대화 값(p.80.11): 도시한옥 0.826 → 단독주택(1962) 1.315 → 아파트 1964년 1.153, 1968년 1.339, 1983년 1.626, 1992년 1.527, 1993년 1.795
  - 75개 표본(p.80.12): PS1-III형 평균 1.65, PS1'-III형 1.61, 새 2욕실형 1.69. 연도 회귀는 y = 1.095 + .005x, R² = .125
  - 시장 선택: 원문 "the 'fittest' in the market has been the plan where the high-level main functional rooms were more centrally linked while the low-level rooms were pushed out to the more segregated area"(p.80.12)
  - 75개 중 PS1-III(21개)와 PS1'-III(22개)가 57%를 차지함(p.80.6).
- **검증**: direct(이번에 PDF를 직접 추출).
- **관련성**
  - **새 후보 목적: '주 생활실 중심 + 서비스·습식 공간 주변화'**
  - 이 비율은 거실 하나의 통합도가 아니라 공간 집단 사이의 분리를 재므로, 거실 중심 목적의 **held-out 지표**로도 쓸 수 있음.

### 9. Seo (2007)
- **서지**: Seo, K. W. (2007). Space Puzzle in a Concrete Box: Finding Design Competence that Generates the Modern Apartment Houses in Seoul. *EPB: Planning and Design*, 34(6), 1071–1084. doi:10.1068/b32134
- **등재**: 현재 SSCI(Sage). 2007년 당시는 미확인.
- **표본**: 강남구 3침실 계단실형 75개. 1970년대 11개, 80년대 30개, 90년대 34개(저자 원고 p.4).
- **그래프**: 출입(실선)과 인접(점선)을 구분하고, 문 폭보다 짧게 맞닿은 경우는 인접으로 보지 않음(원고 p.6).
- **결과**(원고 쪽)
  - 73/75(97%)가 현관홀에서 바로 이어지는 중앙홀을 둠. 원문: "The driving force for this choice is 'shallow syntax'"(p.16)
  - 67/75(89%)가 안방을 현관에서 가장 먼 남쪽 모서리에 둠(p.16).
  - 앞면이 2베이를 넘으면 거실은 예외 없이 안방과 다른 침실 사이에 옴(R1-L-R, p.21).
  - 원문: "the bedrooms surround the open public zone of LDK"(p.21)
- **검증**: direct(저장소 citations.js, evidence/16).
- **관련성**
  - '현관에서 얕은 깊이' 목적의 직접 근거.
  - '안방 최원단'은 공·사 깊이 위계의 근거.
  - held-out 후보: 안방의 현관 기준 깊이 순위(가장 깊은 침실인가).

### 10. Choi, Kim, Kang & Choi (2014)
- **서지**: Choi, J., Kim, Y., Kang, J., & Choi, Y.-J. (2014). Comparative Analysis of the Spatial Structure of Apartment Unit Plans in Asia: Apartments in Korea, Vietnam, and Kazakhstan. *JAABE*, 13(3), **563–569**. doi:10.3130/jaabe.13.563
  - 저장소의 563–570은 틀림. OpenAlex와 원문 인쇄면 모두 569.
- **등재**: 현재 SCIE·A&HCI(Taylor & Francis 저널 페이지, 검색 발췌). 2014년 당시는 미확인.
  - 경상대 저장소 요약에 'SCIE 2010–' 표기가 있었다는 검색 결과가 있으나, 그 페이지는 JS로만 그려져 직접 확인하지 못함.
- **표본**: 국가별로 최근 10년 안에 지은 3침실형 20개를 무작위로 골라 총 60개(p.564 §2.3).
- **그래프**: 볼록공간 맵(convex map). 작성 기준은 "established based on the expected movements of residents"(p.564). 외부 노드 포함 여부는 적혀 있지 않음.
- **지표**: 실별 평균 통합도(값이 클수록 통합, 1/RRA 척도로 보임)와 국가 간 ANOVA.
- **결과**(p.565 Table 2, 한국)
  - 복도 2.7201 > 거실 1.6355 > 식당주방 1.3350 > 안방 1.3129 > 현관 1.2447 > 침실 1.1415 > 욕실 1.0555 > 드레스룸 0.9577 > 다용도 0.8120 > 발코니 0.8045 > 안방욕실 0.6702
  - 거실 통합도는 한국과 베트남 사이에만 유의차가 있음(Scheffé p=.023).
  - 원문의 해석: "one should focus on spaces, other than corridors … living rooms in Korean, dining rooms in Vietnamese, and entrance spaces in Kazak apartments"(p.564)
  - 원문 안의 불일치: 현관은 Table 2에서 1.2447인데 Table 3 ANOVA에서는 N=23, 1.2097임.
- **검증**: direct(이번에 J-STAGE PDF로 다시 추출).
- **관련성**
  - 거실 중심 유전형 목적의 직접 근거.
  - **안방이 현관보다 통합됨(1.31 대 1.24)**. 저장소의 기준 순서(거실 > 주방 > 현관 > 침실)는 안방과 일반침실을 합친 단순화임(저장소 연구 노트에 이미 기록됨).

### 11. Byun & Choi (2016)
- **서지**: Byun, N., & Choi, J. (2016). A Typology of Korean Housing Units: In Search of Spatial Configuration. *JAABE*, 15(1), 41–48. doi:10.3130/jaabe.15.41
- **등재**: 10번과 같음.
- **표본**: 서울 2001년~2013년 4월에 지은 3·4침실 평면 목록 2,500개(3침실 1,757, 4침실 743). 2001–05년 1,277개, 2006–13년 1,223개(p.43). 전수 조사를 목표로 함.
- **그래프**
  - 원문: "One convex space corresponds to one unit space"(p.43). 벽으로 구획된 모든 실을 포함함.
  - 분석에서는 **외부(Outdoor, 현관 밖)**, 현관, 거실, 식당주방, 안방, 침실, 거실 발코니만 봄. 욕실·복도·가족실·기타 발코니·수납은 제외(p.43).
  - 계산 도구는 S-cube Convex Analyzer 2.1.
- **지표**: 통합도. 요인분석(varimax)을 한 뒤 K-means 군집을 냄.
- **결과**(p.45 Table 3–5)
  - 군집 평균 순위
    - 2001–05 3R: A·B(425·321)는 L > KD > BR1 > E, C(72)는 KD > L
    - 2006–13 3R: A·B(446·205)는 L이 1위, C(126)는 KD > BR1 > L
    - 2006–13 4R: A(121)는 L이 1위, B(111)는 KD가 1위, C(39)는 BR1이 1위
    - 2001–05 4R: A(318)는 L이 1위, 원문 "had the highest case rate of 89%"
  - **계산값**: 군집 평균 순위에서 L이 1위인 군집의 사례는 군집에 배정된 2,224건 중 1,873건(84%)
    - 이 값은 개별 평면이 아니라 군집 평균 순위 기준이며, 원문 수치가 아니라 이 조사에서 합산한 것임.
    - 2006–13 4R에서는 121/271(45%)로 낮음. 주방 중심(KD 1위)이 237건으로 무시하기 어려운 소수 유형임.
  - 거실/침실 통합도 비는 군집별 1.17~2.29(지식 노트 2026-11-03의 재계산). 예: 3R_A(2001–05) 1.4312/0.8541 = 1.68
  - 원문: "the rate of living room-centered plans was overwhelming from the 2000s until recently"(p.46, 저장소 확인)
  - 외부(Outdoor) 노드는 모든 군집에서 통합도가 가장 낮음(0.56~0.79).
- **검증**: direct(이번에 재확인).
- **관련성**
  - 거실 중심 목적의 가장 큰 표본 근거.
  - **주방 중심형이라는 대립 유형**이 있음을 보여 줌. RQ4에서 '주방(DK) 중심' 후보를 비교 대조군으로 둘 근거.

### 12. Ham & Lee (2017)
- **서지**: Ham, S., & Lee, H.-S. (2017). Topological Transitions in Collective Housing Units of South Korea. *Sustainability*, 9(1), 31. doi:10.3390/su9010031
  - 온라인 출판은 2016년 12월. 저자명은 Sungil Ham, Hyun-Soo Lee.
- **등재**: 미확인. MDPI 페이지가 403으로 막힘. 저장소 기록은 SCIE·SSCI.
- **표본**: 서울 85㎡ 2베이 2호 계단실형 890개(1970–2015).
- **그래프**: j-graph. 원문: "The j-graphs contain only information on the relations between rooms (depth) that can be accessed from the entrance"(p.6). 현관을 루트로 하고 크기와 위치는 뺌.
- **지표**: 그래프 동형으로 58개 평면형을 묶고, 그래프 유사도(bipartite) 점수와 시간 기반 결합(TBJ)으로 계통수를 만듦.
- **결과**(p.9, p.13–14)
  - 두 계열로 나뉨. 2A는 침실이 식당주방(DK)을 거쳐 이어지고, 2B는 모든 실이 홀을 거쳐 이어짐.
  - 원문: "Plan (DK-O) 2A … accounted for 90.2% (803) of all the plans and 69.0% (40) of all the plan types"(p.14)
  - 침실 접근이 홀 경유에서 거실·DK 경유로 바뀌어, 현관에서 침실까지 거치는 공간 수가 늘었음(p.13).
- **검증**: direct.
- **관련성**
  - 공·사 깊이 위계 목적의 근거.
  - **held-out 지표 후보: 평면형(그래프 동형류)의 분포**. 예를 들어 침실 접근이 DK·거실 경유인지 홀 경유인지, 실제 평면에 있는 동형류와 일치하는 생성 평면의 비율.

### 13. Jeong & Ban (2014)
- **서지**: Jeong, S. K., & Ban, Y. U. (2014). The spatial configurations in South Korean apartments built between 1972 and 2000. *Habitat International*, 42, 90–102. doi:10.1016/j.habitatint.2013.11.002
  - Crossref 발행일은 2014년 4월, OpenAlex 연도는 2013.
- **등재**: 미확인.
- **표본**: 청주 아파트(1972–2000). 평면 수는 미확인.
- **결과(초록)**: 현대 생활과 온돌 기반 전통 생활이 결합된 구성이고, 각 실의 기능 확장과 독립성이 커지는 방향으로 바뀌었음.
- **검증**: abstract(목록 요약). ScienceDirect는 403.
- **관련성**: '독립성 증가'는 공·사 위계 후보와 연결될 수 있으나, 지표 정의를 확인해야 함.

### 14. Choi, Kim & Yun (2015)
- **서지**: 최재필·김영우·윤소연 (2015). 한국과 카자흐스탄 아파트의 공간구조 및 면적구성 비교분석. *대한건축학회논문집 계획계*, 31(1), 19–27. doi:10.5659/JAIK_PD.2015.31.1.19
- **등재**: 미확인(KCI 포털 조회 실패).
- **표본**: 두 나라의 3LDK 단위평면.
- **결과(초록)**: 한국은 거실 중심이고 카자흐스탄은 현관 중심. 두 나라 모두 공용 > 주방 > 사적 > 서비스 영역 순서임.
- **검증**: abstract(KoreaScience).
- **관련성**: 거실 중심 목적. **영역 단위 순위(공용 > 주방 > 사적 > 서비스)**는 실 단위 τ와 별개인 held-out 지표 후보.

### 15. Hwang (2016)
- **서지**: 황용운 (2016). 공간구문론을 이용한 신·구 신도시 아파트의 평면 구성 비교 분석. *한국실내디자인학회논문집*, 25(2), 123–. doi:10.14774/JKIID.2016.25.2.123
- **등재**: 미확인.
- **표본**: 분당(1기)과 위례 신도시의 24~34평형 46개 타입. 분당은 29개.
- **지표**: RRA(D값 사용)와 '통합도 = 1/RRA'. 본문 예시는 RRA = 0.36/0.285 ≒ 1.263, 통합도 ≒ 0.792. RRA 1을 기준으로 통합 공간과 분리 공간을 나눔.
- **결과**
  - 분당 평면의 62.1%(18/29)가 RRA 평균 1 이하(본문 p.4)
  - 초록: 두 신도시 모두 안방이 강한 통합 공간이고, 위례는 L+K+D가 통합 공간임.
- **검증**: 일부 direct(PDF 추출). 표 정렬이 깨져 세부 수치는 일부만 확인함.

### 16. Hwang (2019)
- **서지**: 황용운 (2019). 현대 아파트 평면도와 한옥표준평면도의 공간배치 특성 비교 연구. *한국산학기술학회논문지*, 20(8), 271–278. doi:10.5762/KAIS.2019.20.8.271
- **등재**: 미확인.
- **결과(초록)**: 두 평면 모두 거실의 통합도가 가장 높았음. 아파트에서는 안방의 통합성이 높았고, 피난 공간이 가장 분리된 공간이었음.
- **검증**: abstract.

### 17. Kim & Kwak (2021)
- **서지**: Kim, J., & Kwak, D. (2021). Extraction of spatial genetic characteristics and analysis of 1930s Korean Urban Hanok based on application of space syntax. *JAABE*, 21(2), 197–210. doi:10.1080/13467581.2020.1869008
- **등재**: 10번과 같음.
- **결과(초록)**: 마당 중심 유전형. 정당화 그래프의 모양에 따라 세 집단(트리형·우산형, 확장 트리형, 고리형)으로 나뉨.
- **검증**: abstract.
- **관련성**: 거실이 마당을 대신한다는 해석(Byun 2016이 인용한 Choi 1990)의 배경. 트리형과 고리형의 구분은 ringiness 후보와 연결됨.

---

## C. 국외 주거 유전형 연구

### 18. Guney & Wineman (2008): 아파트 유전형의 대표 사례
- **서지**: Guney, Y. I., & Wineman, J. (2008). The evolving design of 20th-century apartments in Ankara. *EPB*, 35(4), 627–646. doi:10.1068/b3401
- **등재**: 현재 SSCI(Sage). 2008년 당시는 미확인.
- **표본**: 앙카라 아파트 108개(1920~1990년대).
- **그래프**: 볼록공간 접근 그래프. 루트는 "usually outside the entry to the building"(p.629). 통합값은 외부 포함과 제외를 모두 계산함(p.631).
- **지표**: MD, 통합값(1/RRA), **BDF(base difference factor)**, SLR, relative ringiness, a/b/c/d형 공간 비율.
- **결과**
  - BDF는 1920년대 0.59에서 1950년대 0.88로 올랐다가 이후 0.71–0.75(p.632 Table 1).
  - 108개 중 83개에서 전이공간(현관홀)이 가장 통합되고 거실은 2위. 원문은 이를 "transition-space-centred organization" 유전형이라 부름(p.639).
  - 3군 부등식: EH 1.39 > L 1.18 > C 0.91 > R 0.87 > …
- **검증**: direct(보조 에이전트, 대학 저장소 PDF). 원문에 부등호와 수치가 어긋난 곳이 있음.
- **관련성**
  - **경쟁 가설인 '전이공간(홀) 중심'**. 한국 평면은 중앙홀이 거실과 트여 하나의 공용 영역이 되는 경우가 많음(Seo 2003 p.80.6). 그래서 홀을 독립 노드로 보는지가 결과를 가름.
  - AI 허브 라벨에 '기타'(복도) 노드가 있으므로, 이 처리를 RQ1에서 민감도로 보고해야 함.

### 19. Amorim (1997)
- **서지**: Amorim, L. (1997). The Sectors' Paradigm: Understanding modern functionalism and its effects in configuring domestic space. *Proc. 1st Int. Space Syntax Symposium*, London, Vol. II, 18.
- **표본**: 헤시피 근대주택 140채(1950–1970).
- **그래프**: 볼록공간을 섹터(사회, 서비스, 사적, 매개)로 묶음. 원문: "the exterior (public space) taken as its root". 통합은 RRA 그대로 씀.
- **결과**(Table 5): 사회=서비스 < 사적이 81채(57.9%), 사회 < 서비스 < 사적이 48채(34.3%). 사적 섹터가 항상 가장 깊음.
- **검증**: direct(보조 에이전트).
- **관련성**: 공·사 깊이 위계 후보. **섹터 단위의 깊이 순서**는 held-out 지표 후보.

### 20. Femenías & Geromel (2020)
- **서지**: Femenías, P., & Geromel, F. (2020). Adaptable housing? A quantitative study of contemporary apartment layouts that have been rearranged by end-users. *J. Housing and the Built Environment*, 35(2), 481–505. doi:10.1007/s10901-019-09693-9
- **등재**: 미확인(저장소 기록은 SSCI).
- **표본**: 스톡홀름과 예테보리의 분양형 단지 5곳(2001–08 준공). 313가구가 응답함(응답률 67%).
- **그래프**: 볼록공간 그래프이고 바닥은 세대 현관. 발코니는 포함하고 수납은 뺌. 지표는 RA(Bafna 인용).
- **결과**(pp.492–493)
  - 원문: "in 58% of the apartments, the living room is the most integrated space, while the entrance hall … 29% … kitchen … 12%"
  - 내부 고리가 1개 이상인 집이 87%. 거주자가 고친 뒤 고리 없는 집이 41채에서 87채로 늘었음.
- **검증**: direct(보조 에이전트). 원문의 고찰 절에는 60%로 적혀 있음.
- **관련성**: 거실 1위 비율과 고리 비율을 비교할 국외 기준.

### 21. Dawson (2002, 2003)
- **2003**: Examining the impact of Euro-Canadian architecture on Inuit families living in Arctic Canada. *Proc. 4th SSS*, 21.
  - 표본: 아르비아트 47가구.
  - 지표: 방 단위 출입 그래프, RA와 RRA.
  - 결과: 거실 > 침실 > 부엌(p.21.9).
  - 검증: direct.
- **2002**: Space syntax analysis of Central Inuit snow houses. *J. Anthropological Archaeology*, 21(4), 464–480. doi:10.1016/S0278-4165(02)00009-0
  - 검증: abstract.
- **등재**: 미확인.

### 22. Barkat, Bada & Ince Guney (2021)
- **서지**: Genotype Syntactic Study of Vernacular Houses in Biskra City. *ICONARP*, 9(2). doi:10.15320/ICONARP.2021.177
- **등재**: 미확인.
- **표본과 그래프**: 전통주택 15채. 외부를 루트로 하고 외부 제외도 계산함. AGraph로 MD, RA, RRA, BDF, SLR을 구함.
- **결과**: 홀이 최다 통합. 트리형 10채, 고리형 5채.
- **주의**: 원문은 BDF 해석 방향이 HHG 1987과 반대임.
- **찾던 'Bendjedidi 유전형' 논문**
  - 실제 주택 유전형 논문은 이 Barkat 등으로 보임.
  - Bendjedidi 등의 IRSPSD 6(4) 논문은 외부 오픈스페이스 가시성 연구임(검색으로만 확인).
- **검증**: direct(보조 에이전트).

### 23. Wu, Lee, Ostwald & Dawes (2025)
- **서지**: The evolution of syntactic and dimensional properties in Sydney social housing. *Open House International*, 51(2), 327–344. doi:10.1108/OHI-02-2025-0051
- **등재**: 미확인.
- **표본과 그래프**: 시드니 공공임대 45세대(1914–2020). 루트는 세대 현관이고, 노드는 기능실 단위.
- **지표**
  - C(연결 수), CV = Σ1/C_j, MD
  - i = D_n(n−2)/[2(MD−1)]
- **결과**: 복도 중심형의 평균 i가 1.3449, 복층형이 0.9223.
- **검증**: direct(보조 에이전트). 원문에 MD를 'Euclidean'으로 쓴 오기가 있음.

### 기타 서지만 확인
| 문헌 | 내용 |
|---|---|
| Orhun, Hillier & Hanson 1995, EPB 22(4), doi:10.1068/b220475 | 터키 전통주택, difference factor |
| Pham, Pham & Oh 2021, *Spatium* 45, doi:10.2298/SPAT2145034P | 호찌민 아파트와 전통주택 비교 |
| Elizondo 2022, *Nexus* 24(1), doi:10.1007/s00004-021-00568-7 | 멕시코 사회주택 JPG |
| Rahmane & Abbaoui 2021, ETASR 11(1) | 세티프 주택 유전형 |
| Hanson 1998, *Decoding Homes and Houses* | 원문 미열람. difference factor 재서술(pp.30–31, 2차) |

---

## D. 생성 평면과 실제 평면의 공간구문 비교

### 26. Jiang, Zhang, Liu & Liang (2026): 가장 가까운 선행 연구
- **서지**: Rethinking Floorplan Generation with Space Syntax: From Design Theory to Model Improvement. arXiv:2602.22507(v3, 2026-10-10). 심사 전 사전공개본.
- **데이터**: RPLAN 20,348개를 기준으로 생성기 9종을 비교함. 교차 코퍼스로 LIFULL, MSD 등을 씀.
- **그래프**: 볼록공간 접근 그래프(CSAG). 원문: "convex spaces are nodes, access relations are edges". 외부 노드는 Compatibility 지표에서만 명시함.
- **지표**
  - 도메인 4개: Public = 거실·식당, Private, Service = 주방·욕실, Outdoor
  - **IPD**: 도메인별 상대 통합도 프로파일의 L1 차이
  - **PIA**: 거실 통합도 − 가장 강한 경쟁 범주의 통합도
  - **Δpub**: Public 도메인이 2위 도메인보다 앞서는 정도
- **결과**
  - HouseDiffusion의 Public 우위 중앙값은 0.3387로, RPLAN 0.6304보다 46.3% 낮음.
  - 도메인 중앙값(Public/Private/Service): RPLAN 1.55/0.88/0.79, HD 1.35/0.96/0.92
  - 같은 지표를 강화학습 보상으로 쓰면 IPD가 27% 줄지만 FID는 나빠짐.
- **검증**: direct(보조 에이전트, HTML v3).
- **관련성**
  - RQ4와 설계가 가장 가까움. 다만 **목적과 평가에 같은 지표를 써서 순환 구조**임. 이 연구가 지표를 분리하는 설계는 차별점으로 주장할 수 있음.
  - 이 연구에서 거실 중심 통합도를 목적으로 쓰면, IPD와 PIA는 held-out 지표가 될 수 없음(같은 양).

### 25. Park, Ergan & Feng (2024)
- **서지**: Quality assessment of residential layout designs generated by relational GANs. *Automation in Construction*, 158, 105243. doi:10.1016/j.autcon.2023.105243
- **등재**: 미확인(저장소 기록은 SCIE).
- **표본**: 건축가 평면 8만 개 이상과 비슷한 수의 생성 평면.
- **지표(초록)**: 공유/사적 공간 크기, "visibility based on privacy requirements", 실 연결성. Mann-Whitney U로 비교함.
  - 참고문헌에 Turner의 Depthmap이 있어 VGA로 **추정**되지만 확인되지 않음.
- **검증**: abstract. 전문 접근에 실패함. OpenAlex는 bronze OA로 표시하므로 브라우저로 직접 열어 볼 것을 권함.

### 27. Zhou, Song & Lu (2025)
- **서지**: How to generate a museum floor plan: LoRA for diffusion models, or GANs? *Frontiers of Architectural Research*. doi:10.1016/j.foar.2025.08.017
- **내용**: 박물관 평면 263개, 픽셀 VGA connectivity. 생성 평면은 공용부(아트리움) connectivity가 원본보다 낮음.
- **등재**: 미확인.
- **검증**: direct(보조 에이전트).

### 기타
| 문헌 | 공간구문 관련 여부 | 검증 |
|---|---|---|
| Yıldız et al. 2026, FoAR, doi:10.1016/j.foar.2026.07.013 | integration 포함 | abstract |
| Man et al. 2026, JOBE, doi:10.1016/j.jobe.2026.116144 | 사례 1개 | abstract |
| Koenig et al. 2014, eCAADe | isovist를 적합도로 씀. 도시 블록 대상 | direct |
| Nourian et al. 2013, eCAADe | 설계 도구 | abstract |
| Laignel et al. 2021, Autom. Constr. | 공간구문을 쓴다는 근거 없음 | 메타데이터 |
| Shao 2026, arXiv 2611.00063 | 공간구문 지표 없음. 실무 규칙으로 House-GAN++ 33.7%, RPLAN 5.0% 탈락 | direct(abstract 페이지) |

- 외부 또는 현관을 루트로 한 평균 깊이, RRA, JPG 깊이로 생성 평면과 실제 평면을 직접 비교한 연구는 찾지 못했습니다.

---

## RQ4 후보 목적과 비교 지표 제안

원칙: 목적에 들어간 양과 같은 양 또는 단조 변환된 양은 그 목적의 비교 지표로 쓰지 않습니다(Ostwald 2011: TD, MD, RA, i는 순위가 같음). 아래 'held-out'은 해당 목적에서 빠진 양입니다.

| 후보 목적 | 정의(QUBO로 옮길 양) | 지지 문헌 | 반대 또는 주의 | held-out 비교 지표(목적과 분리됨) |
|---|---|---|---|---|
| O1 거실 중심 통합(유전형) | 거실 통합도 최대화, 또는 거실 > DK > 안방 > 현관 > 침실 순위 | Choi 2014(direct), Byun 2016(direct, 84% 계산값), Hwang 2019(abstract), Choi 2015(abstract), Dawson 2003, Femenías 58%, HHG 1987(개념) | Guney 2008: 홀 중심 77%. Byun: KD 중심 소수군. 홀 노드 처리에 민감 | ① difference factor/BDF(분화 강도, HHG 1987, Guney 2008) ② Seo 2003 저층/고층 RRA 비 ③ Ham 2017 평면형(동형류) 분포와 침실 접근 경로(DK·거실 경유 대 홀 경유) ④ 안방이 가장 깊은 침실인 비율(Seo 2007 89%) ⑤ 고리 비율 |
| O2 현관에서 얕은 깊이 | 현관 기준 평균 깊이 최소화 또는 현관–거실·중앙홀 1단계 | Seo 2007 "shallow syntax" 97%(direct), Seo 2003(중앙홀) | Ham 2017: 침실까지 깊이는 오히려 늘었음. 얕음만으로는 사생활이 깨짐 | ① 실별 통합도 순위 τ와 프로필 거리 ② difference factor ③ 공·사 섹터 깊이 순서(Amorim) ④ 평면형 분포(Ham) |
| O3 공·사 깊이 위계 | 침실·안방 평균 깊이 − 거실·DK 평균 깊이 최대화 | Ham 2017(direct), Amorim 1997(사적 섹터 항상 최심, direct), Seo 2007(안방 최원단), Jeong & Ban 2014(독립성, abstract) | 깊이 계열이라 O2와 중복 정보가 많음(Ostwald) | ① 거실 통합도 1위 여부와 τ ② Seo 2003 저층/고층 비 ③ 고리 비율 ④ IPD(Jiang) |
| O4 통제(control) | 거실 CV 최대화 | Ostwald 2011, Wu 2025(지표 사용만) | Ostwald 2011: "CV has relatively little to do with power or control". 한국 아파트 근거는 찾지 못함. 인접 그래프에서는 값이 부풀려짐(저장소 02번) | 깊이·통합 계열 전부(CV는 1단계 이웃 정보라 분리됨) |
| O5 순환성(ringiness·분포성) | 고리 수 또는 relative ringiness 최대화(또는 최소화) | Bafna 2003(정의, 2차), Guney 2008(지표), Femenías 87% 고리, Barkat·Kim & Kwak(트리 대 고리 유형) | 한국 아파트에서 방향(많을수록 좋은지)을 보인 문헌이 없음. 문 그래프 없이는 측정이 부정확함(저장소 06번) | 통합도 순위 τ, 깊이 위계, 평면형 분포 |
| O6(새) 서비스·습식 공간 주변화 | 저층(현관·욕실·발코니·다용도) 평균 RRA ÷ 고층(거실·침실·DK) 평균 RRA 최대화 | Seo 2003(direct, 75개 1.61~1.69, 시장 선택 해석) | 학술대회 논문 1편뿐. 공간 '수준' 분류를 AI 허브 라벨로 옮기는 규칙이 필요함 | 거실 단독 순위 τ, 공·사 깊이 차, Ham 평면형 |
| O7(새, 대조군) 전이공간(홀) 중심 또는 DK 중심 | 홀 또는 DK 통합도 최대화 | Guney 2008(홀 77%), Ham 2017(DK 경유 90.2%), Byun 2016(KD 1위 군집), Choi 2014(복도 최고) | 한국에서 DK 경유는 '접근 경로'이지 최다 통합과 같지 않음 | O1의 held-out 지표와 같음. **O1과 O7 중 어느 쪽이 실제 평면에 더 가까운지**가 RQ4의 판별력을 보여 줌 |
| O8 조합 | O1+O3, O2+O3, O1+O6 등 | — | 가중치 선택이 결과를 좌우함. 가중치 민감도 필요 | 조합에 쓰이지 않은 지표만 |

### 어느 목적에도 쓰지 않는 공통 비교 지표 (권장)
- **G1 평면형(그래프 동형류) 일치율**: 생성 평면의 현관 루트 접근 그래프가 실제 평면에 존재하는 동형류에 속하는 비율과 분포 차이. Ham 2017, Conroy Dalton & Kirsan 2008.
- **G2 최근접 실제 평면까지 그래프 편집 거리**. 저장소 06번이 보류한 지표이고, 이제 표본이 21,383세대라 의미가 생김.
- **G3 difference factor(BDF)의 분포 거리**. HHG 1987, Guney 2008. 입력 규약을 하나로 고정해야 함(지정 3공간 또는 최대·평균·최소 RA).
- **G4 기하 지표**: 실 면적비, 외기 접면 같은 공간구문 밖의 지표. 저장소의 기존 평가 모델 쪽.

### 구현 전에 정할 규약 (문헌 사이 차이)
1. **루트**: 외부(⊕) 노드를 넣을지(HHG, Ostwald, Guney, Byun의 Outdoor), 현관을 루트로 할지(Ham, Femenías). 둘 다 보고하는 것이 국외 관례임(HHG 1987, Guney 2008).
2. **통합도 척도**: 1/RRA로 통일하고, 비교할 문헌의 척도를 변환해서 표기.
3. **중앙홀·복도 노드**: Seo 2003은 거실에 트인 홀도 독립 볼록공간으로 봄. Choi 2014는 복도를 빼고 해석함. 결과(O1 대 O7)를 좌우함.
4. **그래프 종류**: 저장소의 인접 그래프는 문헌의 출입 그래프와 다름(Seo 2007, Lee et al. 2018). RQ1 결과를 문헌 수치와 비교할 때 이 차이를 밝혀야 함.

---

## 남은 미확인 항목
- **등재**
  - 모든 저널의 출판 연도 기준 등재 여부. MJL·JCR 이력을 로그인해서 확인해야 함.
  - Sustainability, Habitat International, J. Housing Built Env., Environment and Behavior, ASR, OHI, ICONARP의 현재 등재
  - KCI 논문 4편의 KCI 등재 여부
- **전문**
  - Bafna 2003, Hanson 1998, Park et al. 2024, Jeong & Ban 2014, Lee et al. 2018, Conroy Dalton & Kirsan 2008, Hillier & Hanson 1984의 식이 실린 쪽
- **원문 안의 불일치**
  - Choi 2014: 현관 1.2447 대 1.2097
  - Femenías: 58% 대 60%
  - Guney 2008: 부등호 한 곳
  - HHG 1987: H* 범위 표기
- **저장소 표기 수정 후보**
  - Choi 2014 쪽수 563–570 → 563–569
  - Ostwald 2011 등재 표기가 02번과 07번 문서에서 서로 다름

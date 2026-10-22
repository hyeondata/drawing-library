# Korean apartment unit-plan evaluation criteria that can be computed automatically on a generator result screen

Scope note: Statute text was checked against nepla.ai mirrors of law.go.kr, because law.go.kr pages do not render for the fetch tool. The versions seen were: 주택법 effective 2026-09-08, 주택법 시행규칙 effective 2026-08-04, 주택건설기준 등에 관한 규정 effective 2026-09-08, 피난·방화규칙 effective 2026-10-06, and 편의증진법 시행규칙 effective 2026-07-02. Anything marked **[UNVERIFIED]** comes from background knowledge and was not confirmed against a fetched source in this session.

## Area: 전용/공급/서비스면적, 국민주택규모, and legal room minimums

### Takeaway
전용면적 can be computed directly from geometry. Under 주택법 시행규칙 제2조제2호, it is the area inside the inner line of the exterior walls, minus shared space. The 85㎡ 국민주택규모 threshold (주택법 제2조제6호) is the most important legal badge to show. Korean law has **no minimum size for individual rooms** in apartments. The room-level rules that geometry can check are window-to-floor ratios (채광 1/10, 환기 1/20) and ceiling height of at least 2.1m.

### Cited Findings
- **주택법 제2조제6호:** "국민주택규모" means a 주거전용면적 of **85㎡ or less** per 호 or 세대. In 읍·면 areas that are outside the 수도권 and are not 도시지역, the limit is **100㎡** (version effective 2026-09-08). — [nepla.ai 주택법](https://www.nepla.ai/law/주택법)
- **주택법 시행규칙 제2조제2호 (공동주택):** 주거전용면적 is "외벽의 내부선을 기준으로 산정한 면적". Shared areas are excluded: (가) 복도·계단·현관 on above-ground floors, and (나) 지하층, 관리사무소 and other common areas. The exterior-wall area left over after subtracting 주거전용면적 from 바닥면적 is added to 공용면적. Article last amended 2018-04-02. — [nepla.ai 주택법 시행규칙](https://www.nepla.ai/law/주택법%20시행규칙)
- **Detached houses (단독주택) use a different basis.** They use 건축법 시행령 제119조제1항제3호 바닥면적, which is measured to the wall centerline. — [nepla.ai 주택법 시행규칙](https://www.nepla.ai/law/주택법%20시행규칙); [thewiki 면적](https://thewiki.kr/w/면적)
- **Balcony (노대) area rule since the 2005 amendment:** only the balcony area minus (length of the longest exterior wall the balcony touches × **1.5m**) counts toward 바닥면적. — [koreascience 2005 article](https://koreascience.kr/article/JAKO200574553031302.pdf); [qnaqc 질의회신](https://qnaqc.co.kr/product/%ec%98%a4%ed%94%bc%ec%8a%a4%ed%85%94%ec%9d%98-%eb%b0%9c%ec%bd%94%eb%8b%88-%ed%8f%ad%ec%9d%b4-2%eb%af%b8%ed%84%b0%ec%9d%b8-%ea%b2%bd%ec%9a%b0-1-5%eb%af%b8%ed%84%b0-%ec%b4%88%ea%b3%bc%eb%b6%80%eb%b6%84/). The current 건축법 시행령 제119조 text could not be fetched (the nepla page says the data is "not yet prepared").
- **"서비스면적" is industry jargon, not a legal term.** — [qnaqc](https://qnaqc.co.kr/product/%eb%b0%9c%ec%bd%94%eb%8b%88%eb%b3%b4%eb%8b%a4-%eb%8d%94-%eb%b0%94%ea%b9%a5%ec%aa%bd%ec%9c%bc%eb%a1%9c-%eb%8f%8c%ec%b6%9c%eb%90%9c-%ea%b2%bd%ec%82%ac%ec%a7%80%eb%b6%95%ec%9d%98-%eb%b0%9c%ec%bd%94/)
- **피난·방화규칙 제16조①:** 거실 반자높이 must be **≥2.1m**. If there is no 반자, it is measured to the underside of the beam or slab above. — [nepla.ai 피난·방화규칙 (2026-10-06)](https://www.nepla.ai/law/%EA%B1%B4%EC%B6%95%EB%AC%BC%EC%9D%98%20%ED%94%BC%EB%82%9C%E3%86%8D%EB%B0%A9%ED%99%94%EA%B5%AC%EC%A1%B0%20%EB%93%B1%EC%9D%98%20%EA%B8%B0%EC%A4%80%EC%97%90%20%EA%B4%80%ED%95%9C%20%EA%B7%9C%EC%B9%99/20261006)
- **피난·방화규칙 제17조①:** under 건축법 시행령 제51조, 채광 windows in a 거실 must be **≥1/10 of the room's floor area**. The exception is lighting that meets the illuminance standard. — same source
- **피난·방화규칙 제17조②:** 환기 openings must be **≥1/20 of the floor area**. The exception is a 기계환기장치 or a central air-conditioning system. — same source
- **주택건설기준 등에 관한 규정 sets no minimum room size.** Dimensional rules are delegated to 제13조 (기준척도) and a ministerial ordinance. Other unit-level numbers in the 규정:
  - 제14조 party wall: RC ≥15cm.
  - 제14조의2 slab: ≥210mm (150mm for 라멘구조); 경량·중량 impact sound ≤49dB.
  - 제18조 railing: ≥120cm (90cm in low-risk spots), baluster gap ≤10cm; windows on the 3rd floor and up need guards unless the sill is ≥110cm.
  - 제40조 electrical capacity: 3kW, plus 0.5kW for each 10㎡ over 60㎡.
  - 제43조: ≥2 taps per unit.
  - 제44조: exhaust for kitchen, bath and toilet.
  - Source: [nepla.ai 주택건설기준 등에 관한 규정 (2026-09-08)](https://www.nepla.ai/law/주택건설기준%20등에%20관한%20규정)
- **최저주거기준 (주거기본법; 국토부 공고, 2011 revision):** 1인 14㎡, 2인 26㎡, 3인 36㎡, 4인 43㎡. It requires a 전용 입식 부엌, a 수세식 화장실 and 목욕시설. Press describes 4인 as "43㎡에 방 3개". — [Pressian 2024](https://pressian.com/pages/articles/2024043011093266249); [아주경제 2011](https://www.ajunews.com/view/20110526000148); [fnnews 2021](https://www.fnnews.com/news/202108131035547566)

### Inferences
- **Area metrics that geometry can compute:**
  - (a) 전용면적 = area of the polygon inside the exterior walls' inner line, summing all rooms except balconies and shared space.
  - (b) 발코니 (서비스) area = balcony polygons. If the generator models a 1.5m-deep balcony zone along the facade, 서비스면적 ≈ facade length × 1.5m.
  - (c) 확장 후 실사용면적 = 전용 + 확장된 발코니.
  - (d) 공급면적 needs 주거공용 (stair/elevator/hall share), which a single-unit plan lacks. Show it only as an estimate, for example 전용 ÷ a typical 전용률 (~0.75–0.80 for 계단실형) **[UNVERIFIED typical ratio]**, or leave it out.
- **Badges:**
  - "국민주택규모 이하 (≤85㎡)".
  - Standard size class 59/74/84㎡ **[market convention, not legal]**.
  - "최저주거기준 n인 충족" from the 14/26/36/43㎡ table.
- **Per-room pass/fail checks for each 거실/침실:**
  - window area ÷ floor area ≥ 0.10 (채광);
  - openable area ÷ floor area ≥ 0.05 (환기; real apartments often meet it mechanically, so show it as a warning, not a fail);
  - ceiling height ≥ 2.1m, if height is modelled.
- **Room-size thresholds are not law.** Any such threshold (for example a bedroom ≥ 2.4m short side) must be labelled a design guideline.

### Gaps
- The verbatim current 건축법 시행령 제119조제1항제3호 (노대 1.5m rule) and 제46조제4항 (대피공간: **[UNVERIFIED]** ≥2㎡ per unit, or ≥3㎡ when shared by adjacent units) could not be fetched. Both should be checked on law.go.kr.
- 주택건설기준 등에 관한 규칙 (기준척도) was not fetched.
- I found no official ratio from 전용 to 공급, and no legal definition of 서비스면적.

## Bay count, cross ventilation, south orientation, sunlight, 판상형 vs 타워형

### Takeaway
"Bay" is an industry term with no statutory basis. It means the number of habitable rooms (거실 plus bedrooms) lined up along the front, usually south, balcony facade. It can be computed exactly from geometry. 4-bay 판상형 south-facing units are clearly the market favourite. 맞통풍 (openings on opposite facades) and orientation can also be computed. The 일조 standard (winter solstice, 2 consecutive hours or 4 hours total) is case law, not statute, and needs site and neighbour context.

### Cited Findings
- **Definition of 베이:** a bay is a space between columns along the front balcony. A plan where the living room and 3 rooms touch the front is 4-bay. 2-bay means 거실 + 안방 on the front, 3-bay adds one small room, 4-bay adds two. — [lawtalk 2/3/4베이](https://www.lawtalk.co.kr/posts/87813); [brunch "4베이 선호 뚜렷"](https://brunch.co.kr/@2002cta/4471)
- **판상형 vs 타워형:**
  - 판상형 is a slab block, mostly south-facing, with good daylight. The living room and kitchen face each other, which favours cross ventilation.
  - 타워형 groups units around a core. It is space-efficient and gives better views, but often cannot cross-ventilate and is limited in how much faces south.
  - Source: [다음 "판상형 VS 타워형"](https://v.daum.net/v/t4vP9BwMep); [lawtalk](https://www.lawtalk.co.kr/posts/87813)
- **4-bay trade-offs:**
  - Pros: every room gets sun, heating bills are lower, and room area per 전용 is larger.
  - Cons: individual rooms are narrower, and ventilation suffers if windows are only on the sunny side.
  - Source: [lawtalk](https://www.lawtalk.co.kr/posts/87813)
- **Orientation:** in a 4-bay plan, 동남향 relies on morning sun, and 서남향 is said to favour 일조. — [경향신문 2017](https://www.khan.co.kr/article/201701222109025/amp)
- **Market evidence:**
  - 청주 푸르지오 씨엘리체, 84㎡: the 4-bay 판상형 A type averaged 17.28:1, while the 2-bay 타워형 B and C types averaged 5.65:1 and 4.09:1. This is a single complex. — [brunch](https://brunch.co.kr/@2002cta/4471)
  - Press notes the 남향 preference and the trend toward 채광·통풍 design. — [뉴시스 2020](https://mobile.newsis.com/view/NISX20200417_0000997686)
- **Academic evidence:** 3-bay 국민주택규모 plans were rated more satisfying than 2-bay plans by parent households. — summarized in [earticle search results](https://www.earticle.net/Article/A132676) (not independently verified)
- **일조 수인한도 (case-law practice):** a shortfall may be an infringement if, on the winter solstice, there are fewer than **4 hours total between 08:00 and 16:00** or fewer than **2 consecutive hours between 09:00 and 15:00**. Several sources say it counts when both tests fail. The doctrine of 수인한도 starts with 대법원 1999.1.26. 98다23850. — [머니투데이 2017](https://www.mt.co.kr/society/2017/03/19/2017031613562244010); [lawtalk](https://www.lawtalk.co.kr/posts/169743); [부산고법 2004나19678](https://www.nepla.ai/case/부산고법/2004나19678)
- **일조확보율 is a statutory rating item.** 주택법 제39조 lists "조경·일조확보율·실내공기질·에너지절약 등 환경 관련 등급" as one of the 공동주택성능등급 categories. — [nepla.ai 주택법](https://www.nepla.ai/law/주택법)

### Inferences
- **Bay count algorithm:**
  - Take the facade (exterior wall edge) that faces closest to south, or that has the balcony.
  - Count the distinct habitable rooms (거실 + 침실; 주방 excluded) whose exterior-window edge lies on that facade.
  - Report "n-bay". When 주방/식당 also reaches that facade, a ".5" is used informally (e.g. "4.5베이") **[UNVERIFIED convention]**.
- **맞통풍:**
  - Unit level: true if the unit has openable windows on two facades whose outward normals differ by ≥ ~135°, roughly front and back.
  - Stronger version: there is a door-connected path from window A to window B through 거실/주방. In the Korean 판상형 sense this is the 거실 ↔ 주방 back-window axis.
  - Report it at unit level and per room (a room with windows on two walls has 2-sided ventilation).
- **Orientation:**
  - Facade azimuth of the main 거실 window: 남향 = within ±22.5° of 180°; 남동/남서 = within ±67.5°.
  - Show the percentage of habitable-room window area facing S/SE/SW.
- **Solstice sun-hours:** a simple unobstructed calculation is possible from latitude (Seoul ≈37.5°N) and facade azimuth. Real 일조 compliance needs neighbouring buildings, so label it "무장애물 가정 동지 일조시간" and compare it to 2h consecutive / 4h total.
- **판상형 vs 타워형:** a single-unit proxy is classification by number of exterior facades and their angles. One long front facade plus a back facade means 판상형-type. Two adjacent facades at about 90° (corner) or a non-orthogonal shape means 타워형-type. **[heuristic, not standard]**

### Gaps
- No LH/SH official weighting of bay count or 맞통풍 was found.
- No statutory definition of "베이" or "4.5베이" was found.
- I did not get the original text of the 판례 that fixes the 2h/4h figures; the press calls it practice.

## Circulation, zoning, privacy, storage, bathrooms, and published scoring systems

### Takeaway
Korea has no statutory "plan quality score". The closest official framework is the **공동주택성능등급**:
- 주택법 제39조 sets 5 categories: 소음, 구조 (가변성·수리용이성), 환경 (일조확보율 etc.), 생활환경 (사회적 약자 배려 etc.) and 화재·소방.
- It is run through 녹색건축 인증.
- It mostly covers building performance, not layout quality.

Circulation, zoning and privacy metrics have to come from academic graph-based analysis (space syntax and adjacency). They can be computed from room polygons and doors, but the thresholds are design heuristics, not standards.

### Cited Findings
- **주택법 제39조 (version effective 2026-09-08):** a 사업주체 supplying at least the number of units set by 대통령령 must obtain grades under 녹색건축물 조성 지원법 for these categories and show them in the 입주자 모집공고. — [nepla.ai 주택법](https://www.nepla.ai/law/주택법)
  1. 경량충격음·중량충격음·화장실소음·경계소음 등 소음
  2. 리모델링 등에 대비한 가변성 및 수리 용이성 등 구조
  3. 조경·일조확보율·실내공기질·에너지절약 등 환경
  4. 커뮤니티시설, 사회적 약자 배려, 홈네트워크, 방범안전 등 생활환경
  5. 화재·소방·피난안전 등 화재·소방
- **History of the scheme:**
  - 2014 regulation draft: 54 items (소음 5, 구조 6, 환경 23, 생활환경 14, 화재·소방 6).
  - Mandatory items in that draft: 충격음 차단성능, 가변·수리 용이성, 생태면적, 사회적 약자 배려, 화재감지 및 경보설비.
  - Threshold of 1,000+ units in the 2014 amendment; it was 2,000+ in 2006.
  - Merged into 녹색건축 인증 in February 2013.
  - Source: [한국경제 2014](https://www.hankyung.com/amp/2014062456775); [CERIK 주택성능등급표시제도의 발전 방안](https://www.cerik.re.kr/report/issue/805)
- **The 주택건설기준 등에 관한 규정 still has 제58조 (성능등급 표시)** and 제65조의2 (장수명 주택 grades). — [nepla.ai 주택건설기준 규정](https://www.nepla.ai/law/주택건설기준%20등에%20관한%20규정)
- **Academic method:** analyzing plans by 단위공간 간 공간관계 and 기능동선 (이성재, 대한건축학회연합논문집 10(3), 2008). — [earticle A76100 / search results](https://www.earticle.net/Article/A76100) (exact article mapping not verified)

### Inferences
Proposed computable metrics. All thresholds are design heuristics, not standards.
- **동선 (circulation)**
  - Build a door-adjacency graph and room centroids.
  - Report shortest walking distance along the door graph (or a medial-axis path) for 현관→주방, 현관→거실, 주방→거실/식당, 안방→안방욕실, and 침실→공용욕실.
  - Show the absolute metres and, optionally, the ratio to √전용면적 to normalise.
- **Space-syntax depth**
  - Step depth from 현관 to each room.
  - Mean depth and integration of public rooms (거실, 주방) versus private rooms (침실).
  - Good zoning means public rooms are shallow and private rooms are deep.
- **공·사 영역 분리 (zoning)**
  - Classify rooms as public (현관, 거실, 주방, 식당, 공용욕실) or private (침실, 안방, 드레스룸, 안방욕실).
  - Score 1: whether a private room is reachable only through public rooms in a way that passes through 거실. A bedroom door opening straight into 거실 is common in Korea and acceptable.
  - Score 2: how many bedrooms are visible or reachable directly from 현관 (penalise).
  - Score 3: how spatially clustered the private rooms are (e.g. on one side of the 거실).
- **안방 privacy**
  - 안방 depth from 현관 should be ≥ 2 steps.
  - 안방 should not be adjacent to 현관.
  - 안방 should have an attached bath and/or dressing room (boolean).
- **Storage**
  - Total area of rooms tagged 드레스룸 / 팬트리 / 붙박이장 / 현관수납 / 다용도실, as a share of 전용.
  - Built-in closet length if it is modelled.
- **Bathrooms:** count, plus the bathroom-to-bedroom ratio.
- **가변성 (only indirect geometric hint)**
  - Share of interior walls that are non-load-bearing, if the generator distinguishes them.
  - Whether a column/rahmen structure is used, which relates to the 구조 성능등급 "가변성".

### Gaps
- I found no published LH/SH numeric "평면 평가표" with weights for 동선 or zoning in this session. LH 설계기준 documents were not retrieved.
- 녹색건축 인증 공동주택 심사기준 item-level scoring (e.g. 일조, 사회적 약자 배려) was not fetched.
- The KCI paper that defines a 아파트 평면 평가 index with weights was not identified.

## Accessibility (무장애 / 사회적 약자 배려)

### Takeaway
The legal basis is 장애인·노인·임산부 등의 편의증진 보장에 관한 법률 시행규칙 별표 1 (current version effective 2026-07-02). 사회적 약자 배려 is also a 주택법 제39조 생활환경 rating item. The commonly cited figures (door clear width 0.9m, 1.5m wheelchair turning circle, threshold ≤2cm) are standard in Korean BF practice. They could **not** be verified from the fetched text in this session, so treat them as provisional until checked against 별표 1.

### Cited Findings
- **Current version of the 시행규칙:** 보건복지부령 제1166호, 2026-04-01 amendment, effective 2026-07-02. The 별표 1 text is published only as HWP/PDF. — [nepla.ai 편의증진법 시행규칙](https://www.nepla.ai/law/장애인ㆍ노인ㆍ임산부%20등의%20편의증진%20보장에%20관한%20법률%20시행규칙)
- **별표 1 figures confirmed in secondary sources:**
  - 접근로 유효폭 ≥1.2m (2023-12-11 version, per nepla wiki).
  - Elevator front 활동공간 ≥1.4m × 1.4m (per qnaqc).
  - Source: [nepla 유권해석 별표1](https://www.nepla.ai/wiki/복지와-건강/사회복지/-유권해석-장애인-노인-임산부-등의-편의증진-보장에-관한-법률-시행규칙-별표-1-편의시설의-구조·재질등에-관한-세부기준-제2조제1항관련-1509xgx0mnol); [qnaqc](https://qnaqc.co.kr/product/%ec%97%ac%eb%8b%ab%ec%9d%b4%eb%ac%b8%ec%9d%98-%ec%9e%a5%ec%95%a0%ec%9d%b8-%ed%99%9c%eb%8f%99%ea%b3%b5%ea%b0%84%ed%99%95%eb%b3%b4-%ec%8b%9c-600%ec%9d%98-%ea%b8%b0%ec%a4%80%ec%a0%90_2026-01-08/)
- **"사회적 약자 배려" is a 생활환경 성능등급 item (주택법 제39조 제4호).** It was mandatory in the 2014 draft. — [nepla.ai 주택법](https://www.nepla.ai/law/주택법); [한국경제 2014](https://www.hankyung.com/amp/2014062456775)

### Inferences
Checks that geometry can compute; thresholds are provisional.
- Door clear width ≥0.9m on each door on the 현관→거실→bath→one-bedroom path. **[UNVERIFIED figure]**
- A 1.5m-diameter turning circle (1.4m as a fallback) fits inside 현관, the bathroom and the kitchen. Test whether the largest inscribed circle of the room polygon minus fixtures is ≥0.75m in radius.
- Corridor clear width ≥1.2m (borrowing the 접근로 figure; a heuristic for in-unit corridors).
- Step-free path from 현관 to the main rooms. Needs floor levels; a 현관 step is normal in Korean units, so report it separately.
- Show this as a "무장애 적합도" panel (n of m checks passed), not as legal compliance, because 편의증진법 별표 1 mainly governs public/common facilities and 장애인 전용 units, not every private unit **[UNVERIFIED scope]**.

### Gaps
- Exact 별표 1 numbers for doors, turning space and thresholds were not retrieved (they are HWP/PDF only).
- LH 고령자·무장애 주택 design guideline values were not retrieved.
- 녹색건축 "사회적 약자 배려" scoring details were not retrieved.

---

### Prioritized list for the result screen (synthesis; see the sections above for the sources)
| Priority | Criterion | Computable from geometry? | Basis |
|---|---|---|---|
| 1 | 전용면적 (inner line of exterior walls) + 국민주택규모 ≤85㎡ badge | Yes | 주택법 §2(6); 시행규칙 §2(2) |
| 2 | Bay count (habitable rooms on the main/south facade) | Yes (facade and window edges) | Industry convention |
| 3 | Room 채광 ratio ≥1/10 and 환기 ≥1/20 (pass/fail per 거실/침실) | Yes (window lengths × assumed height) | 피난·방화규칙 §17 |
| 4 | 맞통풍 (openings on opposite facades / through-path) | Yes | Industry convention; 판상형 rationale |
| 5 | Main orientation and % of window area facing S | Yes (needs north arrow) | Market preference; 일조확보율 (주택법 §39) |
| 6 | 발코니/서비스면적 and 확장 후 실사용면적 | Yes | 건축법 시행령 §119 (1.5m rule, to be confirmed) |
| 7 | 동선 distances (현관→주방/거실) and depth graph | Yes (doors) | Academic heuristic |
| 8 | 공·사 zoning and 안방 privacy (depth, adjacency) | Yes | Academic heuristic |
| 9 | Storage area %, bathroom count / bedroom ratio | Yes (room labels) | Market heuristic |
| 10 | Unobstructed solstice sun-hours vs 2h/4h | Partly (no neighbours) | Case law |
| 11 | 무장애 checks (door width, turning circle) | Yes | 편의증진법 별표1 (figures to be confirmed) |
| 12 | 최저주거기준 occupancy (14/26/36/43㎡) | Yes | 주거기본법 / 국토부 공고 |
| — | Ceiling height ≥2.1m | Only if 3D height is modelled | 피난·방화규칙 §16 |
| — | 공급면적, 판상형/타워형, noise, structure | No / proxy only | Needs building context |

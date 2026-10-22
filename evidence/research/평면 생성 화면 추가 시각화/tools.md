# What commercial generative-design / layout tools show on their result screens

Scope: Finch, Maket.ai, Archistar, TestFit, Autodesk Forma (formerly Spacemaker), Hypar, Snaptrude, ARCHITEChTURES, plus Korean tools 텐일레븐 빌드잇 (BUILDIT) and 스페이스워크 랜드북. Research date: 2026-10-23. Where a claim comes from a third-party aggregator or vendor marketing, that is noted.

## Q1. What metrics, KPIs, overlays, checks and live controls does each tool display?

### Takeaway
Almost every tool shows a live **area tabulation**: GFA/GIA/NIA, net-to-gross efficiency, unit count and unit mix, plus FAR and coverage. Each tool then adds one specialty layer. Finch has a match/fit score and priority sliders. TestFit has a tabulation with formulas and a pro forma. Forma has sun-hour and daylight (VSC) heatmaps. Snaptrude shows target-vs-achieved area with colour-coded deviation. BUILDIT checks sunlight and view for every unit. ARCHITEChTURES estimates cost and profit. Most tools also flag conflicts or compliance problems inline.

### Cited Findings

**Finch (finch3d)**
- The unit mix screen shows three metrics under the plan: **Match Score** ("how closely the result matches your target mix"), **Fit** (floor area vs. mix, given as a tolerance such as ±30 m²) and **Unique Units** (flags duplicate units for smart-copy) — [Finch docs: Generating Unit Mix](https://docs.finch3d.com/finch-101/finch-101-generating-unit-mix)
- The Programs drawer shows the total number of generated units and a breakdown of unit sizes and their locations. The docs' example is "16 apartments total, with a 50/50 mix of 75 m² and 95 m² units" — [Finch docs](https://docs.finch3d.com/finch-101/finch-101-generating-unit-mix)
- **Priority sliders** for Unit Mix, Size Metric, Grid Lines, Daylight Access, and Squareness & Adjacencies, each with a tooltip. Finch re-iterates whenever the mix percentages change — [Finch docs](https://docs.finch3d.com/finch-101/finch-101-generating-unit-mix)
- Auto-generated metrics: GFA, GIA, NIA and usable floor area. Iterative plans are "scored against multiple competing weightings", and one figure caption lists daylight, CO2 efficiency, compliance and adaptivity scores — [AEC Magazine, "Finch untethered", Dec 2024 / upd. Jan 2025](https://aecmag.com/technology/finch-untethered/)
- **Conflict explanations**: Finch flags unit combinations that conflict with the building framework, such as oversized units or too many stairwells, and shows the reason, so the user does not have to find it by trial and error — [AEC Magazine](https://aecmag.com/technology/finch-untethered/)
- A reseller page lists live KPIs: total floor area, daylight access, CO2 footprint and material usage — [Nordic BIM (reseller)](https://www.nordicbim.com/knowledge/finch-generativ-design-by-ai)

**TestFit**
- Marketing covers testing "zoning, unit mixes, and parking ratios". A customer quote mentions seeing "the cost of yield, number of units, square footage". Other listed features: automatic takeoffs for parking, infrastructure and earthwork, cut/fill validation, a **Pro Forma add-on** ("Live-link pro forma financials directly to your site plan"), Site Intelligence data layers, real-time comparison of design schemes, shareable live feasibility reports, and export to Excel/PDF/CAD/Revit — [testfit.io](https://www.testfit.io/)
- Tabulation formulas from the help center (via search snippet; the page now redirects to the in-app knowledge base):
  - EFF% = net rentable SF ÷ gross SF ("gross-to-net ratio")
  - NRSF = unit area + balcony area (balconies only counted when toggled on)
  - gross conditioned SF = NRSF + common + stair + lift + amenity + back-of-house
  - average unit size = unit conditioned SF ÷ unit count
  - [TestFit: How Tabulation Metrics Are Calculated](https://support.testfit.io/knowledge/tabulation-metrics-calculated)
- The output panel page defines efficiency the other way round (gross ÷ net), so TestFit's own docs are **inconsistent** — [TestFit: Output panel](https://support.testfit.io/knowledge/output-panel)
- An **extended tabulation** breaks area take-offs down per floor and in total, and is exported to CSV/PDF — [TestFit support (search snippet)](https://support.testfit.io/knowledge/tabulation-metrics-calculated)

**Autodesk Forma (Spacemaker → Forma; now split into Forma Site Design and Forma Building Design)**
- Analyses:
  - **Sun hours** on the ground and on façades
  - **Daylight potential** based on Vertical Sky Component (VSC), to find areas with too little or too much daylight
  - **Area metrics** ("evaluate how design decisions impact your project scope")
  - Autodesk says these analyses were benchmarked against engineering consultancies
  - [Autodesk Forma environmental analysis](https://www.autodesk.com/products/forma/environmental-impact-analysis)
- The area metrics panel shows footprint, building coverage, GFA and net internal area by function. Users can define **custom metric functions**, e.g. from rentable area, GFA and building coverage. A Units tab gives an overview of unit types — [Autodesk tutorial: Area metrics in Forma](https://www.autodesk.com/learn/ondemand/tutorial/area-metrics-in-forma); [Creating housing units](https://www.autodesk.com/learn/ondemand/tutorial/creating-housing-units)
- Forma Building Design launched in April 2026. A July 2026 update added **unit-level GFA** with per-unit function breakdowns, usable in default and custom metrics and in floorplan and 3D visuals. It also added stair **conflict highlighting** (stairs turn yellow) and section slicing — [Autodesk Forma blog, 2026-07-13](https://blogs.autodesk.com/forma/2026/07/13/whats-new-in-forma-building-design-stairs-section-slicing-and-unit-level-gfa/)
- Forma Board is described as a design review board that brings "ideas, metrics, visuals, and feedback together" — [Forma for Buildings](https://www.autodesk.com/products/forma-for-buildings)

**Snaptrude**
- **Area Analysis Dashboard**:
  - compares target areas from Program Mode with the areas achieved in the model
  - toggles between Net (carpet) and Gross (built-up) area
  - breaks results down by department, storey or label
  - can overlay targets on the model
  - shows **ring or bar charts**
  - **colour-codes deviations** at an adjustable threshold (default ±5%)
  - [Snaptrude blog: Do your design forms match the area](https://snaptrude.com/blog/do-your-design-forms-match-the-area-heres-how-to-be-sure); [Snaptrude help: Program mode](https://help.snaptrude.com/en/articles/11154579-about-program-mode)
- Other live features:
  - GFA, FAR, built-up area, carpet area and open-space ratios update while drawing
  - area statements auto-update in tables (residential, commercial, circulation, services)
  - zoning compliance flags elements that exceed FAR, setback, coverage or height limits
  - total construction cost is recalculated on every change, with BOQ export to Excel
  - solar analysis covers daylight, glare and shading
  - [Snaptrude blog, July 2025](https://www.snaptrude.com/blog/snaptrude---real-time-feasibility-engine-for-data-driven-design)

**Hypar**
- Turns program inputs (room counts, areas, departmental groupings) into floor plan options and tracks areas as you plan. A third-party listing says live metrics include area, efficiency, density and space counts, that multiple layouts per brief are available on paid plans, and that clearance conflicts can be flagged — [aitoolsexplorer (aggregator, lower reliability)](https://aitoolsexplorer.com/ai-tools/hypar-architecture-software/); background on the late-2024 relaunch focused on space planning: [AEC Magazine: Hypar 2.0](https://aecmag.com/features/hypar-2-0/)

**Archistar**
- Architect pages say it generates "hundreds of concept designs" across 10+ typologies, creates floorplates with egress and compliance rules, and lets users adjust targets for unit mix, sunlight or ventilation, with "metrics such as unit mix … automatically re-adjust[ing] as you edit" — [archistar.ai/for-architects](https://www.archistar.ai/for-architects/page/17)
- **2026 positioning shift**: the homepage now leads with permit compliance (AI PreCheck, formerly eCheck). Checks against code and zoning return instant pass/fail results with standardized visual reports, and an analytics dashboard shows pass/fail rate patterns. The homepage no longer mentions generative feasibility metrics — [archistar.ai](https://www.archistar.ai/)

**ARCHITEChTURES**
- Tests hundreds of unit-mix scenarios to maximize **sellable area** while keeping livability standards. Its profitability analysis weighs:
  - unit sale price, construction cost and product mix
  - floor height, natural lighting and orientation, and ventilation quality
  - a penalty for deviating from the target product mix
  - Vendor case study: the best option beat the worst by over €1M, and exploring alternatives raised operating profit 179% (self-reported) — [ARCHITEChTURES blog: real-estate profitability](https://architechtures.com/en/blog/posts/real-estate-profitability)
- A "Measurements and Costs" module integrates cost estimation — [ARCHITEChTURES BIM+AI blog](https://architechtures.com/en/blog/posts/ai-bim)

**Maket.ai**
- Residential only. A chat flow collects floors (1–4), area, layout shape and rooms, then generates **four candidate plans** with dimensions, doors, windows and furniture. Users can regenerate with the same inputs — [Maket: how to use Maket as a home builder](https://www.maket.ai/blog/how-to-use-maket-as-a-home-builder); [Maket floorplan generator post](https://www.maket.ai/post/makets-floorplan-generator-maximizing-design-efficiency)
- A third-party article says plans include room labels and area calculations. Listings also mention a "Regulatory Assistant" that answers compliance questions about uploaded documents (unverified) — [archgyan (third party)](https://archgyan.com/maket-ai-floor-plan-generation-residential/)
- Maket itself warns that plans "may occasionally contain errors or produce non-functional layouts" — [Maket blog](https://www.maket.ai/blog/how-to-use-maket-as-a-home-builder)

**텐일레븐 빌드잇 (BUILDIT, Korea)**
- When a building is moved, the number of floors, 용적률 (FAR) and 총 세대수 (total units) are recalculated automatically. **Sunlight and view for every unit (모든 세대의 조망·채광)** can be checked automatically. Users can enter conditions such as minimum average sunlight hours and 수인한도 만족도 (how well sunlight-tolerance limits are met). The tool is used for local design-review topics: view, skyline, sunlight, 인동거리 (spacing between buildings), coverage, FAR and unit count — [벤처스퀘어 interview, 2024-12-13](https://www.venturesquare.net/950494/)
- Outputs include reports on sunlight per unit, FAR and unit count, plus CAD drawings and 3D visualization. BUILDIT Pro is a 3D editor for the generated results that respects building codes — [POSCO newsroom (KR)](https://newsroom.posco.com/kr/제17회-포스코-아이디어-마켓-플레이스-수상-기업을-만/); [POSCO newsroom (EN)](https://newsroom.posco.com/en/posco-imp-teneleven)
- Reported result: in the LH 망우1구역 project it added 134 units while minimizing loss of sunlight to a nearby school (claimed value about ₩93.8B). It reportedly processes 1,000 units in 30 minutes, versus about 5 days before — [벤처스퀘어](https://www.venturesquare.net/950494/)

**스페이스워크 랜드북 (Landbook, Korea)**
- Enter an address and Landbook shows parcel information, generates a code-compliant massing (allowable area and height) and presents **profitability figures** such as rental yield, based on big data — [세계일보 2018](https://www.segye.com/newsView/20181125001702); [머니투데이 2022](https://www.mt.co.kr/future/2022/01/07/2021123009040197426); [SNU CSE notice](https://cse.snu.ac.kr/en/community/notice/18655)

### Inferences
- The common baseline result screen has four parts: an area/efficiency tabulation, a unit-mix breakdown, a regulatory metric set (FAR, coverage, height) and conflict or compliance flags.
- The project's generator has formula cards and sensitivity charts, but probably lacks these elements that commercial tools treat as standard:
  - a **target-vs-achieved** view (Finch Match/Fit; Snaptrude ±5% colour deviation)
  - a **net/gross efficiency** ratio with its formula stated
  - **per-unit environmental overlays**, such as sun hours or VSC heatmaps (Forma) and per-unit sunlight/view checks (BUILDIT)
  - **explanations of conflicts or infeasibility** (Finch, Forma stairs, Snaptrude zoning flags)
- Live priority sliders that re-run generation (Finch) are a close parallel to the project's existing variable sensitivity chart. Linking the slider to live KPI updates would match how the industry presents these controls.
- For a Korean apartment context, BUILDIT's metric set is the most locally relevant: per-unit sunlight hours, 수인한도 (sunlight tolerance), view, 인동거리, FAR and unit count.

### Gaps
- I found no official source for the exact on-screen layout of Hypar or Archistar's generative results. The Hypar details come from an aggregator.
- I found no evidence of **radar or spider charts** in any of these tools' official docs.
- TestFit's efficiency definition conflicts between two of its own help pages. The help center pages now redirect to an in-app knowledge base, so I could not verify them directly.
- The Spacemaker → Forma rename (2023) is background knowledge. None of the fetched pages state it explicitly.
- I could not verify Landbook's current (2026) UI. Its sources date from 2018–2022.

## Q2. How do they present trade-offs among multiple generated options?

### Takeaway
None of the sources show Pareto plots. Comparison is mostly **side-by-side synchronized views** (Forma Compare, up to 6), **scheme-to-scheme metric comparison** (TestFit, Snaptrude) or **ranking by a single score or profit figure** (Finch Match Score, ARCHITEChTURES profitability). Galleries of a few candidates (Maket shows 4) are common in consumer tools.

### Cited Findings
- **Forma Compare panel**:
  - select saved proposals or analyses from history
  - view them side by side on canvas, up to **six**
  - zooming and panning are synchronized across scenes
  - [Autodesk tutorial: Compare analysis with Forma](https://app.gnosis-mfe.autodesk.com/learn/ondemand/tutorial/compare-analysis-with-forma)
- A Forma forum thread says area metrics and design intent comparison were added to Compare. One user reports metrics don't appear for proposals unless an analysis has been run (user report, not official) — [Autodesk forum](https://forums.autodesk.com/t5/forma-forum/feature-to-compare-metrics/m-p/12477748)
- Autodesk Insight (not Forma) offers dashboards that compare energy and carbon across options with targets and filters. This is a separate product — [Autodesk Insight dashboards course](https://www.autodesk.com/learn/ondemand/course/design-performance-and-sustainability-with-autodesk-forma-revit-and-insight/unit/4O5UP7T7qbvauO1c1nOPgm)
- TestFit lets users "compare design schemes with real-time deal prototyping" and "show clients multiple site options" — [testfit.io](https://www.testfit.io/)
- In Snaptrude's developer example, the user compares "yield potential, construction costs, and daylight access across all options" for three sites. The comparison interface itself isn't described — [Snaptrude blog](https://www.snaptrude.com/blog/snaptrude---real-time-feasibility-engine-for-data-driven-design)
- Finch shows the unit-mix variations that meet the criteria, scored against "multiple competing weightings". Enterprise users see two result sets (custom dataset vs. generic) — [AEC Magazine](https://aecmag.com/technology/finch-untethered/)
- ARCHITEChTURES frames its trade-off as profitability across options (best vs. worst > €1M) — [ARCHITEChTURES blog](https://architechtures.com/en/blog/posts/real-estate-profitability)
- Maket generates four plans per run, shown as candidates to choose from — [Maket post](https://www.maket.ai/post/makets-floorplan-generator-maximizing-design-efficiency)

### Inferences
- Synchronized side-by-side views (Forma) and sortable or comparable metric tables are the industry pattern. A Pareto scatter or radar chart would set the project apart from commercial tools rather than copy them, and is well suited to an explanatory or research tool.
- A per-candidate "why it ranked here" explanation is rare. Finch's conflict reasons come closest.

### Gaps
- I found no official confirmation of sortable candidate tables in TestFit, Finch or Archistar. The screen UI isn't documented in the fetched pages.

## Q3. Which features do their marketing and docs emphasize as most valued by users?

### Takeaway
Marketing stresses three things: **speed** (days to minutes), **yield and profitability** (more units, more sellable area, a linked pro forma) and **compliance confidence**. Sunlight and daylight is the main quality metric, especially in Korea and the Nordics.

### Cited Findings
- TestFit: a live-linked pro forma, yield/units/SF visibility, and showing clients multiple options — [testfit.io](https://www.testfit.io/)
- BUILDIT: +134 units on a real LH project while protecting a school's sunlight. 1,000 units in 30 minutes vs. 5 days. Feasibility review in under an hour instead of 5+ days — [벤처스퀘어](https://www.venturesquare.net/950494/); [Asia Economy 2021](https://view.asiae.co.kr/en/article/2021011110304319465)
- ARCHITEChTURES: 179% operating profit increase (self-reported case study) — [ARCHITEChTURES blog](https://architechtures.com/en/blog/posts/real-estate-profitability)
- Archistar: up to 55% reduction in permit review cycles and 90% first-submission quality. The company has repositioned around compliance checking — [archistar.ai](https://www.archistar.ai/)
- Forma: environmental analyses (sun, daylight, wind, noise) validated against engineering consultancies. A 2026 update closed the metrics gap between Site Design and Building Design that users had asked about — [Autodesk Forma analysis page](https://www.autodesk.com/products/forma/environmental-impact-analysis); [Forma blog 2026-07](https://blogs.autodesk.com/forma/2026/07/13/whats-new-in-forma-building-design-stairs-section-slicing-and-unit-level-gfa/)
- Snaptrude: real-time feasibility, with area, cost and compliance updating on every edit — [Snaptrude blog](https://www.snaptrude.com/blog/snaptrude---real-time-feasibility-engine-for-data-driven-design)

### Inferences
- For an apartment plan generator, the features most likely to be valued are:
  - a live KPI strip: unit count, exclusive area (전용면적), efficiency (전용률), FAR and coverage
  - per-unit sunlight and view indicators
  - target-vs-achieved deviation
  - compliance pass/fail with reasons
- Cost and profit estimates are valued by developer-facing tools but need market data to be credible.

### Gaps
- All of the marketing figures above are vendor-reported. I found no independent user surveys ranking which result-screen features users value most.

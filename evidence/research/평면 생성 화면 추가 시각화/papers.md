# How floor-plan generation papers present and explain results (metrics, figures, visualizations)

Scope: what academic floor-plan generators show readers and users, and which of those items a browser-based QUBO apartment-plan tool could compute for one plan or a candidate set. Primary sources (full texts) were read for House-GAN, House-GAN++, HouseDiffusion, Graph2Plan, Tell2Design, MaskPLAN, iPLAN, GSDiff (which benchmarks WallPlan), Merrell et al. 2010, Wu et al. 2018 (MIQP), GPLAN (Shekhawat group), and FloorPlan-LLaMa. I could not open the full texts of the RPLAN paper (Wu et al. 2019) or the WallPlan paper, so those two are covered only second-hand.

## Q1. What do the key papers display (graph overlays, color legends, constraint tables, FID/GED/compatibility, area error, user edits)?

### Takeaway
The learning-based papers (House-GAN → HouseDiffusion) report the same three metrics: Realism (paired user study), Diversity (FID on color-coded rasterized plans) and Compatibility (graph edit distance between the input bubble diagram and a graph rebuilt from the output). Their figures pair each input bubble diagram with plans in a fixed room-type color legend, sometimes with edges colored correct, missing or extra. Optimization-based papers (Merrell 2010, Wu 2018 MIQP, GPLAN) instead show the cost or constraint terms, a leave-one-term-out ablation figure, dimension labels on rooms, and constraint-count and runtime tables.

### Cited Findings
**House-GAN (Nauata et al., ECCV 2020)** — [arXiv 2003.06988](https://arxiv.org/abs/2003.06988)
- The input is a bubble diagram: a node per room with a room-type property. In ground truth, two rooms count as connected when the Manhattan distance between their bounding boxes is under 8 pixels. The output is a set of axis-aligned room boxes. — [House-GAN](https://arxiv.org/abs/2003.06988)
- Results are grouped by room count (1–3, 4–6, 7–9, 10–12, 13+), with k-fold validation that excludes the group being tested. — [House-GAN](https://arxiv.org/abs/2003.06988)
- **Realism** is an average user rating from paired comparisons: better (+1), worse (−1), equally-good (+1), equally-bad (−1). It was run with 12 graduate students and 10 professional architects, each judging 75 pairs. Results are shown as a pairwise score-difference matrix, one for students and one for architects; a difference of 2.0 means one method always won. — [House-GAN](https://arxiv.org/abs/2003.06988)
- **Diversity** is FID on rasterized layouts. Each layout is drawn on a white background with rooms painted largest-first, each room filled with its room-type color. The test samples 5,000 bubble diagrams × 10 variations per group. — [House-GAN](https://arxiv.org/abs/2003.06988)
- **Compatibility** is the graph edit distance between the input bubble diagram and the bubble diagram rebuilt from the output with the same adjacency rule. The paper calls it "computationally expensive", so only 1 sample per diagram is used. — [House-GAN](https://arxiv.org/abs/2003.06988)
- Figure 3 sets the room-type color legend: Living, Dining, Kitchen, Bedroom, Bathroom, Laundry, Corridor, Closet, Balcony, Unknown. Table 1 lists the average number of rooms and the average number of edges per room, by room type. Table 4 shows compatibility improving as more constraint information is given (room count → room type → connectivity). — [House-GAN](https://arxiv.org/abs/2003.06988)

**House-GAN++ (Nauata et al., CVPR 2021)** — [arXiv 2103.02574](https://arxiv.org/abs/2103.02574)
- The method refines iteratively: the generator runs 10 times, and each run's layout becomes the next input constraint. A meta-optimization chooses which room or door masks to pass at each iteration, targeting FID or GED. — [House-GAN++](https://arxiv.org/abs/2103.02574)
- Realism study: 10 amateurs and 10 professional architects compared 100 pairs per method pair, scoring +1 win, −1 loss, 0 tie. Plans were shown both as raw segmentation masks and as vectorized floor plans (via Floor-SP), with each room and door colored by type. — [House-GAN++](https://arxiv.org/abs/2103.02574)
- Figure 7 ("Compatibility evaluation") draws the graph rebuilt from the output over the input graph, with edge colors: **orange = missing, red = wrongly predicted, green = correct**. — [House-GAN++](https://arxiv.org/abs/2103.02574)
- In Table 1 the top three results in each column are highlighted cyan, orange and magenta. Metrics are reported as mean ± std over 5 rounds of 1,000 samples. — [House-GAN++](https://arxiv.org/abs/2103.02574)

**HouseDiffusion (Shabani, Hosseini, Furukawa, CVPR 2023)** — [arXiv 2211.13287](https://arxiv.org/abs/2211.13287)
- It uses the same three metrics: Diversity = FID; Compatibility = "modified Graph Edit Distance between the input bubble diagram and the one reconstructed from the generated floorplan"; Realism = a user study. — [HouseDiffusion](https://arxiv.org/abs/2211.13287)
- Realism protocol: 1,000 samples per system. Participants see two samples and pick "A better", "B better" or "equal" (+1/−1/0). Each pair of systems was judged 150 times by 10 participants. HouseDiffusion scored −0.19 against ground truth, read as "as realistic as GT 81% of the time", and +0.71 against House-GAN++, read as "chosen 85% of the time". — [HouseDiffusion](https://arxiv.org/abs/2211.13287)
- Table 1 on RPLAN, 8-room plans: Diversity FID 9.5 (HouseDiffusion) vs 32.9 (House-GAN++); Compatibility GED 2.5 vs 3.9. That is an average 67% improvement in diversity and 32% in compatibility. — [HouseDiffusion](https://arxiv.org/abs/2211.13287)
- Figure 5 shows the bubble diagram rebuilt from each generated plan, with **Green = correct, Yellow = missing, Red = extraneous** connections. The text also checks room counts, e.g. "should have one living-room (red), two bedrooms (yellow), and one study (orange)", and notes House-GAN++ "tends to miss or generate too many rooms". — [HouseDiffusion](https://arxiv.org/abs/2211.13287)
- A new Non-Manhattan-RPLAN benchmark was built by adding 2 random corners to the outer wall. Realism was skipped there because those shapes were made by heuristics. Animations of the denoising process are in the supplementary video. — [HouseDiffusion](https://arxiv.org/abs/2211.13287)

**Graph2Plan (Hu et al., ACM TOG / SIGGRAPH 2020)** — [arXiv 2004.13204](https://arxiv.org/abs/2004.13204)
- Layout-graph nodes encode room type (13 types), size, and location on a coarse 5×5 grid. Edges encode the spatial relation type (left-of, above, inside, surrounding, etc.). — [Graph2Plan](https://arxiv.org/abs/2004.13204)
- The UI (Fig. 11) has three panels. Left: the input boundary, with room-count dropdowns or a partial graph. Middle: retrieved floor plans. Right: a zoomed floor plan with its layout graph. After a "transfer", the user can move nodes, add or delete edges, and add or delete nodes, then regenerate in a loop. Fig. 15 shows before/after pairs for each edit (node moved and edge removed; node added; edge added). — [Graph2Plan](https://arxiv.org/abs/2004.13204)
- It reports a timing breakdown: retrieval 99 ms, graph transfer 11 ms, network 68 ms, post-processing 200 ms, under 0.4 s in total. — [Graph2Plan](https://arxiv.org/abs/2004.13204)
- Fig. 12 is a gallery: rows are different boundaries, columns are different (bedroom, bathroom, balcony) count constraints labelled like "(2,1,1)". Its legend groups rooms as Public area / Bedroom / Bathroom / Balcony / Kitchen / Storage. — [Graph2Plan](https://arxiv.org/abs/2004.13204)
- Box-level accuracy uses IoU between predicted and ground-truth room boxes: 0.65 on average. In the ablations, IoU rose from 0.43 to 0.66, and post-processing raised it from 0.54/0.66 to 0.75/0.80. — [Graph2Plan](https://arxiv.org/abs/2004.13204)
- Plausibility study: 30 CS graduate students, 600 answers, generated plan vs GT side by side, with filter tasks to catch inattentive raters. Votes were 304 GT / 218 ours / 78 cannot tell, i.e. 49.3% judged the generated plan at least as plausible. Qualitative notes: users "like more regular rooms" and "prefer larger rooms". — [Graph2Plan](https://arxiv.org/abs/2004.13204)
- A failure-case figure (Fig. 19) shows that when the retrieved boundary differs a lot from the input, rooms overlap and some edge constraints go unmet. Stated limitations: no accessibility or functionality criteria, no "not adjacent" constraints, and no doors or windows. — [Graph2Plan](https://arxiv.org/abs/2004.13204)

**Tell2Design (Leng et al., ACL 2023)** — [arXiv 2311.15941](https://arxiv.org/abs/2311.15941)
- Text-to-plan quality is measured at pixel level. **Micro IoU** = Σ_r I_r / Σ_r U_r, a global IoU pooled over all room types. **Macro IoU** = (1/R) Σ_r I_r/U_r, the mean of per-room-type IoUs. Rooms are painted in a fixed order by total room-type area (living, common, master, balcony, bathroom, kitchen, storage, dining). The best model reached Micro 54.34 / Macro 53.30, and humans designing from the same text scored about 64.67 / 62.32. — [Tell2Design](https://arxiv.org/abs/2311.15941)
- The human evaluation is a per-criterion **constraint-alignment** rating on a 1–5 scale for room type, location, size and relationships, plus a binary "meets all specifications". Results: GT 85% meet-all vs model 38%; model per-criterion scores were type 4.71, location 3.67, size 3.89, relationships 3.65. — [Tell2Design](https://arxiv.org/abs/2311.15941)
- The authors note that "a low IoU score does not necessarily mean a bad generation", because one specification can map to many valid designs. — [Tell2Design](https://arxiv.org/abs/2311.15941)

**MaskPLAN (Zhang et al., CVPR 2024)** — [CVF open access](https://openaccess.thecvf.com/content/CVPR2024/papers/Zhang_MaskPLAN_Masked_Generative_Layout_Planning_from_Partial_Input_CVPR_2024_paper.pdf)
- It reports FID on rendered images (fid_img) plus **MSE on vectorized layout attributes**:
  - mse_T compares room-type counts.
  - mse_A compares adjacency counts: when a type-i room touches a type-j room, both A_i and A_j get +1.
  - mse_S compares the summed real-world area per room type, from pixel counts × (20/256)².
  - The authors avoid KL divergence "since probabilistic distributions equate different layouts". — [MaskPLAN](https://openaccess.thecvf.com/content/CVPR2024/papers/Zhang_MaskPLAN_Masked_Generative_Layout_Planning_from_Partial_Input_CVPR_2024_paper.pdf)
- User workflows: Add, Edit, Remove and **Freeze** room attributes (type, location, adjacency, area, shape); generate alternatives from the same partial input; and "single-attribute guidance" such as only a list of preferred areas or only adjacencies. — [MaskPLAN](https://openaccess.thecvf.com/content/CVPR2024/papers/Zhang_MaskPLAN_Masked_Generative_Layout_Planning_from_Partial_Input_CVPR_2024_paper.pdf)

**iPLAN (He, Huang, Wang, CVPR 2022)** (the venue is CVPR 2022, not 2023) — [arXiv 2203.14412](https://arxiv.org/abs/2203.14412)
- It uses three FID variants:
  - FID_img on rendered images.
  - **FID_area**: each plan becomes a 1×K vector of average area per room type.
  - **FID_type**: each plan becomes a 1×K vector of room counts per type.
  - The authors note these metrics take no part in training, so they are "not biased" toward their method. — [iPLAN](https://arxiv.org/abs/2203.14412)
- Qualitative figures **shade questionable design regions** ("design choices that are questionable and unobserved in data"), e.g. oddly shaped public areas or rooms that are too small. The process is human-in-the-loop: room types first, then room centers and partitions step by step, with designer edits possible at each stage. — [iPLAN](https://arxiv.org/abs/2203.14412)

**WallPlan (Sun et al., ACM TOG / SIGGRAPH 2022)** and GSDiff (2024) — [SIGGRAPH history](https://history.siggraph.org/?p=117866), [GSDiff arXiv 2408.16258](https://arxiv.org/abs/2408.16258)
- WallPlan generates a wall graph plus room labels, with no post-processing. I could not read its own metric section. — [HFUT news](https://iec.hfut.edu.cn/gjy/2022/1011/c13690a284648/page.htm)
- GSDiff compares against WallPlan and Graph2Plan on 378 shared boundaries, using FID, KID and GED (GED only for topology constraints). It also reports a **per-room-type count ratio, generated ÷ ground truth** (closer to 1 is better), e.g. WallPlan Living 0.992 / Storage 1.136. Its ablations add **FE (fake edge %)** and **AE (node alignment error)**. — [GSDiff](https://arxiv.org/abs/2408.16258)

**Merrell, Schkufza, Koltun, "Computer-Generated Residential Building Layouts" (ACM TOG / SIGGRAPH Asia 2010)** — [PDF](https://www.cs.princeton.edu/courses/archive/spring11/cos598A/pdfs/Merrell10a.pdf)
- The pipeline is: a Bayesian network produces an architectural program (rooms, adjacencies, area and aspect distributions); Metropolis optimization produces floor plans; and the plans are turned into a 3D model with doors, windows and stairs. Fig. 7 shows the optimization progressing. One example optimization took 35 s on an i7. — [Merrell 2010](https://www.cs.princeton.edu/courses/archive/spring11/cos598A/pdfs/Merrell10a.pdf)
- The cost is C(x) = k_a C_a + k_d C_d + k_f C_f + k_s C_s:
  - **Accessibility C_a** = the number of missing required connections, plus the number of enclosed entrances, patios and garages. A connection needs a shared wall long enough for a door.
  - **Dimension C_d** = −Σ(log-likelihood of area + log-likelihood of aspect ratio), using the Bayesian network's distributions.
  - **Floor C_f** = the unsupported area relative to the floor below.
  - **Shape C_s** = Σ over non-hallway rooms of M_c(S) = (A(hull(S)) − A(S))/A(S) + e(S), where e(S) is the number of outline edges.
  - — [Merrell 2010](https://www.cs.princeton.edu/courses/archive/spring11/cos598A/pdfs/Merrell10a.pdf)
- **Fig. 8 is a cost-term ablation figure**: plans optimized with the accessibility, area, aspect-ratio or shape term removed, beside the full cost. Doors are placed to minimize distance to room corners, following Alexander's "A Pattern Language". — [Merrell 2010](https://www.cs.princeton.edu/courses/archive/spring11/cos598A/pdfs/Merrell10a.pdf)

**Wu, Fan, Liu, Wonka, "MIQP-based Layout Design for Building Interiors" (Computer Graphics Forum / Eurographics 2018)** — [PDF](https://peterwonka.net/Publications/pdfs/2018.EG.Wenming.MIQPFloorplan.pdf), [EG DL](https://diglib.eg.org/handle/10.1111/cgf13380)
- The constraints are C_size (min/max width and depth), C_overlap, C_ratio (aspect-ratio range, e.g. [1,2]), C_pos (approximate position), C_boundary and C_adj. The objective includes a size-error term **E_size = Σ_i (w_i − w*_i)² + (d_i − d*_i)²** against user target sizes. — [MIQP 2018](https://peterwonka.net/Publications/pdfs/2018.EG.Wenming.MIQPFloorplan.pdf)
- Result figures **label every room with "W × D" in metres**, e.g. "Kitchen 3.50 x 1.75". Fig. 13 **highlights uncovered regions in red**. **Table 1** lists, per example: #rooms, the count of each constraint type (C_size, C_overlap, C_ratio, C_pos, C_boundary, C_adj), total constraints, and runtime (e.g. 13 rooms / 40 constraints / 7.26 s; 154 rooms / 85.69 s). — [MIQP 2018](https://peterwonka.net/Publications/pdfs/2018.EG.Wenming.MIQPFloorplan.pdf)
- **Fig. 14 is a leave-one-constraint-out ablation**. Without the size term the kitchen is unreasonable; without the aspect term it is too narrow; without the position term the foyer is not connected to the main door. — [MIQP 2018](https://peterwonka.net/Publications/pdfs/2018.EG.Wenming.MIQPFloorplan.pdf)

**GPLAN (Shekhawat group, arXiv 2020)** — [arXiv 2008.01803](https://arxiv.org/abs/2008.01803)
- The input is an adjacency graph drawn in a GUI, plus min/max room dimension constraints. Fig. 1 shows the outputs in stages: (a) input graph and dimensions, (b) **multiple dimensionless floor plans that all satisfy the adjacencies**, (c) one dimensioned plan from a dual-simplex LP. — [GPLAN](https://arxiv.org/abs/2008.01803)
- It reports enumeration counts with time, e.g. 1,300 topologically distinct plans in 282.45 s, and 256 distinct orthogonal floor plans in 26.56 s. — [GPLAN](https://arxiv.org/abs/2008.01803)

**FloorPlan-LLaMa (ACL 2025)** — [ACL Anthology](https://aclanthology.org/2025.acl-long.331)
- It argues that FID, GED and PSNR "fail to evaluate" practical viability. It introduces ARS (Architectural Reasonableness Scores) on three axes, Functionality, Flow (circulation) and Overall, each 1–10, built from 24,000 architect ratings augmented to 120,000 pairs. Displayed plans show their ID and overall score in the corners. A summary of common layout issues identified by architects is added "to assist non-architectural professionals". — [FloorPlan-LLaMa](https://aclanthology.org/2025.acl-long.331)

### Inferences
- The field standard for explaining "did it follow my program?" is an overlay of the **rebuilt adjacency graph on the requested graph, with three edge colors** (correct / missing / extra). House-GAN++ and HouseDiffusion both use it, though their color choices differ.
- The optimization papers (Merrell, MIQP) explain results through **per-term cost breakdowns and leave-one-term-out ablations**, which fits a QUBO tool well: each QUBO penalty term maps to one of these terms.
- Room-type color legends are universal, but no paper standardizes a palette. Each paper defines its own legend figure.

### Gaps
- I could not open the full RPLAN (Wu et al., SIGGRAPH Asia 2019, ACM TOG 38(6)) or WallPlan papers to confirm their user-study protocols and metrics. The RPLAN listing (boundary input, rasterized, RPLAN dataset) comes from the review [Liu et al. 2025, arXiv 2504.09694](https://arxiv.org/abs/2504.09694).
- Shekhawat's other papers (e.g. on circulation and non-rectangular plans) were not checked.

## Q2. Which items are cheap to compute in a browser for one plan or a candidate set?

### Takeaway
Nearly every per-plan "constraint-following" metric in these papers is a small graph or geometry calculation (rooms ≤ ~15): adjacency extraction, edge diff and GED-like counts, area and size error, aspect ratio, convexity, accessibility count, and room-count checks. All of these are cheap in JS. FID/KID and user-study Realism need distribution-level data and are not suitable for a single plan, but candidate diversity can be approximated with pairwise distances.

### Cited Findings
- **Adjacency extraction rule:** rooms count as adjacent when the bounding-box Manhattan distance is under a threshold (House-GAN used 8 px) — [House-GAN](https://arxiv.org/abs/2003.06988). Merrell's stricter rule requires a shared wall long enough for a door — [Merrell 2010](https://www.cs.princeton.edu/courses/archive/spring11/cos598A/pdfs/Merrell10a.pdf).
- **Compatibility as GED (input graph vs rebuilt graph)**: House-GAN restricted it to 1 sample per diagram because exact GED is costly — [House-GAN](https://arxiv.org/abs/2003.06988). With room types as fixed node labels, the node correspondence is mostly given, so the GED reduces to counting missing and extra edges plus room-count mismatches. That reduction is my inference; the papers use the exact GED algorithm (Abu-Aisheh et al. 2015) — [HouseDiffusion](https://arxiv.org/abs/2211.13287), [GSDiff](https://arxiv.org/abs/2408.16258).
- **Area/size error:** E_size = Σ (w−w*)² + (d−d*)² — [MIQP 2018](https://peterwonka.net/Publications/pdfs/2018.EG.Wenming.MIQPFloorplan.pdf). Per-type summed area compared with a target (mse_S) — [MaskPLAN](https://openaccess.thecvf.com/content/CVPR2024/papers/Zhang_MaskPLAN_Masked_Generative_Layout_Planning_from_Partial_Input_CVPR_2024_paper.pdf). Per-type average-area vector (FID_area input) — [iPLAN](https://arxiv.org/abs/2203.14412).
- **Aspect ratio within [min, max]** (C_ratio) — [MIQP 2018](https://peterwonka.net/Publications/pdfs/2018.EG.Wenming.MIQPFloorplan.pdf). **Convexity measure** M_c = (hull area − area)/area + edge count — [Merrell 2010](https://www.cs.princeton.edu/courses/archive/spring11/cos598A/pdfs/Merrell10a.pdf).
- **Accessibility count:** missing required door connections, plus entrances or balconies with no exterior access — [Merrell 2010](https://www.cs.princeton.edu/courses/archive/spring11/cos598A/pdfs/Merrell10a.pdf).
- **Room-type count check:** the T vector (count per type) — [MaskPLAN](https://openaccess.thecvf.com/content/CVPR2024/papers/Zhang_MaskPLAN_Masked_Generative_Layout_Planning_from_Partial_Input_CVPR_2024_paper.pdf). Generated ÷ GT count ratio per type — [GSDiff](https://arxiv.org/abs/2408.16258). The HouseDiffusion text checks "exactly the correct set of rooms" — [HouseDiffusion](https://arxiv.org/abs/2211.13287).
- **Coverage, gaps and overlap:** uncovered regions highlighted red — [MIQP 2018](https://peterwonka.net/Publications/pdfs/2018.EG.Wenming.MIQPFloorplan.pdf). Overlaps and gaps are named as the main failure modes — [GSDiff](https://arxiv.org/abs/2408.16258), [Graph2Plan](https://arxiv.org/abs/2004.13204).
- **Per-type IoU (micro/macro)** against a reference plan. This needs a reference, such as the user's sketch or a previous candidate — [Tell2Design](https://arxiv.org/abs/2311.15941).
- **Diversity:** the papers use FID over thousands of samples (e.g. 5,000 diagrams × 10) — [House-GAN](https://arxiv.org/abs/2003.06988). That is not feasible or meaningful for a handful of candidates.
- **Constraint and runtime table** (constraint count by type, total, time) — [MIQP 2018](https://peterwonka.net/Publications/pdfs/2018.EG.Wenming.MIQPFloorplan.pdf). Stage timing breakdown — [Graph2Plan](https://arxiv.org/abs/2004.13204).

### Inferences
Ranked by value for this tool, given that it already has the process view, gallery, time line, tornado chart and formula cards:
1. **Program-graph vs result-graph overlay** with green/orange-or-yellow/red edges, plus a "GED-lite" score (missing + extra edges + room-count error). Cost is O(n²) over at most 15 rooms.
2. **Area table per room**: target vs actual m², % error, and a bar or diverging chart, plus E_size, W×D labels on the plan, and aspect ratio against an allowed band.
3. **Constraint checklist / penalty breakdown**: one row per QUBO penalty term (overlap, boundary, adjacency, size, ratio, position), showing satisfied or violated and its contribution to energy. This follows MIQP Table 1 and Merrell's cost terms.
4. **Geometry sanity checks**: uncovered cells or overlaps highlighted on the plan (MIQP Fig. 13 style), a convexity score per room, and accessibility (whether each room is reachable from the entrance and the balcony touches the exterior).
5. **Candidate diversity**: pairwise distances between candidates. Options include 1 − IoU of the room-type rasters (Tell2Design-style), L2 between per-type area vectors (iPLAN FID_area input), and adjacency-vector distance (MaskPLAN A_vec). Show these as a small heat-map matrix or as a "most different from the current pick" sort.
6. **Leave-one-term-out ablation thumbnails**: re-solve with one penalty weight set to zero and show the plan (Merrell Fig. 8, MIQP Fig. 14). This costs extra solves, so it may need to be on demand.
- Only FID, KID and the realism user study are unsuitable for per-plan display.

### Gaps
- No paper reports browser runtimes for these metrics. The "cheap" claims are my own inference from problem size, not from a source.

## Q3. User-study evidence on which explanations help designers trust or understand generated plans

### Takeaway
Evidence is thin. The generation papers run *realism and plausibility* studies, not explanation or trust studies. The only explanation-focused work found (Bielski et al., CAADRIA 2022) reports qualitatively that explanations broaden architects' thinking and that the choice of visualization affects usefulness. Architect-centered work (FloorPlan-LLaMa) argues that function, circulation and overall layout matter more to architects than image metrics.

### Cited Findings
- Realism studies with professional architects as well as amateurs exist (House-GAN: 10 architects; House-GAN++: 10 architects). Architects' pairwise scores broadly agreed with students' — [House-GAN](https://arxiv.org/abs/2003.06988), [House-GAN++](https://arxiv.org/abs/2103.02574).
- In Graph2Plan's study (30 graduate students), raters preferred more regular rooms and larger kitchens and bedrooms, and could not tell plans apart when the only difference was the kitchen's alignment — [Graph2Plan](https://arxiv.org/abs/2004.13204).
- Tell2Design's per-criterion alignment ratings show which aspects users judge to be violated. Location (3.67) and relationships (3.65) were rated lowest — [Tell2Design](https://arxiv.org/abs/2311.15941).
- FloorPlan-LLaMa: architects judge plans on functionality, flow and overall layout, and the authors add architect-written summaries of common layout issues to help non-architects understand results — [FloorPlan-LLaMa](https://aclanthology.org/2025.acl-long.331).
- Bielski et al., "The What, Why, What-If and How-To for Designing Architecture: Explainability for auto-completion of computer-aided architectural design of floor plan layouting during the early design stages" (CAADRIA 2022, pp. 435–444). Per the abstract, explanations "broaden architects' cognitive horizon", and the visualization method shapes how useful and usable the explanation is. The full text was not obtained, so sample size and method are unknown — [TUM portal](https://portal.fis.tum.de/en/publications/the-what-why-what-if-and-how-to-for-designing-architecture-explai/), [DFKI](https://dfki.de/web/forschung/projekte-publikationen/publikation/12552).
- Interactive edit loops are presented as the main way to give users control: Graph2Plan graph editing (Fig. 15), MaskPLAN Add/Edit/Remove/Freeze, and iPLAN stage-wise designer input. None of these papers measured trust or understanding — [Graph2Plan](https://arxiv.org/abs/2004.13204), [MaskPLAN](https://openaccess.thecvf.com/content/CVPR2024/papers/Zhang_MaskPLAN_Masked_Generative_Layout_Planning_from_Partial_Input_CVPR_2024_paper.pdf), [iPLAN](https://arxiv.org/abs/2203.14412).

### Inferences
- The "What / Why / What-If / How-To" framing maps onto the tool's displays:
  - What: the plan and its metrics.
  - Why: the formula cards and penalty breakdown.
  - What-If: the tornado chart and leave-one-term-out views.
  - How-To: hints such as "increase weight X to fix the missing kitchen–dining edge".
  - The missing piece today is mostly What-If and How-To at the level of each violated constraint.
- Showing constraint satisfaction per criterion (type, size, location, relationship), as Tell2Design rated it, is likely more interpretable to users than a single score.

### Gaps
- I found no controlled study comparing explanation types (graph overlay, constraint checklist, cost breakdown) for floor-plan trust. The Bielski full text, its participant count and its method were not retrieved.
- The search also surfaced a 2026 CHI paper on an "AIDED" interior co-design workflow (12 designers; AI overlays helped but needed natural-language mediation for trust). I saw only a search snippet and did not verify it, so it is not cited as a finding.

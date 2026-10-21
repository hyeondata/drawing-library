// SPA(공간) 라벨 분석: 인접 그래프 → 세대 분리 → 공간구문 지표·면적 구성·평면 정합성.
import { COMMON_TYPES, GENOTYPE_ORDER, LIVING_RANK_EXCLUDE, MAIN_TYPES, THRESHOLDS } from './config.js';
import { bboxGap, bboxOf, contactLength, polygonDistance } from './geometry.js';
import { bfs, kendallTauB, nodeMetrics, ringiness } from './syntax.js';

const AREA_TYPES = ['거실', '주방', '침실', '화장실', '발코니', '드레스룸', '현관', '기타'];
// 외벽 쪽 공간. 외벽은 단열층 때문에 더 두꺼워 별도 기준을 쓴다.
const EXTERIOR_TYPES = new Set(['발코니', '실외기실', '다목적공간']);

/** 인접 링크 목록: [i, j, 접촉 길이, 벽 두께(간격)]. */
function buildAdjacency(spaces) {
  const { adjacencyGap, exteriorGap, minContact } = THRESHOLDS;
  const edges = [];
  for (let i = 0; i < spaces.length; i++) {
    for (let j = i + 1; j < spaces.length; j++) {
      const a = spaces[i];
      const b = spaces[j];
      const tau = EXTERIOR_TYPES.has(a.type) || EXTERIOR_TYPES.has(b.type) ? exteriorGap : adjacencyGap;
      if (bboxGap(a.bbox, b.bbox) > tau) continue;
      const contact = (contactLength(a.polys, b.polys, tau) + contactLength(b.polys, a.polys, tau)) / 2;
      if (contact >= minContact) edges.push([i, j, Math.round(contact), polygonDistance(a.polys, b.polys)]);
    }
  }
  return edges;
}

function neighborsOf(n, edges, keep) {
  const adj = Array.from({ length: n }, () => []);
  for (const [i, j] of edges) {
    if (keep(i) && keep(j)) {
      adj[i].push(j);
      adj[j].push(i);
    }
  }
  return adj;
}

/**
 * 세대 분리. 현관마다 출발해 벽 두께를 비용으로 한 최단경로로 실을 배정한다.
 * 세대 경계벽은 내벽보다 두꺼워 비용이 커지므로 이웃 세대로 잘 넘어가지 않는다.
 */
function assignUnits(spaces, edges) {
  const isPrivate = (i) => !COMMON_TYPES.has(spaces[i].type);
  const adj = Array.from({ length: spaces.length }, () => []);
  for (const [i, j, , gap] of edges) {
    if (!isPrivate(i) || !isPrivate(j)) continue;
    const cost = 1 + gap / 10;
    adj[i].push([j, cost]);
    adj[j].push([i, cost]);
  }
  let entrances = spaces.map((s, i) => i).filter((i) => spaces[i].type === '현관');
  let rootless = false;
  if (entrances.length === 0) {
    // 현관이 없으면 거실(없으면 가장 큰 실)을 기준으로 한 세대로 본다.
    const priv = spaces.map((s, i) => i).filter(isPrivate);
    if (!priv.length) return { units: [], unitOf: spaces.map(() => -1), rootless: true, stranded: new Set() };
    const living = priv.find((i) => spaces[i].type === '거실');
    entrances = [living ?? [...priv].sort((a, b) => spaces[b].area - spaces[a].area)[0]];
    rootless = true;
  }
  const unitOf = new Array(spaces.length).fill(-1);
  const cost = new Array(spaces.length).fill(Infinity);
  entrances.forEach((e, u) => {
    unitOf[e] = u;
    cost[e] = 0;
  });
  const done = new Set();
  for (;;) {
    let x = -1;
    for (let i = 0; i < spaces.length; i++) if (!done.has(i) && cost[i] < Infinity && (x < 0 || cost[i] < cost[x])) x = i;
    if (x < 0) break;
    done.add(x);
    for (const [y, c] of adj[x]) {
      if (cost[x] + c < cost[y]) {
        cost[y] = cost[x] + c;
        unitOf[y] = unitOf[x];
      }
    }
  }

  // 거실도 침실도 없는 조각(현관이 둘로 나뉜 경우 등)은 가장 많이 맞닿은 세대에 합친다.
  let roots = entrances.map((e, u) => u);
  for (let changed = true; changed; ) {
    changed = false;
    for (const u of roots) {
      const members = spaces.map((s, i) => i).filter((i) => unitOf[i] === u);
      if (members.some((i) => ['거실', '침실'].includes(spaces[i].type))) continue;
      const contact = new Map();
      for (const [i, j, len] of edges) {
        const [a, b] = unitOf[i] === u ? [i, j] : [j, i];
        if (unitOf[a] !== u || unitOf[b] === u || unitOf[b] < 0 || !isPrivate(b)) continue;
        contact.set(unitOf[b], (contact.get(unitOf[b]) || 0) + len);
      }
      if (!contact.size) continue;
      const target = [...contact.entries()].sort((p, q) => q[1] - p[1])[0][0];
      for (const i of members) unitOf[i] = target;
      roots = roots.filter((r) => r !== u);
      changed = true;
      break;
    }
  }

  // 어느 현관에서도 닿지 않는 실은 가장 가까운 세대에 넣고 '고립'으로 표시한다.
  const stranded = new Set();
  spaces.forEach((s, i) => {
    if (!isPrivate(i) || unitOf[i] !== -1) return;
    let best = roots[0];
    let bestD = Infinity;
    for (const u of roots) {
      const e = entrances[u];
      const d = Math.hypot(s.center[0] - spaces[e].center[0], s.center[1] - spaces[e].center[1]);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    unitOf[i] = best;
    stranded.add(i);
  });
  const remap = new Map(roots.map((u, k) => [u, k]));
  for (let i = 0; i < unitOf.length; i++) if (unitOf[i] >= 0) unitOf[i] = remap.get(unitOf[i]);
  const units = roots.map((u, k) => {
    const members = spaces.map((s, i) => i).filter((i) => unitOf[i] === k);
    // 합쳐진 세대는 원래 현관을 기준점으로 유지한다.
    return { index: k, root: entrances[u], members };
  });
  return { units, unitOf, rootless, stranded };
}

function analyzeUnit(unit, spaces, edges, rootless, stranded) {
  const members = unit.members;
  const local = new Map(members.map((g, l) => [g, l]));
  const adj = members.map(() => []);
  const localEdges = [];
  for (const [i, j] of edges) {
    if (local.has(i) && local.has(j)) {
      adj[local.get(i)].push(local.get(j));
      adj[local.get(j)].push(local.get(i));
      localEdges.push([i, j]);
    }
  }
  const root = local.get(unit.root);
  const depth = bfs(adj, root);
  const typeOf = (l) => spaces[members[l]].type;
  const locals = members.map((g, l) => l);
  const ofType = (t) => locals.filter((l) => typeOf(l) === t);
  const isCut = (l) => depth[l] === Infinity || stranded.has(members[l]);

  // ---- 공간구문 그래프 ----
  // 덕트·PS(작거나 현관에서 닿지 않는 '기타')는 빼고, 현관에 세대 밖(외부) 노드를 붙인다.
  // 외부 노드는 Byun & Choi(2016) 등 문헌 값과 같은 규약으로 비교하기 위해서다.
  const isDuct = (l) => typeOf(l) === '기타' && (isCut(l) || spaces[members[l]].area < THRESHOLDS.ductMaxArea);
  const inSyntax = locals.map((l) => !isDuct(l) && !isCut(l));
  const ext = members.length; // 외부 노드 번호
  const sAdj = [...adj.map((ns, l) => (inSyntax[l] ? ns.filter((n) => inSyntax[n]) : [])), []];
  if (!rootless) {
    sAdj[root].push(ext);
    sAdj[ext].push(root);
  }
  const allMetrics = nodeMetrics(sAdj);
  const metrics = locals.map((l) =>
    inSyntax[l]
      ? allMetrics[l]
      : { connectivity: adj[l].length, meanDepth: null, ra: null, rra: null, integration: null, control: null, reach: 0, isolated: true },
  );
  const sDepth = bfs(sAdj, root);

  // ---- 면적 구성 ----
  const totalArea = members.reduce((s, g) => s + spaces[g].area, 0);
  const areaByType = {};
  for (const t of AREA_TYPES) areaByType[t] = 0;
  for (const g of members) {
    const t = AREA_TYPES.includes(spaces[g].type) ? spaces[g].type : '기타';
    areaByType[t] += spaces[g].area;
  }

  // ---- 공간구문 특징 ----
  const finite = (arr) => arr.filter((v) => v !== null && Number.isFinite(v));
  const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
  const integ = metrics.map((m) => m.integration);
  const meanInteg = (t) => mean(finite(ofType(t).map((l) => integ[l])));
  const ratio = (a, b) => (a !== null && b ? a / b : null);
  const livingNodes = ofType('거실');
  const bedNodes = ofType('침실');
  const livingI = livingNodes.length ? Math.max(...finite(livingNodes.map((l) => integ[l])), -Infinity) : null;
  const bedI = meanInteg('침실');

  // 유전형 부합도: 기능실 평균 통합도 순서와 기준 순서(GENOTYPE_ORDER)의 Kendall τ_b.
  const geno = GENOTYPE_ORDER.map((t, k) => [meanInteg(t), GENOTYPE_ORDER.length - k]).filter(([v]) => v !== null);
  const genotypeTau = geno.length >= 3 ? kendallTauB(geno.map((g) => g[0]), geno.map((g) => g[1])) : null;

  // 공·사 깊이 차: 개인 공간이 공용 공간보다 몇 단계 더 깊은가.
  const depthOf = (types) => mean(finite(locals.filter((l) => types.includes(typeOf(l)) && inSyntax[l]).map((l) => sDepth[l])));
  const privDepth = depthOf(['침실', '드레스룸']);
  const pubDepth = depthOf(['거실', '주방']);

  // 기능실: '기타'·공용 공간을 뺀 실.
  const functional = locals.filter((l) => inSyntax[l] && typeOf(l) !== '기타' && !COMMON_TYPES.has(typeOf(l)));

  // 거실 통제값(Ostwald 2011: 깊이 계열과 다른 순위를 주는 유일한 지표).
  const livingControl = livingNodes.length ? Math.max(...livingNodes.map((l) => metrics[l].control ?? 0)) : null;

  // ---- 면적·형태 특징 ----
  const areaOf = (types) => locals.filter((l) => types.includes(typeOf(l))).reduce((s, l) => s + spaces[members[l]].area, 0);
  const publicArea = areaOf(['거실', '주방', '현관']);
  const privateArea = areaOf(['침실', '드레스룸']);
  const bedAreas = bedNodes.map((l) => spaces[members[l]].area).sort((a, b) => b - a);
  const masterBedroomRatio = bedAreas.length >= 2 ? bedAreas[0] / mean(bedAreas.slice(1)) : null;

  // 실 직사각형도: 거실·침실·주방의 면적 / 외접 사각형 면적(면적 가중 평균).
  const rectRooms = locals.filter((l) => ['거실', '침실', '주방'].includes(typeOf(l))).map((l) => spaces[members[l]]);
  const rectArea = rectRooms.reduce((s, r) => s + r.area, 0);
  const roomRectangularity = rectArea
    ? rectRooms.reduce((s, r) => {
        const [x0, y0, x1, y1] = bboxOf(r.polys);
        return s + r.area * Math.min(1, r.area / Math.max(1, (x1 - x0) * (y1 - y0)));
      }, 0) / rectArea
    : null;

  const features = {
    nodeCount: functional.length,
    // 화면 참고용(채점 제외): v0.1 지표
    livingDepth: livingNodes.length ? Math.min(...livingNodes.map((l) => depth[l])) : null,
    ringiness: ringiness(members.length, localEdges.length),
    // 공간구문
    livingBedroomRatio: ratio(livingI === -Infinity ? null : livingI, bedI),
    kitchenBedroomRatio: ratio(meanInteg('주방'), bedI),
    genotypeTau,
    privacyDepthGap: privDepth !== null && pubDepth !== null ? privDepth - pubDepth : null,
    meanIntegration: mean(finite(functional.map((l) => integ[l]))),
    livingControl,
    // 면적
    publicPrivateRatio: privateArea ? publicArea / privateArea : null,
    masterBedroomRatio,
    // 형태
    roomRectangularity,
  };
  for (const t of AREA_TYPES) features[`ratio_${t}`] = totalArea ? areaByType[t] / totalArea : 0;
  for (const k of Object.keys(features)) if (features[k] === Infinity || features[k] === -Infinity) features[k] = null;

  // ---- 평면 정합성 규칙 ----
  const rules = [];
  const rule = (id, label, weight, ratio, detail) =>
    rules.push({ id, label, weight, ratio: Math.max(0, Math.min(1, ratio)), pass: ratio >= 1, detail });

  const required = ['현관', '거실', '주방', '침실', '화장실'];
  const missing = required.filter((t) => !ofType(t).length || (t === '현관' && rootless));
  rule('program', '필수 실 구성(현관·거실·주방·침실·화장실)', 2, (required.length - missing.length) / required.length,
    missing.length ? `없음: ${missing.join(', ')}` : '모두 있음');

  // 닿지 않는 '기타'는 덕트·PS 같은 비출입 공간으로 보고 판정에서 뺀다.
  const habitable = locals.filter((l) => typeOf(l) !== '기타');
  const unreached = habitable.filter(isCut);
  const ducts = locals.filter((l) => typeOf(l) === '기타' && isCut(l)).length;
  rule('reachable', '모든 실이 현관에서 이어짐', 2, habitable.length ? 1 - unreached.length / habitable.length : 0,
    (unreached.length ? `끊긴 실: ${unreached.map((l) => typeOf(l)).join(', ')}` : '모두 연결') +
      (ducts ? ` · 비출입 기타 ${ducts}곳 제외` : ''));

  // 거실 중심성(관문형 순위 규칙): 복도성·외부·공용 공간을 뺀 기능실 가운데 거실 통합도 순위.
  if (livingNodes.length && livingI !== null && livingI !== -Infinity) {
    const rivals = locals.filter((l) => inSyntax[l] && !LIVING_RANK_EXCLUDE.has(typeOf(l)) && typeOf(l) !== '거실' && integ[l] !== null);
    const above = rivals.filter((l) => integ[l] > livingI + 1e-9);
    const ok = above.length === 0 ? 1 : above.length === 1 && typeOf(above[0]) === '주방' ? 0.5 : 0;
    rule('livingCentral', '거실이 가장 통합된 기능실', 2, ok,
      above.length ? `거실보다 통합된 실: ${above.map(typeOf).join(', ')}` : '거실이 1위');
  } else {
    rule('livingCentral', '거실이 가장 통합된 기능실', 2, 0, '거실 없음');
  }

  const livingDepth = features.livingDepth;
  rule('livingNear', '거실이 현관에서 2단계 이내', 1, livingDepth !== null && livingDepth <= 2 ? 1 : 0,
    livingDepth === null ? '거실에 닿지 않음' : `현관→거실 ${livingDepth}단계`);

  const entryNeighbors = rootless ? [] : adj[root].map(typeOf);
  const entryOk = entryNeighbors.some((t) => ['거실', '주방', '기타', '다목적공간'].includes(t));
  rule('entry', '현관이 거실·주방·복도로 바로 열림', 1, entryOk ? 1 : 0,
    entryNeighbors.length ? `현관 인접: ${[...new Set(entryNeighbors)].join(', ')}` : '현관 없음');

  const kitchens = ofType('주방');
  const kitchenOk = kitchens.length > 0 && kitchens.every((k) => adj[k].some((n) => typeOf(n) === '거실'));
  rule('kitchenLiving', '주방과 거실이 맞닿음', 1, kitchenOk ? 1 : 0,
    kitchens.length ? (kitchenOk ? '연계됨' : '주방이 거실과 떨어짐') : '주방 없음');

  // 침실을 지워도 다른 주요 실에 여전히 닿아야 한다(침실이 통로가 되면 안 됨).
  const throughBeds = [];
  for (const b of bedNodes) {
    const pruned = adj.map((ns, l) => (l === b ? [] : ns.filter((n) => n !== b)));
    const d = bfs(pruned, root);
    const cut = locals.filter((l) => l !== b && MAIN_TYPES.has(typeOf(l)) && depth[l] !== Infinity && d[l] === Infinity);
    if (cut.length) throughBeds.push(b);
  }
  rule('bedroomPrivacy', '침실을 거치지 않고 다른 주요 실에 갈 수 있음', 2,
    bedNodes.length ? 1 - throughBeds.length / bedNodes.length : 1,
    throughBeds.length ? `통과 침실 ${throughBeds.length}개` : '통과 침실 없음');

  const privateRooms = new Set(['침실', '드레스룸']);
  const shared = adj.map((ns, l) => (privateRooms.has(typeOf(l)) ? [] : ns.filter((n) => !privateRooms.has(typeOf(n)))));
  const sharedDepth = bfs(shared, root);
  const baths = ofType('화장실');
  const publicBath = baths.some((b) => sharedDepth[b] !== Infinity);
  rule('publicBath', '침실을 거치지 않는 공용 화장실', 1, publicBath ? 1 : 0,
    baths.length ? (publicBath ? '있음' : '모든 화장실이 침실 안쪽') : '화장실 없음');

  return {
    index: unit.index,
    rootSpace: unit.root,
    members,
    edges: localEdges,
    totalArea,
    nodes: locals.map((l) => ({
      space: members[l],
      type: typeOf(l),
      depth: depth[l] === Infinity ? null : depth[l],
      duct: isDuct(l),
      ...metrics[l],
    })),
    features,
    rules,
  };
}

export function analyzeSPA(parsed) {
  const spaces = parsed.items.filter((it) => it.group === '공간');
  const edges = buildAdjacency(spaces);
  const { units, unitOf, rootless, stranded } = assignUnits(spaces, edges);
  return {
    kind: 'SPA',
    spaces: spaces.map((s, i) => ({ id: s.id, type: s.type, area: s.area, center: s.center, polys: s.polys, unit: unitOf[i], common: COMMON_TYPES.has(s.type) })),
    edges: edges.map(([i, j, contact, gap]) => [i, j, contact, Math.round(gap)]),
    units: units.map((u) => analyzeUnit(u, spaces, edges, rootless, stranded)),
  };
}

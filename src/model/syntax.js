// 공간구문론(Space Syntax) 그래프 지표.
// 정의: Hillier & Hanson (1984). 노드 = 라벨링된 실, 링크 = 벽을 공유하는 인접 관계.

/** 인접 목록에서 start 노드의 최단 단계 거리(도달 불가는 Infinity). */
export function bfs(adj, start) {
  const dist = new Array(adj.length).fill(Infinity);
  dist[start] = 0;
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const u = queue[q];
    for (const v of adj[u]) {
      if (dist[v] === Infinity) {
        dist[v] = dist[u] + 1;
        queue.push(v);
      }
    }
  }
  return dist;
}

/** 다이아몬드형 기준 시스템의 D값. RA를 RRA로 정규화할 때 쓴다. */
export function diamondValue(k) {
  if (k < 3) return null;
  return (2 * (k * (Math.log2((k + 2) / 3) - 1) + 1)) / ((k - 1) * (k - 2));
}

/**
 * 노드별 지표: 연결도, 평균깊이(MD), RA, RRA, 통합도(1/RRA), 통제도.
 * 도달 가능한 노드만으로 계산하고, 그 수(reach)를 함께 돌려준다.
 */
export function nodeMetrics(adj) {
  const n = adj.length;
  return adj.map((neighbors, i) => {
    const dist = bfs(adj, i);
    const reached = dist.filter((d) => d !== Infinity);
    const k = reached.length;
    const total = reached.reduce((s, d) => s + d, 0);
    const md = k > 1 ? total / (k - 1) : null;
    const ra = k > 2 && md !== null ? (2 * (md - 1)) / (k - 2) : null;
    const dk = diamondValue(k);
    const rra = ra !== null && dk ? ra / dk : null;
    const control = neighbors.reduce((s, j) => s + 1 / Math.max(1, adj[j].length), 0);
    return {
      connectivity: neighbors.length,
      meanDepth: md,
      ra,
      rra,
      integration: rra && rra > 0 ? 1 / rra : null,
      control,
      reach: k,
      isolated: k < n,
    };
  });
}

/** 고리성: 실제 고리 수 / 평면 그래프의 최대 고리 수 (Hillier & Hanson). */
export function ringiness(nodeCount, edgeCount) {
  if (nodeCount < 3) return 0;
  return Math.max(0, edgeCount - nodeCount + 1) / (2 * nodeCount - 5);
}

/**
 * Kendall τ_b: 두 순서가 얼마나 같은지(-1~1). 동점을 보정한다.
 * 유전형 부합도에서 도면의 통합도 순서와 기준 순서를 비교할 때 쓴다.
 */
export function kendallTauB(x, y) {
  const n = x.length;
  let concordant = 0;
  let discordant = 0;
  let tiesX = 0;
  let tiesY = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const dx = Math.sign(x[i] - x[j]);
      const dy = Math.sign(y[i] - y[j]);
      if (dx === 0 && dy === 0) continue;
      if (dx === 0) tiesX++;
      else if (dy === 0) tiesY++;
      else if (dx === dy) concordant++;
      else discordant++;
    }
  const denom = Math.sqrt((concordant + discordant + tiesX) * (concordant + discordant + tiesY));
  return denom ? (concordant - discordant) / denom : null;
}

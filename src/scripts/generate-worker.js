// 도면 생성 최적화를 화면과 따로 돌린다(수백 번 평가하는 동안 화면이 멈추지 않게).
// type 'generate': 기존(J 직접 탐색) 3안, type 'compare': 고른 알고리즘(QUBO 풀이기 포함)을 같은 예산으로 비교.
import { compareAlgorithms } from '../generate/compare.js';
import { optimize } from '../generate/optimize.js';
import { buildQubo, toBqmJson } from '../generate/qubo.js';

self.onmessage = (e) => {
  const { type = 'generate', spec, seed, id, algorithms, budgetMs, stopHits = null, weights = 'hand' } = e.data;
  try {
    if (type === 'qubo') {
      self.postMessage({ id, done: true, bqm: toBqmJson(buildQubo(spec, { weights })) });
      return;
    }
    if (type === 'compare') {
      const out = compareAlgorithms(spec, {
        algorithms,
        seed,
        budgetMs,
        stopHits,
        weights,
        onProgress: (p, key, info) => self.postMessage({ id, progress: p, key, info }),
      });
      self.postMessage({ id, done: true, compare: out });
      return;
    }
    const gallery = [];
    const timeline = {};
    const top = optimize(spec, { seed, gallery, timeline, onProgress: (p) => self.postMessage({ id, progress: p }) });
    self.postMessage({ id, done: true, top, gallery, timeline });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};

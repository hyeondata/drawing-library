// 도면 생성 최적화를 화면과 따로 돌린다(수백 번 평가하는 동안 화면이 멈추지 않게).
import { optimize } from '../generate/optimize.js';

self.onmessage = (e) => {
  const { spec, baseline, seed, id } = e.data;
  try {
    const top = optimize(spec, { baseline, seed, onProgress: (p) => self.postMessage({ id, progress: p }) });
    self.postMessage({ id, done: true, top: top.map(({ params, ...rest }) => rest) });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};

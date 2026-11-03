// term-evidence worker: 메인 스레드가 보낸 작업(실제 도면 묶음 또는 생성 조건)을 측정해 돌려준다.
import { parentPort } from 'node:worker_threads';
import { measureCondition, measureDrawing } from './term-measure.mjs';

parentPort.on('message', (job) => {
  if (job.type === 'real') {
    const rows = [];
    const census = { drawings: 0, noEntranceDrawings: 0, units: 0, noLiving: 0 };
    for (const f of job.files) {
      const m = measureDrawing(job.dataDir, f);
      rows.push(...m.rows);
      for (const k in census) census[k] += m.census[k];
    }
    parentPort.postMessage({ id: job.id, rows, census });
  } else if (job.type === 'gen') {
    parentPort.postMessage({ id: job.id, rows: measureCondition(job.si, job.samples) });
  }
});

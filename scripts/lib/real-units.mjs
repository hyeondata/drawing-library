// 실제 도면(AI 허브 APT_FP_SPA 7,275장) 세대별 측정값을 읽는다. term-evidence와 기준 분포 생성이 같이 쓴다.
// - 병렬 측정(worker_threads): 7,275장 분석이 한 스레드로 약 20.7초라 스레드 수만큼 나눠 돌린다.
//   기본 8: 4스레드 6.0초, 8스레드 4.8초, 15스레드 5.2초로 8에서 가장 빠르다.
// - 캐시: (해석기 코드, 측정 코드, 파일 목록)의 해시가 같으면 <data>/../derived/real-units.jsonl을 다시 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { Worker } from 'node:worker_threads';

export const PREFIX = 'APT_FP_SPA_';
export const defaultThreads = () => Math.min(8, os.availableParallelism() - 1);

export function runPool(jobs, threads) {
  const n = Math.max(1, Math.min(threads, os.availableParallelism(), jobs.length));
  return new Promise((resolve, reject) => {
    const results = new Array(jobs.length);
    let next = 0, done = 0;
    const workers = Array.from({ length: n }, () => new Worker(new URL('./term-measure-worker.mjs', import.meta.url)));
    const feed = (w) => {
      if (next < jobs.length) w.postMessage({ ...jobs[next], id: next++ });
    };
    for (const w of workers) {
      w.on('message', (m) => {
        results[m.id] = m;
        done++;
        if (done % 20 === 0 || done === jobs.length) process.stdout.write(`\r  ${done}/${jobs.length}`);
        if (done === jobs.length) {
          process.stdout.write('\n');
          workers.forEach((x) => x.terminate());
          resolve(results);
        } else feed(w);
      });
      w.on('error', reject);
      feed(w);
    }
  });
}

const hashOf = (parts) => crypto.createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 16);

/** 데이터 폴더가 없으면 멈춘다(샘플로 조용히 바꾸지 않음). */
export function requireDataDir(dataDir) {
  if (!fs.existsSync(dataDir)) {
    console.error(`실제 도면 폴더가 없습니다: ${dataDir}\nDrive 도면_논문/1download.tar를 받아 TL_SPA.zip.part0을 이 폴더에 푸십시오.`);
    process.exit(1);
  }
}

/** 반환: { real: 세대 행 목록(파일 이름 순서), census, cacheKey, cached } */
export async function loadRealUnits({ root, dataDir, threads = defaultThreads(), noCache = false }) {
  requireDataDir(dataDir);
  const modelDir = path.join(root, 'src', 'model');
  const codeHash = hashOf([
    ...fs.readdirSync(modelDir).sort().map((f) => fs.readFileSync(path.join(modelDir, f), 'utf8')),
    fs.readFileSync(path.join(root, 'scripts', 'lib', 'term-measure.mjs'), 'utf8'),
  ]);
  const realFiles = fs.readdirSync(dataDir).filter((f) => f.startsWith(PREFIX) && f.endsWith('.json')).sort();
  const derivedDir = path.join(dataDir, '..', 'derived');
  fs.mkdirSync(derivedDir, { recursive: true });
  const unitsPath = path.join(derivedDir, 'real-units.jsonl');
  const metaPath = path.join(derivedDir, 'real-units.meta.json');
  const cacheKey = hashOf([codeHash, ...realFiles]);
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : null;
  if (!noCache && meta?.key === cacheKey && fs.existsSync(unitsPath)) {
    const real = fs.readFileSync(unitsPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    console.log(`실제 도면: 캐시 사용(${meta.key}) ${meta.census.drawings}장, 측정 ${real.length}세대`);
    return { real, census: meta.census, cacheKey, cached: true };
  }
  console.log(`실제 도면 ${realFiles.length}장 측정(${threads}스레드)`);
  const CHUNK = 40;
  const jobs = [];
  for (let i = 0; i < realFiles.length; i += CHUNK) jobs.push({ type: 'real', dataDir, files: realFiles.slice(i, i + CHUNK) });
  const res = await runPool(jobs, threads);
  const real = res.flatMap((r) => r.rows); // 묶음 순서 = 파일 이름 순서라 결과 순서가 실행마다 같다
  const census = { drawings: 0, noEntranceDrawings: 0, units: 0, noLiving: 0 };
  for (const r of res) for (const k in census) census[k] += r.census[k];
  fs.writeFileSync(unitsPath, real.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(metaPath, JSON.stringify({ key: cacheKey, codeHash, files: realFiles.length, census, createdAt: new Date().toISOString() }, null, 1));
  return { real, census, cacheKey, cached: false };
}

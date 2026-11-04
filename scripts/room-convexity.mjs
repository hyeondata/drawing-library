// 실 다각형의 볼록성(넓이 ÷ 볼록 껍질 넓이)과 직사각형도(넓이 ÷ 최소 외접 직사각형 넓이)를 실 유형별로 잰다(dev, test 미사용).
// 왜: 공간구문은 볼록 공간을 노드로 쓰는데 AI 허브 거실 라벨이 복도·식당 영역을 포함한 비볼록 다각형인지 확인(Confluence 09-15 12절).
// 사용: node scripts/room-convexity.mjs
import fs from 'node:fs';
import path from 'node:path';
import { analyze } from '../src/model/index.js';
import { minAreaRect, convexHull, polygonArea } from '../src/model/geometry.js';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'..','aihub-full','TL_SPA');
const test=new Set(JSON.parse(fs.readFileSync(path.join(root,'data/split.json'),'utf8')).test);
const files=fs.readdirSync(dir).filter(f=>f.startsWith('APT_FP_SPA_')&&!test.has(f));
const R={};
for(const f of files){const a=analyze(JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')),'SPA',{unitRule:'entrance'});
 for(const s of a.spaces){ if(!['거실','침실','주방','기타'].includes(s.type))continue;
  const pts=s.polys.flat(); const hull=convexHull(pts); const ha=Math.abs(polygonArea(hull)); const ar=s.polys.reduce((t,p)=>t+Math.abs(polygonArea(p)),0);
  const m=minAreaRect(s.polys); 
  (R[s.type]??=[]).push([ar/ha, ar/m.area]);}}
for(const [k,v] of Object.entries(R)){const so=v.map(x=>x[0]).sort((a,b)=>a-b), re=v.map(x=>x[1]).sort((a,b)=>a-b);const q=(a,p)=>a[Math.floor(p*a.length)];
 console.log(k,v.length,'solidity median',q(so,.5).toFixed(2),'p10',q(so,.1).toFixed(2),'| rectangularity median',q(re,.5).toFixed(2),'p10',q(re,.1).toFixed(2),'| share rect<0.85',(re.filter(x=>x<0.85).length/re.length).toFixed(2));}

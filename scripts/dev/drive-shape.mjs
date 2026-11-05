// 개발 확인용: 헤드리스 Chrome(CDP)으로 로컬 미리보기(astro preview)의 도면 생성 화면을 끝까지 눌러 SA 30초 실행을 지켜보고 스크린샷을 찍는다.
// 사용: node scripts/dev/drive-sa.mjs http://localhost:4329/ /tmp/sa1.png
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const URL_ = process.argv[2] || 'http://localhost:4329/';
const OUT = process.argv[3] || '/tmp/sa1.png';
const chrome = spawn('google-chrome', ['--headless=new', '--remote-debugging-port=9335', '--window-size=1300,2000', '--user-data-dir=/tmp/drive-sa-profile', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const tabs = await (await fetch('http://127.0.0.1:9335/json')).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let n = 0;
const pend = {};
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend[m.id]) pend[m.id](m);
  if (m.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(m.params.exceptionDetails).slice(0, 600));
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) console.log('CONSOLE', m.params.type, JSON.stringify(m.params.args).slice(0, 400));
};
const cmd = (method, params = {}) => new Promise((r) => { const id = ++n; pend[id] = r; ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? JSON.stringify(r.result); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (f) => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); };
await cmd('Page.enable'); await cmd('Runtime.enable');
await cmd('Page.navigate', { url: URL_ });
await sleep(4000);
const SHAPE = process.argv[4] || 'o8';
console.log('note', await ev(`document.querySelector('input[name=shape][value="${SHAPE}"]').closest('.gen-opt').innerText.split(String.fromCharCode(10)).join(' | ')`));
await ev(`document.querySelector('input[name=shape][value="${SHAPE}"]').click()`);
await ev(`for (let i = 0; i < 8; i++) document.querySelector('#gen-next').click()`);
await sleep(4000); console.log('t=4', await ev(`document.querySelector('#gen-progress-text').innerText + ' | algosHidden=' + document.querySelector('#gen-algos').hidden + ' ffHidden=' + document.querySelector('#gen-ff').hidden`));
await sleep(36000);
console.log('result', await ev(`JSON.stringify({ resultHidden: document.querySelector('#gen-result').hidden, ffHidden: document.querySelector('#gen-ff').hidden, cap: (document.querySelector('#gen-plan figcaption')?.innerText || document.querySelector('#gen-ff-detail')?.innerText || '').slice(0, 400) })`));
await ev(`(document.querySelector('#gen-plan svg') || document.querySelector('#gen-ff-plan'))?.scrollIntoView()`); await sleep(500);
await shot(OUT);
console.log('errs', await ev(`JSON.stringify(window.__e || [])`));
chrome.kill();
process.exit(0);

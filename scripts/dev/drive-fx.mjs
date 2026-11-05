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
await ev(`for (let i = 0; i < 8; i++) document.querySelector('#gen-next').click()`);
await sleep(38000);
await ev(`window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message) + ' @' + e.lineno + ':' + e.colno + ' ' + (e.error && e.error.stack || '').slice(0, 800)))`);
console.log('controls', await ev(`JSON.stringify([...document.querySelectorAll('#fx-controls input')].map(i => ({ key: i.dataset.fx, type: i.type, v: i.value, min: i.min, max: i.max })))`));
const plan = () => ev(`(document.querySelector('#fx-plan svg')?.outerHTML || '').length + ':' + [...(document.querySelector('#fx-plan svg')?.querySelectorAll('rect') || [])].slice(0,40).map(r => r.getAttribute('x') + ',' + r.getAttribute('width')).join(';').length`);
const planHash = () => ev(`(() => { const s = document.querySelector('#fx-plan svg')?.outerHTML || ''; let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; })()`);
const cards = () => ev(`document.querySelector('#fx-cards')?.innerText.slice(0, 120)`);
console.log('fx cards', await ev(`[...document.querySelectorAll('#fx-cards h4, #fx-cards b, #fx-cards .gen-fx-card > *:first-child')].slice(0,12).map(e => e.innerText.slice(0,30)).join(' | ')`));
for (const k of ['depth', 'frontShare', 'bedWidth', 'masterDepth']) {
  const before = await planHash();
  const r = await ev(`(() => { const i = [...document.querySelectorAll('#fx-controls input[type=range]')].find(x => (x.dataset.fx || '').includes('${k}')); if (!i) return 'no input'; const v = Number(i.value); i.value = String(Math.min(Number(i.max), v + (Number(i.max) - Number(i.min)) * 0.3)); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return v + ' -> ' + i.value; })()`);
  await sleep(600);
  const after = await planHash();
  console.log('slider', k, r, 'plan changed:', before !== after);
}
const rd = () => ev(`document.querySelector('#proc-count').innerText.replace(' ', '') + '/cur' + document.querySelector('[data-stage][aria-current="step"]')?.dataset.stage + '/plan' + (document.querySelector('#proc-plan svg') ? 'ok' : 'none') + '/' + document.querySelector('#proc-text').innerText.slice(0, 18).replace(/\s+/g, ' ')`);
const st = [];
for (let i = 1; i <= 8; i++) { await ev(`document.querySelector('[data-stage="${i}"]').click()`); await sleep(400); st.push(`${i}→${await rd()}`); }
console.log('stages\n' + st.join('\n'));
await ev(`document.querySelector('[data-stage="1"]').click()`); await sleep(300);
const nx = [];
for (let i = 0; i < 8; i++) { await ev(`document.querySelector('#proc-next').click()`); await sleep(300); nx.push((await rd()).split('/cur')[0]); }
console.log('next', nx.join(' '));
const pv = [];
for (let i = 0; i < 8; i++) { await ev(`document.querySelector('#proc-prev').click()`); await sleep(300); pv.push((await rd()).split('/cur')[0]); }
console.log('prev', pv.join(' '));
await ev(`document.querySelector('#proc-play').click()`); await sleep(1600 * 3 + 500); console.log('autoplay after ~5s', (await rd()).split('/cur')[0]);
await ev(`document.querySelector('[data-cand="1"]')?.click()`); await sleep(500); await ev(`document.querySelector('[data-stage="6"]').click()`); await sleep(300); console.log('2안 tab, stage 6', await rd());
for (const k of [3, 4, 5]) { await ev(`document.querySelector('[data-stage="${k}"]').click()`); await sleep(300); console.log('stage', k, 'text:', await ev(`document.querySelector('#proc-text').innerText.slice(0, 160)`)); console.log('  rules:', await ev(`[...document.querySelectorAll('#proc-method .gr-text')].map(e => e.innerText.slice(0, 70)).join(' || ')`)); console.log('  run:', await ev(`document.querySelector('#proc-method .proc-run')?.innerText.slice(0, 200) || ''`)); }
console.log('errs', await ev(`JSON.stringify(window.__errs)`));
chrome.kill();
process.exit(0);

// 생성 결과의 '평면 진단': 한국 아파트 평가 지표, 동선 깊이·거리, 채광·환기, 후보 비교와 다양성.
// 근거와 계산은 src/generate/metrics.js 머리말, 조사 보고서는 reports/평면 생성 화면 추가 시각화.md
import { ASSUME, DIRS, diagnose, dirName, diversity, solarAccess } from '../generate/metrics.js';
import { STATUS, compareGraph } from '../generate/request-graph.js';
import { compass, sunTimeline } from '../generate/sun-view.js';
import { analyze } from '../model/index.js';
import { jpgSvg } from '../generate/syntax-view.js';
import { toLabel } from '../generate/layout.js';
import { SYNTAX, SYNTAX_LAMBDA } from '../generate/syntax-weights.js';

// 공간구문 변수의 문헌 범위(근거 문서 02): 거실/침실·주방/침실 비는 Byun & Choi 2016 표에서 계산한 거실 중심 군집 범위.
const SX_INFO = {
  livingBedroomRatio: { label: '거실/침실 통합도 비', ref: 'Byun & Choi 2016(SCIE)', range: '거실 중심 군집 1.56~2.29', pref: 'livingCentral' },
  kitchenBedroomRatio: { label: '주방/침실 통합도 비', ref: 'Byun & Choi 2016(SCIE)', range: '1.04~1.58', pref: 'kitchenLink' },
  genotypeTau: { label: '거실 중심 유전형 순위 부합도 τ', ref: 'Hillier 외 1987(SSCI)', range: '1에 가까울수록 거실>주방>…>침실 순', pref: 'livingCentral' },
  privacyDepthGap: { label: '공·사 깊이 차(침실 − 거실·주방)', ref: 'Ham & Lee 2017(SCIE·SSCI)', range: '클수록 침실이 깊음(사적)', pref: 'privacy' },
};

function jpgFor(layout, unit) {
  const nodes = unit.nodes.filter((nd) => !['발코니', '실외기실'].includes(nd.type)).map((nd) => ({ id: nd.space, name: layout.rooms[nd.space]?.name || nd.type, depth: nd.depth, integration: nd.integration, x: layout.rooms[nd.space]?.x ?? 0 }));
  return jpgSvg(nodes, unit.edges);
}

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const OUTDOOR = new Set(['발코니', '실외기실']);
// 도면은 흰 종이 위에 그리므로 화면 테마와 무관한 고정색. 깊이 = 사이트의 '현관 기준 깊이' 색(--depth-*, 밝은 테마 값).
const DEPTH = ['#d6e6fa', '#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];
const ink = (k) => (k >= 3 ? '#fff' : '#1b1b1f');
const OK = '#0f7b0f';
const BAD = '#c4314b';

const st = { mode: 'circ', target: 'master', front: 180, lat: 37.57 };


/** 요청한 연결(선)을 생성 평면(실) 위에 겹쳐 그린다. */
function graphSvg(layout, g) {
  const S = 40;
  const pad = 56;
  const rooms = layout.rooms;
  const minY = Math.min(0, ...rooms.map((r) => r.y));
  const maxY = Math.max(...rooms.map((r) => r.y + r.h));
  const maxX = Math.max(...rooms.map((r) => r.x + r.w));
  const X = (x) => pad + x * S;
  const Y = (y) => pad + (y - minY) * S;
  const by = Object.fromEntries(rooms.map((r) => [r.key, r]));
  const c = (r) => [X(r.x + r.w / 2), Y(r.y + r.h / 2)];
  const p = [`<rect width="${maxX * S + pad * 2}" height="${(maxY - minY) * S + pad * 2}" fill="#fff"/>`];
  for (const r of rooms) {
    const out = OUTDOOR.has(r.type);
    p.push(`<rect x="${X(r.x)}" y="${Y(r.y)}" width="${r.w * S}" height="${r.h * S}" fill="${out ? '#f4f4f1' : '#f7f6f2'}" stroke="#b9b7c2" stroke-width="1.2"${out ? ' stroke-dasharray="5 4"' : ''}/>`);
  }
  // 선: 같은 두 실 사이 선이 겹치지 않게 살짝 휜다.
  const seen = new Map();
  for (const e of g.pairs) {
    const a = by[e.a];
    const b = by[e.hit];
    if (!a || !b) continue;
    const st2 = STATUS[e.status];
    const [x1, y1] = c(a);
    const [x2, y2] = c(b);
    const key = [e.a, e.hit].sort().join('|');
    const k = seen.get(key) || 0;
    seen.set(key, k + 1);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const bend = (k % 2 ? -1 : 1) * (10 + 14 * k);
    const qx = mx + (-(y2 - y1) / len) * bend;
    const qy = my + ((x2 - x1) / len) * bend;
    const w = e.status === 'kept' ? 2 : 4.5;
    p.push(`<path d="M${x1} ${y1}Q${qx} ${qy} ${x2} ${y2}" fill="none" stroke="${st2.color}" stroke-width="${w}" stroke-linecap="round"${st2.dash ? ` stroke-dasharray="${st2.dash}"` : ''} opacity="${e.status === 'kept' ? 0.7 : 0.95}"><title>${esc(e.label)}: ${esc(st2.label)}</title></path>`);
    if (e.status === 'violated') p.push(`<text x="${qx}" y="${qy + 5}" text-anchor="middle" font-size="16" font-weight="800" fill="${st2.color}">✕</text>`);
    if (e.status === 'missing') p.push(`<text x="${qx}" y="${qy + 5}" text-anchor="middle" font-size="15" font-weight="800" fill="${st2.color}">?</text>`);
  }
  for (const r of rooms) {
    if (OUTDOOR.has(r.type)) continue;
    const [x, y] = c(r);
    const used = g.pairs.some((e) => e.a === r.key || e.hit === r.key);
    p.push(`<circle cx="${x}" cy="${y}" r="${used ? 7 : 4}" fill="${used ? '#2b2a33' : '#b9b7c2'}" stroke="#fff" stroke-width="2"/>`);
    const small = r.w * S < 70 || r.h * S < 46;
    p.push(`<text x="${x}" y="${y - 12}" text-anchor="middle" font-size="${small ? 10 : 12.5}" font-weight="600" fill="#22212b" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(r.name)}</text>`);
  }
  p.push(compass(maxX * S + pad * 2 - 46, 46, st.front));
  return `<svg viewBox="0 0 ${maxX * S + pad * 2} ${(maxY - minY) * S + pad * 2}" role="img" aria-label="요청한 연결과 생성 결과 겹쳐 보기">${p.join('')}</svg>`;
}

function planSvg(layout, d, mode, target) {
  const S = 40;
  const pad = 56;
  const rooms = layout.rooms;
  const minY = Math.min(0, ...rooms.map((r) => r.y));
  const maxY = Math.max(...rooms.map((r) => r.y + r.h));
  const maxX = Math.max(...rooms.map((r) => r.x + r.w));
  const X = (x) => pad + x * S;
  const Y = (y) => pad + (y - minY) * S;
  const vw = maxX * S + pad * 2;
  const vh = (maxY - minY) * S + pad * 2;
  const p = [`<rect width="${vw}" height="${vh}" fill="#fff"/>`];
  const light = Object.fromEntries(d.light.map((l) => [l.key, l]));
  const bay = new Set(d.kr.bayRooms);
  for (const r of rooms) {
    const out = OUTDOOR.has(r.type);
    let fill = out ? '#f4f4f1' : '#fafafa';
    let label = '';
    let txt = '#1b1b1f';
    if (mode === 'circ' && !out) {
      const dep = d.circ.depth[r.key];
      fill = dep === undefined ? '#fde4e8' : DEPTH[Math.min(dep, DEPTH.length - 1)];
      if (dep !== undefined) txt = ink(Math.min(dep, DEPTH.length - 1));
      label = dep === undefined ? '도달 불가' : `깊이 ${dep}`;
    }
    if (mode === 'light') {
      const l = light[r.key];
      if (l) {
        const ok = l.lightOk && l.ventOk;
        fill = ok ? '#e3f4e3' : '#fde4e8';
        const so = d.sol?.find((x) => x.key === r.key);
        label = `${ok ? '✓' : '✗'} 채광 ${(l.light * 100).toFixed(0)}%\n환기 ${(l.vent * 100).toFixed(0)}%${so ? `\n${so.facingName}향 · 일조 ${so.total.toFixed(1)}h` : ''}`;
      }
    }
    const strong = mode === 'light' && bay.has(r.name);
    p.push(`<rect x="${X(r.x)}" y="${Y(r.y)}" width="${r.w * S}" height="${r.h * S}" fill="${fill}" stroke="${strong ? '#e8590c' : '#555'}" stroke-width="${strong ? 3 : 1.2}"${out ? ' stroke-dasharray="5 4"' : ''}/>`);
    const cx = X(r.x + r.w / 2);
    const cy = Y(r.y + r.h / 2);
    const small = r.w * S < 70 || r.h * S < 46;
    p.push(`<text x="${cx}" y="${cy - (label && !small ? 6 : 0)}" text-anchor="middle" font-size="${small ? 10 : 13}" font-weight="600" fill="${txt}">${esc(r.name)}</text>`);
    if (label && !small) label.split('\n').forEach((ln, i) => p.push(`<text x="${cx}" y="${cy + 12 + i * 13}" text-anchor="middle" font-size="11" fill="${txt}">${esc(ln)}</text>`));
  }
  if (mode === 'circ') {
    for (const l of d.circ.links) {
      const a = rooms.find((r) => r.key === l.a);
      const b = rooms.find((r) => r.key === l.b);
      p.push(`<polyline points="${[a, l.p, b].map((q) => (q.w ? `${X(q.x + q.w / 2)},${Y(q.y + q.h / 2)}` : `${X(q.x)},${Y(q.y)}`)).join(' ')}" fill="none" stroke="#666" stroke-width="1.2" stroke-dasharray="3 3"/>`);
    }
    const path = d.circ.pathTo(target);
    if (path.length > 1) {
      p.push(`<polyline points="${path.map((q) => `${X(q.x)},${Y(q.y)}`).join(' ')}" fill="none" stroke="#e8590c" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>`);
      const e = path[path.length - 1];
      p.push(`<circle cx="${X(e.x)}" cy="${Y(e.y)}" r="6" fill="#e8590c"/>`);
    }
    if (d.circ.entry) p.push(`<circle cx="${X(d.circ.entry.x)}" cy="${Y(d.circ.entry.y)}" r="7" fill="#fff" stroke="#e8590c" stroke-width="3"/><text x="${X(d.circ.entry.x) + 10}" y="${Y(d.circ.entry.y) - 8}" font-size="11" fill="#e8590c" font-weight="700">현관문</text>`);
  } else {
    // 앞(발코니 쪽) 방위, 베이 번호, 맞통풍 화살표
    const yF = Y(layout.D) + (rooms.some((r) => r.type === '발코니') ? 1.5 * S : 0);
    p.push(`<text x="${vw / 2}" y="${Math.min(vh - 8, yF + 26)}" text-anchor="middle" font-size="12" fill="#e8590c" font-weight="700">▼ 앞쪽 = ${dirName(st.front)}향(${Math.round(st.front)}°) · ${d.kr.bays}베이</text>`);
    const front = rooms.filter((r) => d.kr.bayRooms.includes(r.name)).sort((a, b) => a.x - b.x);
    front.forEach((r, i) => p.push(`<circle cx="${X(r.x + r.w) - 15}" cy="${Y(r.y) + 15}" r="10" fill="#e8590c"/><text x="${X(r.x + r.w) - 15}" y="${Y(r.y) + 19}" text-anchor="middle" font-size="11" fill="#fff" font-weight="700">${i + 1}</text>`));
    if (d.kr.cross) {
      const x = X(0) - 24;
      p.push(`<defs><marker id="dg-ar" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="#0b7285"/></marker></defs>`);
      p.push(`<line x1="${x}" y1="${Y(0) + 6}" x2="${x}" y2="${Y(layout.D) - 6}" stroke="#0b7285" stroke-width="3" marker-end="url(#dg-ar)" marker-start="url(#dg-ar)"/><text x="${x}" y="${Y(0) - 10}" text-anchor="middle" font-size="11" fill="#0b7285" font-weight="700">맞통풍</text>`);
    }
  }
  p.push(compass(vw - 46, 46, st.front));
  return `<svg viewBox="0 0 ${vw} ${vh}" role="img" aria-label="${mode === 'circ' ? '동선 깊이와 경로' : '베이·채광·환기'}">${p.join('')}</svg>`;
}

const fmt = (v, u = 'm') => (v === undefined || v === null ? '—' : `${v.toFixed(1)}${u}`);
const yes = (b, t = '예', f = '아니오') => (b ? `<span class="good-text">✓ ${t}</span>` : `<span class="error-text">✗ ${f}</span>`);

export function renderDiagnosis({ top, current, spec }) {
  const box = $('#gen-diag');
  if (!box || !top?.length) return;
  const c = top[current];
  const d = diagnose(c.layout);
  d.sol = solarAccess(c.layout, { front: st.front, lat: st.lat });
  const kr = d.kr;
  const targets = [
    ['master', '안방'],
    ['kitchen', '주방'],
    ['living', '거실'],
    ...c.layout.rooms.filter((r) => r.type === '침실' && r.key !== 'master').map((r) => [r.key, r.name]),
    ...c.layout.rooms.filter((r) => r.type === '화장실').map((r) => [r.key, r.name]),
  ].filter(([k]) => c.layout.rooms.some((r) => r.key === k));
  if (!targets.some(([k]) => k === st.target)) st.target = targets[0]?.[0];

  const g = compareGraph(spec, c.layout);
  const sxa = analyze(toLabel(c.layout), 'SPA');
  const sxu = sxa.units[0];
  const sxv = sxu.features || {};
  const wantN = g.pairs.filter((e) => e.kind === 'want').length;
  const avoidN = g.pairs.length - wantN;
  const cards = [
    ['요청한 연결', `${g.counts.met}/${wantN} 충족`, `문 없이 맞닿음 ${g.counts.wall} · 빠짐 ${g.counts.missing} · 어김 ${g.counts.violated}/${avoidN}`, '요청 그래프와 결과 그래프 비교(그래프 편집 거리 간이판)'],
    ['전용면적', `${kr.exclusive.toFixed(1)}㎡`, kr.nationalSize ? '국민주택규모(85㎡ 이하)' : '국민주택규모 초과', '주택법 제2조제6호'],
    ['베이', `${kr.bays}베이`, kr.bayRooms.join(' · '), '앞쪽에 닿은 거실·침실 수(법 정의 없음, 시장 관행)'],
    (() => {
      const lv = d.sol.find((x) => x.key === 'living');
      const okN = d.sol.filter((x) => x.type !== '주방' && x.ok).length;
      const hab = d.sol.filter((x) => x.type !== '주방').length;
      return ['거실 향 · 동지 일조', lv ? `${lv.facingName}향 · ${lv.total.toFixed(1)}h` : '—', lv ? `09~15시 연속 ${lv.cont.toFixed(1)}h · 판례 기준 충족 실 ${okN}/${hab}` : '거실 창 없음', '장애물 없을 때 최대치(대법원 98다23850)'];
    })(),
    ['맞통풍', kr.cross ? '있음' : '없음', kr.cross ? '앞·뒤 바깥 창이 공용 공간으로 이어짐' : '앞·뒤 창이 공용 공간으로 이어지지 않음', '시장 관행'],
    ['발코니(서비스)', `${kr.service.toFixed(1)}㎡`, spec.balcony ? '전용면적에 들지 않음' : '확장형(발코니 없음)', '주택법 시행규칙 제2조'],
    ['현관 → 주방', fmt(d.walk.kitchen), '장보기 동선(문 중심을 지나는 거리)', '동선 거리'],
    ['현관 → 안방', fmt(d.walk.master), d.masterDepth !== undefined ? `문 ${d.masterDepth}번 지남(깊을수록 사적)` : '도달 불가', '공간구문 깊이'],
    ['평균 깊이', d.circ.meanDepth === null ? '—' : d.circ.meanDepth.toFixed(2), '현관에서 모든 실까지 지나는 문 수의 평균', '공간구문 평균 깊이'],
    ['욕실 · 수납', `${kr.baths}개 · ${(kr.storageShare * 100).toFixed(0)}%`, `침실 ${kr.beds}개, 드레스룸·다목적실 ${kr.storage.toFixed(1)}㎡`, '수납 = 전용면적 대비'],
  ];
  const lightRows = d.light
    .map((l) => `<tr><td>${esc(l.name)}${l.type === '주방' ? ' <span class="note">(참고)</span>' : ''}</td><td class="mono">${l.area.toFixed(1)}</td><td class="mono">${(l.light * 100).toFixed(0)}% ${yes(l.lightOk, '', '')}</td><td class="mono">${(l.vent * 100).toFixed(0)}% ${yes(l.ventOk, '', '')}</td><td>${l.viaBalcony ? '발코니 문 경유' : '바깥 창'}</td></tr>`)
    .join('');

  // 후보 비교
  const all = top.map((t) => ({ t, d: diagnose(t.layout) }));
  const div = top.length > 1 ? diversity(top.map((t) => t.layout)) : null;
  const devOf = (t) => {
    const keys = ['living', 'kitchen', 'master'];
    const errs = keys.map((k) => Math.abs((t.actual[k] - spec.targets[k] * spec.area) / (spec.targets[k] * spec.area)) * 100);
    return errs.reduce((s, e) => s + e, 0) / errs.length;
  };
  const cmpRows = all
    .map(({ t, d: dd }, i) => {
      const meanDiv = div ? div[i].reduce((s, v) => s + v, 0) / (div.length - 1) : null;
      return `<tr data-cand="${i}"${i === current ? ' class="on"' : ''}><td><b>${esc(t.tabLabel || `${i + 1}안`)}</b></td><td class="mono">${dd.kr.bays}</td><td>${dd.kr.cross ? '✓' : '✗'}</td><td class="mono">${fmt(dd.walk.kitchen)}</td><td class="mono">${fmt(dd.walk.master)}</td><td class="mono">${devOf(t).toFixed(1)}%</td><td class="mono">${dd.lightFail}</td><td class="mono">${t.doorIssues || 0}</td><td class="mono">${(() => { const gg = compareGraph(spec, t.layout); return `${gg.counts.met}/${gg.pairs.filter((e) => e.kind === 'want').length} · ${gg.counts.violated}`; })()}</td><td class="mono">${meanDiv === null ? '—' : meanDiv.toFixed(2)}</td></tr>`;
    })
    .join('');
  const divSvg = div
    ? (() => {
        const n = div.length;
        const s = 34;
        const off = 44;
        const cells = [];
        for (let i = 0; i < n; i++) {
          cells.push(`<text x="${off - 6}" y="${off + i * s + s / 2 + 4}" text-anchor="end" font-size="11" fill="currentColor">${i + 1}안</text>`);
          cells.push(`<text x="${off + i * s + s / 2}" y="${off - 8}" text-anchor="middle" font-size="11" fill="currentColor">${i + 1}안</text>`);
          for (let j = 0; j < n; j++) {
            const v = div[i][j];
            const k = Math.min(DEPTH.length - 1, Math.round(v * (DEPTH.length - 1) * 1.6));
            cells.push(`<rect x="${off + j * s + 1}" y="${off + i * s + 1}" width="${s - 2}" height="${s - 2}" rx="3" fill="${i === j ? 'transparent' : DEPTH[k]}" stroke="${i === j ? 'currentColor' : 'none'}" stroke-opacity="0.2"><title>${i + 1}안 ↔ ${j + 1}안: ${(v * 100).toFixed(0)}% 칸이 다른 실</title></rect>`);
            if (i !== j) cells.push(`<text x="${off + j * s + s / 2}" y="${off + i * s + s / 2 + 4}" text-anchor="middle" font-size="10" fill="${ink(k)}">${(v * 100).toFixed(0)}</text>`);
          }
        }
        return `<svg viewBox="0 0 ${off + n * s + 4} ${off + n * s + 4}" class="gen-diag-div" role="img" aria-label="후보 사이 다른 정도(%)">${cells.join('')}</svg>`;
      })()
    : '';

  box.innerHTML = `
    <div class="gen-process-head">
      <h3>평면 진단</h3>
    </div>
    <p class="note">한국 아파트를 고를 때 보는 기준(국민주택규모·베이·맞통풍·동선·향)과 법규의 채광·환기 비율을 이 안에서 바로 잽니다. 실제 단지의 방위를 넣으면 실마다 향과 동지 일조 시간이 바뀝니다(기본: 앞쪽 남향, 서울 위도).</p>
    <div class="gen-diag-orient">
      <span>앞쪽(발코니 쪽)이 바라보는 방위</span>
      <div class="seg ff-wrap" role="group" id="diag-dir">${DIRS.map(([az, n]) => `<button type="button" data-az="${az}" aria-pressed="${Math.round(st.front) === az}">${n}</button>`).join('')}</div>
      <label>각도 <input type="number" id="diag-az" min="0" max="359" step="1" value="${Math.round(st.front)}" />°</label>
      <label>위도 <input type="number" id="diag-lat" min="33" max="39" step="0.01" value="${st.lat}" />°N</label>
    </div>
    <div class="gen-diag-cards">${cards
      .map(([k, v, sub, src]) => `<div><span class="gen-k">${esc(k)}</span><b class="mono">${esc(v)}</b><span class="note">${esc(sub)}</span><span class="gen-src">${esc(src)}</span></div>`)
      .join('')}</div>
    <div class="gen-diag-body">
      <div class="gen-diag-view">
        <div class="seg" role="tablist" aria-label="진단 보기">
          <button type="button" data-dmode="circ" aria-pressed="${st.mode === 'circ'}">동선 깊이·경로</button>
          <button type="button" data-dmode="light" aria-pressed="${st.mode === 'light'}">베이·채광·환기</button>
          <button type="button" data-dmode="graph" aria-pressed="${st.mode === 'graph'}">요청한 연결</button>
          <button type="button" data-dmode="syntax" aria-pressed="${st.mode === 'syntax'}">공간구문</button>
        </div>
        ${st.mode === 'circ' ? `<label class="gen-diag-route">현관에서 <select id="diag-target">${targets.map(([k, n]) => `<option value="${k}"${k === st.target ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select> 까지 · <b class="mono">${fmt(d.circ.meters[st.target])}</b></label>` : ''}
        <figure class="gen-plan">${st.mode === 'syntax' ? jpgFor(c.layout, sxu) : st.mode === 'graph' ? graphSvg(c.layout, g) : planSvg(c.layout, d, st.mode, st.target)}</figure>
        ${st.mode === 'graph' ? `<ul class="gen-graph-legend">${Object.entries(STATUS).map(([k, v]) => `<li><svg width="34" height="10" aria-hidden="true"><line x1="2" y1="5" x2="32" y2="5" stroke="${v.color}" stroke-width="${k === 'kept' ? 2 : 4}" stroke-linecap="round"${v.dash ? ` stroke-dasharray="${v.dash}"` : ''}/></svg>${esc(v.label)} <b class="mono">${g.counts[k]}</b></li>`).join('')}</ul>` : ''}
        <p class="note">${
          st.mode === 'syntax'
            ? '정당화 그래프(justified plan graph): 현관을 맨 아래(깊이 0)에 두고, 맞닿은 실을 한 단계씩 위로 쌓았습니다. 숫자와 색은 실의 통합도(1/RRA, 진할수록 다른 실들에서 가깝게 닿는 중심 공간)입니다. 거실 중심형이면 거실이 가장 진하고, 침실은 위층(깊은 곳)에 놓입니다(Hillier & Hanson 1984; Byun & Choi 2016). 평가 모델과 같은 인접 그래프 규약입니다.'
            : st.mode === 'graph'
            ? '선은 조건에서 요청한 연결입니다(기본 규칙 + 고른 선호). 실 사이에 문 폭(0.9m) 이상 맞닿고 문·개구부가 있으면 충족, 맞닿기만 하면 문 없음, 떨어져 있으면 빠짐(?)입니다. 피해야 할 연결(예: 침실–현관)이 맞닿으면 어김(✕)입니다. 후보 실이 여럿인 요청(예: 현관–공용 공간)은 가장 잘 이어진 실로 선을 긋습니다. 평면 생성 논문의 요청 그래프–결과 그래프 비교 그림과 같은 방식입니다.'
            : st.mode === 'circ'
            ? '색이 진할수록 현관에서 문을 더 많이 지나야 닿는 실입니다(깊이). 공용 공간(현관·거실·주방)은 얕고, 침실·안방은 깊을수록 사생활이 지켜집니다. 점선은 문으로 이어진 실, 주황 선은 고른 실까지 걷는 경로입니다. 발코니 문은 이동 경로에서 뺐습니다.'
            : `굵은 테두리와 번호는 앞쪽에 닿은 거실·침실(베이)입니다. 칸의 비율은 창 면적 ÷ 바닥면적이며 법 기준은 채광 10%·환기 5% 이상입니다(건축물의 피난·방화구조 등의 기준에 관한 규칙 제17조). 도면에 창 높이가 없어 일반 창 ${ASSUME.windowH}m·발코니 문 ${ASSUME.slidingH}m, 여닫는 부분 ${ASSUME.openable * 100}%로 가정했습니다.`
        }</p>
      </div>
      ${st.mode === 'syntax' ? `<div>
        <h4>공간구문 변수(이 안)</h4>
        <table class="gen-table gen-graph-table"><thead><tr><th>변수</th><th>값</th><th>생성에 반영</th></tr></thead><tbody>${Object.entries(SX_INFO)
          .map(([k, info]) => {
            const val = sxv[k];
            const on = (spec.prefs || []).includes(info.pref);
            const cv = SYNTAX?.[k]?.cv?.[String(SYNTAX_LAMBDA)] || SYNTAX?.[k]?.cv?.[SYNTAX_LAMBDA];
            const cv0 = SYNTAX?.[k]?.cv?.['0'];
            return `<tr><td>${esc(info.label)}<br><span class="note">${esc(info.ref)} · ${esc(info.range)}</span></td><td class="mono">${Number.isFinite(val) ? val.toFixed(2) : '—'}</td><td>${on ? '<b class="good-text">✓ QUBO 대리 항 추가</b>' : '<span class="note">선호를 고르면 추가</span>'}${cv ? `<br><span class="note">대리 ρ ${cv.rho.toFixed(2)} · 최소 배치 백분위 ${Math.round(cv0.varPct * 100)}→${Math.round(cv.varPct * 100)}%</span>` : ''}</td></tr>`;
          })
          .join('')}</tbody></table>
        <p class="note">통합도·깊이는 그래프 전체를 따라가는 값이라 QUBO(이차식)에 그대로 넣을 수 없습니다. 그래서 조건 20개·배치 9,567개에서 이 변수들을 정확히 계산해 QUBO 항의 선형 결합으로 회귀한 '대리 항'을 만들었고, 공간구문 선호(거실 중심형·사생활·대면형 주방)를 고르면 그 항을 λ = ${SYNTAX_LAMBDA}로 에너지에 더합니다(Jin 2011의 대리 모델). '최소 배치 백분위'는 조건 단위 교차검증에서 에너지 최소 배치의 변수 값이 그 조건 안에서 몇 백분위인지를 대리 항 없을 때 → 있을 때로 보인 것입니다(evidence/results/syntax-surrogate.md).</p>
      </div>` : st.mode === 'graph' ? `<div>
        <h4>요청한 연결 ${g.pairs.length}개</h4>
        <table class="gen-table gen-graph-table"><thead><tr><th>요청</th><th>종류</th><th>결과</th><th>맞닿음</th></tr></thead><tbody>${g.pairs
          .map((e) => `<tr><td>${esc(e.label)}<br><span class="note">${esc(e.why)}</span></td><td>${e.kind === 'want' ? '원함' : '피함'}${e.strength === 'pref' ? ' <span class="chip">선호</span>' : ''}</td><td><span style="color:${STATUS[e.status].color};font-weight:700">${{ met: '✓ 충족', wall: '△ 문 없음', missing: '? 빠짐', violated: '✕ 어김', kept: '✓ 지킴' }[e.status]}</span><br><span class="note">${esc(c.layout.rooms.find((r) => r.key === e.hit)?.name || '')}</span></td><td class="mono">${e.contact.toFixed(1)}m</td></tr>`)
          .join('')}</tbody></table>
        <p class="note">간이 그래프 편집 거리 = 빠짐 + 어김 + 0.5 × 문 없음 = <b class="mono">${g.counts.ged}</b>(작을수록 요청과 같음). 연구에서는 요청 그래프와 결과에서 다시 만든 그래프의 편집 거리를 '부합도'로 씁니다(House-GAN, HouseDiffusion).</p>
      </div>` : `<div>
        <h4>채광·환기(거실·침실)</h4>
        <table class="gen-table"><thead><tr><th>실</th><th>㎡</th><th>채광 ≥10%</th><th>환기 ≥5%</th><th>빛</th></tr></thead><tbody>${lightRows}</tbody></table>
        <p class="note">주방은 법의 거실에 드는지 해석이 갈려 참고로만 보입니다.</p>
        <h4>향과 동지 일조(장애물 없음)</h4>
        ${sunTimeline(d.sol)}
        <p class="note">앞쪽 방위 ${Math.round(st.front)}°, 위도 ${st.lat}°, 동지(적위 −23.44°) 진태양시 08~16시를 5분 단위로 봅니다. 해가 지평선 위이고 창이 바라보는 방향과 해 방위의 차이가 85° 미만이면 해가 든다고 셉니다. 회색 띠는 연속 일조를 보는 09~15시입니다. 판례 기준은 총 4시간 또는 연속 2시간입니다(대법원 98다23850 등). 이웃 동·발코니 깊이·처마의 그림자는 넣지 않은 최대치라 실제 일조는 이보다 짧습니다.</p>
      </div>`}
    </div>
    ${
      top.length > 1
        ? `<h4>후보 비교</h4>
    <div class="gen-diag-cmp">
      <div class="gen-diag-scroll"><table class="gen-table gen-cmp-table"><thead><tr><th>안</th><th>베이</th><th>맞통풍</th><th>현관→주방</th><th>현관→안방</th><th>면적 오차↓</th><th>채광 미달</th><th>문 동선 문제</th><th>요청 연결 충족·어김</th><th>다른 안과 차이</th></tr></thead><tbody>${cmpRows}</tbody></table></div>
      ${divSvg}
    </div>
    <p class="note">면적 오차는 거실·주방·안방의 목표 대비 차이 평균입니다. '다른 안과 차이'는 평면을 40×20칸으로 맞춘 뒤 실 종류가 다른 칸의 비율이며(0 같음, 1 완전히 다름), 오른쪽 표는 두 안끼리의 값(%)입니다. 차이가 작으면 사실상 같은 안입니다. 행을 누르면 그 안을 봅니다.</p>`
        : ''
    }`;
  box.hidden = false;
  box.querySelectorAll('[data-dmode]').forEach((b) =>
    b.addEventListener('click', () => {
      st.mode = b.dataset.dmode;
      renderDiagnosis({ top, current, spec });
    }),
  );
  const setFront = (v) => {
    st.front = ((Number(v) % 360) + 360) % 360;
    renderDiagnosis({ top, current, spec });
  };
  box.querySelectorAll('#diag-dir [data-az]').forEach((b) => b.addEventListener('click', () => setFront(b.dataset.az)));
  $('#diag-az')?.addEventListener('change', (e) => setFront(e.target.value));
  $('#diag-lat')?.addEventListener('change', (e) => {
    st.lat = Math.min(39, Math.max(33, Number(e.target.value) || 37.57));
    renderDiagnosis({ top, current, spec });
  });
  $('#diag-target')?.addEventListener('change', (e) => {
    st.target = e.target.value;
    renderDiagnosis({ top, current, spec });
  });
  box.querySelectorAll('tr[data-cand]').forEach((tr) =>
    tr.addEventListener('click', () => document.querySelector(`#gen-tabs [data-cand="${tr.dataset.cand}"]`)?.click()),
  );
}

// 생성 결과의 '평면 진단': 한국 아파트 평가 지표, 동선 깊이·거리, 채광·환기, 후보 비교와 다양성.
// 근거와 계산은 src/generate/metrics.js 머리말, 조사 보고서는 reports/평면 생성 화면 추가 시각화.md
import { ASSUME, diagnose, diversity } from '../generate/metrics.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const OUTDOOR = new Set(['발코니', '실외기실']);
// 도면은 흰 종이 위에 그리므로 화면 테마와 무관한 고정색. 깊이 = 사이트의 '현관 기준 깊이' 색(--depth-*, 밝은 테마 값).
const DEPTH = ['#d6e6fa', '#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];
const ink = (k) => (k >= 3 ? '#fff' : '#1b1b1f');
const OK = '#0f7b0f';
const BAD = '#c4314b';

const st = { mode: 'circ', target: 'master' };

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
        label = `${ok ? '✓' : '✗'} 채광 ${(l.light * 100).toFixed(0)}%\n환기 ${(l.vent * 100).toFixed(0)}%`;
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
    // 앞(발코니 쪽) = 남향 가정, 베이 번호, 맞통풍 화살표
    const yF = Y(layout.D) + (rooms.some((r) => r.type === '발코니') ? 1.5 * S : 0);
    p.push(`<text x="${vw / 2}" y="${Math.min(vh - 8, yF + 26)}" text-anchor="middle" font-size="12" fill="#e8590c" font-weight="700">▼ 앞쪽 = 남향 가정 · ${d.kr.bays}베이</text>`);
    const front = rooms.filter((r) => d.kr.bayRooms.includes(r.name)).sort((a, b) => a.x - b.x);
    front.forEach((r, i) => p.push(`<circle cx="${X(r.x + r.w) - 15}" cy="${Y(r.y) + 15}" r="10" fill="#e8590c"/><text x="${X(r.x + r.w) - 15}" y="${Y(r.y) + 19}" text-anchor="middle" font-size="11" fill="#fff" font-weight="700">${i + 1}</text>`));
    if (d.kr.cross) {
      const x = X(0) - 24;
      p.push(`<defs><marker id="dg-ar" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="#0b7285"/></marker></defs>`);
      p.push(`<line x1="${x}" y1="${Y(0) + 6}" x2="${x}" y2="${Y(layout.D) - 6}" stroke="#0b7285" stroke-width="3" marker-end="url(#dg-ar)" marker-start="url(#dg-ar)"/><text x="${x}" y="${Y(0) - 10}" text-anchor="middle" font-size="11" fill="#0b7285" font-weight="700">맞통풍</text>`);
    }
  }
  return `<svg viewBox="0 0 ${vw} ${vh}" role="img" aria-label="${mode === 'circ' ? '동선 깊이와 경로' : '베이·채광·환기'}">${p.join('')}</svg>`;
}

const fmt = (v, u = 'm') => (v === undefined || v === null ? '—' : `${v.toFixed(1)}${u}`);
const yes = (b, t = '예', f = '아니오') => (b ? `<span class="good-text">✓ ${t}</span>` : `<span class="error-text">✗ ${f}</span>`);

export function renderDiagnosis({ top, current, spec }) {
  const box = $('#gen-diag');
  if (!box || !top?.length) return;
  const c = top[current];
  const d = diagnose(c.layout);
  const kr = d.kr;
  const targets = [
    ['master', '안방'],
    ['kitchen', '주방'],
    ['living', '거실'],
    ...c.layout.rooms.filter((r) => r.type === '침실' && r.key !== 'master').map((r) => [r.key, r.name]),
    ...c.layout.rooms.filter((r) => r.type === '화장실').map((r) => [r.key, r.name]),
  ].filter(([k]) => c.layout.rooms.some((r) => r.key === k));
  if (!targets.some(([k]) => k === st.target)) st.target = targets[0]?.[0];

  const cards = [
    ['전용면적', `${kr.exclusive.toFixed(1)}㎡`, kr.nationalSize ? '국민주택규모(85㎡ 이하)' : '국민주택규모 초과', '주택법 제2조제6호'],
    ['베이', `${kr.bays}베이`, kr.bayRooms.join(' · '), '앞쪽에 닿은 거실·침실 수(법 정의 없음, 시장 관행)'],
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
      return `<tr data-cand="${i}"${i === current ? ' class="on"' : ''}><td><b>${esc(t.tabLabel || `${i + 1}안`)}</b></td><td class="mono">${dd.kr.bays}</td><td>${dd.kr.cross ? '✓' : '✗'}</td><td class="mono">${fmt(dd.walk.kitchen)}</td><td class="mono">${fmt(dd.walk.master)}</td><td class="mono">${devOf(t).toFixed(1)}%</td><td class="mono">${dd.lightFail}</td><td class="mono">${t.doorIssues || 0}</td><td class="mono">${meanDiv === null ? '—' : meanDiv.toFixed(2)}</td></tr>`;
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
    <p class="note">한국 아파트를 고를 때 보는 기준(국민주택규모·베이·맞통풍·동선)과 법규의 채광·환기 비율을 이 안에서 바로 잽니다. 도면 기하만으로 계산하며, 앞쪽(발코니 쪽)을 남향으로 가정합니다.</p>
    <div class="gen-diag-cards">${cards
      .map(([k, v, sub, src]) => `<div><span class="gen-k">${esc(k)}</span><b class="mono">${esc(v)}</b><span class="note">${esc(sub)}</span><span class="gen-src">${esc(src)}</span></div>`)
      .join('')}</div>
    <div class="gen-diag-body">
      <div class="gen-diag-view">
        <div class="seg" role="tablist" aria-label="진단 보기">
          <button type="button" data-dmode="circ" aria-pressed="${st.mode === 'circ'}">동선 깊이·경로</button>
          <button type="button" data-dmode="light" aria-pressed="${st.mode === 'light'}">베이·채광·환기</button>
        </div>
        ${st.mode === 'circ' ? `<label class="gen-diag-route">현관에서 <select id="diag-target">${targets.map(([k, n]) => `<option value="${k}"${k === st.target ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select> 까지 · <b class="mono">${fmt(d.circ.meters[st.target])}</b></label>` : ''}
        <figure class="gen-plan">${planSvg(c.layout, d, st.mode, st.target)}</figure>
        <p class="note">${
          st.mode === 'circ'
            ? '색이 진할수록 현관에서 문을 더 많이 지나야 닿는 실입니다(깊이). 공용 공간(현관·거실·주방)은 얕고, 침실·안방은 깊을수록 사생활이 지켜집니다. 점선은 문으로 이어진 실, 주황 선은 고른 실까지 걷는 경로입니다. 발코니 문은 이동 경로에서 뺐습니다.'
            : `굵은 테두리와 번호는 앞쪽에 닿은 거실·침실(베이)입니다. 칸의 비율은 창 면적 ÷ 바닥면적이며 법 기준은 채광 10%·환기 5% 이상입니다(건축물의 피난·방화구조 등의 기준에 관한 규칙 제17조). 도면에 창 높이가 없어 일반 창 ${ASSUME.windowH}m·발코니 문 ${ASSUME.slidingH}m, 여닫는 부분 ${ASSUME.openable * 100}%로 가정했습니다.`
        }</p>
      </div>
      <div>
        <h4>채광·환기(거실·침실)</h4>
        <table class="gen-table"><thead><tr><th>실</th><th>㎡</th><th>채광 ≥10%</th><th>환기 ≥5%</th><th>빛</th></tr></thead><tbody>${lightRows}</tbody></table>
        <p class="note">주방은 법의 거실에 드는지 해석이 갈려 참고로만 보입니다. 이웃 동이 없다고 보고 계산했으므로 동지 일조 시간(4시간·연속 2시간, 판례 기준)은 판단하지 않습니다.</p>
      </div>
    </div>
    ${
      top.length > 1
        ? `<h4>후보 비교</h4>
    <div class="gen-diag-cmp">
      <div class="gen-diag-scroll"><table class="gen-table gen-cmp-table"><thead><tr><th>안</th><th>베이</th><th>맞통풍</th><th>현관→주방</th><th>현관→안방</th><th>면적 오차↓</th><th>채광 미달</th><th>문 동선 문제</th><th>다른 안과 차이</th></tr></thead><tbody>${cmpRows}</tbody></table></div>
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
  $('#diag-target')?.addEventListener('change', (e) => {
    st.target = e.target.value;
    renderDiagnosis({ top, current, spec });
  });
  box.querySelectorAll('tr[data-cand]').forEach((tr) =>
    tr.addEventListener('click', () => document.querySelector(`#gen-tabs [data-cand="${tr.dataset.cand}"]`)?.click()),
  );
}

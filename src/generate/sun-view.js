// 방위표와 동지 일조 막대(도면 생성·자유형 평면 공용).
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** 방위표: front = 앞쪽(+y)이 바라보는 방위각. 북쪽 화살표의 화면 각도 = 90° − front. */
export function compass(cx, cy, front, r = 22) {
  const a = ((90 - front) * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const tip = [cx + ux * r, cy + uy * r];
  const left = [cx - uy * r * 0.32 - ux * r * 0.25, cy + ux * r * 0.32 - uy * r * 0.25];
  const right = [cx + uy * r * 0.32 - ux * r * 0.25, cy - ux * r * 0.32 - uy * r * 0.25];
  const lx = cx + ux * (r + 11);
  const ly = cy + uy * (r + 11) + 4;
  return `<g aria-label="방위표"><circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="#fff" stroke="#8a8794" stroke-width="1.2"/><path d="M${tip[0]} ${tip[1]}L${left[0]} ${left[1]}L${cx} ${cy}Z" fill="#c4314b"/><path d="M${tip[0]} ${tip[1]}L${right[0]} ${right[1]}L${cx} ${cy}Z" fill="#7a2030"/><text x="${lx}" y="${ly}" text-anchor="middle" font-size="12" font-weight="800" fill="#c4314b">N</text></g>`;
}

/** 실별 동지 일조 막대(08~16시). */
export function sunTimeline(sol) {
  if (!sol.length) return '<p class="note">창이 있는 거실·침실·주방이 없습니다.</p>';
  const L = 92;
  const W = 320;
  const RH = 22;
  const T = 18;
  const H = T + sol.length * RH + 20;
  const X = (t) => L + ((t - 8) / 8) * W;
  const parts = [`<rect x="${X(9)}" y="${T - 4}" width="${X(15) - X(9)}" height="${sol.length * RH + 4}" fill="var(--surface-3)" opacity="0.6"/>`];
  for (const h of [8, 10, 12, 14, 16]) parts.push(`<line x1="${X(h)}" x2="${X(h)}" y1="${T - 4}" y2="${T + sol.length * RH}" stroke="var(--line)"/><text x="${X(h)}" y="${H - 4}" text-anchor="middle" class="sc-ax">${h}시</text>`);
  sol.forEach((r, i) => {
    const y = T + i * RH;
    parts.push(`<text x="0" y="${y + 14}" class="sc-ax" style="fill:var(--text-primary)">${esc(r.name)} · ${esc(r.facingName)}</text>`);
    const n = r.slots.length;
    let s0 = -1;
    for (let k = 0; k <= n; k++) {
      const on = k < n && r.slots[k];
      if (on && s0 < 0) s0 = k;
      if (!on && s0 >= 0) {
        parts.push(`<rect x="${X(8 + (s0 / n) * 8)}" y="${y + 4}" width="${X(8 + (k / n) * 8) - X(8 + (s0 / n) * 8)}" height="${RH - 8}" rx="3" fill="#e8a317"><title>${esc(r.name)}: ${(8 + (s0 / n) * 8).toFixed(2)}~${(8 + (k / n) * 8).toFixed(2)}시</title></rect>`);
        s0 = -1;
      }
    }
    parts.push(`<text x="${L + W + 6}" y="${y + 14}" class="sc-ax" style="fill:${r.ok ? 'var(--good-text)' : 'var(--critical-text)'};font-weight:700">${r.total.toFixed(1)}h ${r.ok ? '✓' : '✗'}</text>`);
  });
  return `<svg viewBox="0 0 ${L + W + 52} ${H}" class="sc-svg" role="img" aria-label="실별 동지 일조 시간">${parts.join('')}</svg>`;
}


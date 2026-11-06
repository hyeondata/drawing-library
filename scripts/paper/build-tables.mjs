// 논문 본문 표·그림 초안 생성기. 모든 수치는 evidence/results/ 파일(또는 변경 6 이전 commit의 같은 파일)에서 읽는다.
// 사용: node scripts/paper/build-tables.mjs → paper/tables/*.md, paper/figures/*.svg
// 주의: boltzmann-rq4*.json은 변경 6 이후 재생성되지 않아 낡았다 → β·M 값은 .md에서 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const RES = 'evidence/results';
const PRE6 = '4077527'; // 변경 6(bfba9b7) 직전 commit
const read = (f) => fs.readFileSync(path.join(ROOT, RES, f), 'utf8');
const readOld = (f) => execFileSync('git', ['show', `${PRE6}:${RES}/${f}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const json = (s) => JSON.parse(s.replace(/\bInfinity\b/g, 'null'));
const out = (dir, name, text) => {
  const p = path.join(ROOT, 'paper', dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text.trimEnd() + '\n');
};

// ---- md 파싱 도구 ----
function section(md, heading) { // '## ' 제목이 heading으로 시작하는 절의 본문
  const parts = md.split(/\n(?=## )/);
  const s = parts.find((x) => x.startsWith('## ' + heading));
  if (!s) throw new Error('절 없음: ' + heading);
  return s;
}
function tables(md) { // 문서 안의 모든 표 → {head, rows}
  const lines = md.split('\n'); const res = []; let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('|') && lines[i + 1]?.startsWith('|---')) {
      const cells = (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(lines[i]); const rows = []; i += 2;
      while (i < lines.length && lines[i].startsWith('|')) rows.push(cells(lines[i++]));
      res.push({ head, rows });
    } else i++;
  }
  return res;
}
const mdTable = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const pct = (x, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const sec = (t) => (t == null ? '∞' : t < 1 ? `${(t * 1000).toFixed(0)} ms` : `${t.toFixed(1)} s`);
const num = (s) => Number(String(s).replace(/[+,]/g, ''));
const header = (id, src, cmd) => `<!-- ${id} · 원본: ${src} · 생성: ${cmd} -->\n`;
const CMD = 'node scripts/paper/build-tables.mjs';

// ===== T1 RQ1 =====
{
  const md = read('rq1-syntax-convexP1.md');
  const t = tables(md);
  const types = t[0]; const top = t.find((x) => x.head[0] === '1위 유형');
  const keep = types.rows.filter((r) => ['거실', '주방', '현관', '침실', '화장실', '드레스룸'].includes(r[0]));
  const idx = ['유형', '세대 수', '연결도', '현관에서 깊이', '통합도(1/RRA)'].map((h) => types.head.indexOf(h));
  const n = md.match(/전체 세대 ([\d,]+)개 중 그래프가 서로 다른[^)]*\) ([\d,]+)개/);
  out('tables', 'T1-rq1-real-syntax.md', header('T1', 'rq1-syntax-convexP1.md', CMD) + `
**표 1. 한국 아파트(AI Hub APT_FP_SPA 7,275장)의 실 유형별 공간구문 지표 (중앙값 [사분위], 뿌리 = 현관, 거실 볼록 분할 P1).**

${mdTable(idx.map((i) => (types.head[i] === '세대 수' ? '그래프 수' : types.head[i])), keep.map((r) => idx.map((i) => r[i])))}

가장 통합된 실(유전형 1위): ${top.rows.map((r) => `${r[0]} ${r[1]}세대(${r[2]})`).join(', ')}. 분석 단위: 전체 세대 ${n[1]}개 중 서로 다른 그래프 ${n[2]}개(침실 2~4개).

*한계:* 실제 그래프는 SPA 라벨로 만든 **벽 인접 그래프**이며 문 정보가 없다(출입 그래프와의 차이는 도면 14장·17세대 표본으로만 확인, door-vs-wall.md). 고리도 계열 지표는 벽 그래프에서 부풀려지므로 본문 근거로 쓰지 않는다. 거실 라벨은 비볼록이라 P1로 나눈 결과이며 분할 규칙에 따라 값이 달라진다(민감도 P2 병기 필요).
`);
}

// ===== T2 RQ2 =====
{
  const rra = read('rra-exact.md'); const gq = json(read('gen-qubo-exact.json')); const fa = read('full-aux.md');
  const split = read('split-frame-precheck.md'); const op = read('outline-projection.md');
  const m1 = rra.match(/= ([\d,]+)건, 최대 오차 \*\*([\d.e+-]+)\*\*/);
  const gm = split.match(/대조\) ([\d,]+\/[\d,]+)/);
  const faErr = tables(fa)[0].rows.map((r) => r[r.length - 1]); const faOk = faErr.filter((e) => num(e) === 0).length;
  const e = (x) => x.toExponential(1);
  const sizes = gq.rows.map((r) => r.vars).sort((a, b) => a - b);
  const total = gq.rows.reduce((s, r) => s + r.arr, 0);
  const opPass = op.match(/통과: (\d+) \/ (\d+) 단위/);
  const rows = [
    ['생성 틀 그래프 = 정확 QUBO 모형 그래프', `${gm[1]} 배치(사양 80개)`, '일치', 'split-frame-precheck.md'],
    ['RRA 정확식: 정준 상태 에너지 − 그래프 RRA', `${m1[1]}건`, `최대 오차 ${m1[2]}`, 'rra-exact.md'],
    ['생성 모형 5항 각각', `템플릿 ${gq.rows.length}개 · 배치 ${total.toLocaleString()}개`, Object.entries(gq.term).map(([k, v]) => `${k} ${e(v)}`).join(', '), 'gen-qubo-exact.json'],
    ['생성 모형 5항 합친 BQM(부호 섞인 임의 β)', `템플릿 ${gq.rows.length}개`, `최대 오차 ${e(gq.all)} (허용 ${gq.tol})`, 'gen-qubo-exact.json'],
    ['전체 보조 변수형(모든 고정 뿌리)', `대표 템플릿 ${faErr.length}개`, `오차 0인 것 ${faOk}/${faErr.length}`, 'full-aux.md'],
    ['외곽 투영 후 그래프 유지(사전 등록 판정)', `외곽 × 침실 수 ${opPass[2]}개 단위`, `**${opPass[1]}/${opPass[2]} 통과**`, 'outline-projection.md'],
  ];
  out('tables', 'T2-rq2-exactness.md', header('T2', 'rra-exact.md, gen-qubo-exact.json, full-aux.md, split-frame-precheck.md, outline-projection.md', CMD) + `
**표 2. 정확 QUBO 정식화의 정확성 검증.** 정준 상태(배치에서 보조 변수를 그래프대로 채운 상태)의 QUBO 에너지가 그래프에서 직접 잰 값과 같은지 모든 템플릿·배치에서 확인했다.

${mdTable(['검증', '범위', '결과', '원본'], rows)}

합친 BQM 크기: 변수 ${sizes[0].toLocaleString()}~${sizes[sizes.length - 1].toLocaleString()}(중앙값 ${sizes[sizes.length >> 1].toLocaleString()}).

*한계:* 정확성은 정준 상태에 대한 검증이다(벌점은 ≥ 0이고 유효 상태에서 0). 모형 그래프는 문을 모르는 벽 인접 그래프다. 외곽 투영은 대표 세대 외곽 하나씩이며 34개 단위 중 통과하지 못한 단위가 더 많다(부록 B).
`);
}

// ===== T3 β (생성 모형) =====
{
  const parse = (md) => {
    const m = md.match(/\*\*선택\*\*: ([^·]+)· β_z ([^·]+)· 조건수 ([\d.]+)/);
    return { terms: m[1].split(',').map((s) => s.trim()), beta: m[2].split(',').map((s) => s.trim()), cond: m[3] };
  };
  const now = parse(read('gen-model-select.md')); const old = parse(readOld('gen-model-select.md'));
  const rows = now.terms.map((t, i) => {
    const o = old.beta[old.terms.indexOf(t)];
    return [t, now.beta[i], o, Math.sign(num(now.beta[i])) === Math.sign(num(o)) ? '유지' : '**부호 바뀜**'];
  });
  out('tables', 'T3-generation-model-beta.md', header('T3', `gen-model-select.md (현재, ${PRE6}의 같은 파일 = 변경 6 이전)`, CMD) + `
**표 3. 생성 모형(5항)의 표준화 β.** 양수 = 실제 도면이 균등 배치보다 그 원리 쪽. 최대 엔트로피(볼츠만) 모형을 적률 일치로 맞췄으며 후보 5항의 부분집합 31개 모두 적률 일치·조건수 기준을 통과해 5항 전부가 선택되었다.

${mdTable(['항', 'β_z (템플릿 = 데이터 최소 폭, 현재)', 'β_z (템플릿 = 통상 치수, 변경 6 이전)', '부호'], rows)}

조건수: 현재 ${now.cond}, 변경 전 ${old.cond}.

*한계:* β는 생성 틀의 '균등 배치'에 대한 상대값이라 틀 규칙에 의존한다. 위 표에서 부호가 바뀐 항은 틀에 강건하다고 쓰지 않고 민감도로 보고한다(부록 C).
`);
}

// ===== T4 RQ3 =====
const R3 = Object.values(json(read('rq3-scaling.json')));
const TIES = json(read('rq3-outlier-ties.json'));
const byInst = new Map();
for (const r of R3) { if (!byInst.has(r.instance)) byInst.set(r.instance, {}); byInst.get(r.instance)[r.objective] = r; }
{
  const sw = ['1000', '10000', '50000'];
  const f = (r) => sw.map((s) => (r.sa[s].p * 100).toFixed(r.sa[s].p && r.sa[s].p < 0.1 ? 1 : 0)).join(' / ');
  const rows = [...byInst].map(([inst, o]) => [
    `${inst} (${o.GEN_model.arrangements.toLocaleString()}배치)`,
    `${o.O1_living_RRA.vars.toLocaleString()} · ${f(o.O1_living_RRA)}`,
    `${o.O3_privacy_gap.vars.toLocaleString()} · ${f(o.O3_privacy_gap)}`,
    `${o.GEN_model.vars.toLocaleString()} · ${f(o.GEN_model)}`,
    `${(o.O1_living_RRA.perm['3000'].p * 100).toFixed(0)} / ${(o.GEN_model.perm['3000'].p * 100).toFixed(0)}`,
  ]);
  const genAll = R3.filter((r) => r.objective === 'GEN_model');
  const nonzero = genAll.flatMap((r) => Object.entries(r.sa).filter(([, v]) => v.p > 0).map(([s, v]) => `${r.instance} ${s} 스위프 ${(v.p * 100).toFixed(1)}%`));
  const below = Math.max(...R3.flatMap((r) => [...Object.values(r.sa), ...Object.values(r.lam ?? {})].map((v) => v.below_estar)));
  const emb = (o) => Object.values(o.embed).map((e) => (e.ok ? '성공' : '실패'));
  const embGen = genAll.every((r) => Object.values(r.embed).every((e) => !e.ok));
  const o1ok = R3.filter((r) => r.objective === 'O1_living_RRA' && Object.values(r.embed).some((e) => e.ok)).map((r) => `${r.vars}변수`);
  out('tables', 'T4-rq3-sa-performance.md', header('T4', 'rq3-scaling.json, rq3-outlier-ties.json', CMD) + `
**표 4. 정확 QUBO에 대한 시뮬레이티드 어닐링(dwave-samplers) 최적 도달률 p (%, 스위프 1k / 10k / 50k, 읽기 640(50k는 320)).** p = 유효한 배치이면서 열거 최적 E*와 같은 목적값에 닿은 읽기 비율. 마지막 열은 같은 목적에 대한 순열 SA 기준선(3,000걸음, QUBO를 풀지 않음)의 p. 각 셀 앞 숫자는 QUBO 변수 수.

${mdTable(['인스턴스', 'O1 거실 중심', 'O3 공·사 위계', 'GEN(5항 생성 모형)', '순열 SA p: O1 / GEN'], rows)}

*주요 결과와 한계(그대로 보고):*
- **생성 모형(GEN)에서 SA는 실패한다.** GEN의 0이 아닌 p는 ${nonzero.length ? nonzero.join('; ') : '없음'}뿐이고 나머지 ${genAll.length * 3 - nonzero.length}개 조건은 모두 0%다. 스위프를 늘려도, 벌점 배수 λ를 0.5·0.25로 낮춰도 개선이 없다.
- E*보다 낮은 에너지를 읽은 경우: 모든 조건(스위프·λ)에서 ${below}건(정식화가 틀린 바닥 상태를 갖지 않음).
- 단일 원리에서도 규모가 커질수록 p가 떨어지고 O3(최단 깊이 하한 포함)가 가장 어렵다. 합성 +3b+1f의 O1(${pct(byInst.get('synthetic +3 back +1 front').O1_living_RRA.sa['50000'].p, 0)})은 이상값이며, 동점 최적 배치가 ${pct(TIES.find((t) => t.instance.startsWith('synthetic +3 back +1')).opt_frac_of_all, 0)}(${TIES.find((t) => t.instance.startsWith('synthetic +3 back +1')).n_opt.toLocaleString()}개)로 인접 규모(${TIES.filter((t) => /synthetic \+(3 back \+0|4 back)/.test(t.instance)).map((t) => pct(t.opt_frac_of_all, 0)).join('·')})보다 많아 맞히기 쉬운 인스턴스의 성질로 설명된다(rq3-outlier-ties.json). SA 성능 향상으로 쓰지 않는다.
- D-Wave 사전 임베딩(QPU 없이 위상에만 맞춤): O1은 ${o1ok.join('·')}에서만 성공, GEN은 ${embGen ? '모든 인스턴스에서 실패' : '일부 성공'}.
- 순열 SA는 같은 목적(GEN 포함)에서 3,000걸음에 대부분 98~100%지만, 이는 QUBO 없이 배치를 직접 바꾸는 기준선이며 효율 우위 주장의 근거가 아니다. 합성 인스턴스는 규모 실험용이다.
`);
}

// ===== F1 RQ3 그림: 변수 수 대 p =====
{
  const pts = (obj) => [...byInst.values()].map((o) => ({ x: o[obj].vars, y: o[obj].sa['10000'].p }));
  const series = [['O1_living_RRA', '#1f77b4', 'O1 (10k 스위프)'], ['O3_privacy_gap', '#ff7f0e', 'O3 (10k)'], ['GEN_model', '#d62728', 'GEN 5항 (10k)']];
  const W = 640, H = 380, L = 60, Rr = 20, T = 20, B = 55; const xs = [...byInst.values()].flatMap((o) => [o.O1_living_RRA.vars, o.GEN_model.vars]);
  const x0 = 0, x1 = Math.ceil(Math.max(...xs) / 1000) * 1000;
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - Rr), Y = (p) => T + (1 - p) * (H - T - B);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="12"><rect width="${W}" height="${H}" fill="#fff"/>`;
  for (let g = 0; g <= 1; g += 0.25) s += `<line x1="${L}" x2="${W - Rr}" y1="${Y(g)}" y2="${Y(g)}" stroke="#ddd"/><text x="${L - 6}" y="${Y(g) + 4}" text-anchor="end">${g * 100}%</text>`;
  for (let v = 0; v <= x1; v += 1000) s += `<text x="${X(v)}" y="${H - B + 18}" text-anchor="middle">${v}</text>`;
  s += `<text x="${(L + W - Rr) / 2}" y="${H - 12}" text-anchor="middle">QUBO 변수 수</text><text transform="translate(14 ${H / 2}) rotate(-90)" text-anchor="middle">최적 도달률 p</text>`;
  series.forEach(([k, c, label], i) => {
    const p = pts(k).sort((a, b) => a.x - b.x);
    s += `<polyline fill="none" stroke="${c}" stroke-width="2" points="${p.map((q) => `${X(q.x)},${Y(q.y)}`).join(' ')}"/>` + p.map((q) => `<circle cx="${X(q.x)}" cy="${Y(q.y)}" r="3.5" fill="${c}"/>`).join('') + `<rect x="${L + 10}" y="${T + 6 + i * 18}" width="12" height="12" fill="${c}"/><text x="${L + 28}" y="${T + 16 + i * 18}">${label}</text>`;
  });
  out('figures', 'F1-rq3-p-vs-size.svg', s + '</svg>');
  out('tables', 'F1-caption.md', header('F1', 'rq3-scaling.json', CMD) + `
**그림 1. 정확 QUBO 규모(변수 수)에 따른 SA 최적 도달률(10k 스위프, 인스턴스 7개).** 빨간 선(생성 모형 GEN)은 전 구간에서 0%이며 SA가 생성 모형을 풀지 못함을 보여 준다. O1의 파란 선에서 가장 높은 점(합성 +3b+1f)은 이상값이다. 그림은 paper/figures/F1-rq3-p-vs-size.svg.
`);
}

// ===== T5 RQ4 (내부 진단만) =====
{
  const md = read('boltzmann-rq4-convexP1.md');
  const fit = tables(section(md, '1.'))[0]; const dist = tables(section(md, '2.'))[0];
  const rows = dist.rows.map((r) => {
    const f = fit.rows.find((x) => x[0] === r[0]);
    return [r[0], f ? f[2] : '—', r[1], r[2], r[3]];
  });
  out('tables', 'T5-rq4-purpose-generation.md', header('T5', 'boltzmann-rq4-convexP1.md (json은 낡아 사용 안 함)', CMD) + `
**표 5. 목적별 볼츠만 생성 대 실제 절반 B (내부 진단, dev 도면에 한정).** β = 실제 절반 A에 맞춘 표준화 값. M1 = 그래프 거리, M2·M3 = 거실·침실의 현관 깊이 분포 총변동 거리(작을수록 실제에 가까움, \`*\` = 같은 깊이 계열이라 순환). 점추정 [95% 부트스트랩 구간].

${mdTable(['모형', 'β (A)', 'M1', 'M2', 'M3'], rows)}

*한계:* 이는 **내부 진단**이며 최종 판정은 외부 프로그램이 별도 테스트 도면으로 한다. 어느 목적도 M1을 실제 A↔B 수준(${dist.rows[0][1]})까지 낮추지 못했다. 틀(판상형 두 띠)이 유력한 원인이다. 거실 중심(O1)의 β 부호는 틀 규칙에 민감하므로 결론을 내지 않는다. C136은 결과를 본 뒤 추가한 탐색적 조합이다.
`);
}

// ===== 부록 A 분할 틀 =====
{
  const md = read('split-frame-precheck.md'); const t = tables(md)[0];
  out('tables', 'TA-split-frame.md', header('TA', 'split-frame-precheck.md', CMD) + `
**부록 표 A. 뒤 띠를 거실 열에서 나누는 분할 틀 대 현 정렬 틀(직사각형 기하 사전 점검).** 두 틀 모두 같은 사양 80개·배치로 비교한 거실 RRA 범위와 실제 값.

${mdTable(t.head, t.rows)}

*한계:* 분할 틀은 거실 RRA 범위가 실제 평균을 포함하지만 거실과 맞닿는 침실 비율(60%)은 현 틀(67%)보다 낮고 실제(96%)와 멀다. 사전 점검(기하)이며 분할 틀로 QUBO·SA 전 과정을 다시 돌리지 않았다.
`);
}

// ===== 부록 B 외곽 투영 =====
{
  const md = read('outline-projection.md'); const t = tables(md)[0];
  const sum = md.match(/- 통과: [^\n]+/)[0];
  const keep = ['외곽', '세대 비중', '채움률', '침실', '배치', '통과', '실 사라짐', '실 쪼개짐', '그래프 다름', '판정', '면적 유지율 최솟값'].map((h) => t.head.indexOf(h));
  out('tables', 'TB-outline-projection.md', header('TB', 'outline-projection.md', CMD) + `
**부록 표 B. 외곽 투영 검증(사전 등록 판정: 모든 배치에서 실이 남고 한 덩어리이며 잘라 낸 그래프 = QUBO 모형 그래프).** 직사각형 대조는 100% 통과.

${mdTable(keep.map((i) => t.head[i]), t.rows.map((r) => keep.map((i) => r[i])))}

${sum}

*한계:* **34개 단위 중 15개만 통과**했고 나머지는 '정확 QUBO 범위 밖'이다. 외곽은 묶음의 대표 세대 하나이며 묶음 내 다른 세대는 재지 않았다. 통과한 외곽에서도 면적 유지율이 낮은 배치가 있어 실 면적이 크게 벗어날 수 있다(판정에는 쓰지 않고 보고만). 문·창·설비는 투영 전 직사각형 기준이다.
`);
}

// ===== 부록 C 템플릿 규칙 민감도 =====
{
  const cur = tables(section(read('boltzmann-rq4-convexP1.md'), '1.'))[0];
  const old = tables(section(readOld('boltzmann-rq4-convexP1.md'), '1.'))[0];
  const single = ['O1', 'O2', 'O3', 'O6', 'O7', 'O9', 'O2b', 'O7h'];
  const rows = single.map((k) => {
    const c = cur.rows.find((r) => r[1] === k && !r[0].startsWith('C')), o = old.rows.find((r) => r[1] === k && !r[0].startsWith('C'));
    return [k, o[4], c[4], Math.sign(num(o[4])) === Math.sign(num(c[4])) ? '유지' : '**부호 바뀜**'];
  });
  const arrOf = (j) => j.rows.reduce((s, r) => s + r.arr, 0);
  const jn = json(read('gen-qubo-exact.json')), jo = json(readOld('gen-qubo-exact.json'));
  const oldById = new Map(jo.rows.map((r) => [r.id, r.arr]));
  const changed = jn.rows.filter((r) => oldById.get(r.id) !== r.arr).length;
  out('tables', 'TC-template-rule-sensitivity.md', header('TC', `boltzmann-rq4-convexP1.md 현재 대 ${PRE6}, gen-qubo-exact.json 현재 대 ${PRE6}`, CMD) + `
**부록 표 C. 앞 띠 작은방 수(템플릿) 규칙 민감도.** 규칙을 통상 치수(3.0+3.6+2.6k)에서 데이터 최소 폭으로 바꾸었을 때 단독 모형 β(전체 도면에 맞춤, 표준화)의 변화.

${mdTable(['항', 'β 변경 전', 'β 변경 후', '부호'], rows)}

템플릿 ${jn.rows.length}개 중 배치 수가 달라진 것 ${changed}개, 전체 배치 ${arrOf(jo).toLocaleString()} → ${arrOf(jn).toLocaleString()}.

*한계:* 템플릿 규칙만 바꿔도 위 표에서 부호가 바뀐 항(예: O1, O9)이 있다. 이들은 틀에 강건한 결론이 아니라 **민감도 결과**로만 보고하며, 부호가 유지된 항만 '틀에 강건'이라 쓴다. 변경 전 값은 이전 commit(${PRE6})의 결과 파일이다.
`);
}
// ===== 부록 D 맞닿음 규약 민감도 =====
{
  const k = json(read('outline-aware/contact-convention-check.json'));
  const e = json(read('outline-aware/contact-short-edges.json'));
  out('tables', 'TD-contact-convention.md', header('TD', 'outline-aware/contact-convention-check.json, outline-aware/contact-short-edges.json', CMD) + `
**부록 표 D. 맞닿음 규약 민감도: QUBO 모형 그래프(공유 변 > 0.05 m) 대 AI Hub 실제 그래프 규약(≥ 0.44 m, minContact 40 px).** 사양 80개 기본 치수의 정렬 틀 배치 전부.

${mdTable(['점검', '값', '비고'], [
    ['K1 순서 결정성(대조 0.05 m): 같은 순서인데 그래프가 다른 열쇠', `${k.K1.old} / ${k.keys.toLocaleString()}`, '대조 통과'],
    ['K1 순서 결정성(0.44 m): 같은 순서인데 그래프가 다른 열쇠', `**${k.K1.aihub} / ${k.keys.toLocaleString()}**`, '0.44 m에서는 배치 순서만으로 그래프가 정해지지 않음 → 정확 QUBO 유지 위해 현 규약'],
    ['0.44 m 미만 간선이 있는 배치', `${e.withShort.toLocaleString()} / ${e.layouts.toLocaleString()} (**${pct(e.frac)}**)`, `짧은 간선 길이 10·50·90%: ${e.lenQ.join(' · ')} m`],
    ['그 간선을 빼면 그래프가 끊기는 배치', String(e.disconnectedIfDropped), ''],
    ['GEN 항(β·f)이 바뀌는 배치', `${e.termsChanged.toLocaleString()} (**${pct(e.termsChangedFrac)}**)`, `abs(ΔE_GEN) 중앙값·90%·최대 ${e.dE.join(' · ')}`],
    ['K2 사양별 GEN 최적 배치가 바뀜', `${k.K2.optOrderChanged} / ${k.K2.specs}`, `최적 그래프가 바뀜 ${k.K2.optGraphChanged} / ${k.K2.specs}`],
    ['K3 GEN 최적 배치에 0.44 m 미만 간선', `${k.K3.oldOptWithShort} / ${k.K3.of}`, ''],
  ])}

많은 쌍: ${e.topPairs.slice(0, 5).map(([p, c]) => `${p} ${c.toLocaleString()}`).join('; ')}.

*한계:* 짧은 간선은 대부분 복도(hall)와 뒤 띠 실의 0.1–0.25 m 모서리 스침이다. 판정(K1)은 사전 등록(10-08)이고 나머지는 보고만 한다. 사양 기본 치수만 보았다. 0.6 m 기준으로 센 예전 수치(53.7%)는 AI Hub 규약 차이로 쓰지 않는다.
`);
}

// ===== 부록 E 그래프 우선 실현(C-1, 부정 결과) =====
{
  const g = json(read('outline-aware/graph-realize.json'));
  const cal = json(read('outline-aware/graph-realize-calibration.json'));
  const S = g.summary;
  const ci = (a) => `[${pct(a[0])}, ${pct(a[1])}]`;
  const row = (name, x) => [name, String(x.n.toLocaleString()), `${pct(x.c1)} ${ci(x.c1CI)}`, `${pct(x.proj)} ${ci(x.projCI)}`, `**${pct(x.delta)}** ${ci(x.deltaCI)}`, `${pct(x.deltaOrig)} ${ci(x.deltaOrigCI)}`];
  const fails = g.rows.filter((r) => !r.ok);
  const ft = { gone: fails.filter((r) => !r.hasAll).length, entry: fails.filter((r) => r.hasAll && !r.entryOk).length };
  const rest = fails.filter((r) => r.hasAll && r.entryOk);
  ft.miss = rest.filter((r) => r.missing && !r.extra).length; ft.extra = rest.filter((r) => !r.missing && r.extra).length; ft.both = rest.filter((r) => r.missing && r.extra).length;
  const grid = cal.grid.steps.map((st) => [st.toLocaleString(), ...cal.grid.w.map((w) => { const c = cal.calib.find((x) => x.w === w && x.steps === st); return `${pct(c.rate)}${c.w === cal.chosen.w && c.steps === cal.chosen.steps ? ' (선택)' : ''}`; })]);
  out('tables', 'TE-graph-first-realization.md', header('TE', 'outline-aware/graph-realize.json, graph-realize-calibration.json', CMD) + `
**부록 표 E. 그래프 우선 실현(C-1) 대 외곽 투영: 사전 등록 비교(부정 결과).** 정확 QUBO + SA가 고른 정렬 틀 그래프를 자유형 엔진(0.3 m 격자 SA, 정확 그래프 모드)으로 실제 외곽 안에 다시 실현했을 때, 실현 그래프가 목표와 같은 항목 비율. 같은 맞닿음 규약(공유 변 ≥ 0.6 m). 괄호는 단위 34개 군집 부트스트랩 95% 구간(10,000회). Δ' = 투영을 원 규약(0.1 m)으로 판정.

${mdTable(['집합', '항목', 'C-1', '투영', 'Δ = C-1 − 투영', "Δ'"], [row('주 분석 (a)+(b)', S.primary), row('(a) GEN 최적', S.setA), row('(b) 그래프 공간 표본', S.setB)])}

판정(사전 등록): **${S.verdict}** (Δ 상한 < 0). 보정(시험과 겹치지 않는 실제 외곽 ${cal.items}항목)의 실현률:

${mdTable(['단계 \\ w', ...cal.grid.w.map(String)], grid)}

보고만: 직사각형 대조 ${S.control.ok}/${S.control.n} = ${pct(S.control.ok / S.control.n)}. McNemar mid-p(군집 무시): C-1만 성공 ${S.primary.mcnemar.onlyC1}, 투영만 성공 ${S.primary.mcnemar.onlyProj}. 맞닿음 1칸(0.3 m) ${pct(S.primary.sens1)}, 3칸(0.9 m) ${pct(S.primary.sens3)}. 실패 ${fails.length.toLocaleString()}건(배타적 분류, 앞 항목에 걸리면 뒤에서 세지 않음): 실 사라짐 ${ft.gone}, 현관 조건 ${ft.entry}, 누락만 ${ft.miss}, 초과만 ${ft.extra}, 둘 다 ${ft.both.toLocaleString()}(${pct(ft.both / fails.length, 0)}). graph-realize.md의 실패 유형은 현관 조건 실패를 누락·초과에도 함께 세어 합이 실패 수보다 크다.

*한계:* 보정 선택점이 격자 모서리(가장 큰 w, 가장 많은 단계)여서 더 큰 예산에서는 실현률이 오를 수 있으나, 결과를 본 뒤 예산을 늘려 같은 데이터로 확인하지 않는다(10 트랙 종료). 외곽은 묶음 대표 세대 하나, 시드는 항목마다 한 번. 직사각형에서도 39%라 병목은 외곽이 아니라 격자 실현 단계다. 단위별로 C-1이 높은 외곽(투영이 실패하는 곳)은 탐색적 관찰로만 쓴다.
`);
}

// ===== 부록 F 고정 칸 틀 (10-01 → 10-02) =====
{
  const v1 = read('outline-aware/fixed-slot-precheck.md'), v2 = read('outline-aware/fixed-slot-precheck-10-02.md');
  const verdict = (md) => md.match(/설계 \(a\) 채택 규칙: \*\*([^*]+)\*\*/)[1];
  const t1 = tables(v1)[0], t2 = tables(v2)[0];
  const H = (t, h) => t.head.indexOf(h);
  const bad1 = t1.rows.filter((r) => !r[0].startsWith('대조') && (num(r[H(t1, '상태 어긋남')]) > 0 || num(r[H(t1, '맞닿음 어긋남')]) > 0));
  const units = t2.rows.filter((r) => !r[0].startsWith('대조'));
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
    // 면적 오차는 반올림 전 값(json)으로: 외곽 단위(대조 제외)별 중앙값 → 그 중앙값
  const J2 = json(read('outline-aware/fixed-slot-precheck-10-02.json')).filter((u) => /^o\d+$/.test(u.outline) && u.devFixed && u.devOld);
  const fs_ = J2.map((u) => 100 * u.devFixed.med), al = J2.map((u) => 100 * u.devOld.med);
  const worse = J2.filter((u) => u.devFixed.med > u.devOld.med).length;
  out('tables', 'TF-fixed-slot-frame.md', header('TF', 'outline-aware/fixed-slot-precheck.md (10-01), fixed-slot-precheck-10-02.md·.json (10-02)', CMD) + `
**부록 표 F. 고정 칸 틀(실 쌍 배정만으로 맞닿음이 정해지는 틀)의 이차 형식 사전 점검.** 판정: 모든 외곽 × 침실 수 단위에서 같은 배정이 다른 상태·맞닿음을 내는 경우 0(사전 등록).

${mdTable(['판', '판정', '어긋난 단위', '면적 오차 중앙값(단위별 중앙값의 중앙값): 고정 칸 / 정렬 틀'], [
    ['10-01(사전 등록)', verdict(v1), bad1.length ? bad1.map((r) => `${r[0]}·${r[1]}`).join(', ') : '없음', '—'],
    ['10-02(틀만 수정)', verdict(v2), '없음', `${med(fs_).toFixed(1)}% / ${med(al).toFixed(1)}% (${worse}/${J2.length} 단위에서 고정 칸이 더 큼)`],
  ])}

*한계:* 10-01은 안방 폭이 뒤 띠 순서에 따른 최소 폭 보정으로 배치마다 달라져 불충족이었다(사전 등록의 전제 오류). 10-02는 **결과를 본 뒤** 틀만 고친 것(안방 폭 = 보정 전 값)이며 판정은 같다. 틀 안의 '이차 형식으로 쓸 수 있다'는 조건까지만 확인했고, 외곽을 아는 QUBO 구현·정확성 검증은 하지 않았다. 두 띠 구조가 남아 틀 밖 목표의 답이 아니다.
`);
}
console.log('done');

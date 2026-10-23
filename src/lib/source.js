// 빌드 때 소스 파일에서 함수나 구간을 그대로 잘라 와 줄 번호와 함께 보여 준다(코드로 보기·QUBO 따라가기 탭).
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** 파일에서 함수 하나(바로 위 주석 포함)를 잘라 온다. 문자열·템플릿·주석 안의 괄호는 건너뛴다. */
export function extract(file, name) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const m = new RegExp(`(^|\\n)((?:export )?(?:async )?function ${name}\\s*\\()`).exec(src);
  if (!m) return { code: `// ${name}를 찾지 못함`, line: 0, file };
  let start = m.index + m[1].length;
  // 바로 위의 주석 블록(/** */ 또는 // 줄들)
  const before = src.slice(0, start);
  const cm = /(\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*|(?:[ \t]*\/\/[^\n]*\n)+)$/.exec(before);
  if (cm) start -= cm[0].length;
  // 매개변수 괄호를 지나 본문 시작 {
  let i = m.index + m[0].length - 1;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) break;
  }
  while (src[i] !== '{') i++;
  // 본문 괄호 짝 맞추기
  depth = 0;
  const stack = []; // 템플릿 안의 ${ } 깊이
  for (; i < src.length; i++) {
    const c = src[i];
    const n2 = src[i + 1];
    if (c === '/' && n2 === '/') {
      i = src.indexOf('\n', i);
      continue;
    }
    if (c === '/' && n2 === '*') {
      i = src.indexOf('*/', i) + 1;
      continue;
    }
    if (c === "'" || c === '"') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === '`') {
      for (i++; i < src.length && src[i] !== '`'; i++) {
        if (src[i] === '\\') i++;
        else if (src[i] === '$' && src[i + 1] === '{') {
          // 템플릿 안 표현식: 짝 맞는 }까지
          let d = 0;
          for (i += 1; i < src.length; i++) {
            if (src[i] === '{') d++;
            else if (src[i] === '}' && --d === 0) break;
          }
        }
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  const code = src.slice(start, i + 1);
  const line = src.slice(0, start).split('\n').length;
  return { code, line, file };
}
/** 줄 번호 + 주석 색. */
export function render({ code, line, file }) {
  const lines = code.split('\n');
  const body = lines
    .map((ln, k) => {
      const ci = ln.indexOf('//');
      const inStr = ci >= 0 && /['"`]/.test(ln.slice(0, ci)) && (ln.slice(0, ci).split(/['"`]/).length - 1) % 2 === 1;
      const html = ci >= 0 && !inStr ? `${esc(ln.slice(0, ci))}<span class="cd-cm">${esc(ln.slice(ci))}</span>` : /^\s*(\/\*|\*)/.test(ln) ? `<span class="cd-cm">${esc(ln)}</span>` : esc(ln);
      return `<span class="cd-ln">${line + k}</span>${html}`;
    })
    .join('\n');
  return `<div class="cd-file">${esc(file)} · ${line}~${line + lines.length - 1}행</div><pre class="cd-pre"><code>${body}</code></pre>`;
}
export const show = (file, ...names) => names.map((n) => render(extract(file, n))).join('');

/** 파일에서 start 문자열이 있는 줄부터 end 문자열이 있는 줄까지(포함) 잘라 온다. */
export function segment(file, start, end) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
  const a = lines.findIndex((l) => l.includes(start));
  if (a < 0) return { code: `// '${start}'를 찾지 못함`, line: 0, file };
  let b = lines.findIndex((l, i) => i >= a && l.includes(end));
  if (b < 0) b = a;
  return { code: lines.slice(a, b + 1).join('\n'), line: a + 1, file };
}
export const showSeg = (file, start, end) => render(segment(file, start, end));

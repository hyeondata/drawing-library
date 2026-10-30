// 도면 분석 진입점: 라벨 JSON → 실 인접 그래프·공간구문 변수·시공 가능성 규칙. 브라우저와 Node(CLI·테스트)에서 같은 코드를 쓴다.
// 기준 분포와 비교해 점수를 매기는 채점은 없다. 생성은 이 규칙과 변수를 적합성 조건으로 쓴다.
import { GATE_RULES, OPTIONAL_RULES } from './config.js';
import { detectKind, parseLabel } from './labels.js';
import { analyzeOBJ } from './obj.js';
import { analyzeSPA } from './spa.js';
import { analyzeSTR } from './str.js';

export { GATE_RULES, OPTIONAL_RULES, detectKind };

const ANALYZERS = { SPA: analyzeSPA, STR: analyzeSTR, OBJ: analyzeOBJ };

export function analyze(label, kind = detectKind(label)) {
  const fn = ANALYZERS[kind];
  if (!fn) throw new Error(kind ? `${kind} 라벨은 분석 대상이 아닙니다(문자 정보만 있음).` : '분석할 라벨이 없습니다.');
  return fn(parseLabel(label));
}

/** 규칙 충족률(0~100): 선택 규칙을 뺀 규칙을 가중치로 평균한 충족 비율. */
export const ruleRate = (rules) => {
  const req = rules.filter((r) => !OPTIONAL_RULES.has(r.id));
  const w = req.reduce((s, r) => s + r.weight, 0);
  return w ? (100 * req.reduce((s, r) => s + r.weight * r.ratio, 0)) / w : 0;
};

/** 필수 규칙(현관·거실·주방·침실·화장실, 도달성, 침실 비통과) 가운데 어긴 것. */
export const failedGates = (rules) => rules.filter((r) => GATE_RULES.has(r.id) && !r.pass).map((r) => r.label);

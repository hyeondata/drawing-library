// 도면 생성 탭 "생성 과정" 단계마다 쓰인 규칙과, 그 규칙이 이 평면에서 낸 결과.
// 규칙 내용은 layout.js·openings.js·fixtures.js·qubo.js·compare.js의 실제 동작을 그대로 옮겨 적었고,
// 결과는 만들어진 평면(layout)에서 직접 계산한다. ok: true(지켜짐) | false(어김) | null(값만 보여 줌)
import { MIN_SIDE } from './layout.js';
import { sharedSegment } from './openings.js';


/** 근거 문헌(evidence/07-참고-문헌.md와 같은 출처). what: 이 규칙에 쓴 내용 */
import { CLAIMS, LEVEL } from './citations.js';
export { CLAIMS, LEVEL };

export const REFS = {
  hillier1984: { short: 'Hillier & Hanson 1984', idx: '단행본', url: 'https://doi.org/10.1017/CBO9780511597237' },
  seo2007: { short: 'Seo 2007', idx: 'SSCI', url: 'https://doi.org/10.1068/b32134' },
  byun2016: { short: 'Byun & Choi 2016', idx: 'SCIE', url: 'https://doi.org/10.3130/jaabe.15.41' },
  ham2017: { short: 'Ham & Lee 2017', idx: 'SCIE·SSCI', url: 'https://doi.org/10.3390/su9010031' },
  park2024: { short: 'Park et al. 2024', idx: 'SCIE', url: 'https://doi.org/10.1016/j.autcon.2023.105243' },
  zeng2025: { short: 'Zeng et al. 2025', idx: 'SCIE', url: 'https://doi.org/10.3390/buildings15101674' },
  upasani2020: { short: 'Upasani et al. 2020', idx: 'SCIE', url: 'https://doi.org/10.1016/j.autcon.2020.103149' },
  rodrigues2013: { short: 'Rodrigues et al. 2013', idx: 'SCIE', url: 'https://doi.org/10.1016/j.cad.2013.01.003' },
  ju2020: { short: 'Ju & Oh 2020', idx: 'SCIE·SSCI', url: 'https://doi.org/10.3390/su12083244' },
  lucas2014: { short: 'Lucas 2014', idx: 'SCIE', url: 'https://doi.org/10.3389/fphy.2014.00005' },
  glover2019: { short: 'Glover et al. 2019', idx: 'SCIE', url: 'https://doi.org/10.1007/s10288-019-00424-y' },
  ayodele2022: { short: 'Ayodele 2022', idx: '학회', url: 'https://arxiv.org/abs/2206.11040' },
  jin2011: { short: 'Jin 2011', idx: 'SCIE', url: 'https://doi.org/10.1016/j.swevo.2011.05.001' },
  michalek2002: { short: 'Michalek et al. 2002', idx: 'SCIE', url: 'https://doi.org/10.1080/03052150214016' },
  merrell2010: { short: 'Merrell et al. 2010', idx: 'SCIE', url: 'https://doi.org/10.1145/1882261.1866203' },
  glover2010: { short: 'Glover, Lü & Hao 2010', idx: 'SCIE', url: 'https://doi.org/10.1007/s10288-009-0115-y' },
  kirk1983: { short: 'Kirkpatrick et al. 1983', idx: 'SCIE', url: 'https://doi.org/10.1126/science.220.4598.671' },
  lopes2010: { short: 'Lopes et al. 2010', idx: '학회', url: 'https://publications.graphics.tudelft.nl/papers/584' },
  dunning2018: { short: 'Dunning et al. 2018', idx: 'SCIE', url: 'https://doi.org/10.1287/ijoc.2017.0798' },
};
/** 근거 조각: lit(문헌) · law(법령) · data(AI 허브 아파트 평면도 전체 데이터) · assume(설계 가정) */
// 문헌 근거는 원문과 대조한 항목(citations.js)의 키로만 단다. 설명·원문 문장·위치·검증 수준이 함께 따라온다.
export const lit = (key) => {
  const c = CLAIMS[key];
  if (!c) throw new Error(`citations.js에 없는 문헌 근거: ${key}`);
  return { type: 'lit', id: c.ref, key, what: c.ko };
};
const law = (label, what, url = '') => ({ type: 'law', label, what, url });
export const data = (what) => ({ type: 'data', label: 'AI 허브 아파트 평면도 전체', what });
export const assume = (what) => ({ type: 'assume', label: '설계 가정', what });

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);
const OUT = new Set(['발코니', '실외기실']);
const PUBLIC = new Set(['현관', '거실', '주방', '기타']);
const len = (s) => (s ? Math.hypot(s.x2 - s.x1, s.y2 - s.y1) : 0);

function bands(L) {
  const indoor = L.rooms.filter((r) => !OUT.has(r.type));
  const living = indoor.find((r) => r.key === 'living');
  const Df = living ? living.h : L.D / 2;
  const front = indoor.filter((r) => Math.abs(r.y + r.h - L.D) < 1e-6 && r.type !== '기타').sort((a, b) => a.x - b.x);
  const back = indoor.filter((r) => r.y < 1e-6).sort((a, b) => a.x - b.x);
  return { indoor, Df, front, back };
}
const touches = (a, b) => a && b && len(sharedSegment(a, b)) > 0.6;

/** 단계(1~8)의 규칙 목록. c: 후보({ layout, params, algo, narrow, doorIssues }), spec: 사양 */
export function rulesOf(stage, c, spec) {
  const L = c.layout;
  const p = c.params || {};
  const { indoor, Df, front, back } = bands(L);
  const by = Object.fromEntries(L.rooms.map((r) => [r.key, r]));
  const name = (k) => by[k]?.name ?? (k === 'outside' ? '바깥' : k);
  const A = spec.area;
  const sc = Math.sqrt(A / 84) ** 0.6;
  const qubo = c.algo && c.algo.key !== 'model';
  const R = [];
  // 번호는 단계 안에서 차례로(R단계-순번)
  const add = (_id, kind, text, result, ok = null, basis = []) => R.push({ id: `R${stage}-${R.length + 1}`, kind, text, result, ok, basis });
  switch (stage) {
    case 1:
      add(1, 'rule', '폭 W = 전용면적 A ÷ 깊이 D (사각형 넓이가 언제나 A)', `W ${f2(L.W)}m × D ${f2(L.D)}m = ${f1(L.W * L.D)}㎡`, Math.abs(L.W * L.D - A) < 0.05, [law('주택법 시행규칙 §2(2)', '전용면적 = 세대 외벽 안쪽 면적(이 도구는 세대를 W × D 직사각형 하나로 단순화)', 'https://www.law.go.kr/법령/주택법시행규칙'), assume('세대 외곽을 직사각형 하나로 둠(판상형 단위세대)')]);
      add(2, 'search', `깊이 D는 ${f2(7.0 * sc)}~${f2(9.8 * sc)}m(= 7.0~9.8 × (A/84)<sup>0.3</sup>) 안에서 치수 다듬기로 정함`, `D = ${f2(L.D)}m`, L.D >= 7.0 * sc - 1e-6 && L.D <= 9.8 * sc + 1e-6, [assume('깊이 범위 7.0~9.8m(84㎡ 기준)는 판상형 단위세대의 통상 깊이로 정한 값'), lit('michalek-hybrid')]);
      break;
    case 2: {
      const k = front.filter((r) => r.type === '침실' && r.key !== 'master').length;
      add(1, 'rule', '앞 띠 깊이 = D × f, 뒤 띠 깊이 = D − D × f', `앞 ${f2(Df)}m(f = ${f2(p.frontShare ?? Df / L.D)}), 뒤 ${f2(L.D - Df)}m`, null, [lit('seo-bands'), assume('앞 띠 비율 f의 범위 0.46~0.68')]);
      add(2, 'rule', '앞(남) 띠에는 거실·안방·작은방 k개, 뒤(북) 띠에는 주방·현관·욕실·드레스룸·다목적실과 앞에 못 들어간 작은방', `앞: ${front.map((r) => r.name).join('·')} / 뒤: ${back.map((r) => r.name).join('·')}`, front.every((r) => ['거실', '침실'].includes(r.type)) && !back.some((r) => r.type === '거실'), [lit('seo-r1lr'), lit('seo-hall97'), lit('byun-living'), lit('ju-south')]);
      add(3, 'eval', '앞 띠 작은방 수 k: 최소 폭 합 3.0 + 3.6 + 2.6k가 띠 폭에 들어가는 최대값. k개·k−1개 두 템플릿을 모두 만들고 점수로 고름', `이 안: 앞 띠 작은방 ${k}개`, null, [lit('upasani-dims'), assume('최소 폭 값(안방 3.0·거실 3.6·작은방 2.6m)은 통상 치수')]);
      break;
    }
    case 3: {
      const kit = by.kitchen;
      const liv = by.living;
      const ent = by.entrance;
      const bedsAtEnt = indoor.filter((r) => r.type === '침실' && touches(r, ent)).map((r) => r.name);
      if (qubo) {
        const tpl = c.algo.perTemplate?.find((t) => t.k === c.algo.template);
        add(1, 'qubo', '실마다 칸 하나, 칸마다 실 하나 — 어기면 큰 벌점 P(Σx − 1)²', tpl ? (tpl.feasible ? '풀이기 해가 모두 지킴' : '풀이기 해가 어김 → 규칙으로 복구') : '—', tpl ? tpl.feasible : null, [lit('lucas-onehot'), lit('glover-qap'), lit('ayodele-penalty')]);
        add(2, 'qubo', '실 쌍 관계: 주방–거실·현관–거실은 맞닿으면 보상, 침실–현관은 맞닿으면 감점 (가중치는 손으로 정함)', `주방–거실 ${touches(kit, liv) ? '맞닿음' : '안 닿음'} · 현관–거실 ${touches(ent, liv) ? '맞닿음' : '안 닿음'} · 침실–현관 ${bedsAtEnt.length ? `맞닿음(${bedsAtEnt.join(', ')})` : '안 닿음'}`, !bedsAtEnt.length, [lit('seo-hall97'), lit('seo-bands'), lit('byun-living'), lit('ham-depth'), lit('park-privacy'), lit('jin-surrogate'), assume('가중치는 규칙·문헌으로 손으로 정하고 점수에 맞춰 보정하지 않음')]);
      } else add(1, 'search', '"기존: J 직접 탐색" — 실 순서와 치수를 무작위로 뽑고 조금씩 바꿔 J가 오르면 채택(QUBO 없음)', '이 안은 직접 탐색으로 만든 순서', null, [lit('michalek-hybrid'), lit('merrell-metropolis')]);
      const masterAtEnd = front.length && (front[0].key === 'master' || front.at(-1).key === 'master');
      add(3, 'rule', '안방은 앞 띠의 끝 칸(가운데에 오면 가까운 끝으로 옮김) — 부속실을 뒤에 붙이려고', masterAtEnd ? '안방이 끝 칸' : '안방이 끝이 아님', masterAtEnd, [lit('seo-master'), lit('zeng-master'), data('선택 규칙: 안방에 딸린 부속실(실제 아파트 통과율 78%)'), assume('부속실을 뒤에 붙이기 위해 끝 칸에 둠')]);
      const suite = ['bathMaster', 'dress'].filter((k) => by[k]);
      if (suite.length) add(4, 'rule', '부부욕실·드레스룸은 배치 변수에서 빼고 안방 뒤에 붙임', suite.map((k) => `${name(k)} ${touches(by[k], by.master) ? '안방에 붙음' : '안방과 떨어짐'}`).join(' · '), suite.every((k) => touches(by[k], by.master)), [lit('ham-suite'), data('선택 규칙: 안방에 딸린 화장실·드레스룸(맞닿은 부속실 ÷ 필요한 부속실, 실제 아파트 통과율 78%)')]);
      break;
    }
    case 4: {
      const minOf = (r) => (r.key === 'master' ? MIN_SIDE.안방 : MIN_SIDE[r.type] || 0);
      const bandRooms = [...front, ...back].filter((r) => minOf(r));
      const bad = bandRooms.filter((r) => r.w < minOf(r) - 1e-6);
      add(1, 'rule', '띠 폭을 나눌 때 최소 폭을 먼저: 욕실 1.5 · 현관 1.2 · 주방 2.2 · 침실 2.4 · 안방 3.0 · 거실 3.6m', bad.length ? `미달: ${bad.map((r) => `${r.name} ${f2(r.w)}m < ${minOf(r)}m`).join(', ')}` : `모두 지킴(${bandRooms.map((r) => `${r.name} ${f2(r.w)}`).join(' · ')}m)`, !bad.length, [lit('upasani-dims'), lit('rodrigues-shc'), assume('최소 폭 값(욕실 1.5·현관 1.2·주방 2.2·침실 2.4·안방 3.0·거실 3.6m)은 통상 치수')]);
      const sumF = front.reduce((s, r) => s + r.w, 0);
      add(2, 'rule', '남는 폭은 (원하는 폭 − 최소 폭)에 비례해 나눔. 원하는 폭 = 실 면적 ÷ 깊이', `앞 띠 폭 합 ${f2(sumF)}m = W ${f2(L.W)}m`, Math.abs(sumF - L.W) < 0.05, [assume('남는 폭을 (원하는 폭 − 최소 폭)에 비례해 나누는 방식은 이 도구의 설계')]);
      add(3, 'search', '작은방 폭 w · 안방 깊이 비율 g · 실별 면적 배수는 치수 다듬기(30번)로 정함', `w ${f2(p.bedWidth ?? 3)}m · g ${f2(p.masterDepth ?? 1)}`, null, [lit('michalek-hybrid'), lit('rodrigues-shc')]);
      add(4, 'eval', '최소 폭에 못 미치거나 거실·침실의 긴 변이 짧은 변의 2배를 넘는 실은 점수 J에서 15점씩 뺌', `이 안: ${c.narrow ?? 0}개`, !(c.narrow > 0), [lit('zeng-geom'), lit('upasani-dims'), assume('감점 15점과 장단비 2 기준은 설계 값')]);
      break;
    }
    case 5: {
      const halls = indoor.filter((r) => r.type === '기타');
      add(1, 'rule', '작은방 깊이 = 면적 ÷ 작은방 폭. 앞 띠보다 0.4m 이상 얕으면 그 뒤를 복도로 쓰고, 복도 폭은 1.1m 이상 확보', halls.length ? `복도 ${halls.length}곳(폭 ${halls.map((h) => f2(h.h)).join('·')}m)` : '작은방이 앞 띠를 채워 복도 없음', halls.every((h) => h.h >= 1.1 - 1e-6), [lit('seo-corridor'), assume('0.4m·1.1m 기준은 통상 복도 폭에서 정한 값')]);
      const m = by.master;
      const suite = ['bathMaster', 'dress'].filter((k) => by[k]);
      if (m) add(2, 'rule', '안방 깊이 = 앞 띠 깊이 × g (뒤에 0.6m 이상 남을 때). 남는 뒤쪽에 부부욕실·드레스룸', `안방 깊이 ${f2(m.h)}m / 앞 띠 ${f2(Df)}m${suite.length ? ` · 뒤쪽: ${suite.map(name).join('·')}` : ''}`, null, [lit('zeng-master'), lit('ham-suite'), assume('안방 깊이 비율 g의 범위 0.6~1')]);
      break;
    }
    case 6: {
      const ops = L.openings || [];
      const entry = ops.find((o) => o.entry);
      add(1, 'rule', '현관문 1개: 현관의 가장 긴 바깥 벽 가운데, 폭 1.0m', entry ? '현관문 있음' : '현관문 없음', Boolean(entry), [assume('현관문은 공용 복도 쪽 바깥 벽, 폭 1.0m')]);
      const opens = ops.filter((o) => o.kind === 'opening');
      add(2, 'rule', '공용 공간(현관·거실·주방·복도)끼리 0.8m 넘게 맞닿으면 벽 없이 틈(개구부, 최대 1.6m)', opens.length ? opens.map((o) => `${name(o.from)}–${name(o.to)}`).join(', ') : '없음', null, [lit('seo-ldk')]);
      const doors = ops.filter((o) => o.kind === 'door' && !o.entry);
      const rank = (room, target) => {
        const suite = room.key === 'bathMaster' || room.key === 'dress';
        const order = suite ? ['master', '기타', '거실', '주방', '현관'] : room.type === '실외기실' ? ['발코니', '주방', '기타', '거실'] : ['기타', '거실', '현관', '주방'];
        const i = order.indexOf(target.key === 'master' && suite ? 'master' : target.type);
        return i >= 0 ? `${i + 1}순위` : '그 밖';
      };
      const lines = doors.map((d) => {
        const room = by[d.to];
        const tgt = by[d.from];
        return room && tgt ? `${room.name} → ${tgt.type === '기타' ? '복도' : tgt.name}(${rank(room, tgt)})` : '';
      });
      const needDoor = indoor.filter((r) => !PUBLIC.has(r.type));
      const missing = needDoor.filter((r) => !doors.some((d) => d.to === r.key));
      add(3, 'rule', '실마다 문 하나(폭 침실 0.9 · 욕실·드레스룸 0.8m): 침실·욕실은 복도 → 거실 → 현관 → 주방 쪽 순으로 먼저 맞닿은 곳, 부부욕실·드레스룸은 안방 쪽. 침실은 다른 침실이나 부속실을 거쳐 들어가게 하지 않음(공용 공간에 못 닿으면 문 없음 → 감점)', `${lines.filter(Boolean).join(', ')}${missing.length ? ` · 문 없음: ${missing.map((r) => r.name).join(', ')}` : ''}`, !missing.length, [lit('hillier-access'), lit('seo-access'), assume('우선순위(복도 → 거실 → 현관 → 주방)와 문 폭(0.9·0.8m)은 통상 치수·관행')]);
      const dc = L.doorCheck || { unreachable: [], throughBedroom: [] };
      add(4, 'eval', '문·개구부로 이은 그래프에서 현관부터 못 가는 실, 침실을 지나야만 가는 실은 점수 J에서 15점씩 뺌(발코니 문은 실내 통로로 치지 않음)', `못 가는 실 ${dc.unreachable.length}개 · 침실 통과 ${dc.throughBedroom.length}개`, !dc.unreachable.length && !dc.throughBedroom.length, [lit('hillier-access'), lit('ham-depth'), lit('park-privacy'), assume('감점 15점은 설계 값')]);
      break;
    }
    case 7: {
      const ops = L.openings || [];
      const slide = ops.filter((o) => o.kind === 'sliding');
      const win = ops.filter((o) => o.kind === 'window');
      if (by.balcony) {
        add(1, 'rule', '발코니에 닿은 거실·침실·주방에는 맞닿은 길이의 75% 미닫이(발코니 문)', slide.length ? slide.map((o) => name(o.from)).join(', ') : '없음', null, [lit('ju-south'), assume('미닫이 폭 75%는 통상 비율')]);
        add(2, 'rule', '발코니 바깥 벽에는 길이의 85% 창', `${win.filter((o) => !o.to).length}개`, null, [assume('발코니 바깥 창 85%는 통상 비율')]);
      } else add(1, 'rule', '확장형(발코니 없음): 남쪽 바깥 벽도 일반 창', '발코니 없음', null, [assume('확장형은 남쪽 벽도 창')]);
      const withWin = new Set([...win.map((o) => o.to), ...slide.map((o) => o.from)].filter(Boolean));
      const living = indoor.filter((r) => ['거실', '침실'].includes(r.type));
      const noWin = living.filter((r) => !withWin.has(r.key));
      add(3, 'rule', '거실·침실·주방·욕실은 가장 긴 바깥 벽 가운데에 창(벽 길이의 거실 70 · 침실 55 · 주방 45 · 욕실 35%)', `창 ${win.filter((o) => o.to).length}개${noWin.length ? ` · 창 없는 거실·침실: ${noWin.map((r) => r.name).join(', ')}` : ' · 거실·침실 모두 창 있음'}`, !noWin.length, [lit('ju-shallow'), assume('창 비율(거실 70·침실 55·주방 45·욕실 35%)은 통상 비율')]);
      break;
    }
    default: {
      const fx = L.fixtures || [];
      const of = (key) => fx.filter((x) => x.room === key).map((x) => x.type);
      const baths = indoor.filter((r) => r.type === '화장실');
      add(1, 'rule', '욕실: 문에서 먼 옆벽을 따라 변기·세면대, 공용욕실(1.4 × 1.9m 이상)은 뒤 벽에 욕조', baths.map((b) => `${b.name}: ${of(b.key).join('·') || '없음'}`).join(' / '), null, [assume('설비 위치(문에서 먼 벽)는 통상 배치. 근거 문헌 없음')]);
      if (by.kitchen) add(2, 'rule', '주방: 거실 맞은편 벽을 따라 싱크대·가스레인지', `주방: ${of('kitchen').join('·') || '없음'}`, null, [assume('주방 설비 위치는 통상 배치. 근거 문헌 없음')]);
    }
  }
  // 규칙마다 실제 알고리즘 이름(방식 배지보다 구체적으로)
  const DEF = { rule: '닫힌 식·규칙', qubo: 'QUBO + 풀이기', search: '확률적 언덕 오르기', sa: '담금질(SA)', eval: '규칙·조건 점검' };
  const OV = [
    ['폭 W = 전용면적', '닫힌 식'],
    ['앞 띠 작은방 수', '조건식 + 후보 2개 비교(argmax)'],
    ['실마다 칸 하나', 'QUBO 원-핫 벌점'],
    ['실 쌍 관계', 'QUBO 이차 항(보상·감점)'],
    ['"기존: J 직접 탐색"', '무작위 탐색 + 확률적 언덕 오르기'],
    ['안방은 앞 띠의 끝', '해 복구 규칙(decode)'],
    ['부부욕실·드레스룸은 배치 변수', '부속 배치 규칙'],
    ['띠 폭을 나눌 때', '비례 배분 식'],
    ['남는 폭은', '비례 배분 식'],
    ['최소 폭에 못 미치거나', '감점 규칙(목적함수 J)'],
    ['작은방 깊이 =', '조건 분기 규칙(if-then)'],
    ['안방 깊이 =', '조건 분기 규칙(if-then)'],
    ['현관문 1개', '배치 규칙(가장 긴 바깥 벽)'],
    ['공용 공간(현관', '조건 규칙(맞닿음 ≥ 0.8m)'],
    ['실마다 문 하나', '우선순위 탐욕 선택(greedy)'],
    ['이은 그래프에서 현관부터', '그래프 도달 검사(BFS) + 감점'],
    ['발코니에 닿은', '배치 규칙(비율)'],
    ['발코니 바깥 벽', '배치 규칙(비율)'],
    ['확장형', '배치 규칙'],
    ['거실·침실·주방·욕실은 가장 긴', '배치 규칙(가장 긴 바깥 벽)'],
    ['욕실: 문에서', '배치 규칙(if-then)'],
    ['주방: 거실 맞은편', '배치 규칙(if-then)'],
  ];
  for (const r of R) {
    const plainText = r.text.replace(/<[^>]+>/g, '');
    r.algo = OV.find(([k]) => plainText.startsWith(k) || plainText.includes(k))?.[1] || DEF[r.kind];
  }
  return R;
}


/** 근거 조각들 → HTML. 문헌은 원문 대조 결과(원문에 있음 / 원문 개념 → 이 도구 규칙 / 초록만 확인), 원문 문장·위치를 함께 보여 준다. */
export function basisHtml(basis = []) {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const seen = new Set();
  return `<div class="gr-basis">${basis
    .filter((b) => (b.type === 'lit' ? !seen.has(b.key) && seen.add(b.key) : true))
    .map((b) => {
      if (b.type === 'lit') {
        const r = REFS[b.id];
        const c = CLAIMS[b.key];
        const lv = LEVEL[c.level];
        return `<div class="gr-cite lit ${lv.cls}"><a href="${r.url}" target="_blank" rel="noopener"><b>${esc(r.short)}</b><small>${esc(r.idx)}</small></a><em class="gr-lv">${lv.label}</em><span>${esc(c.ko)}</span>${c.how ? `<span class="gr-how">이 도구에서: ${esc(c.how)}</span>` : ''}<details class="gr-q"><summary>원문 · ${esc(c.loc)}</summary><q>${esc(c.quote)}</q></details></div>`;
      }
      const cls = b.type;
      const tag = { law: '법령', data: '데이터', assume: '설계 가정' }[b.type];
      const inner = `<b>${esc(b.type === 'assume' ? tag : b.label)}</b>${b.type === 'assume' ? '' : `<small>${tag}</small>`}<span>${esc(b.what)}</span>`;
      return b.url ? `<a class="gr-cite ${cls}" href="${b.url}" target="_blank" rel="noopener">${inner}</a>` : `<span class="gr-cite ${cls}">${inner}</span>`;
    })
    .join('')}</div>`;
}
export const BASIS_LEGEND = '<div class="gr-legend"><span class="gr-cite lit lv-direct"><b>문헌</b><em class="gr-lv">원문에 있음</em></span><span class="gr-cite lit lv-adapted"><b>문헌</b><em class="gr-lv">원문 개념 → 이 도구 규칙</em></span><span class="gr-cite lit lv-unverified"><b>문헌</b><em class="gr-lv">초록만 확인</em></span><span class="gr-cite law"><b>법령</b></span><span class="gr-cite data"><b>데이터</b><small>AI 허브 아파트 평면도 전체</small></span><span class="gr-cite assume"><b>설계 가정</b></span><span class="note">문헌 근거는 2026-10-28에 원문을 열어 한 줄씩 대조했습니다. <b>원문에 있음</b>: 적힌 내용이 원문에 있음. <b>원문 개념 → 이 도구 규칙</b>: 원문의 관찰·개념을 이 도구가 규칙으로 옮겼고 수치·식은 이 도구가 정함. <b>초록만 확인</b>: 전문을 열람하지 못함. 「원문」을 누르면 원문 문장과 쪽이 나옵니다. 설계 가정은 문헌 근거 없이 이 도구가 정한 값입니다.</span></div>';

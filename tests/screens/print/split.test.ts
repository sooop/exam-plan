/* 할일이 많은 단위를 2쪽으로 나누는 규칙의 순수 부분 시험(DOM 비의존): 칸 배치, 쪽 머리 표기, 쪽 수, 화면 안내 문구, 표 문자열.
   실제 맞춤(글자 크기·병합)과 쪽 나눔은 pageBreak.test.ts 의 실제 인쇄 시험과 앱 화면 검증에서 확인한다. */
import { describe, expect, it } from 'vitest';
import {
  buildCalModel, buildFitScript, buildStandaloneHtml, FIT_SIZES, pageCountOf, partLabelOf, renderCalendarHtml, splitKindOf, splitNotice, unitPageCount, weekSlots,
  type SplitPlan,
} from '../../../src/lib/screens/print/grid';
import { PT } from '../../../src/lib/screens/print/texts';
import { buildLoad } from './loadFixture';

/* 분할 계획: 번호만 쓰면 1단계, [번호, 첫째 주 쪽 추가 분할, 둘째 주 쪽 추가 분할] 이면 2단계 */
const P = (...e: (number | [number, boolean, boolean])[]): SplitPlan => new Map(e.map((x) => (typeof x === 'number' ? [x, [false, false] as const] : [x[0], [x[1], x[2]] as const])));
const kinds = (s: ReturnType<typeof weekSlots>) => s.map((x) => (x.kind === 'day' ? 'd' : x.kind === 'sum' ? 'S' : '.')).join('');
const dayIdx = (s: ReturnType<typeof weekSlots>) => s.filter((x) => x.kind === 'day').map((x) => (x as { i: number }).i);

describe('분할 후 칸 배치(weekSlots half)', () => {
  it('1주를 둘로 나누면 앞 쪽은 월-목 4칸, 뒤 쪽은 금-일 3칸과 요약 칸 1칸이다', () => {
    const a = weekSlots(7, 1, 1);
    const b = weekSlots(7, 1, 2);
    expect(kinds(a)).toBe('dddd');
    expect(dayIdx(a)).toEqual([0, 1, 2, 3]);
    expect(kinds(b)).toBe('dddS');
    expect(dayIdx(b)).toEqual([4, 5, 6]);
    expect(b[3]).toEqual({ kind: 'sum', week: 0 });
  });

  it('두 쪽을 합치면 날짜 7칸이 한 번씩, 요약 칸이 한 번 나온다(누락·중복 없음)', () => {
    const all = [...weekSlots(7, 1, 1), ...weekSlots(7, 1, 2)];
    expect(dayIdx(all)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(all.filter((x) => x.kind === 'sum')).toHaveLength(1);
  });

  it('half 를 주지 않으면 기존 배치 그대로이다(1주 8칸, 2주 16칸)', () => {
    expect(kinds(weekSlots(7, 1))).toBe('dddddddS');
    expect(kinds(weekSlots(14, 2))).toBe('dddddddSdddddddS');
    expect(kinds(weekSlots(7, 1, 0))).toBe('dddddddS');
  });
});

describe('분할 방식·표기·쪽 수·안내 문구', () => {
  it('두 주가 있는 2주 단위만 주별로 나누고, 1주 단위와 주가 하나뿐인 2주 단위는 요일 카드를 둘로 나눈다', () => {
    expect(splitKindOf(14, 2)).toBe('week');
    expect(splitKindOf(7, 1)).toBe('half');
    expect(splitKindOf(7, 2)).toBe('half');
  });

  it('쪽 머리 표기', () => {
    expect(partLabelOf('week', 1)).toBe('(2주 중 1주차)');
    expect(partLabelOf('week', 2)).toBe('(2주 중 2주차)');
    expect(partLabelOf('half', 1)).toBe('(1/2)');
    expect(partLabelOf('half', 2)).toBe('(2/2)');
    expect(partLabelOf('week', 1, 1)).toBe('(2주 중 1주차 1/2)');
    expect(partLabelOf('week', 2, 2)).toBe('(2주 중 2주차 2/2)');
  });

  it('쪽 수는 규칙에서 계산한다: 단위 수 + 단위마다(1 + 주 쪽을 또 나눈 수)', () => {
    expect(pageCountOf(4, P())).toBe(4);
    expect(pageCountOf(4, P(1, 2, 3))).toBe(7);
    expect(pageCountOf(1, P(1))).toBe(2);
    expect(pageCountOf(3, P([1, true, false]))).toBe(3 + 2); // 그 단위는 3쪽
    expect(pageCountOf(3, P([1, true, true], 2))).toBe(3 + 3 + 1); // 4쪽 단위와 2쪽 단위
    expect(unitPageCount(undefined)).toBe(1);
    expect(unitPageCount([false, false])).toBe(2);
    expect(unitPageCount([true, false])).toBe(3);
    expect(unitPageCount([true, true])).toBe(4);
  });

  it('화면 안내는 보기 형식에 맞게 구체적으로 적고(단위별 쪽 수 포함), 분할이 없으면 비어 있다', () => {
    expect(splitNotice(1, P())).toBe('');
    expect(splitNotice(1, P(3))).toBe('할일이 많아 1개 단위를 나눴습니다(1주 보기 3주차는 2쪽)');
    expect(splitNotice(1, P(4, 3))).toBe('할일이 많아 2개 단위를 나눴습니다(1주 보기 3주차는 2쪽, 1주 보기 4주차는 2쪽)');
    expect(splitNotice(2, P([2, true, true], 1))).toBe('할일이 많아 2개 단위를 나눴습니다(2주 보기 1쪽째는 2쪽, 2주 보기 2쪽째는 4쪽)');
    expect(PT.reduced(3)).toContain('외 3개'); // 줄임 안내는 따로 남는다
  });
});

describe('분할한 쪽 모델과 표 문자열', () => {
  const { state, exam } = buildLoad(5, 2); // 준비 5주
  const model = (view: 'one' | 'two', split: SplitPlan) => buildCalModel(state, exam, view, '2026-11-01', split);
  const slotCount = (html: string) => (html.match(/class="wk-day( out| note wk-wsum)?"|class="wk-blank"/g) ?? []).length;
  const pagesOf = (html: string) => html.split('<div class="pg wk">').slice(1);

  it('분할이 없으면 기존 모델과 같다(쪽 수 = 단위 수, 분할 표기 없음)', () => {
    const m = model('one', P());
    expect(m.pages).toHaveLength(5);
    expect(m.pages.every((p) => p.part === 0 && p.label === '' && p.half === 0)).toBe(true);
    expect(JSON.stringify(m)).toBe(JSON.stringify(buildCalModel(state, exam, 'one', '2026-11-01')));
    expect(renderCalendarHtml(m)).not.toContain('data-part');
  });

  it('1주 보기에서 3주차만 나누면 쪽이 6개이고 그 단위만 (1/2)(2/2) 쪽 둘이다', () => {
    const m = model('one', P(3));
    expect(m.pages).toHaveLength(pageCountOf(5, P(3)));
    expect(m.pages.map((p) => [p.index, p.part, p.label])).toEqual([
      [1, 0, ''], [2, 0, ''], [3, 1, '(1/2)'], [3, 2, '(2/2)'], [4, 0, ''], [5, 0, ''],
    ]);
    expect(m.pages.every((p) => p.total === 5)).toBe(true); // 단위 번호 표기는 그대로
    const html = renderCalendarHtml(m);
    const pages = pagesOf(html);
    expect(pages.map(slotCount)).toEqual([8, 8, 4, 4, 8, 8]);
    expect(pages[2]).toContain('data-unit="3" data-part="1" data-split="half"');
    expect(pages[3]).toContain('data-unit="3" data-part="2" data-split="half"');
    expect(pages[2]).toContain('<span class="part">(1/2)</span>');
    expect(pages[2]).toContain('wk-grid w1 half');
    expect(pages[3]).toContain('wk-wsum'); // 요약 칸은 뒤 쪽에
    expect(pages[2]).not.toContain('wk-wsum');
    expect(pages[0]).not.toContain('data-part');
  });

  it('분할한 두 쪽의 날짜 카드를 합치면 그 주의 7일이 빠짐없이 한 번씩이다', () => {
    const html = renderCalendarHtml(model('one', P(2)));
    const [, a, b] = pagesOf(html);
    const days = (p: string) => (p.match(/data-w="\d"/g) ?? []).map((x) => x.slice(8, 9));
    expect([...days(a), ...days(b)].sort()).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    // 할일 줄도 두 쪽의 합이 그 주의 할일 수와 같다
    const rows = (p: string) => (p.match(/<li data-g=/g) ?? []).length;
    const wk = model('one', P()).pages[1];
    expect(rows(a) + rows(b)).toBe(wk.days.reduce((n, d) => n + d.tasks.length, 0));
  });

  it('2주 보기에서 1쪽을 나누면 주별 쪽 둘(각 4x2 = 8칸)이고 제목은 그 주 범위, 표기는 (2주 중 n주차)', () => {
    const m = model('two', P(1));
    expect(m.pages).toHaveLength(pageCountOf(3, P(1)));
    expect(m.pages.map((p) => [p.index, p.part, p.label])).toEqual([[1, 1, '(2주 중 1주차)'], [1, 2, '(2주 중 2주차)'], [2, 0, ''], [3, 0, '']]);
    expect(m.pages[0].title).not.toBe(m.pages[1].title);
    expect(m.pages[0].days).toHaveLength(7);
    expect(m.pages[0].weeks).toHaveLength(1);
    const pages = pagesOf(renderCalendarHtml(m));
    expect(pages.map(slotCount)).toEqual([8, 8, 16, 16]);
    expect(pages[0]).toContain('wk-grid w1"');
    expect(pages[0]).toContain('data-split="week"');
    expect(pages[0].match(/wk-wsum/g) ?? []).toHaveLength(1);
    expect(pages[2]).toContain('wk-grid w2"');
  });

  it('2주 보기에서 주가 하나뿐인 마지막 단위(3쪽)를 나누면 요일 카드를 둘로 나눈다', () => {
    const m = model('two', P(3));
    expect(m.pages.map((p) => [p.index, p.part, p.label])).toEqual([[1, 0, ''], [2, 0, ''], [3, 1, '(1/2)'], [3, 2, '(2/2)']]);
    expect(m.pages[2].days).toHaveLength(7);
  });

  it('2단계: 2주 단위의 주 쪽을 또 나누면 그 주만 (2주 중 n주차 h/2) 쪽 둘이 되고 단위는 최대 4쪽이다', () => {
    const plan = P([1, false, true]);
    const m = model('two', plan);
    expect(m.pages.map((p) => [p.index, p.part, p.half, p.label])).toEqual([
      [1, 1, 0, '(2주 중 1주차)'], [1, 2, 1, '(2주 중 2주차 1/2)'], [1, 2, 2, '(2주 중 2주차 2/2)'], [2, 0, 0, ''], [3, 0, 0, ''],
    ]);
    expect(m.pages).toHaveLength(pageCountOf(3, plan));
    const pages = pagesOf(renderCalendarHtml(m));
    expect(pages.map(slotCount)).toEqual([8, 4, 4, 16, 16]);
    expect(pages[1]).toContain('data-unit="1" data-part="2" data-split="week" data-half="1"');
    expect(pages[1]).toContain('wk-grid w1 half');
    expect(pages[0]).not.toContain('data-half');
    expect(pages[2]).toContain('wk-wsum'); // 요약 칸은 그 주의 뒤 쪽에
    expect(pages[1]).not.toContain('wk-wsum');
    expect(m.pages[1].title).toBe(m.pages[2].title);
    expect(m.pages[1].title).not.toBe(m.pages[0].title);
    const full = P([1, true, true]);
    const four = model('two', full);
    expect(four.pages.filter((p) => p.index === 1)).toHaveLength(4);
    expect(four.pages.length).toBe(pageCountOf(3, full));
    // 날짜 카드는 4쪽을 합치면 14일이 한 번씩이다
    const days = four.pages.filter((p) => p.index === 1).flatMap((p) => weekSlots(p.days.length, 1, p.half).flatMap((sl) => (sl.kind === 'day' ? [p.days[sl.i].iso] : [])));
    expect(days).toHaveLength(14);
    expect(new Set(days).size).toBe(14);
  });

  it('주가 하나뿐인 2주 단위나 1주 단위는 2단계가 없다(계획에 true 가 있어도 요일 카드 분할 2쪽)', () => {
    expect(model('one', P([2, true, true])).pages.filter((p) => p.index === 2)).toHaveLength(2);
    expect(model('two', P([3, true, true])).pages.filter((p) => p.index === 3)).toHaveLength(2);
  });

  it('단위별로 독립이다: 여러 단위를 나눠도 나눈 만큼만 쪽이 늘고, 순서가 섞이지 않는다', () => {
    const m = model('one', P(1, 4));
    expect(m.pages.map((p) => p.index)).toEqual([1, 1, 2, 3, 4, 4, 5]);
    expect(m.pages.length).toBe(pageCountOf(5, P(1, 4)));
  });

  it('한 장 달력 보기는 분할 집합이 있어도 그대로다', () => {
    const m = buildCalModel(state, exam, 'all', '2026-11-01', P(1, 2));
    expect(m.pages).toHaveLength(1);
    expect(m.pages[0].part).toBe(0);
  });
});

describe('저장 파일은 분할된 구조를 그대로 담고 분할 로직은 스크립트에 없다', () => {
  const { state, exam } = buildLoad(4, 2);
  it('분할한 표를 그대로 직렬화하고 맞춤 스크립트는 글자 크기·병합·줄임만 한다', () => {
    const html = renderCalendarHtml(buildCalModel(state, exam, 'one', '2026-11-01', P(2)));
    const doc = buildStandaloneHtml('x', html);
    expect(doc).toContain(html);
    expect(doc.split('data-split="half"')).toHaveLength(3);
    const script = buildFitScript(FIT_SIZES, PT.more('{n}'));
    for (const word of ['weekSlots', 'splitKindOf', 'buildCalModel', 'splitNotice', 'partLabelOf']) expect(script).not.toContain(word);
    expect(script).toContain('fitCalendar(document,cfg)');
    expect(script).not.toContain('deferCut:true'); // 저장 파일의 스크립트는 분할을 알리지 않고 마지막 수단(줄임)을 쓴다
  });
});

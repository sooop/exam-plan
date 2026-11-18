/* 달력 맞춤(print/fit.ts)과 칸 배치(weekSlots)의 순수 부분 시험. DOM 측정은 실제 브라우저에서 확인한다. */
import { describe, expect, it } from 'vitest';
import * as core from '../../../src/lib/core/index';
import { buildRich } from '../../core/fixtures';
import {
  buildCalModel, buildFitScript, buildSteps, buildStandaloneHtml, cutAt, FIT_SIZES, groupRuns, itemLabel, limitLines, mergeGroup, moreText,
  renderCalendarHtml, weekSlots, type FitItem,
} from '../../../src/lib/screens/print/grid';
import { PT } from '../../../src/lib/screens/print/texts';

const it1 = (seq: number, over: Partial<FitItem> = {}): FitItem => ({ gid: 'a', kind: '교재', seq, seq2: seq, done: false, head: '국어', of: 10, n: 1, ...over });

describe('연속 회차 병합', () => {
  it('같은 과목·종류의 이어지는 회차를 묶는다', () => {
    const items = [it1(3), it1(4), it1(5), it1(7), it1(1, { gid: 'b', head: '수학' }), it1(2, { gid: 'b', head: '수학' })];
    expect(groupRuns(items)).toEqual([[0, 1, 2], [3], [4, 5]]);
  });

  it('종류가 다르거나 과목이 다르면 묶지 않는다', () => {
    expect(groupRuns([it1(3), it1(4, { kind: '문제집' })])).toEqual([[0], [1]]);
    expect(groupRuns([it1(3), it1(4, { gid: 'z' })])).toEqual([[0], [1]]);
    expect(groupRuns([])).toEqual([]);
  });

  it('묶음은 한 줄이 되고 이름은 범위로, 완료는 모두 완료일 때만이다', () => {
    const items = [it1(3, { done: true }), it1(4, { done: true }), it1(5)];
    const m = mergeGroup(items, [0, 1, 2]);
    expect(itemLabel(m)).toBe('국어 3–5/10');
    expect(m.n).toBe(3);
    expect(m.done).toBe(false);
    expect(mergeGroup(items, [0, 1]).done).toBe(true);
    expect(itemLabel(it1(2, { head: '국어 리캡', of: 2 }))).toBe('국어 리캡 2/2');
  });
});

describe('줄 수 제한과 외 N개', () => {
  it('줄이 충분하면 그대로 둔다', () => {
    expect(limitLines([1, 1, 1], 3)).toEqual({ shown: 3, hidden: 0 });
    expect(limitLines([], 1)).toEqual({ shown: 0, hidden: 0 });
  });

  it('넘치면 마지막 한 줄을 외 N개로 쓰고 가려진 할일 수를 센다(병합한 줄은 개수만큼)', () => {
    expect(limitLines([1, 1, 1, 1, 1], 3)).toEqual({ shown: 2, hidden: 3 });
    expect(limitLines([1, 3, 2, 1], 3)).toEqual({ shown: 2, hidden: 3 });
    expect(limitLines([1, 1, 1], 1)).toEqual({ shown: 0, hidden: 3 });
  });

  it('마지막 한 줄만 바꿔도 되고(keep = 줄 수 - 1) 가려진 개수는 병합한 줄의 할일 수를 합친다', () => {
    expect(cutAt([1, 2, 1], 2)).toEqual({ shown: 2, hidden: 1 });
    expect(cutAt([1, 2, 1], 1)).toEqual({ shown: 1, hidden: 3 });
    expect(cutAt([1, 2, 1], 0)).toEqual({ shown: 0, hidden: 4 });
  });

  it('문구는 틀의 {n} 에 개수를 넣는다', () => {
    expect(moreText(PT.more('{n}'), 4)).toBe('외 4개');
    expect(PT.reduced(7)).toBe('일부 카드는 할일이 많아 7개를 "외 7개"로 줄였습니다');
  });
});

describe('크기 단계', () => {
  it('사다리는 큰 값부터이고 같은 크기에서 병합 없이, 병합해서 순서로 시도한다', () => {
    expect([...FIT_SIZES]).toEqual([11, 10, 9, 8.5, 8]);
    expect(buildSteps([9, 11, 9])).toEqual([
      { size: 11, merge: false }, { size: 11, merge: true }, { size: 9, merge: false }, { size: 9, merge: true },
    ]);
  });
});

describe('칸 순서와 요약 칸 위치', () => {
  const kinds = (s: ReturnType<typeof weekSlots>) => s.map((x) => (x.kind === 'day' ? 'd' : x.kind === 'sum' ? 'S' : '.')).join('');

  it('1주는 4열 x 2행 = 8칸: 요일 7개 뒤에 요약 칸', () => {
    const s = weekSlots(7, 1);
    expect(s).toHaveLength(8);
    expect(kinds(s)).toBe('dddddddS');
    expect(s.filter((x) => x.kind === 'day').map((x) => (x as { i: number }).i)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('2주는 4열 x 4행 = 16칸: 주마다 요약 칸이 그 주의 마지막 줄 끝(4n+3 번째)', () => {
    const s = weekSlots(14, 2);
    expect(s).toHaveLength(16);
    expect(kinds(s)).toBe('dddddddSdddddddS');
    expect(s[7]).toEqual({ kind: 'sum', week: 0 });
    expect(s[15]).toEqual({ kind: 'sum', week: 1 });
  });

  it('주가 하나뿐인 2주 쪽은 그 주 + 요약 칸 + 빈 칸 8개로 4x4 를 채운다', () => {
    const s = weekSlots(7, 2);
    expect(s).toHaveLength(16);
    expect(kinds(s)).toBe('dddddddS........');
  });
});

describe('표 문자열의 주간 배치', () => {
  const state = buildRich(core);
  const ex = state.exams[0];

  it('1주 쪽마다 칸 8개(날짜 7 + 요약 1), 2주 쪽마다 16칸이다', () => {
    const one = renderCalendarHtml(buildCalModel(state, ex, 'one', '2026-04-06'));
    const pagesOne = one.split('<div class="pg wk">').slice(1);
    expect(pagesOne).toHaveLength(4);
    for (const p of pagesOne) {
      expect((p.match(/class="wk-day( out| note wk-wsum)?"/g) ?? [])).toHaveLength(8);
    }
    const two = renderCalendarHtml(buildCalModel(state, ex, 'two', '2026-04-06'));
    const pagesTwo = two.split('<div class="pg wk">').slice(1);
    expect(pagesTwo).toHaveLength(2);
    for (const p of pagesTwo) {
      expect((p.match(/class="wk-day( out| note wk-wsum)?"|class="wk-blank"/g) ?? [])).toHaveLength(16);
      expect((p.match(/wk-wsum/g) ?? [])).toHaveLength(2);
    }
  });

  it('요약 칸은 주간 할일 수·완료·남음과 읽기용 요약을 담는다', () => {
    const m = buildCalModel(state, ex, 'one', '2026-04-06');
    const w = m.pages[0].weeks[0];
    expect(w.sum).toBe(3);
    expect(w.done + w.left).toBe(w.sum);
    const html = renderCalendarHtml(m);
    expect(html).toContain('주간 요약, 할일 3개');
    expect(html).toContain('data-g=');
  });

  it('저장 파일에는 맞춤 스크립트가 head 에 들어가고 본문 앞뒤는 그대로다', () => {
    const doc = buildStandaloneHtml('x', '<div class="pgs"></div>');
    expect(doc).toContain('<script>(function(){function itemLabel');
    expect(doc).toContain('function fitCalendar');
    expect(doc).toContain('beforeprint');
    expect(doc).not.toContain('</script></script>');
  });

  it('맞춤 스크립트는 단독으로 실행 가능한 JavaScript 이다', () => {
    const src = buildFitScript(FIT_SIZES, PT.more('{n}'));
    /* 브라우저 전역 없이 문법과 함수 선언만 확인한다: document 가 없어도 run 이 예외를 삼킨다 */
    const g = globalThis as Record<string, unknown>;
    const saved = { document: g.document, addEventListener: g.addEventListener };
    g.document = { readyState: 'complete', querySelectorAll: () => [] };
    g.addEventListener = () => {};
    try {
      expect(() => new Function(src)()).not.toThrow();
    } finally {
      g.document = saved.document;
      g.addEventListener = saved.addEventListener;
    }
  });
});

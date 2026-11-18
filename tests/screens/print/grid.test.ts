/* 달력 데이터(print/grid.ts) 시험.
   1) 원본 printGrid 를 같은 입력에서 돌려 칸·날짜 카드·쪽 머리를 구조째 대조한다(한 장, 2주, 1주).
   2) 대표 입력(시험 2개, 과목 여러 개, 여러 날 배치)의 기대 구조를 직접 확인한다.
   3) 읽기 전용이고, 빈 상태와 문자열 이스케이프가 맞는지 확인한다. */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as core from '../../../src/lib/core/index';
import type { Exam, State } from '../../../src/lib/core/types';
import { freezeEnv, loadLegacy, restoreEnv } from '../../core/legacy-loader';
import { buildRich } from '../../core/fixtures';
import { S, WD, KIND_ICON, fmtFull, fmtMD } from '../../../src/lib/app/strings';
import {
  buildCalModel, buildStandaloneHtml, calendarFileName, CAL_VIEWS, renderCalendarHtml,
  type CalModel, type CalView,
} from '../../../src/lib/screens/print/grid';
import { PRINT_CSS } from '../../../src/lib/screens/print/printCss';

afterEach(() => restoreEnv());

/* ---------- 원본 printGrid 를 잘라 실행하는 도구 ---------- */
const LEGACY_HTML = readFileSync(fileURLToPath(new URL('../../../legacy/exam-plan.html', import.meta.url)), 'utf8');
const LEGACY_PRINT_GRID = (() => {
  const a = LEGACY_HTML.indexOf('function printGrid(ex, perPage) {');
  const b = LEGACY_HTML.indexOf('\nfunction buildPrintHtml(', a);
  if (a < 0 || b < 0) throw new Error('원본에서 printGrid 범위를 찾지 못했다');
  return LEGACY_HTML.slice(a, b);
})();

type LNode = { tag: string; props: Record<string, any>; kids: any[] };
/* 원본의 el 과 같은 모양으로 DOM 대신 트리를 만든다(속성·dataset·텍스트·자식만 남긴다). */
function el(tag: string, props: Record<string, any> | null, ...kids: any[]): LNode {
  return { tag, props: props ?? {}, kids: kids.flat(Infinity).filter((k) => k != null && k !== false) };
}
const ico = (name: string) => ({ icon: name });
const byClass = (n: any, cls: string): any => {
  if (!n || typeof n !== 'object' || !('kids' in n)) return null;
  if (n.props?.class === cls) return n;
  for (const k of n.kids) {
    const f = byClass(k, cls);
    if (f) return f;
  }
  return null;
};
const text = (n: any): string => (n && typeof n === 'object' && 'props' in n ? (n.props.text ?? '') : '');
const cls = (n: LNode, c: string): LNode | undefined => n.kids.find((k: LNode) => k.props?.class === c);

function runLegacy(state: unknown, ex: unknown, perPage: number): LNode {
  const P = loadLegacy();
  const factory = new Function(
    'P', 'state', 'el', 'ico', 'S', 'KIND_ICON', 'WD', 'fmtMD', 'fmtFull', 'commit',
    `'use strict';\n${LEGACY_PRINT_GRID}\nreturn printGrid;`,
  );
  const printGrid = factory(P, state, el, ico, S, KIND_ICON, WD, fmtMD, fmtFull, () => {});
  return printGrid(ex, perPage);
}

/* 원본 트리를 비교용 모양으로 줄인다(월간) */
function legacyMonth(tree: LNode) {
  const title = byClass(tree, 'pg-title');
  const grid = byClass(tree, 'pg-grid');
  const days = grid.kids.slice(7).map((c: LNode) => {
    if (c.props.class === 'pg-cell out') return { out: true };
    const ds = c.props.dataset ?? {};
    const h = cls(c, 'pg-h')!;
    const ul = c.kids.find((k: LNode) => k.tag === 'ul')!;
    return {
      out: false,
      label: text(h.kids[0]),
      hol: h.kids[1] ? text(h.kids[1]) : '',
      exam: text(cls(c, 'pg-exam')),
      memo: text(cls(c, 'pg-memo')),
      we: 'we' in ds,
      today: 'today' in ds,
      tasks: ul.kids.map((li: LNode) => {
        const btn = li.kids[0];
        const [, icon, span] = btn.kids;
        return { done: 'done' in (li.props.dataset ?? {}), icon: icon.icon, label: text(span) };
      }),
    };
  });
  return { name: text(title.kids[0]), range: text(title.kids[1]), days };
}

/* 원본 트리를 비교용 모양으로 줄인다(주간: 쪽마다 머리·알약·날짜 카드) */
function legacyWeek(tree: LNode) {
  return tree.kids.map((pg: LNode) => {
    const [left, sumEl, pgn] = pg.kids[0].kids;
    const grid = pg.kids[1];
    const pills = sumEl.kids.filter((k: LNode) => k.tag === 'span' && !k.props.class).map((s: LNode) => ({
      name: s.kids[1], color: String(s.props.style).replace('--c:', ''), count: Number(text(s.kids[2])),
    }));
    const dayCards = grid.kids.slice(0, -1).map((c: LNode) => {
      if (c.props.class === 'wk-day out') {
        const [n, w] = c.kids[0].kids;
        return { out: true, dayNum: text(n), wdText: text(w) };
      }
      const ds = c.props.dataset ?? {};
      const dh = c.kids[0];
      const exam = cls(c, 'wk-exam');
      const memo = cls(c, 'wk-memo');
      const ul = c.kids.find((k: LNode) => k.tag === 'ul')!;
      return {
        out: false,
        w: Number(ds.w),
        wdText: text(dh.kids[1]),
        dayNum: text(dh.kids[0]),
        we: 'we' in ds,
        hol: dh.kids.some((k: LNode) => k.tag === 'small') ? text(dh.kids.find((k: LNode) => k.tag === 'small')) : '',
        today: 'today' in ds,
        exam: 'exam' in ds,
        dLabel: text(dh.kids.find((k: LNode) => k.props.class === 'd')),
        examTitle: exam ? text(exam.kids[0]) : '',
        examNames: exam ? text(exam.kids[1]) : '',
        memo: memo ? text(memo.kids[1]) : '',
        tasks: ul.kids.map((li: LNode) => {
          const btn = li.kids[0];
          const [, b, small] = btn.kids;
          return { label: text(b), kind: text(small), done: 'done' in (btn.props.dataset ?? {}), color: String(btn.props.style).replace('--c:', '') };
        }),
      };
    });
    return {
      title: text(left.kids[1]),
      pgn: text(pgn),
      sumText: text(byClass(sumEl, 'tot')),
      pills,
      days: dayCards,
      memoCard: grid.kids[grid.kids.length - 1].props.class,
    };
  });
}

/* 같은 입력을 모델로 만든 결과를 위 모양으로 줄인다 */
function ourMonth(m: CalModel) {
  return {
    name: m.name,
    range: m.range,
    days: m.pages[0].days.map((c) => (c.out ? { out: true } : {
      out: false,
      label: c.label,
      hol: c.hol,
      exam: c.examIdx ? S.examLine(c.examIdx, c.examNames) : '',
      memo: c.memo,
      we: c.we,
      today: c.today,
      tasks: c.tasks.map((t) => ({ done: t.done, icon: t.icon, label: t.label })),
    })),
  };
}

function ourWeek(m: CalModel) {
  return m.pages.map((p) => ({
    title: p.title,
    pgn: `${p.index} / ${p.total}`,
    sumText: p.sum ? S.weekTotal(p.sum) : '',
    pills: p.pills.map((pl) => ({ name: pl.name, color: pl.color, count: pl.count })),
    days: p.days.map((c) => (c.out ? { out: true, dayNum: c.dayNum, wdText: WD[c.wd] } : {
      out: false,
      w: c.wd,
      wdText: WD[c.wd],
      dayNum: c.dayNum,
      we: c.we,
      hol: c.hol,
      today: c.today,
      exam: c.examIdx > 0,
      dLabel: c.dd > 0 ? 'D-' + c.dd : c.dd === 0 ? 'D-DAY' : '',
      examTitle: c.examIdx ? S.examDayN(c.examIdx) : '',
      examNames: c.examNames,
      memo: c.memo,
      tasks: c.tasks.map((t) => ({ label: t.label, kind: t.kind, done: t.done, color: t.color })),
    })),
    memoCard: 'wk-day note',
  }));
}

/* 원본 함수는 state 와 ex 를 객체로 받는다. 같은 값을 깊은 복사해 넘긴다(두 구현이 서로 상태를 건드리지 않게). */
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe('달력 데이터는 원본 printGrid 와 같다', () => {
  it.each(CAL_VIEWS.map((v) => [v.label, v.key, v.perPage] as const))('보기 %s', (_label, view, perPage) => {
    freezeEnv();
    const state = buildRich(core);
    const today = core.todayISO();
    for (const ex of state.exams) {
      const legacyTree = runLegacy(clone(state), clone(ex), perPage);
      const ours = buildCalModel(state, ex, view as CalView, today);
      if (perPage === 0) {
        expect(ourMonth(ours)).toStrictEqual(legacyMonth(legacyTree));
      } else {
        expect(ourWeek(ours)).toStrictEqual(legacyWeek(legacyTree));
      }
    }
  });
});

/* ---------- 대표 입력의 기대 구조 ---------- */
function firstExam(state: State): Exam {
  const ex = state.exams[0];
  if (!ex) throw new Error('시험이 없다');
  return ex;
}

describe('대표 입력(시험 1개, 과목 여러 개, 여러 날 배치)의 구조', () => {
  it('한 장 달력은 준비 시작 주의 월요일부터 종료 주의 일요일까지 칸을 만든다', () => {
    const state = buildRich(core);
    const m = buildCalModel(state, firstExam(state), 'all', '2026-04-06');
    const days = m.pages[0].days;
    /* 준비 시작 2026-04-01(수)~종료 2026-04-24(금): 03-30~04-26 = 28칸, 범위 밖 4칸 */
    expect(days).toHaveLength(28);
    expect(days.filter((c) => c.out).map((c) => c.iso)).toEqual(['2026-03-30', '2026-03-31', '2026-04-25', '2026-04-26']);
    expect(m.range).toBe(fmtFull('2026-04-01') + ' ~ ' + fmtFull('2026-04-24'));
  });

  it('할일은 날짜 칸에 과목 순서대로 놓이고 완료 표시가 따른다', () => {
    const state = buildRich(core);
    const m = buildCalModel(state, firstExam(state), 'all', '2026-04-06');
    const byIso = (iso: string) => m.pages[0].days.find((c) => c.iso === iso)!;
    /* 배치할 때마다 날짜순으로 번호를 다시 매기므로(normalizeOrder) 회차가 날짜 순서대로 붙는다.
       완료 표시는 buildRich 의 토글 결과(1/5 완료, 2/5 미완료)를 따른다. */
    expect(byIso('2026-04-02').tasks).toEqual([
      expect.objectContaining({ label: '국어 1/5', done: true, kind: '교재', icon: 'book-open' }),
      expect.objectContaining({ label: '국어 2/5', done: false, kind: '교재' }),
    ]);
    expect(byIso('2026-04-05').tasks.map((t) => t.label)).toEqual(['국어 3/5']);
    expect(byIso('2026-04-06').tasks).toEqual([expect.objectContaining({ label: '수학 1/2', done: true, kind: '교재' })]);
    expect(byIso('2026-04-18').tasks).toEqual([expect.objectContaining({ label: '국어 리캡 1/2', kind: '리캡', done: false, icon: 'rotate-ccw' })]);
  });

  it('휴일·메모·바쁨 정도·시험 일차와 오늘 표시가 칸에 들어간다', () => {
    const state = buildRich(core);
    const m = buildCalModel(state, firstExam(state), 'all', '2026-04-06');
    const byIso = (iso: string) => m.pages[0].days.find((c) => c.iso === iso)!;
    expect(byIso('2026-04-04').hol).not.toBe('');
    expect(byIso('2026-04-04').we).toBe(true);
    expect(byIso('2026-04-08').memo).toBe('모의고사');
    expect(byIso('2026-04-08').level).toBe('매우 바쁨');
    expect(byIso('2026-04-06').level).toBe('바쁨');
    expect(byIso('2026-04-06').today).toBe(true);
    expect(byIso('2026-04-22').examIdx).toBe(3);
    expect(byIso('2026-04-22').examNames).toContain('국어');
    expect(byIso('2026-04-01').label).toBe('4/1');
  });

  it('주간 보기는 쪽마다 할일 수와 과목별 개수, 날짜 카드의 D-day 와 시험 일차를 둔다', () => {
    const state = buildRich(core);
    const m = buildCalModel(state, firstExam(state), 'one', '2026-04-06');
    expect(m.pages).toHaveLength(4);
    expect(m.pages[0].title).toBe('3월 30일 – 4월 5일');
    expect(m.pages[0].sum).toBe(3);
    expect(m.pages[0].pills).toEqual([expect.objectContaining({ name: '국어', count: 3 })]);
    const examDay = m.pages[3].days[0];
    expect(examDay.iso).toBe('2026-04-20');
    expect(examDay.dd).toBe(0);
    expect(examDay.examIdx).toBe(1);
  });

  it('두 주 보기는 28일을 2쪽으로 나눈다', () => {
    const state = buildRich(core);
    const m = buildCalModel(state, firstExam(state), 'two', '2026-04-06');
    expect(m.pages.map((p) => p.days.length)).toEqual([14, 14]);
    expect(m.perPage).toBe(2);
  });

  it('표 문자열은 쪽 구조와 칸의 읽기용 요약을 담는다', () => {
    const state = buildRich(core);
    const html = renderCalendarHtml(buildCalModel(state, firstExam(state), 'all', '2026-04-06'));
    expect(html.startsWith('<div class="pgs">')).toBe(true);
    expect((html.match(/class="pg-cell out"/g) ?? [])).toHaveLength(4);
    expect(html).toContain('4월 6일 월요일, 바쁨 정도 바쁨, 할일 1개, 완료 1개');
    expect(html).toContain('<span class="sr-only">');
  });
});

describe('빈 상태와 안전성', () => {
  it('준비 기간이 없으면 빈 모델과 빈 문자열을 돌려준다', () => {
    const state = buildRich(core);
    const ex = clone(firstExam(state));
    ex.prepStart = 'not-a-date';
    const m = buildCalModel(state, ex, 'all', '2026-04-06');
    expect(m.empty).toBe('noprep');
    expect(m.pages).toHaveLength(0);
    expect(renderCalendarHtml(m)).toBe('');
  });

  it('과목명의 꺾쇠 괄호는 표 문자열에서 이스케이프된다', () => {
    const state = buildRich(core);
    const ex = firstExam(state);
    const sub = ex.subs[0];
    const subject = state.library.find((x) => x.id === sub.subjectId)!;
    subject.name = '<img src=x onerror=alert(1)>';
    const html = renderCalendarHtml(buildCalModel(state, ex, 'all', '2026-04-06'));
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('보기를 만들거나 그리는 동안 상태를 바꾸지 않는다(읽기 전용)', () => {
    const state = buildRich(core);
    const before = JSON.stringify(state);
    for (const v of CAL_VIEWS) renderCalendarHtml(buildCalModel(state, firstExam(state), v.key, '2026-04-06'));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('저장용 HTML 은 PRINT_CSS 와 달력 표를 담은 독립 문서다', () => {
    const doc = buildStandaloneHtml('2026 <테스트>', '<div class="pgs"></div>');
    expect(doc.startsWith('<!DOCTYPE html><html lang="ko">')).toBe(true);
    expect(doc).toContain(PRINT_CSS);
    expect(doc).toContain('<title>2026 &lt;테스트&gt;</title>');
    expect(doc).toContain('<body><div class="pgs"></div></body>');
  });

  it('저장 파일 이름은 금지 문자를 빼고 보기 이름을 붙인다', () => {
    expect(calendarFileName('a/b:c?', 'all')).toBe('abc ' + S.printModeAll + '.html');
    expect(calendarFileName('기말', 'one')).toBe('기말 ' + S.printModeOne + '.html');
  });
});

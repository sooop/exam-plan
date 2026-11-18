import { describe, expect, it } from 'vitest';
import { addSub, newExam, newState, moveTask, setDayLevel, setPlan, setHoliday } from '../../../src/lib/core';
import type { Exam, State } from '../../../src/lib/core/types';
import {
  buildPickItems, chipInfo, commonDate, dayFill, daySummary, gauge, isMoveKey, levelOptions, levelStep, memoKey, meterLabel, normalizeMemo,
  progressOf, rovingNext, rovingStart,
} from '../../../src/lib/screens/shared/logic';

function setup(): { st: State; ex: Exam } {
  const st = newState();
  const r = newExam({ name: '중간', start: '2026-04-20', end: '2026-04-22', prepStart: '2026-04-14' });
  if ('error' in r) throw new Error(r.error);
  const ex = r.exam;
  st.exams.push(ex);
  const a = addSub(st, ex, '국어', null);
  if ('error' in a) throw new Error(a.error);
  setPlan(ex, a.sub, { n: 2, m: 1, r: 1 });
  return { st, ex };
}

describe('rovingNext', () => {
  it('아래/위는 끝에서 돌아간다', () => {
    expect(rovingNext(0, 'ArrowDown', 3)).toBe(1);
    expect(rovingNext(2, 'ArrowDown', 3)).toBe(0);
    expect(rovingNext(0, 'ArrowUp', 3)).toBe(2);
    expect(rovingNext(2, 'ArrowRight', 3)).toBe(0);
    expect(rovingNext(0, 'ArrowLeft', 3)).toBe(2);
  });
  it('Home·End 는 처음·끝 활성 항목', () => {
    expect(rovingNext(1, 'Home', 4)).toBe(0);
    expect(rovingNext(1, 'End', 4)).toBe(3);
    expect(rovingNext(1, 'Home', 4, (i) => i === 0)).toBe(1);
    expect(rovingNext(1, 'End', 4, (i) => i === 3)).toBe(2);
  });
  it('비활성 항목을 건너뛴다', () => {
    const off = (i: number) => i === 1;
    expect(rovingNext(0, 'ArrowDown', 3, off)).toBe(2);
    expect(rovingNext(2, 'ArrowUp', 3, off)).toBe(0);
  });
  it('갈 곳이 없거나 처리하지 않는 키면 null', () => {
    expect(rovingNext(0, 'a', 3)).toBeNull();
    expect(rovingNext(0, 'Enter', 3)).toBeNull();
    expect(rovingNext(0, 'ArrowDown', 0)).toBeNull();
    expect(rovingNext(0, 'ArrowDown', 3, () => true)).toBeNull();
    expect(rovingNext(0, 'Home', 3, () => true)).toBeNull();
  });
  it('항목이 하나뿐이면 자기 자신', () => {
    expect(rovingNext(0, 'ArrowDown', 1)).toBe(0);
  });
  it('범위 밖 시작은 방향에 따라 처음·끝부터', () => {
    expect(rovingNext(-1, 'ArrowDown', 3)).toBe(0);
    expect(rovingNext(-1, 'ArrowUp', 3)).toBe(2);
  });
  it('시작 번호는 선호 항목, 비활성이면 첫 활성', () => {
    expect(rovingStart(2, 4)).toBe(2);
    expect(rovingStart(2, 4, (i) => i === 2)).toBe(0);
    expect(rovingStart(-1, 4)).toBe(0);
    expect(rovingStart(0, 2, () => true)).toBe(-1);
  });
});

describe('게이지·진행률', () => {
  it('개수/한도와 초과', () => {
    expect(gauge(2, 3)).toMatchObject({ over: false, text: '2/3' });
    const g = gauge(4, 3);
    expect(g.over).toBe(true);
    expect(g.label).toContain('초과');
    expect(gauge(1, 0).over).toBe(true);
    expect(gauge(0, 0).over).toBe(false);
  });
  it('채움 비율은 legacy dayFill 과 같다', () => {
    expect(dayFill(0, 3)).toBeCloseTo(0.12);
    expect(dayFill(3, 3)).toBeCloseTo(1);
    expect(dayFill(4, 3)).toBe(1);
    expect(dayFill(1, 4)).toBeCloseTo(0.3 + 0.7 * 0.25);
  });
  it('단계 번호와 라벨', () => {
    expect(levelStep('calm')).toBe(1);
    expect(levelStep('packed')).toBe(5);
    expect(levelStep('x')).toBe(0);
    expect(meterLabel('busy')).toBe('바쁨 정도 바쁨, 5단계 중 4단계');
  });
  it('진행률은 범위를 보정한다', () => {
    expect(progressOf(1, 4)).toEqual({ done: 1, total: 4, pct: 25 });
    expect(progressOf(9, 4)).toEqual({ done: 4, total: 4, pct: 100 });
    expect(progressOf(-1, 0)).toEqual({ done: 0, total: 0, pct: 0 });
    expect(progressOf(NaN, NaN)).toEqual({ done: 0, total: 0, pct: 0 });
  });
});

describe('할일 칩', () => {
  it('라벨은 종류·회차·완료를 말한다', () => {
    const { ex } = setup();
    const tasks = ex.tasks;
    const book = tasks.find((t) => t.type === 's' && t.seq === 1)!;
    expect(chipInfo(ex, book, '국어')).toMatchObject({ kind: '교재', text: '국어 1/3', a11y: '국어 교재 1회 · 미완료' });
    const work = tasks.find((t) => t.type === 's' && t.seq === 3)!;
    expect(chipInfo(ex, work, '국어').kind).toBe('문제집');
    const recap = tasks.find((t) => t.type === 'r')!;
    recap.done = true;
    expect(chipInfo(ex, recap, '국어')).toMatchObject({ kind: '리캡', text: '국어 리캡 1/1', a11y: '국어 리캡 1회 · 완료' });
  });
  it('과목 배치가 없으면 종류가 비어 있다', () => {
    const { ex } = setup();
    const t = { ...ex.tasks[0], esId: 'none' };
    expect(chipInfo(ex, t, '?').kind).toBe('');
  });
  it('날짜 옮기기 키', () => {
    expect(isMoveKey({ key: 'F10', shiftKey: true })).toBe(true);
    expect(isMoveKey({ key: 'F10' })).toBe(false);
    expect(isMoveKey({ key: 'ContextMenu' })).toBe(true);
    expect(isMoveKey({ key: 'Enter' })).toBe(false);
  });
});

describe('날짜 선택 항목', () => {
  it('보관함 + 준비 기간 날짜, 현재 날짜 표시', () => {
    const { st, ex } = setup();
    const t = ex.tasks[0];
    moveTask(ex, t.id, '2026-04-15');
    const items = buildPickItems(st, ex, [t.id], undefined);
    expect(items[0].iso).toBeNull();
    expect(items[0].disabled).toBe(false);
    expect(items).toHaveLength(1 + 9);
    expect(items.find((i) => i.current)?.iso).toBe('2026-04-15');
    expect(items.find((i) => i.iso === '2026-04-15')).toMatchObject({ count: 1, incoming: 0 });
    expect(items.find((i) => i.iso === '2026-04-14')).toMatchObject({ count: 0, incoming: 1 });
  });
  it('미배치 할일이면 보관함 항목이 비활성이고 현재로 표시된다', () => {
    const { st, ex } = setup();
    const items = buildPickItems(st, ex, [ex.tasks[0].id], undefined);
    expect(items[0]).toMatchObject({ disabled: true, current: true });
    expect(items[0].reason).toBeTruthy();
  });
  it('일괄 이동은 들어올 개수만큼 넘침을 미리 알린다', () => {
    const { st, ex } = setup();
    setDayLevel(ex, ['2026-04-15'], 'packed');
    const ids = ex.tasks.slice(0, 2).map((t) => t.id);
    const items = buildPickItems(st, ex, ids, undefined);
    const it = items.find((i) => i.iso === '2026-04-15')!;
    expect(it).toMatchObject({ limit: 1, incoming: 2, over: true, fill: 1 });
    expect(it.label).toContain('권장 개수 초과');
  });
  it('공통 날짜 판정', () => {
    const { ex } = setup();
    const [a, b] = ex.tasks;
    moveTask(ex, a.id, '2026-04-15');
    expect(commonDate(ex, [a.id])).toBe('2026-04-15');
    expect(commonDate(ex, [b.id])).toBeNull();
    expect(commonDate(ex, [a.id, b.id])).toBeUndefined();
    expect(commonDate(ex, [])).toBeUndefined();
  });
  it('휴일은 항목에 이름이 붙는다', () => {
    const { st, ex } = setup();
    setHoliday(ex, '2026-04-16', true);
    const it = buildPickItems(st, ex, [ex.tasks[0].id], null).find((i) => i.iso === '2026-04-16')!;
    expect(it.holiday).toBe('휴일');
    expect(it.level).toBe('calm');
  });
});

describe('바쁨 정도 선택지', () => {
  it('현재 단계만 checked', () => {
    const { st, ex } = setup();
    setDayLevel(ex, ['2026-04-15'], 'busy');
    const o = levelOptions(st, ex, '2026-04-15');
    expect(o).toHaveLength(5);
    expect(o.filter((x) => x.checked).map((x) => x.key)).toEqual(['busy']);
    expect(o.find((x) => x.key === 'busy')!.limit).toBe(st.limits.busy);
  });
});

describe('메모 키 처리(한글 조합)', () => {
  it('조합 중에는 Enter·Esc 모두 무시', () => {
    expect(memoKey({ key: 'Enter', isComposing: true })).toBe('ignore');
    expect(memoKey({ key: 'Escape', isComposing: true })).toBe('ignore');
    expect(memoKey({ key: 'Enter', keyCode: 229 })).toBe('ignore');
  });
  it('Enter 는 저장, Shift+Enter 는 줄바꿈', () => {
    expect(memoKey({ key: 'Enter' })).toBe('save');
    expect(memoKey({ key: 'Enter', shiftKey: true })).toBe('default');
    expect(memoKey({ key: 'a' })).toBe('default');
    expect(memoKey({ key: 'Escape' })).toBe('default');
  });
  it('메모는 공백을 정리하고 60자로 자른다', () => {
    expect(normalizeMemo('  학원  ')).toBe('학원');
    expect(normalizeMemo('가'.repeat(80))).toHaveLength(60);
    expect(normalizeMemo(undefined as unknown as string)).toBe('');
  });
});

describe('날짜 카드 요약', () => {
  it('완료·미완료·지난 날', () => {
    const { ex } = setup();
    const ts = ex.tasks.slice(0, 3);
    ts[0].done = true;
    expect(daySummary(ts, '2026-04-15', '2026-04-16')).toEqual({ total: 3, done: 1, unfinished: 2, past: true });
    expect(daySummary(ts, '2026-04-16', '2026-04-16').past).toBe(false);
    expect(daySummary([], '2026-04-15', '2026-04-16')).toEqual({ total: 0, done: 0, unfinished: 0, past: true });
  });
});

import { describe, expect, it } from 'vitest';
import { rangeDays } from '../../../src/lib/core/dates';
import type { Task } from '../../../src/lib/core/types';
import {
  cellLabel, cellNumber, dropCaption, edgeDir, emptyDays, gridMove, groupLoose, inDayOrder, keyMoveDate, koDate, levelChangedDays, mergeSelection,
  mondayOf, parseRecapDays, rangeBetween, resolveClick, resolveDrop, sameTarget, tasksByDateSorted, weekRows, weekendHolidayDays,
} from '../../../src/lib/screens/plan/logic';

// 2026-06-01 은 월요일
const DAYS = rangeDays('2026-06-03', '2026-06-20'); // 수 ~ 토(다다음 주)
const task = (id: string, esId: string, type: 's' | 'r', seq: number, date: string | null, done = false): Task => ({ id, esId, type, seq, date, done });

describe('weekRows', () => {
  it('월요일 시작 주 행으로 나누고 범위 밖은 null', () => {
    const rows = weekRows(DAYS);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual([null, null, '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']);
    expect(rows[1][0]).toBe('2026-06-08');
    expect(rows[2]).toEqual(['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', null]);
    expect(rows.flat().filter(Boolean)).toHaveLength(DAYS.length);
  });
  it('날짜가 없으면 빈 배열, 한 날이면 한 행', () => {
    expect(weekRows([])).toEqual([]);
    expect(weekRows(['2026-06-07'])).toEqual([[null, null, null, null, null, null, '2026-06-07']]);
  });
  it('mondayOf·cellNumber·koDate', () => {
    expect(mondayOf('2026-06-07')).toBe('2026-06-01');
    expect(mondayOf('2026-06-08')).toBe('2026-06-08');
    expect(cellNumber('2026-06-03', '2026-06-03')).toBe('6/3');
    expect(cellNumber('2026-07-01', '2026-06-03')).toBe('7/1');
    expect(cellNumber('2026-06-05', '2026-06-03')).toBe('5');
    expect(koDate('2026-06-03')).toBe('6월 3일');
  });
});

describe('tasksByDateSorted', () => {
  it('날짜별로 묶고 과목 → 종류 → 회차 순으로 정렬', () => {
    const m = tasksByDateSorted([
      task('a', 'b', 's', 2, '2026-06-03'),
      task('b', 'a', 'r', 1, '2026-06-03'),
      task('c', 'a', 's', 3, '2026-06-03'),
      task('d', 'a', 's', 1, null),
    ]);
    expect(Object.keys(m)).toEqual(['2026-06-03']);
    expect(m['2026-06-03'].map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('cellLabel', () => {
  const base = { iso: '2026-06-03', count: 4, done: 2, levelLabel: '보통', over: false, limit: 3, note: true, holiday: '', examDay: 0, today: false };
  it('날짜·할일·바쁨·메모를 한 문장으로', () => {
    expect(cellLabel(base)).toBe('6월 3일 수, 할일 4개 중 2개 완료, 바쁨 보통, 메모 있음');
  });
  it('할일 없음, 메모 없음', () => {
    expect(cellLabel({ ...base, count: 0, done: 0, note: false })).toBe('6월 3일 수, 할일 없음, 바쁨 보통');
  });
  it('오늘·휴일·시험일·초과를 덧붙인다', () => {
    const s = cellLabel({ ...base, today: true, holiday: '현충일', examDay: 2, over: true, limit: 3, note: false });
    expect(s).toBe('6월 3일 수, 오늘, 현충일, 시험 2일차, 할일 4개 중 2개 완료, 바쁨 보통, 권장 3개 초과');
  });
});

describe('범위 선택·클릭 해석', () => {
  it('rangeBetween 은 순서와 무관하고 범위 밖이면 빈 배열', () => {
    expect(rangeBetween(DAYS, '2026-06-05', '2026-06-03')).toEqual(['2026-06-03', '2026-06-04', '2026-06-05']);
    expect(rangeBetween(DAYS, '2026-06-05', '2026-06-05')).toEqual(['2026-06-05']);
    expect(rangeBetween(DAYS, '2026-06-01', '2026-06-05')).toEqual([]);
  });
  it('일반 클릭은 선택을 풀고 연다', () => {
    const r = resolveClick(['2026-06-04'], DAYS, { iso: '2026-06-05', ctrl: false, shift: false, anchor: null });
    expect(r).toEqual({ selected: [], anchor: '2026-06-05', open: true });
  });
  it('Ctrl 클릭은 토글한다', () => {
    const a = resolveClick([], DAYS, { iso: '2026-06-05', ctrl: true, shift: false, anchor: null });
    expect(a).toEqual({ selected: ['2026-06-05'], anchor: '2026-06-05', open: false });
    const b = resolveClick(['2026-06-05', '2026-06-07'], DAYS, { iso: '2026-06-05', ctrl: true, shift: false, anchor: '2026-06-05' });
    expect(b.selected).toEqual(['2026-06-07']);
  });
  it('Shift 클릭은 기준점부터 범위로 바꾼다(기존 선택은 대체)', () => {
    const r = resolveClick(['2026-06-20'], DAYS, { iso: '2026-06-07', ctrl: false, shift: true, anchor: '2026-06-05' });
    expect(r.selected).toEqual(['2026-06-05', '2026-06-06', '2026-06-07']);
    expect(r.anchor).toBe('2026-06-05');
    expect(r.open).toBe(false);
  });
  it('Ctrl+Shift 는 기존 선택에 범위를 더한다', () => {
    const r = resolveClick(['2026-06-20'], DAYS, { iso: '2026-06-07', ctrl: true, shift: true, anchor: '2026-06-06' });
    expect(r.selected).toEqual(['2026-06-06', '2026-06-07', '2026-06-20']);
  });
  it('기준점이 없거나 범위 밖이면 Shift 클릭은 그 칸만 고른다', () => {
    expect(resolveClick([], DAYS, { iso: '2026-06-05', ctrl: false, shift: true, anchor: null }).selected).toEqual(['2026-06-05']);
    expect(resolveClick([], DAYS, { iso: '2026-06-05', ctrl: false, shift: true, anchor: '2026-05-01' }).selected).toEqual(['2026-06-05']);
  });
  it('inDayOrder 는 범위 밖을 버리고 days 순서로', () => {
    expect(inDayOrder(DAYS, ['2026-06-07', '2026-01-01', '2026-06-03'])).toEqual(['2026-06-03', '2026-06-07']);
  });
});

describe('주말·공휴일·빈 날 선택', () => {
  it('토·일과 휴일을 고른다', () => {
    const got = weekendHolidayDays(DAYS, (d) => d === '2026-06-04');
    expect(got).toEqual(['2026-06-04', '2026-06-06', '2026-06-07', '2026-06-13', '2026-06-14', '2026-06-20']);
  });
  it('할일이 없는 날을 고른다', () => {
    const busy = new Set(['2026-06-03', '2026-06-05']);
    const got = emptyDays(DAYS.slice(0, 4), (d) => (busy.has(d) ? 1 : 0));
    expect(got).toEqual(['2026-06-04', '2026-06-06']);
  });
  it('mergeSelection 은 기존 선택에 더하고 days 순서를 지킨다', () => {
    expect(mergeSelection(DAYS, ['2026-06-07'], ['2026-06-03', '2026-06-07'])).toEqual(['2026-06-03', '2026-06-07']);
  });
  it('levelChangedDays 는 실제로 달라지는 날만', () => {
    const settings = { '2026-06-03': { level: 'busy' }, '2026-06-04': {}, '2026-06-05': { level: 'calm' } };
    const t = ['2026-06-03', '2026-06-04', '2026-06-05'];
    expect(levelChangedDays(settings, t, 'busy')).toEqual(['2026-06-04', '2026-06-05']);
    expect(levelChangedDays(settings, t, null)).toEqual(['2026-06-03', '2026-06-05']);
  });
});

describe('gridMove (방향키 이동)', () => {
  it('←→ 는 하루, 끝에서는 null', () => {
    expect(gridMove(DAYS, '2026-06-05', 'ArrowRight')).toBe('2026-06-06');
    expect(gridMove(DAYS, '2026-06-05', 'ArrowLeft')).toBe('2026-06-04');
    expect(gridMove(DAYS, '2026-06-03', 'ArrowLeft')).toBeNull();
    expect(gridMove(DAYS, '2026-06-20', 'ArrowRight')).toBeNull();
  });
  it('↑↓ 는 한 주', () => {
    expect(gridMove(DAYS, '2026-06-05', 'ArrowDown')).toBe('2026-06-12');
    expect(gridMove(DAYS, '2026-06-12', 'ArrowUp')).toBe('2026-06-05');
  });
  it('위 주에 칸이 없으면 첫 날짜로, 맨 윗주면 null', () => {
    expect(gridMove(DAYS, '2026-06-08', 'ArrowUp')).toBe('2026-06-03');
    expect(gridMove(DAYS, '2026-06-04', 'ArrowUp')).toBeNull();
  });
  it('아래 주에 칸이 없으면 마지막 날짜로, 맨 아랫주면 null', () => {
    const d = rangeDays('2026-06-01', '2026-06-10'); // 월~수(다음 주)
    expect(gridMove(d, '2026-06-05', 'ArrowDown')).toBe('2026-06-10'); // 금 → 아래 칸 12일은 없음 → 끝 날짜
    expect(gridMove(d, '2026-06-09', 'ArrowDown')).toBeNull();
  });
  it('Home·End 는 그 주의 처음·끝(범위 안), Ctrl 은 기간의 처음·끝', () => {
    expect(gridMove(DAYS, '2026-06-05', 'Home')).toBe('2026-06-03'); // 첫 주는 수요일부터
    expect(gridMove(DAYS, '2026-06-10', 'Home')).toBe('2026-06-08');
    expect(gridMove(DAYS, '2026-06-10', 'End')).toBe('2026-06-14');
    expect(gridMove(DAYS, '2026-06-17', 'End')).toBe('2026-06-20');
    expect(gridMove(DAYS, '2026-06-10', 'Home', true)).toBe('2026-06-03');
    expect(gridMove(DAYS, '2026-06-10', 'End', true)).toBe('2026-06-20');
  });
  it('범위 밖 시작이나 모르는 키', () => {
    expect(gridMove(DAYS, '2030-01-01', 'ArrowRight')).toBe('2026-06-03');
    expect(gridMove(DAYS, '2026-06-05', 'Enter')).toBeNull();
    expect(gridMove([], '2026-06-05', 'ArrowRight')).toBeNull();
  });
});

describe('keyMoveDate (Alt+방향키)', () => {
  it('전날·다음날·전주·다음주', () => {
    expect(keyMoveDate(DAYS, '2026-06-10', 'ArrowLeft')).toBe('2026-06-09');
    expect(keyMoveDate(DAYS, '2026-06-10', 'ArrowRight')).toBe('2026-06-11');
    expect(keyMoveDate(DAYS, '2026-06-10', 'ArrowUp')).toBe('2026-06-03');
    expect(keyMoveDate(DAYS, '2026-06-10', 'ArrowDown')).toBe('2026-06-17');
  });
  it('범위 밖으로는 옮기지 않는다', () => {
    expect(keyMoveDate(DAYS, '2026-06-03', 'ArrowLeft')).toBeNull();
    expect(keyMoveDate(DAYS, '2026-06-20', 'ArrowRight')).toBeNull();
    expect(keyMoveDate(DAYS, '2026-06-17', 'ArrowDown')).toBeNull();
    expect(keyMoveDate(DAYS, '2026-06-05', 'ArrowUp')).toBeNull();
  });
  it('보관함의 칩은 → ↓ 로 첫 날짜에 들어간다', () => {
    expect(keyMoveDate(DAYS, null, 'ArrowRight')).toBe('2026-06-03');
    expect(keyMoveDate(DAYS, null, 'ArrowDown')).toBe('2026-06-03');
    expect(keyMoveDate(DAYS, null, 'ArrowLeft')).toBeNull();
    expect(keyMoveDate(DAYS, null, 'ArrowUp')).toBeNull();
  });
  it('다른 키·빈 기간은 null', () => {
    expect(keyMoveDate(DAYS, '2026-06-10', 'Enter')).toBeNull();
    expect(keyMoveDate([], '2026-06-10', 'ArrowRight')).toBeNull();
  });
});

describe('resolveDrop (놓을 곳 판정)', () => {
  it('준비 기간 안의 날짜 칸', () => {
    expect(resolveDrop({ date: '2026-06-05', vault: false }, DAYS, '2026-06-03')).toEqual({ kind: 'day', iso: '2026-06-05', same: false });
    expect(resolveDrop({ date: '2026-06-05', vault: false }, DAYS, '2026-06-05')).toEqual({ kind: 'day', iso: '2026-06-05', same: true });
    expect(resolveDrop({ date: '2026-06-05', vault: false }, DAYS, null)).toEqual({ kind: 'day', iso: '2026-06-05', same: false });
  });
  it('기간 밖 날짜·대상 없음은 null', () => {
    expect(resolveDrop({ date: '2026-07-05', vault: false }, DAYS, null)).toBeNull();
    expect(resolveDrop({ date: null, vault: false }, DAYS, null)).toBeNull();
    expect(resolveDrop(null, DAYS, null)).toBeNull();
  });
  it('보관함: 이미 보관함에 있으면 same', () => {
    expect(resolveDrop({ date: null, vault: true }, DAYS, '2026-06-03')).toEqual({ kind: 'vault', same: false });
    expect(resolveDrop({ date: null, vault: true }, DAYS, null)).toEqual({ kind: 'vault', same: true });
  });
  it('sameTarget', () => {
    const a = resolveDrop({ date: '2026-06-05', vault: false }, DAYS, null);
    const b = resolveDrop({ date: '2026-06-05', vault: false }, DAYS, '2026-06-03');
    expect(sameTarget(a, b)).toBe(true);
    expect(sameTarget(a, resolveDrop({ date: '2026-06-06', vault: false }, DAYS, null))).toBe(false);
    expect(sameTarget(a, null)).toBe(false);
    expect(sameTarget(null, null)).toBe(true);
    expect(sameTarget({ kind: 'vault', same: true }, { kind: 'vault', same: false })).toBe(true);
    expect(sameTarget({ kind: 'vault', same: true }, a)).toBe(false);
  });
  it('고스트 설명 띠', () => {
    expect(dropCaption(null)).toContain('원래 자리');
    expect(dropCaption({ kind: 'day', iso: '2026-06-05', same: false })).toBe('6/5(금)로 이동');
    expect(dropCaption({ kind: 'day', iso: '2026-06-05', same: false }, true)).toContain('초과');
    expect(dropCaption({ kind: 'day', iso: '2026-06-05', same: true })).toContain('이미');
    expect(dropCaption({ kind: 'vault', same: false })).toBe('보관함으로');
    expect(dropCaption({ kind: 'vault', same: true })).toContain('이미');
  });
});

describe('edgeDir', () => {
  it('위·아래 48px 안에서 스크롤 방향', () => {
    expect(edgeDir(10, 0, 800)).toBe(-1);
    expect(edgeDir(790, 0, 800)).toBe(1);
    expect(edgeDir(400, 0, 800)).toBe(0);
    expect(edgeDir(47, 0, 800)).toBe(-1);
    expect(edgeDir(48, 0, 800)).toBe(0);
  });
});

describe('groupLoose', () => {
  it('과목 배치 순서대로 묶고 학습 → 리캡, 회차 순', () => {
    const subs = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    const loose = [task('1', 'y', 'r', 1, null), task('2', 'y', 's', 2, null), task('3', 'x', 's', 1, null), task('4', 'y', 's', 1, null)];
    const g = groupLoose(subs, loose);
    expect(g.map((x) => x.esId)).toEqual(['x', 'y']);
    expect(g[1].tasks.map((t) => t.id)).toEqual(['4', '2', '1']);
  });
});

describe('parseRecapDays', () => {
  it('1~30 으로 보정하고 숫자가 아니면 기본값', () => {
    expect(parseRecapDays('7')).toBe(7);
    expect(parseRecapDays('0')).toBe(1);
    expect(parseRecapDays('99')).toBe(30);
    expect(parseRecapDays('3.6')).toBe(4);
    expect(parseRecapDays('')).toBe(7);
    expect(parseRecapDays('abc', 5)).toBe(5);
    expect(parseRecapDays(null, 5)).toBe(5);
    expect(parseRecapDays('abc', 99)).toBe(30);
  });
});

import { describe, expect, it } from 'vitest';
import { newState } from '../../src/lib/core';
import type { State } from '../../src/lib/core/types';
import {
  MERGE_WINDOW_MS, UNDO_LIMIT, UndoStack, applyRemoteDraft, cloneState, countRawExams, createValidator, keepActiveId, nextUpdatedAt,
  pickStartTab, resolveLoad, sameContent,
} from '../../src/lib/app/appCore';
import { richState } from '../sync/helpers';

const st = (n: number): State => ({ ...newState(), updatedAt: n });

describe('nextUpdatedAt', () => {
  it('같은 ms 와 시계 역행에도 단조 증가', () => {
    expect(nextUpdatedAt(100, 200)).toBe(200);
    expect(nextUpdatedAt(100, 100)).toBe(101);
    expect(nextUpdatedAt(100, 50)).toBe(101);
    expect(nextUpdatedAt(NaN, 5)).toBe(5);
    let v = 0;
    for (let i = 0; i < 20; i++) { const n = nextUpdatedAt(v, 1000); expect(n).toBeGreaterThan(v); v = n; }
  });
});

describe('UndoStack', () => {
  it('쌓고 되돌리고 다시 실행한다', () => {
    const s = new UndoStack();
    s.push(st(1), 'a', 10);
    s.push(st(2), 'b', 20);
    expect(s.undoDepth).toBe(2);
    expect(s.undoLabel).toBe('b');
    const r = s.popUndo(st(3), 30);
    expect(r?.label).toBe('b');
    expect(r?.state.updatedAt).toBe(2);
    expect(s.redoDepth).toBe(1);
    const again = s.popRedo(st(2), 40);
    expect(again?.state.updatedAt).toBe(3);
    expect(s.undoDepth).toBe(2);
    expect(s.redoDepth).toBe(0);
  });
  it('비어 있으면 null', () => {
    const s = new UndoStack();
    expect(s.popUndo(st(1), 1)).toBeNull();
    expect(s.popRedo(st(1), 1)).toBeNull();
  });
  it('새 변경은 다시 실행 기록을 비운다', () => {
    const s = new UndoStack();
    s.push(st(1), 'a', 1);
    s.popUndo(st(2), 2);
    expect(s.redoDepth).toBe(1);
    s.push(st(2), 'c', 3);
    expect(s.redoDepth).toBe(0);
  });
  it(`최대 ${UNDO_LIMIT}단계, 가장 오래된 것부터 버린다`, () => {
    const s = new UndoStack();
    for (let i = 0; i < UNDO_LIMIT + 10; i++) s.push(st(i), 'x', i * 5000);
    expect(s.undoDepth).toBe(UNDO_LIMIT);
    let last: State | undefined;
    for (let i = 0; i < UNDO_LIMIT; i++) last = s.popUndo(st(0), 0)?.state;
    expect(last?.updatedAt).toBe(10);
  });
  it('merge: 같은 label 이 창 안에 이어지면 가장 오래된 before 를 유지한다', () => {
    const s = new UndoStack();
    expect(s.push(st(1), '메모', 1000, { merge: true })).toBe(true);
    expect(s.push(st(2), '메모', 1000 + MERGE_WINDOW_MS - 1, { merge: true })).toBe(false);
    expect(s.undoDepth).toBe(1);
    expect(s.popUndo(st(9), 0)?.state.updatedAt).toBe(1);
  });
  it('merge: label 이 다르거나 창을 넘으면 합치지 않는다', () => {
    const s = new UndoStack();
    s.push(st(1), 'a', 0, { merge: true });
    expect(s.push(st(2), 'b', 10, { merge: true })).toBe(true);
    expect(s.push(st(3), 'b', 10 + MERGE_WINDOW_MS + 1, { merge: true })).toBe(true);
    expect(s.push(st(4), 'b', 10 + MERGE_WINDOW_MS + 2)).toBe(true); // merge 옵션 없음
    expect(s.undoDepth).toBe(4);
  });
  it('topId 는 단계마다 바뀌고 되돌렸다 다시 실행해도 같은 단계를 가리킨다', () => {
    const s = new UndoStack();
    expect(s.topId).toBe(0);
    s.push(st(1), 'a', 1);
    const a = s.topId;
    s.push(st(2), 'b', 2);
    expect(s.topId).not.toBe(a);
    s.popUndo(st(3), 3);
    expect(s.topId).toBe(a);
  });
});

describe('불러오기 해석', () => {
  const none = () => 0;
  it('ok: 저장된 상태와 버려진 수', () => {
    const v = richState();
    const r = resolveLoad({ status: 'ok', value: v, source: 'indexedDB' }, () => 2);
    expect(r.state).toBe(v);
    expect(r.loaded).toBe(true);
    expect(r.problem).toBeNull();
    expect(r.dropped).toBe(2);
  });
  it('empty: 새 상태, 문제 없음', () => {
    const r = resolveLoad({ status: 'empty' }, none);
    expect(r.state.exams).toEqual([]);
    expect(r.problem).toBeNull();
    expect(r.loaded).toBe(false);
  });
  it('failed: 새 상태와 문제(종류·메시지·사유)', () => {
    const r = resolveLoad({ status: 'failed', reason: 'TimeoutError' }, none, '불러오지 못했습니다');
    expect(r.state.exams).toEqual([]);
    expect(r.problem).toEqual({ kind: 'failed', message: '불러오지 못했습니다', reason: 'TimeoutError', backupKey: null });
  });
  it('corrupt: backupKey 를 싣는다', () => {
    const r = resolveLoad({ status: 'corrupt', reason: 'x', backupKey: 'examPlanner.corrupt.1' }, none);
    expect(r.problem?.kind).toBe('corrupt');
    expect(r.problem?.backupKey).toBe('examPlanner.corrupt.1');
    expect(r.problem?.message).toBeTruthy();
  });
});

describe('dropped 계산', () => {
  it('입력 exams 수 - 결과 exams 수', () => {
    const v = createValidator();
    const raw = JSON.parse(JSON.stringify(richState())) as State;
    expect(raw.exams.length).toBe(2);
    raw.exams[1].name = '';
    const clean = v.validate(raw);
    expect(clean?.exams.length).toBe(1);
    expect(v.droppedOf(clean!)).toBe(1);
  });
  it('버려진 것이 없으면 0, 검증 실패면 null', () => {
    const v = createValidator();
    const ok = v.validate(JSON.parse(JSON.stringify(richState())));
    expect(v.droppedOf(ok!)).toBe(0);
    expect(v.validate({ nope: 1 })).toBeNull();
    expect(countRawExams({ exams: [1, 2, 3] })).toBe(3);
    expect(countRawExams(null)).toBe(0);
  });
});

describe('그 밖의 순수 함수', () => {
  it('pickStartTab: 시험 없음 exam, 저장값 우선, 기본 board', () => {
    expect(pickStartTab('print', 0)).toBe('exam');
    expect(pickStartTab('print', 2)).toBe('print');
    expect(pickStartTab(null, 2)).toBe('board');
  });
  it('applyRemoteDraft: 복사해서 고치고 updatedAt 을 올리지 않는다', () => {
    const cur = richState();
    const before = JSON.stringify(cur);
    const next = applyRemoteDraft(cur, (d) => { d.recapDays = 9; });
    expect(next.recapDays).toBe(9);
    expect(next.updatedAt).toBe(cur.updatedAt);
    expect(JSON.stringify(cur)).toBe(before);
  });
  it('sameContent 는 updatedAt 을 무시한다', () => {
    const a = richState();
    const b = cloneState(a);
    b.updatedAt += 5;
    expect(sameContent(a, b)).toBe(true);
    b.recapDays += 1;
    expect(sameContent(a, b)).toBe(false);
  });
  it('keepActiveId: 현재 활성 시험을 유지하고 없으면 첫 시험', () => {
    const s = richState();
    const [a, b] = s.exams;
    expect(keepActiveId({ ...s, activeId: a.id }, b.id).activeId).toBe(b.id);
    expect(keepActiveId({ ...s, activeId: a.id }, 'gone').activeId).toBe(a.id);
    expect(keepActiveId({ ...s, activeId: 'gone' }, null).activeId).toBe(a.id);
    expect(keepActiveId({ ...s, exams: [], activeId: null }, 'x').activeId).toBeNull();
  });
});

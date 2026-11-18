import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../../src/lib/core/constants';
import { newExam, newState, previewExamFields, addSubs, setPlan, updateExamFields } from '../../../src/lib/core/planner';
import type { Exam, State } from '../../../src/lib/core/types';
import {
  applyPrepWeeks, applyStartChange, colorName, datesChanged, draftOf, edgeDir, emptyCreateForm, failMsg, fieldsChanged, fieldsOf, impactMessage,
  keyToDate, moveTarget, needsConfirm, nextPlan, planEqual, quickCandidates, rowAt, rowKeyOf, UNDATED, withRo, type RowRect,
} from '../../../src/lib/screens/exam/logic';
import { COLOR_NAMES, COMMON_SUBJECTS } from '../../../src/lib/screens/exam/texts';

function sample(): { state: State; exam: Exam } {
  const state = newState();
  const r = newExam({ name: '기말고사', start: '2026-12-10', end: '2026-12-12', prepStart: '2026-12-01' });
  if ('error' in r) throw new Error(r.error);
  state.exams.push(r.exam);
  state.activeId = r.exam.id;
  return { state, exam: r.exam };
}

describe('시험 만들기 폼', () => {
  it('시작일을 바꾸면 준비 시작일은 28일 전, 종료일이 비었으면 3일 뒤로 보정한다', () => {
    const f = applyStartChange(emptyCreateForm(), '2026-12-10');
    expect(f.prepStart).toBe('2026-11-12');
    expect(f.end).toBe('2026-12-13');
    expect(f.prepTouched).toBe(false);
  });
  it('준비 시작일을 직접 건드렸으면 시작일을 바꿔도 그대로 둔다', () => {
    const f = applyStartChange({ ...emptyCreateForm(), prepStart: '2026-11-20', prepTouched: true, end: '2026-12-20' }, '2026-12-10');
    expect(f.prepStart).toBe('2026-11-20');
    expect(f.end).toBe('2026-12-20');
  });
  it('종료일이 시작일보다 앞이면 보정한다', () => {
    expect(applyStartChange({ ...emptyCreateForm(), end: '2026-12-01' }, '2026-12-10').end).toBe('2026-12-13');
  });
  it('유효하지 않은 시작일은 다른 값을 건드리지 않는다', () => {
    const f = applyStartChange({ ...emptyCreateForm(), end: '2026-12-20' }, '');
    expect(f.start).toBe('');
    expect(f.prepStart).toBe('');
    expect(f.end).toBe('2026-12-20');
  });
  it('준비 시작 빠른 단추: n 주 전, 시작일이 없으면 null', () => {
    const f = { ...emptyCreateForm(), start: '2026-12-10' };
    expect(applyPrepWeeks(f, 2)).toMatchObject({ prepStart: '2026-11-26', prepTouched: true });
    expect(applyPrepWeeks(f, 4)?.prepStart).toBe('2026-11-12');
    expect(applyPrepWeeks(emptyCreateForm(), 3)).toBeNull();
  });
});

describe('시험 정보 편집: 확인 필요 판정', () => {
  it('아무것도 바뀌지 않으면 변경 없음(공백 정리 포함)', () => {
    const { exam } = sample();
    expect(fieldsChanged(exam, fieldsOf(draftOf(exam)))).toBe(false);
    expect(fieldsChanged(exam, { ...fieldsOf(draftOf(exam)), name: '  기말고사  ' })).toBe(false);
    expect(fieldsChanged(exam, { ...fieldsOf(draftOf(exam)), name: '중간고사' })).toBe(true);
  });
  it('날짜가 바뀌었는지는 이름과 따로 본다', () => {
    const { exam } = sample();
    const f = fieldsOf(draftOf(exam));
    expect(datesChanged(exam, { ...f, name: '다른 이름' })).toBe(false);
    expect(datesChanged(exam, { ...f, end: '2026-12-13' })).toBe(true);
  });
  it('영향이 없는 변경은 확인 없이, 있으면 확인이 필요하다', () => {
    const { state, exam } = sample();
    const none = previewExamFields(state, exam, { name: '새 이름', start: exam.start, end: exam.end, prepStart: exam.prepStart });
    expect(needsConfirm(none)).toBe(false);
    expect(impactMessage(none)).toBe('');

    const res = addSubs(state, exam, '국어, 수학', exam.start);
    expect('added' in res && res.added).toBe(2);
    const es = exam.subs[0];
    setPlan(exam, es, { n: 1, m: 1, r: 0 });
    exam.tasks.filter((t) => t.esId === es.id).forEach((t, i) => { t.date = i === 0 ? '2026-12-01' : '2026-12-05'; });
    exam.days['2026-12-01'] = { note: '학원' };
    exam.days['2026-12-02'] = { level: 'busy' };

    // 준비 시작일을 12/04 로 늦추면 12/01 의 할일 1개가 미배치, 12/01·12/02 설정 2개(메모 1개)가 삭제
    const p = previewExamFields(state, exam, { name: exam.name, start: exam.start, end: exam.end, prepStart: '2026-12-04' });
    expect(p.ok).toBe(true);
    expect(p.unplacedTasks).toBe(1);
    expect(p.removedDays).toBe(2);
    expect(p.removedDayNotes).toBe(1);
    expect(needsConfirm(p)).toBe(true);
    expect(impactMessage(p)).toBe('할일 1개가 미배치로 바뀌고 날짜 설정 2개(메모 1개)가 삭제됩니다.');
    // 미리 계산은 상태를 바꾸지 않는다
    expect(exam.prepStart).toBe('2026-12-01');
    expect(exam.days['2026-12-01']?.note).toBe('학원');
  });
  it('과목 시험 날짜만 바뀌는 경우의 문구', () => {
    const { state, exam } = sample();
    addSubs(state, exam, '영어', '2026-12-12');
    const p = previewExamFields(state, exam, { name: exam.name, start: exam.start, end: '2026-12-11', prepStart: exam.prepStart });
    expect(p.changedSubDates).toBe(1);
    expect(needsConfirm(p)).toBe(true);
    expect(impactMessage(p)).toBe('과목 시험 날짜 1개가 날짜 미정으로 바뀝니다.');
  });
  it('할일과 과목 날짜가 함께 바뀌면 한 문장으로 잇는다', () => {
    expect(impactMessage({ ok: true, unplacedTasks: 3, removedDays: 0, removedDayNotes: 0, changedSubDates: 2 })).toBe(
      '할일 3개가 미배치로 바뀝니다. 과목 시험 날짜 2개는 날짜 미정으로 바뀝니다.',
    );
  });
  it('오류는 확인 대상이 아니다(오류 문장으로 따로 보인다)', () => {
    const { state, exam } = sample();
    const p = previewExamFields(state, exam, { name: exam.name, start: '', end: exam.end, prepStart: exam.prepStart });
    expect(p.ok).toBe(false);
    expect(needsConfirm(p)).toBe(false);
  });
  it('적용(updateExamFields)의 결과가 미리 계산과 같다', () => {
    const { state, exam } = sample();
    const f = { name: exam.name, start: exam.start, end: exam.end, prepStart: '2026-12-04' };
    const p = previewExamFields(state, exam, f);
    const r = updateExamFields(exam, f);
    expect('unplaced' in r && r.unplaced).toBe(p.unplacedTasks);
  });
});

describe('문장 도우미', () => {
  it('failMsg: 이유 끝의 마침표를 지우고 콜론으로 잇는다', () => {
    expect(failMsg('시험을 만들지 못했습니다', '시험 이름을 입력해 주세요.')).toBe('시험을 만들지 못했습니다: 시험 이름을 입력해 주세요');
  });
  it('withRo: 받침에 따라 로/으로', () => {
    expect(withRo('2일차')).toBe('2일차로');
    expect(withRo('날짜 미정')).toBe('날짜 미정으로');
    expect(withRo('3일차 12/4(수)')).toBe('3일차 12/4(수)로');
    expect(withRo('서울')).toBe('서울로');
  });
});

describe('날짜 행 계산', () => {
  const days = ['2026-12-10', '2026-12-11', '2026-12-12'];
  it('행 키와 날짜 변환', () => {
    expect(rowKeyOf('2026-12-11', days)).toBe('2026-12-11');
    expect(rowKeyOf(null, days)).toBe(UNDATED);
    expect(rowKeyOf('2027-01-01', days)).toBe(UNDATED);
    expect(keyToDate(UNDATED)).toBeNull();
    expect(keyToDate('2026-12-11')).toBe('2026-12-11');
  });
  it('Alt+↑/↓ 이동 대상: 앞뒤 날짜, 끝에서는 없음, 마지막 날 다음은 날짜 미정', () => {
    expect(moveTarget(days, '2026-12-11', 1)).toEqual({ to: '2026-12-12' });
    expect(moveTarget(days, '2026-12-11', -1)).toEqual({ to: '2026-12-10' });
    expect(moveTarget(days, '2026-12-10', -1)).toBeNull();
    expect(moveTarget(days, '2026-12-12', 1)).toEqual({ to: null });
    expect(moveTarget(days, null, -1)).toEqual({ to: '2026-12-12' });
    expect(moveTarget(days, null, 1)).toBeNull();
    expect(moveTarget(days, '1999-01-01', -1)).toEqual({ to: '2026-12-12' });
    expect(moveTarget([], null, -1)).toBeNull();
  });
  const rows: RowRect[] = [
    { key: 'a', left: 0, top: 0, right: 100, bottom: 50 },
    { key: 'b', left: 0, top: 58, right: 100, bottom: 108 },
    { key: UNDATED, left: 0, top: 116, right: 100, bottom: 166 },
  ];
  it('드롭 대상 행: 안에 있으면 그 행, 틈에서는 직전 행 유지, 밖이면 없음', () => {
    expect(rowAt(rows, 50, 20)).toBe('a');
    expect(rowAt(rows, 50, 60)).toBe('b');
    expect(rowAt(rows, 50, 120)).toBe(UNDATED);
    expect(rowAt(rows, 50, 54, 'a')).toBe('a');
    expect(rowAt(rows, 50, 54, 'b')).toBe('b');
    expect(rowAt(rows, 50, 54)).toBeNull();
    expect(rowAt(rows, 150, 20)).toBeNull();
    expect(rowAt(rows, 50, -10, 'a')).toBeNull();
    expect(rowAt(rows, 50, 200, UNDATED)).toBeNull();
    expect(rowAt([], 1, 1)).toBeNull();
  });
  it('가장자리 자동 스크롤 방향', () => {
    expect(edgeDir(10, 0, 800)).toBe(-1);
    expect(edgeDir(400, 0, 800)).toBe(0);
    expect(edgeDir(790, 0, 800)).toBe(1);
  });
});

describe('빠른 추가 후보', () => {
  it('보관함 → 공통 과목 순, 이미 있는 과목·중복 제외, 최대 14개', () => {
    const out = quickCandidates(['논술', '국어', '독서', '작문'], ['국어'], COMMON_SUBJECTS);
    expect(out[0]).toBe('논술');
    expect(out).not.toContain('국어');
    expect(out.length).toBe(14);
    expect(new Set(out).size).toBe(out.length);
  });
  it('대소문자·공백 차이를 같은 이름으로 본다', () => {
    expect(quickCandidates(['English'], ['english'], [])).toEqual([]);
    expect(quickCandidates([], [], ['a', ' A ', 'b'])).toEqual(['a', 'b']);
  });
  it('후보가 모자라면 있는 만큼만', () => {
    expect(quickCandidates([], COMMON_SUBJECTS, COMMON_SUBJECTS)).toEqual([]);
  });
});

describe('과목 정보', () => {
  it('분량 초안은 0~30 정수로 정리한다', () => {
    expect(nextPlan({ n: 31, m: -2, r: '' })).toEqual({ n: 30, m: 0, r: 0 });
    expect(nextPlan({ n: null, m: 2.6, r: 'x' })).toEqual({ n: 0, m: 3, r: 0 });
    expect(planEqual({ n: 1, m: 2, r: 3 }, { n: 1, m: 2, r: 3 })).toBe(true);
    expect(planEqual({ n: 1, m: 2, r: 3 }, { n: 1, m: 2, r: 4 })).toBe(false);
  });
  it('색 이름: 팔레트 8색 모두 이름이 있고 16진 값이 아니다', () => {
    expect(PALETTE.length).toBe(8);
    for (const c of PALETTE) {
      expect(COLOR_NAMES[c]).toBeTruthy();
      expect(colorName(c)).not.toMatch(/#/);
      expect(colorName(c.toLowerCase())).toBe(colorName(c));
    }
    expect(new Set(PALETTE.map(colorName)).size).toBe(8);
    expect(colorName('#123456')).toBe('사용자 색');
  });
});

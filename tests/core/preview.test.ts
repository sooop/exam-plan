/* previewExamFields 시험. 미리보기는 state 를 바꾸지 않아야 하고, 실제 적용 결과와 숫자가 같아야 한다. */
import { describe, expect, it } from 'vitest';
import * as core from '../../src/lib/core/index';
import type { Exam, ExamFields, State } from '../../src/lib/core/types';
import { buildRich } from './fixtures';
import { runBoth, type Core } from './legacy-loader';

/* 적용 전 상태에서 기대 숫자를 따로 센다. 미리보기 구현과 독립된 계산이다. */
function expectedImpact(exam: Exam, f: ExamFields) {
  const prep = f.prepStart || core.addDays(f.start, -28);
  const outOfRange = (d: string) => d < prep || d > f.end;
  const unplacedTasks = exam.tasks.filter((t) => t.date && outOfRange(t.date)).length;
  const removedKeys = Object.keys(exam.days).filter(outOfRange);
  const removedDayNotes = removedKeys.filter((k) => exam.days[k].note || typeof exam.days[k].holiday === 'boolean').length;
  const changedSubDates = exam.subs.filter((s) => s.examDate && (s.examDate < f.start || s.examDate > f.end)).length;
  return { unplacedTasks, removedDays: removedKeys.length, removedDayNotes, changedSubDates };
}

/* 실제 적용(updateExamFields)을 깊은 복사본에 해서 같은 항목을 센다. */
function appliedImpact(state: State, examIndex: number, f: ExamFields) {
  const copy = structuredClone(state);
  const exam = copy.exams[examIndex];
  const before = structuredClone(exam);
  const res = core.updateExamFields(exam, f);
  if ('error' in res) throw new Error(res.error);
  const removedKeys = Object.keys(before.days).filter((k) => !(k in exam.days));
  return {
    unplacedTasks: res.unplaced,
    removedDays: removedKeys.length,
    removedDayNotes: removedKeys.filter((k) => before.days[k].note || typeof before.days[k].holiday === 'boolean').length,
    changedSubDates: before.subs.filter((s, i) => s.examDate && exam.subs[i].examDate === null).length,
  };
}

const cases: { title: string; examIndex: number; fields: ExamFields }[] = [
  { title: '준비 시작일과 종료일을 줄인다', examIndex: 0, fields: { name: '중간', start: '2026-04-20', end: '2026-04-21', prepStart: '2026-04-05' } },
  { title: '시험 시작일을 뒤로 밀고 준비 기간을 좁힌다', examIndex: 0, fields: { name: '중간', start: '2026-04-22', end: '2026-04-24', prepStart: '2026-04-06' } },
  { title: '종료일을 앞당겨 메모와 휴일이 있는 날을 지운다', examIndex: 0, fields: { name: '중간', start: '2026-04-05', end: '2026-04-07', prepStart: '2026-04-05' } },
  { title: '범위를 넓힌다 (아무것도 지우지 않음)', examIndex: 0, fields: { name: '중간', start: '2026-04-20', end: '2026-04-30', prepStart: '2026-03-25' } },
  { title: '기말 준비 시작일을 앞당긴다', examIndex: 1, fields: { name: '기말', start: '2026-06-22', end: '2026-06-26', prepStart: '2026-06-01' } },
  { title: '기말 날짜를 통째로 옮긴다', examIndex: 1, fields: { name: '기말', start: '2026-07-01', end: '2026-07-05', prepStart: '' } },
];

describe('previewExamFields 는 state 를 바꾸지 않는다', () => {
  it.each(cases)('$title', ({ examIndex, fields }) => {
    const state = buildRich(core as unknown as Core);
    const snapshot = structuredClone(state);
    core.previewExamFields(state, state.exams[examIndex], fields);
    expect(state).toStrictEqual(snapshot);
  });

  it('오류 입력이면 ok 가 false 이고 state 도 그대로다', () => {
    const state = buildRich(core as unknown as Core);
    const snapshot = structuredClone(state);
    const p = core.previewExamFields(state, state.exams[0], { name: '', start: '2026-04-20', end: '2026-04-24' });
    expect(p).toStrictEqual({ ok: false, error: '시험 이름을 입력해 주세요.', unplacedTasks: 0, removedDays: 0, removedDayNotes: 0, changedSubDates: 0 });
    expect(state).toStrictEqual(snapshot);
  });
});

describe('previewExamFields 숫자는 실제 적용 결과와 같다', () => {
  it.each(cases)('$title', ({ examIndex, fields }) => {
    const state = buildRich(core as unknown as Core);
    const p = core.previewExamFields(state, state.exams[examIndex], fields);
    const applied = appliedImpact(state, examIndex, fields);
    expect(p.ok).toBe(true);
    expect(p).toMatchObject(applied);
    expect(p).toMatchObject(expectedImpact(state.exams[examIndex], fields));
  });

  it('줄이는 경우에는 실제로 0 보다 큰 영향이 잡힌다', () => {
    const state = buildRich(core as unknown as Core);
    const shrink = cases.find((c) => c.title.startsWith('종료일을 앞당겨'))!;
    const p = core.previewExamFields(state, state.exams[0], shrink.fields);
    expect(p.unplacedTasks).toBeGreaterThan(0);
    expect(p.removedDays).toBe(2);
    expect(p.removedDayNotes).toBe(2);
    expect(p.changedSubDates).toBeGreaterThan(0);
  });

  it('범위를 넓히면 모든 영향이 0 이다', () => {
    const state = buildRich(core as unknown as Core);
    const widen = cases.find((c) => c.title.startsWith('범위를 넓힌다'))!;
    const p = core.previewExamFields(state, state.exams[0], widen.fields);
    expect(p).toStrictEqual({ ok: true, unplacedTasks: 0, removedDays: 0, removedDayNotes: 0, changedSubDates: 0 });
  });

  it('원본 updateExamFields 적용 결과와도 숫자가 같다', async () => {
    const { legacy, core: ts } = await runBoth((api) => {
      const st = buildRich(api);
      const r = cases.map((c) => {
        const copy = structuredClone(st);
        const exam = copy.exams[c.examIndex];
        const before = structuredClone(exam);
        const res = api.updateExamFields(exam, c.fields);
        if ('error' in res) throw new Error(res.error);
        const removedKeys = Object.keys(before.days).filter((k) => !(k in exam.days));
        return {
          unplacedTasks: res.unplaced,
          removedDays: removedKeys.length,
          removedDayNotes: removedKeys.filter((k) => before.days[k].note || typeof before.days[k].holiday === 'boolean').length,
          changedSubDates: before.subs.filter((s, i) => s.examDate && exam.subs[i].examDate === null).length,
        };
      });
      return r;
    });
    expect(ts).toStrictEqual(legacy);
    cases.forEach((c, i) => {
      const st = buildRich(core as unknown as Core);
      const p = core.previewExamFields(st, st.exams[c.examIndex], c.fields);
      expect(p).toMatchObject(legacy[i]);
    });
  });
});

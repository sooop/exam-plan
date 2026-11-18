/* 원본과 새 모듈 대조 시험과 미리보기 시험이 함께 쓰는 입력 조립 함수. */
import type { Exam, State } from '../../src/lib/core/types';
import type { Core } from './legacy-loader';

function mustExam(r: { exam: Exam } | { error: string }): Exam {
  if ('error' in r) throw new Error(r.error);
  return r.exam;
}

/* 과목 3개 이상, 시험 2개, 여러 날짜 배치가 있는 풍부한 상태. 두 구현 모두 이 함수로 입력을 만든다. */
export function buildRich(api: Core): State {
  const st = api.newState();
  const e1 = mustExam(api.newExam({ name: '  2026 1학기   중간고사 ', start: '2026-04-20', end: '2026-04-24', prepStart: '2026-04-01' }));
  const e2 = mustExam(api.newExam({ name: '기말고사', start: '2026-06-22', end: '2026-06-26', prepStart: '' }));
  st.exams.push(e1, e2);
  st.activeId = e1.id;
  api.addSubs(st, e1, '국어, 수학/영어\n과학，물리、화학', '2026-04-22');
  api.addSubs(st, e2, '국어, 수학, 영어', null);
  api.addSub(st, e2, '역사', '2026-06-25');
  api.addSub(st, e1, '역사', '2026-05-01');
  api.setPlan(e1, e1.subs[0], { n: 3, m: 2, r: 2 });
  api.setPlan(e1, e1.subs[1], { n: 1, m: 1, r: 1 });
  api.setPlan(e2, e2.subs[2], { n: 2, m: 3, r: 0 });
  const t = e1.tasks;
  api.moveTask(e1, t[0].id, '2026-04-02');
  api.moveTask(e1, t[1].id, '2026-04-05');
  api.moveTask(e1, t[2].id, '2026-04-02');
  api.moveTask(e1, t[3].id, '2026-03-31');
  api.moveTask(e1, t[4].id, '2026-04-18');
  api.moveTask(e1, t[5].id, '2026-04-06');
  api.toggleDone(e1, t[0].id);
  api.toggleDone(e1, t[1].id);
  api.toggleDone(e1, t[1].id);
  api.toggleDone(e1, t[5].id);
  api.setDayLevel(e1, ['2026-04-06', '2026-04-07'], 'busy');
  api.setDayLevel(e1, ['2026-04-08'], 'packed');
  api.setDayNote(e1, '2026-04-08', '  모의고사   ');
  api.setHoliday(e1, '2026-04-04', true);
  api.setHoliday(e2, '2026-06-03', false);
  api.setHoliday(e2, '2026-06-06', true);
  api.setDayLevel(e2, ['2026-06-10'], 'easy');
  e1.week = api.cleanWeek({ 1: 'busy', 6: 'normal', 0: 'calm' });
  st.limits.packed = 2;
  st.recapDays = 5;
  return st;
}


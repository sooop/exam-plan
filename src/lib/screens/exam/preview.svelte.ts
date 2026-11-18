// 시험 정보 변경의 영향 미리보기. 화면은 $state 프록시(app.state 안의 시험)를 들고 있는데,
// core 의 previewExamFields 는 structuredClone 으로 복사본을 만들어 프록시를 복제하지 못한다(DataCloneError).
// 그래서 화면에서는 이 함수를 거쳐 일반 객체로 바꿔 넘긴다. 프록시를 core 의 복사 함수에 직접 넘기지 않는다.
import { previewExamFields, type ExamFieldsPreview } from '../../core/planner';
import type { Exam, ExamFields, State } from '../../core/types';

export function previewEdit(state: State, ex: Exam, fields: ExamFields): ExamFieldsPreview {
  return previewExamFields(state, $state.snapshot(ex) as Exam, fields);
}

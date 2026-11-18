// 공용 컴포넌트가 쓰는 상태 변경 도우미. 화면(Today·Plan)도 같은 함수를 쓰면 되돌리기 이름·알림이 같아진다.
// 모든 변경은 app.mutate 한 번이다(app.state 를 직접 고치지 않는다).
import { app } from '../../app/app.svelte';
import { S, fmtMD } from '../../app/strings';
import { dayInfo, getExam, moveTask, setDayLevel, setDayNote, setHoliday, toggleDone } from '../../core/planner';
import type { LevelKey } from '../../core/types';
import { toast } from '../../ui/toast.svelte';
import { normalizeMemo } from './logic';
import { T } from './texts';

/** 완료 표시를 뒤집는다 */
export function toggleTaskDone(examId: string, taskId: string): void {
  app.mutate(T.mutDone, (s) => {
    const ex = getExam(s, examId);
    if (ex) toggleDone(ex, taskId);
  });
}

/** 할일을 날짜로(iso) 또는 보관함으로(null) 옮긴다. 하나면 1단계 되돌리기, 여러 개면 큰 변경으로 '되돌리기' 토스트. 권장 개수를 넘으면 알린다. */
export function moveTasksTo(examId: string, taskIds: readonly string[], iso: string | null): number {
  if (!taskIds.length) return 0;
  const many = taskIds.length > 1;
  const moved = app.mutate(T.mutMove, (s) => {
    const ex = getExam(s, examId);
    if (!ex) return 0;
    let n = 0;
    for (const id of taskIds) if (moveTask(ex, id, iso)) n += 1;
    return n;
  }, many ? { big: true } : {});
  if (many && moved > 0) app.toastUndo(iso ? T.movedMany(moved) : T.movedToVault(moved));
  if (iso && moved > 0) {
    const ex = getExam(app.state, examId);
    if (ex) {
      const info = dayInfo(app.state, ex, iso);
      if (info.over) toast.info(S.overLimit(fmtMD(iso), info.limit));
    }
  }
  return moved;
}

/** 날짜의 바쁨 정도를 바꾼다. level 이 null 이면 기본값으로 되돌린다 */
export function changeDayLevel(examId: string, iso: string, level: LevelKey | null): void {
  app.mutate(T.mutLevel, (s) => {
    const ex = getExam(s, examId);
    if (ex) setDayLevel(ex, [iso], level);
  });
}

/** 날짜를 휴일로 표시(true)·해제(false)·기본값(null) */
export function changeHoliday(examId: string, iso: string, value: boolean | null): void {
  app.mutate(T.mutLevel, (s) => {
    const ex = getExam(s, examId);
    if (ex) setHoliday(ex, iso, value);
  });
}

/** 날짜 메모를 저장한다(공백 정리·60자). 바뀐 것이 없으면 아무것도 하지 않는다. 저장했으면 true */
export function saveDayNote(examId: string, iso: string, text: string): boolean {
  const ex = getExam(app.state, examId);
  if (!ex) return false;
  const next = normalizeMemo(text);
  if (next === (ex.days[iso]?.note ?? '')) return false;
  app.mutate(T.mutNote, (s) => {
    const e = getExam(s, examId);
    if (e) setDayNote(e, iso, next);
  });
  return true;
}

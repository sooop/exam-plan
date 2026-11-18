// 오늘 탭의 순수 로직(DOM·Svelte 에 의존하지 않는다). tests/screens/today/logic.test.ts 가 시험하고,
// 원본(legacy todayTab)의 overdue·tasksByDate·prepDays 결과와 같은 입력에서 같은 분류가 나오는지 대조한다.
import { diffDays } from '../../core/dates';
import { overdue as overdueOf, prepDays, tasksByDate } from '../../core/planner';
import type { Exam, Task } from '../../core/types';
import { S, fmtMD } from '../../app/strings';
import { TT } from './texts';

/** 다음 할일 구역에 보이는 날짜 수(할일이 있는 날짜를 앞에서부터 센다, 원본과 같다) */
export const UPCOMING_LIMIT = 3;

/** 시험 일정상의 위치: 시험 전(시작 전) / 시험 기간 / 시험 후(종료 뒤). 머리말(D-day)을 고른다 */
export type Phase = 'before' | 'during' | 'after';

/** 본문 상태: 준비 기간 전 / 시험 후 / 오늘 할일 있음 / 오늘 할일 없음 / 할일 자체가 없음 */
export type BodyState = 'beforePrep' | 'afterExam' | 'today' | 'noneToday' | 'noTasks';

export interface UpcomingGroup {
  iso: string;
  tasks: Task[];
}

export interface TodayView {
  phase: Phase;
  /** 머리말: 시험 시작까지 N일 / 시험 기간 / 시험이 끝났습니다 */
  ddayText: string;
  body: BodyState;
  /** 지연 할일: 오늘보다 앞 날짜이고 끝내지 않은 것(날짜순, 원본 overdue) */
  overdue: Task[];
  /** 이월 단추를 보인다: 오늘이 시험 종료일 이전·같은 날일 때만(원본과 같다) */
  canCarry: boolean;
  /** 오늘 할일(완료한 것도 남긴다. 원본과 같이 과목·회차 순) */
  todays: Task[];
  /** 다음 할일: 오늘 뒤의 준비 기간 날짜 중 할일이 있는 날짜 최대 UPCOMING_LIMIT 개 */
  upcoming: UpcomingGroup[];
}

export function phaseOf(ex: Pick<Exam, 'start' | 'end'>, today: string): Phase {
  if (today > ex.end) return 'after';
  if (today >= ex.start) return 'during';
  return 'before';
}

/** 머리말 문구(원본 head 와 같은 규칙) */
export function ddayText(ex: Pick<Exam, 'start' | 'end'>, today: string): string {
  const p = phaseOf(ex, today);
  if (p === 'after') return S.afterExam;
  if (p === 'during') return S.duringExam;
  return S.remainDays(diffDays(today, ex.start));
}

/** 본문 상태. 순서가 중요하다: 끝난 시험, 준비 기간 전, 오늘 할일, 할일 없음 */
export function bodyOf(ex: Pick<Exam, 'end' | 'prepStart' | 'tasks'>, today: string, todayCount: number): BodyState {
  if (today > ex.end) return 'afterExam';
  if (today < ex.prepStart) return 'beforePrep';
  if (todayCount > 0) return 'today';
  return ex.tasks.length > 0 ? 'noneToday' : 'noTasks';
}

/** 본문 상태별 안내 문장. 'today' 는 목록을 보이므로 문장이 없다(빈 문자열) */
export function bodyMessage(body: BodyState, ex: Pick<Exam, 'prepStart'>): string {
  switch (body) {
    case 'beforePrep': return TT.beforePrep(fmtMD(ex.prepStart));
    case 'afterExam': return TT.afterExam;
    case 'noneToday': return TT.noneToday;
    case 'noTasks': return TT.noTasks;
    default: return '';
  }
}

/** 오늘 할일의 정렬(원본과 같다: 과목 id 순, 같은 과목은 회차 순) */
export function compareToday(a: Task, b: Task): number {
  return a.esId.localeCompare(b.esId) || a.seq - b.seq;
}

/** 오늘 탭의 모든 구역을 한 번에 나눈다. 반환하는 배열의 항목은 app.state 의 같은 객체다(복사본 금지) */
export function classify(ex: Exam, today: string): TodayView {
  const map = tasksByDate(ex);
  const todays = (map[today] || []).slice().sort(compareToday);
  const upcoming = prepDays(ex)
    .filter((d) => d > today && (map[d] || []).length > 0)
    .slice(0, UPCOMING_LIMIT)
    .map((iso): UpcomingGroup => ({ iso, tasks: map[iso] }));
  return {
    phase: phaseOf(ex, today),
    ddayText: ddayText(ex, today),
    body: bodyOf(ex, today, todays.length),
    overdue: overdueOf(ex, today),
    canCarry: today <= ex.end,
    todays,
    upcoming,
  };
}

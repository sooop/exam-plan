/* 시험 공부 플래너의 데이터 타입. legacy/exam-plan.html 의 Planner 가 저장하는 모양과 같다. */

/* 바쁨 단계 키 (5단계). */
export type LevelKey = 'calm' | 'easy' | 'normal' | 'busy' | 'packed';

/* 단계별 하루 할일 한도. */
export type Limits = Record<LevelKey, number>;

/* 과목별 분량: n 교재, m 문제집, r 리캡. */
export interface Plan {
  n: number;
  m: number;
  r: number;
}

/* 할일 종류: s 학습(교재·문제집), r 리캡. */
export type TaskType = 's' | 'r';

/* 할일 한 건. esId 는 SubPlacement.id, date 가 null 이면 미배치. */
export interface Task {
  id: string;
  esId: string;
  type: TaskType;
  seq: number;
  date: string | null;
  done: boolean;
}

/* 과목 링크. */
export interface Link {
  label: string;
  url: string;
}

/* 시험 안에서 과목 한 건의 배치 (legacy 의 es). subjectId 는 LibraryItem.id. */
export interface SubPlacement {
  id: string;
  subjectId: string;
  examDate: string | null;
  range: string;
  comment: string;
  links: Link[];
  plan: Plan;
}

/* 과목 보관함 항목. color 는 #rrggbb. */
export interface LibraryItem {
  id: string;
  name: string;
  color: string;
}

/* 날짜별 저장 설정. 모두 선택 항목이다. holiday 는 true/false 로 기본값을 덮어쓴다. */
export interface DaySetting {
  level?: LevelKey;
  note?: string;
  holiday?: boolean;
}

/* 요일별 기본 바쁨 정도. 키는 0(일요일)~6(토요일). */
export type Week = Partial<Record<number, LevelKey>>;

/* 시험 한 건. days 는 날짜(YYYY-MM-DD) → DaySetting. */
export interface Exam {
  id: string;
  name: string;
  start: string;
  end: string;
  prepStart: string;
  subs: SubPlacement[];
  tasks: Task[];
  days: Record<string, DaySetting>;
  week: Week;
  /** 이 시험을 마지막으로 실제 바꾼 시각(ms). 동기화 충돌 판정용 선택 필드. 없으면 기기 전체 updatedAt 을 쓴다 */
  at?: number;
}

/* 전체 저장 상태. */
export interface State {
  v: number;
  limits: Limits;
  recapDays: number;
  week: Week;
  defPlan: Plan;
  library: LibraryItem[];
  exams: Exam[];
  activeId: string | null;
  updatedAt: number;
  /** 설정(limits·defPlan·recapDays·week)을 마지막으로 실제 바꾼 시각(ms). 선택 필드. 없으면 한 번도 바꾼 적 없다(0) */
  settingsAt?: number;
}

/* 시험 기본 정보 입력. prepStart 가 비면 시작일 28일 전으로 정한다. */
export interface ExamFields {
  name: string;
  start: string;
  end: string;
  prepStart?: string | null;
}

/* dayInfo 의 결과. */
export interface DayInfo {
  iso: string;
  level: LevelKey;
  limit: number;
  count: number;
  done: number;
  over: boolean;
  ratio: number;
}

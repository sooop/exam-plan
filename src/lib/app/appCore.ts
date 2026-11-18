// 앱 스토어의 순수한 부분(DOM·rune 비의존). app.svelte.ts 가 가져다 쓰고 tests/app 이 시험한다.
import { newState } from '../core/planner';
import { sanitizeState, type DropKind } from '../core/sanitize';
import type { State } from '../core/types';
import type { LoadResult } from '../storage/store';
import type { Tab } from '../storage/prefs';

export const UNDO_LIMIT = 50;
/** 같은 label 의 변경이 이 시간(ms) 안에 이어지면 한 단계로 합친다(merge 옵션을 켠 경우) */
export const MERGE_WINDOW_MS = 1000;

/** 상태를 깊게 복사한다. $state 프록시에도 동작한다(JSON 기반: State 는 JSON 으로 표현되는 값만 가진다) */
export const cloneState = (s: State): State => JSON.parse(JSON.stringify(s)) as State;

/** 로컬 편집 때 쓰는 updatedAt: 시계가 뒤로 가거나 같은 ms 안에 여러 번 바뀌어도 단조 증가한다 */
export const nextUpdatedAt = (prev: number, now: number): number => Math.max(now, (Number.isFinite(prev) ? prev : 0) + 1);

/** 시작 탭: 저장된 탭 우선(폭과 무관), 없으면 board, 시험이 없으면 exam */
export function pickStartTab(saved: Tab | null, examCount: number): Tab {
  if (examCount === 0) return 'exam';
  return saved ?? 'board';
}

// ───────── 불러오기 ─────────
export interface LoadProblem {
  kind: 'failed' | 'corrupt';
  /** 사용자에게 보일 한국어 설명 */
  message: string;
  /** 기술적 사유(저장소가 준 값) */
  reason: string;
  /** 손상 원본을 보존한 키. 보존하지 못했거나 failed 이면 null */
  backupKey: string | null;
}

/**
 * 버려진 시험 알림의 꼬리 문구. strings.ts 의 T2.droppedExams 는 백업이 없을 때의 문구와 같다.
 * 백업이 있을 때는 이 문구를 쓴다(Shell.svelte 가 droppedNotice 로 고른다).
 */
export const DROPPED_BACKED_UP_NOTE = '원본을 백업해 두었습니다. 내보내기로 받을 수 있습니다.';
export const DROPPED_LOST_NOTE = '다음 저장 때 완전히 사라집니다.';

/** 불러오면서 버려진 항목의 종류별 개수 */
export interface DroppedDetail { exams: number; subs: number; tasks: number; library: number; links: number }
export const emptyDropped = (): DroppedDetail => ({ exams: 0, subs: 0, tasks: 0, library: 0, links: 0 });
const DROP_FIELD: Record<DropKind, keyof DroppedDetail> = { exam: 'exams', sub: 'subs', task: 'tasks', library: 'library', link: 'links' };
const DROP_NAME: Record<keyof DroppedDetail, string> = { exams: '시험', subs: '과목', tasks: '할일', library: '과목 목록 항목', links: '링크' };

/**
 * 버려진 항목 알림 전체 문구. backedUp 이 true 면 원본 백업 안내, 아니면 '다음 저장 때 사라집니다'.
 * detail 을 주면 '읽을 수 없는 시험 1개, 과목 2개, 링크 5개를 제외하고' 처럼 종류별로 말한다.
 * 생략하거나 시험만 있으면 예전 문구('읽을 수 없는 시험 n개')와 같다.
 */
export function droppedNotice(n: number, backedUp: boolean, detail?: DroppedDetail | null): string {
  const tail = backedUp ? DROPPED_BACKED_UP_NOTE : DROPPED_LOST_NOTE;
  const parts = detail
    ? (Object.keys(DROP_NAME) as (keyof DroppedDetail)[]).filter((k) => detail[k] > 0).map((k) => DROP_NAME[k] + ' ' + detail[k] + '개')
    : [];
  if (!parts.length) return '읽을 수 없는 시험 ' + n + '개를 제외하고 불러왔습니다. ' + tail;
  return '읽을 수 없는 ' + parts.join(', ') + '를 제외하고 불러왔습니다. ' + tail;
}

/** 입력 JSON 의 시험 수. 배열이 아니면 0 */
export function countRawExams(raw: unknown): number {
  const exams = (raw as { exams?: unknown } | null)?.exams;
  return Array.isArray(exams) ? exams.length : 0;
}

/**
 * sanitizeState 를 저장소의 validate 로 쓰면서, 버려진 항목 수를 결과 객체에 붙여 기억한다(저장소는 검증된 값만 돌려주므로 방법이 이것뿐이다).
 * sanitizeState 의 onDrop 으로 시험뿐 아니라 과목·할일·라이브러리 항목·링크 단위 폐기도 센다(감사 M-7).
 * droppedOf 는 그 총계, detailOf 는 종류별 개수다.
 */
export function createValidator() {
  const dropped = new WeakMap<object, DroppedDetail>();
  const total = (d: DroppedDetail) => d.exams + d.subs + d.tasks + d.library + d.links;
  return {
    validate(raw: unknown): State | null {
      const d = emptyDropped();
      const s = sanitizeState(raw, { onDrop: (kind, n) => { d[DROP_FIELD[kind]] += n; } });
      if (s) dropped.set(s, d);
      return s;
    },
    droppedOf: (s: State): number => { const d = dropped.get(s); return d ? total(d) : 0; },
    detailOf: (s: State): DroppedDetail => ({ ...(dropped.get(s) ?? emptyDropped()) }),
  };
}

export interface ResolvedLoad {
  /** 화면이 쓸 상태. failed·corrupt 이면 빈 newState() */
  state: State;
  problem: LoadProblem | null;
  dropped: number;
  /** 저장된 값을 실제로 적용했는가(ok) */
  loaded: boolean;
}

/** store.load() 결과를 앱 상태로 바꾼다 */
export function resolveLoad(r: LoadResult<State>, droppedOf: (s: State) => number, statusMessage?: string): ResolvedLoad {
  switch (r.status) {
    case 'ok':
      return { state: r.value, problem: null, dropped: droppedOf(r.value), loaded: true };
    case 'empty':
      return { state: newState(), problem: null, dropped: 0, loaded: false };
    case 'failed':
      return {
        state: newState(), dropped: 0, loaded: false,
        problem: { kind: 'failed', message: statusMessage ?? '저장된 데이터를 불러오지 못했습니다.', reason: r.reason, backupKey: null },
      };
    case 'corrupt':
      return {
        state: newState(), dropped: 0, loaded: false,
        problem: { kind: 'corrupt', message: statusMessage ?? '저장된 데이터를 읽을 수 없습니다.', reason: r.reason, backupKey: r.backupKey },
      };
  }
}

// ───────── 원격 반영 ─────────
/** draft 를 깊게 복사해 mutator 를 적용한 결과를 돌려준다. updatedAt 은 건드리지 않는다 */
export function applyRemoteDraft(current: State, mutator: (draft: State) => void): State {
  const draft = cloneState(current);
  mutator(draft);
  return draft;
}

/** 변경 시각 표지(시험 at·설정 settingsAt)를 올릴지 정하는 비교에서 시험의 at 은 뺀다 */
const examKey = (e: unknown): string => JSON.stringify({ ...(e as object), at: undefined });
const settingsKey = (s: State): string => JSON.stringify([s.limits, s.defPlan, s.recapDays, s.week]);

/**
 * before 와 비교해 실제로 바뀐 시험에는 at, 바뀐 설정(limits·defPlan·recapDays·week)에는 settingsAt 을 t 로 올린다(state 를 직접 고친다).
 * 동기화 충돌 판정이 기기 전체 updatedAt 이 아니라 항목을 마지막으로 바꾼 시각으로 이뤄지게 한다(감사 M-2·H-1).
 */
export function stampChanges(state: State, before: State, t: number): void {
  const old = new Map(before.exams.map((e) => [e.id, examKey(e)]));
  for (const e of state.exams) {
    if (old.get(e.id) !== examKey(e)) e.at = t;
  }
  if (settingsKey(state) !== settingsKey(before)) state.settingsAt = t;
}

/** 내용이 같은가(updatedAt 은 비교에서 뺀다) */
export function sameContent(a: State, b: State): boolean {
  return JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 });
}

/** 되돌린 상태에서 activeId 는 기기별 값이므로 현재 값을 유지한다(그 시험이 없으면 첫 시험·null) */
export function keepActiveId(restored: State, activeId: string | null): State {
  const out = { ...restored };
  if (activeId !== null && out.exams.some((e) => e.id === activeId)) out.activeId = activeId;
  else if (out.activeId === null || !out.exams.some((e) => e.id === out.activeId)) out.activeId = out.exams.length ? out.exams[0].id : null;
  return out;
}

// ───────── 되돌리기 스택 ─────────
export interface UndoEntry {
  id: number;
  label: string;
  at: number;
  /** 이 단계를 되돌릴 때 복원할 상태(변경 전). 스택 밖으로 새지 않도록 호출자가 넘기는 복사본이다 */
  before: State;
}

export interface PushOptions {
  /** true 면 MERGE_WINDOW_MS, 숫자면 그 ms 안에서 직전 단계(같은 label)에 합친다 */
  merge?: boolean | number;
}

/** 세션 한정 되돌리기·다시 실행 스택. 최대 limit 단계 */
export class UndoStack {
  #undo: UndoEntry[] = [];
  #redo: UndoEntry[] = [];
  #seq = 0;
  constructor(readonly limit = UNDO_LIMIT) {}

  get undoDepth(): number { return this.#undo.length; }
  get redoDepth(): number { return this.#redo.length; }
  get undoLabel(): string | null { return this.#undo.at(-1)?.label ?? null; }
  get redoLabel(): string | null { return this.#redo.at(-1)?.label ?? null; }
  /** 맨 위 되돌리기 단계의 식별자(토스트의 '되돌리기' 가 그 사이에 다른 변경이 없었는지 확인할 때) */
  get topId(): number { return this.#undo.at(-1)?.id ?? 0; }

  /** 변경 전 상태를 쌓는다. 새 변경이므로 다시 실행 기록은 비운다. 합쳐졌으면 false */
  push(before: State, label: string, at: number, opts: PushOptions = {}): boolean {
    this.#redo = [];
    const win = opts.merge === true ? MERGE_WINDOW_MS : typeof opts.merge === 'number' ? opts.merge : 0;
    const top = this.#undo.at(-1);
    if (win > 0 && top && top.label === label && at - top.at <= win) {
      top.at = at; // 이어지는 입력: 가장 오래된 before 를 유지하고 시각만 늦춘다
      return false;
    }
    this.#undo.push({ id: ++this.#seq, label, at, before });
    if (this.#undo.length > this.limit) this.#undo.splice(0, this.#undo.length - this.limit);
    return true;
  }

  /** 되돌린다. current 는 지금 상태(다시 실행용으로 보관). 복원할 상태와 label 을 돌려준다 */
  popUndo(current: State, at: number): { state: State; label: string } | null {
    const e = this.#undo.pop();
    if (!e) return null;
    this.#redo.push({ id: e.id, label: e.label, at, before: current });
    return { state: e.before, label: e.label };
  }

  popRedo(current: State, at: number): { state: State; label: string } | null {
    const e = this.#redo.pop();
    if (!e) return null;
    this.#undo.push({ id: e.id, label: e.label, at, before: current });
    return { state: e.before, label: e.label };
  }

  clear(): void {
    this.#undo = [];
    this.#redo = [];
  }
}

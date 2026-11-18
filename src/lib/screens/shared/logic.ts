// 공용 컴포넌트의 순수 로직(DOM·Svelte 에 의존하지 않는다). tests/screens/shared 가 시험한다.
import { dayInfo, holidayName, levelOf, prepDays, tasksByDate } from '../../core/planner';
import { LEVEL_KEYS, LEVELS } from '../../core/constants';
import type { Exam, LevelKey, State, Task } from '../../core/types';
import { fmtFull, levelLabel as levelLabelOf } from '../../app/strings';
import { isImeKey } from '../../ui/layerCore';
import { T } from './texts';

export { isImeKey };

/* ---------- 롤빙 tabindex ---------- */
export type NavKey = 'ArrowDown' | 'ArrowUp' | 'ArrowRight' | 'ArrowLeft' | 'Home' | 'End';
const NAV: ReadonlySet<string> = new Set(['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End']);
export const isNavKey = (key: string): key is NavKey => NAV.has(key);

/**
 * 방향키·Home·End 로 옮길 다음 항목의 번호. 끝에서는 반대편으로 돌아가고 비활성 항목은 건너뛴다.
 * 처리하지 않는 키이거나 갈 곳이 없으면 null(호출자는 preventDefault 하지 않는다).
 * index 가 범위 밖(-1 등)이면 아래/오른쪽은 처음부터, 위/왼쪽은 끝부터 찾는다.
 */
export function rovingNext(index: number, key: string, count: number, isDisabled?: (i: number) => boolean): number | null {
  if (!isNavKey(key) || count <= 0) return null;
  const off = (i: number) => !!isDisabled && isDisabled(i);
  if (key === 'Home') {
    for (let i = 0; i < count; i++) if (!off(i)) return i;
    return null;
  }
  if (key === 'End') {
    for (let i = count - 1; i >= 0; i--) if (!off(i)) return i;
    return null;
  }
  const step = key === 'ArrowDown' || key === 'ArrowRight' ? 1 : -1;
  const start = index >= 0 && index < count ? index : step === 1 ? -1 : count;
  for (let n = 1; n <= count; n++) {
    const i = (((start + step * n) % count) + count) % count;
    if (!off(i)) return i;
  }
  return null;
}

/** 롤빙 항목의 시작 번호: 선택(현재) 항목이 있고 비활성이 아니면 그것, 아니면 첫 활성 항목, 없으면 -1 */
export function rovingStart(preferred: number, count: number, isDisabled?: (i: number) => boolean): number {
  const off = (i: number) => !!isDisabled && isDisabled(i);
  if (preferred >= 0 && preferred < count && !off(preferred)) return preferred;
  for (let i = 0; i < count; i++) if (!off(i)) return i;
  return -1;
}

/* ---------- 게이지·진행률 ---------- */
export interface Gauge { count: number; limit: number; over: boolean; text: string; label: string; ratio: number }
export function gauge(count: number, limit: number): Gauge {
  const over = count > limit;
  const ratio = limit > 0 ? count / limit : count > 0 ? 2 : 0;
  return { count, limit, over, ratio, text: T.gaugeCount(count, limit), label: T.gaugeLabel(count, limit, over) };
}

/** 날짜 칸 배경 채움 비율(0..1). legacy dayFill: 넘치면 1, 비면 0.12, 그 밖에는 0.3 + 0.7*비율 */
export function dayFill(count: number, limit: number): number {
  const g = gauge(count, limit);
  if (g.over) return 1;
  return count === 0 ? 0.12 : Math.min(1, 0.3 + 0.7 * g.ratio);
}

/** 바쁨 정도의 단계(1..5). 모르는 키는 0 */
export const levelStep = (level: string): number => LEVEL_KEYS.indexOf(level as LevelKey) + 1;

export function meterLabel(level: LevelKey): string {
  return T.meterLabel(levelLabelOf(level), levelStep(level));
}

export interface Progress { done: number; total: number; pct: number }
export function progressOf(done: number, total: number): Progress {
  const t = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const d = Math.min(t, Math.max(0, Math.floor(Number.isFinite(done) ? done : 0)));
  return { done: d, total: t, pct: t > 0 ? Math.round((d / t) * 100) : 0 };
}

/* ---------- 할일 칩 ---------- */
export interface ChipInfo {
  kind: '교재' | '문제집' | '리캡' | '';
  name: string;
  seq: number;
  total: number;
  /** 화면에 보이는 짧은 글자(planner.taskLabel 과 같다): '국어 3/4', '국어 리캡 1/2' */
  text: string;
  /** 스크린리더용: '국어 교재 3회 · 완료' */
  a11y: string;
  done: boolean;
}
export function chipInfo(exam: Exam, task: Task, subjectName: string): ChipInfo {
  const es = exam.subs.find((s) => s.id === task.esId);
  const recap = task.type === 'r';
  const total = es ? (recap ? es.plan.r : es.plan.n + es.plan.m) : 0;
  const kind: ChipInfo['kind'] = !es ? '' : recap ? '리캡' : task.seq <= es.plan.n ? '교재' : '문제집';
  const text = subjectName + (recap ? ' 리캡 ' : ' ') + task.seq + '/' + total;
  return { kind, name: subjectName, seq: task.seq, total, text, a11y: T.chipA11y(subjectName, kind, task.seq, task.done), done: task.done };
}

/** 칩에서 날짜 옮기기를 여는 키(Shift+F10, ContextMenu) */
export function isMoveKey(e: { key: string; shiftKey?: boolean }): boolean {
  return e.key === 'ContextMenu' || (e.key === 'F10' && !!e.shiftKey);
}

/* ---------- 날짜 선택 항목 ---------- */
export interface PickItem {
  /** null 이면 '보관함으로' */
  iso: string | null;
  level: LevelKey | null;
  levelLabel: string;
  count: number;
  limit: number;
  /** 이 선택으로 새로 들어오는 개수(이미 그 날짜에 있는 것은 제외) */
  incoming: number;
  /** 들어온 뒤의 개수가 권장을 넘는가 */
  over: boolean;
  fill: number;
  holiday: string;
  current: boolean;
  disabled: boolean;
  /** 비활성 이유 */
  reason: string;
  label: string;
}

/** 모든 할일이 같은 날짜에 있으면 그 날짜(미배치면 null), 섞여 있거나 할일이 없으면 undefined */
export function commonDate(exam: Exam, taskIds: readonly string[]): string | null | undefined {
  let found: string | null | undefined;
  let first = true;
  for (const id of taskIds) {
    const t = exam.tasks.find((x) => x.id === id);
    if (!t) continue;
    if (first) {
      found = t.date;
      first = false;
    } else if (found !== t.date) return undefined;
  }
  return found;
}

/** 날짜 선택 시트의 항목. 첫 항목은 '보관함으로'(iso null), 이어서 준비 기간 날짜 */
export function buildPickItems(state: State, exam: Exam, taskIds: readonly string[], current: string | null | undefined): PickItem[] {
  const tasks = taskIds.map((id) => exam.tasks.find((x) => x.id === id)).filter((t): t is Task => !!t);
  const map = tasksByDate(exam);
  const cur = current === undefined ? commonDate(exam, taskIds) : current;
  const allVault = tasks.length > 0 && tasks.every((t) => !t.date);
  const vaultExtra: string[] = [];
  if (cur === null) vaultExtra.push(T.pickCurrent);
  if (allVault) vaultExtra.push(T.pickVaultHere);
  const items: PickItem[] = [{
    iso: null, level: null, levelLabel: '', count: 0, limit: 0, incoming: tasks.filter((t) => t.date).length, over: false, fill: 0,
    holiday: '', current: cur === null, disabled: allVault, reason: allVault ? T.pickVaultHere : '', label: T.pickVaultOptionLabel(vaultExtra),
  }];
  for (const iso of prepDays(exam)) {
    const info = dayInfo(state, exam, iso, map);
    const incoming = tasks.filter((t) => t.date !== iso).length;
    const after = info.count + incoming;
    const over = after > info.limit;
    const hol = holidayName(exam, iso);
    const lvLabel = levelLabelOf(info.level);
    const extra: string[] = [];
    if (hol) extra.push(hol);
    if (cur === iso) extra.push(T.pickCurrent);
    if (over) extra.push(T.pickOverHint);
    items.push({
      iso, level: info.level, levelLabel: lvLabel, count: info.count, limit: info.limit, incoming, over, fill: dayFill(after, info.limit),
      holiday: hol, current: cur === iso, disabled: false, reason: '', label: T.pickOptionLabel(fmtFull(iso), lvLabel, info.count, info.limit, extra),
    });
  }
  return items;
}

/* ---------- 바쁨 정도 팝오버 ---------- */
export interface LevelOption { key: LevelKey; label: string; limit: number; checked: boolean }
export function levelOptions(state: State, exam: Exam, iso: string): LevelOption[] {
  const cur = levelOf(exam, iso);
  return LEVELS.map((l) => ({ key: l.key, label: l.label, limit: state.limits[l.key], checked: l.key === cur }));
}

/* ---------- 메모 입력 ---------- */
export const MEMO_MAX = 60;
export type MemoKey = 'save' | 'ignore' | 'default';
/**
 * 메모 입력칸의 키 처리.
 * - 한글 등 조합 중(isComposing, keyCode 229)의 모든 키는 'ignore'(저장·닫기 안 함, preventDefault 도 안 함)
 * - Enter(Shift 없음) 는 'save', Shift+Enter 는 'default'(줄바꿈)
 * - Esc 는 조합 중이 아니면 'default'(층이 닫는다)
 */
export function memoKey(e: { key: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number }): MemoKey {
  if (isImeKey(e)) return 'ignore';
  if (e.key === 'Enter' && !e.shiftKey) return 'save';
  return 'default';
}
export const normalizeMemo = (text: string): string => String(text || '').trim().slice(0, MEMO_MAX);

/* ---------- 날짜 카드 요약 ---------- */
export interface DaySummary { total: number; done: number; unfinished: number; past: boolean }
export function daySummary(tasks: readonly Task[], iso: string, today: string): DaySummary {
  const done = tasks.filter((t) => t.done).length;
  return { total: tasks.length, done, unfinished: tasks.length - done, past: iso < today };
}

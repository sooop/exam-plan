// 시험 일정 화면의 순수 로직(DOM·Svelte 에 의존하지 않는다). tests/screens/exam 이 시험한다.
import { MAX_COUNT } from '../../core/constants';
import { addDays, isISO } from '../../core/dates';
import type { ExamFieldsPreview } from '../../core/planner';
import type { Exam, ExamFields, Plan } from '../../core/types';
import { clampInt, nameKey, normName } from '../../core/util';
import { COLOR_NAMES, X } from './texts';

/* ---------- 문장 ---------- */
/** "무엇을 하지 못했는지: 이유" 문장. 이유 끝의 마침표는 지운다 */
export const failMsg = (what: string, reason: string): string => `${what}: ${reason.replace(/[.。\s]+$/, '')}`;

/** '로'/'으로' 를 붙인다(받침 없음·ㄹ 받침은 '로'). 한글이 아닌 끝 글자는 '로' */
export function withRo(word: string): string {
  const ch = word.trim().slice(-1);
  if (!ch) return word;
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) {
    const jong = (c - 0xac00) % 28;
    return word + (jong === 0 || jong === 8 ? '로' : '으로');
  }
  return word + '로';
}

/* ---------- 시험 만들기 폼 ---------- */
export interface CreateFormState {
  name: string;
  start: string;
  end: string;
  prepStart: string;
  /** 사용자가 준비 시작일을 직접 건드렸는가(그러면 시작일을 바꿔도 자동 보정하지 않는다) */
  prepTouched: boolean;
}
export const emptyCreateForm = (): CreateFormState => ({ name: '', start: '', end: '', prepStart: '', prepTouched: false });

/** 시작일이 바뀌었다: 준비 시작일(직접 건드리지 않았을 때)과 종료일(비었거나 시작일보다 앞일 때)을 보정한다. 유효하지 않은 날짜면 그대로 둔다 */
export function applyStartChange(f: CreateFormState, start: string): CreateFormState {
  const next: CreateFormState = { ...f, start };
  if (!isISO(start)) return next;
  if (!f.prepTouched) next.prepStart = addDays(start, -28);
  if (!isISO(f.end) || f.end < start) next.end = addDays(start, 3);
  return next;
}

/** 준비 시작일을 시작일의 n 주 전으로. 시작일이 유효하지 않으면 null */
export function applyPrepWeeks(f: CreateFormState, n: number): CreateFormState | null {
  if (!isISO(f.start)) return null;
  return { ...f, prepStart: addDays(f.start, -7 * n), prepTouched: true };
}

/* ---------- 시험 정보 편집 ---------- */
export interface ExamDraft { name: string; start: string; end: string; prep: string }
type ExamCore = Pick<Exam, 'name' | 'start' | 'end' | 'prepStart'>;
export const draftOf = (ex: ExamCore): ExamDraft => ({ name: ex.name, start: ex.start, end: ex.end, prep: ex.prepStart });
export const fieldsOf = (d: ExamDraft): ExamFields => ({ name: d.name, start: d.start, end: d.end, prepStart: d.prep });

const prepOf = (f: ExamFields): string => f.prepStart || (isISO(f.start) ? addDays(f.start, -28) : '');

/** 입력이 현재 값과 다른가(이름은 공백 정리 뒤, 준비 시작일은 비면 시작일 28일 전으로 비교) */
export const fieldsChanged = (ex: ExamCore, f: ExamFields): boolean =>
  normName(f.name) !== ex.name || f.start !== ex.start || f.end !== ex.end || prepOf(f) !== ex.prepStart;

/** 날짜(시작·종료·준비 시작)가 바뀌는가: 바뀔 때만 변경 전 스냅샷(big)을 남긴다 */
export const datesChanged = (ex: ExamCore, f: ExamFields): boolean =>
  f.start !== ex.start || f.end !== ex.end || prepOf(f) !== ex.prepStart;

/** 확인 블록이 필요한가: 미배치로 바뀔 할일·삭제될 날짜 설정·바뀔 과목 시험일이 하나라도 있을 때 */
export const needsConfirm = (p: ExamFieldsPreview): boolean => p.ok && (p.unplacedTasks > 0 || p.removedDays > 0 || p.changedSubDates > 0);

/** 확인 블록 문구(건수를 쓴다). 영향이 없으면 빈 문자열 */
export function impactMessage(p: ExamFieldsPreview): string {
  let head = '';
  if (p.unplacedTasks > 0 && p.removedDays > 0) head = X.impactTasksDays(p.unplacedTasks, p.removedDays, p.removedDayNotes);
  else if (p.unplacedTasks > 0) head = X.impactTasks(p.unplacedTasks);
  else if (p.removedDays > 0) head = X.impactDays(p.removedDays, p.removedDayNotes);
  let text: string;
  if (p.changedSubDates > 0) text = head ? X.impactSubsJoin(head, p.changedSubDates) : X.impactSubsOnly(p.changedSubDates);
  else text = head;
  return text ? text + '.' : '';
}

/* ---------- 날짜 행·끌기 ---------- */
export const UNDATED = 'undated';
export const rowKeyOf = (date: string | null | undefined, days: readonly string[]): string => (date && days.includes(date) ? date : UNDATED);
export const keyToDate = (key: string): string | null => (key === UNDATED ? null : key);

/** Alt+↑/↓ 로 옮길 대상 날짜. 순서는 1일차 … n일차, 날짜 미정. 끝에서 더 갈 수 없으면 null, 옮기면 { to }(to 가 null 이면 날짜 미정) */
export function moveTarget(days: readonly string[], current: string | null, dir: -1 | 1): { to: string | null } | null {
  const keys: (string | null)[] = [...days, null];
  const i = current == null ? keys.length - 1 : keys.indexOf(current);
  const idx = i < 0 ? keys.length - 1 : i;
  const j = idx + dir;
  if (j < 0 || j >= keys.length) return null;
  return { to: keys[j] };
}

export interface RowRect { key: string; left: number; top: number; right: number; bottom: number }
/** 포인터 아래의 날짜 행. 행 사이 틈에서는 직전 행을 유지해 깜빡이지 않게 하고, 행들 밖이면 null. rows 는 위에서 아래 순서 */
export function rowAt(rows: readonly RowRect[], x: number, y: number, prev: string | null = null): string | null {
  if (!rows.length) return null;
  const hit = rows.find((r) => y >= r.top && y <= r.bottom);
  if (hit) return x >= hit.left && x <= hit.right ? hit.key : null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (prev && rows.some((r) => r.key === prev) && y > first.top && y < last.bottom && x >= first.left && x <= first.right) return prev;
  return null;
}

/** 화면 가장자리 자동 스크롤 방향(-1 위, 1 아래, 0 없음) */
export function edgeDir(y: number, top: number, bottom: number, band = 48): -1 | 0 | 1 {
  if (y < top + band) return -1;
  if (y > bottom - band) return 1;
  return 0;
}

/* ---------- 빠른 추가 ---------- */
/** 빠른 추가 후보: 보관함 이름 다음 공통 과목. 이미 시험에 있는 과목(대소문자·공백 무시)과 중복은 뺀다 */
export function quickCandidates(libraryNames: readonly string[], haveNames: readonly string[], common: readonly string[], max = 14): string[] {
  const have = new Set(haveNames.map(nameKey));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const nm of [...libraryNames, ...common]) {
    const k = nameKey(nm);
    if (!k || have.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(nm);
    if (out.length >= max) break;
  }
  return out;
}

/* ---------- 과목 정보 ---------- */
export interface PlanDraft { n: unknown; m: unknown; r: unknown }
/** 입력 초안을 0~30 의 정수로 정리한다(비었거나 숫자가 아니면 0) */
export const nextPlan = (d: PlanDraft): Plan => ({ n: clampInt(d.n, 0, MAX_COUNT), m: clampInt(d.m, 0, MAX_COUNT), r: clampInt(d.r, 0, MAX_COUNT) });
export const planEqual = (a: Plan, b: Plan): boolean => a.n === b.n && a.m === b.m && a.r === b.r;

export const colorName = (hex: string): string => COLOR_NAMES[hex.toUpperCase()] ?? X.customColor;

// 준비 계획 화면의 순수 로직(DOM·Svelte 에 의존하지 않는다). tests/screens/plan 이 시험한다.
import { addDays, weekday } from '../../core/dates';
import type { SubPlacement, Task } from '../../core/types';
import { clampInt } from '../../core/util';
import { WD, fmtFull } from '../../app/strings';
import { P } from './texts';

/* ---------- 달력 격자 ---------- */
/** 그 날짜가 속한 주의 월요일 */
export const mondayOf = (iso: string): string => addDays(iso, -((weekday(iso) + 6) % 7));

/** 준비 기간 날짜를 월요일 시작 주 행으로 나눈다. 범위 밖(앞뒤 여백) 칸은 null. 날짜가 없으면 빈 배열 */
export function weekRows(days: readonly string[]): (string | null)[][] {
  if (!days.length) return [];
  const have = new Set(days);
  const rows: (string | null)[][] = [];
  const end = addDays(mondayOf(days[days.length - 1]), 6);
  for (let mon = mondayOf(days[0]); mon <= end; mon = addDays(mon, 7)) {
    const row: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i);
      row.push(have.has(d) ? d : null);
    }
    rows.push(row);
  }
  return rows;
}

/** 칸 머리 숫자: 첫 날과 매월 1일은 '6/1', 나머지는 일(day)만 */
export const cellNumber = (iso: string, first: string): string =>
  iso === first || iso.slice(8) === '01' ? +iso.slice(5, 7) + '/' + +iso.slice(8) : String(+iso.slice(8));

/** '6월 3일' (접근성 이름용) */
export const koDate = (iso: string): string => P.koDate(+iso.slice(5, 7), +iso.slice(8, 10));

/** 날짜의 할일 순서. DayCard 와 같다(과목 → 종류 → 회차) */
export const sortTasks = (a: Task, b: Task): number => a.esId.localeCompare(b.esId) || a.type.localeCompare(b.type) || a.seq - b.seq;

/** 날짜별 할일 묶음을 한 번에 만든다(칸마다 다시 걸러내지 않는다) */
export function tasksByDateSorted(tasks: readonly Task[]): Record<string, Task[]> {
  const map: Record<string, Task[]> = {};
  for (const t of tasks) if (t.date) (map[t.date] || (map[t.date] = [])).push(t);
  for (const k of Object.keys(map)) map[k].sort(sortTasks);
  return map;
}

/* ---------- 칸 접근성 이름 ---------- */
export interface CellFacts {
  iso: string;
  count: number;
  done: number;
  levelLabel: string;
  over: boolean;
  limit: number;
  note: boolean;
  holiday: string;
  /** 시험 n일차(0 이면 시험일이 아님) */
  examDay: number;
  today: boolean;
}
/** '6월 3일 화, 할일 4개 중 2개 완료, 바쁨 보통, 메모 있음' */
export function cellLabel(f: CellFacts): string {
  const parts = [koDate(f.iso) + ' ' + WD[weekday(f.iso)]];
  if (f.today) parts.push(P.cellToday);
  if (f.holiday) parts.push(f.holiday);
  if (f.examDay > 0) parts.push(P.cellExamDay(f.examDay));
  parts.push(P.cellTasks(f.count, f.done));
  if (f.levelLabel) parts.push(P.cellLevel(f.levelLabel));
  if (f.over) parts.push(P.cellOver(f.limit));
  if (f.note) parts.push(P.cellNote);
  return parts.join(', ');
}

/* ---------- 선택 ---------- */
/** a~b(포함) 사이의 날짜. 둘 중 하나라도 days 에 없으면 빈 배열 */
export function rangeBetween(days: readonly string[], a: string, b: string): string[] {
  const i = days.indexOf(a);
  const j = days.indexOf(b);
  if (i < 0 || j < 0) return [];
  return days.slice(Math.min(i, j), Math.max(i, j) + 1);
}

/** 선택 집합을 days 순서의 배열로(범위 밖은 버린다) */
export function inDayOrder(days: readonly string[], picked: Iterable<string>): string[] {
  const set = new Set(picked);
  return days.filter((d) => set.has(d));
}

export interface ClickIn {
  iso: string;
  ctrl: boolean;
  shift: boolean;
  anchor: string | null;
}
export interface ClickOut {
  /** 클릭 뒤의 선택(days 순서) */
  selected: string[];
  anchor: string;
  /** 일반 클릭: 선택을 풀고 이 날짜의 상세를 연다 */
  open: boolean;
}
/**
 * 칸 클릭의 의미. Ctrl/⌘ 은 토글, Shift 는 기준점부터 범위(기준점이 없으면 이 칸만),
 * Ctrl+Shift 는 기존 선택에 범위를 더한다. 수식어가 없으면 선택을 풀고 연다.
 */
export function resolveClick(current: Iterable<string>, days: readonly string[], c: ClickIn): ClickOut {
  const cur = inDayOrder(days, current);
  if (c.shift) {
    const anchor = c.anchor && days.includes(c.anchor) ? c.anchor : null;
    if (!anchor) return { selected: [c.iso], anchor: c.iso, open: false };
    const range = rangeBetween(days, anchor, c.iso);
    return { selected: c.ctrl ? inDayOrder(days, [...cur, ...range]) : range, anchor, open: false };
  }
  if (c.ctrl) {
    const next = cur.includes(c.iso) ? cur.filter((d) => d !== c.iso) : inDayOrder(days, [...cur, c.iso]);
    return { selected: next, anchor: c.iso, open: false };
  }
  return { selected: [], anchor: c.iso, open: true };
}

/** 선택에 더할 날짜를 합친다(days 순서) */
export const mergeSelection = (days: readonly string[], current: Iterable<string>, add: readonly string[]): string[] =>
  inDayOrder(days, [...current, ...add]);

/** 주말(토·일)이거나 휴일인 날 */
export const weekendHolidayDays = (days: readonly string[], isHoliday: (iso: string) => boolean): string[] =>
  days.filter((d) => {
    const w = weekday(d);
    return w === 0 || w === 6 || isHoliday(d);
  });

/** 할일이 하나도 없는 날 */
export const emptyDays = (days: readonly string[], countOf: (iso: string) => number): string[] => days.filter((d) => countOf(d) === 0);

/** 바쁨 정도를 level(null 이면 기본값으로)로 바꾸면 실제로 달라지는 날짜(저장된 덮어쓴 값과 비교) */
export function levelChangedDays(
  daySettings: Readonly<Record<string, { level?: string } | undefined>>,
  targets: readonly string[],
  level: string | null,
): string[] {
  return targets.filter((d) => {
    const cur = daySettings[d]?.level;
    return level === null ? cur !== undefined : cur !== level;
  });
}

/* ---------- 격자 키 이동 ---------- */
/**
 * 방향키·Home·End 로 옮길 다음 날짜. ←→ 하루, ↑↓ 한 주(마지막 주 칸이 비어 있으면 끝 날짜로),
 * Home·End 는 그 주의 처음·끝(범위 안), Ctrl+Home·End 는 기간의 처음·끝. 갈 곳이 없으면 null.
 */
export function gridMove(days: readonly string[], iso: string, key: string, ctrl = false): string | null {
  const n = days.length;
  if (!n) return null;
  const idx = days.indexOf(iso);
  if (idx < 0) return days[0];
  const off = (weekday(days[0]) + 6) % 7;
  const row = (i: number) => Math.floor((i + off) / 7);
  const col = (i: number) => (i + off) % 7;
  let to = -1;
  switch (key) {
    case 'ArrowLeft': to = idx - 1; break;
    case 'ArrowRight': to = idx + 1; break;
    case 'ArrowUp': to = idx - 7 >= 0 ? idx - 7 : row(idx) > 0 ? 0 : -1; break;
    case 'ArrowDown': to = idx + 7 < n ? idx + 7 : row(n - 1) > row(idx) ? n - 1 : -1; break;
    case 'Home': to = ctrl ? 0 : Math.max(0, idx - col(idx)); break;
    case 'End': to = ctrl ? n - 1 : Math.min(n - 1, idx + (6 - col(idx))); break;
    default: return null;
  }
  if (to < 0 || to >= n || to === idx) return null;
  return days[to];
}

export const isGridKey = (key: string): boolean =>
  key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End';

/* ---------- 칩 키보드 이동(Alt+방향키) ---------- */
/**
 * 칩에서 Alt+←/→ 는 전날·다음날, Alt+↑/↓ 는 전주·다음주. 범위 밖이면 null(옮기지 않는다).
 * 보관함의 칩(current 가 null)은 → ↓ 로 첫 날짜에 들어가고 ← ↑ 는 갈 곳이 없다.
 */
export function keyMoveDate(days: readonly string[], current: string | null, key: string): string | null {
  const step = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : key === 'ArrowUp' ? -7 : key === 'ArrowDown' ? 7 : 0;
  if (!step || !days.length) return null;
  const idx = current ? days.indexOf(current) : -1;
  if (idx < 0) return step > 0 ? days[0] : null;
  const to = idx + step;
  return to >= 0 && to < days.length ? days[to] : null;
}
export const isMoveArrow = (e: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; key: string }): boolean =>
  !!e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown');

/* ---------- 끌어 놓기 ---------- */
/** 포인터 아래에서 찾은 놓기 대상 단서: 가장 가까운 [data-drop-day] 의 날짜, [data-drop-vault] 위인가 */
export interface DropHit {
  date: string | null;
  vault: boolean;
}
export type DropTarget = { kind: 'day'; iso: string; same: boolean } | { kind: 'vault'; same: boolean };

/** 놓을 곳 판정. 준비 기간 밖 날짜·아무 대상도 아닌 곳은 null. same 은 지금 있는 자리와 같다는 뜻(옮기지 않는다) */
export function resolveDrop(hit: DropHit | null, days: readonly string[], from: string | null): DropTarget | null {
  if (!hit) return null;
  if (hit.vault) return { kind: 'vault', same: from === null };
  if (hit.date && days.includes(hit.date)) return { kind: 'day', iso: hit.date, same: hit.date === from };
  return null;
}

/** 두 놓을 곳이 같은가(고스트 설명·강조를 바꿀 때 비교) */
export function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === 'vault' || (b.kind === 'day' && a.iso === b.iso);
}

/** 고스트 아래 설명 띠. over: 놓으면 그 날이 권장 개수를 넘는가 */
export function dropCaption(t: DropTarget | null, over = false): string {
  if (!t) return P.dragBack;
  if (t.kind === 'vault') return t.same ? P.dragVaultStay : P.dragVault;
  if (t.same) return P.dragStay;
  return (over ? P.dragMoveOver : P.dragMove)(fmtFull(t.iso));
}

/** 화면 가장자리 자동 스크롤 방향(-1 위, 1 아래, 0 없음) */
export function edgeDir(y: number, top: number, bottom: number, band = 48): -1 | 0 | 1 {
  if (y < top + band) return -1;
  if (y > bottom - band) return 1;
  return 0;
}

/* ---------- 보관함 ---------- */
export interface LooseGroup {
  esId: string;
  tasks: Task[];
}
/** 미배치 할일을 과목 배치 순서대로 묶는다. 한 과목 안은 학습(s) → 리캡(r), 회차 순. 비어 있는 과목은 뺀다 */
export function groupLoose(subs: readonly Pick<SubPlacement, 'id'>[], loose: readonly Task[]): LooseGroup[] {
  const out: LooseGroup[] = [];
  for (const es of subs) {
    const mine = loose
      .filter((t) => t.esId === es.id)
      .sort((a, b) => (a.type === b.type ? a.seq - b.seq : a.type === 's' ? -1 : 1));
    if (mine.length) out.push({ esId: es.id, tasks: mine });
  }
  return out;
}

/* ---------- 리캡 입력 ---------- */
/** 일수 입력 → 1~30 의 정수. 숫자가 아니면 fallback(그것도 범위로 보정) */
export function parseRecapDays(raw: unknown, fallback = 7): number {
  const s = typeof raw === 'string' ? raw.trim() : raw;
  const bad = s === '' || s === null || s === undefined || !Number.isFinite(Number(s));
  return clampInt(bad ? fallback : Math.round(Number(s)), 1, 30);
}

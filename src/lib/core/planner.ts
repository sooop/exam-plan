import type { Exam, ExamFields, Plan, State, SubPlacement, Task, TaskType, Week, LibraryItem, LevelKey, DayInfo } from './types';
import { DEFAULT_LIMITS, DEFAULT_PLAN, MAX_COUNT, MAX_DAYS, PALETTE } from './constants';
import { HOLIDAYS } from './holidays';
import { addDays, diffDays, isISO, rangeDays, weekday } from './dates';
import { clampInt, isLevel, nameKey, normName, uid } from './util';

/* ---------- 상태 ---------- */
export function newState(): State {
  return { v: 3, limits: Object.assign({}, DEFAULT_LIMITS), recapDays: 7, week: {}, defPlan: Object.assign({}, DEFAULT_PLAN), library: [], exams: [], activeId: null, updatedAt: 0 };
}

export function validateExamFields(f: ExamFields): string | null {
  const name = normName(f.name);
  if (!name) return '시험 이름을 입력해 주세요.';
  if (!isISO(f.start) || !isISO(f.end)) return '시작일과 종료일을 입력해 주세요.';
  if (f.end < f.start) return '종료일은 시작일 이후여야 합니다.';
  const prep = f.prepStart || addDays(f.start, -28);
  if (!isISO(prep)) return '준비 시작일을 입력해 주세요.';
  if (prep > f.end) return '준비 시작일은 종료일 이전이어야 합니다.';
  if (diffDays(prep, f.end) + 1 > MAX_DAYS) return '준비 기간과 시험 기간을 합쳐 ' + MAX_DAYS + '일 이내로 정해 주세요.';
  return null;
}

export function newExam(f: ExamFields): { exam: Exam } | { error: string } {
  const err = validateExamFields(f);
  if (err) return { error: err };
  return {
    exam: {
      id: uid(), name: normName(f.name), start: f.start, end: f.end,
      prepStart: f.prepStart || addDays(f.start, -28), subs: [], tasks: [], days: {}, week: {},
    },
  };
}

/* 날짜가 바뀌면 범위를 벗어난 배치는 보관함으로 돌아간다. 돌아간 개수를 반환한다. */
export function updateExamFields(exam: Exam, f: ExamFields): { unplaced: number } | { error: string } {
  const err = validateExamFields(f);
  if (err) return { error: err };
  const prep = f.prepStart || addDays(f.start, -28);
  exam.name = normName(f.name);
  exam.start = f.start;
  exam.end = f.end;
  exam.prepStart = prep;
  let unplaced = 0;
  exam.tasks.forEach((t) => {
    if (t.date && (t.date < prep || t.date > f.end)) { t.date = null; unplaced += 1; }
  });
  exam.subs.forEach((s) => {
    if (s.examDate && (s.examDate < f.start || s.examDate > f.end)) s.examDate = null;
  });
  Object.keys(exam.days).forEach((k) => { if (k < prep || k > f.end) delete exam.days[k]; });
  return { unplaced };
}

export const prepDays = (exam: Exam): string[] => rangeDays(exam.prepStart, exam.end);
export const examDays = (exam: Exam): string[] => rangeDays(exam.start, exam.end);
export const getExam = (state: State, id: string): Exam | null => state.exams.find((e) => e.id === id) || null;

/* ---------- 과목 라이브러리 ---------- */
function pickColor(state: State): string {
  const used = new Set(state.library.map((s) => s.color));
  const free = PALETTE.find((c) => !used.has(c));
  return free || PALETTE[state.library.length % PALETTE.length];
}
export function findSubject(state: State, name: unknown): LibraryItem | null {
  const k = nameKey(name);
  return state.library.find((s) => nameKey(s.name) === k) || null;
}
export function ensureSubject(state: State, name: unknown): LibraryItem | null {
  const n = normName(name).slice(0, 40);
  if (!n) return null;
  let s = findSubject(state, n);
  if (!s) {
    s = { id: uid(), name: n, color: pickColor(state) };
    state.library.push(s);
  }
  return s;
}
export function renameSubject(state: State, id: string, name: unknown): { error?: string } {
  const n = normName(name).slice(0, 40);
  if (!n) return { error: '과목명을 입력해 주세요.' };
  const other = findSubject(state, n);
  if (other && other.id !== id) return { error: '이미 있는 과목명입니다.' };
  const s = state.library.find((x) => x.id === id);
  if (s) s.name = n;
  return {};
}
export const subjectOf = (state: State, es: SubPlacement): Pick<LibraryItem, 'name' | 'color'> => state.library.find((s) => s.id === es.subjectId) || { name: '(이름 없음)', color: PALETTE[7] };

export function cleanPlan(p: unknown): Plan {
  const q = (p && typeof p === 'object' ? p : DEFAULT_PLAN) as Partial<Plan>;
  return { n: clampInt(q.n != null ? q.n : DEFAULT_PLAN.n, 0, MAX_COUNT), m: clampInt(q.m != null ? q.m : DEFAULT_PLAN.m, 0, MAX_COUNT), r: clampInt(q.r != null ? q.r : DEFAULT_PLAN.r, 0, MAX_COUNT) };
}
/* 요일별 기본 바쁨 정도: { '1': 'busy', ... } (0 일요일 ~ 6 토요일) */
export function cleanWeek(w: unknown): Week {
  const out: Week = {};
  if (w && typeof w === 'object') { const src = w as Record<number, unknown>; for (let i = 0; i < 7; i++) { const v = src[i]; if (isLevel(v)) out[i] = v; } }
  return out;
}
/* 쉼표, 슬래시, 줄바꿈으로 나눈 여러 과목을 한 번에 추가한다. */
export function addSubs(state: State, exam: Exam, text: unknown, examDate: string | null | undefined): { error: string } | { added: number; dup: number; sub: SubPlacement | null } {
  const names = String(text || '').split(/[,，、\/\n]+/).map((x) => normName(x)).filter(Boolean);
  let added = 0, dup = 0;
  let last: SubPlacement | null = null;
  names.forEach((nm) => { const r = addSub(state, exam, nm, examDate); if ('sub' in r) { added++; last = r.sub; } else dup++; });
  if (!names.length) return { error: '과목명을 입력해 주세요.' };
  if (!added) return { error: '이미 등록된 과목입니다.' };
  return { added, dup, sub: last };
}
export function addSub(state: State, exam: Exam, name: unknown, examDate: string | null | undefined): { sub: SubPlacement } | { error: string } {
  const s = ensureSubject(state, name);
  if (!s) return { error: '과목명을 입력해 주세요.' };
  if (exam.subs.some((x) => x.subjectId === s.id)) return { error: '이미 등록된 과목입니다.' };
  const es: SubPlacement = {
    id: uid(), subjectId: s.id, examDate: examDate && examDays(exam).includes(examDate) ? examDate : null,
    range: '', comment: '', links: [], plan: cleanPlan(state.defPlan),
  };
  exam.subs.push(es);
  syncTasks(exam, es);
  return { sub: es };
}
export function removeSub(exam: Exam, esId: string): void {
  exam.subs = exam.subs.filter((s) => s.id !== esId);
  exam.tasks = exam.tasks.filter((t) => t.esId !== esId);
}
export function setSubDate(exam: Exam, es: SubPlacement, iso: string | null | undefined): boolean {
  if (iso && !examDays(exam).includes(iso)) return false;
  es.examDate = iso || null;
  return true;
}
export function normalizeLink(url: unknown): string | null {
  let u = String(url || '').trim();
  if (!u) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  try {
    const p = new URL(u);
    if (p.protocol !== 'http:' && p.protocol !== 'https:') return null;
    return p.href;
  } catch (e) {
    return null;
  }
}

export const planTotals = (plan: Plan): { study: number; recap: number } => ({ study: plan.n + plan.m, recap: plan.r });

export function syncTasks(exam: Exam, es: SubPlacement): void {
  const targets: [TaskType, number][] = [['s', es.plan.n + es.plan.m], ['r', es.plan.r]];
  for (const [type, target] of targets) {
    const list = exam.tasks.filter((t) => t.esId === es.id && t.type === type).sort((a, b) => a.seq - b.seq);
    while (list.length > target) {
      let idx = -1;
      for (let i = list.length - 1; i >= 0; i--) if (!list[i].date) { idx = i; break; }
      if (idx < 0) idx = list.length - 1;
      const rm = list.splice(idx, 1)[0];
      exam.tasks.splice(exam.tasks.indexOf(rm), 1);
    }
    list.forEach((t, i) => { t.seq = i + 1; });
    while (list.length < target) {
      const t: Task = { id: uid(), esId: es.id, type, seq: list.length + 1, date: null, done: false };
      list.push(t);
      exam.tasks.push(t);
    }
  }
}
/* 분량을 줄일 때 배치된 할일이 몇 개 사라지는지 미리 센다. */
export function previewPlanChange(exam: Exam, es: SubPlacement, plan: Plan): number {
  let lost = 0;
  const pairs: [TaskType, number][] = [['s', plan.n + plan.m], ['r', plan.r]];
  for (const [type, target] of pairs) {
    const list = exam.tasks.filter((t) => t.esId === es.id && t.type === type);
    const surplus = Math.max(0, list.length - target);
    const unplaced = list.filter((t) => !t.date).length;
    lost += Math.max(0, surplus - unplaced);
  }
  return lost;
}
export function setPlan(exam: Exam, es: SubPlacement, plan: Record<'n' | 'm' | 'r', unknown>): void {
  es.plan = { n: clampInt(plan.n, 0, MAX_COUNT), m: clampInt(plan.m, 0, MAX_COUNT), r: clampInt(plan.r, 0, MAX_COUNT) };
  syncTasks(exam, es);
}

export function taskLabel(state: State, exam: Exam, t: Task): string {
  const es = exam.subs.find((s) => s.id === t.esId);
  if (!es) return '';
  const name = subjectOf(state, es).name;
  if (t.type === 'r') return name + ' 리캡 ' + t.seq + '/' + es.plan.r;
  return name + ' ' + t.seq + '/' + (es.plan.n + es.plan.m);
}
export function taskKind(exam: Exam, t: Task): string {
  const es = exam.subs.find((s) => s.id === t.esId);
  if (!es) return '';
  if (t.type === 'r') return '리캡';
  return t.seq <= es.plan.n ? '교재' : '문제집';
}

/* ---------- 날짜별 설정과 배치 ---------- */
export function isHoliday(exam: Exam, iso: string): boolean {
  const d = exam.days[iso];
  if (d && typeof d.holiday === 'boolean') return d.holiday;
  return !!HOLIDAYS[iso];
}
export function holidayName(exam: Exam, iso: string): string {
  if (!isHoliday(exam, iso)) return '';
  return HOLIDAYS[iso] || '휴일';
}
export function defaultLevel(exam: Exam, iso: string): LevelKey {
  const w = weekday(iso);
  if (isHoliday(exam, iso)) return 'calm';
  if (exam.week && isLevel(exam.week[w])) return exam.week[w] as LevelKey;
  return w === 0 || w === 6 ? 'calm' : 'normal';
}
export function levelOf(exam: Exam, iso: string): LevelKey {
  const d = exam.days[iso];
  return d && isLevel(d.level) ? d.level : defaultLevel(exam, iso);
}
function tidyDay(exam: Exam, iso: string): void {
  const d = exam.days[iso];
  if (d && !d.level && !d.note && typeof d.holiday !== 'boolean') delete exam.days[iso];
}
export function setDayLevel(exam: Exam, dates: string[], level: unknown): void {
  dates.forEach((iso) => {
    if (level && !isLevel(level)) return;
    const d = exam.days[iso] || (exam.days[iso] = {});
    if (isLevel(level)) d.level = level; else delete d.level;
    tidyDay(exam, iso);
  });
}
export function setDayNote(exam: Exam, iso: string, text: unknown): void {
  const d = exam.days[iso] || (exam.days[iso] = {});
  const t = String(text || '').trim().slice(0, 60);
  if (t) d.note = t; else delete d.note;
  tidyDay(exam, iso);
}
/* holiday: true | false | null(기본값으로 되돌림) */
export function setHoliday(exam: Exam, iso: string, value: boolean | null | undefined): void {
  const d = exam.days[iso] || (exam.days[iso] = {});
  if (typeof value === 'boolean') d.holiday = value; else delete d.holiday;
  if (typeof d.holiday === 'boolean' && d.holiday === !!HOLIDAYS[iso]) delete d.holiday;
  tidyDay(exam, iso);
}

export function tasksByDate(exam: Exam): Record<string, Task[]> {
  const map: Record<string, Task[]> = {};
  exam.tasks.forEach((t) => { if (t.date) (map[t.date] || (map[t.date] = [])).push(t); });
  return map;
}
export function dayInfo(state: State, exam: Exam, iso: string, map?: Record<string, Task[]>): DayInfo {
  const list = (map || tasksByDate(exam))[iso] || [];
  const level = levelOf(exam, iso);
  const limit = state.limits[level];
  const count = list.length;
  const done = list.filter((t) => t.done).length;
  return { iso, level, limit, count, done, over: count > limit, ratio: limit > 0 ? count / limit : count > 0 ? 2 : 0 };
}
export function unplaced(exam: Exam): Task[] {
  return exam.tasks.filter((t) => !t.date);
}
export function moveTask(exam: Exam, id: string, iso: string | null): boolean {
  const t = exam.tasks.find((x) => x.id === id);
  if (!t) return false;
  if (iso === null) { t.date = null; return true; }
  if (!prepDays(exam).includes(iso)) return false;
  t.date = iso;
  normalizeOrder(exam);
  return true;
}
/* 순서 자동정리: 과목별로 배치된 회차를 날짜순으로 다시 번호 매긴다.
   배치된 것들이 차지한 번호 칸만 날짜순으로 재배정하고, 미배치 회차의 번호는 건드리지 않는다. */
export function normalizeOrder(exam: Exam): void {
  exam.subs.forEach((es) => {
    ['s', 'r'].forEach((type) => {
      const dated = exam.tasks.filter((t) => t.esId === es.id && t.type === type && t.date);
      if (dated.length < 2) return;
      const slots = dated.map((t) => t.seq).sort((a, b) => a - b);
      dated.slice().sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? -1 : (a.date ?? '') > (b.date ?? '') ? 1 : a.seq - b.seq))
        .forEach((t, i) => { t.seq = slots[i]; });
    });
  });
}
export function toggleDone(exam: Exam, id: string): boolean | null {
  const t = exam.tasks.find((x) => x.id === id);
  if (!t) return null;
  t.done = !t.done;
  return t.done;
}
export function overdue(exam: Exam, today: string): Task[] {
  return exam.tasks.filter((t) => t.date && t.date < today && !t.done).sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? -1 : (a.date ?? '') > (b.date ?? '') ? 1 : a.seq - b.seq));
}
export function carryOver(exam: Exam, today: string): { moved: number; target: string | null } {
  if (today > exam.end) return { moved: 0, target: null };
  const target = today < exam.prepStart ? exam.prepStart : today;
  const list = overdue(exam, target);
  list.forEach((t) => { t.date = target; });
  normalizeOrder(exam);
  return { moved: list.length, target };
}

/* 시험 직전 리캡 일괄 추가: 과목별 미배치 리캡을 시험일 전 n일 안에 고르게 배치한다. */
export function recapBatch(state: State, exam: Exam, n: unknown, today?: string | null): { placed: number; skipped: number; hasRecap: boolean } {
  const days = Math.max(1, clampInt(n, 1, 30));
  const map = tasksByDate(exam);
  let placed = 0, skipped = 0, hasRecap = false;
  const subs = exam.subs.slice().sort((a, b) => ((a.examDate || exam.start) < (b.examDate || exam.start) ? -1 : 1));
  subs.forEach((es) => {
    const todo = exam.tasks.filter((t) => t.esId === es.id && t.type === 'r' && !t.date).sort((a, b) => a.seq - b.seq);
    if (!todo.length) return;
    hasRecap = true;
    const end = es.examDate || exam.start;
    let lo = addDays(end, -days);
    if (lo < exam.prepStart) lo = exam.prepStart;
    if (today && today > lo) lo = today;
    const window = rangeDays(lo, addDays(end, -1));
    if (!window.length) { skipped += todo.length; return; }
    todo.forEach((t) => {
      let best: string | null = null, bestScore = Infinity;
      window.forEach((iso) => {
        const level = levelOf(exam, iso);
        const limit = Math.max(1, state.limits[level]);
        const score = ((map[iso] || []).length + 1) / limit;
        if (score < bestScore || score === bestScore) { best = iso; bestScore = score; }
      });
      t.date = best;
      const pick = best as unknown as string;
      (map[pick] || (map[pick] = [])).push(t);
      placed += 1;
    });
  });
  normalizeOrder(exam);
  return { placed, skipped, hasRecap };
}

export function progress(exam: Exam): { total: number; done: number } {
  const total = exam.tasks.length;
  return { total, done: exam.tasks.filter((t) => t.done).length };
}
export function subProgress(exam: Exam, es: SubPlacement): { total: number; done: number; placed: number } {
  const list = exam.tasks.filter((t) => t.esId === es.id);
  return { total: list.length, done: list.filter((t) => t.done).length, placed: list.filter((t) => t.date).length };
}

/* 시험 날짜를 바꿀 때의 영향. 실제로 적용하지 않고 숫자만 센다. */
export interface ExamFieldsPreview {
  ok: boolean;
  error?: string;
  unplacedTasks: number;
  removedDays: number;
  removedDayNotes: number;
  changedSubDates: number;
}

/* updateExamFields 를 깊은 복사본에 적용해 영향만 계산한다. state 와 exam 은 바꾸지 않는다.
   _state 는 호출부와 시그니처를 맞추려고 받을 뿐 계산에는 쓰지 않는다. */
export function previewExamFields(_state: State, exam: Exam, fields: ExamFields): ExamFieldsPreview {
  const none = { unplacedTasks: 0, removedDays: 0, removedDayNotes: 0, changedSubDates: 0 };
  const err = validateExamFields(fields);
  if (err) return { ok: false, error: err, ...none };
  const copy: Exam = structuredClone(exam);
  const res = updateExamFields(copy, fields);
  if ('error' in res) return { ok: false, error: res.error, ...none };
  let removedDays = 0;
  let removedDayNotes = 0;
  Object.keys(exam.days).forEach((k) => {
    if (k in copy.days) return;
    removedDays += 1;
    const d = exam.days[k];
    if (d.note || typeof d.holiday === 'boolean') removedDayNotes += 1;
  });
  let changedSubDates = 0;
  exam.subs.forEach((s, i) => {
    if (s.examDate && copy.subs[i].examDate === null) changedSubDates += 1;
  });
  return { ok: true, unplacedTasks: res.unplaced, removedDays, removedDayNotes, changedSubDates };
}

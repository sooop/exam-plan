import type { DaySetting, Exam, Link, State } from './types';
import { LEGACY_LEVELS, LEVEL_KEYS, DEFAULT_LIMITS, MAX_COUNT, MAX_DAYS, MAX_TEXT, PALETTE } from './constants';
import { diffDays, isISO } from './dates';
import { clampInt, isLevel, nameKey, normName, uid } from './util';
import { cleanPlan, cleanWeek, examDays, findSubject, newState, normalizeLink, prepDays, syncTasks } from './planner';

/* 원본 저장본은 임의의 JSON 이므로 느슨한 타입으로 받고, 아래에서 하나씩 검증한다. */
type Loose = Record<string, any>;

/* ---------- 정리와 검증 (저장소, 가져오기, 서버에서 읽은 값) ---------- */
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
/*
 * id 규칙(이 파일의 모든 id 가 여기서만 정해진다): 저장하는 id 는 ID_MAX 자로 자른 값 하나뿐이다.
 * 참조 검사(시험 안 과목의 subjectId, 배치의 esId, 활성 시험 activeId)도 같은 자른 값으로 한다.
 * 자른 뒤 같은 값이 되면 뒤의 항목을 버린다(중복 검사도 자른 값으로 한다).
 */
export const ID_MAX = 40;
const idOf = (v: unknown): string | null => (typeof v === 'string' ? v.slice(0, ID_MAX) : null);

/** sanitizeState 가 버린 항목의 종류. link 는 주소가 안전하지 않거나 과목당 한도(20개)를 넘은 링크 */
export type DropKind = 'exam' | 'sub' | 'task' | 'library' | 'link';
export interface SanitizeOptions {
  /** 버린 항목마다 한 번씩 불린다(n 은 1). 생략하면 아무 일도 하지 않는다. 반환·정리 결과에는 영향이 없다. */
  onDrop?: (kind: DropKind, n: number) => void;
}

export function sanitizeState(input: unknown, opts: SanitizeOptions = {}): State | null {
  const raw = input as Loose;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.exams) || !Array.isArray(raw.library)) return null;
  const drop = (kind: DropKind): void => opts.onDrop?.(kind, 1);
  const isObj = (v: unknown): v is Loose => !!v && typeof v === 'object';
  const st = newState();
  const legacy = !(Number(raw.v) >= 2);
  const lvKey = (k: unknown): unknown => (legacy ? (LEGACY_LEVELS as Record<string, unknown>)[k as string] : k);
  const rawLimits: Record<string, unknown> = {};
  if (raw.limits && typeof raw.limits === 'object') Object.keys(raw.limits).forEach((k) => { if (lvKey(k)) rawLimits[String(lvKey(k))] = raw.limits[k]; });
  LEVEL_KEYS.forEach((k) => { st.limits[k] = clampInt(rawLimits[k] != null ? rawLimits[k] : DEFAULT_LIMITS[k], 0, 20); });
  if (Number(raw.v) === 2 && st.limits.calm === 5) st.limits.calm = DEFAULT_LIMITS.calm; /* v2 기본값 5였던 한가한 날 한도를 상향 */
  st.recapDays = clampInt(raw.recapDays != null ? raw.recapDays : 7, 1, 30);
  st.updatedAt = Number(raw.updatedAt) || 0;
  const settingsAt = Number(raw.settingsAt);
  if (Number.isFinite(settingsAt) && settingsAt > 0) st.settingsAt = Math.floor(settingsAt); /* 선택 필드: 없으면 없는 채로 */
  st.week = cleanWeek(raw.week);
  st.defPlan = cleanPlan(raw.defPlan);
  const libIds = new Set<string>();
  raw.library.forEach((s) => {
    const id = isObj(s) ? idOf(s.id) : null;
    if (id === null || libIds.has(id)) { drop('library'); return; }
    const name = normName(str(s.name, 40));
    if (!name || st.library.some((x) => nameKey(x.name) === nameKey(name))) { drop('library'); return; }
    libIds.add(id);
    st.library.push({ id, name, color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : PALETTE[st.library.length % PALETTE.length] });
  });
  const examIds = new Set<string>();
  raw.exams.forEach((e) => {
    const id = isObj(e) ? idOf(e.id) : null;
    if (id === null || examIds.has(id)) { drop('exam'); return; }
    if (!isISO(e.start) || !isISO(e.end) || !isISO(e.prepStart) || e.end < e.start || e.prepStart > e.end) { drop('exam'); return; }
    if (diffDays(e.prepStart, e.end) + 1 > MAX_DAYS) { drop('exam'); return; }
    const name = normName(str(e.name, 60));
    if (!name) { drop('exam'); return; }
    examIds.add(id);
    const ex: Exam = { id, name, start: e.start, end: e.end, prepStart: e.prepStart, subs: [], tasks: [], days: {}, week: cleanWeek(e.week) };
    const at = Number(e.at);
    if (Number.isFinite(at) && at > 0) ex.at = Math.floor(at); /* 선택 필드: 없으면 없는 채로 */
    const eDays = examDays(ex);
    const esIds = new Set<string>();
    (Array.isArray(e.subs) ? e.subs : []).forEach((s: Loose) => {
      const sid = isObj(s) ? idOf(s.id) : null;
      const subjectId = isObj(s) ? idOf(s.subjectId) : null;
      if (sid === null || subjectId === null || esIds.has(sid) || !libIds.has(subjectId)) { drop('sub'); return; }
      if (ex.subs.some((x) => x.subjectId === subjectId)) { drop('sub'); return; }
      esIds.add(sid);
      const links: Link[] = [];
      (Array.isArray(s.links) ? s.links : []).forEach((l: Loose, i: number) => {
        const href = i < 20 && isObj(l) ? normalizeLink(l.url) : null;
        if (href) links.push({ label: str(l.label, 60), url: href });
        else drop('link');
      });
      const p = s.plan || {};
      ex.subs.push({
        id: sid, subjectId, examDate: eDays.includes(s.examDate) ? s.examDate : null,
        range: str(s.range, MAX_TEXT), comment: str(s.comment, MAX_TEXT), links,
        plan: { n: clampInt(p.n, 0, MAX_COUNT), m: clampInt(p.m, 0, MAX_COUNT), r: clampInt(p.r, 0, MAX_COUNT) },
      });
    });
    const pDays = new Set(prepDays(ex));
    const taskIds = new Set<string>();
    (Array.isArray(e.tasks) ? e.tasks : []).forEach((t: Loose) => {
      const tid = isObj(t) ? idOf(t.id) : null;
      const esId = isObj(t) ? idOf(t.esId) : null;
      if (tid === null || esId === null || taskIds.has(tid) || !esIds.has(esId)) { drop('task'); return; }
      if (t.type !== 's' && t.type !== 'r') { drop('task'); return; }
      taskIds.add(tid);
      ex.tasks.push({ id: tid, esId, type: t.type, seq: clampInt(t.seq, 1, MAX_COUNT * 2), date: pDays.has(t.date) ? t.date : null, done: !!t.done });
    });
    if (e.days && typeof e.days === 'object') {
      Object.keys(e.days).forEach((k) => {
        if (!pDays.has(k) || !e.days[k] || typeof e.days[k] !== 'object') return;
        const d = e.days[k], out: DaySetting = {};
        const lv = lvKey(d.level);
        if (isLevel(lv)) out.level = lv;
        const note = str(d.note, 60).trim();
        if (note) out.note = note;
        if (typeof d.holiday === 'boolean') out.holiday = d.holiday;
        if (Object.keys(out).length) ex.days[k] = out;
      });
    }
    ex.subs.forEach((es) => { // 개수가 어긋난 저장본을 분량에 맞춘다. 줄어든 만큼은 버린 할일로 센다(늘린 것은 세지 않는다)
      const before = ex.tasks.filter((t) => t.esId === es.id).length;
      syncTasks(ex, es);
      const after = ex.tasks.filter((t) => t.esId === es.id).length;
      for (let k = after; k < before; k++) drop('task');
    });
    st.exams.push(ex);
  });
  const activeId = idOf(raw.activeId);
  st.activeId = st.exams.some((e) => e.id === activeId) ? activeId : st.exams.length ? st.exams[0].id : null;
  return st;
}

export function exportPayload(state: State): { app: string; version: number; exportedAt: string; state: State } {
  return { app: 'exam-planner', version: 1, exportedAt: new Date().toISOString(), state };
}
/** 가져올 때 정리 단계에서 버린 항목 수. exams 는 시험 단위(skipped 와 같다), 나머지는 시험 안이나 과목 목록의 항목 수 */
export interface SkippedDetail { exams: number; subs: number; tasks: number; library: number }
export type MergeResult = { error: string } | { added: number; dup: number; skipped: number; skippedDetail?: SkippedDetail };

/**
 * 가져온 시험을 합친다. 같은 id의 시험은 건너뛴다.
 * skipped 는 입력 시험 수 - (추가 + 중복), 즉 정리 단계에서 버려진 시험 수다.
 * skippedDetail 은 버려진 항목이 하나라도 있을 때만 붙는다(없으면 기존 모양 그대로 둔다).
 */
export function importMerge(state: State, payload: Loose | null | undefined): MergeResult {
  if (!payload || payload.app !== 'exam-planner') return { error: 'format' };
  const dropped: SkippedDetail = { exams: 0, subs: 0, tasks: 0, library: 0 };
  const incoming = sanitizeState(payload.state, {
    onDrop: (kind, n) => {
      if (kind === 'exam') dropped.exams += n;
      else if (kind === 'sub') dropped.subs += n;
      else if (kind === 'task') dropped.tasks += n;
      else if (kind === 'library') dropped.library += n;
    },
  });
  if (!incoming) return { error: 'format' };
  const rawExams = (payload.state.exams as unknown[]).length;
  const idMap: Record<string, string> = {};
  incoming.library.forEach((s) => {
    const mine = findSubject(state, s.name);
    if (mine) idMap[s.id] = mine.id;
    else {
      const added = { id: state.library.some((x) => x.id === s.id) ? uid() : s.id, name: s.name, color: s.color };
      state.library.push(added);
      idMap[s.id] = added.id;
    }
  });
  let added = 0, dup = 0;
  incoming.exams.forEach((e) => {
    if (state.exams.some((x) => x.id === e.id)) { dup += 1; return; }
    e.subs.forEach((s) => { s.subjectId = idMap[s.subjectId]; });
    state.exams.push(e);
    added += 1;
  });
  if (!state.activeId && state.exams.length) state.activeId = state.exams[0].id;
  const skipped = Math.max(0, rawExams - added - dup);
  const any = dropped.exams + dropped.subs + dropped.tasks + dropped.library > 0;
  return any ? { added, dup, skipped, skippedDetail: dropped } : { added, dup, skipped };
}

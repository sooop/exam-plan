// 변경 이력의 순수 로직(DOM·IndexedDB 비의존). 시험은 tests/history. 정책 상수는 README.md 에도 적는다.
import type { State } from '../core/types';
import { RESTORED_SUFFIX } from './texts';

// ───────── 정책 상수 ─────────
/** 자동·before-* 스냅샷의 최대 개수(핀 제외). 개수·기간 중 먼저 오는 한도를 따른다 */
export const AUTO_KEEP_COUNT = 30;
/** 자동·before-* 스냅샷의 최대 보관 일수(핀 제외) */
export const AUTO_KEEP_DAYS = 90;
/** 직전 자동 스냅샷이 이 시간 안이면 새로 쌓지 않고 갈아 끼운다(타이핑 중간 상태 방지) */
export const AUTO_MERGE_MS = 2 * 60 * 1000;
/** 동기화 전 스냅샷이 이 시간 안에 또 요청되면 앞의 것(더 옛 상태)을 두고 건너뛴다 */
export const SYNC_COALESCE_MS = 30 * 1000;
/** 작업 기록 최대 건수 */
export const LOG_MAX = 500;
/** 같은 label·종류의 작업 기록이 이 간격 안에 이어지면 한 건으로 합친다 */
export const LOG_MERGE_MS = 10 * 1000;
/** 스냅샷 이름 최대 글자 수 */
export const LABEL_MAX = 60;
/** 스냅샷 목록의 첫 표시 개수(넘으면 '더 보기') */
export const LIST_PAGE = 50;

export const DAY_MS = 24 * 60 * 60 * 1000;

// ───────── 타입 ─────────
export type SnapshotKind = 'auto' | 'manual' | 'before-big' | 'before-sync' | 'before-restore' | 'sync-loser';
export type LogKind = 'local' | 'sync-received' | 'restore';

export interface Counts { exams: number; tasks: number; subs: number; library: number }

/** 압축한 본문. enc 'gzip' 은 gzip, 'raw' 는 무압축 UTF-8 */
export interface Packed { enc: 'gzip' | 'raw'; data: Uint8Array }

/** 저장 형식 */
export interface SnapshotRecord {
  id: string;
  at: number;
  kind: SnapshotKind;
  label: string;
  device: string;
  pinned: boolean;
  /** 내용 해시(상태는 updatedAt·activeId 제외, sync-loser 는 시험 JSON) */
  hash: string;
  counts: Counts;
  /** 저장된 본문 크기(압축 뒤 바이트) */
  bytes: number;
  /** 전체 상태(sync-loser 에는 없다) */
  state?: Packed;
  /** 진 시험 하나(sync-loser 에만 있다. 검증 전 원격 데이터일 수 있다) */
  exam?: unknown;
  /** 진 설정 값 {limits, defPlan, recapDays, week}(sync-loser 중 설정 충돌의 패자에만 있다. 검증 전 원격 데이터일 수 있다) */
  settings?: unknown;
  /** sync-loser 가 시험이 아니라 설정이면 'settings'. 목록 화면이 단추·확인 문구를 고를 때 쓴다 */
  subject?: 'settings';
}

/** 화면·목록용: 본문 없이 */
export type SnapshotMeta = Omit<SnapshotRecord, 'state' | 'exam' | 'settings'>;

export interface LogEntry {
  id: string;
  /** 마지막으로 합쳐진 시각 */
  at: number;
  device: string;
  label: string;
  kind: LogKind;
  /** 합쳐진 변경 횟수(1 이상) */
  count: number;
}

export const metaOf = (r: SnapshotRecord): SnapshotMeta => {
  const { state: _s, exam: _e, settings: _g, ...meta } = r;
  void _s; void _e; void _g;
  return meta;
};

/** 목록 정렬: 최신 먼저 */
export const byNewest = <T extends { at: number; id: string }>(a: T, b: T): number => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export const isLimitedKind = (k: SnapshotKind): boolean => k === 'auto' || k === 'before-big' || k === 'before-sync' || k === 'before-restore';
export const isStateKind = (k: SnapshotKind): boolean => k !== 'sync-loser';

// ───────── 직렬화·해시 ─────────
/** 53비트 문자열 해시(cyrb53). 같은 내용 판정용이며 보안용이 아니다 */
export function hashText(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export interface Serialized { json: string; hash: string; counts: Counts }

/**
 * 상태를 저장용 JSON 으로. 해시는 updatedAt·activeId 와 동기화 시각 표지(시험 at·settingsAt)를 뺀 내용 기준
 * (활성 시험만 바뀌었거나 같은 내용을 다시 복원해 시각만 달라진 것은 같은 내용)
 */
export function contentHash(state: State): string {
  return hashText(JSON.stringify({ ...state, updatedAt: 0, activeId: null, settingsAt: undefined, exams: state.exams.map((e) => ({ ...e, at: undefined })) }));
}

export function serializeState(state: State): Serialized {
  return { json: JSON.stringify(state), hash: contentHash(state), counts: countsOfState(state) };
}

export function countsOfState(s: State): Counts {
  let tasks = 0, subs = 0;
  for (const e of s.exams) { tasks += e.tasks.length; subs += e.subs.length; }
  return { exams: s.exams.length, tasks, subs, library: s.library.length };
}

/** 검증 전 시험(원격 데이터일 수 있다)의 개수. 모양이 틀려도 던지지 않는다 */
export function countsOfExam(exam: unknown): Counts {
  const e = (exam && typeof exam === 'object' ? exam : {}) as { tasks?: unknown; subs?: unknown };
  return {
    exams: 1,
    tasks: Array.isArray(e.tasks) ? e.tasks.length : 0,
    subs: Array.isArray(e.subs) ? e.subs.length : 0,
    library: 0,
  };
}

export function examNameOf(exam: unknown): string {
  const n = (exam as { name?: unknown } | null)?.name;
  return typeof n === 'string' ? n.trim().slice(0, 60) : '';
}

export const clipLabel = (s: unknown, fallback: string): string => {
  const t = typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '';
  return Array.from(t || fallback).slice(0, LABEL_MAX).join('');
};

// ───────── ID ─────────
/** 시각 + 순번 + 난수로 정렬 가능하고 겹치지 않는 문자열 id */
export function makeId(prefix: string, at: number, seq: number, rnd: string): string {
  return `${prefix}${String(Math.max(0, Math.floor(at))).padStart(13, '0')}-${String(seq % 10000).padStart(4, '0')}${rnd}`;
}

// ───────── 스냅샷 추가 결정 ─────────
export interface Candidate { kind: SnapshotKind; hash: string; at: number; label: string }
export type AddDecision =
  | { action: 'add' }
  /** 직전 자동 스냅샷을 이 내용으로 갈아 끼운다(id 는 유지) */
  | { action: 'replace'; id: string }
  /** 같은 내용이 이미 있다: 그 항목을 최신으로 올리고(필요하면 수동으로 승격) 새로 쌓지 않는다 */
  | { action: 'touch'; id: string; promote: boolean }
  | { action: 'skip'; reason: 'coalesced' };

/**
 * 새 스냅샷을 어떻게 다룰지 정한다. existing 은 지금 있는 목록(순서 무관).
 * 1) before-sync 가 짧은 간격으로 또 오면 건너뛴다(앞의 것이 더 옛 상태라 가치가 크다).
 * 2) 같은 내용(해시)이 이미 있으면 한 건으로 합친다. 수동 요청이면 자동류를 수동으로 올린다.
 * 3) 직전(가장 최신) 항목이 같은 종류의 자동이고 고정되지 않았고 AUTO_MERGE_MS 안이면 갈아 끼운다.
 */
export function decideAdd(existing: readonly SnapshotMeta[], c: Candidate): AddDecision {
  if (c.kind === 'before-sync') {
    const recent = existing.some((r) => r.kind === 'before-sync' && c.at - r.at >= 0 && c.at - r.at < SYNC_COALESCE_MS);
    if (recent) return { action: 'skip', reason: 'coalesced' };
  }
  const group = isStateKind(c.kind);
  const same = existing.filter((r) => r.hash === c.hash && isStateKind(r.kind) === group).sort(byNewest)[0];
  if (same) return { action: 'touch', id: same.id, promote: c.kind === 'manual' && same.kind !== 'manual' };
  if (c.kind === 'auto') {
    const latest = [...existing].sort(byNewest)[0];
    if (latest && latest.kind === 'auto' && !latest.pinned && c.at - latest.at >= 0 && c.at - latest.at < AUTO_MERGE_MS) {
      return { action: 'replace', id: latest.id };
    }
  }
  return { action: 'add' };
}

// ───────── 보관 정책 ─────────
export interface RetentionOptions { keepCount?: number; keepDays?: number }

/**
 * 자동 정리 대상 id. 자동·before-* 중 핀이 아닌 것만 본다: 최신순 keepCount 개를 넘거나 keepDays 일보다 오래되면 정리.
 * manual·sync-loser·핀은 어떤 경우에도 대상이 아니다.
 */
export function planRetention(list: readonly SnapshotMeta[], now: number, o: RetentionOptions = {}): string[] {
  const keepCount = o.keepCount ?? AUTO_KEEP_COUNT;
  const maxAge = (o.keepDays ?? AUTO_KEEP_DAYS) * DAY_MS;
  const limited = list.filter((r) => isLimitedKind(r.kind) && !r.pinned).sort(byNewest);
  return limited.filter((r, i) => i >= keepCount || now - r.at > maxAge).map((r) => r.id);
}

// ───────── 작업 기록 ─────────
export interface LogInput { at: number; device: string; label: string; kind: LogKind }
export interface LogResult {
  /** 오래된 것이 앞 */
  log: LogEntry[];
  /** 새로 쓰거나 갱신해 저장해야 할 항목 */
  written: LogEntry;
  removedIds: string[];
}

/**
 * 작업 기록에 한 건 더한다(log 는 오래된 것이 앞). 같은 기기·label·종류가 LOG_MERGE_MS 안에 이어지면 마지막 항목에 합친다
 * (at 은 최신으로, count 증가). 상한 LOG_MAX 를 넘으면 가장 오래된 것부터 버린다. 입력 배열은 바꾸지 않는다.
 */
export function appendLog(log: readonly LogEntry[], input: LogInput, newId: () => string, opts: { max?: number; mergeMs?: number } = {}): LogResult {
  const max = opts.max ?? LOG_MAX;
  const mergeMs = opts.mergeMs ?? LOG_MERGE_MS;
  const last = log[log.length - 1];
  if (last && last.kind === input.kind && last.label === input.label && last.device === input.device && input.at - last.at >= 0 && input.at - last.at <= mergeMs) {
    const merged: LogEntry = { ...last, at: input.at, count: last.count + 1 };
    return { log: [...log.slice(0, -1), merged], written: merged, removedIds: [] };
  }
  const entry: LogEntry = { id: newId(), at: input.at, device: input.device, label: input.label, kind: input.kind, count: 1 };
  const next = [...log, entry];
  const removedIds = next.splice(0, Math.max(0, next.length - max)).map((e) => e.id);
  return { log: next, written: entry, removedIds };
}

// ───────── 복원 ─────────
export const RESTORE_KEYS = ['v', 'limits', 'recapDays', 'week', 'defPlan', 'library', 'exams'] as const;

/**
 * 진 시험을 새 id 의 시험으로 되살릴 후보 상태를 만든다(순수, 입력 불변). 과목·할일 id 도 새로 만들어 기존 시험과 겹치지 않게 한다.
 * 이름에는 ' (복원)' 을 붙인다(60자 안으로 줄임). 라이브러리에 없는 과목은 자리 표시 항목을 더해 과목이 버려지지 않게 한다.
 * 반환 state 는 아직 검증 전이므로 호출자가 sanitizeState 를 거쳐야 한다. 모양이 틀린 입력은 null.
 */
export function examAsRestored(exam: unknown, current: State, newId: () => string): { examId: string; state: unknown } | null {
  if (!exam || typeof exam !== 'object' || Array.isArray(exam)) return null;
  const src = exam as Record<string, unknown>;
  const name = typeof src.name === 'string' ? src.name.trim() : '';
  if (!name) return null;
  const room = 60 - Array.from(RESTORED_SUFFIX).length;
  const subs = Array.isArray(src.subs) ? (src.subs as Record<string, unknown>[]) : [];
  const tasks = Array.isArray(src.tasks) ? (src.tasks as Record<string, unknown>[]) : [];
  const idMap = new Map<string, string>();
  const newSubs = subs.map((s): Record<string, unknown> => {
    const id = newId();
    if (s && typeof s.id === 'string') idMap.set(s.id, id);
    return { ...s, id };
  });
  const newTasks = tasks.map((t) => ({ ...t, id: newId(), esId: t && typeof t.esId === 'string' ? (idMap.get(t.esId) ?? t.esId) : t?.esId }));
  const library: { id: string; name: string; color: string }[] = current.library.map((l) => ({ ...l }));
  let n = 0;
  for (const s of newSubs) {
    const sid = typeof s.subjectId === 'string' ? s.subjectId : null;
    if (sid && !library.some((l) => l.id === sid)) library.push({ id: sid, name: `복원된 과목 ${++n}`, color: '' });
  }
  const examId = newId();
  const candidate = { ...src, id: examId, name: Array.from(name).slice(0, room).join('') + RESTORED_SUFFIX, subs: newSubs, tasks: newTasks };
  return { examId, state: { ...JSON.parse(JSON.stringify(current)), library, exams: [...current.exams.map((e) => JSON.parse(JSON.stringify(e))), candidate] } };
}

// ───────── 표시 ─────────
const pad2 = (n: number) => String(n).padStart(2, '0');
const hm = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** 오늘은 '오늘 14:20', 어제는 '어제 14:20', 올해는 '3월 5일 14:20', 그 전은 '2025년 3월 5일 14:20' */
export function formatWhen(at: number, now: number): string {
  const d = new Date(at), n = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / DAY_MS);
  if (diff === 0) return `오늘 ${hm(d)}`;
  if (diff === 1) return `어제 ${hm(d)}`;
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일 ${hm(d)}`;
  return d.getFullYear() === n.getFullYear() ? md : `${d.getFullYear()}년 ${md}`;
}

export function formatBytes(b: number): string {
  if (!(b > 0)) return '0B';
  if (b < 1024) return `${Math.round(b)}B`;
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}

/** '오늘 14:20 · 시험 2 · 할일 48 · 18KB' (sync-loser 는 시험 수를 빼고 할일만) */
export function summaryLine(m: Pick<SnapshotMeta, 'at' | 'kind' | 'counts' | 'bytes'>, now: number): string {
  const parts = [formatWhen(m.at, now)];
  if (m.kind !== 'sync-loser') parts.push(`시험 ${m.counts.exams}`);
  parts.push(`할일 ${m.counts.tasks}`, formatBytes(m.bytes));
  return parts.join(' · ');
}

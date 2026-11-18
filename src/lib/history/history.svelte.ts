// 변경 이력: 스냅샷(되돌릴 수 있는 시점)·작업 기록(누가·언제·무엇을)·충돌에서 진 시험의 보존.
// 이 기기의 IndexedDB 에만 두고 서버에는 올리지 않는다. 순수 판단은 core.ts, 저장은 db.ts, 압축은 pack.ts. 사용법은 README.md.
// 세션 단위 실행 취소·다시 실행은 app 에 이미 있다(app.undo/redo). 이 모듈은 그 결과도 작업 기록에 남긴다.
import type { App, AppHooks, CommitInfo } from '../app/app.svelte';
import { cloneState, countRawExams, keepActiveId } from '../app/appCore';
import { sanitizeState } from '../core/sanitize';
import type { State } from '../core/types';
import { uid } from '../core/util';
import { getDeviceName } from '../sync/device';
import { toast } from '../ui/toast.svelte';
import {
  AUTO_KEEP_COUNT, AUTO_KEEP_DAYS, appendLog, byNewest, clipLabel, contentHash, countsOfExam, decideAdd, examAsRestored, examNameOf,
  formatWhen, hashText, makeId, metaOf, planRetention, RESTORE_KEYS, serializeState,
  type LogEntry, type LogKind, type Serialized, type SnapshotKind, type SnapshotMeta, type SnapshotRecord,
} from './core';
import { createHistoryDb, type HistoryDb, type HistoryStatus } from './db';
import { pack, unpack } from './pack';
import { H } from './texts';

/** app.hooks 에 아직 없는 훅(제안). README 의 '필요한 app 변경' 참고. 없어도 connect 가 createSyncHost 를 감싸 같은 일을 한다 */
export interface RemoteHooks {
  /** 원격 변경을 상태에 반영하기 직전(applyRemote 안에서 상태를 바꾸기 전) */
  onBeforeRemote?(): void;
  /** 원격 반영이 끝났을 때(SyncHost.onApplied 와 같은 시점) */
  onRemoteApplied?(): void;
}

export interface HistoryOptions {
  /** 생략하면 전역 indexedDB, null 이면 메모리만 */
  indexedDB?: IDBFactory | null;
  now?: () => number;
  /** 작업 기록의 '누가'. 기본 getDeviceName */
  device?: () => string;
  timeoutMs?: number;
  /** 정리 알림을 이미 보여 줬는지 기억하는 곳(기본 localStorage, null 이면 이 세션만) */
  storage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null;
  /** false 면 토스트를 띄우지 않는다(시험용) */
  toast?: boolean;
  /** 작업 기록을 저장소에 쓰기 전 기다리는 시간 */
  logDebounceMs?: number;
}

export type AddAction = 'added' | 'replaced' | 'touched' | 'skipped';
export interface AddResult {
  action: AddAction;
  meta: SnapshotMeta | null;
  /** 저장소(IndexedDB)에 실제로 남았는가. 메모리 모드·쓰기 실패면 false */
  durable: boolean;
}

export type RestoreResult =
  | { ok: true; kind: 'state' | 'exam'; changed: boolean; preservedId: string | null; durable: boolean; examName?: string }
  | { ok: false; error: string };

const NOTICE_KEY = 'examPlanner.history.pruneNoticed';
const RESTORE_LABELS = new Set<string>([H.restoreLabel, H.restoreExamLabel, H.restoreSettingsLabel]);

function globalStorage(): HistoryOptions['storage'] {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export class HistoryStore {
  /** 스냅샷 목록(최신 먼저, 본문 없음). 반응형 */
  snapshots = $state<SnapshotMeta[]>([]);
  /** 작업 기록(최신 먼저). 반응형 */
  log = $state<LogEntry[]>([]);
  /** 저장 상태: ok 정상, memory IDB 불가(이 창에만 보관), failed 쓰기 실패(message 에 사유) */
  historyStatus = $state<HistoryStatus>({ state: 'idle' });
  /** 처음 목록을 읽었는가 */
  ready = $state(false);
  /** 자동 정리가 처음 일어났을 때의 알림(닫기 전까지 남는다) */
  pruneNotice = $state<{ count: number; at: number } | null>(null);

  readonly #opts: HistoryOptions;
  readonly #now: () => number;
  #db: HistoryDb;
  #app: App | null = null;
  #loadP: Promise<void> | null = null;
  #chain: Promise<unknown> = Promise.resolve();
  #seq = 0;
  readonly #rnd = Math.random().toString(36).slice(2, 4).padEnd(2, '0');
  #firstDone = false;
  #restoring = false;
  #wrap = 0;
  #logMem: LogEntry[] = []; // 오래된 것이 앞
  #logDirty = new Map<string, LogEntry>();
  #logRemoved: string[] = [];
  #logTimer: ReturnType<typeof setTimeout> | null = null;
  #noticeSeen = false;
  #undo: (() => void)[] = [];

  constructor(opts: HistoryOptions = {}) {
    this.#opts = opts;
    this.#now = opts.now ?? Date.now;
    this.#db = this.#newDb();
  }

  #newDb(): HistoryDb {
    return createHistoryDb({
      indexedDB: this.#opts.indexedDB,
      timeoutMs: this.#opts.timeoutMs,
      onStatus: (s) => { this.historyStatus = s; },
    });
  }

  #device(): string {
    try { return (this.#opts.device ?? getDeviceName)(); } catch { return ''; }
  }

  // ───────── 목록 ─────────
  /** 스냅샷 목록(최신 먼저). 반응형 배열을 그대로 돌려준다 */
  list(): SnapshotMeta[] { return this.snapshots; }

  #publish(): void {
    this.snapshots = this.#db.snapshots().sort(byNewest).map(metaOf);
  }
  #publishLog(): void {
    this.log = [...this.#logMem].reverse();
  }

  // ───────── 연결 ─────────
  /**
   * app 의 훅을 이 이력에 연결하고 저장된 이력을 읽는다. 같은 app 으로 다시 불러도 안전하다(같은 약속을 돌려준다).
   * 다른 app 으로 부르면 앞의 연결을 풀고 다시 연결한다. 앱 시작 때 app.init() 보다 먼저 부른다(동기화 시작 전에 감쌀 수 있게).
   */
  connect(app: App): Promise<void> {
    if (this.#app === app) return this.#ensureLoaded();
    if (this.#app) this.dispose();
    this.#app = app;
    this.#firstDone = false;
    this.#hook(app);
    return this.#ensureLoaded();
  }

  #ensureLoaded(): Promise<void> {
    return (this.#loadP ??= (async () => {
      this.#noticeSeen = this.#readNoticeSeen();
      await this.#db.load();
      this.#logMem = this.#db.log().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      this.#publish();
      this.#publishLog();
      this.ready = true;
    })());
  }

  #hook(app: App): void {
    const hooks = app.hooks as AppHooks & RemoteHooks;
    const prev = { c: hooks.onCommit, b: hooks.onBeforeBigChange, l: hooks.preserveLoserExam, s: hooks.preserveLoserSettings, r: hooks.onBeforeRemote, a: hooks.onRemoteApplied };
    const mine = {
      c: (info: CommitInfo) => { prev.c?.(info); this.#onCommit(info); },
      b: (label: string) => { prev.b?.(label); this.#onBeforeBig(label); },
      l: (item: { name: string; exam: unknown; at: number }) => { prev.l?.(item); this.#onLoser(item); },
      s: (item: { name: string; settings: unknown; at: number }) => { prev.s?.(item); this.#onLoserSettings(item); },
      r: () => { prev.r?.(); if (this.#wrap === 0) this.#beforeRemote(); },
      a: () => { prev.a?.(); if (this.#wrap === 0) this.#remoteApplied(); },
    };
    hooks.onCommit = mine.c;
    hooks.onBeforeBigChange = mine.b;
    hooks.preserveLoserExam = mine.l;
    hooks.preserveLoserSettings = mine.s;
    hooks.onBeforeRemote = mine.r;
    hooks.onRemoteApplied = mine.a;

    // app 이 위의 두 원격 훅을 아직 부르지 않아도 동작하게, 동기화 호스트를 감싼다. 훅이 생기면 #wrap 이 중복을 막는다
    const hadOwn = Object.prototype.hasOwnProperty.call(app, 'createSyncHost');
    const orig = app.createSyncHost;
    app.createSyncHost = () => {
      const h = orig.call(app);
      const guard = <R,>(f: () => R): R => { this.#wrap++; try { return f(); } finally { this.#wrap--; } };
      return {
        ...h,
        applyRemote: (m) => { this.#beforeRemote(); guard(() => h.applyRemote(m)); },
        onApplied: () => { guard(() => h.onApplied?.()); this.#remoteApplied(); },
      };
    };

    const onHide = () => { if (typeof document === 'undefined' || document.visibilityState !== 'visible') void this.flush(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', onHide);

    this.#undo.push(() => {
      if (hooks.onCommit === mine.c) hooks.onCommit = prev.c;
      if (hooks.onBeforeBigChange === mine.b) hooks.onBeforeBigChange = prev.b;
      if (hooks.preserveLoserExam === mine.l) hooks.preserveLoserExam = prev.l;
      if (hooks.preserveLoserSettings === mine.s) hooks.preserveLoserSettings = prev.s;
      if (hooks.onBeforeRemote === mine.r) hooks.onBeforeRemote = prev.r;
      if (hooks.onRemoteApplied === mine.a) hooks.onRemoteApplied = prev.a;
      if (hadOwn) app.createSyncHost = orig; else delete (app as unknown as { createSyncHost?: unknown }).createSyncHost;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide);
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', onHide);
    });
  }

  /** 훅·이벤트를 풀고 대기 중인 기록을 저장한 뒤 저장소 연결을 닫는다. 다시 connect 하면 처음부터 읽는다 */
  dispose(): void {
    this.#undo.splice(0).forEach((f) => f());
    this.#app = null;
    const db = this.#db, chain = this.#chain, put = [...this.#logDirty.values()], del = this.#logRemoved;
    if (this.#logTimer) { clearTimeout(this.#logTimer); this.#logTimer = null; }
    void chain.then(async () => {
      if (put.length) void db.putLog(put);
      if (del.length) void db.deleteLog(del);
      await db.idle();
    }).then(() => db.close(), () => db.close());
    this.#db = this.#newDb();
    this.#loadP = null;
    this.#chain = Promise.resolve();
    this.#logMem = [];
    this.#logDirty = new Map();
    this.#logRemoved = [];
    this.ready = false;
    this.snapshots = [];
    this.log = [];
    this.historyStatus = { state: 'idle' };
  }

  /** 다른 탭이 쓴 이력을 다시 읽는다(패널을 열 때) */
  async refresh(): Promise<void> {
    if (!this.#loadP) return;
    await this.#enqueue(async () => {
      await this.#flushLog();
      await this.#db.load();
      this.#logMem = this.#db.log().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      this.#publish();
      this.#publishLog();
    });
  }

  /** 대기 중인 모든 쓰기를 끝낸다(시험·페이지를 떠나기 전) */
  async flush(): Promise<void> {
    await this.#chain;
    await this.#flushLog();
  }

  async #flushLog(): Promise<void> {
    if (this.#logTimer) { clearTimeout(this.#logTimer); this.#logTimer = null; }
    const put = [...this.#logDirty.values()];
    const del = this.#logRemoved;
    this.#logDirty = new Map();
    this.#logRemoved = [];
    if (put.length) void this.#db.putLog(put);
    if (del.length) void this.#db.deleteLog(del);
    await this.#db.idle();
  }

  #enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = async () => { await this.#ensureLoaded(); return fn(); };
    const p = this.#chain.then(run, run);
    this.#chain = p.catch(() => undefined);
    return p;
  }

  // ───────── 스냅샷 만들기 ─────────
  /** 지금 상태를 직접 저장한다('지금 저장'). 같은 내용이 이미 있으면 그 항목을 수동으로 올린다 */
  createManual(label?: string): Promise<AddResult> {
    const app = this.#app;
    if (!app) return Promise.resolve({ action: 'skipped', meta: null, durable: false });
    return this.#snapshot(serializeState(app.state), 'manual', clipLabel(label, H.manualLabel));
  }

  #snapshot(ser: Serialized, kind: SnapshotKind, label: string, at = this.#now()): Promise<AddResult> {
    return this.#enqueue(() => this.#add(ser, kind, label, at));
  }

  async #add(ser: Serialized, kind: SnapshotKind, label: string, at: number): Promise<AddResult> {
    const metas = this.#db.snapshots().map(metaOf);
    const d = decideAdd(metas, { kind, hash: ser.hash, at, label });
    let result: AddResult;
    if (d.action === 'skip') return { action: 'skipped', meta: null, durable: true };
    if (d.action === 'touch') {
      const rec = this.#db.snapshot(d.id)!;
      const limited = rec.kind !== 'manual' && rec.kind !== 'sync-loser' && !rec.pinned;
      if (!d.promote && !limited) return { action: 'touched', meta: metaOf(rec), durable: this.#db.status.state !== 'memory' };
      const next: SnapshotRecord = { ...rec, at: limited || d.promote ? Math.max(rec.at, at) : rec.at, ...(d.promote ? { kind: 'manual' as const, label } : {}) };
      const durable = await this.#db.putSnapshot(next);
      result = { action: 'touched', meta: metaOf(next), durable };
    } else {
      const packed = await pack(ser.json);
      const base = d.action === 'replace' ? this.#db.snapshot(d.id) : undefined;
      const rec: SnapshotRecord = {
        id: base?.id ?? makeId('s-', at, this.#seq++, this.#rnd),
        at, kind, label, device: this.#device(), pinned: false, hash: ser.hash, counts: ser.counts, bytes: packed.data.length, state: packed,
      };
      const durable = await this.#db.putSnapshot(rec);
      result = { action: d.action === 'replace' ? 'replaced' : 'added', meta: metaOf(rec), durable };
    }
    await this.#prune();
    this.#publish();
    return result;
  }

  async #prune(): Promise<void> {
    const ids = planRetention(this.#db.snapshots().map(metaOf), this.#now());
    if (!ids.length) return;
    await this.#db.deleteSnapshots(ids);
    this.#notifyPruned(ids.length);
  }

  #readNoticeSeen(): boolean {
    const st = this.#opts.storage === undefined ? globalStorage() : this.#opts.storage;
    try { return st?.getItem(NOTICE_KEY) === '1'; } catch { return false; }
  }
  #notifyPruned(n: number): void {
    if (this.#noticeSeen) return;
    this.#noticeSeen = true;
    const st = this.#opts.storage === undefined ? globalStorage() : this.#opts.storage;
    try { st?.setItem(NOTICE_KEY, '1'); } catch { /* 기억하지 못하면 다음에 한 번 더 알린다 */ }
    this.pruneNotice = { count: n, at: this.#now() };
    if (this.#opts.toast !== false) toast.info(H.prunedNotice(n, AUTO_KEEP_COUNT, AUTO_KEEP_DAYS));
  }
  dismissPruneNotice(): void { this.pruneNotice = null; }

  // ───────── 훅 ─────────
  #onBeforeBig(label: string): void {
    const app = this.#app;
    if (!app || this.#restoring) return;
    this.#firstDone = true; // 큰 변경 직전 스냅샷이 '첫 변경 직전'을 겸한다
    void this.#snapshot(serializeState(app.state), 'before-big', clipLabel(label, H.autoLabel));
  }

  #beforeRemote(): void {
    const app = this.#app;
    if (!app) return;
    void this.#snapshot(serializeState(app.state), 'before-sync', H.beforeSyncLabel);
  }

  #remoteApplied(): void {
    this.#addLog('sync-received', H.syncReceivedLabel, this.#now());
  }

  #onLoser(item: { name: string; exam: unknown; at: number }): void {
    let exam: unknown;
    let json: string;
    try { json = JSON.stringify(item.exam); exam = JSON.parse(json); } catch { return; } // 직렬화할 수 없는 원격 데이터는 보존할 수 없다
    if (json === undefined) return;
    const name = examNameOf(exam);
    const label = clipLabel(name ? `${item.name} · ${name}` : item.name, H.kind['sync-loser']);
    const at = Number.isFinite(item.at) ? item.at : this.#now();
    void this.#enqueue(async () => {
      const hash = hashText(json);
      const d = decideAdd(this.#db.snapshots().map(metaOf), { kind: 'sync-loser', hash, at, label });
      if (d.action !== 'add') return;
      const rec: SnapshotRecord = {
        id: makeId('s-', at, this.#seq++, this.#rnd), at, kind: 'sync-loser', label, device: this.#device(), pinned: false, hash,
        counts: countsOfExam(exam), bytes: new TextEncoder().encode(json).length, exam,
      };
      await this.#db.putSnapshot(rec);
      this.#publish();
    });
  }

  /** 동기화 충돌에서 진 설정 값을 sync-loser 형태(설정 스냅샷)로 남긴다. 복원은 restore(id) 가 '설정으로 되돌리기'로 처리한다 */
  #onLoserSettings(item: { name: string; settings: unknown; at: number }): void {
    let settings: unknown;
    let json: string;
    try { json = JSON.stringify(item.settings); settings = JSON.parse(json); } catch { return; }
    if (json === undefined) return;
    const label = clipLabel(item.name, H.settingsLoserLabel);
    const at = Number.isFinite(item.at) && item.at > 0 ? item.at : this.#now();
    void this.#enqueue(async () => {
      const hash = hashText('settings:' + json);
      const d = decideAdd(this.#db.snapshots().map(metaOf), { kind: 'sync-loser', hash, at, label });
      if (d.action !== 'add') return;
      const rec: SnapshotRecord = {
        id: makeId('s-', at, this.#seq++, this.#rnd), at, kind: 'sync-loser', label, device: this.#device(), pinned: false, hash,
        counts: { exams: 0, tasks: 0, subs: 0, library: 0 }, bytes: new TextEncoder().encode(json).length, settings, subject: 'settings',
      };
      await this.#db.putSnapshot(rec);
      this.#publish();
    });
  }

  #onCommit(info: CommitInfo): void {
    let changed = true;
    if (info.before) {
      try { changed = contentHash(info.before) !== contentHash(info.after); } catch { changed = true; }
    }
    if (!changed) return; // 활성 시험만 바뀐 것 등 내용이 같은 commit 은 기록하지 않는다
    if (!this.#firstDone && info.before) {
      this.#firstDone = true;
      void this.#snapshot(serializeState(info.before), 'auto', H.autoLabel, info.at);
    }
    this.#addLog(RESTORE_LABELS.has(info.label) ? 'restore' : 'local', clipLabel(info.label, '변경'), info.at);
  }

  // ───────── 작업 기록 ─────────
  #addLog(kind: LogKind, label: string, at: number): void {
    const r = appendLog(this.#logMem, { at, device: this.#device(), label, kind },
      () => makeId('l-', at, this.#seq++, this.#rnd));
    this.#logMem = r.log;
    this.#logDirty.set(r.written.id, r.written);
    for (const id of r.removedIds) { this.#logDirty.delete(id); this.#logRemoved.push(id); }
    this.#publishLog();
    if (!this.#logTimer) {
      this.#logTimer = setTimeout(() => { this.#logTimer = null; void this.flush(); }, this.#opts.logDebounceMs ?? 400);
    }
  }

  // ───────── 고정·삭제 ─────────
  /** 핀을 켜고 끈다. 없는 id 면 false */
  pin(id: string, on: boolean): Promise<boolean> {
    return this.#enqueue(async () => {
      const rec = this.#db.snapshot(id);
      if (!rec) return false;
      if (rec.pinned !== on) await this.#db.putSnapshot({ ...rec, pinned: on });
      this.#publish();
      return true;
    });
  }

  /** 스냅샷 하나를 지운다(되돌릴 수 없다). 없는 id 면 false */
  remove(id: string): Promise<boolean> {
    return this.#enqueue(async () => {
      if (!this.#db.snapshot(id)) return false;
      await this.#db.deleteSnapshots([id]);
      this.#publish();
      return true;
    });
  }

  // ───────── 복원 ─────────
  /**
   * 되돌린다. 전체 상태 스냅샷은 지금 상태를 '복원 전' 스냅샷으로 먼저 보존한 뒤 app.mutate('이력 복원', .., { big: true }) 로
   * 상태를 교체한다(activeId 와 화면 설정은 유지). 결과는 sanitizeState 를 한 번 더 통과시키고, 실패하면 상태를 바꾸지 않는다.
   * 'sync-loser' 는 진 시험을 새 id 의 시험('(복원)' 접미사)으로 추가한다.
   */
  restore(id: string): Promise<RestoreResult> {
    return this.#enqueue(async () => {
      const app = this.#app;
      if (!app) return { ok: false, error: H.errNoApp } as const;
      const rec = this.#db.snapshot(id);
      if (!rec) return { ok: false, error: H.errNotFound } as const;
      if (app.loadProblem) return { ok: false, error: H.errGuard } as const;
      if (rec.kind === 'sync-loser') return rec.subject === 'settings' ? this.#restoreSettings(app, rec) : this.#restoreExam(app, rec);
      return this.#restoreState(app, rec);
    });
  }

  async #restoreState(app: App, rec: SnapshotRecord): Promise<RestoreResult> {
    if (!rec.state) return { ok: false, error: H.errNoState };
    let raw: unknown;
    try { raw = JSON.parse(await unpack(rec.state)); } catch (e) {
      return { ok: false, error: e instanceof SyntaxError ? H.errParse : H.errUnpack };
    }
    const next = sanitizeState(raw);
    if (!next) return { ok: false, error: H.errInvalid };
    if (next.exams.length < countRawExams(raw)) return { ok: false, error: H.errPartial };

    const cur = serializeState(app.state);
    if (cur.hash === rec.hash) return { ok: true, kind: 'state', changed: false, preservedId: null, durable: true };

    this.#firstDone = true;
    this.#restoring = true;
    try {
      // 1) 지금 상태 보존: 보존이 끝난 뒤에만 바꾼다
      const label = H.beforeRestoreLabel(formatWhen(rec.at, this.#now()));
      const pre = await this.#add(cur, 'before-restore', label, this.#now());
      // 저장소 쓰기가 실패했으면(메모리 모드가 아니라 쓰기 오류) 직전 상태를 남기지 못한 채 바꾸지 않는다: 상태는 그대로 두고 오류를 돌려준다
      if (!pre.durable && this.#db.status.state === 'failed') return { ok: false, error: H.errPreserve };
      // 보존하는 동안(압축·쓰기 await) 편집이나 원격 반영이 있었다면 그 상태도 보존한다. 못 남기면 같은 이유로 바꾸지 않는다
      const now2 = serializeState(app.state);
      if (now2.hash !== cur.hash) {
        const again = await this.#add(now2, 'before-restore', label, this.#now());
        if (!again.durable && this.#db.status.state === 'failed') return { ok: false, error: H.errPreserve };
      }
      // 2) 교체. 활성 시험은 현재 값을 유지한다
      try {
        const kept = keepActiveId(cloneState(next), app.state.activeId).activeId;
        app.mutate(H.restoreLabel, (s) => {
          for (const k of RESTORE_KEYS) (s as unknown as Record<string, unknown>)[k] = cloneState(next)[k];
          s.activeId = kept;
        }, { big: true });
      } catch {
        return { ok: false, error: H.errApply };
      }
      return { ok: true, kind: 'state', changed: true, preservedId: pre.meta?.id ?? null, durable: pre.durable };
    } finally {
      this.#restoring = false;
    }
  }

  /** 설정 충돌에서 진 설정을 현재 설정으로 되돌린다(시험·라이브러리는 건드리지 않는다). 확인은 목록 화면의 확인 블록이 받는다 */
  async #restoreSettings(app: App, rec: SnapshotRecord): Promise<RestoreResult> {
    const raw = rec.settings;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: H.errSettingsInvalid };
    const r = raw as Record<string, unknown>;
    if (!r.limits || !r.defPlan || !r.week || typeof r.recapDays !== 'number') return { ok: false, error: H.errSettingsInvalid };
    const clean = sanitizeState({ ...cloneState(app.state), limits: r.limits, defPlan: r.defPlan, recapDays: r.recapDays, week: r.week, library: [], exams: [] });
    if (!clean) return { ok: false, error: H.errSettingsInvalid };
    const before = JSON.stringify([app.state.limits, app.state.defPlan, app.state.recapDays, app.state.week]);
    if (before === JSON.stringify([clean.limits, clean.defPlan, clean.recapDays, clean.week])) return { ok: true, kind: 'state', changed: false, preservedId: null, durable: true };
    try {
      app.mutate(H.restoreSettingsLabel, (s: State) => {
        s.limits = clean.limits; s.defPlan = clean.defPlan; s.recapDays = clean.recapDays; s.week = clean.week;
      }, { big: true });
    } catch {
      return { ok: false, error: H.errApply };
    }
    return { ok: true, kind: 'state', changed: true, preservedId: null, durable: true };
  }

  async #restoreExam(app: App, rec: SnapshotRecord): Promise<RestoreResult> {
    if (rec.exam === undefined) return { ok: false, error: H.errNoExam };
    const cur = cloneState(app.state);
    const built = examAsRestored(rec.exam, cur, uid);
    if (!built) return { ok: false, error: H.errExamInvalid };
    const checked = sanitizeState(built.state);
    const added = checked?.exams.find((e) => e.id === built.examId);
    if (!checked || !added || checked.exams.length !== cur.exams.length + 1) return { ok: false, error: H.errExamInvalid };
    try {
      app.mutate(H.restoreExamLabel, (s: State) => {
        for (const l of checked.library) if (!s.library.some((x) => x.id === l.id)) s.library.push({ ...l });
        s.exams.push(JSON.parse(JSON.stringify(added)));
      });
    } catch {
      return { ok: false, error: H.errApply };
    }
    return { ok: true, kind: 'exam', changed: true, preservedId: null, durable: true, examName: added.name };
  }
}

/** 앱 전역 이력(싱글턴). 시작 때 `history.connect(app)` 한 번 */
export const history = new HistoryStore();
export function createHistory(opts: HistoryOptions = {}): HistoryStore { return new HistoryStore(opts); }

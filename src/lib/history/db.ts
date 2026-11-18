// 변경 이력 저장소: IndexedDB `examPlannerHistory`(v1) 의 snapshots(keyPath id)·log(keyPath id).
// storage/store.ts 와 같은 원칙: 예외·타임아웃·IDB 불가 어느 쪽이든 앱은 계속 동작하고(이력이 안 쌓이거나 이 창에서만 유지될 뿐),
// 쓰기 실패는 status 로 노출한다. 모든 읽기는 메모리 사본에서 하고, 쓰기는 메모리에 먼저 반영한 뒤 IDB 에 순서대로 쓴다.
// 이력 데이터는 서버로 올리지 않는다(이 기기의 IndexedDB 에만 있다).
import type { LogEntry, SnapshotRecord } from './core';

export const HISTORY_DB_NAME = 'examPlannerHistory';
export const HISTORY_DB_VERSION = 1;
export const SNAPSHOT_STORE = 'snapshots';
export const LOG_STORE = 'log';

export type HistoryFailReason = 'unavailable' | 'quota' | 'timeout' | 'error';
/** ok 정상 저장, memory IDB 를 쓸 수 없어 이 창에만 보관, failed 마지막 쓰기 실패(이후 성공하면 ok 로 돌아온다) */
export interface HistoryStatus {
  state: 'idle' | 'ok' | 'memory' | 'failed';
  reason?: HistoryFailReason;
  /** 사용자에게 보일 한국어 설명 */
  message?: string;
}

export interface HistoryDbOptions {
  /** 생략하면 전역 indexedDB, null 이면 쓰지 않음(메모리) */
  indexedDB?: IDBFactory | null;
  timeoutMs?: number;
  onStatus?: (s: HistoryStatus) => void;
}

const MSG = {
  unavailable: '이 브라우저에서 이력을 저장할 수 없습니다. 이 창을 닫으면 이력이 사라집니다.',
  quota: '저장 공간이 부족해 이력을 저장하지 못했습니다.',
  timeout: '저장소가 응답하지 않아 이력을 저장하지 못했습니다.',
  error: '이력을 저장소에 쓰는 중 오류가 났습니다.',
};

class TimeoutError extends Error { constructor() { super('timeout'); this.name = 'TimeoutError'; } }
const errName = (e: unknown) => (e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '');
function classify(e: unknown): HistoryFailReason {
  const n = errName(e);
  if (n === 'QuotaExceededError') return 'quota';
  if (n === 'TimeoutError') return 'timeout';
  return 'error';
}
function withTimeout<R>(p: Promise<R>, ms: number): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError()), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
function globalIdb(): IDBFactory | null {
  try { return typeof indexedDB === 'undefined' ? null : indexedDB; } catch { return null; }
}

export interface HistoryDb {
  /** IDB 에서 읽어 메모리 사본을 채운다(IDB 를 못 쓰면 빈 채로 메모리 모드). 던지지 않는다 */
  load(): Promise<void>;
  snapshots(): SnapshotRecord[];
  snapshot(id: string): SnapshotRecord | undefined;
  log(): LogEntry[];
  /** 메모리에 반영하고 IDB 에 쓴다. 저장소에 실제로 남았으면 true(메모리 모드·실패는 false) */
  putSnapshot(r: SnapshotRecord): Promise<boolean>;
  deleteSnapshots(ids: string[]): Promise<boolean>;
  putLog(entries: LogEntry[]): Promise<boolean>;
  deleteLog(ids: string[]): Promise<boolean>;
  readonly status: HistoryStatus;
  /** 대기 중인 쓰기가 모두 끝날 때까지 */
  idle(): Promise<void>;
  close(): void;
}

export function createHistoryDb(opts: HistoryDbOptions = {}): HistoryDb {
  const factory = opts.indexedDB === undefined ? globalIdb() : opts.indexedDB;
  const timeout = opts.timeoutMs ?? 8000;
  const snaps = new Map<string, SnapshotRecord>();
  const logs = new Map<string, LogEntry>();
  let status: HistoryStatus = { state: 'idle' };
  let dbP: Promise<IDBDatabase> | null = null;
  let usable = !!factory;
  let chain: Promise<unknown> = Promise.resolve();

  const setStatus = (s: HistoryStatus) => {
    if (s.state === status.state && s.reason === status.reason) return;
    status = s;
    try { opts.onStatus?.(s); } catch { /* 구독자 오류는 무시 */ }
  };
  const memoryMode = () => setStatus({ state: 'memory', reason: 'unavailable', message: MSG.unavailable });

  function open(): Promise<IDBDatabase> {
    if (dbP) return dbP;
    const p = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const r = factory!.open(HISTORY_DB_NAME, HISTORY_DB_VERSION);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
          if (!db.objectStoreNames.contains(LOG_STORE)) db.createObjectStore(LOG_STORE, { keyPath: 'id' });
        };
        r.onsuccess = () => {
          const db = r.result;
          db.onversionchange = () => { db.close(); dbP = null; };
          db.onclose = () => { dbP = null; };
          resolve(db);
        };
        r.onerror = () => reject(r.error);
        r.onblocked = () => reject(new Error('blocked'));
      } catch (e) { reject(e); }
    });
    dbP = p;
    p.catch(() => { if (dbP === p) dbP = null; });
    return p;
  }

  async function call<R>(fn: (db: IDBDatabase) => Promise<R>): Promise<R> {
    try {
      return await withTimeout(open().then(fn), timeout);
    } catch (e) {
      if (errName(e) === 'TimeoutError') dbP = null;
      throw e;
    }
  }

  const getAll = <T>(store: string) => call((db) => new Promise<T[]>((res, rej) => {
    const q = db.transaction(store).objectStore(store).getAll();
    q.onsuccess = () => res(q.result as T[]);
    q.onerror = () => rej(q.error);
  }));

  const write = (store: string, put: unknown[], del: string[]) => call((db) => new Promise<void>((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    put.forEach((v) => os.put(v));
    del.forEach((k) => os.delete(k));
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error('aborted'));
  }));

  /** 쓰기를 순서대로 IDB 에 보낸다. 실패해도 체인은 이어진다 */
  function persist(store: string, put: unknown[], del: string[]): Promise<boolean> {
    if (!usable) return Promise.resolve(false);
    const run = async (): Promise<boolean> => {
      try {
        await write(store, put, del);
        if (status.state !== 'ok') setStatus({ state: 'ok' });
        return true;
      } catch (e) {
        const reason = classify(e);
        setStatus({ state: 'failed', reason, message: MSG[reason] });
        return false;
      }
    };
    const p = chain.then(run, run);
    chain = p;
    return p;
  }

  return {
    async load() {
      if (!factory) { usable = false; memoryMode(); return; }
      try {
        const [s, l] = await Promise.all([getAll<SnapshotRecord>(SNAPSHOT_STORE), getAll<LogEntry>(LOG_STORE)]);
        snaps.clear(); logs.clear(); // 다시 읽을 때 다른 탭에서 지운 항목이 남지 않게
        s.forEach((r) => { if (r && typeof r.id === 'string') snaps.set(r.id, r); });
        l.forEach((e) => { if (e && typeof e.id === 'string') logs.set(e.id, e); });
        usable = true;
        setStatus({ state: 'ok' });
      } catch {
        usable = false; // 읽지 못하는 저장소에 쓰면 기존 이력을 덮을 수 있으므로 이 창에서는 메모리만 쓴다
        memoryMode();
      }
    },
    snapshots: () => [...snaps.values()],
    snapshot: (id) => snaps.get(id),
    log: () => [...logs.values()],
    putSnapshot(r) { snaps.set(r.id, r); return persist(SNAPSHOT_STORE, [r], []); },
    deleteSnapshots(ids) { ids.forEach((id) => snaps.delete(id)); return persist(SNAPSHOT_STORE, [], ids); },
    putLog(entries) { entries.forEach((e) => logs.set(e.id, e)); return persist(LOG_STORE, entries, []); },
    deleteLog(ids) { ids.forEach((id) => logs.delete(id)); return persist(LOG_STORE, [], ids); },
    get status() { return status; },
    idle: async () => { await chain; },
    close() {
      const p = dbP;
      dbP = null;
      usable = false;
      p?.then((db) => db.close(), () => undefined);
    },
  };
}

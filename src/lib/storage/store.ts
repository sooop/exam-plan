// 로컬 저장소: IndexedDB(examPlanner/kv) -> localStorage -> 메모리 순 폴백.
// legacy/exam-plan.html 1071~1116행(idb·loadLocal·saveLocal·flush)을 이식하면서 다음을 고쳤다.
//  - load() 가 'ok' | 'empty' | 'failed' | 'corrupt' 를 구분한다. 읽기 실패나 손상을 "비어 있음"으로 취급해
//    첫 저장이 실제 데이터를 덮어쓰던 결함(감사 C1)을 막는다. failed/corrupt 이면 저장 가드가 저장을 막는다.
//  - 손상된 원본은 examPlanner.corrupt.<시각> 키에 보존한다. 검증은 통과했지만 일부가 버려진 원본도
//    shouldBackupRaw 훅이 true 면 같은 키 공간에 reason 'partial' 로 보존한다(partialBackupKey 로 노출).
//  - 여러 탭: BroadcastChannel 알림 + 창이 다시 보일 때 재읽기(감사 H4).
//  - 저장 실패(용량 초과·응답 없음·저장소 없음)의 이유를 saveStatus 로 노출한다.
// 상태 객체는 일반 객체다. 화면은 subscribe() 로 받아 $state 에 옮긴다.
import type { StateLike } from './stateTypes';

export const DB_NAME = 'examPlanner';
export const DB_VERSION = 1;
export const STORE_NAME = 'kv';
export const STATE_KEY = 'state';
export const LS_STATE_KEY = 'examPlanner.state.v1';
export const CORRUPT_PREFIX = 'examPlanner.corrupt.';
export const CHANNEL_NAME = 'examPlanner.state';

export type LoadSource = 'indexedDB' | 'localStorage';
export type LoadResult<T> =
  | {
      status: 'ok'; value: T; source: LoadSource;
      /** shouldBackupRaw 가 true 여서 원본을 보존한 키(보존 안 했으면 null). 부분 폐기 원본 */
      partialBackupKey?: string | null;
      /** shouldBackupRaw 가 true 였는데 보존에 실패했는가(값은 그대로 ok) */
      backupFailed?: boolean;
      /** IndexedDB 를 읽지 못해 localStorage 사본으로 열었다(이 경우 IDB 에는 쓰지 않는다). retryDegraded() 로 벗어난다 */
      degraded?: boolean;
    }
  | { status: 'empty' }
  | { status: 'failed'; reason: string }
  | { status: 'corrupt'; reason: string; backupKey: string | null };

export interface LoadStatus {
  phase: 'idle' | 'loading' | 'ok' | 'empty' | 'failed' | 'corrupt';
  /** 사용자에게 보일 한국어 설명(failed/corrupt) */
  message?: string;
  source?: LoadSource;
  /** corrupt 원본을 보존한 키(보존 실패면 null) */
  backupKey?: string | null;
  /** ok 에서 부분 폐기 원본을 보존한 키(보존하지 않았거나 실패면 null) */
  partialBackupKey?: string | null;
  /** ok 에서 부분 폐기 원본 보존을 시도했으나 실패했다. 값은 그대로 ok 다 */
  backupFailed?: boolean;
  /** ok 인데 IndexedDB 를 읽지 못해 localStorage 사본으로 열었다(IDB 에는 쓰지 않는다) */
  degraded?: boolean;
  /** allowSaveAnyway 로 덮어쓰기 직전에 기존 저장본을 보존한 키(보존하지 못했거나 보존할 것이 없었으면 null) */
  overwriteBackupKey?: string | null;
  /** 사용자가 "그래도 저장"을 골라 가드를 풀었는가 */
  unlocked?: boolean;
}

export type SaveFailReason = 'quota' | 'timeout' | 'unavailable' | 'serialize';
export interface SaveStatus {
  /** idle 저장할 것 없음, dirty 저장 대기, saving 쓰는 중, saved 저장됨, blocked 가드로 막힘, failed 쓰기 실패 */
  state: 'idle' | 'dirty' | 'saving' | 'saved' | 'blocked' | 'failed';
  reason?: SaveFailReason | 'not-loaded' | 'load-failed' | 'load-corrupt';
  message?: string;
  savedAt?: number;
  /** 마지막으로 성공한 저장 위치. memory 는 이 창을 닫으면 사라진다 */
  where?: LoadSource | 'memory';
  bytes?: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ExternalChangeInfo {
  /** 이 탭에도 저장 전 편집이 있는가(IDB 를 못 읽는 동안 localStorage 에만 저장한 편집 포함) */
  localDirty: boolean;
  /** shouldBackupRaw 가 true 여서 다른 탭 저장본의 원본을 보존한 키(없거나 보존하지 않았으면 null) */
  partialBackupKey: string | null;
  /** shouldBackupRaw 가 true 였는데 보존에 실패했는가(값 전달은 그대로 된다) */
  backupFailed: boolean;
}

export interface StoreOptions<T extends StateLike> {
  /** 읽은 값을 검증·정리한다. 쓸 수 없는 값이면 null(또는 예외) -> 'corrupt' */
  validate: (raw: unknown) => T | null;
  /** 생략하면 전역 indexedDB, null 이면 쓰지 않음 */
  indexedDB?: IDBFactory | null;
  /** 생략하면 전역 localStorage, null 이면 쓰지 않음 */
  storage?: StorageLike | null;
  debounceMs?: number;
  readTimeoutMs?: number;
  writeTimeoutMs?: number;
  /** null 이면 BroadcastChannel 을 쓰지 않음 */
  channelName?: string | null;
  /**
   * load 가 ok 로 값을 돌려주기 직전, 그리고 checkExternal 이 다른 탭의 더 새 값을 알리기 직전에 부른다.
   * true 면 그 저장본의 원본(raw)을 examPlanner.corrupt.<시각> 에
   * {at, source, raw, reason: 'partial'} 로 보존한다(검증을 통과한 값에서 일부가 버려졌을 때의 원본 보존용).
   * 훅이 예외를 던지면 보존하는 쪽으로 본다.
   */
  shouldBackupRaw?: (raw: unknown, value: T) => boolean;
}

export interface AttachTargets {
  document?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null;
  window?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
}

const MSG = {
  failed: '저장된 데이터를 불러오지 못했습니다. 저장을 멈췄습니다. 다시 시도해 주세요.',
  corrupt: '저장된 데이터를 읽을 수 없어 저장을 멈췄습니다. 원본은 따로 보관했습니다.',
  quota: '저장 공간이 부족해 저장하지 못했습니다. JSON 파일로 내보내 보관해 주세요.',
  timeout: '저장소가 응답하지 않아 저장하지 못했습니다. 잠시 뒤 다시 시도합니다.',
  unavailable: '이 브라우저에서 저장소를 쓸 수 없습니다. 이 창을 닫으면 내용이 사라지니 JSON 파일로 내보내 주세요.',
  serialize: '데이터를 저장 형식으로 바꾸지 못했습니다.',
  notLoaded: '저장된 데이터를 확인하는 중이라 아직 저장하지 않습니다.',
};

/** 읽어서 검증을 통과한 저장본 하나. raw 는 검증 전 원본, rev 는 저장 순번(없으면 0) */
interface Valid<T> { value: T; source: LoadSource; raw: unknown; rev: number }

/**
 * 같은 저장소의 두 사본(IndexedDB·localStorage) 중 더 새 것. 저장 순번(rev)이 먼저고, 같으면 updatedAt, 그래도 같으면 앞의 것(IndexedDB).
 * 원격 반영은 state.updatedAt 을 올리지 않으므로 updatedAt 만으로는 새 것을 가릴 수 없다(감사 C-1).
 */
function newer<T extends StateLike>(a: Valid<T>, b: Valid<T>): Valid<T> {
  if (b.rev !== a.rev) return b.rev > a.rev ? b : a;
  return updatedAtOf(b.value) > updatedAtOf(a.value) ? b : a;
}

class TimeoutError extends Error { constructor() { super('timeout'); this.name = 'TimeoutError'; } }

function withTimeout<R>(p: Promise<R>, ms: number): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError()), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function errName(e: unknown): string {
  return e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
}
function classify(e: unknown): SaveFailReason {
  const n = errName(e);
  if (n === 'QuotaExceededError') return 'quota';
  if (n === 'TimeoutError') return 'timeout';
  return 'unavailable';
}
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

function globalIdb(): IDBFactory | null {
  try { return typeof indexedDB === 'undefined' ? null : indexedDB; } catch { return null; }
}
function globalStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
const updatedAtOf = (v: unknown) => {
  const n = (v as { updatedAt?: unknown } | null)?.updatedAt;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

/** 저장 순번. 저장할 때마다 단조 증가해 저장 레코드와 BroadcastChannel 알림에 함께 실린다. 없으면(기존 저장본) 0 */
const revOf = (v: unknown) => {
  const n = (v as { rev?: unknown } | null)?.rev;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** 보존용 원본에서 저장 순번(rev)을 뺀다: rev 는 저장소 내부 표지이고 원본의 내용이 아니다 */
function withoutRev(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !('rev' in raw)) return raw;
  const { rev: _rev, ...rest } = raw as Record<string, unknown>;
  void _rev;
  return rest;
}

type RawRead =
  | { kind: 'value'; value: unknown }
  | { kind: 'text'; text: string } // localStorage 문자열을 JSON 으로 읽지 못함
  | { kind: 'none' }
  | { kind: 'unavailable' } // 저장소 자체가 없음(쓴 적도 없음)
  | { kind: 'error'; error: unknown };

export function createLocalStore<T extends StateLike>(opts: StoreOptions<T>) {
  const factory = opts.indexedDB === undefined ? globalIdb() : opts.indexedDB;
  const storage = opts.storage === undefined ? globalStorage() : opts.storage;
  const debounceMs = opts.debounceMs ?? 300;
  const readTimeout = opts.readTimeoutMs ?? 5000;
  const writeTimeout = opts.writeTimeoutMs ?? 8000;
  const channelName = opts.channelName === undefined ? CHANNEL_NAME : opts.channelName;
  const tabId = Math.random().toString(36).slice(2);

  let loadStatus: LoadStatus = { phase: 'idle' };
  let saveStatus: SaveStatus = { state: 'idle' };
  const listeners = new Set<() => void>();
  const externalListeners = new Set<(value: T, info: ExternalChangeInfo) => void>();
  const notify = () => listeners.forEach((f) => { try { f(); } catch { /* 구독자 오류는 저장소에 영향을 주지 않는다 */ } });
  const setLoad = (s: LoadStatus) => { loadStatus = s; notify(); };
  const setSave = (s: SaveStatus) => { saveStatus = s; notify(); };

  // ---- IndexedDB ----
  let dbPromise: Promise<IDBDatabase> | null = null;
  function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    const p = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const r = factory!.open(DB_NAME, DB_VERSION);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains(STORE_NAME)) r.result.createObjectStore(STORE_NAME);
        };
        r.onsuccess = () => {
          const db = r.result;
          db.onversionchange = () => { db.close(); dbPromise = null; };
          db.onclose = () => { dbPromise = null; };
          resolve(db);
        };
        r.onerror = () => reject(r.error);
        r.onblocked = () => reject(new Error('blocked'));
      } catch (e) { reject(e); }
    });
    dbPromise = p;
    p.catch(() => { if (dbPromise === p) dbPromise = null; });
    return p;
  }
  async function idbCall<R>(ms: number, fn: (db: IDBDatabase) => Promise<R>): Promise<R> {
    try {
      return await withTimeout(openDb().then(fn), ms);
    } catch (e) {
      if (errName(e) === 'TimeoutError') dbPromise = null; // 열리다 만 연결은 버리고 다음에 다시 연다
      throw e;
    }
  }
  const idbGet = (key: string) => idbCall(readTimeout, (db) => new Promise<unknown>((res, rej) => {
    const q = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  }));
  const idbPut = (key: string, value: unknown) => idbCall(writeTimeout, (db) => new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error('aborted'));
  }));
  const idbKeys = () => idbCall(readTimeout, (db) => new Promise<IDBValidKey[]>((res, rej) => {
    const q = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAllKeys();
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  }));

  async function readIdb(): Promise<RawRead> {
    if (!factory) return { kind: 'unavailable' };
    try {
      const v = await idbGet(STATE_KEY);
      return v === undefined || v === null ? { kind: 'none' } : { kind: 'value', value: v };
    } catch (error) { return { kind: 'error', error }; }
  }
  function readLs(): RawRead {
    if (!storage) return { kind: 'unavailable' };
    let text: string | null;
    try { text = storage.getItem(LS_STATE_KEY); } catch { return { kind: 'unavailable' }; }
    if (text === null || text === '') return { kind: 'none' };
    try { return { kind: 'value', value: JSON.parse(text) }; } catch { return { kind: 'text', text }; }
  }

  function check(raw: unknown): T | null {
    try { return opts.validate(raw); } catch { return null; }
  }

  /**
   * 손상 원본(또는 부분 폐기 원본: reason 'partial')을 별도 키에 보존한다. 보존한 키(실패하면 null).
   * corrupt 의 저장 형식은 예전과 같다({at, source, raw}).
   */
  async function backupCorrupt(raw: unknown, source: LoadSource, reason?: 'partial' | 'overwritten'): Promise<string | null> {
    const at = Date.now();
    raw = withoutRev(raw);
    const envelope = reason ? { at, source, raw, reason } : { at, source, raw };
    for (let n = 0; n < 50; n++) {
      const key = `${CORRUPT_PREFIX}${at}${n ? `-${n}` : ''}`;
      if (factory) {
        try {
          const keys = await idbKeys();
          if (keys.includes(key)) continue;
          await idbPut(key, envelope);
          return key;
        } catch { /* localStorage 로 */ }
      }
      if (storage) {
        try {
          if (storage.getItem(key) !== null) continue;
          storage.setItem(key, JSON.stringify(envelope));
          return key;
        } catch { /* 보존 실패 */ }
      }
      return null;
    }
    return null;
  }

  /**
   * 부분 폐기 원본 보존. 같은 원본(reason 'partial')이 이미 보존돼 있으면 새로 쓰지 않고 그 키를 돌려준다
   * (불러올 때마다 같은 원본이 쌓이지 않도록). 실패하면 null.
   */
  async function backupPartial(raw: unknown, source: LoadSource): Promise<string | null> {
    try {
      const same = JSON.stringify(raw);
      for (const k of await listCorruptBackups()) {
        const env = await readCorruptBackup(k) as { reason?: unknown; raw?: unknown } | null;
        if (env && env.reason === 'partial' && JSON.stringify(env.raw) === same) return k;
      }
    } catch { /* 중복 확인 실패는 무시하고 새로 보존한다 */ }
    return backupCorrupt(raw, source, 'partial');
  }

  /**
   * 검증을 통과한 저장본들 가운데 shouldBackupRaw 가 true 인 원본을 partial 로 보존한다(best 를 먼저 본다).
   * partialBackupKey 는 처음 보존된 키, 하나라도 보존에 실패했으면 backupFailed. 훅이 없으면 아무것도 하지 않는다.
   * 훅이 예외를 던지면 보존하는 쪽으로 본다.
   */
  async function preservePartials(
    valid: Valid<T>[],
    best: Valid<T>,
  ): Promise<{ partialBackupKey: string | null; backupFailed: boolean }> {
    let partialBackupKey: string | null = null;
    let backupFailed = false;
    if (opts.shouldBackupRaw) {
      for (const v of [best, ...valid.filter((x) => x !== best)]) {
        let want: boolean;
        try { want = opts.shouldBackupRaw(v.raw, v.value); } catch { want = true; }
        if (!want) continue;
        const key = await backupPartial(v.raw, v.source);
        if (key) partialBackupKey ??= key; else backupFailed = true;
      }
    }
    return { partialBackupKey, backupFailed };
  }

  /** 상태를 바꾸지 않고 저장소를 읽는다. valid 의 raw 는 검증 전 원본이다(부분 폐기 보존에 쓴다) */
  async function readAll(): Promise<{
    valid: Valid<T>[];
    invalid: { raw: unknown; source: LoadSource }[];
    idbError: unknown;
  }> {
    const [i, l] = [await readIdb(), readLs()];
    const valid: Valid<T>[] = [];
    const invalid: { raw: unknown; source: LoadSource }[] = [];
    const take = (r: RawRead, source: LoadSource) => {
      if (r.kind === 'text') invalid.push({ raw: r.text, source });
      else if (r.kind === 'value') {
        const v = check(r.value);
        if (v) valid.push({ value: v, source, raw: r.value, rev: revOf(r.value) }); else invalid.push({ raw: r.value, source });
      }
    };
    take(i, 'indexedDB');
    take(l, 'localStorage');
    return { valid, invalid, idbError: i.kind === 'error' ? i.error : undefined };
  }

  // ---- 읽기 ----
  let knownUpdatedAt = 0;
  /** 이 탭이 읽었거나 쓴 가장 큰 저장 순번. 이보다 큰 rev 가 저장소에 있으면 다른 탭(또는 원격 반영)이 쓴 것이다 */
  let knownRev = 0;
  let loadInFlight: Promise<LoadResult<T>> | null = null;
  let unlocked = false;
  /** IDB 를 못 읽어 localStorage 사본으로 열었다: IDB 에는 쓰지 않고 localStorage 에만 저장한다 */
  let degraded = false;
  /** degraded 중에 편집(저장 요청)이 있었는가 - IDB 가 다시 읽힐 때 사용자에게 어느 쪽을 쓸지 묻는다 */
  let degradedEdits = false;
  let loadedRev = 0;
  /** 이 탭이 localStorage 에 쓴 사본의 가장 큰 rev. 그 사본을 이 탭이 스스로 외부 변경으로 보지 않게 한다 */
  let ownLsRev = 0;

  async function doLoad(): Promise<LoadResult<T>> {
    const { valid, invalid, idbError } = await readAll();
    if (valid.length) {
      // 둘 다 있으면 저장 순번이 큰 것, 같으면 더 새 updatedAt, 그래도 같으면 IndexedDB
      const best = valid.reduce(newer);
      loadedRev = best.rev;
      for (const bad of invalid) await backupCorrupt(bad.raw, bad.source);
      // 검증을 통과했어도 일부 시험이 버려졌을 수 있다. 훅이 원하면 원본을 먼저 보존하고 나서 ok 를 돌려준다.
      // 보존에 실패해도 값은 ok 그대로 두고 backupFailed 로 표지만 남긴다(저장 가드는 걸지 않는다).
      const { partialBackupKey, backupFailed } = await preservePartials(valid, best);
      // IDB 읽기 오류인데 localStorage 사본만 읽혔다: 사본이 낡았을 수 있어 IDB 를 덮지 않는 degraded 로 연다(감사 M-5)
      return { status: 'ok', value: best.value, source: best.source, partialBackupKey, backupFailed, ...(idbError !== undefined ? { degraded: true } : {}) };
    }
    if (idbError !== undefined) {
      // 읽기 실패나 타임아웃은 "비어 있음"이 아니다
      for (const bad of invalid) await backupCorrupt(bad.raw, bad.source);
      return { status: 'failed', reason: errText(idbError) };
    }
    if (invalid.length) {
      let backupKey: string | null = null;
      for (const bad of invalid) backupKey = (await backupCorrupt(bad.raw, bad.source)) ?? backupKey;
      return { status: 'corrupt', reason: '저장된 데이터가 형식에 맞지 않습니다', backupKey };
    }
    return { status: 'empty' };
  }

  function load(): Promise<LoadResult<T>> {
    if (loadInFlight) return loadInFlight;
    unlocked = false;
    degraded = false;
    degradedEdits = false;
    setLoad({ phase: 'loading' });
    const p = doLoad().catch((e): LoadResult<T> => ({ status: 'failed', reason: errText(e) })).then((r) => {
      loadInFlight = null;
      if (r.status === 'ok') {
        knownUpdatedAt = updatedAtOf(r.value);
        knownRev = loadedRev;
        degraded = r.degraded === true;
        pending = null; // 읽은 내용이 기준이다. 읽기 전에 쌓인 편집은 버린다(호출자가 읽은 값으로 화면을 바꾼다)
        setLoad({ phase: 'ok', source: r.source, partialBackupKey: r.partialBackupKey, backupFailed: r.backupFailed, ...(degraded ? { degraded: true } : {}) });
        setSave({ ...saveStatus, state: 'idle', reason: undefined, message: undefined });
      } else if (r.status === 'empty') {
        setLoad({ phase: 'empty' });
        if (pending) schedule(0);
        else if (saveStatus.state === 'blocked') setSave({ ...saveStatus, state: 'idle', reason: undefined, message: undefined });
      } else if (r.status === 'failed') {
        setLoad({ phase: 'failed', message: MSG.failed });
        if (pending) blockedStatus();
      } else {
        setLoad({ phase: 'corrupt', message: MSG.corrupt, backupKey: r.backupKey });
        if (pending) blockedStatus();
      }
      return r;
    });
    loadInFlight = p;
    return p;
  }
  /** 같은 일을 다시 한다. 실패·손상 화면의 "다시 시도" 단추가 부른다 */
  const retryLoad = load;

  // ---- 저장 가드 ----
  const guardOpen = () => loadStatus.phase === 'ok' || loadStatus.phase === 'empty' || unlocked;
  function blockedStatus() {
    const p = loadStatus.phase;
    const reason = p === 'failed' ? 'load-failed' : p === 'corrupt' ? 'load-corrupt' : 'not-loaded';
    const message = p === 'failed' ? MSG.failed : p === 'corrupt' ? MSG.corrupt : MSG.notLoaded;
    setSave({ ...saveStatus, state: 'blocked', reason, message });
  }
  /**
   * 사용자가 위험을 알고 가드를 푼다. failed 에서는 저장된 실제 데이터를 덮어쓸 수 있으므로 호출 전에 반드시 경고한다.
   * corrupt 는 원본을 이미 보존했으므로 비교적 안전하다.
   */
  function allowSaveAnyway(): void {
    unlocked = true;
    unlockBackupDone = loadStatus.phase !== 'failed'; // corrupt 는 읽을 때 원본을 이미 보존했다. failed 만 덮어쓰기 직전에 남길 사본을 찾는다
    setLoad({ ...loadStatus, unlocked: true });
    if (pending) schedule(0);
    else setSave({ ...saveStatus, state: 'idle', reason: undefined, message: undefined });
  }

  /**
   * 읽기에 실패한 채 가드를 푼 뒤 첫 저장 직전: 저장소에 있는 기존 저장본(읽을 수 있는 만큼)을 corrupt 백업 키에 보존한다.
   * 읽기 실패 때는 못 읽었어도 지금은 읽힐 수 있다. 보존하지 못해도 저장은 막지 않는다(사용자가 이미 덮어쓰기를 허락했다).
   */
  let unlockBackupDone = true;
  async function backupBeforeOverwrite(): Promise<void> {
    unlockBackupDone = true;
    let key: string | null = null;
    const reads: [RawRead, LoadSource][] = [[await readIdb(), 'indexedDB'], [readLs(), 'localStorage']];
    for (const [r, source] of reads) {
      let raw: unknown;
      if (r.kind === 'value') raw = r.value; else if (r.kind === 'text') raw = r.text; else continue;
      key = (await backupCorrupt(raw, source, 'overwritten')) ?? key;
    }
    setLoad({ ...loadStatus, overwriteBackupKey: key });
  }

  // ---- 쓰기 ----
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let channel: BroadcastChannel | null = null;

  function schedule(ms: number) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void flush(); }, ms);
  }

  /** IDB 에 저장 순번(rev)과 함께 쓴다. 읽기와 쓰기를 한 트랜잭션에 묶어 다른 탭이 쓴 rev 보다 항상 크게 올린다. 쓴 rev 를 돌려준다 */
  const idbPutRev = (key: string, base: Record<string, unknown>) => idbCall(writeTimeout, (db) => new Promise<number>((res, rej) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const os = tx.objectStore(STORE_NAME);
    let rev = 0;
    const g = os.get(key);
    g.onsuccess = () => { rev = Math.max(knownRev, revOf(g.result)) + 1; os.put({ ...base, rev }, key); };
    g.onerror = () => rej(g.error);
    tx.oncomplete = () => res(rev);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error('aborted'));
  }));
  /** localStorage 에 남은 사본의 rev(없거나 못 읽으면 0) */
  function lsRev(): number {
    const r = readLs();
    return r.kind === 'value' ? revOf(r.value) : 0;
  }

  async function persist(value: T): Promise<{ status: SaveStatus; rev?: number }> {
    let base: Record<string, unknown>;
    try { base = JSON.parse(JSON.stringify(value)) as Record<string, unknown>; } catch { return { status: { state: 'failed', reason: 'serialize', message: MSG.serialize, where: 'memory' } }; }
    const bytes = JSON.stringify(base).length;
    const now = Date.now();
    let first: unknown;
    if (factory && !degraded) {
      try {
        const rev = await idbPutRev(STATE_KEY, base);
        // 보조 저장소에 남은 옛 사본이 읽을 때 이기지 않게 지운다
        try { storage?.removeItem(LS_STATE_KEY); } catch { /* 무시 */ }
        return { status: { state: 'saved', savedAt: now, where: 'indexedDB', bytes }, rev };
      } catch (e) { first = e; }
    }
    if (storage) {
      try {
        const rev = Math.max(knownRev, lsRev()) + 1;
        storage.setItem(LS_STATE_KEY, JSON.stringify({ ...base, rev }));
        ownLsRev = Math.max(ownLsRev, rev);
        return { status: { state: 'saved', savedAt: now, where: 'localStorage', bytes }, rev };
      } catch (e) {
        const reason = classify(first) === 'quota' ? 'quota' : classify(e);
        return { status: { state: 'failed', reason, message: MSG[reason], where: 'memory', bytes } };
      }
    }
    const reason = first === undefined ? 'unavailable' : classify(first);
    return { status: { state: 'failed', reason, message: MSG[reason], where: 'memory', bytes } };
  }

  function runFlush(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null; }
    chain = chain.then(async () => {
      while (pending) {
        if (!guardOpen()) { blockedStatus(); return; }
        const taken = pending;
        pending = null;
        setSave({ ...saveStatus, state: 'saving', reason: undefined, message: undefined });
        if (!unlockBackupDone) { try { await backupBeforeOverwrite(); } catch { /* 보존 실패는 저장을 막지 않는다 */ } }
        const { status: r, rev } = await persist(taken.value);
        if (r.state === 'failed') {
          pending ??= taken; // 다음 flush(숨김·재시도)에서 다시 쓴다
          setSave({ ...saveStatus, ...r });
          return;
        }
        // degraded 중의 localStorage 저장은 IDB 의 rev 를 알지 못하므로 기준 rev 를 올리지 않는다(IDB 가 다시 읽힐 때 외부 변경으로 비교한다)
        if (!degraded && rev !== undefined) knownRev = Math.max(knownRev, rev);
        knownUpdatedAt = Math.max(knownUpdatedAt, updatedAtOf(taken.value));
        setSave(pending ? { ...r, state: 'dirty' } : r);
        try { channel?.postMessage({ t: 'saved', id: tabId, updatedAt: updatedAtOf(taken.value), rev: rev ?? 0 }); } catch { /* 무시 */ }
      }
    });
    return chain;
  }

  /** 저장을 요청한다. 300ms 디바운스. 가드가 닫혀 있으면 쓰지 않고 saveStatus 를 blocked 로 둔다 */
  function save(value: T): void {
    pending = { value };
    if (degraded) degradedEdits = true;
    if (!guardOpen()) {
      if (timer) { clearTimeout(timer); timer = null; }
      blockedStatus();
      return;
    }
    setSave({ ...saveStatus, state: 'dirty', reason: undefined, message: undefined });
    schedule(debounceMs);
  }

  /** 대기 중인 저장을 바로 쓴다(디바운스 취소). 끝나면 resolve */
  function flush(): Promise<void> { return runFlush(); }

  /** 저장 대기 중인 변경이 있는가 */
  const hasPending = () => pending !== null;

  // ---- 다른 탭의 변경 ----
  async function checkExternal(opts: { idbOnly?: boolean } = {}): Promise<T | null> {
    if (!guardOpen()) return null;
    await chain;
    const read = await readAll();
    const { idbError } = read;
    const valid = read.valid.filter((v) => (opts.idbOnly ? v.source === 'indexedDB' : !(v.source === 'localStorage' && v.rev > 0 && v.rev <= ownLsRev)));
    if (!valid.length) return null;
    if (degraded && idbError !== undefined) return null; // 아직 IDB 를 못 읽는다: 읽히는 localStorage 사본은 이 탭이 쓴 것이다
    const best = valid.reduce(newer);
    // 저장 순번이 커졌거나(원격 반영도 올린다), 순번이 없는 기존 저장본이면 updatedAt 이 커졌을 때 외부 변경이다
    const external = best.rev > knownRev || (best.rev === knownRev && updatedAtOf(best.value) > knownUpdatedAt);
    if (!external) return null;
    // 기준은 원본 보존(await) 전에 올린다. 같은 변경을 두 번 알리지 않게 하려는 것이다
    knownRev = Math.max(knownRev, best.rev);
    knownUpdatedAt = Math.max(knownUpdatedAt, updatedAtOf(best.value));
    // load 와 같은 규칙: 검증을 통과했지만 일부가 버려진 원본은 훅이 원하면 보존하고 그 키를 알린다
    const { partialBackupKey, backupFailed } = await preservePartials(valid, best);
    const info: ExternalChangeInfo = { localDirty: pending !== null || degradedEdits, partialBackupKey, backupFailed };
    degradedEdits = false; // 이 알림으로 사용자 선택이 시작된다
    externalListeners.forEach((f) => { try { f(best.value, info); } catch { /* 무시 */ } });
    return best.value;
  }

  /**
   * IDB 를 못 읽어 localStorage 사본으로 열었을 때(degraded) 다시 IDB 를 읽어 본다. 읽히면 degraded 를 풀고 IDB 저장본을
   * 외부 변경으로 알린다(degraded 중 편집이 있었으면 localDirty 로 알려 사용자가 고르게 한다). 아직 못 읽으면 'still'.
   * IDB 에 저장본이 없으면 그대로 풀고 'recovered' 를 돌려준다(호출자가 현재 상태를 저장한다).
   */
  async function retryDegraded(): Promise<'still' | 'recovered'> {
    if (!degraded) return 'recovered';
    await chain;
    const { valid, idbError } = await readAll();
    if (idbError !== undefined) return 'still';
    degraded = false;
    setLoad({ ...loadStatus, degraded: undefined });
    const idbCopy = valid.find((v) => v.source === 'indexedDB');
    if (idbCopy) {
      knownRev = -1; // IDB 의 저장본은 어떤 rev 든 이 탭이 본 적 없는 것이다
      knownUpdatedAt = 0;
      await checkExternal({ idbOnly: true });
    } else {
      knownRev = Math.max(knownRev, lsRev());
    }
    return 'recovered';
  }

  /**
   * 다른 탭이 저장한 더 새 내용을 알아챘을 때 부른다. 자동으로 덮어쓰지 않는다 — 화면이 불러올지 정한다.
   * localDirty 가 true 면 이 탭에도 저장 전 편집이 있다(어느 쪽을 쓸지 사용자에게 물을 것).
   * info.partialBackupKey 는 부분 폐기 원본을 보존한 키(없으면 null), info.backupFailed 는 보존을 시도했으나 실패했다는 뜻이다.
   */
  function onExternalChange(cb: (value: T, info: ExternalChangeInfo) => void): () => void {
    externalListeners.add(cb);
    return () => { externalListeners.delete(cb); };
  }

  /** 창 수명 주기에 연결한다. 반환값은 해제 함수 */
  function attach(targets: AttachTargets = {}): () => void {
    const doc = targets.document === undefined ? (typeof document === 'undefined' ? null : document) : targets.document;
    const win = targets.window === undefined ? (typeof window === 'undefined' ? null : window) : targets.window;
    const onVis = () => {
      if (doc?.visibilityState === 'hidden') void flush();
      else if (doc?.visibilityState === 'visible') void checkExternal();
    };
    const onHide = () => {
      // 닫히는 중에는 비동기 쓰기가 끝나지 못할 수 있어 동기 저장소에 먼저 한 부 남긴다(읽을 때 더 새 쪽이 이긴다)
      if (pending && guardOpen() && storage) {
        try {
          const rev = Math.max(knownRev, lsRev()) + 1;
          storage.setItem(LS_STATE_KEY, JSON.stringify({ ...pending.value, rev }));
          ownLsRev = Math.max(ownLsRev, rev);
          if (!degraded) knownRev = rev; // 이 탭이 쓴 사본을 스스로 외부 변경으로 보지 않게 한다
        } catch { /* 용량 초과 등 */ }
      }
      void flush();
    };
    const onFocus = () => { void checkExternal(); };
    doc?.addEventListener('visibilitychange', onVis);
    win?.addEventListener('pagehide', onHide);
    win?.addEventListener('focus', onFocus);
    if (channelName && typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(channelName);
        channel.onmessage = (ev: MessageEvent) => {
          const d = ev.data as { t?: string; id?: string; updatedAt?: number; rev?: number } | null;
          if (!d || d.t !== 'saved' || d.id === tabId) return;
          // 저장 순번이 커졌으면(원격 반영 저장은 updatedAt 이 그대로다) 알림 하나만으로 다시 읽는다. 순번이 없는 옛 탭은 updatedAt 으로 본다
          if ((typeof d.rev === 'number' && d.rev > knownRev) || (typeof d.updatedAt === 'number' && d.updatedAt > knownUpdatedAt)) void checkExternal();
        };
      } catch { channel = null; }
    }
    return () => {
      doc?.removeEventListener('visibilitychange', onVis);
      win?.removeEventListener('pagehide', onHide);
      win?.removeEventListener('focus', onFocus);
      try { channel?.close(); } catch { /* 무시 */ }
      channel = null;
    };
  }

  // ---- 손상 원본 ----
  async function listCorruptBackups(): Promise<string[]> {
    const out = new Set<string>();
    if (factory) { try { (await idbKeys()).forEach((k) => { if (typeof k === 'string' && k.startsWith(CORRUPT_PREFIX)) out.add(k); }); } catch { /* 무시 */ } }
    if (storage && 'length' in storage && 'key' in storage) {
      try {
        const s = storage as unknown as Storage;
        for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(CORRUPT_PREFIX)) out.add(k); }
      } catch { /* 무시 */ }
    }
    return [...out].sort();
  }
  async function readCorruptBackup(key: string): Promise<unknown | null> {
    if (!key.startsWith(CORRUPT_PREFIX)) return null;
    if (factory) { try { const v = await idbGet(key); if (v !== undefined) return v; } catch { /* 무시 */ } }
    try { const t = storage?.getItem(key); if (t) return JSON.parse(t); } catch { /* 무시 */ }
    return null;
  }

  function dispose(): void {
    if (timer) { clearTimeout(timer); timer = null; }
    listeners.clear();
    externalListeners.clear();
    try { channel?.close(); } catch { /* 무시 */ }
    channel = null;
    const p = dbPromise;
    dbPromise = null;
    void p?.then((db) => db.close(), () => { /* 무시 */ });
  }

  return {
    load, retryLoad, save, flush, hasPending, allowSaveAnyway, retryDegraded,
    checkExternal, onExternalChange, attach,
    listCorruptBackups, readCorruptBackup, dispose,
    get loadStatus(): LoadStatus { return loadStatus; },
    get saveStatus(): SaveStatus { return saveStatus; },
    /** 상태가 바뀔 때마다 fn 호출(등록 즉시 한 번도 호출). 반환값은 해제 함수 */
    subscribe(fn: () => void): () => void { listeners.add(fn); fn(); return () => { listeners.delete(fn); }; },
  };
}

export type LocalStore<T extends StateLike> = ReturnType<typeof createLocalStore<T>>;

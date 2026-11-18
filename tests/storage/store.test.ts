import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CORRUPT_PREFIX, DB_NAME, LS_STATE_KEY, STATE_KEY, STORE_NAME, createLocalStore,
  type ExternalChangeInfo, type StorageLike,
} from '../../src/lib/storage/store';
import type { StateLike } from '../../src/lib/storage/stateTypes';

interface S extends StateLike { n: number }
const validate = (raw: unknown): S | null => {
  const o = raw as Partial<S> | null;
  return o && typeof o === 'object' && o.v === 3 && typeof o.n === 'number' && typeof o.updatedAt === 'number' ? (o as S) : null;
};
const mk = (n: number, updatedAt = n): S => ({ v: 3, n, updatedAt });

class MemStorage implements StorageLike {
  map = new Map<string, string>();
  throwOnSet: string | null = null;
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (this.throwOnSet) { const e = new Error('x'); e.name = this.throwOnSet; throw e; }
    this.map.set(k, v);
  }
  removeItem(k: string) { this.map.delete(k); }
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
}

/** 키-값을 IndexedDB 에 직접 넣거나 읽는다 */
async function idbRaw(f: IDBFactory, op: 'put' | 'get', key: string, value?: unknown): Promise<unknown> {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = f.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE_NAME);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const out = await new Promise<unknown>((res, rej) => {
    const tx = db.transaction(STORE_NAME, op === 'put' ? 'readwrite' : 'readonly');
    const os = tx.objectStore(STORE_NAME);
    if (op === 'put') { os.put(value, key); tx.oncomplete = () => res(undefined); } else { const q = os.get(key); q.onsuccess = () => res(q.result); }
    tx.onerror = () => rej(tx.error);
  });
  db.close();
  return out;
}

const stores: { dispose(): void }[] = [];
afterEach(() => { stores.splice(0).forEach((s) => s.dispose()); });
function setup(extra: Record<string, unknown> = {}) {
  const idb = new IDBFactory();
  const storage = new MemStorage();
  const store = createLocalStore<S>({ validate, indexedDB: idb, storage, debounceMs: 20, readTimeoutMs: 150, writeTimeoutMs: 150, channelName: null, ...extra });
  stores.push(store);
  return { idb, storage, store };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** open 이 영원히 끝나지 않는 IDBFactory(타임아웃 시험) */
const hangingIdb = { open: () => ({}) } as unknown as IDBFactory;
/** open 이 즉시 예외를 던지는 IDBFactory */
const brokenIdb = { open: () => { throw new Error('boom'); } } as unknown as IDBFactory;

describe('load', () => {
  it('저장된 적 없으면 empty', async () => {
    const { store } = setup();
    expect(await store.load()).toEqual({ status: 'empty' });
    expect(store.loadStatus.phase).toBe('empty');
  });

  it('IndexedDB 에 있으면 ok', async () => {
    const { store, idb } = setup();
    await idbRaw(idb, 'put', STATE_KEY, mk(1));
    const r = await store.load();
    expect(r).toMatchObject({ status: 'ok', source: 'indexedDB', value: { n: 1 } });
    expect(store.loadStatus.phase).toBe('ok');
  });

  it('IndexedDB 가 없고 localStorage 에만 있으면 ok(localStorage)', async () => {
    const { store, storage } = setup({ indexedDB: null });
    storage.setItem(LS_STATE_KEY, JSON.stringify(mk(2)));
    expect(await store.load()).toMatchObject({ status: 'ok', source: 'localStorage', value: { n: 2 } });
  });

  it('둘 다 있으면 더 새 것', async () => {
    const { store, idb, storage } = setup();
    await idbRaw(idb, 'put', STATE_KEY, mk(1, 100));
    storage.setItem(LS_STATE_KEY, JSON.stringify(mk(2, 200)));
    expect(await store.load()).toMatchObject({ status: 'ok', source: 'localStorage', value: { n: 2 } });
  });

  it('IndexedDB 가 응답하지 않고 localStorage 도 비면 failed(empty 가 아니다)', async () => {
    const { store } = setup({ indexedDB: hangingIdb });
    const r = await store.load();
    expect(r.status).toBe('failed');
    expect(store.loadStatus.phase).toBe('failed');
    expect(store.loadStatus.message).toBeTruthy();
  });

  it('IndexedDB 열기 예외도 failed', async () => {
    const { store } = setup({ indexedDB: brokenIdb });
    expect((await store.load()).status).toBe('failed');
  });

  it('IndexedDB 는 실패해도 localStorage 에 값이 있으면 ok', async () => {
    const { store, storage } = setup({ indexedDB: brokenIdb });
    storage.setItem(LS_STATE_KEY, JSON.stringify(mk(5)));
    expect((await store.load()).status).toBe('ok');
  });

  it('저장소가 전혀 없으면 empty(쓴 적이 없다)', async () => {
    const { store } = setup({ indexedDB: null, storage: null });
    expect((await store.load()).status).toBe('empty');
  });

  it('검증에 실패하면 corrupt 이고 원본을 examPlanner.corrupt.<시각> 에 보존한다', async () => {
    const { store, idb } = setup();
    const bad = { v: 99, n: 'x', updatedAt: 1 };
    await idbRaw(idb, 'put', STATE_KEY, bad);
    const r = await store.load();
    expect(r.status).toBe('corrupt');
    const key = r.status === 'corrupt' ? r.backupKey : null;
    expect(key).toMatch(new RegExp(`^${CORRUPT_PREFIX.replace(/\./g, '\\.')}\\d+`));
    expect(await store.listCorruptBackups()).toContain(key);
    expect(await store.readCorruptBackup(key!)).toMatchObject({ source: 'indexedDB', raw: bad });
    // 원본 상태는 그대로다
    expect(await idbRaw(idb, 'get', STATE_KEY)).toEqual(bad);
  });

  it('localStorage 의 깨진 JSON 도 corrupt 이고 보존한다', async () => {
    const { store, storage } = setup({ indexedDB: null });
    storage.setItem(LS_STATE_KEY, '{깨진');
    const r = await store.load();
    expect(r.status).toBe('corrupt');
    expect([...storage.map.keys()].some((k) => k.startsWith(CORRUPT_PREFIX))).toBe(true);
  });

  it('validate 가 예외를 던져도 corrupt', async () => {
    const { store, idb } = setup({ validate: () => { throw new Error('x'); } });
    await idbRaw(idb, 'put', STATE_KEY, mk(1));
    expect((await store.load()).status).toBe('corrupt');
  });

  it('retryLoad: 실패 뒤 저장소가 살아나면 ok 가 된다', async () => {
    const idb = new IDBFactory();
    let broken = true;
    const flaky = { open: (...a: [string, number]) => (broken ? brokenIdb.open(...a) : idb.open(...a)) } as unknown as IDBFactory;
    const { store } = setup({ indexedDB: flaky });
    await idbRaw(idb, 'put', STATE_KEY, mk(7));
    expect((await store.load()).status).toBe('failed');
    broken = false;
    expect(await store.retryLoad()).toMatchObject({ status: 'ok', value: { n: 7 } });
    expect(store.loadStatus.phase).toBe('ok');
  });
});

describe('저장 가드', () => {
  it('load 전에는 쓰지 않는다', async () => {
    const { store, idb } = setup();
    store.save(mk(1));
    await store.flush();
    expect(store.saveStatus).toMatchObject({ state: 'blocked', reason: 'not-loaded' });
    expect(await idbRaw(idb, 'get', STATE_KEY)).toBeUndefined();
  });

  it('failed 일 때 save 를 불러도 저장된 데이터를 덮어쓰지 않는다', async () => {
    const idb = new IDBFactory();
    let broken = true;
    const flaky = { open: (...a: [string, number]) => (broken ? brokenIdb.open(...a) : idb.open(...a)) } as unknown as IDBFactory;
    const { store, storage } = setup({ indexedDB: flaky });
    await idbRaw(idb, 'put', STATE_KEY, mk(10));
    expect((await store.load()).status).toBe('failed');
    broken = false; // 저장소가 다시 쓸 수 있게 돼도 가드가 막아야 한다
    store.save(mk(1, 999));
    await store.flush();
    await sleep(60);
    expect(store.saveStatus).toMatchObject({ state: 'blocked', reason: 'load-failed' });
    expect(await idbRaw(idb, 'get', STATE_KEY)).toMatchObject({ n: 10 });
    expect(storage.map.has(LS_STATE_KEY)).toBe(false);
  });

  it('corrupt 일 때도 막는다', async () => {
    const { store, idb } = setup();
    await idbRaw(idb, 'put', STATE_KEY, { v: 1 });
    await store.load();
    store.save(mk(1));
    await store.flush();
    expect(store.saveStatus).toMatchObject({ state: 'blocked', reason: 'load-corrupt' });
    expect(await idbRaw(idb, 'get', STATE_KEY)).toEqual({ v: 1 });
  });

  it('allowSaveAnyway 로 가드를 풀면 대기 중이던 저장이 나간다', async () => {
    const { store, idb } = setup();
    await idbRaw(idb, 'put', STATE_KEY, { v: 1 });
    await store.load();
    store.save(mk(3));
    store.allowSaveAnyway();
    await sleep(60);
    expect(store.saveStatus.state).toBe('saved');
    expect(await idbRaw(idb, 'get', STATE_KEY)).toMatchObject({ n: 3 });
  });

  it('empty 이면 저장한다', async () => {
    const { store, idb } = setup();
    await store.load();
    store.save(mk(4));
    await store.flush();
    expect(await idbRaw(idb, 'get', STATE_KEY)).toMatchObject({ n: 4 });
  });
});

describe('디바운스와 flush', () => {
  it('연속 save 는 마지막 값 한 번만 쓰고, 지연 전에는 쓰지 않는다', async () => {
    const { store, idb } = setup();
    await store.load();
    store.save(mk(1)); store.save(mk(2)); store.save(mk(3));
    expect(store.saveStatus.state).toBe('dirty');
    expect(store.hasPending()).toBe(true);
    expect(await idbRaw(idb, 'get', STATE_KEY)).toBeUndefined();
    await sleep(120);
    expect(await idbRaw(idb, 'get', STATE_KEY)).toMatchObject({ n: 3 });
    expect(store.saveStatus).toMatchObject({ state: 'saved', where: 'indexedDB' });
    expect(store.hasPending()).toBe(false);
  });

  it('flush 는 디바운스를 기다리지 않고 바로 쓴다', async () => {
    const { store, idb } = setup({ debounceMs: 10_000 });
    await store.load();
    store.save(mk(8));
    await store.flush();
    expect(await idbRaw(idb, 'get', STATE_KEY)).toMatchObject({ n: 8 });
  });

  it('visibilitychange(hidden) 와 pagehide 에서 즉시 flush 한다', async () => {
    const { store, idb } = setup({ debounceMs: 10_000 });
    await store.load();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
    const win = new EventTarget();
    const detach = store.attach({ document: doc as never, window: win as never });
    store.save(mk(5));
    (doc as { visibilityState: string }).visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await sleep(60);
    expect(await idbRaw(idb, 'get', STATE_KEY)).toMatchObject({ n: 5 });
    store.save(mk(6));
    win.dispatchEvent(new Event('pagehide'));
    await sleep(60);
    expect(await idbRaw(idb, 'get', STATE_KEY)).toMatchObject({ n: 6 });
    detach();
  });

  it('IndexedDB 에 쓰면 localStorage 의 옛 사본을 지운다', async () => {
    const { store, storage } = setup();
    storage.setItem(LS_STATE_KEY, JSON.stringify(mk(1)));
    await store.load();
    store.save(mk(2, 50));
    await store.flush();
    expect(storage.map.has(LS_STATE_KEY)).toBe(false);
  });
});

describe('저장 실패 표시', () => {
  it('IndexedDB 가 없고 localStorage 용량이 넘치면 quota 이유를 노출하고 다음 flush 에서 다시 쓴다', async () => {
    const { store, storage } = setup({ indexedDB: null });
    await store.load();
    storage.throwOnSet = 'QuotaExceededError';
    store.save(mk(1));
    await store.flush();
    expect(store.saveStatus).toMatchObject({ state: 'failed', reason: 'quota', where: 'memory' });
    expect(store.saveStatus.message).toContain('저장 공간');
    expect(store.hasPending()).toBe(true);
    storage.throwOnSet = null;
    await store.flush();
    expect(store.saveStatus).toMatchObject({ state: 'saved', where: 'localStorage' });
  });

  it('저장소가 전혀 없으면 unavailable', async () => {
    const { store } = setup({ indexedDB: null, storage: null });
    await store.load();
    store.save(mk(1));
    await store.flush();
    expect(store.saveStatus).toMatchObject({ state: 'failed', reason: 'unavailable' });
  });

  it('IndexedDB 쓰기 실패는 localStorage 로 내려간다', async () => {
    const { store, storage } = setup({ indexedDB: brokenIdb });
    storage.setItem(LS_STATE_KEY, JSON.stringify(mk(0)));
    await store.load(); // ok(localStorage)
    store.save(mk(9, 500));
    await store.flush();
    expect(store.saveStatus).toMatchObject({ state: 'saved', where: 'localStorage' });
    expect(JSON.parse(storage.map.get(LS_STATE_KEY)!)).toMatchObject({ n: 9 });
  });

  it('구독자는 상태 변화를 받는다', async () => {
    const { store } = setup();
    const seen: string[] = [];
    const off = store.subscribe(() => seen.push(`${store.loadStatus.phase}/${store.saveStatus.state}`));
    await store.load();
    store.save(mk(1));
    await store.flush();
    off();
    expect(seen[0]).toBe('idle/idle');
    expect(seen).toContain('loading/idle');
    expect(seen.at(-1)).toBe('empty/saved');
  });
});

describe('다른 탭의 변경', () => {
  it('BroadcastChannel 알림을 받으면 더 새 내용을 읽어 알린다(자동 덮어쓰기 없음)', async () => {
    const idb = new IDBFactory();
    const storage = new MemStorage();
    const name = `test-ch-${Math.random()}`;
    const common = { validate, indexedDB: idb, storage, debounceMs: 10, channelName: name };
    const a = createLocalStore<S>(common); const b = createLocalStore<S>(common);
    stores.push(a, b);
    await a.load(); await b.load();
    const da = a.attach({ document: null, window: null });
    const db = b.attach({ document: null, window: null });
    const got: { n: number; dirty: boolean }[] = [];
    b.onExternalChange((v, info) => got.push({ n: v.n, dirty: info.localDirty }));
    a.save(mk(11, 1000));
    await a.flush();
    await sleep(120);
    expect(got).toEqual([{ n: 11, dirty: false }]);
    da(); db();
  });

  it('창이 다시 보일 때 재읽기해 더 새 내용이면 알린다, 같으면 알리지 않는다', async () => {
    const { store, idb } = setup();
    await idbRaw(idb, 'put', STATE_KEY, mk(1, 100));
    await store.load();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'hidden' as DocumentVisibilityState });
    const detach = store.attach({ document: doc as never, window: null });
    const got: number[] = [];
    store.onExternalChange((v) => got.push(v.n));
    (doc as { visibilityState: string }).visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await sleep(50);
    expect(got).toEqual([]);
    await idbRaw(idb, 'put', STATE_KEY, mk(2, 200)); // 다른 탭이 저장
    doc.dispatchEvent(new Event('visibilitychange'));
    await sleep(50);
    expect(got).toEqual([2]);
    doc.dispatchEvent(new Event('visibilitychange'));
    await sleep(50);
    expect(got).toEqual([2]);
    detach();
  });
});

describe('부분 폐기 원본 보존 (shouldBackupRaw)', () => {
  const PARTIAL_KEY_RE = new RegExp(`^${CORRUPT_PREFIX.replace(/\./g, '\\.')}\\d+`);

  it('훅이 true 면 ok 를 돌려주기 전에 원본을 보존하고 키를 노출한다(원본 동일, reason partial)', async () => {
    const seen: unknown[] = [];
    const { store, idb } = setup({ shouldBackupRaw: (raw: unknown) => { seen.push(raw); return true; } });
    const raw = mk(1);
    await idbRaw(idb, 'put', STATE_KEY, raw);
    const r = await store.load();
    expect(r).toMatchObject({ status: 'ok', source: 'indexedDB', value: { n: 1 }, backupFailed: false });
    const key = r.status === 'ok' ? r.partialBackupKey ?? null : null;
    expect(key).toMatch(PARTIAL_KEY_RE);
    expect(seen).toEqual([raw]);
    expect(store.loadStatus).toMatchObject({ phase: 'ok', partialBackupKey: key, backupFailed: false });
    expect(await store.listCorruptBackups()).toEqual([key]);
    expect(await store.readCorruptBackup(key!)).toEqual({ at: expect.any(Number), source: 'indexedDB', raw, reason: 'partial' });
    expect(await idbRaw(idb, 'get', STATE_KEY)).toEqual(raw); // 저장본은 건드리지 않는다
  });

  it('훅이 false 면 백업하지 않고 partialBackupKey 는 null 이다', async () => {
    const { store, idb } = setup({ shouldBackupRaw: () => false });
    await idbRaw(idb, 'put', STATE_KEY, mk(1));
    const r = await store.load();
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' ? r.partialBackupKey : undefined).toBeNull();
    expect(store.loadStatus.partialBackupKey).toBeNull();
    expect(await store.listCorruptBackups()).toEqual([]);
  });

  it('훅이 없으면 백업하지 않는다(기존 동작)', async () => {
    const { store, idb } = setup();
    await idbRaw(idb, 'put', STATE_KEY, mk(1));
    const r = await store.load();
    expect(r.status === 'ok' ? r.partialBackupKey : undefined).toBeNull();
    expect(await store.listCorruptBackups()).toEqual([]);
  });

  it('백업이 실패해도 ok 를 유지하고 backupFailed 표지를 남기며, 저장은 막히지 않는다', async () => {
    const { store, storage } = setup({ indexedDB: null, shouldBackupRaw: () => true });
    storage.setItem(LS_STATE_KEY, JSON.stringify(mk(2)));
    storage.throwOnSet = 'QuotaExceededError'; // 백업 쓰기가 실패하도록
    const r = await store.load();
    expect(r).toMatchObject({ status: 'ok', source: 'localStorage', value: { n: 2 }, partialBackupKey: null, backupFailed: true });
    expect(store.loadStatus).toMatchObject({ phase: 'ok', partialBackupKey: null, backupFailed: true });
    expect(await store.listCorruptBackups()).toEqual([]);
    storage.throwOnSet = null;
    store.save(mk(3));
    await store.flush();
    expect(store.saveStatus.state).toBe('saved');
  });

  it('같은 원본을 여러 번 읽어도 백업은 하나만 생기고 같은 키를 돌려준다', async () => {
    const { store, idb } = setup({ shouldBackupRaw: () => true });
    await idbRaw(idb, 'put', STATE_KEY, mk(1));
    const a = await store.load();
    const b = await store.load();
    const ka = a.status === 'ok' ? a.partialBackupKey : undefined;
    const kb = b.status === 'ok' ? b.partialBackupKey : undefined;
    expect(ka).toMatch(PARTIAL_KEY_RE);
    expect(kb).toBe(ka);
    expect(await store.listCorruptBackups()).toHaveLength(1);
  });

  it('부분 백업 키의 보존 형식에는 reason partial 이 붙는다', async () => {
    const { store, idb } = setup({ shouldBackupRaw: () => true });
    await idbRaw(idb, 'put', STATE_KEY, mk(1));
    const r = await store.load();
    const key = r.status === 'ok' ? r.partialBackupKey! : '';
    const env = await store.readCorruptBackup(key) as { reason?: string };
    expect(env.reason).toBe('partial');
  });
});

describe('다른 탭 변경의 부분 폐기 원본 보존 (checkExternal)', () => {
  const PARTIAL_KEY_RE = new RegExp(`^${CORRUPT_PREFIX.replace(/\./g, '\\.')}\\d+`);
  /** n 이 2 인 저장본만 부분 폐기로 본다(처음 읽는 값 mk(1) 은 백업하지 않게 한다) */
  const hookN2 = (raw: unknown) => (raw as S).n === 2;

  /** 같은 IndexedDB·localStorage 를 쓰는 '탭' 하나 */
  function tab(idb: IDBFactory | null, storage: MemStorage, extra: Record<string, unknown> = {}) {
    const s = createLocalStore<S>({
      validate, indexedDB: idb, storage, debounceMs: 10, readTimeoutMs: 150, writeTimeoutMs: 150, channelName: null, ...extra,
    });
    stores.push(s);
    return s;
  }

  it('훅이 true 면 외부 값의 원본을 보존하고 info 로 키를 알린다(원본 동일, reason partial)', async () => {
    const idb = new IDBFactory();
    const storage = new MemStorage();
    const a = tab(idb, storage, { shouldBackupRaw: hookN2 });
    await idbRaw(idb, 'put', STATE_KEY, mk(1, 100));
    await a.load();
    const got: { n: number; info: ExternalChangeInfo }[] = [];
    a.onExternalChange((v, info) => got.push({ n: v.n, info }));
    const raw = mk(2, 200);
    await idbRaw(idb, 'put', STATE_KEY, raw); // 다른 탭이 저장
    await a.checkExternal();
    expect(got).toHaveLength(1);
    expect(got[0].n).toBe(2);
    const key = got[0].info.partialBackupKey;
    expect(key).toMatch(PARTIAL_KEY_RE);
    expect(got[0].info).toEqual({ localDirty: false, partialBackupKey: key, backupFailed: false });
    expect(await a.listCorruptBackups()).toEqual([key]);
    expect(await a.readCorruptBackup(key!)).toEqual({ at: expect.any(Number), source: 'indexedDB', raw, reason: 'partial' });
    expect(await idbRaw(idb, 'get', STATE_KEY)).toEqual(raw); // 저장본은 건드리지 않는다
  });

  it('훅이 false 면 외부 변경을 알리되 백업하지 않고 partialBackupKey 는 null 이다', async () => {
    const idb = new IDBFactory();
    const storage = new MemStorage();
    const a = tab(idb, storage, { shouldBackupRaw: () => false });
    await idbRaw(idb, 'put', STATE_KEY, mk(1, 100));
    await a.load();
    const got: ExternalChangeInfo[] = [];
    a.onExternalChange((_v, info) => got.push(info));
    await idbRaw(idb, 'put', STATE_KEY, mk(2, 200));
    await a.checkExternal();
    expect(got).toEqual([{ localDirty: false, partialBackupKey: null, backupFailed: false }]);
    expect(await a.listCorruptBackups()).toEqual([]);
  });

  it('훅이 없으면(기존 동작) 백업하지 않는다', async () => {
    const idb = new IDBFactory();
    const a = tab(idb, new MemStorage());
    await idbRaw(idb, 'put', STATE_KEY, mk(1, 100));
    await a.load();
    const got: ExternalChangeInfo[] = [];
    a.onExternalChange((_v, info) => got.push(info));
    await idbRaw(idb, 'put', STATE_KEY, mk(2, 200));
    await a.checkExternal();
    expect(got[0].partialBackupKey).toBeNull();
    expect(await a.listCorruptBackups()).toEqual([]);
  });

  it('같은 외부 원본을 두 탭이 알아채도 백업은 하나만 생기고 같은 키를 알린다', async () => {
    const idb = new IDBFactory();
    const storage = new MemStorage();
    const x = tab(idb, storage, { shouldBackupRaw: hookN2 });
    const y = tab(idb, storage, { shouldBackupRaw: hookN2 });
    await idbRaw(idb, 'put', STATE_KEY, mk(1, 100));
    await x.load();
    await y.load();
    const kx: (string | null)[] = [];
    const ky: (string | null)[] = [];
    x.onExternalChange((_v, info) => kx.push(info.partialBackupKey));
    y.onExternalChange((_v, info) => ky.push(info.partialBackupKey));
    await idbRaw(idb, 'put', STATE_KEY, mk(2, 200));
    await x.checkExternal();
    await y.checkExternal();
    expect(kx[0]).toMatch(PARTIAL_KEY_RE);
    expect(ky).toEqual(kx);
    expect(await x.listCorruptBackups()).toHaveLength(1);
    await x.checkExternal(); // 이미 알린 값이면 다시 알리지도, 다시 보존하지도 않는다
    expect(kx).toHaveLength(1);
    expect(await x.listCorruptBackups()).toHaveLength(1);
  });

  it('백업이 실패해도 외부 값은 알리고, backupFailed 표지를 남기며, 이후 저장은 막히지 않는다', async () => {
    const storage = new MemStorage();
    storage.setItem(LS_STATE_KEY, JSON.stringify(mk(1, 100)));
    const a = tab(null, storage, { shouldBackupRaw: hookN2 });
    await a.load();
    const got: { n: number; info: ExternalChangeInfo }[] = [];
    a.onExternalChange((v, info) => got.push({ n: v.n, info }));
    storage.map.set(LS_STATE_KEY, JSON.stringify(mk(2, 200))); // 다른 탭이 저장
    storage.throwOnSet = 'QuotaExceededError'; // 백업 쓰기만 실패하도록
    await a.checkExternal();
    expect(got).toEqual([{ n: 2, info: { localDirty: false, partialBackupKey: null, backupFailed: true } }]);
    expect(await a.listCorruptBackups()).toEqual([]);
    storage.throwOnSet = null;
    a.save(mk(3, 300));
    await a.flush();
    expect(a.saveStatus.state).toBe('saved');
  });
});

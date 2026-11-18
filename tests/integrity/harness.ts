// @vitest-environment node
// 데이터 무결성 회귀 시험 공용 도구: 실제 서버 핸들러(D1Shim) · 실제 코덱 · 실제 엔진 · 실제 어댑터 + createApp/createLocalStore(fake-indexeddb).
// 읽기 전용 검증(2026-11)이 재현한 결함을 회귀 시험으로 고정한다. 원본 재현 시험은 이 폴더의 *.test.ts 로 옮겼다.
import { IDBFactory } from 'fake-indexeddb';
import { handleRequest, type Env } from 'sync-kit/handler';
import { D1Shim } from 'sync-kit/testing';
import { createCodec, createMemoryMetaStore, createSyncEngine, createTransport, deriveKeys } from 'sync-kit';
import { createApp, type App } from '../../src/lib/app/app.svelte';
import { createValidator } from '../../src/lib/app/appCore';
import type { State } from '../../src/lib/core/types';
import { createSyncAdapter } from '../../src/lib/sync/adapter';
import { APP_ID, SYNC_LIMITS } from '../../src/lib/sync/appTypes';
import { createLocalStore, type StorageLike } from '../../src/lib/storage/store';
import { memHost } from '../sync/helpers';

export const URL_BASE = 'https://sync.test';
export const INVITE = 'invite-code';

export function makeServer() {
  const db = new D1Shim();
  const env: Env = { DB: db, INVITE_CODE: INVITE, ALLOWED_APPS: APP_ID };
  return { db, fetch: (async (url: string, init: RequestInit) => handleRequest(new Request(url, init), env, { now: () => Date.now(), random: () => 1 })) as typeof fetch };
}
export type Server = ReturnType<typeof makeServer>;

export async function engineFor(server: Server, syncKey: string, adapter: ReturnType<typeof createSyncAdapter>, meta = createMemoryMetaStore()) {
  const keys = await deriveKeys(syncKey, APP_ID);
  const engine = createSyncEngine({
    config: { workerUrl: URL_BASE, syncKey, inviteCode: INVITE }, appId: APP_ID, limits: SYNC_LIMITS, adapter, meta,
    codec: createCodec(keys.encKey),
    transport: createTransport({ workerUrl: URL_BASE, appId: APP_ID, spaceId: keys.spaceId, authToken: keys.authToken }, server.fetch),
    autoSchedule: false,
  });
  return { engine, meta };
}

/** 메모리 호스트 기기(앱 없이 어댑터만) */
export async function makeDevice(server: Server, syncKey: string, state?: State) {
  const host = memHost(state);
  const { engine, meta } = await engineFor(server, syncKey, createSyncAdapter(host));
  return { host, engine, meta };
}
export type Dev = Awaited<ReturnType<typeof makeDevice>>;
export const edit = (d: Dev, at: number, fn: (s: State) => void) => { fn(d.host.state); d.host.state.updatedAt = at; };
export const sync = async (...ds: Dev[]) => { for (const d of ds) await d.engine.syncNow(); };
export const names = (d: Dev) => d.host.state.exams.map((e) => e.name).sort();

export class Mem implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
}
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 같은 저장소(IDB+LS)를 쓰는 앱 인스턴스('탭') 하나 */
export function mkTab(idb: IDBFactory, storage: Mem, opts: { channel?: string | null; now?: () => number; debounceMs?: number } = {}): App {
  return createApp({
    storeOptions: { indexedDB: idb, storage, channelName: opts.channel === undefined ? null : opts.channel, debounceMs: opts.debounceMs ?? 0 },
    notifyLocalChange: () => {}, sync: false, ...(opts.now ? { now: opts.now } : {}),
  });
}

/** 상태를 저장소에 미리 써 둔다(검증을 거쳐 저장하는 별도 store) */
export async function seed(idb: IDBFactory, storage: Mem, st: State) {
  const v = createValidator();
  const s = createLocalStore<State>({ indexedDB: idb, storage, channelName: null, debounceMs: 0, validate: v.validate });
  await s.load(); s.save(st); await s.flush(); s.dispose();
}

/** 검증을 건너뛰고 IDB 에 원본을 직접 쓴다 */
export function putRawIdb(idb: IDBFactory, raw: unknown): Promise<void> {
  return new Promise((res, rej) => {
    const r = idb.open('examPlanner', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
    r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(raw, 'state'); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
    r.onerror = () => rej(r.error);
  });
}
export const readIdb = (idb: IDBFactory) => new Promise<State | undefined>((res, rej) => {
  const r = idb.open('examPlanner', 1);
  r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('state'); q.onsuccess = () => { r.result.close(); res(q.result as State | undefined); }; q.onerror = () => rej(q.error); };
  r.onerror = () => rej(r.error);
});

/** open 만 실패시킬 수 있는 IDB 래퍼 */
export function flaky(real: IDBFactory) {
  const ctl = { fail: false };
  const f = {
    open(name: string, ver?: number) {
      if (!ctl.fail) return real.open(name, ver);
      const r: Record<string, unknown> = {};
      setTimeout(() => (r.onerror as (() => void) | undefined)?.(), 0);
      Object.defineProperty(r, 'error', { value: new Error('boom') });
      return r as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
  return { f, ctl };
}

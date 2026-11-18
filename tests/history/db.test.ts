import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import type { LogEntry, SnapshotRecord } from '../../src/lib/history/core';
import { HISTORY_DB_NAME, LOG_STORE, SNAPSHOT_STORE, createHistoryDb, type HistoryStatus } from '../../src/lib/history/db';

const rec = (id: string, at = 1): SnapshotRecord => ({
  id, at, kind: 'manual', label: id, device: 'd', pinned: false, hash: id, counts: { exams: 1, tasks: 2, subs: 3, library: 4 }, bytes: 3,
  state: { enc: 'raw', data: new Uint8Array([1, 2, 3]) },
});
const ent = (id: string): LogEntry => ({ id, at: 1, device: 'd', label: '변경', kind: 'local', count: 1 });

describe('IndexedDB 저장', () => {
  it('저장·목록·삭제가 새 연결에서도 이어진다(Uint8Array 본문 포함)', async () => {
    const idb = new IDBFactory();
    const a = createHistoryDb({ indexedDB: idb });
    await a.load();
    expect(a.status.state).toBe('ok');
    expect(await a.putSnapshot(rec('s1'))).toBe(true);
    expect(await a.putSnapshot(rec('s2'))).toBe(true);
    expect(await a.putLog([ent('l1'), ent('l2')])).toBe(true);
    expect(await a.deleteSnapshots(['s1'])).toBe(true);
    expect(await a.deleteLog(['l1'])).toBe(true);
    a.close();

    const b = createHistoryDb({ indexedDB: idb });
    await b.load();
    expect(b.snapshots().map((r) => r.id)).toEqual(['s2']);
    expect([...b.snapshot('s2')!.state!.data]).toEqual([1, 2, 3]);
    expect(b.log().map((e) => e.id)).toEqual(['l2']);
    b.close();
  });

  it('DB 이름과 저장소 이름·keyPath', async () => {
    const idb = new IDBFactory();
    const a = createHistoryDb({ indexedDB: idb });
    await a.load();
    a.close();
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = idb.open(HISTORY_DB_NAME);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    expect(db.version).toBe(1);
    expect([...db.objectStoreNames].sort()).toEqual([LOG_STORE, SNAPSHOT_STORE].sort());
    expect(db.transaction(SNAPSHOT_STORE).objectStore(SNAPSHOT_STORE).keyPath).toBe('id');
    expect(db.transaction(LOG_STORE).objectStore(LOG_STORE).keyPath).toBe('id');
    db.close();
  });

  it('다시 읽으면 다른 탭에서 지운 항목이 사라진다', async () => {
    const idb = new IDBFactory();
    const a = createHistoryDb({ indexedDB: idb });
    const b = createHistoryDb({ indexedDB: idb });
    await a.load();
    await b.load();
    await a.putSnapshot(rec('s1'));
    await b.load();
    expect(b.snapshots()).toHaveLength(1);
    await b.deleteSnapshots(['s1']);
    await a.load();
    expect(a.snapshots()).toHaveLength(0);
    a.close();
    b.close();
  });
});

describe('폴백', () => {
  it('IndexedDB 가 없으면 메모리로 동작하고 상태에 알린다', async () => {
    const seen: HistoryStatus[] = [];
    const db = createHistoryDb({ indexedDB: null, onStatus: (s) => seen.push(s) });
    await db.load();
    expect(db.status.state).toBe('memory');
    expect(db.status.message).toContain('이 창을 닫으면');
    expect(await db.putSnapshot(rec('s1'))).toBe(false);
    expect(db.snapshots().map((r) => r.id)).toEqual(['s1']);
    await db.deleteSnapshots(['s1']);
    expect(db.snapshots()).toEqual([]);
    expect(seen.at(-1)?.state).toBe('memory');
  });

  it('open 이 던지면 메모리 모드이고 던지지 않는다', async () => {
    const db = createHistoryDb({ indexedDB: { open() { throw new Error('boom'); } } as unknown as IDBFactory });
    await expect(db.load()).resolves.toBeUndefined();
    expect(db.status.state).toBe('memory');
    await db.putLog([ent('l1')]);
    expect(db.log()).toHaveLength(1);
  });

  it('응답이 없으면 타임아웃 뒤 메모리 모드', async () => {
    const never = { open: () => ({}) } as unknown as IDBFactory;
    const db = createHistoryDb({ indexedDB: never, timeoutMs: 30 });
    await db.load();
    expect(db.status.state).toBe('memory');
  });

  it('쓰기 실패는 failed 로 노출하고 메모리 사본은 유지하며, 다음 성공에서 ok 로 돌아온다', async () => {
    const idb = new IDBFactory();
    const db = createHistoryDb({ indexedDB: idb });
    await db.load();
    const probe = await new Promise<IDBDatabase>((res) => { const r = idb.open(HISTORY_DB_NAME); r.onsuccess = () => res(r.result); });
    const proto = Object.getPrototypeOf(probe) as IDBDatabase;
    probe.close();
    const orig = proto.transaction;
    const spy = vi.spyOn(proto, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      if (args[1] === 'readwrite') throw new DOMException('full', 'QuotaExceededError');
      return orig.apply(this, args);
    });
    try {
      expect(await db.putSnapshot(rec('s1'))).toBe(false);
      expect(db.status).toMatchObject({ state: 'failed', reason: 'quota' });
      expect(db.status.message).toContain('저장 공간');
      expect(db.snapshot('s1')).toBeDefined();
    } finally {
      spy.mockRestore();
    }
    expect(await db.putSnapshot(rec('s2'))).toBe(true);
    expect(db.status.state).toBe('ok');
    db.close();
  });
});

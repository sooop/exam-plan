// C-1: 원격 반영이 다른 탭에 보이지 않아, 낡은 탭의 편집이 원격 항목을 삭제로 올리던 결함의 회귀 시험.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createMemoryMetaStore, generateSyncKey } from 'sync-kit';
import { createSyncAdapter } from '../../src/lib/sync/adapter';
import { createValidator } from '../../src/lib/app/appCore';
import { createLocalStore } from '../../src/lib/storage/store';
import { resetPrefsMemory } from '../../src/lib/storage/prefs';
import { newState } from '../../src/lib/core';
import type { State } from '../../src/lib/core/types';
import { mkExam } from '../sync/helpers';
import { Mem, edit, engineFor, makeDevice, makeServer, mkTab, seed, sync, wait } from './harness';

const names = (s: State) => s.exams.map((e) => e.name).sort();

async function setup(channel: string | null, debounceMs = 0) {
  resetPrefsMemory();
  const idb = new IDBFactory(); const storage = new Mem();
  const seedState = newState();
  mkExam(seedState, 'Y', ['국어']); seedState.updatedAt = Date.now() - 100000;
  await seed(idb, storage, seedState);
  const tab1 = mkTab(idb, storage, { channel });
  const tab2 = mkTab(idb, storage, { channel, debounceMs });
  await tab1.init(); await tab2.init();
  const server = makeServer(); const key = generateSyncKey();
  const meta = createMemoryMetaStore();
  return { idb, storage, tab1, tab2, server, key, meta };
}

describe('C-1 저장 순번(rev)', () => {
  it('store: updatedAt 이 같아도 다른 저장소 인스턴스의 저장을 외부 변경으로 알아챈다', async () => {
    const idb = new IDBFactory(); const storage = new Mem();
    const v = createValidator();
    const mk = () => createLocalStore<State>({ indexedDB: idb, storage, channelName: null, debounceMs: 0, validate: v.validate });
    const base = newState(); mkExam(base, 'Y', ['국어']); base.updatedAt = 5000;
    await seed(idb, storage, base);
    const a = mk(); const b = mk();
    const ra = await a.load(); await b.load();
    expect(ra.status).toBe('ok');
    // b 가 원격 반영처럼 updatedAt 을 올리지 않고 내용만 바꿔 저장한다
    const next = JSON.parse(JSON.stringify(base)) as State;
    mkExam(next, 'X', ['수학']); next.updatedAt = 5000;
    b.save(next); await b.flush();
    const got = await a.checkExternal();
    expect(got).not.toBeNull();
    expect(names(got!)).toEqual(['X', 'Y']);
    expect(await a.checkExternal()).toBeNull(); // 같은 변경을 두 번 알리지 않는다
    a.dispose(); b.dispose();
  });

  it('store: rev 없는 기존 저장본도 읽고, 다음 저장부터 rev 가 붙는다', async () => {
    const idb = new IDBFactory(); const storage = new Mem();
    const v = createValidator();
    const legacy = newState(); mkExam(legacy, 'Old', ['국어']); legacy.updatedAt = 100;
    const { putRawIdb, readIdb } = await import('./harness');
    await putRawIdb(idb, legacy);
    const s = createLocalStore<State>({ indexedDB: idb, storage, channelName: null, debounceMs: 0, validate: v.validate });
    expect((await s.load()).status).toBe('ok');
    const next = JSON.parse(JSON.stringify(legacy)) as State; next.updatedAt = 101;
    s.save(next); await s.flush();
    expect((await readIdb(idb) as unknown as { rev: number }).rev).toBeGreaterThan(0);
    s.dispose();
  });
});

describe('C-1 두 탭 + 기기 B', () => {
  it('원격 시험이 다른 탭에도 반영되고, 그 탭의 편집이 원격 시험을 지우지 않는다', async () => {
    const { tab1, tab2, server, key, meta } = await setup('integrity-c1-a');
    const e1 = await engineFor(server, key, createSyncAdapter(tab1.createSyncHost()), meta);
    await e1.engine.syncNow();
    const b = await makeDevice(server, key);
    await sync(b);
    edit(b, Date.now() - 50000, (s) => { mkExam(s, 'X', ['수학']); });
    await sync(b);
    await e1.engine.syncNow();
    await tab1.store.flush(); await wait(100);
    expect(names(tab1.state)).toEqual(['X', 'Y']);
    expect(names(tab2.state)).toEqual(['X', 'Y']); // 수정 전에는 ['Y'] 로 남아 X 를 모른다
    tab2.mutate('이름', (s) => { s.exams.find((e) => e.name === 'Y')!.name = 'Y2'; });
    await tab2.store.flush(); await wait(100);
    await tab1.store.checkExternal(); await wait(20);
    expect(names(tab1.state)).toEqual(['X', 'Y2']);
    await e1.engine.syncNow();
    await sync(b);
    expect(names(b.host.state as State)).toEqual(['X', 'Y2']); // 수정 전에는 ['Y2'] (X 가 서버와 B 에서 삭제됨)
    tab1.dispose(); tab2.dispose();
  });

  it('방어선: 낡은 탭이 락을 이어받아 엔진을 돌려도 최신 저장본을 먼저 반영해 삭제를 올리지 않는다', async () => {
    const { tab1, tab2, server, key, meta } = await setup(null); // 알림 채널 없음: tab2 는 X 를 모른다
    const e1 = await engineFor(server, key, createSyncAdapter(tab1.createSyncHost()), meta);
    await e1.engine.syncNow();
    const b = await makeDevice(server, key);
    await sync(b);
    edit(b, Date.now() - 50000, (s) => { mkExam(s, 'X', ['수학']); });
    await sync(b);
    await e1.engine.syncNow();
    await tab1.store.flush();
    expect(names(tab2.state)).toEqual(['Y']); // 낡은 탭
    // tab1 이 닫히고 tab2 가 같은 메타로 엔진을 이어받는다
    const e2 = await engineFor(server, key, createSyncAdapter(tab2.createSyncHost()), meta);
    await e2.engine.syncNow();
    await wait(20);
    expect(names(tab2.state)).toEqual(['X', 'Y']);
    expect(e2.engine.status.phase).not.toBe('error');
    await sync(b);
    expect(names(b.host.state as State)).toEqual(['X', 'Y']);
    tab1.dispose(); tab2.dispose();
  });

  it('방어선: 낡은 탭에 저장 전 편집이 있으면 이번 사이클을 미루고(오류) 서버에서 아무것도 지우지 않는다', async () => {
    const { tab1, tab2, server, key, meta } = await setup(null, 60_000);
    const e1 = await engineFor(server, key, createSyncAdapter(tab1.createSyncHost()), meta);
    await e1.engine.syncNow();
    const b = await makeDevice(server, key);
    await sync(b);
    edit(b, Date.now() - 50000, (s) => { mkExam(s, 'X', ['수학']); });
    await sync(b);
    await e1.engine.syncNow();
    await tab1.store.flush();
    tab2.mutate('이름', (s) => { s.exams[0].name = 'Y2'; }); // 저장 대기 중(디바운스 길다)
    const e2 = await engineFor(server, key, createSyncAdapter(tab2.createSyncHost()), meta);
    await e2.engine.syncNow();
    expect(e2.engine.status.phase).toBe('error');
    expect(tab2.external).not.toBeNull(); // 사용자가 고를 때까지 기다린다
    await sync(b);
    expect(names(b.host.state as State)).toEqual(['X', 'Y']);
    tab1.dispose(); tab2.dispose();
  });
});

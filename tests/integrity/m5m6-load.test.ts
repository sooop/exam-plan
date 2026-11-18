// M-5(IDB 읽기 오류 + 낡은 localStorage 사본)와 M-6(로컬이 비었는데 동기화 메타에는 항목이 있음)의 회귀 시험.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/lib/app/app.svelte';
import { newState } from '../../src/lib/core';
import { LS_STATE_KEY } from '../../src/lib/storage/store';
import { resetPrefsMemory } from '../../src/lib/storage/prefs';
import { mkExam } from '../sync/helpers';
import { Mem, flaky, readIdb, seed } from './harness';

async function degradedSetup() {
  resetPrefsMemory();
  const real = new IDBFactory(); const storage = new Mem();
  const st = newState(); mkExam(st, 'Real1', ['A']); mkExam(st, 'Real2', ['B']); mkExam(st, 'Real3', ['C']); st.updatedAt = 9000;
  await seed(real, storage, st);
  const stale = newState(); mkExam(stale, 'Real1', ['A']); stale.updatedAt = 4000;
  storage.setItem(LS_STATE_KEY, JSON.stringify(stale));
  const { f, ctl } = flaky(real); ctl.fail = true;
  const app = createApp({ storeOptions: { indexedDB: f, storage, channelName: null, debounceMs: 0, readTimeoutMs: 200 }, notifyLocalChange: () => {}, sync: false });
  await app.init();
  return { real, storage, ctl, app };
}

describe('M-5 degraded', () => {
  it('IDB 읽기 오류 + LS 사본: degraded 로 열고 IDB 를 덮지 않으며 동기화를 시작하지 않는다', async () => {
    const { real, storage, ctl, app } = await degradedSetup();
    expect(app.degraded).toBe(true);
    expect(app.state.exams.map((e) => e.name)).toEqual(['Real1']);
    ctl.fail = false;
    app.mutate('편집', (s) => { s.exams[0].name = 'R1b'; });
    await app.store.flush();
    expect((await readIdb(real))?.exams.map((e) => e.name)).toEqual(['Real1', 'Real2', 'Real3']); // 수정 전에는 ['R1b'] 로 덮였다
    expect(JSON.parse(storage.getItem(LS_STATE_KEY)!).exams[0].name).toBe('R1b'); // 편집은 LS 에만
    expect(await app.syncGuard()).toBe(false);
    app.dispose();
  });
  it('IDB 가 다시 읽히면 재시도로 정상 전환하고, degraded 중 편집이 있으면 선택을 묻는다', async () => {
    const { real, ctl, app } = await degradedSetup();
    ctl.fail = false;
    app.mutate('편집', (s) => { s.exams[0].name = 'R1b'; });
    expect(await app.retryDegraded()).toBe(true);
    expect(app.degraded).toBe(false);
    expect(app.external).not.toBeNull(); // IDB 의 실제 저장본(시험 3개)과 이 탭의 편집 중 고르게 한다
    expect(app.external!.value.exams).toHaveLength(3);
    expect(await app.syncGuard()).toBe(false); // 선택 전에는 동기화를 시작하지 않는다
    app.acceptExternal();
    expect(app.state.exams.map((e) => e.name)).toEqual(['Real1', 'Real2', 'Real3']);
    expect(await app.syncGuard()).toBe(true);
    await app.store.flush();
    expect((await readIdb(real))?.exams).toHaveLength(3);
    app.dispose();
  });
  it('degraded 중 편집이 없으면 재시도 때 IDB 저장본을 그대로 불러온다', async () => {
    const { ctl, app } = await degradedSetup();
    ctl.fail = false;
    expect(await app.retryDegraded()).toBe(true);
    expect(app.external).toBeNull();
    expect(app.state.exams).toHaveLength(3);
    app.dispose();
  });
  it('IDB 가 아직 읽히지 않으면 재시도는 false 이고 degraded 가 유지된다', async () => {
    const { app } = await degradedSetup();
    expect(await app.retryDegraded()).toBe(false);
    expect(app.degraded).toBe(true);
    app.dispose();
  });
});

describe('M-6 빈 저장소 + 동기화 메타', () => {
  function mk(count: number) {
    const state = { count, cleared: 0 };
    const app = createApp({
      storeOptions: { indexedDB: new IDBFactory(), storage: new Mem(), channelName: null, debounceMs: 0 },
      notifyLocalChange: () => {}, sync: false,
      syncMeta: { liveCount: async () => state.count, clear: async () => { state.cleared++; state.count = 0; } },
    });
    return { app, state };
  }
  it('로컬이 비었고 메타에 항목이 있으면(6개 미만도) 시작을 막고 선택을 보인다', async () => {
    resetPrefsMemory();
    const { app } = mk(2);
    await app.init();
    expect(await app.syncGuard()).toBe(false);
    expect(app.syncGate).toEqual({ kind: 'empty-local', serverCount: 2 });
    app.dispose();
  });
  it('서버 사본 받기: 메타를 지우고 게이트를 풀어 새 기기처럼 시작한다', async () => {
    resetPrefsMemory();
    const { app, state } = mk(3);
    await app.init();
    await app.syncGuard();
    await app.chooseServerCopy();
    expect(state.cleared).toBe(1);
    expect(app.syncGate).toBeNull();
    expect(await app.syncGuard()).toBe(true);
    app.dispose();
  });
  it('비어 있는 상태로 두기: 게이트를 닫고 동기화 메타를 비워(서버 삭제로 올라가지 않게) 시작은 계속 막는다', async () => {
    resetPrefsMemory();
    const { app, state } = mk(3);
    await app.init();
    await app.syncGuard();
    app.keepEmpty();
    expect(app.syncGate).toBeNull();
    await Promise.resolve();
    expect(state.cleared).toBe(1);
    // 메타가 비었으므로 알려진 서버 항목이 없다: 일시정지를 풀면 서버 항목은 새로 받을 항목으로 내려오고 삭제로 올라가지 않는다
    expect(await app.syncGuard()).toBe(true);
    app.dispose();
  });
  it('로컬에 데이터가 있으면 막지 않는다', async () => {
    resetPrefsMemory();
    const idb = new IDBFactory(); const storage = new Mem();
    const st = newState(); mkExam(st, 'E', ['A']); st.updatedAt = 10;
    await seed(idb, storage, st);
    const app = createApp({
      storeOptions: { indexedDB: idb, storage, channelName: null, debounceMs: 0 }, notifyLocalChange: () => {}, sync: false,
      syncMeta: { liveCount: async () => 5, clear: async () => {} },
    });
    await app.init();
    expect(await app.syncGuard()).toBe(true);
    expect(app.syncGate).toBeNull();
    app.dispose();
  });
  it('메타가 비어 있으면(새 기기) 막지 않는다', async () => {
    resetPrefsMemory();
    const { app } = mk(0);
    await app.init();
    expect(await app.syncGuard()).toBe(true);
    app.dispose();
  });
});

// N-H2(다시 시도가 읽기 실패 중 편집을 버림)와 L-1·L-3(보존 훅·덮어쓰기 전 백업)의 회귀 시험.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { newState } from '../../src/lib/core';
import type { State } from '../../src/lib/core/types';
import { resetPrefsMemory } from '../../src/lib/storage/prefs';
import { createValidator } from '../../src/lib/app/appCore';
import { createLocalStore } from '../../src/lib/storage/store';
import { createApp } from '../../src/lib/app/app.svelte';
import { mkExam } from '../sync/helpers';
import { Mem, flaky, mkTab, readIdb, seed, wait } from './harness';

async function failedStart() {
  resetPrefsMemory();
  const real = new IDBFactory(); const storage = new Mem();
  const st = newState(); mkExam(st, 'Real1', ['A']); mkExam(st, 'Real2', ['B']); st.updatedAt = 5000;
  await seed(real, storage, st);
  const { f, ctl } = flaky(real); ctl.fail = true;
  const app = createApp({ storeOptions: { indexedDB: f, storage, channelName: null, debounceMs: 0, readTimeoutMs: 200 }, notifyLocalChange: () => {}, sync: false });
  await app.init();
  return { real, storage, ctl, app };
}

describe('N-H2 retryLoad', () => {
  it('읽기 실패 중 입력한 편집은 불러오기 전에 이력 훅으로 보존된다', async () => {
    const { ctl, app } = await failedStart();
    expect(app.loadProblem?.kind).toBe('failed');
    app.mutate('입력', (s) => { mkExam(s, 'Typed', ['C']); });
    expect(app.hasEditsWhileFailed).toBe(true);
    const seen: string[][] = [];
    const hook = vi.fn((label: string) => { seen.push(app.state.exams.map((e) => e.name)); void label; });
    app.hooks.onBeforeBigChange = hook;
    ctl.fail = false;
    expect(await app.retryLoad()).toBe(true);
    expect(hook).toHaveBeenCalledWith('다시 불러오기 전');
    expect(seen[0]).toEqual(['Typed']); // 교체 전의 편집 상태가 보존 대상이다(수정 전에는 훅이 없어 그냥 버려졌다)
    expect(app.state.exams.map((e) => e.name)).toEqual(['Real1', 'Real2']);
    app.dispose();
  });
  it('confirmed:false 이면 편집이 있을 때 아무것도 하지 않는다', async () => {
    const { ctl, app } = await failedStart();
    app.mutate('입력', (s) => { mkExam(s, 'Typed', ['C']); });
    ctl.fail = false;
    expect(await app.retryLoad({ confirmed: false })).toBe(false);
    expect(app.loadProblem?.kind).toBe('failed');
    expect(app.state.exams.map((e) => e.name)).toEqual(['Typed']);
    expect(await app.retryLoad({ confirmed: true })).toBe(true);
    app.dispose();
  });
  it('편집이 없으면 훅을 부르지 않는다', async () => {
    const { ctl, app } = await failedStart();
    const hook = vi.fn(); app.hooks.onBeforeBigChange = hook;
    ctl.fail = false;
    expect(app.hasEditsWhileFailed).toBe(false);
    expect(await app.retryLoad()).toBe(true);
    expect(hook).not.toHaveBeenCalled();
    app.dispose();
  });
});

describe('L-3 allowSaveAnyway', () => {
  it('덮어쓰기 직전에 기존 저장본을 corrupt 백업 키에 보존한다', async () => {
    const { real, ctl, app } = await failedStart();
    ctl.fail = false;
    app.mutate('입력', (s) => { mkExam(s, 'Typed', ['C']); });
    app.allowSaveAnyway();
    await app.store.flush();
    expect((await readIdb(real))?.exams.map((e) => e.name)).toEqual(['Typed']); // 덮어쓰기 자체는 사용자가 허락한 동작이다
    const keys = await app.store.listCorruptBackups();
    expect(keys.length).toBeGreaterThan(0); // 수정 전에는 0
    const env = await app.store.readCorruptBackup(keys[0]) as { raw: State };
    expect(env.raw.exams.map((e) => e.name)).toEqual(['Real1', 'Real2']);
    app.dispose();
  });
});

describe('L-1 keepLocalOverExternal', () => {
  it('버려지는 다른 탭 내용을 이력 훅으로 보존한다', async () => {
    resetPrefsMemory();
    const idb = new IDBFactory(); const storage = new Mem();
    const base = newState(); mkExam(base, 'Y', ['국어']); base.updatedAt = 5000;
    await seed(idb, storage, base);
    const app = mkTab(idb, storage, { debounceMs: 60_000 });
    await app.init();
    app.mutate('로컬', (s) => { s.exams[0].name = 'Y-local'; }); // 저장 대기
    // 다른 탭이 새 시험을 저장
    const v = createValidator();
    const other = createLocalStore<State>({ indexedDB: idb, storage, channelName: null, debounceMs: 0, validate: v.validate });
    await other.load();
    const next = JSON.parse(JSON.stringify(base)) as State; mkExam(next, 'OtherTab', ['수학']); next.updatedAt = 6000;
    other.save(next); await other.flush(); other.dispose();
    await app.store.checkExternal(); await wait(10);
    expect(app.external).not.toBeNull();
    const big = vi.fn(); const loser = vi.fn();
    app.hooks.onBeforeBigChange = big; app.hooks.preserveLoserExam = loser;
    app.keepLocalOverExternal();
    expect(big).toHaveBeenCalled();
    const lost = loser.mock.calls.map((c) => (c[0] as { exam: { name: string } }).exam.name);
    expect(lost).toContain('OtherTab');
    app.dispose();
  });
});

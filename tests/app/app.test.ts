// app.svelte.ts 를 fake-indexeddb 로 시험한다(동기화 엔진은 끄고, 로컬 변경 알림은 스파이로 본다).
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../../src/lib/app/app.svelte';
import { DROPPED_BACKED_UP_NOTE, DROPPED_LOST_NOTE, createValidator, droppedNotice } from '../../src/lib/app/appCore';
import type { State } from '../../src/lib/core/types';
import { LS_STATE_KEY, createLocalStore, type StorageLike } from '../../src/lib/storage/store';
import { resetPrefsMemory } from '../../src/lib/storage/prefs';
import { richState } from '../sync/helpers';
import { downloadText } from '../../src/lib/app/download';

// 내보내기 시험에서만 쓴다(파일 저장 대신 호출을 기록한다)
vi.mock('../../src/lib/app/download', () => ({ downloadText: vi.fn(() => true) }));

class Mem implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
}

interface Env { idb: IDBFactory | null; storage: Mem }
const env = (useIdb = true): Env => ({ idb: useIdb ? new IDBFactory() : null, storage: new Mem() });

function mk(e: Env, extra: { now?: () => number; debounceMs?: number } = {}) {
  const notify = vi.fn();
  const app = createApp({
    storeOptions: { indexedDB: e.idb, storage: e.storage, channelName: null, debounceMs: extra.debounceMs ?? 0 },
    notifyLocalChange: notify,
    sync: false,
    ...(extra.now ? { now: extra.now } : {}),
  });
  return { app, notify };
}

/** 같은 저장소에 값을 직접 써 두는 다른 '탭' */
function otherTab(e: Env) {
  const v = createValidator();
  return createLocalStore<State>({ indexedDB: e.idb, storage: e.storage, channelName: null, debounceMs: 0, validate: v.validate });
}
async function seed(e: Env, state: State) {
  const t = otherTab(e);
  await t.load();
  t.save(state);
  await t.flush();
  t.dispose();
}

const name0 = (a: App) => a.state.exams[0].name;
const rename = (a: App, n: string, opts = {}) => a.mutate('이름 바꾸기', (s) => { s.exams[0].name = n; }, opts);

describe('init: load 결과별 처리', () => {
  it('empty: 새 상태로 시작, 시험이 없으니 exam 탭', async () => {
    resetPrefsMemory();
    const { app } = mk(env());
    await app.init();
    expect(app.ready).toBe(true);
    expect(app.state.exams).toEqual([]);
    expect(app.loadProblem).toBeNull();
    expect(app.dropped).toBe(0);
    expect(app.ui.tab).toBe('exam');
    expect(app.loadStatus.phase).toBe('empty');
    app.dispose();
  });

  it('ok: 저장본을 적용하고 시작 탭은 board', async () => {
    resetPrefsMemory();
    const e = env();
    await seed(e, richState());
    const { app } = mk(e);
    await app.init();
    expect(app.state.exams.map((x) => x.name)).toEqual(['2026 중간고사', '기말고사']);
    expect(app.loadStatus.phase).toBe('ok');
    expect(app.dropped).toBe(0);
    expect(app.ui.tab).toBe('board');
    expect(app.cur()?.name).toBe('기말고사');
    app.dispose();
  });

  it('ok + 일부 시험이 버려지면 dropped 를 센다', async () => {
    resetPrefsMemory();
    const e = env(false);
    const raw = JSON.parse(JSON.stringify(richState())) as State;
    raw.exams[1].name = '';
    e.storage.setItem(LS_STATE_KEY, JSON.stringify(raw));
    const { app } = mk(e);
    await app.init();
    expect(app.state.exams).toHaveLength(1);
    expect(app.dropped).toBe(1);
    app.dismissDropped();
    expect(app.dropped).toBe(0);
    app.dispose();
  });

  it('corrupt: 빈 상태로 시작하고 저장 가드가 걸리며 backupKey 를 노출한다', async () => {
    resetPrefsMemory();
    const e = env(false);
    e.storage.setItem(LS_STATE_KEY, JSON.stringify({ hello: 'world' }));
    const { app } = mk(e);
    await app.init();
    expect(app.loadProblem?.kind).toBe('corrupt');
    expect(app.loadProblem?.backupKey).toMatch(/^examPlanner\.corrupt\./);
    expect(app.state.exams).toEqual([]);
    app.mutate('편집', (s) => { s.recapDays = 3; });
    await app.store.flush();
    expect(app.saveStatus.state).toBe('blocked');
    expect(JSON.parse(e.storage.getItem(LS_STATE_KEY)!)).toEqual({ hello: 'world' }); // 원본이 덮어써지지 않았다
    app.allowSaveAnyway();
    expect(app.loadProblem).toBeNull();
    expect(app.syncHeld).toBe(true);
    await app.store.flush();
    expect(app.saveStatus.state).toBe('saved');
    expect(JSON.parse(e.storage.getItem(LS_STATE_KEY)!).recapDays).toBe(3);
    app.dispose();
  });

  it('failed: 읽기 실패는 빈 상태가 아니라 문제로 노출하고 retryLoad 로 복구한다', async () => {
    resetPrefsMemory();
    const e = env();
    await seed(e, richState());
    let broken = true;
    const real = e.idb!;
    const flaky = { open: (...a: Parameters<IDBFactory['open']>) => { if (broken) throw new Error('boom'); return real.open(...a); } } as unknown as IDBFactory;
    const { app } = mk({ idb: flaky, storage: e.storage });
    await app.init();
    expect(app.loadProblem?.kind).toBe('failed');
    expect(app.loadProblem?.backupKey).toBeNull();
    expect(app.state.exams).toEqual([]);
    expect(await app.retryLoad()).toBe(false);
    expect(app.loadProblem?.kind).toBe('failed');
    broken = false;
    expect(await app.retryLoad()).toBe(true);
    expect(app.loadProblem).toBeNull();
    expect(app.state.exams).toHaveLength(2);
    app.dispose();
  });
});

describe('commit·mutate·undo·redo', () => {
  it('commit 은 updatedAt 을 단조 증가시키고 저장·알림한다(시계가 멈춰도)', async () => {
    const e = env();
    const { app, notify } = mk(e, { now: () => 5000 });
    await app.init();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) { app.state.recapDays = 2 + i; app.commit({ label: 'x' }); seen.push(app.state.updatedAt); }
    expect(seen).toEqual([5000, 5001, 5002, 5003]);
    expect(notify).toHaveBeenCalledTimes(4);
    await app.store.flush();
    expect(app.saveStatus.state).toBe('saved');
    app.dispose();
  });

  it('시계가 과거로 가도 줄어들지 않는다', async () => {
    let t = 9000;
    const { app } = mk(env(), { now: () => t });
    await app.init();
    app.state.recapDays = 3; app.commit();
    t = 100;
    app.state.recapDays = 4; app.commit();
    expect(app.state.updatedAt).toBe(9001);
    app.dispose();
  });

  it('mutate → undo → redo, 저장과 알림이 따라온다', async () => {
    const e = env();
    await seed(e, richState());
    const { app, notify } = mk(e);
    await app.init();
    const orig = name0(app);
    rename(app, '바뀐 이름');
    expect(app.canUndo).toBe(true);
    expect(app.undoLabel).toBe('이름 바꾸기');
    notify.mockClear();
    const t0 = app.state.updatedAt;
    expect(app.undo()).toBe('이름 바꾸기');
    expect(name0(app)).toBe(orig);
    expect(app.state.updatedAt).toBeGreaterThan(t0);
    expect(app.canRedo).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    await app.store.flush();
    expect(app.redo()).toBe('이름 바꾸기');
    expect(name0(app)).toBe('바뀐 이름');
    expect(app.canRedo).toBe(false);
    expect(app.undo()).not.toBeNull();
    expect(app.undo()).toBeNull();
    app.dispose();
  });

  it('새 변경은 다시 실행 기록을 지운다', async () => {
    const e = env();
    await seed(e, richState());
    const { app } = mk(e);
    await app.init();
    rename(app, 'A');
    app.undo();
    expect(app.canRedo).toBe(true);
    rename(app, 'B');
    expect(app.canRedo).toBe(false);
    app.dispose();
  });

  it('50단계까지만 기억한다', async () => {
    const e = env();
    await seed(e, richState());
    const { app } = mk(e);
    await app.init();
    for (let i = 0; i < 60; i++) rename(app, 'n' + i);
    expect(app.undoDepth).toBe(50);
    app.dispose();
  });

  it('merge 옵션: 같은 label 의 짧은 간격 변경은 한 단계', async () => {
    const e = env();
    await seed(e, richState());
    let t = 1_000_000;
    const { app } = mk(e, { now: () => t });
    await app.init();
    const orig = name0(app);
    rename(app, 'a', { merge: true });
    t += 100;
    rename(app, 'ab', { merge: true });
    expect(app.undoDepth).toBe(1);
    app.undo();
    expect(name0(app)).toBe(orig);
    app.dispose();
  });

  it('내용이 바뀌지 않으면 commit 하지 않는다', async () => {
    const e = env();
    await seed(e, richState());
    const { app, notify } = mk(e);
    await app.init();
    const t0 = app.state.updatedAt;
    rename(app, name0(app));
    expect(app.undoDepth).toBe(0);
    expect(app.state.updatedAt).toBe(t0);
    expect(notify).not.toHaveBeenCalled();
    app.dispose();
  });

  it('fn 이 던지면 상태를 되돌리고 다시 던진다', async () => {
    const e = env();
    await seed(e, richState());
    const { app } = mk(e);
    await app.init();
    const orig = name0(app);
    expect(() => app.mutate('실패', (s) => { s.exams[0].name = '반쯤'; throw new Error('x'); })).toThrow('x');
    expect(name0(app)).toBe(orig);
    expect(app.undoDepth).toBe(0);
    app.dispose();
  });

  it('undoable:false 는 스택을 비운다(되돌리면 이 변경이 사라지는 것을 막는다)', async () => {
    const e = env();
    await seed(e, richState());
    const { app } = mk(e);
    await app.init();
    rename(app, 'A');
    app.mutate('설정', (s) => { s.recapDays = 11; }, { undoable: false });
    expect(app.canUndo).toBe(false);
    app.dispose();
  });

  it('setActive 는 되돌리기 단계를 만들지 않고, undo 는 활성 시험을 유지한다', async () => {
    const e = env();
    await seed(e, richState());
    const { app } = mk(e);
    await app.init();
    const [a, b] = app.state.exams.map((x) => x.id);
    expect(app.state.activeId).toBe(b);
    rename(app, 'A');
    app.ui.selected.add('2026-06-05');
    app.setActive(a);
    expect(app.ui.selected.size).toBe(0);
    expect(app.undoDepth).toBe(1);
    app.undo();
    expect(app.state.activeId).toBe(a);
    app.dispose();
  });

  it('onCommit·onBeforeBigChange 훅', async () => {
    const e = env();
    await seed(e, richState());
    const { app } = mk(e);
    await app.init();
    const commits: string[] = [];
    const bigs: string[] = [];
    app.hooks = { onCommit: (i) => commits.push(i.label), onBeforeBigChange: (l) => bigs.push(l) };
    app.mutate('시험 삭제', (s) => { s.exams.pop(); }, { big: true });
    app.undo();
    expect(bigs).toEqual(['시험 삭제']);
    expect(commits).toEqual(['시험 삭제', '되돌리기: 시험 삭제']);
    app.dispose();
  });
});

describe('동기화 호스트', () => {
  it('applyRemote 는 updatedAt 을 올리지 않고 로컬 변경 알림도 하지 않으며 저장한다', async () => {
    const e = env();
    await seed(e, richState());
    const { app, notify } = mk(e);
    await app.init();
    rename(app, '내 변경');
    await app.store.flush();
    notify.mockClear();
    const host = app.createSyncHost();
    const t0 = app.state.updatedAt;
    expect(host.getState().updatedAt).toBe(t0);
    host.applyRemote((d) => { d.recapDays = 9; });
    expect(app.state.recapDays).toBe(9);
    expect(app.state.updatedAt).toBe(t0);
    expect(notify).not.toHaveBeenCalled();
    expect(app.canUndo).toBe(false); // 원격이 섞인 뒤의 옛 되돌리기는 원격 변경을 되돌려 올리므로 비운다
    await app.store.flush();
    expect(app.saveStatus.state).toBe('saved');
    const t = otherTab(e);
    const r = await t.load();
    expect(r.status === 'ok' && r.value.recapDays).toBe(9);
    t.dispose();
    app.dispose();
  });

  it('preserveLoserExam 은 훅을 부른다(기본은 no-op)', async () => {
    const { app } = mk(env());
    await app.init();
    const host = app.createSyncHost();
    expect(() => host.preserveLoserExam({ name: '동기화 전(2026-01-01)', exam: {}, at: 1 })).not.toThrow();
    const got: string[] = [];
    app.hooks = { preserveLoserExam: (i) => got.push(i.name) };
    host.preserveLoserExam({ name: 'n', exam: {}, at: 1 });
    expect(got).toEqual(['n']);
    app.dispose();
  });
});

describe('다른 탭의 변경', () => {
  it('저장 전 변경이 없으면 자동으로 불러온다', async () => {
    const e = env();
    await seed(e, richState());
    const { app } = mk(e);
    await app.init();
    const next = richState();
    next.exams[0].name = '다른 탭에서 바꿈';
    next.updatedAt += 10_000;
    await seed(e, next);
    await app.store.checkExternal();
    expect(name0(app)).toBe('다른 탭에서 바꿈');
    expect(app.external).toBeNull();
    app.dispose();
  });

  it('저장 전 변경이 있으면 선택을 기다리고, 불러오기·유지를 처리한다', async () => {
    const e = env();
    await seed(e, richState());
    const { app } = mk(e, { debounceMs: 60_000 }); // 저장이 대기 상태로 남도록 디바운스를 길게
    await app.init();
    app.store.save(JSON.parse(JSON.stringify(app.state))); // 저장 대기 상태를 만든다
    const next = richState();
    next.exams[0].name = '다른 탭';
    next.updatedAt += 10_000;
    await seed(e, next);
    await app.store.checkExternal();
    expect(app.external?.value.exams[0].name).toBe('다른 탭');
    expect(name0(app)).not.toBe('다른 탭');
    app.acceptExternal();
    expect(name0(app)).toBe('다른 탭');
    expect(app.external).toBeNull();
    app.dispose();
  });

  it('유지를 고르면 이 탭 내용이 더 새것이 된다', async () => {
    const e = env();
    await seed(e, richState());
    const { app } = mk(e, { debounceMs: 60_000 });
    await app.init();
    app.store.save(JSON.parse(JSON.stringify(app.state)));
    const next = richState();
    next.updatedAt += 10_000;
    await seed(e, next);
    await app.store.checkExternal();
    expect(app.external).not.toBeNull();
    app.keepLocalOverExternal();
    expect(app.external).toBeNull();
    expect(app.state.updatedAt).toBeGreaterThan(next.updatedAt);
    app.dispose();
  });
});

describe('버려진 시험 원본 백업', () => {
  /** richState 에서 두 번째 시험의 이름을 비워 검증에서 버려지게 한 입력 */
  const droppedRaw = (): State => {
    const raw = JSON.parse(JSON.stringify(richState())) as State;
    raw.exams[1].name = '';
    return raw;
  };

  it('dropped>0 이면 입력 원본을 백업하고 droppedBackupKey 로 노출한다', async () => {
    resetPrefsMemory();
    const e = env(false);
    const raw = droppedRaw();
    e.storage.setItem(LS_STATE_KEY, JSON.stringify(raw));
    const { app } = mk(e);
    await app.init();
    expect(app.dropped).toBe(1);
    expect(app.loadProblem).toBeNull();
    expect(app.droppedBackupKey).toMatch(/^examPlanner\.corrupt\./);
    expect(await app.store.readCorruptBackup(app.droppedBackupKey!)).toMatchObject({ source: 'localStorage', reason: 'partial', raw });
    app.dispose();
  });

  it('dropped 가 0 이면 백업하지 않고, 내보낼 원본도 없다', async () => {
    resetPrefsMemory();
    const e = env(false);
    e.storage.setItem(LS_STATE_KEY, JSON.stringify(richState()));
    const { app } = mk(e);
    await app.init();
    expect(app.dropped).toBe(0);
    expect(app.droppedBackupKey).toBeNull();
    expect(await app.store.listCorruptBackups()).toEqual([]);
    expect(await app.exportCorrupt()).toBe(false);
    app.dispose();
  });

  it('백업 뒤 다음 저장이 나머지 시험만 써도 버려진 시험의 원본은 남는다', async () => {
    resetPrefsMemory();
    const e = env(false);
    e.storage.setItem(LS_STATE_KEY, JSON.stringify(droppedRaw()));
    const { app } = mk(e);
    await app.init();
    const key = app.droppedBackupKey!;
    app.mutate('편집', (s) => { s.exams[0].name = '저장 확인용 이름'; });
    await app.store.flush();
    expect(app.saveStatus.state).toBe('saved');
    expect(JSON.parse(e.storage.getItem(LS_STATE_KEY)!).exams).toHaveLength(1);
    const kept = await app.store.readCorruptBackup(key) as { raw: State };
    expect(kept.raw.exams).toHaveLength(2);
    expect(kept.raw.exams[1].name).toBe('');
    app.dispose();
  });

  it('exportCorrupt 는 부분 폐기 원본만 있어도 보존 형식 그대로 내보낸다', async () => {
    resetPrefsMemory();
    vi.mocked(downloadText).mockClear();
    const e = env(false);
    e.storage.setItem(LS_STATE_KEY, JSON.stringify(droppedRaw()));
    const { app } = mk(e);
    await app.init();
    expect(await app.exportCorrupt()).toBe(true);
    const [name, text] = vi.mocked(downloadText).mock.calls[0];
    expect(name).toMatch(/^exam-plan-corrupt-/);
    expect(JSON.parse(text)).toMatchObject({ source: 'localStorage', reason: 'partial' });
    app.dispose();
  });
});

describe('다른 탭 변경의 버려진 시험 원본 백업', () => {
  const KEY_RE = /^examPlanner\.corrupt\./;
  /** 두 번째 시험 이름을 비워 검증에서 버려지게 한, 다른 탭이 저장한 값(더 새 updatedAt) */
  const droppedFromOtherTab = (extra = 0): State => {
    const raw = JSON.parse(JSON.stringify(richState())) as State;
    raw.exams[1].name = '';
    raw.updatedAt += 10_000 + extra;
    return raw;
  };
  const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

  it('다른 탭 값에서 시험이 버려지면 원본을 백업하고 droppedBackupKey 로 노출한다(다음 저장 사라짐 문구 대신 백업 문구)', async () => {
    resetPrefsMemory();
    const e = env();
    await seed(e, richState());
    const { app } = mk(e);
    await app.init();
    expect(app.droppedBackupKey).toBeNull();
    const raw = droppedFromOtherTab();
    await seed(e, raw);
    await app.store.checkExternal();
    expect(app.dropped).toBe(1);
    expect(app.state.exams).toHaveLength(raw.exams.length - 1);
    const key = app.droppedBackupKey!;
    expect(key).toMatch(KEY_RE);
    const kept = await app.store.readCorruptBackup(key) as { raw: State; reason: string; source: string };
    expect(kept).toMatchObject({ reason: 'partial', source: 'indexedDB' });
    expect(kept.raw).toEqual(plain(raw));
    expect(droppedNotice(app.dropped, app.droppedBackupKey !== null)).toContain(DROPPED_BACKED_UP_NOTE);
    app.dispose();
  });

  it('다른 탭 값에 버려진 시험이 없으면 백업하지 않고 droppedBackupKey 는 null 이다', async () => {
    resetPrefsMemory();
    const e = env();
    await seed(e, richState());
    const { app } = mk(e);
    await app.init();
    const next = richState();
    next.updatedAt += 10_000;
    await seed(e, next);
    await app.store.checkExternal();
    expect(app.dropped).toBe(0);
    expect(app.droppedBackupKey).toBeNull();
    expect(await app.store.listCorruptBackups()).toEqual([]);
    app.dispose();
  });

  it('저장 전 변경이 있으면 선택 전에는 키를 노출하지 않고, 불러올 때 반영한다', async () => {
    resetPrefsMemory();
    const e = env();
    await seed(e, richState());
    const { app } = mk(e, { debounceMs: 60_000 });
    await app.init();
    app.store.save(plain(app.state)); // 저장 대기 상태를 만든다
    const raw = droppedFromOtherTab();
    await seed(e, raw);
    await app.store.checkExternal();
    expect(app.external).not.toBeNull();
    const key = app.external!.partialBackupKey!;
    expect(key).toMatch(KEY_RE);
    expect(app.droppedBackupKey).toBeNull();
    app.acceptExternal();
    expect(app.droppedBackupKey).toBe(key);
    expect(app.dropped).toBe(1);
    app.dispose();
  });

  it('백업이 실패해도 불러오고, 키가 없으므로 다음 저장 때 사라진다는 문구를 쓴다', async () => {
    resetPrefsMemory();
    const e = env(false);
    await seed(e, richState());
    const { app } = mk(e);
    await app.init();
    const raw = droppedFromOtherTab();
    await seed(e, raw);
    const setItem = e.storage.setItem.bind(e.storage);
    e.storage.setItem = (k: string, v: string) => {
      if (k.startsWith('examPlanner.corrupt.')) { const err = new Error('full'); err.name = 'QuotaExceededError'; throw err; }
      setItem(k, v);
    };
    await app.store.checkExternal();
    expect(app.state.exams).toHaveLength(raw.exams.length - 1);
    expect(app.dropped).toBe(1);
    expect(app.droppedBackupKey).toBeNull();
    expect(droppedNotice(app.dropped, app.droppedBackupKey !== null)).toContain(DROPPED_LOST_NOTE);
    app.dispose();
  });

  it('새 외부 백업 키는 기존 droppedBackupKey 를 최신으로 덮어쓰고, 이전 원본은 저장소에 남는다', async () => {
    resetPrefsMemory();
    const e = env(false);
    e.storage.setItem(LS_STATE_KEY, JSON.stringify(droppedFromOtherTab()));
    const { app } = mk(e);
    await app.init();
    const first = app.droppedBackupKey!;
    expect(first).toMatch(KEY_RE);
    await seed(e, droppedFromOtherTab(5));
    await app.store.checkExternal();
    const second = app.droppedBackupKey!;
    expect(second).toMatch(KEY_RE);
    expect(second).not.toBe(first);
    expect(await app.store.listCorruptBackups()).toEqual(expect.arrayContaining([first, second]));
    app.dispose();
  });
});

// 설정 충돌 패자 보존(H-1/M-3 연결)·이력 복원의 원자성(L-2)·시각 표지(at·settingsAt) 올리기의 회귀 시험.
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../../src/lib/app/app.svelte';
import { createHistory } from '../../src/lib/history/history.svelte';
import { H } from '../../src/lib/history/texts';
import { resetPrefsMemory } from '../../src/lib/storage/prefs';
import { createSyncAdapter } from '../../src/lib/sync/adapter';
import { mkExam, richState } from '../sync/helpers';

async function setup(idb: IDBFactory | null = new IDBFactory()) {
  resetPrefsMemory();
  const clock = { t: new Date(2026, 10, 18, 9, 0, 0).getTime() };
  const app = createApp({ storeOptions: { indexedDB: new IDBFactory(), storage: null, channelName: null, debounceMs: 0 }, sync: false, now: () => clock.t, notifyLocalChange: () => {} });
  await app.init();
  app.mutate('시드', (s) => { Object.assign(s, richState()); }, { undoable: false });
  const hist = createHistory({ indexedDB: idb, now: () => clock.t, device: () => '내 기기', storage: null, toast: false, logDebounceMs: 0 });
  await hist.connect(app);
  return { app, hist, clock, idb };
}

describe('설정 충돌 패자 보존', () => {
  it('app 호스트의 preserveLoserSettings 가 이력에 sync-loser(설정)로 남고, 복원하면 설정이 되돌아간다', async () => {
    const { app, hist } = await setup();
    const host = app.createSyncHost();
    const adapter = createSyncAdapter(host);
    const lost = { limits: { ...app.state.limits, packed: 1 }, defPlan: app.state.defPlan, recapDays: 11, week: { 2: 'busy' } };
    await adapter.preserveLoser({ id: 'settings', kind: 'doc', updatedAt: 4000, deleted: false, data: lost });
    await hist.flush();
    const rec = hist.list().find((s) => s.kind === 'sync-loser');
    expect(rec).toBeDefined();
    expect(rec!.subject).toBe('settings');
    expect(rec!.label).toContain('설정');
    const r = await hist.restore(rec!.id);
    expect(r).toMatchObject({ ok: true, changed: true });
    expect(app.state.recapDays).toBe(11);
    expect(app.state.limits.packed).toBe(1);
    expect(app.state.week).toEqual({ 2: 'busy' });
    expect(app.state.exams).toHaveLength(2); // 시험은 그대로
    expect(app.state.settingsAt).toBeGreaterThan(0); // 복원은 새 설정 편집이다
    hist.dispose();
  });
  it('모양이 틀린 설정은 복원하지 않고 상태를 바꾸지 않는다', async () => {
    const { app, hist } = await setup();
    app.createSyncHost().preserveLoserSettings!({ name: '동기화 전 설정', settings: { limits: 1 }, at: 5 });
    await hist.flush();
    const rec = hist.list().find((s) => s.subject === 'settings')!;
    const before = JSON.stringify(app.state);
    const r = await hist.restore(rec.id);
    expect(r).toMatchObject({ ok: false });
    expect(JSON.stringify(app.state)).toBe(before);
    hist.dispose();
  });
});

describe('이력 복원의 원자성', () => {
  it('직전 상태를 이력에 쓰지 못하면(쓰기 오류) 상태를 바꾸지 않고 오류를 돌려준다', async () => {
    const idb = new IDBFactory();
    const { app, hist } = await setup(idb);
    const m = await hist.createManual('기준');
    app.mutate('이름', (s) => { s.exams[0].name = '나중 이름'; });
    await hist.flush();
    const probe = await new Promise<IDBDatabase>((res) => { const r = idb.open('examPlannerHistory'); r.onsuccess = () => res(r.result); });
    const proto = Object.getPrototypeOf(probe) as IDBDatabase;
    probe.close();
    const orig = proto.transaction;
    const spy = vi.spyOn(proto, 'transaction').mockImplementation(function (this: IDBDatabase, ...a: Parameters<IDBDatabase['transaction']>) {
      if (a[1] === 'readwrite') throw new DOMException('full', 'QuotaExceededError');
      return orig.apply(this, a);
    });
    try {
      const r = await hist.restore(m.meta!.id);
      expect(r).toEqual({ ok: false, error: H.errPreserve });
      expect(app.state.exams[0].name).toBe('나중 이름'); // 수정 전에는 복원이 진행되고 사후 안내만 했다
    } finally {
      spy.mockRestore();
    }
    hist.dispose();
  });
});

describe('시각 표지(at·settingsAt)', () => {
  async function plain(): Promise<{ app: App; t: { v: number } }> {
    resetPrefsMemory();
    const t = { v: 1_000_000 };
    const app = createApp({ storeOptions: { indexedDB: new IDBFactory(), storage: null, channelName: null, debounceMs: 0 }, sync: false, now: () => t.v, notifyLocalChange: () => {} });
    await app.init();
    app.mutate('추가', (s) => { mkExam(s, 'A', ['국어']); mkExam(s, 'B', ['수학']); });
    return { app, t };
  }
  it('바뀐 시험에만 at 이 오르고 설정 시각은 설정을 바꿀 때만 오른다', async () => {
    const { app, t } = await plain();
    const at = (n: string) => app.state.exams.find((e) => e.name === n)!.at;
    expect(at('A')).toBeGreaterThan(0);
    expect(app.state.settingsAt).toBeUndefined();
    const a0 = at('A');
    t.v += 500;
    app.mutate('B 수정', (s) => { s.exams.find((e) => e.name === 'B')!.name = 'B2'; });
    expect(at('A')).toBe(a0);
    expect(at('B2')).toBeGreaterThan(a0!);
    expect(app.state.settingsAt).toBeUndefined();
    t.v += 500;
    app.mutate('설정', (s) => { s.recapDays = 3; });
    expect(app.state.settingsAt).toBeGreaterThan(at('B2')!);
    expect(at('A')).toBe(a0);
    const s0 = app.state.settingsAt;
    t.v += 500;
    app.mutate('A 수정', (s) => { s.exams[0].name = 'A2'; });
    expect(app.state.settingsAt).toBe(s0);
    app.dispose();
  });
  it('commit 경로(상태를 직접 고친 뒤)도 기준 사본과 비교해 바뀐 시험에만 올린다', async () => {
    const { app, t } = await plain();
    const a0 = app.state.exams[0].at;
    t.v += 500;
    app.state.exams[1].name = 'B-직접';
    app.commit({ label: '직접' });
    expect(app.state.exams[0].at).toBe(a0);
    expect(app.state.exams[1].at).toBeGreaterThan(a0!);
    app.dispose();
  });
  it('되돌리기도 새 편집으로 시각이 오른다(동기화에서 이기도록)', async () => {
    const { app, t } = await plain();
    t.v += 500;
    app.mutate('B 수정', (s) => { s.exams[1].name = 'B2'; });
    const edited = app.state.exams[1].at!;
    t.v += 500;
    app.undo();
    expect(app.state.exams[1].name).toBe('B');
    expect(app.state.exams[1].at!).toBeGreaterThan(edited);
    app.dispose();
  });
});

describe('동기화 시작 점검(state.svelte)', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('점검이 false 면 어댑터를 만들지 않고 paused 로 둔다, true 면 진행한다', async () => {
    const map = new Map<string, string>([['examPlanner.sync', JSON.stringify({ workerUrl: 'https://a.example', syncKey: 'K', enabled: true })]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } });
    vi.resetModules();
    const m = await import('../../src/lib/sync/state.svelte');
    const factory = vi.fn(() => { throw new Error('만들면 안 된다'); });
    m.setSyncAdapterFactory(factory);
    let allow = false;
    m.setSyncStartGuard(async () => allow);
    await m.startSyncIfConfigured(); // 탭 락 안에서 비동기로 시작한다(Node 24 는 navigator.locks 가 있다)
    await vi.waitFor(() => expect(m.sync.status.phase).toBe('paused'));
    expect(factory).not.toHaveBeenCalled();
    allow = true;
    await m.startSyncIfConfigured(); // 점검이 막았으면 락을 놓았으므로 다시 시도할 수 있다
    await vi.waitFor(() => expect(factory).toHaveBeenCalled()); // 점검을 통과해 엔진 만들기까지 갔다(여기서는 팩토리가 던져 error)
    await vi.waitFor(() => expect(m.sync.status.phase).toBe('error'));
  });
});

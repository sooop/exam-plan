// 변경 이력 저장소(history.svelte.ts)를 실제 app 인스턴스와 fake-indexeddb 로 시험한다. 시계는 직접 움직인다.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../../src/lib/app/app.svelte';
import { AUTO_KEEP_COUNT, DAY_MS, LOG_MAX, type SnapshotRecord } from '../../src/lib/history/core';
import { createHistoryDb } from '../../src/lib/history/db';
import { createHistory, type HistoryStore } from '../../src/lib/history/history.svelte';
import { H } from '../../src/lib/history/texts';
import { resetPrefsMemory } from '../../src/lib/storage/prefs';
import type { State } from '../../src/lib/core/types';
import { richState } from '../sync/helpers';

interface Env { app: App; hist: HistoryStore; clock: { t: number }; idb: IDBFactory | null; mk: () => HistoryStore }

async function setup(o: { idb?: IDBFactory | null; seed?: boolean; clock?: { t: number }; connect?: boolean } = {}): Promise<Env> {
  resetPrefsMemory();
  const clock = o.clock ?? { t: new Date(2026, 10, 18, 9, 0, 0).getTime() };
  const idb = o.idb === undefined ? new IDBFactory() : o.idb;
  const app = createApp({
    storeOptions: { indexedDB: new IDBFactory(), storage: null, channelName: null, debounceMs: 0 },
    sync: false, now: () => clock.t, notifyLocalChange: () => {},
  });
  await app.init();
  if (o.seed !== false) app.mutate('시드', (s) => { Object.assign(s, richState()); }, { undoable: false });
  const mk = () => createHistory({ indexedDB: idb, now: () => clock.t, device: () => '내 기기', storage: null, toast: false, logDebounceMs: 0 });
  const hist = mk();
  if (o.connect !== false) await hist.connect(app);
  return { app, hist, clock, idb, mk };
}

const rename = (app: App, name: string, label = '이름 바꾸기', opts = {}) => app.mutate(label, (s) => { s.exams[0].name = name; }, opts);
const names = (app: App) => app.state.exams.map((e) => e.name);
const snapshotOf = (app: App) => JSON.stringify(app.state);

describe('자동 생성', () => {
  it('앱을 연 뒤 첫 변경 직전 상태를 한 번만 자동으로 남긴다', async () => {
    const { app, hist } = await setup();
    const original = names(app);
    rename(app, '바뀜 1');
    rename(app, '바뀜 2', '이름 바꾸기');
    await hist.flush();
    const list = hist.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: 'auto', device: '내 기기', pinned: false, counts: { exams: 2 } });
    expect(list[0].bytes).toBeGreaterThan(0);
    // 내용은 첫 변경 '직전' 상태다
    const r = await hist.restore(list[0].id);
    expect(r).toMatchObject({ ok: true, changed: true });
    expect(names(app)).toEqual(original);
    hist.dispose();
  });

  it('마지막 스냅샷과 내용이 같으면 새로 쌓지 않는다', async () => {
    const { app, hist } = await setup();
    const m = await hist.createManual('기준');
    expect(m.action).toBe('added');
    rename(app, '바뀜');
    await hist.flush();
    expect(hist.list()).toHaveLength(1);
    expect(hist.list()[0]).toMatchObject({ kind: 'manual', label: '기준' });
    hist.dispose();
  });

  it('활성 시험만 바꾸는 commit 은 첫 변경으로 치지 않고 기록하지도 않는다', async () => {
    const { app, hist } = await setup();
    app.setActive(app.state.exams[0].id);
    await hist.flush();
    expect(hist.log).toHaveLength(0);
    expect(hist.list()).toHaveLength(0);
    rename(app, '바뀜');
    await hist.flush();
    expect(hist.list().map((s) => s.kind)).toEqual(['auto']);
    expect(hist.log).toHaveLength(1);
    hist.dispose();
  });

  it('큰 변경 직전에 before-big 을 남긴다(변경 전 내용, 첫 변경 스냅샷을 겸한다)', async () => {
    const { app, hist } = await setup();
    app.mutate('시험 삭제', (s) => { s.exams.shift(); }, { big: true });
    await hist.flush();
    const list = hist.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: 'before-big', label: '시험 삭제', counts: { exams: 2 } });
    expect(app.state.exams).toHaveLength(1);
    hist.dispose();
  });

  it('같은 내용의 before-big 은 한 건으로 합친다', async () => {
    const { app, hist } = await setup();
    await hist.createManual();
    hist.list(); // 반응형 접근
    app.mutate('A', (s) => { s.exams[0].name = 'A'; }, { big: true }); // 직전 = 수동 저장과 같은 내용
    await hist.flush();
    expect(hist.list().map((s) => s.kind)).toEqual(['manual']);
    app.mutate('B', (s) => { s.exams[0].name = 'B'; }, { big: true }); // 직전 = 'A' 상태(새 내용)
    await hist.flush();
    expect(hist.list().map((s) => s.kind).sort()).toEqual(['before-big', 'manual']);
    hist.dispose();
  });

  it('새 세션의 첫 변경 스냅샷이 2분 안의 직전 자동 스냅샷이면 갈아 끼운다', async () => {
    const env = await setup();
    rename(env.app, '세션1');
    await env.hist.flush();
    const first = env.hist.list()[0];
    env.hist.dispose();

    env.clock.t += 60_000;
    const h2 = env.mk();
    await h2.connect(env.app);
    rename(env.app, '세션2');
    await h2.flush();
    expect(h2.list()).toHaveLength(1);
    expect(h2.list()[0].id).toBe(first.id);
    expect(h2.list()[0].at).toBe(env.clock.t);
    h2.dispose();

    env.clock.t += 5 * 60_000;
    const h3 = env.mk();
    await h3.connect(env.app);
    rename(env.app, '세션3');
    await h3.flush();
    expect(h3.list()).toHaveLength(2);
    h3.dispose();
  });

  it('수동 저장은 같은 내용의 자동 스냅샷을 수동으로 올린다', async () => {
    const { app, hist } = await setup();
    rename(app, '바뀜'); // 직전 상태의 auto
    await hist.flush();
    await hist.createManual(); // 지금 상태 = 바뀜
    const before = hist.list().length;
    const again = await hist.createManual('같은 내용');
    expect(again.action).toBe('touched');
    expect(hist.list()).toHaveLength(before);
    hist.dispose();
  });
});

describe('동기화 연결', () => {
  it('원격 변경을 받기 직전에 before-sync, 받은 뒤 작업 기록에 sync-received', async () => {
    const { app, hist, clock } = await setup();
    const host = app.createSyncHost();
    host.applyRemote((d) => { d.exams[0].name = '원격'; });
    host.onApplied?.();
    await hist.flush();
    expect(app.state.exams[0].name).toBe('원격');
    expect(hist.list().map((s) => s.kind)).toEqual(['before-sync']);
    expect(hist.log.map((e) => e.kind)).toEqual(['sync-received']);
    expect(hist.log[0].device).toBe('내 기기');

    // 짧은 간격의 연속 반영은 앞의 것(더 옛 상태)을 두고 건너뛴다
    app.createSyncHost().applyRemote((d) => { d.exams[0].name = '원격 2'; });
    await hist.flush();
    expect(hist.list()).toHaveLength(1);
    clock.t += 31_000;
    app.createSyncHost().applyRemote((d) => { d.exams[0].name = '원격 3'; });
    await hist.flush();
    expect(hist.list()).toHaveLength(2);
    hist.dispose();
  });

  it('before-sync 스냅샷은 반영 전 상태다', async () => {
    const { app, hist } = await setup();
    const original = names(app);
    app.createSyncHost().applyRemote((d) => { d.exams[0].name = '원격'; });
    await hist.flush();
    await hist.restore(hist.list()[0].id);
    expect(names(app)).toEqual(original);
    hist.dispose();
  });

  it('dispose 하면 동기화 호스트 감싸기와 훅이 풀린다', async () => {
    const { app, hist } = await setup();
    expect(Object.prototype.hasOwnProperty.call(app, 'createSyncHost')).toBe(true);
    hist.dispose();
    expect(Object.prototype.hasOwnProperty.call(app, 'createSyncHost')).toBe(false);
    expect(app.hooks.onCommit).toBeUndefined();
    expect(app.hooks.onBeforeBigChange).toBeUndefined();
    expect(app.hooks.preserveLoserExam).toBeUndefined();
  });

  it('app 이 원격 훅을 직접 불러도(제안한 훅이 생긴 뒤) 감싸기와 겹쳐 두 번 처리하지 않는다', async () => {
    const env = await setup({ connect: false });
    const { app } = env;
    const hooks = app.hooks as { onBeforeRemote?: () => void; onRemoteApplied?: () => void };
    const base = app.createSyncHost;
    // 훅을 호스트 안쪽에서 부르는 개선된 app 을 흉내 낸다(connect 전에 바꿔 두면 이력이 그 위를 감싼다)
    app.createSyncHost = () => {
      const h = base.call(app);
      return {
        ...h,
        applyRemote: (m) => { hooks.onBeforeRemote?.(); h.applyRemote(m); },
        onApplied: () => { h.onApplied?.(); hooks.onRemoteApplied?.(); },
      };
    };
    await env.hist.connect(app);
    const host = app.createSyncHost();
    host.applyRemote((d) => { d.exams[0].name = '원격'; });
    host.onApplied?.();
    await env.hist.flush();
    expect(env.hist.list().filter((x) => x.kind === 'before-sync')).toHaveLength(1);
    expect(env.hist.log.filter((e) => e.kind === 'sync-received')).toMatchObject([{ count: 1 }]);
    env.hist.dispose();
  });
});

describe('보관 정책', () => {
  it('자동·before-* 는 최근 30개만, 핀·수동은 남긴다. 정리 알림은 처음 한 번', async () => {
    const { app, hist, clock } = await setup();
    await hist.createManual('수동 보관');
    for (let i = 0; i < 3; i++) { clock.t += 1000; rename(app, `n${i}`, `삭제 ${i}`, { big: true }); }
    await hist.flush();
    const oldest = hist.list().filter((s) => s.kind === 'before-big').at(-1)!;
    expect(await hist.pin(oldest.id, true)).toBe(true);
    for (let i = 3; i < 40; i++) { clock.t += 1000; rename(app, `n${i}`, `삭제 ${i}`, { big: true }); }
    await hist.flush();
    const list = hist.list();
    const limited = list.filter((s) => s.kind === 'before-big' && !s.pinned);
    expect(limited).toHaveLength(AUTO_KEEP_COUNT);
    expect(list.some((s) => s.id === oldest.id && s.pinned)).toBe(true);
    expect(list.some((s) => s.kind === 'manual' && s.label === '수동 보관')).toBe(true);
    expect(hist.pruneNotice).not.toBeNull();
    hist.dismissPruneNotice();
    clock.t += 1000;
    rename(app, '또', '삭제 또', { big: true });
    await hist.flush();
    expect(hist.pruneNotice).toBeNull(); // 다시 알리지 않는다
    hist.dispose();
  });

  it('90일이 지난 자동 스냅샷은 정리하되 핀·수동·동기화 충돌은 남긴다', async () => {
    const { app, hist, clock } = await setup();
    await hist.createManual('수동');
    clock.t += 1000;
    rename(app, 'a', '이름 a');
    clock.t += 1000;
    rename(app, 'b', '삭제 b', { big: true });
    clock.t += 1000;
    rename(app, 'c', '삭제 c', { big: true });
    app.createSyncHost().preserveLoserExam({ name: '동기화 전(2026-11-18)', exam: JSON.parse(JSON.stringify(app.state.exams[0])), at: clock.t });
    await hist.flush();
    const pinTarget = hist.list().find((s) => s.kind === 'before-big' && s.label === '삭제 c')!;
    await hist.pin(pinTarget.id, true);
    expect(hist.list()).toHaveLength(4);

    clock.t += 91 * DAY_MS;
    rename(app, 'd', '삭제 d', { big: true });
    await hist.flush();
    const kinds = hist.list().map((s) => `${s.kind}${s.pinned ? '*' : ''}`).sort();
    expect(kinds).toEqual(['before-big', 'before-big*', 'manual', 'sync-loser']);
    hist.dispose();
  });

  it('핀 토글과 삭제', async () => {
    const { app, hist } = await setup();
    rename(app, 'x');
    await hist.flush();
    const id = hist.list()[0].id;
    expect(await hist.pin(id, true)).toBe(true);
    expect(hist.list()[0].pinned).toBe(true);
    expect(await hist.pin(id, false)).toBe(true);
    expect(hist.list()[0].pinned).toBe(false);
    expect(await hist.pin('없는 id', true)).toBe(false);
    expect(await hist.remove(id)).toBe(true);
    expect(hist.list()).toHaveLength(0);
    expect(await hist.remove(id)).toBe(false);
    hist.dispose();
  });

  it('새 연결(새로고침)에서도 목록이 남는다', async () => {
    const env = await setup();
    await env.hist.createManual('저장해 둔 것');
    await env.hist.flush();
    env.hist.dispose();
    const h2 = env.mk();
    await h2.connect(env.app);
    expect(h2.ready).toBe(true);
    expect(h2.list().map((s) => s.label)).toEqual(['저장해 둔 것']);
    h2.dispose();
  });

  it('다른 탭이 쓴 이력은 refresh 로 본다', async () => {
    const env = await setup();
    const other = env.mk();
    await other.connect(env.app);
    await other.createManual('다른 탭');
    await other.flush();
    expect(env.hist.list()).toHaveLength(0);
    await env.hist.refresh();
    expect(env.hist.list().map((s) => s.label)).toEqual(['다른 탭']);
    other.dispose();
    env.hist.dispose();
  });
});

describe('작업 기록', () => {
  it('같은 label 의 짧은 간격은 합치고, 다른 label 은 따로 쌓는다(최신 먼저)', async () => {
    const { app, hist, clock } = await setup();
    rename(app, '1', '메모 수정');
    clock.t += 2000;
    rename(app, '2', '메모 수정');
    clock.t += 2000;
    rename(app, '3', '시험 날짜 변경');
    expect(hist.log.map((e) => [e.label, e.count, e.kind, e.device])).toEqual([
      ['시험 날짜 변경', 1, 'local', '내 기기'],
      ['메모 수정', 2, 'local', '내 기기'],
    ]);
    clock.t += 60_000;
    rename(app, '4', '시험 날짜 변경');
    expect(hist.log).toHaveLength(3);
    hist.dispose();
  });

  it(`최근 ${LOG_MAX}건까지만 보관하고 저장소에도 그만큼만 남는다`, async () => {
    const env = await setup();
    for (let i = 0; i < LOG_MAX + 10; i++) { env.clock.t += 60_000; rename(env.app, `이름 ${i}`, `작업 ${i}`); }
    await env.hist.flush();
    expect(env.hist.log).toHaveLength(LOG_MAX);
    expect(env.hist.log[0].label).toBe(`작업 ${LOG_MAX + 9}`);
    env.hist.dispose();
    const h2 = env.mk();
    await h2.connect(env.app);
    expect(h2.log).toHaveLength(LOG_MAX);
    expect(h2.log[LOG_MAX - 1].label).toBe('작업 10');
    h2.dispose();
  });

  it('실행 취소·다시 실행도 기록되고, 복원은 restore 종류로 남는다', async () => {
    const { app, hist } = await setup();
    rename(app, '바뀜');
    app.undo();
    expect(hist.log[0].label).toContain('되돌리기');
    await hist.flush();
    const snap = hist.list()[0];
    rename(app, '또 바뀜');
    await hist.restore(snap.id);
    expect(hist.log[0]).toMatchObject({ kind: 'restore', label: H.restoreLabel });
    hist.dispose();
  });
});

describe('복원', () => {
  it('현재 상태를 복원 전 스냅샷으로 먼저 보존하고 되돌린다. 활성 시험은 유지, 실행 취소 가능', async () => {
    const { app, hist } = await setup();
    const full = richState();
    const m = await hist.createManual('기준');
    const activeBefore = app.state.activeId;
    app.mutate('시험 삭제', (s) => { s.exams.shift(); }, { big: true });
    expect(app.state.exams).toHaveLength(1);
    await hist.flush();

    const r = await hist.restore(m.meta!.id);
    expect(r).toMatchObject({ ok: true, kind: 'state', changed: true, durable: true });
    expect(app.state.exams.map((e) => e.name)).toEqual(full.exams.map((e) => e.name));
    expect(app.state.activeId).toBe(activeBefore);
    const pre = hist.list().find((s) => s.kind === 'before-restore')!;
    expect(pre).toBeDefined();
    expect(pre.counts.exams).toBe(1); // 복원 직전(시험 하나) 상태
    expect(pre.id).toBe((r as { preservedId: string }).preservedId);
    expect(hist.list().some((s) => s.label === H.restoreLabel)).toBe(false); // 큰 변경 훅이 중복 스냅샷을 만들지 않는다

    expect(app.undoLabel).toBe(H.restoreLabel);
    app.undo();
    expect(app.state.exams).toHaveLength(1);
    hist.dispose();
  });

  it('복원 전 스냅샷으로 다시 되돌릴 수 있다(왕복)', async () => {
    const { app, hist } = await setup();
    const m = await hist.createManual('기준');
    rename(app, '나중 이름');
    const later = snapshotOf(app);
    await hist.restore(m.meta!.id);
    expect(app.state.exams[0].name).not.toBe('나중 이름');
    await hist.flush();
    const pre = hist.list().find((s) => s.kind === 'before-restore')!;
    await hist.restore(pre.id);
    expect(app.state.exams[0].name).toBe('나중 이름');
    // 내용 비교: 동기화 시각 표지(시험 at·settingsAt)는 복원할 때 새 편집으로 올라가므로 뺀다
    const content = (s: State) => JSON.stringify({ ...s, updatedAt: 0, activeId: null, settingsAt: undefined, exams: s.exams.map((e) => ({ ...e, at: undefined })) });
    expect(content(app.state)).toBe(content(JSON.parse(later) as State));
    hist.dispose();
  });

  it('현재 내용과 같으면 아무것도 하지 않는다', async () => {
    const { app, hist } = await setup();
    const m = await hist.createManual();
    const before = snapshotOf(app);
    const r = await hist.restore(m.meta!.id);
    expect(r).toMatchObject({ ok: true, changed: false, preservedId: null });
    expect(snapshotOf(app)).toBe(before);
    expect(hist.list().some((s) => s.kind === 'before-restore')).toBe(false);
    hist.dispose();
  });

  it('없는 id·연결 전·불러오기 문제가 있으면 사유와 함께 실패한다', async () => {
    const env = await setup({ connect: false });
    expect(await env.hist.restore('x')).toEqual({ ok: false, error: H.errNoApp });
    await env.hist.connect(env.app);
    expect(await env.hist.restore('x')).toEqual({ ok: false, error: H.errNotFound });
    env.hist.dispose();
  });

  /** 검증을 통과하지 못하는 본문을 가진 스냅샷을 저장소에 직접 넣고 새 연결로 읽는다 */
  async function withBadSnapshot(state: SnapshotRecord['state']) {
    const env = await setup({ connect: false });
    const db = createHistoryDb({ indexedDB: env.idb });
    await db.load();
    const rec: SnapshotRecord = {
      id: 's-bad', at: env.clock.t - 1000, kind: 'manual', label: '나쁜 것', device: 'd', pinned: false, hash: 'bad-hash',
      counts: { exams: 1, tasks: 0, subs: 0, library: 0 }, bytes: 1, state,
    };
    await db.putSnapshot(rec);
    db.close();
    await env.hist.connect(env.app);
    return env;
  }
  const raw = (text: string): SnapshotRecord['state'] => ({ enc: 'raw', data: new TextEncoder().encode(text) });

  it('검증에 실패하는 스냅샷은 상태를 바꾸지 않고 사유를 알린다', async () => {
    const env = await withBadSnapshot(raw(JSON.stringify({ v: 3, exams: 'x', library: [] })));
    const before = snapshotOf(env.app);
    const r = await env.hist.restore('s-bad');
    expect(r).toEqual({ ok: false, error: H.errInvalid });
    expect(snapshotOf(env.app)).toBe(before);
    expect(env.hist.list().some((s) => s.kind === 'before-restore')).toBe(false);
    expect(env.app.canUndo).toBe(false);
    env.hist.dispose();
  });

  it('일부 시험을 읽을 수 없는 스냅샷은 되돌리지 않는다', async () => {
    const s = JSON.parse(JSON.stringify(richState()));
    s.exams[1].end = '1999-01-01'; // 종료일이 시작일보다 앞서 버려진다
    const env = await withBadSnapshot(raw(JSON.stringify(s)));
    const before = snapshotOf(env.app);
    expect(await env.hist.restore('s-bad')).toEqual({ ok: false, error: H.errPartial });
    expect(snapshotOf(env.app)).toBe(before);
    env.hist.dispose();
  });

  it('JSON 이 아니거나 압축이 깨졌으면 사유와 함께 실패한다', async () => {
    const e1 = await withBadSnapshot(raw('{깨진'));
    expect(await e1.hist.restore('s-bad')).toEqual({ ok: false, error: H.errParse });
    e1.hist.dispose();
    const e2 = await withBadSnapshot({ enc: 'gzip', data: new Uint8Array([9, 9, 9]) });
    const before = snapshotOf(e2.app);
    expect(await e2.hist.restore('s-bad')).toEqual({ ok: false, error: H.errUnpack });
    expect(snapshotOf(e2.app)).toBe(before);
    e2.hist.dispose();
    const e3 = await withBadSnapshot(undefined);
    expect(await e3.hist.restore('s-bad')).toEqual({ ok: false, error: H.errNoState });
    e3.hist.dispose();
  });
});

describe('동기화에서 진 시험', () => {
  it('진 시험 하나만 저장하고(상태 없음), 같은 것은 합친다', async () => {
    const { app, hist, clock } = await setup();
    const loser = JSON.parse(JSON.stringify(app.state.exams[0]));
    const host = app.createSyncHost();
    host.preserveLoserExam({ name: '동기화 전(2026-11-18)', exam: loser, at: clock.t });
    host.preserveLoserExam({ name: '동기화 전(2026-11-18)', exam: loser, at: clock.t + 5 });
    await hist.flush();
    const list = hist.list();
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe('sync-loser');
    expect(list[0].label).toBe(`동기화 전(2026-11-18) · ${loser.name}`);
    expect(list[0].counts).toMatchObject({ exams: 1, tasks: loser.tasks.length, subs: loser.subs.length });
    expect(list[0].bytes).toBeGreaterThan(0);
    hist.dispose();
  });

  it('시험으로 복사해 되살린다: 새 id·(복원) 이름, 기존 시험은 그대로', async () => {
    const { app, hist, clock } = await setup();
    const loser = JSON.parse(JSON.stringify(app.state.exams[0]));
    const original = JSON.stringify(app.state.exams);
    const active = app.state.activeId;
    app.createSyncHost().preserveLoserExam({ name: '동기화 전(2026-11-18)', exam: loser, at: clock.t });
    await hist.flush();
    const r = await hist.restore(hist.list()[0].id);
    expect(r).toMatchObject({ ok: true, kind: 'exam', examName: `${loser.name} (복원)` });
    expect(app.state.exams).toHaveLength(3);
    expect(JSON.stringify(app.state.exams.slice(0, 2))).toBe(original);
    const added = app.state.exams[2];
    expect(added.id).not.toBe(loser.id);
    expect(added.name.endsWith(' (복원)')).toBe(true);
    expect(added.tasks).toHaveLength(loser.tasks.length);
    expect(app.state.activeId).toBe(active);
    expect(hist.log[0].kind).toBe('restore');
    expect(hist.list().some((s) => s.kind === 'before-restore')).toBe(false);
    hist.dispose();
  });

  it('원격의 잘못된 시험 데이터는 상태를 바꾸지 않고 사유를 알린다', async () => {
    const { app, hist, clock } = await setup();
    app.createSyncHost().preserveLoserExam({ name: '동기화 전(2026-11-18)', exam: { name: '날짜 없음' }, at: clock.t });
    await hist.flush();
    expect(hist.list()).toHaveLength(1); // 모양이 틀려도 보존은 한다
    const before = snapshotOf(app);
    expect(await hist.restore(hist.list()[0].id)).toEqual({ ok: false, error: H.errExamInvalid });
    expect(snapshotOf(app)).toBe(before);
    hist.dispose();
  });

  it('직렬화할 수 없는 원격 데이터는 던지지 않고 무시한다', async () => {
    const { app, hist, clock } = await setup();
    const cyc: Record<string, unknown> = { name: '순환' };
    cyc.self = cyc;
    expect(() => app.createSyncHost().preserveLoserExam({ name: 'x', exam: cyc, at: clock.t })).not.toThrow();
    await hist.flush();
    expect(hist.list()).toHaveLength(0);
    hist.dispose();
  });
});

describe('연결·폴백', () => {
  it('connect 는 반복 호출해도 훅을 한 번만 건다. 기존 훅은 이어서 부르고 dispose 가 되돌린다', async () => {
    const env = await setup({ connect: false });
    const spy = vi.fn();
    env.app.hooks.onCommit = spy;
    await env.hist.connect(env.app);
    await env.hist.connect(env.app);
    rename(env.app, '바뀜');
    await env.hist.flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(env.hist.log).toHaveLength(1);
    expect(env.hist.list()).toHaveLength(1);
    env.hist.dispose();
    expect(env.app.hooks.onCommit).toBe(spy);
    rename(env.app, '바뀜 2');
    expect(env.hist.log).toHaveLength(0);
  });

  it('IndexedDB 를 쓸 수 없어도 앱은 계속 동작하고 이 창에서는 이력이 유지된다', async () => {
    const env = await setup({ idb: null });
    expect(env.hist.historyStatus.state).toBe('memory');
    rename(env.app, '바뀜');
    await env.hist.flush();
    expect(env.app.state.exams[0].name).toBe('바뀜');
    expect(env.hist.list()).toHaveLength(1);
    const m = await env.hist.createManual('수동');
    expect(m).toMatchObject({ action: 'added', durable: false });
    const r = await env.hist.restore(env.hist.list().find((s) => s.kind === 'auto')!.id);
    expect(r).toMatchObject({ ok: true, durable: false });
    expect(env.hist.historyStatus.message).toContain('이 창을 닫으면');
    env.hist.dispose();
    const h2 = env.mk();
    await h2.connect(env.app);
    expect(h2.list()).toHaveLength(0); // 창을 닫으면(새 연결) 사라진다
    h2.dispose();
  });

  it('저장소 쓰기가 실패하면 historyStatus 가 failed 이고 메모리 사본으로 계속 동작한다', async () => {
    const idb = new IDBFactory();
    const env = await setup({ idb });
    const probe = await new Promise<IDBDatabase>((res) => { const r = idb.open('examPlannerHistory'); r.onsuccess = () => res(r.result); });
    const proto = Object.getPrototypeOf(probe) as IDBDatabase;
    probe.close();
    const orig = proto.transaction;
    const spy = vi.spyOn(proto, 'transaction').mockImplementation(function (this: IDBDatabase, ...a: Parameters<IDBDatabase['transaction']>) {
      if (a[1] === 'readwrite') throw new DOMException('full', 'QuotaExceededError');
      return orig.apply(this, a);
    });
    try {
      const m = await env.hist.createManual('용량 부족');
      expect(m).toMatchObject({ action: 'added', durable: false });
      expect(env.hist.historyStatus).toMatchObject({ state: 'failed', reason: 'quota' });
      expect(env.hist.list()).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
    await env.hist.createManual('복구 뒤');
    rename(env.app, '바뀜');
    await env.hist.flush();
    expect(env.hist.historyStatus.state).toBe('ok');
    env.hist.dispose();
  });

  it('수동 저장 이름: 비우면 기본 이름, 길면 60자로 줄인다', async () => {
    const { app, hist } = await setup();
    const a = await hist.createManual('   ');
    expect(a.meta!.label).toBe(H.manualLabel);
    rename(app, '다른');
    const b = await hist.createManual('가'.repeat(100));
    expect(Array.from(b.meta!.label)).toHaveLength(60);
    hist.dispose();
  });
});

// H-1(새 기기가 서버 설정을 기본값으로 덮음)·M-3(설정 충돌 패자 보존)·M-2(충돌 승패는 항목 시각으로)의 회귀 시험.
import { describe, expect, it } from 'vitest';
import { generateSyncKey } from 'sync-kit';
import { createSyncAdapter, examItemId, kindOfId, SETTINGS_ID } from '../../src/lib/sync/adapter';
import { resetPrefsMemory } from '../../src/lib/storage/prefs';
import { IDBFactory } from 'fake-indexeddb';
import { newState, sanitizeState } from '../../src/lib/core';
import { memHost, mkExam } from '../sync/helpers';
import { Mem, edit, makeDevice, makeServer, mkTab, sync, type Dev } from './harness';

const exam = (d: Dev, n: string) => d.host.state.exams.find((e) => e.name === n)!;

describe('H-1 설정 항목 시각', () => {
  it('이미 편집한 새 기기가 기존 공간에 처음 연결해도 서버 설정을 유지한다', async () => {
    const server = makeServer(); const key = generateSyncKey();
    const a = await makeDevice(server, key);
    edit(a, 1000, (s) => { mkExam(s, 'A-exam', ['국어']); s.recapDays = 3; s.settingsAt = 1000; });
    await sync(a);
    const b = await makeDevice(server, key);
    edit(b, 2000, (s) => { mkExam(s, 'B-exam', ['수학']); }); // 설정은 기본값(recapDays 7), settingsAt 없음
    await sync(b, a);
    expect(b.host.state.recapDays).toBe(3);
    expect(a.host.state.recapDays).toBe(3); // 수정 전에는 A 도 7 로 덮였다
    expect(b.host.losersSettings).toEqual([]); // 한 번도 바꾼 적 없는 기본값은 이력에 남기지 않는다
  });
  it('완전히 빈 새 기기는 서버 설정을 받는다', async () => {
    const server = makeServer(); const key = generateSyncKey();
    const a = await makeDevice(server, key);
    edit(a, 1000, (s) => { mkExam(s, 'A-exam', ['국어']); s.recapDays = 3; s.settingsAt = 1000; });
    await sync(a);
    const b = await makeDevice(server, key);
    await sync(b, a);
    expect(b.host.state.recapDays).toBe(3);
  });
  it('설정 항목은 kind doc 이고 updatedAt 은 settingsAt 이다(없으면 0)', async () => {
    const h = memHost(newState());
    h.state.updatedAt = 9999;
    const ad = createSyncAdapter(h);
    let st = (await ad.listLocal()).find((i) => i.id === SETTINGS_ID)!;
    expect(st.kind).toBe('doc');
    expect(st.updatedAt).toBe(0);
    h.state.settingsAt = 1234;
    st = (await ad.listLocal()).find((i) => i.id === SETTINGS_ID)!;
    expect(st.updatedAt).toBe(1234);
    expect(kindOfId(SETTINGS_ID)).toBe('doc');
  });
  it('설정 충돌의 패자는 이력 보존 훅으로 남는다(M-3)', async () => {
    const server = makeServer(); const key = generateSyncKey();
    const a = await makeDevice(server, key);
    edit(a, 1000, (s) => { mkExam(s, 'A-exam', ['국어']); });
    await sync(a); const b = await makeDevice(server, key); await sync(b);
    edit(a, 5000, (s) => { s.recapDays = 11; s.settingsAt = 5000; });
    edit(b, 4000, (s) => { s.limits.packed = 2; s.settingsAt = 4000; });
    edit(b, 9000, (s) => { exam(b, 'A-exam').name = 'renamed-on-B'; });
    await sync(a, b, a);
    expect(b.host.state.recapDays).toBe(11); // A 의 설정이 더 늦게 바뀌어 이긴다
    expect(b.host.losersSettings).toHaveLength(1); // 수정 전에는 흔적 없음
    expect((b.host.losersSettings[0].settings as { limits: { packed: number } }).limits.packed).toBe(2);
    expect(a.host.state.recapDays).toBe(11);
  });
  it('옛 앱이 올린 kind thread 설정도 받는다', async () => {
    const h = memHost(newState());
    const r = await createSyncAdapter(h).apply({ id: 'settings', kind: 'thread', updatedAt: 5, deleted: false, data: { limits: h.state.limits, defPlan: h.state.defPlan, recapDays: 4, week: {} } });
    expect(r).toBe('applied');
    expect(h.state.recapDays).toBe(4);
  });
});

describe('M-2 시험 항목 시각', () => {
  it('A 시험을 고친 직후 B 시험을 고쳐도 항목 시각이 같아지지 않는다(app.mutate)', async () => {
    resetPrefsMemory();
    const app = mkTab(new IDBFactory(), new Mem());
    await app.init();
    app.mutate('추가', (s) => { mkExam(s, 'EA', ['국어']); mkExam(s, 'EB', ['수학']); });
    const ad = createSyncAdapter(app.createSyncHost());
    const at = async (n: string) => (await ad.listLocal()).find((i) => i.id === examItemId(app.state.exams.find((e) => e.name === n)!.id))!.updatedAt;
    const t0 = await at('EA');
    app.mutate('A 수정', (s) => { s.exams.find((e) => e.name === 'EA')!.name = 'EA2'; });
    const ta = await at('EA2');
    app.mutate('B 수정', (s) => { s.exams.find((e) => e.name === 'EB')!.name = 'EB2'; });
    const tb = await at('EB2');
    expect(ta).toBeGreaterThan(t0);
    expect(tb).toBeGreaterThan(ta);
    expect(await at('EA2')).toBe(ta); // B 를 고쳐도 A 의 시각은 그대로
    app.dispose();
  });
  it('B 가 X 를 먼저 고치고 무관한 Y 를 나중에 고쳐도, A 의 더 늦은 X 편집이 이긴다', async () => {
    const server = makeServer(); const key = generateSyncKey();
    const a = await makeDevice(server, key);
    edit(a, 1000, (s) => { mkExam(s, 'X', ['국어']); mkExam(s, 'Y', ['수학']); });
    await sync(a); const b = await makeDevice(server, key); await sync(b);
    // 앱의 commit 이 하는 일: 바뀐 시험에만 at 을 올린다
    edit(b, 2000, () => { const x = exam(b, 'X'); x.name = 'X-B-old'; x.at = 2000; });
    edit(b, 9000, () => { const y = exam(b, 'Y'); y.name = 'Y-B'; y.at = 9000; });
    edit(a, 5000, () => { const x = exam(a, 'X'); x.name = 'X-A-new'; x.at = 5000; });
    await sync(a, b, a);
    expect(names(a)).toEqual(['X-A-new', 'Y-B']); // 수정 전에는 X 가 B 의 옛 값
    expect(names(b)).toEqual(['X-A-new', 'Y-B']);
  });
  it('sanitize 는 at·settingsAt 을 보존하고 없으면 만들지 않는다', () => {
    const st = newState(); mkExam(st, 'E', ['국어']);
    const plain = sanitizeState(JSON.parse(JSON.stringify(st)))!;
    expect('at' in plain.exams[0]).toBe(false);
    expect('settingsAt' in plain).toBe(false);
    const raw = JSON.parse(JSON.stringify(st)); raw.exams[0].at = 77; raw.settingsAt = 88;
    const kept = sanitizeState(raw)!;
    expect(kept.exams[0].at).toBe(77);
    expect(kept.settingsAt).toBe(88);
  });
});
const names = (d: Dev) => d.host.state.exams.map((e) => e.name).sort();

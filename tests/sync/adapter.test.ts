import { describe, expect, it } from 'vitest';
import type { LocalItem } from 'sync-kit';
import { contentHash, hashItem } from 'sync-kit';
import { newState } from '../../src/lib/core';
import type { State } from '../../src/lib/core/types';
import { createSyncAdapter, examItemId, kindOfId, libraryItemId, SETTINGS_ID } from '../../src/lib/sync/adapter';
import { memHost, mkExam, richState } from './helpers';

const byId = (l: LocalItem[]) => [...l].sort((a, b) => (a.id < b.id ? -1 : 1));
const snap = (o: unknown) => JSON.stringify(o);
const del = (id: string, kind: string): LocalItem => ({ id, kind, updatedAt: 0, deleted: true, data: null });
/** 엔진처럼: 모두 적용 -> 보류 항목을 한 번 더 */
async function applyAll(adapter: ReturnType<typeof createSyncAdapter>, items: LocalItem[]) {
  const results = new Map<string, 'applied' | 'deferred'>();
  for (const it of items) results.set(it.id, await adapter.apply(it));
  for (const it of items) if (results.get(it.id) === 'deferred') results.set(it.id, await adapter.apply(it));
  return results;
}
/** 기기 사이에서 동기화되지 않는 값(activeId, 시험·라이브러리 배열 순서, 시각)을 뺀 비교용 */
const comparable = (s: State) => ({ ...s, activeId: null, updatedAt: 0, exams: [...s.exams].sort((a, b) => (a.id < b.id ? -1 : 1)), library: [...s.library].sort((a, b) => (a.id < b.id ? -1 : 1)) });

describe('항목 id 와 kindOfId', () => {
  it('접두사 + 로컬 id', () => {
    expect(examItemId('k1abc')).toBe('e-k1abc');
    expect(libraryItemId('k1abc')).toBe('l-k1abc');
    expect(SETTINGS_ID).toBe('settings');
  });
  it('62자를 넘으면 접두사 + contentHash(id), 허용 문자 밖이어도 같다', () => {
    const long = 'a'.repeat(61);
    expect(examItemId(long)).toBe(`e-${contentHash(long)}`);
    expect(examItemId('a'.repeat(60))).toBe(`e-${'a'.repeat(60)}`); // 62자는 그대로
    expect(libraryItemId('한글 id')).toBe(`l-${contentHash('한글 id')}`);
    expect(examItemId(long)).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });
  it('kindOfId: 해시로 줄어도 접두사로 종류를 안다', () => {
    expect(kindOfId('e-abc')).toBe('doc');
    expect(kindOfId(examItemId('a'.repeat(80)))).toBe('doc');
    expect(kindOfId('l-abc')).toBe('snippet');
    expect(kindOfId('settings')).toBe('doc'); // 설정도 충돌 패자를 이력에 남기려고 'doc'. 시험과의 구분은 id
    expect(kindOfId('x-abc')).toBeUndefined();
    expect(createSyncAdapter(memHost()).kindOfId?.('l-1')).toBe('snippet');
  });
  it('서버가 보는 항목 id 에 시험 이름·과목명이 없다', async () => {
    const h = memHost(richState());
    for (const it of await createSyncAdapter(h).listLocal()) {
      expect(it.id).not.toMatch(/중간고사|기말|국어|수학|영어|과학/);
      expect(it.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
  });
});

describe('listLocal', () => {
  it('시험·라이브러리·설정을 항목으로 내놓고 id 순으로 결정적이다', async () => {
    const st = richState();
    const items = await createSyncAdapter(memHost(st)).listLocal();
    expect(items.filter((i) => i.kind === 'doc' && i.id !== 'settings')).toHaveLength(2);
    expect(items.filter((i) => i.kind === 'snippet')).toHaveLength(st.library.length);
    expect(items.filter((i) => i.id === 'settings').map((i) => i.kind)).toEqual(['doc']);
    expect(items.map((i) => i.id)).toEqual([...items.map((i) => i.id)].sort());
    // 시험·라이브러리는 state.updatedAt(시험은 at 이 없을 때), 설정은 settingsAt(없으면 0)
    expect(items.every((i) => !i.deleted && i.updatedAt === (i.id === 'settings' ? 0 : st.updatedAt))).toBe(true);
    // 배열 순서를 바꿔도 같은 출력
    const rev: State = JSON.parse(snap(st));
    rev.exams.reverse();
    rev.library.reverse();
    expect(await createSyncAdapter(memHost(rev)).listLocal()).toEqual(items);
  });
  it('data 스키마: 시험은 id 포함 전체, 라이브러리는 {name,color}, 설정은 4개 필드, activeId 는 없다', async () => {
    const st = richState();
    const items = byId(await createSyncAdapter(memHost(st)).listLocal());
    const ex = items.find((i) => i.id === examItemId(st.exams[0].id))!;
    expect(ex.data).toEqual(st.exams[0]);
    const lib = items.find((i) => i.id === libraryItemId(st.library[0].id))!;
    expect(lib.data).toEqual({ name: st.library[0].name, color: st.library[0].color });
    const se = items.find((i) => i.id === 'settings')!;
    expect(Object.keys(se.data as object).sort()).toEqual(['defPlan', 'limits', 'recapDays', 'week']);
    expect(snap(items)).not.toContain('activeId');
  });
  it('빈 상태는 설정 항목 하나만 낸다', async () => {
    const items = await createSyncAdapter(memHost()).listLocal();
    expect(items.map((i) => i.id)).toEqual(['settings']);
  });
});

describe('왕복(상태 -> 항목 -> 빈 상태 apply -> 같은 상태)', () => {
  it('시험이 라이브러리보다 먼저 와도(deferred) 두 번째 시도로 같은 상태가 된다', async () => {
    const src = richState();
    const items = await createSyncAdapter(memHost(src)).listLocal();
    // id 순에서는 시험('e-')이 라이브러리('l-')보다 앞이라 첫 시도는 deferred 가 된다
    const dst = memHost();
    const adapter = createSyncAdapter(dst);
    const first = await adapter.apply(items.find((i) => i.kind === 'doc')!);
    expect(first).toBe('deferred');
    const results = await applyAll(createSyncAdapter(memHost()), items);
    expect([...results.values()].every((r) => r === 'applied')).toBe(true);
    const dst2 = memHost();
    await applyAll(createSyncAdapter(dst2), items);
    expect(comparable(dst2.state)).toEqual(comparable(src));
    expect(dst2.state.activeId).toBe(dst2.state.exams[0].id); // 빈 기기는 첫 시험을 연다
  });
  it('왕복 안정성: apply 한 뒤 listLocal 의 data 해시가 받은 data 와 같다(dirty 루프 없음)', async () => {
    const items = await createSyncAdapter(memHost(richState())).listLocal();
    const dst = memHost();
    const adapter = createSyncAdapter(dst);
    await applyAll(adapter, items);
    const back = new Map((await adapter.listLocal()).map((i) => [i.id, i]));
    for (const it of items) expect(hashItem(back.get(it.id)!), it.id).toBe(hashItem(it));
    expect(back.size).toBe(items.length);
  });
  it('이미 같은 상태인 항목을 다시 받으면 host.applyRemote 를 부르지 않는다', async () => {
    const src = richState();
    const items = await createSyncAdapter(memHost(src)).listLocal();
    const dst = memHost(JSON.parse(snap(src)));
    const adapter = createSyncAdapter(dst);
    for (const it of items) expect(await adapter.apply(it)).toBe('applied');
    expect(dst.appliedCalls).toBe(0);
    expect(dst.applied).toBe(0);
  });
  it('apply 는 state.updatedAt 을 올리지 않는다(로컬 변경이 아니다)', async () => {
    const items = await createSyncAdapter(memHost(richState())).listLocal();
    const dst = memHost();
    await applyAll(createSyncAdapter(dst), items);
    expect(dst.state.updatedAt).toBe(0);
  });
});

describe('deferred', () => {
  it('시험이 참조하는 library id 가 없으면 deferred 이고 상태를 바꾸지 않는다. library 도착 뒤 재적용에 성공한다', async () => {
    const src = richState();
    const items = await createSyncAdapter(memHost(src)).listLocal();
    const dst = memHost();
    const adapter = createSyncAdapter(dst);
    const exam = items.find((i) => i.kind === 'doc')!;
    expect(await adapter.apply(exam)).toBe('deferred');
    expect(dst.state.exams).toEqual([]);
    expect(dst.appliedCalls).toBe(0);
    for (const l of items.filter((i) => i.kind === 'snippet')) expect(await adapter.apply(l)).toBe('applied');
    expect(await adapter.apply(exam)).toBe('applied');
    expect(dst.state.exams.map((e) => e.id)).toEqual([exam.id.slice(2)]);
  });
  it('과목이 없는 시험은 library 없이도 applied', async () => {
    const src = newState();
    mkExam(src, '빈 시험', []);
    const items = await createSyncAdapter(memHost(src)).listLocal();
    const dst = memHost();
    expect(await createSyncAdapter(dst).apply(items.find((i) => i.kind === 'doc')!)).toBe('applied');
    expect(dst.state.exams).toHaveLength(1);
  });
});

describe('삭제', () => {
  it('원격 삭제는 시험을 지우고 항상 applied, activeId 가 지워진 시험이면 첫 시험으로', async () => {
    const st = richState();
    const [a, b] = st.exams;
    st.activeId = b.id;
    const h = memHost(st);
    const adapter = createSyncAdapter(h);
    expect(await adapter.apply(del(examItemId(b.id), 'doc'))).toBe('applied');
    expect(h.state.exams.map((e) => e.id)).toEqual([a.id]);
    expect(h.state.activeId).toBe(a.id);
    await adapter.apply(del(examItemId(a.id), 'doc'));
    expect(h.state.exams).toEqual([]);
    expect(h.state.activeId).toBeNull();
    // 없는 항목의 삭제는 변화 없음
    const calls = h.appliedCalls;
    expect(await adapter.apply(del(examItemId('nope'), 'doc'))).toBe('applied');
    expect(h.appliedCalls).toBe(calls);
  });
  it('삭제된 시험은 listLocal 이 내놓지 않는다(엔진이 목록에서 빠진 것으로 삭제를 추정)', async () => {
    const st = richState();
    const gone = st.exams[0].id;
    const h = memHost(st);
    await createSyncAdapter(h).apply(del(examItemId(gone), 'doc'));
    const ids = (await createSyncAdapter(h).listLocal()).map((i) => i.id);
    expect(ids).not.toContain(examItemId(gone));
  });
  it('내용 없이 도착한 삭제(kind unknown)도 id 로 종류를 알아 처리한다', async () => {
    const st = richState();
    const gone = st.exams[0].id;
    const h = memHost(st);
    await createSyncAdapter(h).apply(del(examItemId(gone), 'unknown'));
    expect(h.state.exams.some((e) => e.id === gone)).toBe(false);
  });
  it('라이브러리 삭제는 그 과목을 참조하는 시험의 과목·할일도 함께 지운다', async () => {
    const st = richState();
    const lib = st.library.find((l) => l.name === '과학')!;
    const h = memHost(st);
    await createSyncAdapter(h).apply(del(libraryItemId(lib.id), 'snippet'));
    expect(h.state.library.some((l) => l.id === lib.id)).toBe(false);
    for (const e of h.state.exams) {
      expect(e.subs.some((s) => s.subjectId === lib.id)).toBe(false);
      expect(e.tasks.every((t) => e.subs.some((s) => s.id === t.esId))).toBe(true);
    }
  });
  it('removeLocal: 시험은 완전히 지우고 설정은 건드리지 않는다', async () => {
    const st = richState();
    const gone = st.exams[0];
    const h = memHost(st);
    const adapter = createSyncAdapter(h);
    await adapter.removeLocal({ id: examItemId(gone.id), kind: 'doc', updatedAt: 1, deleted: false, data: gone });
    expect(h.state.exams.some((e) => e.id === gone.id)).toBe(false);
    const limits = JSON.parse(snap(h.state.limits));
    await adapter.removeLocal({ id: 'settings', kind: 'thread', updatedAt: 1, deleted: false, data: {} });
    expect(h.state.limits).toEqual(limits);
  });
});

describe('라이브러리 이름 중복 합치기', () => {
  function stateWith(libId: string, name: string, examName: string) {
    const st = newState();
    st.library.push({ id: libId, name, color: '#C4705A' });
    mkExam(st, examName, [name]);
    return st;
  }
  const libItem = (id: string, name: string, color = '#5F9EA0'): LocalItem => ({ id: libraryItemId(id), kind: 'snippet', updatedAt: 1, deleted: false, data: { name, color } });

  it('들어오는 id 가 더 작으면 그쪽이 정본: 로컬 패자를 지우고 시험의 subjectId 를 고친다', async () => {
    const h = memHost(stateWith('m9', '수학', 'E'));
    expect(await createSyncAdapter(h).apply(libItem('a1', '수학'))).toBe('applied');
    expect(h.state.library).toEqual([{ id: 'a1', name: '수학', color: '#5F9EA0' }]);
    expect(h.state.exams[0].subs.map((s) => s.subjectId)).toEqual(['a1']);
    expect((await createSyncAdapter(h).listLocal()).map((i) => i.id)).not.toContain('l-m9');
  });
  it('들어오는 id 가 더 크면 버려진다: 로컬 정본이 유지되고 상태가 바뀌지 않는다', async () => {
    const h = memHost(stateWith('a1', '수학', 'E'));
    const before = snap(h.state);
    expect(await createSyncAdapter(h).apply(libItem('m9', ' 수학 '))).toBe('applied');
    expect(snap(h.state)).toBe(before);
    expect(h.appliedCalls).toBe(0);
  });
  it('대소문자·공백만 다른 이름도 같은 과목이다', async () => {
    const h = memHost(stateWith('m9', 'English  Grammar', 'E'));
    await createSyncAdapter(h).apply(libItem('a1', 'english grammar'));
    expect(h.state.library.map((l) => l.id)).toEqual(['a1']);
  });
  it('한 시험에 두 id 가 함께 있으면 앞 과목만 남기고 뒤 과목과 할일을 지운다', async () => {
    const st = newState();
    st.library.push({ id: 'm9', name: '수학', color: '#C4705A' }, { id: 'z5', name: '수학2', color: '#C4705A' });
    const e = mkExam(st, 'E', ['수학', '수학2']);
    const keep = e.subs[0];
    const h = memHost(st);
    // 수학2 가 '수학' 으로 개명된 원격 항목(id z5) -> 정본은 m9 (m9 < z5)
    await createSyncAdapter(h).apply(libItem('z5', '수학'));
    expect(h.state.library.map((l) => l.id)).toEqual(['m9']);
    const ex = h.state.exams[0];
    expect(ex.subs.map((s) => s.id)).toEqual([keep.id]);
    expect(ex.tasks.every((t) => t.esId === keep.id)).toBe(true);
  });
  it('같은 id 의 이름 변경이 다른 항목과 겹치면 id 가 큰 쪽이 합쳐진다', async () => {
    const st = newState();
    st.library.push({ id: 'a1', name: '국어', color: '#C4705A' }, { id: 'b2', name: '수학', color: '#5F9EA0' });
    mkExam(st, 'E', ['수학']);
    const h = memHost(st);
    await createSyncAdapter(h).apply(libItem('b2', '국어')); // b2 가 국어로 개명 -> a1 이 정본
    expect(h.state.library.map((l) => l.id)).toEqual(['a1']);
    expect(h.state.exams[0].subs.map((s) => s.subjectId)).toEqual(['a1']);
  });
  it('합친 뒤 정본 id 를 참조하는 시험 항목을 받아도 적용된다', async () => {
    const h = memHost(stateWith('m9', '수학', 'E'));
    const adapter = createSyncAdapter(h);
    await adapter.apply(libItem('a1', '수학'));
    const remote = JSON.parse(snap(h.state.exams[0]));
    remote.range = 'x';
    expect(await adapter.apply({ id: examItemId(remote.id), kind: 'doc', updatedAt: 5, deleted: false, data: remote })).toBe('applied');
    expect(h.state.exams[0].subs.map((s) => s.subjectId)).toEqual(['a1']);
  });
  it('패자 id 를 참조하는 시험은 패자가 지워진 기기에서 deferred(정본으로 고친 시험이 올 때까지)', async () => {
    const h = memHost(stateWith('a1', '수학', 'E'));
    const other = stateWith('m9', '수학', 'F');
    const fItem = (await createSyncAdapter(memHost(other)).listLocal()).find((i) => i.kind === 'doc')!;
    expect(await createSyncAdapter(h).apply(fItem)).toBe('deferred');
    expect(h.state.exams).toHaveLength(1);
  });
});

describe('잘못된 원격 데이터', () => {
  const bad: [string, (e: Record<string, any>) => unknown][] = [
    ['시험 data 가 문자열', () => 'x'],
    ['시험 id 없음', (e) => ({ ...e, id: undefined })],
    ['항목 id 와 data.id 불일치', (e) => ({ ...e, id: 'other' })],
    ['날짜 형식 오류', (e) => ({ ...e, start: '내일' })],
    ['종료가 시작보다 앞', (e) => ({ ...e, start: '2026-06-26', end: '2026-06-22' })],
    ['이름 없음', (e) => ({ ...e, name: '   ' })],
  ];
  it.each(bad)('%s -> 상태를 바꾸지 않고 deferred', async (_n, mk) => {
    const st = richState();
    const src = st.exams[0];
    const h = memHost(st);
    const before = snap(h.state);
    const data = mk(JSON.parse(snap(src)));
    const r = await createSyncAdapter(h).apply({ id: examItemId(src.id), kind: 'doc', updatedAt: 9, deleted: false, data });
    expect(r).toBe('deferred');
    expect(snap(h.state)).toBe(before);
    expect(h.appliedCalls).toBe(0);
  });
  it('라이브러리·설정 data 오류도 거부한다', async () => {
    const h = memHost(richState());
    const before = snap(h.state);
    const a = createSyncAdapter(h);
    const it = (id: string, kind: string, data: unknown): LocalItem => ({ id, kind, updatedAt: 1, deleted: false, data });
    expect(await a.apply(it('l-x', 'snippet', { name: '', color: '#000000' }))).toBe('deferred');
    expect(await a.apply(it('l-x', 'snippet', 5))).toBe('deferred');
    expect(await a.apply(it('settings', 'thread', { limits: 1 }))).toBe('deferred');
    expect(await a.apply(it('e-x', 'snippet', { name: 'a', color: '#000000' }))).toBe('deferred'); // id 와 kind 불일치
    expect(snap(h.state)).toBe(before);
  });
  it('값 범위를 넘는 설정은 sanitizeState 규칙으로 잘라 반영한다', async () => {
    const h = memHost();
    const r = await createSyncAdapter(h).apply({
      id: 'settings', kind: 'thread', updatedAt: 1, deleted: false,
      data: { limits: { calm: 99, easy: -3, normal: 3, busy: 2, packed: 1 }, defPlan: { n: 1, m: 1, r: 0 }, recapDays: 500, week: { 1: 'busy', 2: 'zzz', 9: 'calm' } },
    });
    expect(r).toBe('applied');
    expect(h.state.limits.calm).toBe(20);
    expect(h.state.limits.easy).toBe(0);
    expect(h.state.recapDays).toBe(30);
    expect(h.state.week).toEqual({ 1: 'busy' });
  });
  it('모르는 종류·알 수 없는 id 는 applied 로 무시한다', async () => {
    const h = memHost(richState());
    const before = snap(h.state);
    const a = createSyncAdapter(h);
    expect(await a.apply({ id: 'zz', kind: 'note', updatedAt: 1, deleted: false, data: { a: 1 } })).toBe('applied');
    expect(await a.apply(del('zz', 'unknown'))).toBe('applied');
    expect(snap(h.state)).toBe(before);
  });
});

describe('id 가 해시로 줄어든 항목', () => {
  it('라이브러리·시험 모두 data.id 로 원래 id 를 복원한다', async () => {
    const st = newState();
    st.library.push({ id: 'ab c', name: '체육', color: '#C4705A' });
    const e = mkExam(st, 'E', ['체육']);
    e.id = 'x y';
    st.activeId = e.id;
    const items = await createSyncAdapter(memHost(st)).listLocal();
    expect(items.find((i) => i.kind === 'snippet')!.data).toMatchObject({ id: 'ab c' });
    const dst = memHost();
    await applyAll(createSyncAdapter(dst), items);
    expect(dst.state.library.map((l) => l.id)).toEqual(['ab c']);
    expect(dst.state.exams.map((x) => x.id)).toEqual(['x y']);
    expect(comparable(dst.state)).toEqual(comparable(st));
  });
});

describe('설정 항목', () => {
  it('왕복: 다른 기기에서 같은 설정이 된다', async () => {
    const src = richState();
    const items = await createSyncAdapter(memHost(src)).listLocal();
    const dst = memHost();
    await createSyncAdapter(dst).apply(items.find((i) => i.id === 'settings')!);
    expect({ limits: dst.state.limits, defPlan: dst.state.defPlan, recapDays: dst.state.recapDays, week: dst.state.week })
      .toEqual({ limits: src.limits, defPlan: src.defPlan, recapDays: src.recapDays, week: src.week });
    expect(dst.state.exams).toEqual([]); // 설정만 바뀐다
  });
  it('설정 삭제는 무시한다', async () => {
    const h = memHost(richState());
    const before = snap(h.state);
    await createSyncAdapter(h).apply(del('settings', 'thread'));
    expect(snap(h.state)).toBe(before);
  });
});

describe('activeId 보정', () => {
  it('activeId 가 null 인 기기가 시험을 받으면 첫 시험을 연다', async () => {
    const items = await createSyncAdapter(memHost(richState())).listLocal();
    const dst = memHost();
    await applyAll(createSyncAdapter(dst), items);
    expect(dst.state.exams.some((e) => e.id === dst.state.activeId)).toBe(true);
  });
  it('이미 고른 시험은 원격 수정이 와도 유지한다', async () => {
    const src = richState();
    const items = await createSyncAdapter(memHost(src)).listLocal();
    const dst = memHost();
    const ad = createSyncAdapter(dst);
    await applyAll(ad, items);
    dst.state.activeId = src.exams[1].id;
    const first = items.find((i) => i.id === examItemId(src.exams[0].id))!;
    await ad.apply({ ...first, data: { ...(first.data as object), name: '고침' } });
    expect(dst.state.exams.find((e) => e.id === src.exams[0].id)!.name).toBe('고침');
    expect(dst.state.activeId).toBe(src.exams[1].id);
  });
});

describe('preserveLoser', () => {
  it('시험이면 host.preserveLoserExam 을 라벨·시험·시각과 함께 부른다', async () => {
    const h = memHost(richState());
    const t = new Date(2026, 4, 3, 12).getTime();
    const adapter = createSyncAdapter(h, { now: () => t });
    const exam = h.state.exams[0];
    await adapter.preserveLoser({ id: examItemId(exam.id), kind: 'doc', updatedAt: 3, deleted: false, data: exam });
    expect(h.losers).toHaveLength(1);
    expect(h.losers[0].name).toBe('동기화 전(2026-05-03)');
    expect(h.losers[0].exam).toEqual(exam);
    expect(h.losers[0].at).toBe(t);
  });
  it('시험이 아니거나 data 가 없으면 부르지 않는다', async () => {
    const h = memHost(richState());
    const adapter = createSyncAdapter(h);
    await adapter.preserveLoser({ id: 'l-a', kind: 'snippet', updatedAt: 1, deleted: false, data: { name: 'a', color: '#000000' } });
    await adapter.preserveLoser({ id: 'settings', kind: 'thread', updatedAt: 1, deleted: false, data: {} });
    await adapter.preserveLoser(del('e-a', 'doc'));
    expect(h.losers).toEqual([]);
  });
  it('preserveLoser 는 시험 상태를 바꾸지 않는다', async () => {
    const h = memHost(richState());
    const before = snap(h.state);
    const e = h.state.exams[0];
    await createSyncAdapter(h).preserveLoser({ id: examItemId(e.id), kind: 'doc', updatedAt: 1, deleted: false, data: e });
    expect(snap(h.state)).toBe(before);
  });
});

describe('setApplying·onApplied', () => {
  it('엔진이 묶은 안에서는 끝에 한 번만 onApplied', async () => {
    const items = await createSyncAdapter(memHost(richState())).listLocal();
    const dst = memHost();
    const ad = createSyncAdapter(dst);
    ad.setApplying?.(true);
    await applyAll(ad, items);
    expect(dst.applied).toBe(0);
    ad.setApplying?.(false);
    expect(dst.applied).toBe(1);
  });
  it('묶음 밖의 apply 는 바로 onApplied, 변화가 없으면 부르지 않는다', async () => {
    const st = richState();
    const items = await createSyncAdapter(memHost(st)).listLocal();
    const dst = memHost(JSON.parse(snap(st)));
    const ad = createSyncAdapter(dst);
    await ad.apply(items[0]);
    expect(dst.applied).toBe(0);
    const se = items.find((i) => i.id === 'settings')!;
    await ad.apply({ ...se, data: { ...(se.data as object), recapDays: 3 } });
    expect(dst.applied).toBe(1);
    expect(dst.state.recapDays).toBe(3);
  });
});

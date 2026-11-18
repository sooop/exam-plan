// @vitest-environment node
// 동기화 전 구간 통합: 실제 서버 핸들러(+D1 shim) · 실제 코덱/키 · 실제 전송 · 실제 엔진 · 실제 어댑터(+메모리 호스트).
import { describe, expect, it } from 'vitest';
import { handleRequest, type Env } from 'sync-kit/handler';
import { D1Shim } from 'sync-kit/testing';
import {
  createCodec, createMemoryMetaStore, createSyncEngine, createTransport, deriveKeys, generateSyncKey,
  type SyncRequest, type SyncResponse,
} from 'sync-kit';
import { addSub, newState } from '../../src/lib/core';
import type { State } from '../../src/lib/core/types';
import { createSyncAdapter, examItemId } from '../../src/lib/sync/adapter';
import { APP_ID, SYNC_LIMITS } from '../../src/lib/sync/appTypes';
import { memHost, mkExam, type MemHost } from './helpers';

const URL_BASE = 'https://sync.test';
const INVITE = 'invite-code';

// ───────── 서버 ─────────
function makeServer() {
  const db = new D1Shim();
  const env: Env = { DB: db, INVITE_CODE: INVITE, ALLOWED_APPS: APP_ID };
  const s = {
    db,
    log: [] as { req: SyncRequest; status: number; res?: SyncResponse }[],
    fetch: (async (url: string, init: RequestInit) => {
      const resp = await handleRequest(new Request(url, init), env, { now: () => Date.now(), random: () => 1 });
      let res: SyncResponse | undefined;
      if (resp.status === 200) res = (await resp.clone().json()) as SyncResponse;
      s.log.push({ req: JSON.parse(init.body as string) as SyncRequest, status: resp.status, res });
      return resp;
    }) as typeof fetch,
    sqlite: (sql: string) => db.sqlite.prepare(sql).all() as Record<string, unknown>[],
  };
  return s;
}
type Server = ReturnType<typeof makeServer>;

// ───────── 기기 ─────────
interface Device { host: MemHost; engine: ReturnType<typeof createSyncEngine>; meta: ReturnType<typeof createMemoryMetaStore> }
async function makeDevice(server: Server, syncKey: string, state?: State): Promise<Device> {
  const host = memHost(state);
  const keys = await deriveKeys(syncKey, APP_ID);
  const meta = createMemoryMetaStore();
  const engine = createSyncEngine({
    config: { workerUrl: URL_BASE, syncKey, inviteCode: INVITE },
    appId: APP_ID, limits: SYNC_LIMITS, adapter: createSyncAdapter(host), meta,
    codec: createCodec(keys.encKey),
    transport: createTransport({ workerUrl: URL_BASE, appId: APP_ID, spaceId: keys.spaceId, authToken: keys.authToken }, server.fetch),
    autoSchedule: false,
  });
  return { host, engine, meta };
}

/** 로컬 편집을 흉내 낸다: 상태를 고치고 updatedAt 을 올린다(화면 쪽이 하는 일) */
function edit(d: Device, at: number, fn: (s: State) => void): void {
  fn(d.host.state);
  d.host.state.updatedAt = at;
}
async function ok(...ds: Device[]) {
  for (const d of ds) {
    await d.engine.syncNow();
    expect(d.engine.status.lastError, JSON.stringify(d.engine.status.lastError)).toBeUndefined();
    expect(d.engine.status.phase).toBe('idle');
  }
}
const revs = async (d: Device) => (await d.meta.getAll()).map((m) => `${m.id}:${m.rev}`).sort();
/** 변경 없이 한 번 더 sync 해도 서버 쓰기·rev 변화가 없다(dirty 루프 없음) */
async function expectQuiet(server: Server, ...ds: Device[]) {
  for (let i = 0; i < 2; i++) {
    for (const d of ds) {
      const before = await revs(d);
      const w = server.db.writes;
      await ok(d);
      expect(server.db.writes, '서버 쓰기').toBe(w);
      expect(await revs(d)).toEqual(before);
    }
  }
}
const sortedExams = (s: State) => [...s.exams].sort((a, b) => (a.id < b.id ? -1 : 1));
const sortedLib = (s: State) => [...s.library].sort((a, b) => (a.id < b.id ? -1 : 1));
const names = (s: State) => s.exams.map((e) => e.name).sort();

function seed(): State {
  const st = newState();
  mkExam(st, '2026 중간고사', ['국어', '수학']);
  mkExam(st, '기말고사', ['국어']);
  st.updatedAt = 1000;
  return st;
}

describe('동기화 통합(시험 플래너)', () => {
  it('A 에서 만든 시험·과목·설정이 B 에 전파되고 이후 조용하다', async () => {
    const server = makeServer();
    const key = generateSyncKey();
    const A = await makeDevice(server, key, seed());
    const B = await makeDevice(server, key);
    A.host.state.limits.packed = 2;
    A.host.state.recapDays = 5;
    await ok(A);
    await ok(B);
    expect(names(B.host.state)).toEqual(names(A.host.state));
    expect(sortedExams(B.host.state)).toEqual(sortedExams(A.host.state));
    expect(sortedLib(B.host.state)).toEqual(sortedLib(A.host.state));
    expect(B.host.state.limits.packed).toBe(2);
    expect(B.host.state.recapDays).toBe(5);
    expect(B.host.state.activeId).toBe(B.host.state.exams[0].id); // 첫 시험(기기별 값)
    expect(B.host.losers).toEqual([]);
    await ok(A);
    await expectQuiet(server, A, B);
    expect(server.sqlite('SELECT DISTINCT rev FROM items')).toEqual([{ rev: 1 }]);
    // 항목: 시험 2 + 과목 2 + 설정 1
    expect(server.sqlite('SELECT COUNT(*) AS n FROM items')[0].n).toBe(5);
  });

  it('B 가 시험을 고치면 A 에 반영된다', async () => {
    const server = makeServer();
    const key = generateSyncKey();
    const A = await makeDevice(server, key, seed());
    const B = await makeDevice(server, key);
    await ok(A, B);
    edit(B, 5000, (s) => { s.exams[0].name = '바뀐 이름'; s.exams[0].subs[0].range = '1~5단원'; });
    const id = B.host.state.exams[0].id;
    await ok(B, A);
    const a = A.host.state.exams.find((e) => e.id === id)!;
    expect(a.name).toBe('바뀐 이름');
    expect(a.subs[0].range).toBe('1~5단원');
    expect(A.host.losers).toEqual([]);
    await expectQuiet(server, A, B);
  });

  it('같은 시험을 두 기기가 동시에 고치면(더 늦은 쪽 승) 진 쪽이 preserveLoserExam 으로 남는다', async () => {
    const server = makeServer();
    const key = generateSyncKey();
    const A = await makeDevice(server, key, seed());
    const B = await makeDevice(server, key);
    await ok(A, B);
    const id = A.host.state.exams[0].id;
    edit(A, 10_000, (s) => { s.exams.find((e) => e.id === id)!.name = 'A 의 수정'; });
    edit(B, 20_000, (s) => { s.exams.find((e) => e.id === id)!.name = 'B 의 수정'; }); // 더 늦다 -> B 승
    await ok(B); // 늦은 B 가 먼저 올림
    await ok(A); // A 는 충돌 -> 진 로컬 사본을 보존하고 B 본문을 적용
    await ok(B);
    for (const d of [A, B]) expect(d.host.state.exams.find((e) => e.id === id)!.name).toBe('B 의 수정');
    expect(A.host.losers).toHaveLength(1);
    expect(A.host.losers[0].name).toMatch(/^동기화 전\(\d{4}-\d{2}-\d{2}\)$/);
    expect((A.host.losers[0].exam as { name: string; id: string }).name).toBe('A 의 수정');
    expect((A.host.losers[0].exam as { id: string }).id).toBe(id);
    expect(B.host.losers).toEqual([]);
    await expectQuiet(server, A, B);
  });

  it('오래된 쪽이 먼저 올려도(서버 사본이 진 쪽) 이긴 기기가 서버 사본을 보존하고 수렴한다', async () => {
    const server = makeServer();
    const key = generateSyncKey();
    const A = await makeDevice(server, key, seed());
    const B = await makeDevice(server, key);
    await ok(A, B);
    const id = A.host.state.exams[0].id;
    edit(A, 10_000, (s) => { s.exams.find((e) => e.id === id)!.name = 'A 오래된 수정'; });
    edit(B, 20_000, (s) => { s.exams.find((e) => e.id === id)!.name = 'B 늦은 수정'; });
    await ok(A); // 오래된 A 가 먼저 올림
    await ok(B); // B 는 로컬이 이겨 서버 사본(A)을 보존하고 올림
    await ok(A);
    for (const d of [A, B]) expect(d.host.state.exams.find((e) => e.id === id)!.name).toBe('B 늦은 수정');
    expect(B.host.losers.map((l) => (l.exam as { name: string }).name)).toEqual(['A 오래된 수정']);
    expect(A.host.losers).toEqual([]);
    await expectQuiet(server, A, B);
  });

  it('시험 삭제가 전파된다(activeId 보정 포함)', async () => {
    const server = makeServer();
    const key = generateSyncKey();
    const A = await makeDevice(server, key, seed());
    const B = await makeDevice(server, key);
    await ok(A, B);
    const victim = B.host.state.exams[0].id;
    B.host.state.activeId = victim;
    edit(A, 3000, (s) => { s.exams = s.exams.filter((e) => e.id !== victim); s.activeId = s.exams[0]?.id ?? null; });
    await ok(A);
    expect(server.sqlite(`SELECT deleted, blob FROM items WHERE item_id = '${examItemId(victim)}'`)).toEqual([{ deleted: 1, blob: '' }]);
    await ok(B);
    expect(B.host.state.exams.some((e) => e.id === victim)).toBe(false);
    expect(B.host.state.exams).toHaveLength(1);
    expect(B.host.state.activeId).toBe(B.host.state.exams[0].id);
    await expectQuiet(server, A, B);
  });

  it('서버 덤프(항목 id·blob·로그)에 시험 이름·과목명·동기화 키가 평문으로 없다', async () => {
    const server = makeServer();
    const key = generateSyncKey();
    const st = seed();
    mkExam(st, '비밀시험XYZ', ['비밀과목QRS']);
    const A = await makeDevice(server, key, st);
    await ok(A);
    const dump = server.db.dump();
    expect(dump.length).toBeGreaterThan(500);
    for (const secret of ['중간고사', '기말고사', '국어', '수학', '비밀시험XYZ', '비밀과목QRS', key, key.replace(/-/g, '')]) {
      expect(dump.includes(secret), secret).toBe(false);
    }
    for (const x of server.log) expect(JSON.stringify(x.req)).not.toContain('비밀');
    // 항목 id 는 접두사 + 무작위 id
    const ids = server.sqlite('SELECT item_id FROM items').map((r) => r.item_id as string);
    expect(ids).toContain('settings');
    expect(ids.filter((i) => /^[el]-/.test(i))).toHaveLength(ids.length - 1);
  });

  it('두 기기가 같은 이름의 과목을 따로 만들어도 한 id 로 합쳐지고 시험이 유지된다', async () => {
    const server = makeServer();
    const key = generateSyncKey();
    const sa = newState();
    const sb = newState();
    sa.library.push({ id: 'zz-from-a', name: '수학', color: '#C4705A' });
    sb.library.push({ id: 'aa-from-b', name: '수학', color: '#5F9EA0' });
    mkExam(sa, 'A 의 시험', ['수학']);
    mkExam(sb, 'B 의 시험', ['수학']);
    sa.updatedAt = 1000;
    sb.updatedAt = 2000;
    const A = await makeDevice(server, key, sa);
    const B = await makeDevice(server, key, sb);
    await ok(A);
    await ok(B); // B 가 받으면서 합친다(정본 aa-from-b)
    await ok(A);
    await ok(B);
    await ok(A);
    for (const d of [A, B]) {
      expect(d.host.state.library.map((l) => l.id)).toEqual(['aa-from-b']);
      expect(names(d.host.state)).toEqual(['A 의 시험', 'B 의 시험']);
      for (const e of d.host.state.exams) expect(e.subs.map((s) => s.subjectId)).toEqual(['aa-from-b']);
    }
    expect(sortedExams(A.host.state)).toEqual(sortedExams(B.host.state));
    await expectQuiet(server, A, B);
    expect(server.sqlite("SELECT COUNT(*) AS n FROM items WHERE deleted = 0")[0].n).toBe(4); // 시험 2 + 과목 1 + 설정 1
  });

  it('시험이 라이브러리보다 먼저 와도 같은 동기화 안에서 보류 항목이 적용된다', async () => {
    const server = makeServer();
    const key = generateSyncKey();
    const A = await makeDevice(server, key, seed());
    const B = await makeDevice(server, key);
    await ok(A);
    // 서버 항목 id 순으로 시험('e-')이 라이브러리('l-')보다 앞서 도착하는 상황이 자연히 생긴다
    await ok(B);
    expect(B.host.state.exams.every((e) => e.subs.length > 0)).toBe(true);
    expect(sortedExams(B.host.state)).toEqual(sortedExams(A.host.state));
    expect((await B.meta.getAll()).some((m) => m.pending)).toBe(false);
  });

  it('SYNC_LIMITS: 하루 쓰기 3000 기준으로 스로틀 판정(300 근처에서 늦추지 않는다)', async () => {
    const server = makeServer();
    const A = await makeDevice(server, generateSyncKey(), seed());
    await ok(A);
    expect(A.engine.status.throttled).toBe(false);
    expect(SYNC_LIMITS.MAX_DAILY_WRITES).toBe(3000);
  });

  it('exam 항목 하나에 시험 전체가 들어가도 크기 한도(oversize)에 걸리지 않는다', async () => {
    const server = makeServer();
    const st = newState();
    const e = mkExam(st, '큰 시험', []);
    for (let i = 0; i < 20; i++) addSub(st, e, `과목${i}`, null);
    const A = await makeDevice(server, generateSyncKey(), st);
    await ok(A);
    expect(A.engine.status.oversize).toEqual([]);
  });
});

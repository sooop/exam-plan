// 동기화 상태 모듈. 모듈이 import 시점에 localStorage 를 읽으므로 시험마다 모듈을 새로 불러온다.
// 엔진(createSyncEngine)과 서버 통신은 시험하지 않는다: 실제 Worker 와 네트워크가 필요하고, 엔진 자체는 sync-kit 쪽 시험 범위다.
// 여기서는 어댑터 팩토리가 실패하는 경로로 startEngine 의 오류 상태까지만 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'examPlanner.sync';
function stubStorage(init: Record<string, string> = {}, throws = false) {
  const map = new Map(Object.entries(init));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => { if (throws) throw new Error('denied'); return map.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (throws) throw new Error('denied'); map.set(k, v); },
    removeItem: (k: string) => { if (throws) throw new Error('denied'); map.delete(k); },
  });
  return map;
}
const load = async () => {
  vi.resetModules();
  return import('../../src/lib/sync/state.svelte');
};

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('상수', () => {
  it('APP_ID 와 이름들', async () => {
    const t = await import('../../src/lib/sync/appTypes');
    expect(t.APP_ID).toBe('exam-planner');
    expect(t.APP_ID).toMatch(/^[a-z0-9-]{1,32}$/);
    expect(t.SYNC_CONFIG_KEY).toBe('examPlanner.sync');
    expect(t.SYNC_META_DB).toBe('exam-plan-sync');
    expect(t.SYNC_LOCK_NAME).toBe('exam-plan-sync-engine');
  });
});

describe('초기 상태', () => {
  it('저장된 설정이 없으면 off', async () => {
    stubStorage();
    const m = await load();
    expect(m.sync.config).toBeUndefined();
    expect(m.sync.status.phase).toBe('off');
    expect(m.sync.enabled).toBe(true);
    expect(m.syncUi.open).toBe(false);
  });

  it('저장된 설정을 읽는다(켜짐 -> idle, 꺼짐 -> paused)', async () => {
    stubStorage({ [KEY]: JSON.stringify({ workerUrl: 'https://a.example', syncKey: 'K', inviteCode: 'c', enabled: true }) });
    let m = await load();
    expect(m.sync.config).toEqual({ workerUrl: 'https://a.example', syncKey: 'K', inviteCode: 'c' });
    expect(m.sync.status.phase).toBe('idle');
    stubStorage({ [KEY]: JSON.stringify({ workerUrl: 'https://a.example', syncKey: 'K', enabled: false }) });
    m = await load();
    expect(m.sync.status.phase).toBe('paused');
    expect(m.sync.enabled).toBe(false);
  });

  it('깨졌거나 필드가 빠진 설정은 무시한다', async () => {
    for (const raw of ['{깨짐', '[]', JSON.stringify({ workerUrl: '', syncKey: 'K' }), JSON.stringify({ syncKey: 'K' })]) {
      stubStorage({ [KEY]: raw });
      expect((await load()).sync.config).toBeUndefined();
    }
  });

  it('저장소가 예외를 던져도 시작한다', async () => {
    stubStorage({}, true);
    const m = await load();
    expect(m.sync.status.phase).toBe('off');
  });
});

describe('Worker 주소 검증', () => {
  it('https 만, localhost 는 http 도 허용, 끝 슬래시 제거', async () => {
    stubStorage();
    const { normalizeWorkerUrl, SyncInputError } = await load();
    expect(normalizeWorkerUrl(' https://x.workers.dev/ ')).toBe('https://x.workers.dev');
    expect(normalizeWorkerUrl('https://x.dev/api//')).toBe('https://x.dev/api');
    expect(normalizeWorkerUrl('http://localhost:8787')).toBe('http://localhost:8787');
    expect(normalizeWorkerUrl('http://127.0.0.1:8787/')).toBe('http://127.0.0.1:8787');
    for (const bad of ['', 'x.workers.dev', 'http://x.dev', 'ftp://x.dev']) {
      expect(() => normalizeWorkerUrl(bad)).toThrow(SyncInputError);
    }
    try { normalizeWorkerUrl(''); } catch (e) { expect((e as InstanceType<typeof SyncInputError>).field).toBe('workerUrl'); }
  });
});

describe('연결·해제', () => {
  it('입력 오류는 field 와 함께 던지고 상태를 바꾸지 않는다', async () => {
    const map = stubStorage();
    const m = await load();
    await expect(m.connectNew('https://x.dev', '  ')).rejects.toMatchObject({ field: 'inviteCode' });
    await expect(m.connectExisting('https://x.dev', 'zz')).rejects.toMatchObject({ field: 'key' });
    await expect(m.connectExisting('nope', 'zz')).rejects.toMatchObject({ field: 'workerUrl' });
    expect(m.sync.config).toBeUndefined();
    expect(map.has(KEY)).toBe(false);
  });

  it('어댑터가 등록되지 않으면 설정은 저장하되 엔진은 error 상태가 된다', async () => {
    const map = stubStorage();
    const m = await load();
    const key = await m.connectNew('https://x.dev/', ' code ');
    expect(key).toMatch(/^[0-9A-Z-]+$/);
    expect(m.sync.config).toMatchObject({ workerUrl: 'https://x.dev', syncKey: key, inviteCode: 'code' });
    expect(JSON.parse(map.get(KEY)!)).toMatchObject({ workerUrl: 'https://x.dev', syncKey: key, enabled: true });
    expect(m.sync.status.phase).toBe('error');
    expect(m.sync.status.lastError?.message).toContain('어댑터');
  });

  it('어댑터 팩토리가 던지면 그 사유가 상태에 담긴다', async () => {
    stubStorage();
    const m = await load();
    m.setSyncAdapterFactory(() => { throw new Error('저장소 없음'); });
    await m.connectNew('https://x.dev', 'c');
    expect(m.sync.status.lastError?.message).toContain('저장소 없음');
  });

  it('disconnect 는 설정을 지우고 off, pause 는 paused 로 저장', async () => {
    const map = stubStorage();
    const m = await load();
    m.setSyncAdapterFactory(() => { throw new Error('x'); });
    await m.connectNew('https://x.dev', 'c');
    m.pause();
    expect(m.sync.status.phase).toBe('paused');
    expect(JSON.parse(map.get(KEY)!).enabled).toBe(false);
    m.disconnect();
    expect(m.sync.config).toBeUndefined();
    expect(m.sync.status.phase).toBe('off');
    expect(map.has(KEY)).toBe(false);
  });

  it('저장소가 예외를 던져도 메모리 상태로 연결된다', async () => {
    stubStorage({}, true);
    const m = await load();
    m.setSyncAdapterFactory(() => { throw new Error('x'); });
    await m.connectNew('https://x.dev', 'c');
    expect(m.sync.config?.workerUrl).toBe('https://x.dev');
  });

  it('notifyLocalChange 는 엔진이 없으면 아무 일도 하지 않는다', async () => {
    stubStorage();
    const m = await load();
    expect(() => m.notifyLocalChange()).not.toThrow();
    await expect(m.syncNow()).resolves.toBeUndefined();
  });
});

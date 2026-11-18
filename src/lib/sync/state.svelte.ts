// 동기화 반응형 상태·설정 저장 (md-works 의 state.svelte.ts 구조를 따른다). 엔진·메타는 sync-kit 패키지.
// 어댑터는 이 모듈이 만들지 않고 setSyncAdapterFactory() 로 주입받는다(앱 부팅 때 한 번 등록).
// 설정은 localStorage 'examPlanner.sync'({workerUrl, syncKey, inviteCode?, enabled})에만 둔다.
// 동기화 키·Worker 주소·초대 코드는 번들·내보내기·백업에 절대 포함하지 않는다.
import {
  createIdbMetaStore, createSyncEngine, formatSyncKey, generateSyncKey, normalizeSyncKey,
  type SyncAdapter, type SyncConfig, type SyncEngine, type SyncMetaStore, type SyncStatus,
} from 'sync-kit';
import { APP_ID, SYNC_CONFIG_KEY, SYNC_LIMITS, SYNC_LOCK_NAME, SYNC_META_DB } from './appTypes';

const KEY = SYNC_CONFIG_KEY;

export type SyncAdapterFactory = () => SyncAdapter | Promise<SyncAdapter>;
let adapterFactory: SyncAdapterFactory | undefined;

/** 이 앱의 어댑터를 만드는 함수를 등록한다. 엔진을 시작하기 전에 불러야 한다 */
export function setSyncAdapterFactory(factory: SyncAdapterFactory | undefined): void {
  adapterFactory = factory;
}

const emptyStatus = (phase: SyncStatus['phase'] = 'off'): SyncStatus => ({ phase, lastSyncAt: 0, oversize: [], throttled: false });

/** 입력 검증 오류. field 는 화면에서 오류를 붙일 입력 칸 */
export class SyncInputError extends Error {
  constructor(public field: 'workerUrl' | 'inviteCode' | 'key', message: string) {
    super(message);
    this.name = 'SyncInputError';
  }
}

interface Persisted { workerUrl: string; syncKey: string; inviteCode?: string; enabled: boolean }

function load(): { config: SyncConfig | undefined; enabled: boolean } {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* 저장소를 못 쓰는 환경 */ }
  if (!raw) return { config: undefined, enabled: true };
  try {
    const p: unknown = JSON.parse(raw);
    if (!p || typeof p !== 'object') return { config: undefined, enabled: true };
    const o = p as Partial<Persisted>;
    if (typeof o.workerUrl !== 'string' || typeof o.syncKey !== 'string' || !o.workerUrl || !o.syncKey) return { config: undefined, enabled: true };
    return {
      config: { workerUrl: o.workerUrl, syncKey: o.syncKey, ...(typeof o.inviteCode === 'string' && o.inviteCode ? { inviteCode: o.inviteCode } : {}) },
      enabled: o.enabled !== false,
    };
  } catch {
    return { config: undefined, enabled: true };
  }
}

const initial = load();

export const sync = $state<{ config: SyncConfig | undefined; status: SyncStatus; enabled: boolean }>({
  config: initial.config,
  status: emptyStatus(initial.config ? (initial.enabled ? 'idle' : 'paused') : 'off'),
  enabled: initial.enabled,
});

/** 동기화 대화상자의 열림 상태(명령·상태 배지가 연다) */
export const syncUi = $state<{ open: boolean }>({ open: false });

function persist() {
  try {
    if (!sync.config) { localStorage.removeItem(KEY); return; }
    const c = sync.config;
    const p: Persisted = { workerUrl: c.workerUrl, syncKey: c.syncKey, ...(c.inviteCode ? { inviteCode: c.inviteCode } : {}), enabled: sync.enabled };
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch { /* 저장소를 못 쓰는 환경 */ }
}

// ---- 엔진 ----
let engine: SyncEngine | undefined;
let unsubscribe: (() => void) | undefined;
let userStopped = false; // pause() 로 stop 했는가(resume 이 start 를 다시 불러야 한다)
let generation = 0; // 엔진을 만드는 중에 설정이 바뀌면 이전 요청을 버린다
let lockRequested = false; // 탭 락을 이미 요청했는가(락 대기 요청이 겹쳐 쌓이지 않게)

/**
 * 엔진을 만들기 직전에 부르는 점검(앱이 등록한다). false 를 돌려주면 엔진을 만들지 않고 '멈춤'으로 둔다.
 * 탭 락을 이어받을 때·일시정지를 풀 때·연결할 때 모두 startEngine 을 지나므로 한 곳에서 막는다
 * (낡은 상태나 빈 로컬 상태로 시작해 서버 항목을 삭제로 올리는 것을 막으려는 방어선).
 */
export type SyncStartGuard = () => boolean | Promise<boolean>;
let startGuard: SyncStartGuard | undefined;
export function setSyncStartGuard(guard: SyncStartGuard | undefined): void {
  startGuard = guard;
}

/** 주입받은 어댑터와 sync-kit 의 부품으로 엔진을 만든다 */
async function buildEngine(config: SyncConfig): Promise<SyncEngine> {
  if (!adapterFactory) throw new Error('동기화 어댑터가 아직 등록되지 않았습니다');
  const adapter: SyncAdapter = await adapterFactory();
  const meta: SyncMetaStore = createIdbMetaStore(SYNC_META_DB);
  return createSyncEngine({ appId: APP_ID, config, adapter, meta, limits: SYNC_LIMITS });
}

function stopEngine() {
  unsubscribe?.();
  unsubscribe = undefined;
  engine?.stop();
  engine = undefined;
}

function onStatus(s: SyncStatus) {
  sync.status = { ...s };
  // 첫 요청이 성공했으면 초대 코드를 지운다
  if (sync.config?.inviteCode && s.lastSyncAt > 0 && (s.phase === 'idle' || s.phase === 'pending')) {
    delete sync.config.inviteCode;
    persist();
  }
}

/** 엔진을 만들어 시작했으면 true. 점검이 막았거나 설정이 없거나 실패했으면 false */
async function startEngine(): Promise<boolean> {
  stopEngine();
  const config = sync.config;
  if (!config) { sync.status = emptyStatus('off'); return false; }
  const gen = ++generation;
  try {
    if (startGuard && !(await startGuard())) {
      if (gen === generation) sync.status = emptyStatus('paused');
      return false;
    }
    if (gen !== generation) return false;
    const e = await buildEngine($state.snapshot(config));
    if (gen !== generation) { e.stop(); return false; }
    engine = e;
    userStopped = false;
    unsubscribe = e.subscribe(onStatus);
    sync.status = { ...e.status };
    e.start();
    return true;
  } catch (err) {
    if (gen !== generation) return false;
    const message = err instanceof Error ? err.message : String(err);
    sync.status = { ...emptyStatus('error'), lastError: { kind: 'network', message: `동기화를 시작하지 못했습니다: ${message}` } };
    return false;
  }
}

/** 설정이 있고 켜져 있으면 엔진을 만들어 시작한다(셸이 마운트될 때 한 번) */
export async function startSyncIfConfigured(): Promise<void> {
  if (!sync.config) return;
  if (!sync.enabled) { sync.status = { ...emptyStatus('paused') }; return; }
  if (engine || lockRequested) return;
  // 같은 브라우저의 탭이 여럿이면 한 탭만 엔진을 돌린다(탭끼리 rev 를 다투지 않게). 락을 쥔 탭이 닫히면 다른 탭이 이어받는다
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) { await startEngine(); return; }
  lockRequested = true;
  void locks.request(SYNC_LOCK_NAME, async () => {
    // 점검이 막으면(낡은 상태·빈 로컬 등) 엔진 없이 락만 쥐지 않도록 놓는다. 이유가 풀리면 앱이 startSyncIfConfigured 를 다시 부른다
    if (!(await startEngine())) { lockRequested = false; return; }
    await new Promise<void>(() => { /* 탭이 닫힐 때까지 락을 쥔다 */ });
  });
}

/** 로컬이 바뀌었음을 엔진에 알린다. 저장소 쓰기(commit)가 끝난 뒤 호출하는 쪽이 배선한다 */
export function notifyLocalChange(): void {
  if (engine && sync.enabled) engine.markDirty();
}

// ---- 연결 ----
const URL_ERR = 'Worker 주소를 https:// 로 시작하는 주소로 입력하세요 (예: https://exam-plan-sync.내이름.workers.dev)';

export function normalizeWorkerUrl(input: string): string {
  const s = input.trim().replace(/\/+$/, '');
  if (!s) throw new SyncInputError('workerUrl', 'Worker 주소를 입력하세요');
  let u: URL;
  try { u = new URL(s); } catch { throw new SyncInputError('workerUrl', URL_ERR); }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) throw new SyncInputError('workerUrl', URL_ERR);
  return `${u.origin}${u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, '')}`;
}

async function apply(config: SyncConfig): Promise<void> {
  sync.config = config;
  sync.enabled = true;
  persist();
  await startEngine();
}

/** 이 기기에서 새로 시작: 새 키를 만들고 초대 코드로 새 공간을 연다. 만든 키를 돌려준다 */
export async function connectNew(workerUrl: string, inviteCode: string): Promise<string> {
  const url = normalizeWorkerUrl(workerUrl);
  const code = inviteCode.trim();
  if (!code) throw new SyncInputError('inviteCode', '초대 코드를 입력하세요. Worker 를 배포할 때 정한 코드입니다');
  const syncKey = generateSyncKey();
  await apply({ workerUrl: url, syncKey, inviteCode: code });
  return syncKey;
}

/** 다른 기기의 키로 연결. 키가 올바르지 않으면 SyncInputError('key') */
export async function connectExisting(workerUrl: string, keyInput: string): Promise<string> {
  const url = normalizeWorkerUrl(workerUrl);
  const normalized = normalizeSyncKey(keyInput);
  if (!normalized) throw new SyncInputError('key', '동기화 키가 올바르지 않습니다. 영문 대문자·숫자 26자(4자씩 끊어 표시)인지 확인하세요');
  const syncKey = formatSyncKey(normalized);
  await apply({ workerUrl: url, syncKey });
  return syncKey;
}

/** 이 기기의 키·설정만 지운다. 글은 그대로 남는다. 동기화 메타(clearSyncMeta)는 지우지 않는다 — 호출자가 확인을 받은 뒤 부른다 */
export function disconnect(): void {
  generation++;
  stopEngine();
  sync.config = undefined;
  sync.enabled = true;
  sync.status = emptyStatus('off');
  persist();
}

/** 동기화 메타에 서버에 있는 것으로 기록된 항목 수(삭제 표지·보류 제외). 읽지 못하면 0 */
export async function liveSyncItemCount(): Promise<number> {
  const meta: SyncMetaStore = createIdbMetaStore(SYNC_META_DB);
  try { return (await meta.getAll()).filter((m) => !m.deleted && !m.pending && m.rev > 0).length; } catch { return 0; }
}

/** 로컬 동기화 메타(커서·항목별 rev)를 지운다. 다른 공간에 새로 연결하기 전에 쓴다 */
export async function clearSyncMeta(): Promise<void> {
  const meta: SyncMetaStore = createIdbMetaStore(SYNC_META_DB);
  await meta.clear();
}

// ---- 일시 정지·재개·즉시 동기화 ----
export function pause(): void {
  if (!sync.config) return;
  sync.enabled = false;
  persist();
  engine?.stop();
  userStopped = true;
  sync.status = { ...sync.status, phase: 'paused', lastError: undefined };
}

export function resume(): void {
  if (!sync.config) return;
  sync.enabled = true;
  persist();
  if (!engine) { void startEngine(); return; }
  if (userStopped) { userStopped = false; engine.start(); } else engine.resume();
}

export async function syncNow(): Promise<void> {
  if (!sync.config) return;
  if (!sync.enabled) resume();
  await engine?.syncNow();
}

export async function resolveResync(choice: 'upload' | 'delete'): Promise<void> {
  await engine?.resolveResync(choice);
}

export async function resolveMassDelete(choice: 'proceed' | 'restore'): Promise<void> {
  await engine?.resolveMassDelete(choice);
}

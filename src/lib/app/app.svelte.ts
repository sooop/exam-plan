// 앱 전역 상태와 변경 반영. 모든 화면이 `app` 하나를 직접 읽고 `app.mutate`/`app.commit` 으로 바꾼다.
// 순수한 부분(되돌리기 스택·updatedAt·불러오기 해석)은 appCore.ts, 시험은 tests/app. 사용 규칙은 README.md.
//
// ───────── 데이터 무결성 방어(2026-11 감사)로 Shell 이 읽는 것 ─────────
//  - app.degraded            true 면 IDB 를 못 읽고 localStorage 사본으로 열었다(IDB 쓰기·동기화 없음). 배너 + app.retryDegraded() 단추. 문구 T3.degradedTitle/Body/Retry
//  - app.syncGate            { kind: 'empty-local', serverCount } 이면 '이 기기에 데이터가 없습니다. 서버에 N개 항목이 있습니다' 배너.
//                            단추 app.chooseServerCopy()(서버 사본 받기) / app.keepEmpty()(비어 있는 상태로 두기). 문구 T3.gate*
//  - app.hasEditsWhileFailed true 면 '다시 시도' 전에 ConfirmBlock(T3.retryPreserve*)을 보이고 app.retryLoad({ confirmed: true }). 확인 없이 retryLoad() 를 불러도 편집은 이력에 보존된다
//  - app.droppedDetail       droppedNotice(app.dropped, backedUp, app.droppedDetail) 로 부르면 과목·할일·링크 단위 폐기도 말한다
//  - app.syncHeld            동기화 시작을 막고 있는 동안 true(저장 가드를 푼 경우·외부 변경 선택 대기·degraded·syncGate)
import { SvelteSet } from 'svelte/reactivity';
import { getExam, newState } from '../core/planner';
import type { Exam, State } from '../core/types';
import { createLocalStore, type ExternalChangeInfo, type LoadStatus, type LocalStore, type SaveStatus, type StoreOptions } from '../storage/store';
import { loadPrefs, updatePrefs, type Tab } from '../storage/prefs';
import { createSyncAdapter, type SyncHost } from '../sync/adapter';
import { getDeviceName } from '../sync/device';
import {
  clearSyncMeta, liveSyncItemCount, notifyLocalChange, pause, resume, setSyncAdapterFactory, setSyncStartGuard, startSyncIfConfigured, sync,
} from '../sync/state.svelte';
import { toast } from '../ui/toast.svelte';
import {
  UndoStack, applyRemoteDraft, cloneState, createValidator, keepActiveId, nextUpdatedAt, pickStartTab, resolveLoad, sameContent, stampChanges,
  type DroppedDetail, type LoadProblem, type PushOptions,
} from './appCore';
import { downloadText } from './download';
import { T3 } from './integrityTexts';
import { T2 } from './strings';

export type { LoadProblem } from './appCore';

/** 변경 이력(다음 단계)이 걸어 두는 훅. 기본은 모두 없음(no-op) */
export interface CommitInfo { label: string; at: number; before?: State; after: State }
export interface AppHooks {
  /** commit·undo·redo 가 끝날 때마다. before 는 변경 전 상태(알 수 있을 때), after 는 저장하는 복사본(수정 금지) */
  onCommit?(info: CommitInfo): void;
  /** mutate(.., { big: true }) 가 fn 을 실행하기 전, 그리고 '다른 탭 내용 불러오기' 가 상태를 바꾸기 전 */
  onBeforeBigChange?(label: string): void;
  /** 동기화 충돌에서 진 시험(이 기기 로컬 이력에 보존할 것) */
  preserveLoserExam?(item: { name: string; exam: unknown; at: number }): void;
  /** 동기화 충돌에서 진 설정(limits·defPlan·recapDays·week 의 값 JSON). 이 기기 로컬 이력에 보존할 것 */
  preserveLoserSettings?(item: { name: string; settings: unknown; at: number }): void;
}

/** 이 기기의 동기화 메타(커서·항목별 rev). 기본은 sync/state.svelte 의 구현. 시험용으로 바꿀 수 있다 */
export interface SyncMetaAccess {
  /** 서버에 있는 것으로 알고 있는 항목 수(삭제 표지·보류 제외) */
  liveCount(): Promise<number>;
  clear(): Promise<void>;
}

/** 로컬이 비었는데 동기화 메타에는 알려진 항목이 있을 때의 선택 대기 */
export interface SyncGate { kind: 'empty-local'; serverCount: number }

export interface CommitOptions extends PushOptions {
  /** 이력·되돌리기 토스트에 쓰는 이름. 생략하면 '변경' */
  label?: string;
  /** false 면 되돌리기 단계를 만들지 않고 스택을 비운다(되돌리면 이 변경이 함께 사라지는 것을 막으려고). 기본 true */
  undoable?: boolean;
  /** undoable:false 일 때 스택을 비우지 않는다(활성 시험 바꾸기처럼 상태 복원과 무관한 기기별 값 변경) */
  keepUndo?: boolean;
  /** 변경 전 상태(복사본). mutate 가 채운다. 생략하면 직전 commit 이후의 기준 사본을 쓴다 */
  before?: State;
}

export interface MutateOptions extends PushOptions {
  undoable?: boolean;
  /** 큰 변경(삭제·일괄·가져오기): fn 실행 전에 hooks.onBeforeBigChange(label) 을 부른다 */
  big?: boolean;
}

export interface AppOptions {
  /** 저장소 옵션(시험용: indexedDB·storage·channelName 을 바꾼다). validate 는 앱이 정한다 */
  storeOptions?: Omit<StoreOptions<State>, 'validate'>;
  now?: () => number;
  /** 동기화 엔진에 로컬 변경을 알린다. 기본은 sync/state.svelte 의 notifyLocalChange */
  notifyLocalChange?: () => void;
  /** false 면 init() 이 동기화를 시작하지 않는다(시험용) */
  sync?: boolean;
  /** 동기화 메타 접근(시험용). 기본은 실제 IndexedDB 메타 */
  syncMeta?: SyncMetaAccess;
}

export interface AppUi {
  tab: Tab;
  /** 시험 만들기 화면(ExamScreen 이 처리). 셸은 true 만 세팅한다 */
  creating: boolean;
  /** 준비 계획에서 고른 날짜들(YYYY-MM-DD). 비어 있지 않으면 하단 일괄 막대가 뜬다 */
  selected: SvelteSet<string>;
  /** 상세에 열린 날짜(없으면 null) */
  openDayIso: string | null;
  /** 과목 정보를 연 과목 배치 id(없으면 null) */
  subId: string | null;
}

class AppStore {
  state = $state<State>(newState());
  ready = $state(false);
  loadStatus = $state<LoadStatus>({ phase: 'idle' });
  saveStatus = $state<SaveStatus>({ state: 'idle' });
  /** failed·corrupt 로 시작했을 때(저장 가드가 걸려 있다). 셸이 배너로 그린다 */
  loadProblem = $state<LoadProblem | null>(null);
  /** 불러오면서 버려진 시험 수(0 이면 없음). 셸이 알림 배너로 그린다 */
  dropped = $state(0);
  /** 버려진 시험이 있을 때 입력 원본을 보존한 키(없거나 보존 실패면 null). 내보내기로 받을 수 있다 */
  droppedBackupKey = $state<string | null>(null);
  /**
   * 다른 탭의 더 새 내용이 있고 이 탭에도 저장 전 변경이 있을 때: 사용자의 선택을 기다린다.
   * partialBackupKey 는 그 값을 검사하며 버려진 시험의 원본 키(없으면 null). 불러올 때 droppedBackupKey 가 된다
   */
  external = $state<{ value: State; at: number; partialBackupKey: string | null } | null>(null);
  /** 버려진 항목의 종류별 개수(불러온 값에서 아무것도 버려지지 않았으면 null). droppedNotice 의 세 번째 인자 */
  droppedDetail = $state<DroppedDetail | null>(null);
  /** IDB 를 읽지 못해 localStorage 사본으로 열었다: IDB 에는 쓰지 않고 동기화도 시작하지 않는다. retryDegraded() 로 벗어난다 */
  degraded = $state(false);
  /** 로컬이 비었는데 서버에 알려진 항목이 있어 동기화 시작을 막고 사용자의 선택을 기다린다(chooseServerCopy/keepEmpty) */
  syncGate = $state<SyncGate | null>(null);
  /** 동기화 시작을 막고 있는가(저장 가드를 푼 경우는 다음 새로고침까지, 그 밖에는 이유가 풀리면 false) */
  syncHeld = $state(false);
  /** 원격 변경 반영 횟수(화면이 필요하면 구독) */
  remoteTick = $state(0);
  ui = $state<AppUi>({ tab: 'board', creating: false, selected: new SvelteSet<string>(), openDayIso: null, subId: null });

  undoDepth = $state(0);
  redoDepth = $state(0);
  undoLabel = $state<string | null>(null);
  redoLabel = $state<string | null>(null);
  canUndo = $derived(this.undoDepth > 0);
  canRedo = $derived(this.redoDepth > 0);

  /** 변경 이력 훅(다음 단계가 채운다). 반응형이 아니다 */
  hooks: AppHooks = {};

  readonly store: LocalStore<State>;
  readonly #now: () => number;
  readonly #notify: () => void;
  readonly #syncEnabled: boolean;
  readonly #droppedOf: (s: State) => number;
  readonly #detailOf: (s: State) => DroppedDetail;
  readonly #meta: SyncMetaAccess;
  readonly #stack = new UndoStack();
  /** allowSaveAnyway 로 시작했다: 새로고침 전까지 동기화를 시작하지 않는다 */
  #unlockedHold = false;
  /** 마지막 불러오기가 '저장본 없음(empty)'이었다: 동기화 메타에 항목이 있으면 서버 삭제로 이어질 수 있어 확인한다 */
  #emptyAtLoad = false;
  #baseline: State;
  #initP: Promise<void> | null = null;
  #unsubs: (() => void)[] = [];

  constructor(opts: AppOptions = {}) {
    const v = createValidator();
    this.#droppedOf = v.droppedOf;
    this.#detailOf = v.detailOf;
    this.#meta = opts.syncMeta ?? { liveCount: liveSyncItemCount, clear: clearSyncMeta };
    // 검증에서 시험·과목·할일·라이브러리 항목·링크가 하나라도 버려졌으면 입력 원본을 보존한다(다음 저장이 나머지만 쓰면서 사라지는 것을 막는다)
    this.store = createLocalStore<State>({
      ...opts.storeOptions,
      validate: v.validate,
      shouldBackupRaw: (_raw, value) => v.droppedOf(value) > 0,
    });
    this.#now = opts.now ?? Date.now;
    this.#notify = opts.notifyLocalChange ?? notifyLocalChange;
    this.#syncEnabled = opts.sync ?? true;
    this.#baseline = cloneState(this.state);
  }

  // ───────── 시작·종료 ─────────
  /** 저장본을 읽어 시작한다. 한 번만 실행된다(여러 번 불러도 같은 약속을 돌려준다) */
  init(): Promise<void> {
    return (this.#initP ??= this.#init());
  }

  async #init(): Promise<void> {
    const prefs = loadPrefs();
    this.#unsubs.push(this.store.subscribe(() => this.#mirror()));
    this.#unsubs.push(this.store.attach());
    this.#unsubs.push(this.store.onExternalChange((value, info) => this.#onExternal(value, info)));
    const r = await this.store.load();
    this.#apply(r);
    this.ui.tab = pickStartTab(prefs.tab, this.state.exams.length);
    getDeviceName(); // 기기 이름을 처음 한 번 만들어 저장한다(충돌 이력·동기화 화면에서 쓴다)
    this.#startSync();
    this.ready = true;
  }

  /** 동기화를 시작한다. 시작 직전의 점검은 syncGuard 가 한다(엔진을 만드는 모든 경로에서 불린다). 점검이 막으면 이유가 풀릴 때 다시 부른다 */
  #startSync(): void {
    if (!this.#syncEnabled) return;
    setSyncAdapterFactory(() => createSyncAdapter(this.createSyncHost()));
    setSyncStartGuard(() => this.syncGuard());
    void startSyncIfConfigured();
  }

  /**
   * 동기화 엔진을 시작해도 되는가. 엔진을 만들기 직전(탭 락을 이어받을 때와 일시정지 해제 포함)마다 불린다. false 면 시작하지 않는다.
   *  1) 불러오기 문제·저장 가드 해제·degraded: 이 탭의 상태를 믿을 수 없다
   *  2) 다른 탭의 더 새 저장본을 먼저 반영한다(낡은 상태로 삭제를 올리지 않게). 선택이 필요하면 보류한다
   *  3) 로컬이 비었는데 동기화 메타에 알려진 항목이 있으면(6개 미만도) 사용자의 선택을 기다린다
   */
  async syncGuard(): Promise<boolean> {
    if (this.loadProblem || this.#unlockedHold || this.degraded) { this.syncHeld = true; return false; }
    try { await this.store.checkExternal(); } catch { /* 읽기 실패는 아래 외부 변경 여부로만 본다 */ }
    if (this.external) { this.syncHeld = true; return false; }
    if (this.#emptyAtLoad || (this.state.exams.length === 0 && this.state.library.length === 0)) {
      let n = 0;
      try { n = await this.#meta.liveCount(); } catch { n = 0; }
      if (n > 0) {
        this.syncGate = { kind: 'empty-local', serverCount: n };
        this.syncHeld = true;
        return false;
      }
      this.#emptyAtLoad = false;
    }
    this.syncGate = null;
    this.syncHeld = false;
    return true;
  }

  /** syncGate 선택 '서버 사본 받기': 이 기기의 동기화 메타를 지우고 새 기기처럼 연결을 이어 받는다. 실패하면 false(게이트 유지) */
  async chooseServerCopy(): Promise<boolean> {
    try { await this.#meta.clear(); } catch { return false; }
    this.syncGate = null;
    this.#emptyAtLoad = false;
    this.syncHeld = false;
    if (!this.#syncEnabled) return true;
    if (sync.config && !sync.enabled) resume(); else void startSyncIfConfigured();
    return true;
  }

  /** syncGate 선택 '비어 있는 상태로 두기': 동기화를 일시정지한다(서버 데이터는 그대로). 일시정지를 풀어도 로컬이 비어 있는 동안은 다시 묻는다 */
  keepEmpty(): void {
    this.syncGate = null;
    pause();
    // 동기화 메타를 비운다: 나중에 일시정지를 풀면 서버 항목은 '새로 받을 항목'이 되어 내려오고, 서버 삭제로 올라가지 않는다
    void this.#meta.clear().catch(() => { /* 메타를 못 비워도 일시정지는 유지된다 */ });
  }

  /** 구독·창 연결 해제(시험용·핫 리로드) */
  dispose(): void {
    this.#unsubs.splice(0).forEach((f) => f());
    this.store.dispose();
  }

  #mirror(): void {
    this.loadStatus = { ...this.store.loadStatus };
    this.saveStatus = { ...this.store.saveStatus };
  }

  /** store.load() 결과를 앱 상태로 적용한다 */
  #apply(r: Awaited<ReturnType<LocalStore<State>['load']>>): void {
    const res = resolveLoad(r, this.#droppedOf, this.store.loadStatus.message);
    // 불러오기를 다시 시도해 '비어 있음'이 나왔는데 그 사이 이 창에서 입력한 내용이 있으면 그 내용을 지키고 저장소 쪽이 쓰게 둔다.
    // 다시 시도가 또 실패해도(failed·corrupt) 읽기 실패 중 입력한 편집을 빈 상태로 바꿔 버리지 않는다
    const edited = this.state.exams.length > 0 || this.state.updatedAt > 0;
    const keepLocal = (r.status === 'empty' || r.status === 'failed' || r.status === 'corrupt') && edited;
    if (!keepLocal) this.#replaceState(res.state);
    this.loadProblem = res.problem;
    this.dropped = res.dropped;
    this.droppedDetail = r.status === 'ok' && res.dropped > 0 ? this.#detailOf(res.state) : null;
    this.droppedBackupKey = r.status === 'ok' ? (r.partialBackupKey ?? null) : null;
    this.degraded = r.status === 'ok' && r.degraded === true;
    this.#emptyAtLoad = r.status === 'empty';
  }

  /** 상태를 통째로 바꾼다(불러오기·되돌리기·원격). 기준 사본을 다시 만들고 되돌리기 기록은 호출자가 정한다 */
  #replaceState(next: State): void {
    this.state = cloneState(next); // 프록시가 원본을 변경하므로 스택·저장소가 쥔 객체와 분리한다
    this.#baseline = cloneState(next);
    this.#stack.clear();
    this.#syncStack();
  }

  #syncStack(): void {
    this.undoDepth = this.#stack.undoDepth;
    this.redoDepth = this.#stack.redoDepth;
    this.undoLabel = this.#stack.undoLabel;
    this.redoLabel = this.#stack.redoLabel;
  }

  // ───────── 불러오기 문제 복구 ─────────
  /** 읽기 실패·손상 배너가 뜬 채 사용자가 만든 편집이 있는가(다시 시도 성공 때 저장본이 기준이 되어 이 편집은 화면에서 사라진다) */
  get hasEditsWhileFailed(): boolean {
    return this.loadProblem !== null && (this.state.exams.length > 0 || this.state.library.length > 0 || this.state.updatedAt > 0);
  }

  /**
   * 저장본 읽기를 다시 시도한다. 성공(ok·empty)이면 true.
   * 읽기 실패 중 만든 편집이 있으면 성공해 저장본으로 바꾸기 직전에 이력 훅(onBeforeBigChange('다시 불러오기 전'))으로 보존하고 토스트로 알린다.
   * confirmed:false 를 명시하면 편집이 있을 때 아무것도 하지 않고 false 를 돌려준다(Shell 이 ConfirmBlock 을 보인 뒤 confirmed:true 로 부른다).
   * 다시 시도가 또 실패해도 입력한 편집은 화면에 남는다.
   */
  async retryLoad(opts: { confirmed?: boolean } = {}): Promise<boolean> {
    const edits = this.hasEditsWhileFailed;
    if (edits && opts.confirmed === false) return false;
    const r = await this.store.retryLoad();
    this.#mirror();
    if (r.status === 'failed' || r.status === 'corrupt') {
      this.#apply(r);
      return false;
    }
    if (edits && r.status === 'ok') {
      this.hooks.onBeforeBigChange?.(T3.beforeRetryLabel);
      toast.info(T3.retryPreserved);
    }
    this.#apply(r);
    this.#startSync();
    return true;
  }

  /**
   * degraded(IDB 를 못 읽어 localStorage 사본으로 연 상태)에서 IDB 를 다시 읽어 본다. 읽히면 true 로 정상 전환한다.
   * degraded 중 편집이 있었으면 IDB 의 저장본과 이 창의 편집 중 고르는 external 선택이 뜬다(app.external). 아직 못 읽으면 false.
   */
  async retryDegraded(): Promise<boolean> {
    if (!this.degraded) return true;
    const r = await this.store.retryDegraded();
    this.#mirror();
    if (r === 'still') return false;
    this.degraded = false;
    if (!this.external) this.store.save(cloneState(this.state)); // 이 창의 내용을 IDB 로 옮겨 낡은 localStorage 사본을 치운다
    this.#startSync();
    return true;
  }

  /** 위험을 알고 저장 가드를 푼다. 저장된 데이터를 덮어쓸 수 있으니 호출 전에 확인을 받는다. 동기화는 새로고침 전까지 시작하지 않는다 */
  allowSaveAnyway(): void {
    this.store.allowSaveAnyway();
    this.#mirror();
    this.loadProblem = null;
    this.#unlockedHold = true;
    this.syncHeld = true;
  }

  /**
   * 보존된 원본(손상 원본 loadProblem.backupKey, 부분 폐기 원본 droppedBackupKey)을 JSON 파일로 내려받는다.
   * 하나면 보존 형식({at, source, raw[, reason]}) 그대로, 둘이면 {키: 보존 형식} 객체로 한 파일에 담는다.
   * 보존된 원본이 없거나 읽지 못하거나 저장에 실패하면 false
   */
  async exportCorrupt(): Promise<boolean> {
    const keys = [...new Set([this.loadProblem?.backupKey, this.droppedBackupKey])].filter((k): k is string => !!k);
    if (!keys.length) return false;
    const found: Record<string, unknown> = {};
    for (const key of keys) {
      const env = await this.store.readCorruptBackup(key);
      if (env === null) return false;
      found[key] = env;
    }
    const body = keys.length === 1 ? found[keys[0]] : found;
    const stamp = new Date(this.#now()).toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return downloadText(`exam-plan-corrupt-${stamp}.json`, JSON.stringify(body, null, 2));
  }

  /** '입력 시험 일부를 버렸다' 알림을 닫는다(보존된 원본 키는 남겨 내보내기는 계속 가능하다) */
  dismissDropped(): void { this.dropped = 0; }

  // ───────── 다른 탭의 변경 ─────────
  #onExternal(value: State, info: ExternalChangeInfo): void {
    if (info.localDirty) {
      this.external = { value, at: this.#now(), partialBackupKey: info.partialBackupKey };
      return;
    }
    this.#adoptExternal(value, info.partialBackupKey);
    toast.info(T2.externalLoaded);
  }

  /**
   * 다른 탭 값을 상태로 옮긴다. backupKey 는 그 값의 버려진 시험 원본을 보존한 키(없으면 null).
   * droppedBackupKey 는 가장 최근 것으로 덮어쓴다. 키가 없으면 셸은 '다음 저장 때 사라짐' 문구를 보인다.
   */
  #adoptExternal(value: State, backupKey: string | null): void {
    this.hooks.onBeforeBigChange?.(T2.externalLoad);
    const keptActive = this.state.activeId;
    const next = keepActiveId(cloneState(value), keptActive);
    this.#replaceState(next);
    this.dropped = this.#droppedOf(value);
    this.droppedDetail = this.dropped > 0 ? this.#detailOf(value) : null;
    this.droppedBackupKey = backupKey;
    this.external = null;
    this.#cleanUi();
  }

  /** '다른 탭 내용 불러오기': 이 탭의 저장 전 변경은 버려진다 */
  acceptExternal(): void {
    const ext = this.external;
    if (!ext) return;
    this.#adoptExternal(ext.value, ext.partialBackupKey);
    this.store.save(cloneState(this.state)); // 저장 대기 중이던 이 탭의 내용을 방금 불러온 내용으로 바꿔 덮어쓰지 않게 한다
    toast.info(T2.externalLoaded);
    this.#startSync(); // 외부 변경 선택 때문에 보류했던 동기화를 다시 시도한다
  }

  /** '이 탭 내용 유지': 이 탭 내용이 더 새것이 되도록 updatedAt 을 올려 저장한다 */
  keepLocalOverExternal(): void {
    const ext = this.external;
    if (!ext) return;
    this.external = null;
    // 이 탭 내용이 다른 탭 저장본을 덮는다: 이 탭의 내용을 이력에 남기고, 버려지는 다른 탭의 시험(이 탭에 없거나 내용이 다른 것)도 이력에 보존한다
    this.hooks.onBeforeBigChange?.(T2.externalKeep);
    const mine = new Map(this.state.exams.map((e) => [e.id, JSON.stringify({ ...e, at: undefined })]));
    for (const e of ext.value.exams) {
      if (mine.get(e.id) === JSON.stringify({ ...e, at: undefined })) continue;
      this.hooks.preserveLoserExam?.({ name: T3.externalDiscardedLabel, exam: cloneState({ ...ext.value, exams: [e] }).exams[0], at: this.#now() });
    }
    this.state.updatedAt = Math.max(this.state.updatedAt, ext.value.updatedAt);
    this.commit({ label: T2.externalKeep, undoable: false, keepUndo: true });
    this.#startSync();
  }

  // ───────── 변경 반영 ─────────
  /**
   * 이미 state 를 바꾼 뒤에 부른다: updatedAt 을 올리고 저장·동기화 알림·이력 훅.
   * 변경 전 상태가 필요하면(되돌리기) mutate() 를 쓴다. commit 만 부르면 직전 commit 이후의 기준 사본이 '변경 전'이 된다.
   */
  commit(opts: CommitOptions = {}): void {
    const label = opts.label ?? T2.defaultLabel;
    const undoable = opts.undoable ?? true;
    const at = this.#now();
    const before = opts.before ?? this.#baseline;
    this.state.updatedAt = nextUpdatedAt(this.state.updatedAt, at);
    stampChanges(this.state, before, this.state.updatedAt); // 바뀐 시험의 at·바뀐 설정의 settingsAt 만 올린다(동기화 충돌은 항목 시각으로 판정)
    const after = cloneState(this.state);
    if (undoable) this.#stack.push(before, label, at, { merge: opts.merge });
    else if (!opts.keepUndo) this.#stack.clear();
    this.#baseline = after;
    this.#syncStack();
    this.store.save(after);
    this.#notify();
    this.hooks.onCommit?.({ label, at, before, after });
  }

  /**
   * fn 이 state 를 고친다. 실행 전 복사본을 되돌리기 스택에 쌓고 commit 한다.
   * 결과 내용이 같으면(아무것도 안 바뀜) commit 하지 않는다. fn 이 던지면 상태를 원래대로 돌리고 다시 던진다.
   * fn 의 반환값을 그대로 돌려준다(core 함수의 { error } 등을 화면이 확인할 수 있다).
   */
  mutate<T>(label: string, fn: (s: State) => T, opts: MutateOptions = {}): T {
    if (opts.big) this.hooks.onBeforeBigChange?.(label);
    const before = cloneState(this.state);
    let result: T;
    try {
      result = fn(this.state);
    } catch (e) {
      this.state = before;
      throw e;
    }
    if (sameContent(before, this.state)) return result;
    this.commit({ label, before, undoable: opts.undoable, merge: opts.merge });
    return result;
  }

  // ───────── 되돌리기·다시 실행(세션 한정) ─────────
  /** 되돌린 변경의 label. 되돌릴 것이 없으면 null */
  undo(): string | null {
    return this.#travel(this.#stack.popUndo(cloneState(this.state), this.#now()), 'undo');
  }

  redo(): string | null {
    return this.#travel(this.#stack.popRedo(cloneState(this.state), this.#now()), 'redo');
  }

  #travel(r: { state: State; label: string } | null, dir: 'undo' | 'redo'): string | null {
    if (!r) return null;
    const prev = cloneState(this.state);
    const at = this.#now();
    const next = keepActiveId(cloneState(r.state), this.state.activeId);
    next.updatedAt = nextUpdatedAt(prev.updatedAt, at); // 동기화에는 새 편집으로 보인다
    stampChanges(next, prev, next.updatedAt);
    this.state = next;
    this.#baseline = cloneState(next);
    this.#syncStack();
    this.#cleanUi();
    this.store.save(cloneState(next));
    this.#notify();
    this.hooks.onCommit?.({ label: (dir === 'undo' ? T2.undo : T2.redo) + ': ' + r.label, at, before: prev, after: this.#baseline });
    return r.label;
  }

  /**
   * 변경을 알리는 토스트. '되돌리기' 단추는 그 변경이 아직 맨 위 단계일 때만 되돌린다
   * (그 뒤에 다른 변경이 있었다면 엉뚱한 것을 되돌리지 않도록 안내만 한다).
   * 화면은 일괄·삭제처럼 한 번에 크게 바뀌는 동작 직후 mutate 다음에 부른다.
   */
  toastUndo(text: string): void {
    const top = this.#stack.topId;
    if (top === 0) { toast.success(text); return; }
    toast.success(text, {
      action: {
        label: T2.undo,
        run: () => {
          if (this.#stack.topId !== top) { toast.info(T2.undoStale); return; }
          this.undo();
        },
      },
    });
  }

  /** 상태가 통째로 바뀐 뒤: 더 이상 없는 시험·날짜를 가리키는 화면 상태를 정리한다 */
  #cleanUi(): void {
    this.ui.selected.clear();
    if (!this.cur()) { this.ui.openDayIso = null; this.ui.subId = null; }
    else if (this.ui.subId && !this.cur()!.subs.some((s) => s.id === this.ui.subId)) this.ui.subId = null;
  }

  // ───────── 활성 시험·선택 ─────────
  /** 활성 시험(없으면 null). activeId 는 기기별 값이라 동기화되지 않는다 */
  cur(): Exam | null {
    return this.state.activeId ? getExam(this.state, this.state.activeId) : null;
  }

  /** 활성 시험을 바꾼다. 선택·열린 날짜·시험 만들기 화면을 닫고 저장한다(되돌리기 단계는 만들지 않는다) */
  setActive(id: string): void {
    if (this.state.activeId === id || !getExam(this.state, id)) return;
    this.state.activeId = id;
    this.ui.selected.clear();
    this.ui.creating = false;
    this.ui.openDayIso = null;
    this.ui.subId = null;
    this.commit({ label: '시험 선택', undoable: false, keepUndo: true });
  }

  clearSelection(): void { this.ui.selected.clear(); }

  /** 탭을 바꾸고 기기별 설정(prefs)에 저장한다. 준비 계획을 벗어나면 선택을 비운다 */
  setTab(tab: Tab): void {
    this.ui.tab = tab;
    if (tab !== 'board') this.ui.selected.clear();
    updatePrefs({ tab });
  }

  // ───────── 동기화 호스트 ─────────
  /** sync/adapter.ts 의 SyncHost 구현. 원격 반영은 로컬 편집이 아니다(updatedAt 을 올리지 않고 엔진에 알리지 않는다) */
  createSyncHost(): SyncHost {
    return {
      getState: () => this.state,
      applyRemote: (mutator) => {
        const next = applyRemoteDraft(this.state, mutator);
        this.#replaceState(next); // 원격이 섞인 상태에서 옛 되돌리기를 하면 원격 변경을 되돌려 올리므로 기록을 비운다
        this.#cleanUi();
        this.store.save(cloneState(next));
      },
      preserveLoserExam: (item) => this.hooks.preserveLoserExam?.(item),
      preserveLoserSettings: (item) => this.hooks.preserveLoserSettings?.(item),
      // 엔진이 항목을 읽기 직전: 다른 탭의 더 새 저장본이 있으면 먼저 반영한다. 선택이 필요하면 던져 이번 사이클을 미룬다(삭제를 올리지 않는다)
      ensureFresh: async () => {
        if (this.external) throw new Error(T3.syncDeferredExternal);
        await this.store.checkExternal();
        if (this.external) throw new Error(T3.syncDeferredExternal);
      },
      onApplied: () => { this.remoteTick += 1; },
    };
  }
}

export type App = AppStore;
export function createApp(opts: AppOptions = {}): App { return new AppStore(opts); }

/** 앱 전역 상태(싱글턴). 화면은 이것만 쓴다 */
export const app = createApp();

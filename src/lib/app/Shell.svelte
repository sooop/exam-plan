<script lang="ts">
  // 앱 셸: 상단 바(왼쪽 작업, 오른쪽 전역), 탭(ARIA 탭 패턴), 화면 영역, 안내·오류 배너, 토스트.
  // 동기화·설정·데이터의 내용은 다음 단계가 구현한다: 이 셸은 콜백 props 로 '열어 달라'는 요청만 보낸다(Layer 를 띄우지 않는다).
  // 앱 루트 요소(id="app")는 index.html 이 만들고 main.ts 가 그 안에 마운트한다(layerStack.appRootId 와 같다).
  import { tick } from 'svelte';
  import { app } from './app.svelte';
  import { droppedNotice } from './appCore';
  import { ICON, TAB_ICON } from './icons';
  import { S, T2 } from './strings';
  import { T3 } from './integrityTexts';
  import { gestureActive } from '../motion/drag-session';
  import SyncBadge from '../sync/ui/SyncBadge.svelte';
  import type { Tab } from '../storage/prefs';
  import Banner from '../ui/Banner.svelte';
  import ConfirmBlock from '../ui/ConfirmBlock.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import ToastHost from '../ui/ToastHost.svelte';
  import { layerStack } from '../ui/layerStack.svelte';
  import { toast } from '../ui/toast.svelte';
  import TodayScreen from '../screens/TodayScreen.svelte';
  import PlanScreen from '../screens/PlanScreen.svelte';
  import ExamScreen from '../screens/ExamScreen.svelte';
  import PrintScreen from '../screens/PrintScreen.svelte';

  interface Props {
    /** 각 단추를 눌렀을 때. 인자는 누른 단추(층의 opener 로 넘기면 닫힌 뒤 포커스가 돌아온다) */
    onopenSync?: (opener: HTMLElement) => void;
    onopenSettings?: (opener: HTMLElement) => void;
    onopenData?: (opener: HTMLElement) => void;
  }
  let { onopenSync, onopenSettings, onopenData }: Props = $props();

  /** 탭 순서는 폭과 무관하게 고정한다 */
  const TAB_ORDER: readonly Tab[] = ['today', 'board', 'exam', 'print'];
  const tabEls: Partial<Record<Tab, HTMLButtonElement>> = {};

  const examCount = $derived(app.state.exams.length);
  const save = $derived(app.saveStatus);
  const saveText = $derived(save.state === 'failed' || save.state === 'blocked' ? '' : T2.saveState[save.state]);

  // ───────── 탭 ─────────
  async function selectTab(tab: Tab, focus = false) {
    app.setTab(tab);
    if (focus) { await tick(); tabEls[tab]?.focus(); }
  }
  function onTabKey(e: KeyboardEvent, tab: Tab) {
    if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    const i = TAB_ORDER.indexOf(tab);
    let next: Tab | null = null;
    if (e.key === 'ArrowRight') next = TAB_ORDER[(i + 1) % TAB_ORDER.length];
    else if (e.key === 'ArrowLeft') next = TAB_ORDER[(i - 1 + TAB_ORDER.length) % TAB_ORDER.length];
    else if (e.key === 'Home') next = TAB_ORDER[0];
    else if (e.key === 'End') next = TAB_ORDER[TAB_ORDER.length - 1];
    if (!next) return;
    e.preventDefault();
    void selectTab(next, true);
  }

  // ───────── 상단 바 ─────────
  function newExam() {
    app.ui.creating = true;
    app.setTab('exam');
  }

  // ───────── 전역 단축키: 되돌리기·다시 실행 ─────────
  function isEditable(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    if (!el || !el.tagName) return false;
    return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
  }
  function onWindowKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (gestureActive()) return; // 끄는 중에는 되돌리기를 무시한다(끌기가 중단되지 않게)
    if (isEditable(e.target) || layerStack.topId !== 0) return; // 입력창은 브라우저의 글자 되돌리기, 층이 열려 있으면 층이 먼저
    const k = e.key.toLowerCase();
    const redo = (k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey);
    const undo = k === 'z' && !e.shiftKey;
    if (!redo && !undo) return;
    e.preventDefault();
    const label = redo ? app.redo() : app.undo();
    if (label === null) toast.info(redo ? T2.nothingToRedo : T2.nothingToUndo);
    else toast.info(redo ? T2.redone(label) : T2.undone(label));
  }

  // ───────── 불러오기 문제 배너 ─────────
  let confirmAllow = $state(false);
  let confirmRetry = $state(false);
  let retrying = $state(false);
  async function retry(confirmed = false) {
    // 읽기 실패 중 입력한 편집이 있으면 먼저 확인을 받는다(편집은 이력에 보존하고 저장본을 불러온다)
    if (app.hasEditsWhileFailed && !confirmed) { confirmRetry = true; return; }
    confirmRetry = false;
    retrying = true;
    try {
      const ok = await app.retryLoad(confirmed ? { confirmed: true } : {});
      if (ok) toast.success(T2.retryOk); else toast.error(T2.retryStillFailed);
    } finally { retrying = false; }
  }
  // 저장소를 읽지 못해 임시 사본으로 열었을 때
  async function retryDegraded() {
    const ok = await app.retryDegraded();
    if (ok) toast.success(T3.degradedOk); else toast.error(T3.degradedStill);
  }
  // 이 기기가 비어 있는데 서버에 항목이 있을 때
  async function serverCopy() {
    const ok = await app.chooseServerCopy();
    if (!ok) toast.error(T3.gateServerCopyFail);
  }
  function keepEmpty() {
    app.keepEmpty();
    toast.info(T3.gateKeepEmptyDone);
  }
  async function exportCorrupt() {
    const ok = await app.exportCorrupt();
    if (ok) toast.success(T2.exportCorruptDone); else toast.error(T2.exportCorruptFail);
  }
  function allowSave() {
    confirmAllow = false;
    app.allowSaveAnyway();
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="shell">
  <header class="top" aria-label={T2.topBar}>
    <div class="wrap top-row">
      <div class="group work">
        {#if examCount > 0}
          <select
            class="exam-pick"
            aria-label={T2.examSelect}
            value={app.state.activeId ?? ''}
            onchange={(e) => app.setActive(e.currentTarget.value)}
          >
            {#each app.state.exams as x (x.id)}
              <option value={x.id}>{x.name}</option>
            {/each}
          </select>
        {/if}
        <button type="button" class="btn" onclick={newExam}>
          <ICON.plus size={16} />{S.newExam}
        </button>
      </div>
      <div class="group global">
        {#if saveText}<span class="save-state muted" data-state={save.state}>{saveText}</span>{/if}
        <SyncBadge />
        <IconButton label={S.settings} icon={ICON.settings} haspopup="dialog" onclick={(e) => onopenSettings?.(e.currentTarget as HTMLElement)} />
        <IconButton label={S.data} icon={ICON.database} haspopup="dialog" onclick={(e) => onopenData?.(e.currentTarget as HTMLElement)} />
      </div>
    </div>
  </header>

  <!-- 계속 보여야 하는 문제는 배너로 둔다(토스트는 지나가는 일만). 배너의 조치 단추는 채움(primary)이 아니다 -->
  <div class="wrap banners">
    {#if app.loadProblem}
      {@const p = app.loadProblem}
      <Banner role="alert" tone="danger" actions={[
        { label: T2.retry, onclick: () => retry(false), disabled: retrying },
        ...(p.backupKey ? [{ label: T2.exportCorrupt, onclick: exportCorrupt }] : []),
        { label: T2.allowSave, onclick: () => { confirmAllow = true; } },
      ]}>
        <strong>{p.kind === 'failed' ? T2.loadFailedTitle : T2.loadCorruptTitle}</strong>
        {p.message}
        <span class="muted">
          {T2.loadGuardNote}
          {#if p.kind === 'corrupt'}{p.backupKey ? T2.corruptBackupKept : T2.corruptBackupMissing}{/if}
          {T2.syncHeld}
        </span>
      </Banner>
      {#if confirmRetry}
        <ConfirmBlock message={T3.retryPreserveBody} confirmLabel={T3.retryPreserveConfirm} onconfirm={() => retry(true)} oncancel={() => (confirmRetry = false)} />
      {/if}
      {#if confirmAllow}
        <ConfirmBlock message={T2.allowSaveWarn} confirmLabel={T2.allowSaveConfirm} danger onconfirm={allowSave} oncancel={() => (confirmAllow = false)} />
      {/if}
    {:else if save.state === 'failed'}
      <Banner role="alert" tone="danger" actions={[{ label: T2.saveFailedAction, onclick: () => onopenData?.((document.activeElement as HTMLElement | null) ?? document.body) }]}>
        <strong>{T2.saveFailedTitle}</strong>
        {save.message ?? ''}
        <span class="muted">{T2.saveFailedHint}</span>
      </Banner>
    {/if}

    {#if app.degraded}
      <Banner role="alert" tone="warn" actions={[{ label: T3.degradedRetry, onclick: retryDegraded }]}>
        <strong>{T3.degradedTitle}</strong>
        {T3.degradedBody}
      </Banner>
    {/if}

    {#if app.syncGate}
      <Banner role="alert" tone="warn" actions={[
        { label: T3.gateServerCopy, onclick: serverCopy },
        { label: T3.gateKeepEmpty, onclick: keepEmpty },
      ]}>
        <strong>{T3.gateTitle}</strong>
        {T3.gateBody(app.syncGate.serverCount)}
      </Banner>
    {/if}

    {#if app.external}
      <Banner role="alert" tone="info" actions={[
        { label: T2.externalLoad, onclick: () => app.acceptExternal() },
        { label: T2.externalKeep, onclick: () => { app.keepLocalOverExternal(); toast.info(T2.externalKept); } },
      ]}>
        <strong>{T2.externalTitle}</strong>
        {T2.externalBody}
      </Banner>
    {/if}

    {#if app.dropped > 0}
      <Banner role="status" tone="info"
        actions={app.droppedBackupKey ? [{ label: T2.exportCorrupt, onclick: exportCorrupt }] : []}
        onclose={() => app.dismissDropped()} closeLabel={T2.dismiss}>
        {droppedNotice(app.dropped, app.droppedBackupKey !== null, app.droppedDetail)}
      </Banner>
    {/if}
  </div>

  {#if !app.ready}
    <!-- 150ms 안에 끝나면 보이지 않는다(CSS 지연) -->
    <div class="wrap"><p class="loading muted" role="status">{T2.loading}</p></div>
  {:else}
    <div class="wrap tabs-wrap">
      <div class="tabs" role="tablist" aria-label={T2.tabsLabel}>
        {#each TAB_ORDER as k (k)}
          {@const Icon = ICON[TAB_ICON[k]]}
          <button
            type="button"
            role="tab"
            class="tab"
            id="tab-{k}"
            aria-selected={app.ui.tab === k}
            aria-controls="tabpanel-{k}"
            tabindex={app.ui.tab === k ? 0 : -1}
            bind:this={tabEls[k]}
            onclick={() => selectTab(k)}
            onkeydown={(e) => onTabKey(e, k)}
          >
            <Icon size={16} />{S.tabs[k]}
          </button>
        {/each}
      </div>
    </div>

    <main class="body">
      {#each TAB_ORDER as k (k)}
        <div class="wrap panel" role="tabpanel" id="tabpanel-{k}" aria-labelledby="tab-{k}" hidden={app.ui.tab !== k}>
          {#if app.ui.tab === k}
            {#if k === 'today'}<TodayScreen />
            {:else if k === 'board'}<PlanScreen />
            {:else if k === 'exam'}<ExamScreen />
            {:else}<PrintScreen />{/if}
          {/if}
        </div>
      {/each}
    </main>
  {/if}

  <ToastHost />
</div>

<style>
  .shell { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
  .top {
    position: sticky; top: 0; z-index: var(--z-top); background: var(--bg); border-bottom: 1px solid var(--line);
    padding-top: env(safe-area-inset-top);
  }
  .top-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; padding-bottom: 8px; flex-wrap: wrap; }
  .group { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .work { flex: 1 1 auto; }
  .exam-pick { width: auto; min-width: 0; max-width: min(320px, 46vw); min-height: var(--target); }
  .save-state { font-size: 12px; white-space: nowrap; }
  .save-state[data-state='saving'], .save-state[data-state='dirty'] { color: var(--muted); }
  @media (max-width: 560px) {
    .save-state { display: none; }
  }

  .banners { display: grid; gap: 8px; padding-top: 0; }
  .banners:has(> :global(*)) { padding-top: 10px; }

  .loading { padding: 32px 0; text-align: center; opacity: 0; animation: shell-fade var(--dur-2) var(--ease-out) var(--dur-2) forwards; }
  :global(html[data-anim='off']) .loading { animation-delay: 0s; animation-duration: 0s; }
  @keyframes shell-fade { to { opacity: 1; } }

  .tabs-wrap { padding-top: 8px; }
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); overflow-x: auto; }
  .tab {
    display: inline-flex; align-items: center; gap: 6px; min-height: var(--target); padding: 4px 14px; white-space: nowrap;
    border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--muted); font-weight: 500;
  }
  .tab:hover { color: var(--text); }
  .tab[aria-selected='true'] { color: var(--text); border-bottom-color: var(--accent-strong); font-weight: 600; }

  .body { flex: 1 1 auto; min-height: 0; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
  .panel { padding-top: 12px; }
</style>

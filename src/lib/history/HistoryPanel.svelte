<script lang="ts">
  // 데이터 서랍 안의 '변경 이력' 구역. 자체 Layer 를 만들지 않는다(DataDrawer 의 snippet 으로 들어간다).
  // 구성: 지금 저장 · 실행 취소/다시 실행 · 탭(스냅샷 / 작업 기록). 이력은 이 기기에만 있고 서버에 올리지 않는다.
  // 움직임: 사용자가 조작해서 생긴 목록 변화에만 Motion.flip/insert 를 입힌다(백그라운드로 쌓이는 자동 스냅샷·첫 렌더는 즉시 반영).
  import { flushSync, onMount, tick, untrack } from 'svelte';
  import Pin from '@lucide/svelte/icons/pin';
  import { app } from '../app/app.svelte';
  import { ICON } from '../app/icons';
  import { Motion } from '../motion/motion';
  import { getDeviceName } from '../sync/device';
  import ConfirmBlock from '../ui/ConfirmBlock.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import { isImeKey } from '../ui/layerCore';
  import { toast } from '../ui/toast.svelte';
  import { AUTO_KEEP_COUNT, AUTO_KEEP_DAYS, LIST_PAGE, formatWhen, summaryLine, type LogKind, type SnapshotKind, type SnapshotMeta } from './core';
  import { history } from './history.svelte';
  import { H, loserSubjectOf, loserWording } from './texts';

  type Tab = 'snapshots' | 'log';
  const TABS: { id: Tab; label: string }[] = [{ id: 'snapshots', label: H.tabSnapshots }, { id: 'log', label: H.tabLog }];

  const KIND_ICON = {
    auto: ICON.history, manual: ICON.hardDrive, 'before-big': ICON.triangleAlert, 'before-sync': ICON.cloud, 'before-restore': ICON.rotateCcw, 'sync-loser': ICON.cloudOff,
  } satisfies Record<SnapshotKind, unknown>;
  const LOG_ICON = { local: ICON.pencil, 'sync-received': ICON.cloudCheck, restore: ICON.rotateCcw } satisfies Record<LogKind, unknown>;

  const SaveIcon = ICON.hardDrive, UndoIcon = ICON.undo2, RedoIcon = ICON.redo2, WarnIcon = ICON.triangleAlert, TrashIcon = ICON.trash2;

  let tab = $state<Tab>('snapshots');
  let view = $state<SnapshotMeta[]>([]);
  let visible = $state(LIST_PAGE);
  let confirm = $state<{ id: string; mode: 'restore' | 'remove' } | null>(null);
  let busy = $state(false);
  let rowError = $state<{ id: string; text: string } | null>(null);
  let now = $state(Date.now());
  let logVisible = $state(LIST_PAGE);
  let listEl: HTMLElement | undefined = $state();
  let tabEls: Partial<Record<Tab, HTMLButtonElement>> = {};
  let pending = false;
  const me = getDeviceName();

  onMount(() => {
    view = history.snapshots;
    void history.refresh();
  });

  // 백그라운드 변화(자동 스냅샷·다른 탭): 연출 없이 바로 반영. 사용자가 조작하는 동안(pending)에는 조작이 끝난 뒤 한 번에 반영한다
  $effect(() => {
    const next = history.snapshots;
    untrack(() => { if (!pending) { view = next; now = Date.now(); } });
  });

  function commitView(next: SnapshotMeta[], animate: boolean): void {
    if (next === view) return;
    now = Date.now();
    if (!animate || !listEl) { view = next; return; }
    const had = new Set(view.map((m) => m.id));
    Motion.flip(listEl, () => flushSync(() => { view = next; }));
    for (const m of next) {
      if (had.has(m.id)) continue;
      void Motion.insert(listEl.querySelector(`[data-id="${CSS.escape(m.id)}"]`));
    }
  }

  async function act<T>(fn: () => Promise<T>): Promise<T> {
    pending = true;
    busy = true;
    try { return await fn(); } finally {
      pending = false;
      busy = false;
      commitView(history.snapshots, true);
    }
  }

  const shown = $derived(view.slice(0, visible));
  const rest = $derived(Math.max(0, view.length - shown.length));
  const logShown = $derived(history.log.slice(0, logVisible));
  const logRest = $derived(Math.max(0, history.log.length - logShown.length));
  const status = $derived(history.historyStatus);

  const clip = (s: string, n = 16) => (Array.from(s).length > n ? Array.from(s).slice(0, n).join('') + '…' : s);
  const labelOf = (m: SnapshotMeta) => m.label || H.noLabel;
  /** 충돌 스냅샷이면 시험/설정 문구, 아니면 null */
  const loserOf = (m: SnapshotMeta) => { const s = loserSubjectOf(m); return s ? loserWording(s) : null; };
  const detail = (m: SnapshotMeta) => {
    const s = loserSubjectOf(m);
    // 설정 충돌에는 시험·할일 수가 없으므로(0 으로 기록돼 있다) 시각만 붙인다
    const head = s === null ? summaryLine(m, now)
      : s === 'settings' ? `${loserWording(s).tag} · ${formatWhen(m.at, now)}`
      : `${loserWording(s).tag} · ${summaryLine(m, now)}`;
    return head + (m.device && m.device !== me ? ` · ${m.device}` : '');
  };

  // ───────── 상단 ─────────
  async function saveNow() {
    const r = await act(() => history.createManual());
    if (r.action === 'added' || r.action === 'replaced') toast.success(H.savedToast);
    else if (r.action === 'touched') toast.info(H.savedSame);
    else toast.error(H.savedFail);
  }
  function doUndo() { const l = app.undo(); if (l) toast.info(H.undone(l)); }
  function doRedo() { const l = app.redo(); if (l) toast.info(H.redone(l)); }

  // ───────── 탭 ─────────
  function selectTab(t: Tab, focus = false) {
    tab = t;
    if (focus) void tick().then(() => tabEls[t]?.focus());
  }
  function onTabKey(e: KeyboardEvent, t: Tab) {
    if (isImeKey(e)) return;
    const i = TABS.findIndex((x) => x.id === t);
    const to = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    selectTab(TABS[to].id, true);
  }

  // ───────── 행 동작 ─────────
  function ask(id: string, mode: 'restore' | 'remove') { rowError = null; confirm = { id, mode }; }
  function cancel() {
    const id = confirm?.id;
    confirm = null;
    if (id) void tick().then(() => focusRow(id));
  }

  function focusRow(id: string, fallbackIndex = 0) {
    const el = listEl?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] button`);
    if (el) { el.focus(); return; }
    const rows = [...(listEl?.querySelectorAll<HTMLElement>('[data-id]') ?? [])];
    const row = rows[Math.min(fallbackIndex, rows.length - 1)];
    (row?.querySelector<HTMLElement>('button') ?? listEl)?.focus();
  }

  async function togglePin(m: SnapshotMeta) {
    await act(() => history.pin(m.id, !m.pinned));
  }

  async function doRemove(m: SnapshotMeta) {
    const idx = view.findIndex((x) => x.id === m.id);
    const ok = await act(() => history.remove(m.id));
    confirm = null;
    if (!ok) { toast.error(H.removeFail); return; }
    toast.success(H.removedToast);
    await tick();
    focusRow('', idx);
  }

  async function doRestore(m: SnapshotMeta) {
    const r = await act(() => history.restore(m.id));
    if (!r.ok) { rowError = { id: m.id, text: r.error }; confirm = null; await tick(); focusRow(m.id); return; }
    confirm = null;
    rowError = null;
    if (r.kind === 'exam') app.toastUndo(H.examRestoredToast(r.examName ?? ''));
    else if (!r.changed) toast.info(H.restoredSame);
    else if (!r.durable) toast.info(H.restoredNotDurable);
    else app.toastUndo(loserOf(m)?.restoredToast ?? H.restoredToast);
    await tick();
    focusRow(m.id);
  }

  const statusText = $derived(
    status.state === 'memory' ? H.statusMemory
    : status.state === 'failed' ? H.statusFailed(status.reason === 'quota' ? H.statusQuota : status.reason === 'timeout' ? H.statusTimeout : H.statusError)
    : '',
  );
</script>

<section class="hist" aria-label={H.title}>
  <div class="top">
    <button type="button" class="btn" disabled={busy} aria-busy={busy} onclick={saveNow} title={H.saveNowTip}>
      <SaveIcon size={16} />{H.saveNow}
    </button>
    <button type="button" class="btn" disabled={!app.canUndo} aria-describedby="hist-undo-note" onclick={doUndo}><UndoIcon size={16} />{H.undo}</button>
    <button type="button" class="btn" disabled={!app.canRedo} aria-describedby="hist-redo-note" onclick={doRedo}><RedoIcon size={16} />{H.redo}</button>
  </div>
  <p class="note muted" id="hist-undo-note">{app.canUndo ? H.undoLine(app.undoLabel ?? '') : H.undoNone}</p>
  <p class="note muted" id="hist-redo-note">{app.canRedo ? H.redoLine(app.redoLabel ?? '') : H.redoNone}</p>

  {#if statusText}
    <p class="banner" class:bad={status.state === 'failed'} role={status.state === 'failed' ? 'alert' : 'status'}>
      {#if status.state === 'failed'}<WarnIcon size={16} />{/if}
      <span>{statusText}</span>
    </p>
  {/if}
  {#if history.pruneNotice}
    <div class="banner" role="status">
      <span>{H.prunedNotice(history.pruneNotice.count, AUTO_KEEP_COUNT, AUTO_KEEP_DAYS)}</span>
      <button type="button" class="btn ghost" onclick={() => history.dismissPruneNotice()}>{H.dismiss}</button>
    </div>
  {/if}

  <div class="tabs" role="tablist" aria-label={H.tabsLabel}>
    {#each TABS as t (t.id)}
      <button
        type="button" role="tab" class="tab" id="hist-tab-{t.id}" aria-selected={tab === t.id} aria-controls="hist-panel-{t.id}"
        tabindex={tab === t.id ? 0 : -1} bind:this={tabEls[t.id]} onclick={() => selectTab(t.id)} onkeydown={(e) => onTabKey(e, t.id)}
      >{t.label}</button>
    {/each}
  </div>

  {#if tab === 'snapshots'}
    <div role="tabpanel" id="hist-panel-snapshots" aria-labelledby="hist-tab-snapshots" class="pane">
      {#if !history.ready}
        <p class="empty muted" role="status">{H.loading}</p>
      {:else if view.length === 0}
        <p class="empty muted">{H.empty}</p>
      {/if}
      <ul class="list" bind:this={listEl} aria-label={H.listLabel} tabindex="-1" hidden={view.length === 0}>
        {#each shown as m (m.id)}
          {@const KindIcon = KIND_ICON[m.kind]}
          {@const lw = loserOf(m)}
          <li class="row" class:pinned={m.pinned} data-id={m.id}>
            <div class="head">
              <span class="kind"><KindIcon size={14} />{lw?.kindLabel ?? H.kind[m.kind]}</span>
              <span class="label" title={labelOf(m)}>{labelOf(m)}</span>
            </div>
            <p class="meta muted">{detail(m)}</p>
            <div class="acts">
              <IconButton label="{H.pin}: {clip(labelOf(m))}" pressed={m.pinned} icon={Pin} disabled={busy} onclick={() => togglePin(m)} />
              <IconButton label="{H.remove}: {clip(labelOf(m))}" icon={TrashIcon} disabled={busy} onclick={() => ask(m.id, 'remove')} />
              <button type="button" class="btn" disabled={busy} aria-label="{lw?.button ?? H.restore} {clip(labelOf(m))}" onclick={() => ask(m.id, 'restore')}>
                {lw?.button ?? H.restore}
              </button>
            </div>
            {#if rowError?.id === m.id}
              <p class="err" role="alert">{rowError.text}</p>
            {/if}
            {#if confirm?.id === m.id}
              {#if confirm.mode === 'remove'}
                <ConfirmBlock message={H.removeConfirm} confirmLabel={H.removeConfirmLabel} {busy} busyLabel={H.removeBusy} onconfirm={() => doRemove(m)} oncancel={cancel} />
              {:else if lw}
                <ConfirmBlock message={lw.confirm(m.label)} confirmLabel={lw.confirmLabel} danger={lw.danger} {busy} busyLabel={H.restoreBusy} onconfirm={() => doRestore(m)} oncancel={cancel} />
              {:else}
                <ConfirmBlock message={H.restoreConfirm(m.counts.exams, m.counts.tasks)} confirmLabel={H.restoreConfirmLabel} danger={false} {busy} busyLabel={H.restoreBusy} onconfirm={() => doRestore(m)} oncancel={cancel} />
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
      {#if rest > 0}
        <button type="button" class="btn more" onclick={() => (visible += LIST_PAGE)}>{H.more(rest)}</button>
      {/if}
    </div>
  {:else}
    <div role="tabpanel" id="hist-panel-log" aria-labelledby="hist-tab-log" class="pane">
      {#if history.log.length === 0}
        <p class="empty muted">{H.emptyLog}</p>
      {:else}
        <ul class="list" aria-label={H.logLabel}>
          {#each logShown as e (e.id)}
            {@const LogIcon = LOG_ICON[e.kind]}
            {@const remote = e.kind === 'sync-received'}
            <li class="row log" class:remote>
              <div class="head">
                <span class="kind"><LogIcon size={14} />{H.logKind[e.kind]}</span>
                <span class="label" title={e.label}>{e.label}{e.count > 1 ? ` · ${H.times(e.count)}` : ''}</span>
              </div>
              <p class="meta muted">
                {formatWhen(e.at, now)} · {remote ? H.syncedBadge : !e.device || e.device === me ? H.thisDevice : e.device}
              </p>
            </li>
          {/each}
        </ul>
        {#if logRest > 0}
          <button type="button" class="btn more" onclick={() => (logVisible += LIST_PAGE)}>{H.more(logRest)}</button>
        {/if}
      {/if}
    </div>
  {/if}
</section>

<style>
  .hist { display: grid; gap: 8px; min-width: 0; }
  .top { display: flex; flex-wrap: wrap; gap: 8px; }
  .top .btn { min-height: var(--target); }
  .note { margin: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .banner {
    display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 10px; font-size: 13px;
    border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel);
  }
  .banner span { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
  .banner.bad { border-color: var(--red-text); color: var(--red-text); }
  .banner .btn { min-height: var(--target); }

  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); }
  .tab {
    min-height: var(--target); padding: 4px 14px; white-space: nowrap; border: 0; border-bottom: 2px solid transparent;
    background: transparent; color: var(--muted); font-weight: 500;
  }
  .tab:hover { color: var(--text); }
  .tab[aria-selected='true'] { color: var(--text); border-bottom-color: var(--accent-strong); font-weight: 600; }

  .pane { display: grid; gap: 8px; min-width: 0; }
  .empty { margin: 0; padding: 12px 4px; font-size: 14px; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 360px; overflow-y: auto; overscroll-behavior: contain; }
  .list[hidden] { display: none; }
  .row {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; align-items: center; padding: 8px 10px;
    border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); min-width: 0;
  }
  .row.pinned { border-color: var(--text); }
  .row.remote { border-style: dashed; }
  .head { grid-column: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
  .kind {
    display: inline-flex; align-items: center; gap: 4px; flex: none; padding: 1px 8px; font-size: 12px; font-weight: 600;
    border: 1px solid var(--line); border-radius: 999px; background: var(--panel); white-space: nowrap;
  }
  .label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
  .meta { grid-column: 1; margin: 0; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .acts { grid-column: 2; grid-row: 1 / span 2; display: flex; align-items: center; gap: 4px; }
  .acts :global(.icon-btn) { width: var(--target); height: var(--target); }
  .acts .btn { min-height: var(--target); }
  .row > :global(.confirm), .err { grid-column: 1 / -1; }
  .row.log { grid-template-columns: minmax(0, 1fr); }
  .err { margin: 4px 0 0; font-size: 13px; color: var(--red-text); overflow-wrap: anywhere; }
  .more { min-height: var(--target); justify-self: start; }

  @media (max-width: 900px) {
    .row { grid-template-columns: minmax(0, 1fr); }
    .acts { grid-column: 1; grid-row: auto; justify-content: flex-end; flex-wrap: wrap; }
  }
</style>

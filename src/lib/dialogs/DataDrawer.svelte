<script lang="ts">
  // 데이터 서랍(Layer variant='drawer'): 맨 위 저장 실패 안내, 내보내기(JSON 파일 저장·복사), 가져오기(붙여넣기·파일 열기·끌어 놓기),
  // 맨 아래 변경 이력 구역(history 스니펫이 있을 때만). 가져오기는 모두 importPayloadText 로 들어간다.
  import { onDestroy, type Snippet } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import Copy from '@lucide/svelte/icons/copy';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import { app } from '../app/app.svelte';
  import { downloadText } from '../app/download';
  import { ICON } from '../app/icons';
  import { S, T2 } from '../app/strings';
  import { exportPayload } from '../core/sanitize';
  import Layer from '../ui/Layer.svelte';
  import { copyText } from './clipboard';
  import { importPayloadText } from './importPayload';
  import { draftAfterImport, fileSizeFailure, importFailureText, isFileDrag, pickImportFile, type ImportSource } from './logic';
  import { D } from './texts';

  /** 복사 성공 표시를 되돌리는 시간 */
  const COPIED_MS = 1600;
  /** 내려받는 파일 이름 */
  const EXPORT_FILE = 'exam-planner.json';

  interface Props {
    open?: boolean;
    /** 닫힌 뒤 포커스를 돌려줄 요소(데이터 단추 또는 저장 실패 배너의 조치 단추) */
    opener?: HTMLElement | null;
    /** 변경 이력 구역의 내용(HistoryPanel 등). 없으면 구역을 그리지 않는다 */
    history?: Snippet;
  }
  let { open = $bindable(false), opener = null, history }: Props = $props();

  const save = $derived(app.saveStatus);
  const failing = $derived(save.state === 'failed' || save.state === 'blocked');

  /**
   * 붙여넣기 초안. 서랍을 닫아도 지우지 않고 묻지도 않는다(작업물을 잃지 않게, ui-principles 8).
   * 컴포넌트는 App 에서 항상 마운트되므로 창을 열어 두는 동안 남는다. 가져오기에 성공했을 때만 비운다.
   */
  let pasteText = $state('');
  let dragOver = $state(false);
  let copied = $state(false);
  let busy = $state(false);
  /** 마지막 작업의 결과. 새 작업을 시작하면 지운다. ok 는 role=status, err 는 role=alert 로 읽힌다 */
  let ok = $state('');
  let err = $state('');
  let hint = $state('');

  let saveBtn: HTMLButtonElement | undefined = $state();
  let exportBtn: HTMLButtonElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();

  let dragDepth = 0;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(copyTimer));

  function clearStatus(): void {
    ok = '';
    err = '';
    hint = '';
  }

  const json = (): string => JSON.stringify(exportPayload(app.state), null, 1);

  // ───────── 내보내기 ─────────
  function saveJson(): void {
    clearStatus();
    if (downloadText(EXPORT_FILE, json())) ok = D.exportedTo(EXPORT_FILE);
    else err = D.exportFailed;
  }

  async function copyJson(): Promise<void> {
    clearStatus();
    if (!(await copyText(json()))) {
      err = D.copyFailed;
      return;
    }
    copied = true;
    ok = D.copiedFlash; // 아이콘만 바뀌면 보조기술이 알 수 없으므로 상태 줄에도 쓴다
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), COPIED_MS);
  }

  // ───────── 가져오기 ─────────
  /** 텍스트 가져오기 한 번: 붙여넣기는 성공하면 초안을 비운다(초안 정책은 draftAfterImport) */
  function importText(text: string, source: ImportSource, note: string): void {
    clearStatus();
    const out = importPayloadText(text, source);
    const tail = note ? ' ' + note : '';
    pasteText = draftAfterImport(pasteText, source, out.ok);
    if (out.ok) {
      ok = out.text + tail;
      if (out.counts.excluded > 0) hint = D.excludedHint;
    } else {
      err = out.text + tail;
    }
  }

  function runPaste(): void {
    importText(pasteText, 'paste', '');
  }

  /** 파일 열기·끌어 놓기 공통: 목록에서 하나를 고르고, 크기를 본 뒤 읽는다 */
  async function openFiles(list: FileList | File[] | null | undefined, source: 'file' | 'drop'): Promise<void> {
    const pick = pickImportFile(Array.from(list ?? []));
    if (!pick.file) return;
    const note = pick.ignored ? S.importMulti : '';
    clearStatus();
    const sizeBad = fileSizeFailure(pick.file.size);
    if (sizeBad) {
      err = importFailureText(sizeBad, source) + (note ? ' ' + note : '');
      return;
    }
    busy = true;
    let text: string;
    try {
      text = await readText(pick.file);
    } catch {
      err = importFailureText({ kind: 'read' }, source) + (note ? ' ' + note : '');
      return;
    } finally {
      busy = false;
    }
    importText(text, source, note);
  }

  function readText(f: File): Promise<string> {
    if (typeof f.text === 'function') return f.text();
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsText(f);
    });
  }

  function onFileChosen(e: Event & { currentTarget: HTMLInputElement }): void {
    void openFiles(e.currentTarget.files, 'file');
    e.currentTarget.value = ''; // 같은 파일을 다시 고를 수 있게 비운다(목록은 위에서 이미 꺼냈다)
  }

  // 끌어 놓기: 파일 끌기만 받는다. 영역 안에서는 stopPropagation 으로 아래 전역 막기가 덮어쓰지 않게 한다
  function onDragEnter(e: DragEvent): void {
    if (!isFileDrag(e.dataTransfer?.types)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth += 1;
    dragOver = true;
  }
  function onDragOver(e: DragEvent): void {
    if (!isFileDrag(e.dataTransfer?.types)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }
  function onDragLeave(e: DragEvent): void {
    if (!isFileDrag(e.dataTransfer?.types)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dragOver = false;
  }
  function onDrop(e: DragEvent): void {
    if (!isFileDrag(e.dataTransfer?.types)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    dragOver = false;
    void openFiles(e.dataTransfer?.files, 'drop');
  }

  /** 서랍이 열려 있는 동안만: 영역 밖에 파일을 놓아도 브라우저가 그 파일로 이동하지 않게 막는다. 닫으면 해제한다 */
  $effect(() => {
    if (!open) return;
    const guard = (e: DragEvent) => {
      if (!isFileDrag(e.dataTransfer?.types)) return;
      e.preventDefault();
      if (e.type === 'dragover' && e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  });
</script>

<Layer
  bind:open
  variant="drawer"
  title={S.data}
  {opener}
  initialFocus={() => (failing && saveBtn) || exportBtn || null}
  onclosed={clearStatus}
>
  <div class="dlg-body">
    <!-- 상시 존재하는 alert 영역: 내용이 생기면 읽힌다. 실패가 해결될 때까지 조치 단추를 둔다 -->
    <div class="dlg-alert" role="alert">
      {#if failing}
        <div class="dlg-card">
          <p class="dlg-strong">{save.state === 'blocked' ? T2.saveState.blocked : T2.saveFailedTitle}</p>
          {#if save.message}<p class="dlg-reason">{save.message}</p>{/if}
          <p class="dlg-hint">{T2.saveFailedHint}</p>
          {#if save.where === 'memory'}<p class="dlg-hint">{D.saveAlertMemory}</p>{/if}
          <div class="dlg-row">
            <button type="button" class="btn danger" bind:this={saveBtn} disabled={busy} onclick={saveJson}>
              <ICON.download size={16} />{D.saveNow}
            </button>
          </div>
        </div>
      {/if}
    </div>

    <section class="dlg-sec" aria-labelledby="dlg-export-h">
      <h3 id="dlg-export-h" class="dlg-h">{S.export}</h3>
      <div class="dlg-row">
        <button type="button" class="btn" bind:this={exportBtn} disabled={busy} onclick={saveJson}>
          <ICON.download size={16} />{S.exportFile}
        </button>
        <button type="button" class="btn" disabled={busy} onclick={copyJson}>
          {#if copied}<Check size={16} />{:else}<Copy size={16} />{/if}{S.exportCopy}
        </button>
      </div>
    </section>

    <section class="dlg-sec" aria-labelledby="dlg-import-h">
      <h3 id="dlg-import-h" class="dlg-h">{S.import}</h3>
      <p class="dlg-hint">{D.importIntro}</p>
      <div
        class="dlg-drop"
        role="group"
        aria-label={D.dropHint}
        data-dragover={dragOver ? '' : undefined}
        ondragenter={onDragEnter}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        ondrop={onDrop}
      >
        <textarea
          rows="4"
          placeholder={S.importPaste}
          aria-label={S.import}
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          bind:value={pasteText}
        ></textarea>
        <p class="dlg-hint">{dragOver ? D.dropActive : D.dropHint}</p>
      </div>
      <input type="file" accept=".json,application/json" hidden bind:this={fileInput} onchange={onFileChosen} />
      <div class="dlg-row">
        <button type="button" class="btn" disabled={busy} aria-busy={busy} onclick={() => fileInput?.click()}>
          <FolderOpen size={16} />{busy ? D.readingFile : D.openFile}
        </button>
        <button type="button" class="btn primary" disabled={busy} onclick={runPaste}>{S.importRun}</button>
      </div>
    </section>

    {#if history}
      <section class="dlg-sec" aria-labelledby="dlg-hist-h">
        <h3 id="dlg-hist-h" class="dlg-h">{D.historyTitle}</h3>
        {@render history()}
      </section>
    {/if}
  </div>

  {#snippet footer()}
    <div class="dlg-status">
      <p role="status" class="dlg-ok">{ok}</p>
      {#if hint}<p class="dlg-hint">{hint}</p>{/if}
      <p role="alert" class="dlg-err">{err}</p>
    </div>
  {/snippet}
</Layer>

<style>
  .dlg-body { display: grid; gap: 22px; min-width: 0; }
  .dlg-sec { display: grid; gap: 8px; min-width: 0; }
  .dlg-h { font-size: 15px; font-weight: 600; }
  .dlg-hint { font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
  .dlg-strong { font-weight: 600; overflow-wrap: anywhere; }
  .dlg-reason { font-size: 13px; overflow-wrap: anywhere; }
  .dlg-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-width: 0; }
  .dlg-alert { min-width: 0; }
  .dlg-card {
    display: grid; gap: 6px; padding: 12px; min-width: 0;
    border: 1px solid var(--red-text); border-radius: var(--radius-lg); background: var(--panel);
  }
  .dlg-drop {
    display: grid; gap: 6px; padding: 10px; min-width: 0;
    border: 1px dashed var(--line); border-radius: var(--radius-lg); background: var(--bg);
  }
  .dlg-drop textarea { min-height: 96px; }
  /* 파일을 끌어 올 때만 바뀐다(글자 끌기는 data-dragover 가 붙지 않는다) */
  .dlg-drop[data-dragover] { border-color: var(--accent); background: var(--accent-soft); }
  .dlg-status { display: grid; gap: 4px; width: 100%; min-width: 0; font-size: 14px; }
  .dlg-status p { overflow-wrap: anywhere; }
  .dlg-ok { color: var(--green-text); font-weight: 600; }
  .dlg-err { color: var(--red-text); font-weight: 600; }
</style>

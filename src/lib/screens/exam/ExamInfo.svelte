<script lang="ts">
  // 시험 정보 편집(이름·시작·종료·준비 시작)과 시험 삭제.
  // 날짜는 입력 중간값으로 즉시 적용하지 않고 확정(blur·Enter·적용 단추)할 때 적용한다(감사 C3).
  // 적용 전에 previewEdit(previewExamFields)로 영향을 세어, 미배치로 바뀔 할일·삭제될 날짜 설정(메모 포함)·바뀔 과목 시험일이 있으면 확인 블록을 거친다.
  import { tick, untrack } from 'svelte';
  import { app } from '../../app/app.svelte';
  import { ICON } from '../../app/icons';
  import { S } from '../../app/strings';
  import { getExam, updateExamFields, type ExamFieldsPreview } from '../../core/planner';
  import type { Exam, ExamFields } from '../../core/types';
  import ConfirmBlock from '../../ui/ConfirmBlock.svelte';
  import IconButton from '../../ui/IconButton.svelte';
  import { isImeKey } from '../../ui/layerCore';
  import { datesChanged, draftOf, failMsg, fieldsChanged, fieldsOf, impactMessage, needsConfirm } from './logic';
  import { previewEdit } from './preview.svelte';
  import { X } from './texts';

  interface Props {
    ex: Exam;
    /** 시험을 삭제했다(다음 포커스를 정하려고) */
    ondeleted?: () => void;
  }
  let { ex, ondeleted }: Props = $props();

  let draft = $state(draftOf(untrack(() => ex)));
  let error = $state('');
  let pending = $state<{ fields: ExamFields; message: string } | null>(null);
  let confirmDel = $state(false);
  let delBtn: HTMLButtonElement | undefined = $state();
  let gridEl: HTMLElement | undefined = $state();
  /** 마지막으로 만진 입력칸(확인·취소·적용 뒤 포커스를 돌려줄 곳) */
  let lastEl: HTMLElement | null = null;

  // 저장소 값이 바뀌면(적용·되돌리기·원격 변경) 입력 초안을 맞춘다
  $effect(() => {
    const d = draftOf(ex);
    untrack(() => {
      draft = d;
      error = '';
      pending = null;
    });
  });

  const dirty = $derived(fieldsChanged(ex, fieldsOf(draft)));

  function tryApply() {
    if (pending) return;
    const fields = fieldsOf(draft);
    if (!fieldsChanged(ex, fields)) {
      error = '';
      return;
    }
    // ex 는 $state 프록시라 core 의 복사(structuredClone)에 직접 넘기면 DataCloneError 가 난다: previewEdit 이 일반 객체로 바꿔 넘긴다
    const pv: ExamFieldsPreview = previewEdit(app.state, ex, fields);
    if (!pv.ok) {
      error = failMsg(X.editFail, pv.error ?? '');
      return;
    }
    error = '';
    if (needsConfirm(pv)) {
      pending = { fields, message: impactMessage(pv) };
      return;
    }
    apply(fields, false);
  }

  function apply(fields: ExamFields, announce: boolean) {
    const id = ex.id;
    const big = datesChanged(ex, fields);
    const r = app.mutate(X.editLabel, (s) => {
      const e = getExam(s, id);
      return e ? updateExamFields(e, fields) : { error: X.editFail };
    }, { big });
    pending = null;
    if ('error' in r) {
      error = failMsg(X.editFail, r.error);
      return;
    }
    error = '';
    if (announce) app.toastUndo(X.edited);
  }

  function revert() {
    draft = draftOf(ex);
    error = '';
    pending = null;
  }

  /** 누른 단추·확인 블록이 사라지면 포커스가 body 로 떨어지므로 입력칸으로 돌려준다 */
  function refocus() {
    void tick().then(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.isConnected && !a.closest('.confirm, [data-ex-actions]')) return;
      (lastEl && lastEl.isConnected ? lastEl : gridEl?.querySelector<HTMLElement>('input'))?.focus({ preventScroll: true });
    });
  }
  function applyByButton() {
    tryApply();
    refocus();
  }
  function revertByButton() {
    revert();
    refocus();
  }

  /** 입력칸을 벗어나면 적용한다. 단 '적용'·'입력 취소' 단추로 옮겨 가는 중이면 그 단추의 뜻을 따른다 */
  function onfieldblur(e: FocusEvent) {
    if ((e.relatedTarget as Element | null)?.closest('[data-ex-actions]')) return;
    tryApply();
  }
  function onfieldfocus(e: FocusEvent) {
    lastEl = e.currentTarget as HTMLElement;
  }

  function onkeydown(e: KeyboardEvent) {
    if (isImeKey(e)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      tryApply();
    } else if (e.key === 'Escape' && (dirty || error || pending)) {
      e.preventDefault();
      e.stopPropagation();
      revert();
    }
  }

  function edited() {
    // 입력이 바뀌면 이전 확인·오류는 낡았다
    pending = null;
    error = '';
  }

  function remove() {
    const id = ex.id;
    const name = ex.name;
    app.mutate(X.lbl.delExam, (s) => {
      s.exams = s.exams.filter((x) => x.id !== id);
      s.activeId = s.exams.length ? s.exams[0].id : null;
    }, { big: true });
    app.clearSelection();
    app.ui.subId = null;
    app.ui.openDayIso = null;
    confirmDel = false;
    app.toastUndo(X.examDeleted(name));
    ondeleted?.();
  }

  function cancelDelete() {
    confirmDel = false;
    void tick().then(() => delBtn?.focus());
  }
</script>

<section class="ex-card" aria-label={X.infoLabel}>
  <div class="ex-head">
    <h2 class="ex-title">{ex.name}</h2>
    <IconButton label={X.deleteExam} icon={ICON.trash2} expanded={confirmDel} onclick={() => (confirmDel = !confirmDel)} bind:element={delBtn} />
  </div>

  {#if confirmDel}
    <ConfirmBlock
      message={X.examDeleteConfirm(ex.name, ex.subs.length, ex.tasks.length)}
      confirmLabel={S.del}
      cancelLabel={S.cancel}
      onconfirm={remove}
      oncancel={cancelDelete}
    />
  {/if}

  <div class="ex-grid" bind:this={gridEl}>
    <label class="f ex-wide">
      <span>{S.fName}</span>
      <input type="text" bind:value={draft.name} oninput={edited} {onkeydown} onblur={onfieldblur} onfocus={onfieldfocus} maxlength="60" autocomplete="off" aria-label={S.fName} aria-invalid={error ? 'true' : undefined} />
    </label>
    <label class="f">
      <span>{S.fStart}</span>
      <input type="date" bind:value={draft.start} oninput={edited} {onkeydown} onblur={onfieldblur} onfocus={onfieldfocus} aria-label={S.fStart} aria-invalid={error ? 'true' : undefined} />
    </label>
    <label class="f">
      <span>{S.fEnd}</span>
      <input type="date" bind:value={draft.end} oninput={edited} {onkeydown} onblur={onfieldblur} onfocus={onfieldfocus} aria-label={S.fEnd} aria-invalid={error ? 'true' : undefined} />
    </label>
    <label class="f">
      <span>{S.fPrep}</span>
      <input type="date" bind:value={draft.prep} oninput={edited} {onkeydown} onblur={onfieldblur} onfocus={onfieldfocus} aria-label={S.fPrep} aria-invalid={error ? 'true' : undefined} />
    </label>
  </div>

  <p class="ex-err" role="alert">{error}</p>

  {#if pending}
    <ConfirmBlock message={pending.message} confirmLabel={X.applyDates} cancelLabel={S.cancel} onconfirm={() => apply(pending!.fields, true)} oncancel={revertByButton} />
  {:else if dirty}
    <!-- 단추를 누르는 순간 입력칸의 blur 가 먼저 적용해 버리지 않도록 mousedown 으로 포커스를 빼앗지 않는다 -->
    <div class="ex-row" data-ex-actions>
      <button type="button" class="btn" onmousedown={(e) => e.preventDefault()} onclick={applyByButton}>{X.apply}</button>
      <button type="button" class="btn ghost" onmousedown={(e) => e.preventDefault()} onclick={revertByButton}>{X.revert}</button>
    </div>
  {/if}
  <p class="ex-hint">{X.editHint}</p>
</section>

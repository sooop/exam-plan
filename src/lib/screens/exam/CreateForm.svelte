<script lang="ts">
  // 시험 만들기 폼. 이름·시작일·종료일·준비 시작일, 준비 시작 빠른 단추(2·3·4주 전).
  // 이 화면의 주 동작은 '시험 만들기' 하나라 강조색 채움 단추는 그것뿐이다.
  import { onMount } from 'svelte';
  import { app } from '../../app/app.svelte';
  import { S } from '../../app/strings';
  import { cleanWeek, newExam } from '../../core/planner';
  import { isImeKey } from '../../ui/layerCore';
  import { createDraft, resetCreateDraft } from './draft.svelte';
  import { applyPrepWeeks, applyStartChange, failMsg } from './logic';
  import { X } from './texts';

  interface Props {
    /** 마운트될 때 이름 입력칸에 포커스를 줄지(사용자가 '새 시험'을 눌러 열었을 때) */
    autofocus?: boolean;
    /** 만들었다(새 시험 id) */
    oncreated?: (id: string) => void;
  }
  let { autofocus = false, oncreated }: Props = $props();

  // 입력 초안은 탭을 옮겨도 남도록 모듈 수준 상태(draft.svelte.ts)에 둔다
  const draft = createDraft;
  let error = $state('');
  let nameEl: HTMLInputElement | undefined = $state();
  let startEl: HTMLInputElement | undefined = $state();

  onMount(() => {
    if (autofocus) nameEl?.focus({ preventScroll: true });
  });

  const canCancel = $derived(app.state.exams.length > 0);

  function onStart(e: Event) {
    draft.f = applyStartChange(draft.f, (e.currentTarget as HTMLInputElement).value);
  }
  function setWeeks(n: number) {
    const next = applyPrepWeeks(draft.f, n);
    if (!next) {
      error = X.startFirst;
      startEl?.focus();
      return;
    }
    error = '';
    draft.f = next;
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const r = app.mutate(X.lbl.create, (s) => {
      const res = newExam({ name: draft.f.name, start: draft.f.start, end: draft.f.end, prepStart: draft.f.prepStart });
      if ('error' in res) return res;
      res.exam.week = cleanWeek(s.week);
      s.exams.push(res.exam);
      s.activeId = res.exam.id;
      return res;
    });
    if ('error' in r) {
      error = failMsg(X.createFail, r.error);
      return;
    }
    error = '';
    resetCreateDraft();
    app.ui.creating = false;
    oncreated?.(r.exam.id);
  }

  function cancel() {
    resetCreateDraft();
    app.ui.creating = false;
  }

  function onkeydown(e: KeyboardEvent) {
    if (isImeKey(e)) {
      // 한글 조합을 확정하는 Enter 가 폼 제출로 번지지 않게 한다
      if (e.key === 'Enter') e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && canCancel) {
      e.preventDefault();
      cancel();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="ex-card ex-form" aria-label={S.newExam} onsubmit={submit} {onkeydown} novalidate>
  <h2 class="ex-sec" style="margin:0">{S.newExam}</h2>
  <label class="f">
    <span>{S.fName}</span>
    <input type="text" bind:this={nameEl} bind:value={draft.f.name} oninput={() => (error = '')} placeholder={S.namePh} maxlength="60" autocomplete="off" aria-label={S.fName} />
  </label>
  <div class="ex-grid">
    <label class="f">
      <span>{S.fStart}</span>
      <input type="date" bind:this={startEl} bind:value={draft.f.start} onchange={onStart} aria-label={S.fStart} />
    </label>
    <label class="f">
      <span>{S.fEnd}</span>
      <input type="date" bind:value={draft.f.end} aria-label={S.fEnd} />
    </label>
    <label class="f">
      <span>{S.fPrep}</span>
      <input type="date" bind:value={draft.f.prepStart} onchange={() => (draft.f.prepTouched = true)} aria-label={S.fPrep} />
    </label>
  </div>
  <div class="ex-row" role="group" aria-label={S.fPrep}>
    {#each [2, 3, 4] as n (n)}
      <button type="button" class="btn" onclick={() => setWeeks(n)}>{S.prepWeeks(n)}</button>
    {/each}
  </div>
  <p class="ex-err" role="alert">{error}</p>
  <div class="ex-row">
    <button type="submit" class="btn primary">{S.createExam}</button>
    {#if canCancel}
      <button type="button" class="btn" onclick={cancel}>{S.cancel}</button>
    {/if}
  </div>
</form>

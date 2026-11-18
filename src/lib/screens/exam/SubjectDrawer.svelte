<script lang="ts">
  // 과목 정보 서랍(Layer variant='drawer'). app.ui.subId 로 열고 닫는다.
  // 닫는 연출 동안에도 내용이 남도록 Layer 의 keepContentWhileClosing 으로 닫기 직전의 본문을 유지하고(마지막 과목 스냅샷),
  // 닫히기 전에 확정할 수 있는 입력은 적용한다. 확정하지 못하는 입력(확인 대기 중인 분량 줄이기·틀린 과목명·추가하지 않은 링크)이 있으면
  // Layer 의 '버리고 닫을까요?' 를 거치고, 버리고 닫았을 때는 사유를 알림으로 남긴다.
  import { onDestroy } from 'svelte';
  import { app } from '../../app/app.svelte';
  import { S } from '../../app/strings';
  import Layer from '../../ui/Layer.svelte';
  import { toast } from '../../ui/toast.svelte';
  import SubjectForm from './SubjectForm.svelte';
  import { chipEl } from './ops';
  import { X } from './texts';

  const ex = $derived(app.cur());
  const exists = $derived(!!ex && !!app.ui.subId && ex.subs.some((s) => s.id === app.ui.subId));

  let shownId = $state<string | null>(null);
  let form: SubjectForm | undefined = $state();
  /** 닫기 요청 때 확정하지 못한 입력의 사유(실제로 닫힌 뒤에 알린다) */
  let dropNotes: string[] = [];

  $effect(() => {
    if (app.ui.subId && exists) shownId = app.ui.subId;
  });
  // 없는 과목을 가리키는 id 는 정리한다
  $effect(() => {
    if (app.ui.subId && ex && !exists) app.ui.subId = null;
  });

  const es = $derived(ex && shownId ? ex.subs.find((s) => s.id === shownId) : undefined);

  /** 지금 확정하지 못한 입력(Layer 가 닫기를 요청받을 때 canClose 뒤에 읽는다: 그 사이에 flush 가 먼저 적용을 시도한다) */
  const unsaved = () => form?.unsaved() ?? { parts: [], notes: [] };
  const dirty = $derived.by(() => unsaved().parts.length > 0);
  const discardMessage = $derived.by(() => {
    const { parts } = unsaved();
    return parts.length === 1 && parts[0] === X.unsavedLink ? X.linkDiscard : X.unsavedDiscard(parts);
  });

  /** 닫힌 뒤: 시험 날짜를 바꿔 칩이 새로 만들어졌거나(연 단추가 사라짐) 포커스가 어디에도 없으면 그 과목 칩으로 돌려준다 */
  function returnFocus() {
    const id = shownId;
    const a = document.activeElement;
    if (id && (!a || a === document.body)) chipEl(id)?.querySelector<HTMLElement>('.ex-chip-main')?.focus();
    shownId = null;
    if (dropNotes.length) toast.info(dropNotes.join(' '));
    dropNotes = [];
  }

  onDestroy(() => {
    app.ui.subId = null;
  });
</script>

<Layer
  bind:open={() => exists, (v) => { if (!v) app.ui.subId = null; }}
  variant="drawer"
  title={S.subTitle}
  keepContentWhileClosing
  {dirty}
  {discardMessage}
  canClose={() => {
    form?.flush();
    dropNotes = unsaved().notes;
    return true;
  }}
  onclosed={returnFocus}
>
  {#if ex && es}
    {#key es.id}
      <SubjectForm bind:this={form} {ex} {es} />
    {/key}
  {/if}
</Layer>

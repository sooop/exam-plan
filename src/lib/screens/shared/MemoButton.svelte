<script lang="ts">
  // 날짜 메모 단추: 메모 아이콘 + (있으면) 메모 글자(긴 글은 말줄임, 전체는 툴팁·접근성 이름). 누르면 MemoPopover 가 열린다(함께 그린다).
  import { ICON } from '../../app/icons';
  import { S, fmtFull } from '../../app/strings';
  import type { Exam } from '../../core/types';
  import { tip } from '../../ui/tip';
  import MemoPopover from './MemoPopover.svelte';
  import { T } from './texts';

  interface Props {
    exam: Exam;
    iso: string;
    /** 글자 없이 아이콘만(좁은 칸). 메모가 있으면 강조색 아이콘으로 구분한다 */
    iconOnly?: boolean;
    disabled?: boolean;
    placement?: string;
    element?: HTMLButtonElement;
  }
  let { exam, iso, iconOnly = false, disabled = false, placement = 'bottom-start', element = $bindable() }: Props = $props();

  const Icon = ICON.stickyNote;
  const note = $derived(exam.days[iso]?.note ?? '');
  let open = $state(false);
  let anchor: HTMLButtonElement | undefined = $state();
  $effect(() => {
    element = anchor;
  });
</script>

<button
  type="button"
  class="memo-btn"
  bind:this={anchor}
  data-has={note ? '' : undefined}
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-label={T.memoButtonLabel(fmtFull(iso), note)}
  {disabled}
  onclick={() => (open = !open)}
  use:tip={{ title: note || S.memo }}
>
  <Icon size={15} />
  {#if !iconOnly}<span class="tx" class:empty={!note}>{note || T.memoAdd}</span>{/if}
</button>
<MemoPopover bind:open anchor={anchor ?? null} {exam} {iso} {placement} />

<style>
  .memo-btn {
    display: inline-flex; align-items: center; gap: 4px; min-height: 32px; max-width: 240px; min-width: 0; padding: 0 8px; border-radius: var(--radius);
    border: 1px solid transparent; background: transparent; font-size: 13px; color: var(--muted);
  }
  .memo-btn:hover:not(:disabled) { background: var(--panel2); }
  .memo-btn[aria-expanded='true'] { background: var(--panel2); border-color: var(--line); }
  .memo-btn:disabled { opacity: 0.45; }
  .memo-btn[data-has] :global(svg) { color: var(--accent-text); }
  .tx { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
  .tx.empty { color: var(--muted); }
  @media (pointer: coarse) { .memo-btn { min-height: var(--target); } }
</style>

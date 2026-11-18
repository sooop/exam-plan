<script lang="ts">
  // 되돌릴 수 없는 동작을 확인받는 인라인 블록. 처음 포커스는 취소에 있어 Enter 한 번으로 실행되지 않는다.
  // Esc 는 이 블록만 취소한다(가장 안쪽부터 한 단계씩): 층의 Esc 로 번지지 않는다. 한글 조합 중에는 무시한다.
  import { onMount, type Snippet } from 'svelte';
  import { slideFx } from '../motion/motion.svelte';
  import { isImeKey } from './layerCore';

  interface Props {
    /** 대상과 규모를 쓴다("항목 3개(글 12개)가 완전히 삭제되며 되돌릴 수 없습니다") */
    message?: string;
    children?: Snippet;
    /** 확정 단추 라벨: 동사로 쓴다("삭제", "버리고 닫기") */
    confirmLabel: string;
    cancelLabel?: string;
    /** 위험색 채움 확정 단추. 기본 true */
    danger?: boolean;
    /** 처리 중: 두 단추를 막고 확정 단추 라벨을 바꾼다 */
    busy?: boolean;
    busyLabel?: string;
    /**
     * 나타남·사라짐에 높이가 펼쳐지고 접히는 slide(ui-motion 표 '접기·펼치기': 열림 220ms ease-out, 닫힘 200ms ease-in-out)를 쓴다.
     * 부모의 `{#if}` 로 붙었다 떨어질 때 재생되도록 global 전환이다. 감싸는 쪽이 이미 같은 연출을 하면 false.
     */
    animate?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  }
  let { message, children, confirmLabel, cancelLabel = '취소', danger = true, busy = false, busyLabel, animate = true, onconfirm, oncancel }: Props = $props();

  let cancelBtn: HTMLButtonElement | undefined = $state();
  onMount(() => cancelBtn?.focus({ preventScroll: true }));

  function onkeydown(e: KeyboardEvent) {
    if (isImeKey(e)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!busy) oncancel();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="confirm" role="group" aria-label="확인" transition:slideFx|global={{ off: !animate }} {onkeydown}>
  <p class="msg">{#if children}{@render children()}{:else}{message}{/if}</p>
  <div class="row">
    <button type="button" class="btn" bind:this={cancelBtn} disabled={busy} onclick={oncancel}>{cancelLabel}</button>
    <button type="button" class="btn" class:danger-fill={danger} disabled={busy} aria-busy={busy} onclick={onconfirm}>
      {busy ? (busyLabel ?? '처리하는 중…') : confirmLabel}
    </button>
  </div>
</div>

<style>
  .confirm {
    display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius);
    background: var(--panel);
  }
  .msg { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; }
  .row { display: flex; justify-content: flex-end; gap: 8px; }
</style>

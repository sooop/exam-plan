<script lang="ts">
  // 켜짐/꺼짐 하나를 뜻하는 설정용 스위치(role=switch). 라벨 전체를 눌러도 바뀐다.
  // 라벨이 옆 칸에 따로 있으면 children 없이 label 만 주면 aria-label 이 된다. 값이 바뀌면 onchange(checked) 를 부른다.
  import type { Snippet } from 'svelte';

  interface Props {
    checked?: boolean;
    /** 이름: children 이 없을 때 aria-label 로 쓴다 */
    label?: string;
    disabled?: boolean;
    /** 비활성 이유를 적은 요소의 id: 이유는 옆 글자로 보이게 하고 여기서는 보조기술에 연결만 한다 */
    describedby?: string;
    onchange?: (checked: boolean) => void;
    children?: Snippet;
  }
  let { checked = $bindable(false), label, disabled = false, describedby, onchange, children }: Props = $props();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button
  type="button"
  class="swl"
  role="switch"
  aria-checked={checked}
  aria-label={children ? undefined : label}
  aria-describedby={describedby}
  {disabled}
  onclick={toggle}
>
  <span class="track" aria-hidden="true"><span class="knob mo-knob"></span></span>
  {#if children}<span class="lbl">{@render children()}</span>{/if}
</button>

<style>
  .swl {
    display: inline-flex; align-items: center; gap: 10px; padding: 4px 0; border: 0; background: transparent; text-align: left;
    min-height: 32px;
  }
  .swl:disabled { opacity: .5; }
  .track {
    position: relative; flex: none; width: 34px; height: 20px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel2);
    transition: background-color var(--dur-2) var(--ease-out), border-color var(--dur-2) var(--ease-out);
  }
  .knob {
    position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
    background: var(--text); box-shadow: var(--shadow);
  }
  .swl[aria-checked='true'] .track { background: var(--accent-strong); border-color: var(--accent-strong); }
  .swl[aria-checked='true'] .knob { transform: translateX(14px); background: var(--accent-ink); }
  /* 누르는 동안 손잡이가 눌린 쪽으로 늘어난다: 폭(레이아웃 속성)이 아니라 개별 속성 scale 로, 짧은 전환(--dur-1)으로 */
  .knob { transform-origin: left center; transition: transform var(--dur-2) var(--ease-spring), scale var(--dur-1) var(--ease-out); }
  .swl[aria-checked='true'] .knob { transform-origin: right center; }
  .swl:active:not(:disabled) .knob { scale: 1.3 1; }
  .lbl { min-width: 0; overflow-wrap: anywhere; }
  @media (pointer: coarse) { .swl { min-height: var(--target); } }
</style>

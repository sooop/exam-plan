<script lang="ts">
  // 아이콘만 있는 단추. aria-label 과 툴팁을 항상 함께 붙인다(행 안의 단추는 label 에 대상 이름을 넣는다: "보고서 메뉴").
  import type { Component, Snippet } from 'svelte';
  import { tip } from './tip';

  interface Props {
    /** 접근성 이름이자 툴팁 제목(필수) */
    label: string;
    /** 툴팁에 병기할 단축키("Esc") */
    shortcut?: string;
    /** lucide 아이콘 컴포넌트. 또는 children 으로 직접 그린다 */
    icon?: Component<{ size?: number | string }>;
    children?: Snippet;
    /** 토글 단추면 aria-pressed */
    pressed?: boolean;
    /** 접기·팝오버를 여는 단추면 aria-expanded */
    expanded?: boolean;
    haspopup?: 'menu' | 'dialog' | 'listbox' | boolean;
    controls?: string;
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    class?: string;
    /** 행 안의 보조 단추: Tab 정지점에서 뺀다(메뉴 키로 닿게 한다) */
    tabindex?: number;
    element?: HTMLButtonElement;
  }
  let {
    label, shortcut, icon: Icon, children, pressed, expanded, haspopup, controls, disabled = false, onclick, class: cls = '', tabindex,
    element = $bindable(),
  }: Props = $props();
</script>

<button
  type="button"
  class="icon-btn {cls}"
  bind:this={element}
  aria-label={label}
  aria-pressed={pressed}
  aria-expanded={expanded}
  aria-haspopup={haspopup}
  aria-controls={controls}
  {disabled}
  {tabindex}
  {onclick}
  use:tip={{ title: label, kbd: shortcut }}
>
  {#if Icon}<Icon size={18} />{:else if children}{@render children()}{/if}
</button>

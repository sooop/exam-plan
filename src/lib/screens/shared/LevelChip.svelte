<script lang="ts">
  // 날짜의 바쁨 정도 칩: 막대 + 단계 이름. 누르면 LevelPopover 가 열린다(팝오버를 이 컴포넌트가 함께 그린다).
  import { S, fmtFull, levelLabel } from '../../app/strings';
  import { app } from '../../app/app.svelte';
  import { levelOf } from '../../core';
  import type { Exam } from '../../core/types';
  import { tip } from '../../ui/tip';
  import LevelPopover from './LevelPopover.svelte';
  import Meter from './Meter.svelte';

  interface Props {
    exam: Exam;
    iso: string;
    /** 단계 이름 글자를 숨기고 막대만(좁은 칸). 접근성 이름에는 남는다 */
    compact?: boolean;
    /** 읽기 전용(팝오버를 열지 않는다) */
    disabled?: boolean;
    placement?: string;
    element?: HTMLButtonElement;
  }
  let { exam, iso, compact = false, disabled = false, placement = 'bottom-end', element = $bindable() }: Props = $props();

  const level = $derived(levelOf(exam, iso));
  const label = $derived(levelLabel(level));
  const limit = $derived(app.state.limits[level]);
  let open = $state(false);
  let anchor: HTMLButtonElement | undefined = $state();
  $effect(() => {
    element = anchor;
  });
</script>

<button
  type="button"
  class="lvchip"
  bind:this={anchor}
  data-lv={level}
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-label={S.levelChip(fmtFull(iso), label)}
  {disabled}
  onclick={() => (open = !open)}
  use:tip={{ title: S.levelTitle + ': ' + label, lines: [S.levelPer(limit)] }}
>
  <Meter {level} decorative hideCount />
  {#if !compact}<span class="lb">{label}</span>{/if}
</button>
<LevelPopover bind:open anchor={anchor ?? null} {exam} {iso} {placement} />

<style>
  .lvchip {
    display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 2px 10px; border-radius: 999px; font-size: 13px; white-space: nowrap;
    border: 1px solid var(--line); background: var(--bg); color: var(--text);
  }
  .lvchip:hover:not(:disabled) { background: var(--panel2); }
  .lvchip[aria-expanded='true'] { border-color: var(--accent-strong); background: var(--panel); }
  .lvchip:disabled { opacity: 0.45; }
  .lb { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  @media (pointer: coarse) { .lvchip { min-height: var(--target); } }
</style>

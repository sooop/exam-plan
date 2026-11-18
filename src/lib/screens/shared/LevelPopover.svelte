<script lang="ts">
  // 날짜의 바쁨 정도 팝오버(Layer popover). 5단계 라디오 + 기본값으로 + 휴일 표시.
  // 변경은 shared/actions.ts 를 거쳐 app.mutate('바쁨 정도 변경') 한 번이다. 고르면 닫히고 포커스가 앵커로 돌아간다.
  // 키보드: 안의 모든 항목이 Tab 정지점 하나(롤빙). ↑↓←→ 끝에서 돌아감·Home·End 는 포커스만 옮기고, Enter·Space·클릭이 고른다. Tab·Esc 는 닫는다.
  import { app } from '../../app/app.svelte';
  import { ICON } from '../../app/icons';
  import { S, fmtFull } from '../../app/strings';
  import { defaultLevel, isHoliday } from '../../core';
  import type { Exam, LevelKey } from '../../core/types';
  import Layer from '../../ui/Layer.svelte';
  import { changeDayLevel, changeHoliday } from './actions';
  import Meter from './Meter.svelte';
  import { isImeKey, levelOptions, rovingNext } from './logic';
  import { T } from './texts';

  interface Props {
    open?: boolean;
    /** 팝오버가 붙을 요소(보통 LevelChip 의 단추) */
    anchor: HTMLElement | null;
    exam: Exam;
    iso: string;
    placement?: string;
    onclose?: () => void;
  }
  let { open = $bindable(false), anchor, exam, iso, placement = 'bottom-end', onclose }: Props = $props();

  const ResetIcon = ICON.rotateCcw;
  const FlagIcon = ICON.flag;
  // 닫히는 동안(120ms 연출)에는 닫기 직전의 항목을 그대로 둔다: 비우면 껍데기만 남아 페이드한다
  let lastOpts: ReturnType<typeof levelOptions> = [];
  const opts = $derived.by(() => {
    if (open) lastOpts = levelOptions(app.state, exam, iso);
    return lastOpts;
  });
  let lastOver = false;
  const overridden = $derived.by(() => {
    if (open) lastOver = !!exam.days[iso]?.level;
    return lastOver;
  });
  let lastHoliday = false;
  const holiday = $derived.by(() => {
    if (open) lastHoliday = isHoliday(exam, iso);
    return lastHoliday;
  });
  const count = $derived(5 + (overridden ? 1 : 0) + 1);
  let rv = $state(0);
  let box: HTMLElement | undefined = $state();

  $effect(() => {
    if (open) rv = Math.max(0, opts.findIndex((o) => o.checked));
  });

  function chooseLevel(key: LevelKey) {
    changeDayLevel(exam.id, iso, key === defaultLevel(exam, iso) ? null : key);
    open = false;
  }
  function reset() {
    changeDayLevel(exam.id, iso, null);
    open = false;
  }
  function toggleHoliday() {
    changeHoliday(exam.id, iso, !holiday);
    open = false;
  }
  function keydown(e: KeyboardEvent) {
    if (isImeKey(e)) return;
    const next = rovingNext(rv, e.key, count);
    if (next === null) return;
    e.preventDefault();
    rv = next;
    box?.querySelector<HTMLElement>('[data-rv="' + next + '"]')?.focus();
  }
  function focusin(e: FocusEvent) {
    const i = (e.target as HTMLElement | null)?.dataset?.rv;
    if (i !== undefined) rv = Number(i);
  }
  const initialFocus = () => box?.querySelector<HTMLElement>('[tabindex="0"]') ?? null;
</script>

<Layer bind:open variant="popover" {anchor} {placement} title={S.levelTitle} width="280px" {initialFocus} onclose={() => onclose?.()}>
  <div class="lv" bind:this={box} onkeydown={keydown} onfocusin={focusin} role="presentation">
    <p class="date muted">{fmtFull(iso)}</p>
    <div role="radiogroup" aria-label={S.levelTitle} class="group">
      {#each opts as o, i (o.key)}
        <button
          type="button"
          class="opt"
          role="radio"
          aria-checked={o.checked}
          aria-label={T.levelOptionLabel(o.label, o.limit)}
          data-rv={i}
          tabindex={rv === i ? 0 : -1}
          onclick={() => chooseLevel(o.key)}
        >
          <Meter level={o.key} decorative hideCount />
          <span class="nm">{o.label}</span>
          <small>{S.levelPer(o.limit)}</small>
        </button>
      {/each}
    </div>
    {#if overridden}
      <button type="button" class="opt" data-rv={5} tabindex={rv === 5 ? 0 : -1} onclick={reset}>
        <ResetIcon size={16} /><span class="nm">{S.levelDefault}</span><small></small>
      </button>
    {/if}
    <button
      type="button"
      class="opt"
      role="switch"
      aria-checked={holiday}
      data-rv={count - 1}
      tabindex={rv === count - 1 ? 0 : -1}
      onclick={toggleHoliday}
    >
      <FlagIcon size={16} /><span class="nm">{S.holidayOn}</span><small class="state">{holiday ? T.switchOn : T.switchOff}</small>
    </button>
    <p class="keys muted" aria-hidden="true">{T.levelKeyHint}</p>
  </div>
</Layer>

<style>
  .lv { display: grid; gap: 2px; }
  .group { display: grid; gap: 2px; }
  .date { font-size: 13px; padding: 0 8px 2px; }
  .opt {
    display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; width: 100%; min-height: var(--target); padding: 6px 8px;
    text-align: left; border: 0; border-radius: var(--radius); background: transparent;
  }
  .opt:hover:not(:disabled) { background: var(--panel2); }
  .opt[aria-checked='true'] { background: var(--panel); font-weight: 600; box-shadow: inset 0 0 0 1px var(--accent); }
  .opt[role='switch'][aria-checked='true'] { box-shadow: inset 0 0 0 1px var(--text); }
  .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { color: var(--muted); font-family: var(--mono); font-size: 12px; }
  .keys { font-size: 12px; padding: 4px 8px 0; }
  @media (pointer: coarse) { .keys { display: none; } }
</style>

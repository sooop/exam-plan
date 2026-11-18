<script lang="ts">
  // 날짜 선택 시트(하단 시트, 좁은 폭에서 모달처럼 보인다). 할일 하나 또는 여러 개(일괄 이동)를 옮길 날짜를 고른다.
  // 값만 돌려준다: 호출자가 app.mutate 로 moveTask 한다(shared/actions.ts 의 moveTasksTo 를 써도 된다).
  //  - 항목: '보관함으로' + 준비 기간의 모든 날짜. 각 날짜에 바쁨 정도(막대·글자)와 개수/권장, 현재 날짜 표시, 넘치게 되면 아이콘·글자로 표시
  //  - 키보드: 목록에 Tab 정지점은 하나(롤빙). ↑↓ 끝에서 돌아감, Home/End, Enter·Space 선택, Esc 닫기(층)
  import { app } from '../../app/app.svelte';
  import { ICON } from '../../app/icons';
  import { S, fmtFull } from '../../app/strings';
  import { examDays, taskLabel, todayISO } from '../../core';
  import type { Exam } from '../../core/types';
  import Layer from '../../ui/Layer.svelte';
  import Meter from './Meter.svelte';
  import { buildPickItems, isImeKey, rovingNext, rovingStart } from './logic';
  import { T } from './texts';

  interface Props {
    open?: boolean;
    exam: Exam;
    /** 옮길 할일 id 들(하나면 단건, 여러 개면 일괄) */
    taskIds: string[];
    /** 현재 날짜(null 이면 보관함). 생략하면 모두 같은 날짜일 때 그 날짜 */
    current?: string | null;
    /** 날짜(YYYY-MM-DD) 또는 null(보관함으로). 부른 뒤 시트는 스스로 닫힌다 */
    onpick: (iso: string | null) => void;
    /** 닫힌 뒤 포커스를 돌려줄 요소(생략하면 연 순간의 포커스 요소) */
    opener?: HTMLElement | null;
    onclose?: () => void;
  }
  let { open = $bindable(false), exam, taskIds, current, onpick, opener, onclose }: Props = $props();

  const WarnIcon = ICON.triangleAlert;
  // 닫히는 동안(170ms 연출)에는 닫기 직전의 목록을 그대로 둔다: 비우면 '준비 기간이 없습니다' 가 번쩍이며 시트가 쪼그라든다
  let lastItems: ReturnType<typeof buildPickItems> = [];
  const items = $derived.by(() => {
    if (open) lastItems = buildPickItems(app.state, exam, taskIds, current);
    return lastItems;
  });
  const subtitle = $derived.by(() => {
    if (taskIds.length !== 1) return T.pickMany(taskIds.length);
    const t = exam.tasks.find((x) => x.id === taskIds[0]);
    return t ? taskLabel(app.state, exam, t) : '';
  });
  let lastToday = '';
  const today = $derived.by(() => {
    if (open) lastToday = todayISO();
    return lastToday;
  });
  let rv = $state(0);
  let listEl: HTMLElement | undefined = $state();
  const off = (i: number) => items[i]?.disabled ?? true;

  $effect(() => {
    if (open) rv = rovingStart(items.findIndex((it) => it.current), items.length, off);
  });

  function pick(i: number) {
    const it = items[i];
    if (!it || it.disabled) return;
    onpick(it.iso);
    open = false;
  }
  function keydown(e: KeyboardEvent) {
    if (isImeKey(e)) return;
    const next = rovingNext(rv, e.key, items.length, off);
    if (next === null) return;
    e.preventDefault();
    rv = next;
    listEl?.querySelector<HTMLElement>('[data-i="' + next + '"]')?.focus();
  }
  function focusin(e: FocusEvent) {
    const i = (e.target as HTMLElement | null)?.dataset?.i;
    if (i !== undefined) rv = Number(i);
  }
  const initialFocus = () => listEl?.querySelector<HTMLElement>('[tabindex="0"]') ?? null;
  const dayTag = (iso: string) => (iso === today ? S.today : '');
  let lastExamN: string[] = [];
  const examN = $derived.by(() => {
    if (open) lastExamN = examDays(exam);
    return lastExamN;
  });
</script>

<Layer bind:open variant="sheet" title={S.pickTitle} {opener} {initialFocus} onclose={() => onclose?.()}>
  <p class="sub muted">{subtitle}</p>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="list" role="listbox" aria-label={T.pickListLabel} bind:this={listEl} onkeydown={keydown} onfocusin={focusin}>
    {#each items as it, i (it.iso ?? 'vault')}
      <button
        type="button"
        class="pick"
        role="option"
        aria-selected={it.current}
        aria-label={it.label}
        data-i={i}
        data-level={it.level ?? undefined}
        data-over={it.over ? '' : undefined}
        data-vault={it.iso === null ? '' : undefined}
        style:--fill={it.fill.toFixed(2)}
        tabindex={rv === i ? 0 : -1}
        disabled={it.disabled}
        onclick={() => pick(i)}
      >
        {#if it.iso === null}
          <span class="l">
            <span class="d">{S.toVault}</span>
            <small>{it.disabled ? it.reason : T.pickVaultDesc}</small>
          </span>
          {#if it.current}<span class="tag">{T.pickCurrent}</span>{/if}
        {:else}
          <span class="l">
            <span class="d">{fmtFull(it.iso)}</span>
            {#if dayTag(it.iso)}<span class="tag">{dayTag(it.iso)}</span>{/if}
            {#if examN.includes(it.iso)}<span class="tag">{S.examDayN(examN.indexOf(it.iso) + 1)}</span>{/if}
            {#if it.holiday}<small>{it.holiday}</small>{/if}
            {#if it.current}<span class="tag cur">{T.pickCurrent}</span>{/if}
            <Meter level={it.level!} hideCount decorative size="sm" />
            <small>{it.levelLabel}</small>
          </span>
          <span class="r" data-over={it.over ? '' : undefined}>
            {#if it.over}<WarnIcon size={14} /><small class="ov">{T.overShort}</small>{/if}
            <span class="mono">{it.count}/{it.limit}</span>
          </span>
        {/if}
      </button>
    {/each}
    {#if items.length <= 1}<p class="muted">{T.pickEmptyRange}</p>{/if}
  </div>
  <p class="hint muted" aria-hidden="true">{T.pickKeyHint}</p>
</Layer>

<style>
  .sub { margin: 0 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .list { display: grid; gap: 4px; }
  .pick {
    --lv: var(--lv-normal);
    display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; width: 100%; min-height: var(--target); text-align: left;
    border-radius: var(--radius); padding: 6px 10px; border: 1px solid var(--line);
    background: color-mix(in srgb, var(--lv) calc(var(--fill, 0) * var(--fillmax)), var(--bg));
  }
  .pick[data-vault] { background: var(--bg); }
  .pick[data-level='calm'] { --lv: var(--lv-calm); }
  .pick[data-level='easy'] { --lv: var(--lv-easy); }
  .pick[data-level='busy'] { --lv: var(--lv-busy); }
  .pick[data-level='packed'] { --lv: var(--lv-packed); }
  .pick[data-over] { --lv: var(--red); border-style: dashed; border-color: var(--red-text); }
  .pick:hover:not(:disabled) { border-color: var(--text); }
  .pick[aria-selected='true'] { box-shadow: inset 0 0 0 2px var(--text); font-weight: 600; }
  .pick:disabled { opacity: 0.55; }
  .l { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
  .d { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { color: var(--muted); font-size: 12px; }
  .tag { font-size: 12px; padding: 0 7px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); line-height: 20px; white-space: nowrap; }
  .tag.cur { border-color: var(--text); font-weight: 600; }
  .r { display: inline-flex; align-items: center; gap: 4px; font-family: var(--mono); font-size: 13px; white-space: nowrap; }
  .r[data-over] { color: var(--red-text); font-weight: 700; }
  .ov { color: var(--red-text); }
  .hint { margin: 8px 0 0; font-size: 12px; }
  @media (pointer: coarse) { .hint { display: none; } }
</style>

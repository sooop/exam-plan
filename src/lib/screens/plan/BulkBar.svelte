<script lang="ts">
  // 일괄 작업 막대: 날짜를 하나 이상 고르면 화면 하단에 붙어 나타난다(role=toolbar, sticky + safe-area).
  // 'N일 선택' · 바쁨 정도 5단계 · 기본값으로 · 주말·공휴일 선택 · 비어 있는 날 선택 · 선택 해제(Esc 도 같은 동작).
  // 좁은 폭(900px 이하)에서는 두 줄로 줄인다: 윗줄 = 선택 수 · 더 보기(기본값으로·주말·공휴일 선택·비어 있는 날 선택을 담은 팝오버) · 선택 해제, 아랫줄 = 바쁨 정도 5단계(가로 스크롤 한 줄).
  // 바쁨 정도 일괄 변경은 app.mutate(…, { big: true }) + 되돌리기 토스트. 방향키·Home·End 는 막대 안에서 포커스만 옮긴다(Tab 정지점 하나).
  import { app } from '../../app/app.svelte';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Layer from '../../ui/Layer.svelte';
  import { LEVELS } from '../../core/constants';
  import { getExam, isHoliday, setDayLevel } from '../../core/planner';
  import type { Exam, LevelKey, Task } from '../../core/types';
  import { panelFx } from '../../motion/motion.svelte';
  import { S, levelLabel } from '../../app/strings';
  import { isImeKey } from '../../ui/layerCore';
  import { toast } from '../../ui/toast.svelte';
  import { tip } from '../../ui/tip';
  import Meter from '../shared/Meter.svelte';
  import { rovingNext } from '../shared/logic';
  import { emptyDays, inDayOrder, levelChangedDays, mergeSelection, weekendHolidayDays } from './logic';
  import { acknowledgeCells } from './ops';
  import { P } from './texts';

  interface Props {
    exam: Exam;
    days: string[];
    byDate: Record<string, Task[]>;
    /** 선택 해제 단추(Esc 와 같은 동작은 PlanScreen 이 처리한다) */
    onclear: () => void;
    /** 선택이 바뀌었다(스크린리더 안내용) */
    onselect?: (count: number) => void;
  }
  let { exam, days, byDate, onclear, onselect }: Props = $props();

  const sel = app.ui.selected;
  const n = $derived(inDayOrder(days, sel).length);
  const NARROW = '(max-width: 900px)';
  let narrow = $state(typeof matchMedia === 'function' && matchMedia(NARROW).matches);
  $effect(() => {
    const mq = matchMedia(NARROW);
    narrow = mq.matches;
    const on = (e: MediaQueryListEvent) => (narrow = e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });

  // 롤빙 번호는 DOM 순서다. 넓은 폭: 단계 5 · 기본값 · 주말 · 빈 날 · 해제 / 좁은 폭: 더 보기 · 해제 · 단계 5
  const L = LEVELS.length;
  const IDX = $derived(
    narrow
      ? { level: (i: number) => 2 + i, more: 0, reset: -1, weekend: -1, empty: -1, clear: 1, count: L + 2 }
      : { level: (i: number) => i, more: -1, reset: L, weekend: L + 1, empty: L + 2, clear: L + 3, count: L + 4 },
  );
  let rv = $state(0);
  let moreOpen = $state(false);
  let moreBtn: HTMLButtonElement | undefined = $state();
  let moreBox: HTMLElement | undefined = $state();
  let moreRv = $state(0);
  const MoreIcon = Ellipsis;

  // 선택이 모두 풀리면 더 보기 팝오버도 닫는다
  $effect(() => {
    if (n <= 0) moreOpen = false;
  });
  // 폭이 바뀌면 탭 정지점을 첫 바쁨 정도 단추로 되돌린다
  $effect(() => {
    void narrow;
    rv = IDX.level(0);
  });
  let bar: HTMLElement | undefined = $state();
  let barH = $state(0);

  // 막대가 떠 있는 동안 토스트가 막대를 가리지 않도록 올릴 높이를 알린다(ToastHost 가 --toast-lift 를 bottom 에 더하면 적용된다)
  $effect(() => {
    if (n <= 0 || !barH) return;
    const st = document.documentElement.style;
    st.setProperty('--toast-lift', barH + 8 + 'px');
    return () => st.removeProperty('--toast-lift');
  });

  /** 더 보기 팝오버의 항목: 실행하고 닫는다(포커스는 더 보기 단추로 돌아온다) */
  function moreDo(fn: () => void) {
    moreOpen = false;
    fn();
  }
  function onmorekey(e: KeyboardEvent) {
    if (isImeKey(e)) return;
    const next = rovingNext(moreRv, e.key, 3);
    if (next === null) return;
    e.preventDefault();
    moreRv = next;
    moreBox?.querySelectorAll<HTMLElement>('[data-more-item]')[next]?.focus();
  }

  function pickMore(add: string[]) {
    if (!add.length) {
      toast.info(P.selAddedNone);
      return;
    }
    const next = mergeSelection(days, sel, add);
    for (const d of next) sel.add(d);
    onselect?.(sel.size);
  }
  const pickWeekend = () => pickMore(weekendHolidayDays(days, (d) => isHoliday(exam, d)));
  const pickEmpty = () => pickMore(emptyDays(days, (d) => byDate[d]?.length ?? 0));

  /** level 로 바꾼다(null 이면 기본값으로). 실제로 달라지는 날이 없으면 알리기만 한다 */
  function applyLevel(level: LevelKey | null) {
    const targets = inDayOrder(days, sel);
    const changed = levelChangedDays(exam.days, targets, level);
    if (!changed.length) {
      toast.info(P.bulkNoChange);
      return;
    }
    app.mutate(
      P.mutBulkLevel,
      (s) => {
        const e = getExam(s, exam.id);
        if (e) setDayLevel(e, targets, level);
      },
      { big: true },
    );
    app.toastUndo(level ? P.bulkLevelDone(changed.length, levelLabel(level)) : P.bulkResetDone(changed.length));
    acknowledgeCells(changed);
  }

  function onkeydown(e: KeyboardEvent) {
    if (isImeKey(e)) return;
    const next = rovingNext(rv, e.key, IDX.count);
    if (next === null || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    rv = next;
    bar?.querySelectorAll<HTMLElement>('[data-bar-item]')[next]?.focus();
  }
  function onfocusin(e: FocusEvent) {
    const i = (e.target as HTMLElement | null)?.dataset?.barItem;
    if (i !== undefined) rv = Number(i);
  }
</script>

{#if n > 0}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_interactive_supports_focus -->
  <div class="pl-bar" class:narrow role="toolbar" aria-label={P.bulkLabel} bind:this={bar} bind:offsetHeight={barH} transition:panelFx={{ side: 'bottom' }} {onkeydown} {onfocusin}>
    <span class="pl-bcount num" role="status">{S.selCount(n)}</span>
    {#if narrow}
      <span class="pl-grow"></span>
      <button
        type="button"
        class="btn"
        bind:this={moreBtn}
        data-bar-item={IDX.more}
        tabindex={rv === IDX.more ? 0 : -1}
        aria-haspopup="menu"
        aria-expanded={moreOpen}
        onclick={() => { moreRv = 0; moreOpen = !moreOpen; }}
      ><MoreIcon size={16} />{P.bulkMore}</button>
      <button type="button" class="btn ghost" data-bar-item={IDX.clear} tabindex={rv === IDX.clear ? 0 : -1} onclick={onclear}>{S.selClear}</button>
    {/if}
    <span class="pl-bgroup pl-levels" role="group" aria-label={P.bulkLevelGroup}>
      {#each LEVELS as l, i (l.key)}
        <button
          type="button"
          class="pl-lv"
          data-lv={l.key}
          data-bar-item={IDX.level(i)}
          tabindex={rv === IDX.level(i) ? 0 : -1}
          aria-label={P.bulkLevelBtn(l.label, app.state.limits[l.key], n)}
          onclick={() => applyLevel(l.key)}
          use:tip={{ title: l.label, lines: [S.levelPer(app.state.limits[l.key])] }}
        >
          <Meter level={l.key} decorative hideCount /><span class="pl-lvlabel">{l.label}</span>
        </button>
      {/each}
      {#if !narrow}
        <button
          type="button"
          class="btn"
          data-bar-item={IDX.reset}
          tabindex={rv === IDX.reset ? 0 : -1}
          aria-label={P.bulkResetBtn(n)}
          onclick={() => applyLevel(null)}
        >{S.levelDefault}</button>
      {/if}
    </span>
    {#if !narrow}
      <span class="pl-bgroup">
        <button type="button" class="btn" data-bar-item={IDX.weekend} tabindex={rv === IDX.weekend ? 0 : -1} onclick={pickWeekend}>{P.selectWeekend}</button>
        <button type="button" class="btn" data-bar-item={IDX.empty} tabindex={rv === IDX.empty ? 0 : -1} onclick={pickEmpty}>{P.selectEmpty}</button>
      </span>
      <span class="pl-grow"></span>
      <button
        type="button"
        class="btn ghost"
        data-bar-item={IDX.clear}
        tabindex={rv === IDX.clear ? 0 : -1}
        onclick={onclear}
        use:tip={{ title: S.selClear, kbd: 'Esc' }}
      >{S.selClear}</button>
    {/if}
  </div>
{/if}

<!-- 좁은 폭의 보조 동작. 팝오버는 뒤 화면에 inert 를 걸지 않으므로 강조색 채움 단추를 쓰지 않는다 -->
{#if narrow}
  <Layer bind:open={moreOpen} variant="popover" anchor={moreBtn ?? null} placement="top-end" label={P.bulkMoreLabel} role="menu" width="240px" initialFocus={() => moreBox?.querySelector<HTMLElement>('[tabindex="0"]') ?? null}>
    <div class="pl-more" bind:this={moreBox} role="presentation" onkeydown={onmorekey}>
      <button type="button" class="pl-mitem" role="menuitem" data-more-item tabindex={moreRv === 0 ? 0 : -1} onfocus={() => (moreRv = 0)} aria-label={P.bulkResetBtn(n)} onclick={() => moreDo(() => applyLevel(null))}>{S.levelDefault}</button>
      <button type="button" class="pl-mitem" role="menuitem" data-more-item tabindex={moreRv === 1 ? 0 : -1} onfocus={() => (moreRv = 1)} onclick={() => moreDo(pickWeekend)}>{P.selectWeekend}</button>
      <button type="button" class="pl-mitem" role="menuitem" data-more-item tabindex={moreRv === 2 ? 0 : -1} onfocus={() => (moreRv = 2)} onclick={() => moreDo(pickEmpty)}>{P.selectEmpty}</button>
    </div>
  </Layer>
{/if}

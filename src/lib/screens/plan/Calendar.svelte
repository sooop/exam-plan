<script lang="ts">
  // 준비 기간 달력: role=grid 한 개(탭 정지점 하나, 롤빙 tabindex) 안에 주 단위 행. 칸은 role=gridcell.
  // 키: ←→ 날짜, ↑↓ 주, Home·End 주의 처음·끝(Ctrl 은 기간), Enter 열기(선택 해제), Space 선택 토글, Shift+방향키 범위 선택, Ctrl/⌘+A 전체 선택.
  // 클릭: 일반 클릭은 선택을 풀고 그 날짜 상세를 연다, Ctrl/⌘+클릭 토글, Shift+클릭 범위, 칸의 선택 상자(터치용).
  // 선택은 app.ui.selected 에 둔다(하단 일괄 작업 막대는 PlanScreen 이 그린다).
  import { app } from '../../app/app.svelte';
  import { WD } from '../../app/strings';
  import { examDays } from '../../core/planner';
  import type { Exam, Task } from '../../core/types';
  import { isImeKey } from '../../ui/layerCore';
  import CalCell from './CalCell.svelte';
  import { gridMove, inDayOrder, isGridKey, mondayOf, rangeBetween, resolveClick, weekRows } from './logic';
  import { P } from './texts';

  interface Props {
    exam: Exam;
    days: string[];
    byDate: Record<string, Task[]>;
    today: string;
    /** 상세로 열려 있는 날짜 */
    viewIso: string;
    /** 넓은 폭에서만 '열린 칸' 표시를 한다(좁은 폭은 시트로 열고 닫는다) */
    showCurrent: boolean;
    onopen: (iso: string) => void;
    onchipdown: (e: PointerEvent, task: Task, fromHandle: boolean) => void;
    onchipmove: (task: Task, opener: HTMLElement) => void;
    onchipdone: (task: Task) => void;
    /** 선택이 바뀌었다(스크린리더 안내용) */
    onselect?: (count: number) => void;
  }
  let { exam, days, byDate, today, viewIso, showCurrent, onopen, onchipdown, onchipmove, onchipdone, onselect }: Props = $props();

  const rows = $derived(weekRows(days).map((cells) => ({ key: mondayOf(cells.find((c) => c)!), cells })));
  const examIdx = $derived(new Map(examDays(exam).map((d, i) => [d, i + 1])));
  const hintId = 'pl-grid-hint-' + Math.random().toString(36).slice(2, 7);
  const HEAD = [1, 2, 3, 4, 5, 6, 0];
  const EMPTY: Task[] = [];

  let gridEl: HTMLElement | undefined = $state();
  let focusIso = $state<string | null>(null);
  let anchor: string | null = null;
  // 롤빙 tabindex: 마지막으로 포커스를 받은 칸, 없으면 열린 날짜
  const tabIso = $derived(focusIso && days.includes(focusIso) ? focusIso : days.includes(viewIso) ? viewIso : days[0]);

  const cellOf = (iso: string): HTMLElement | null => gridEl?.querySelector<HTMLElement>('[data-date="' + iso + '"]') ?? null;

  /** 칸으로 포커스를 준다(오늘로 이동·포커스를 잃은 뒤의 되찾기) */
  export function focusCell(iso: string, scroll = true): boolean {
    focusIso = iso;
    const el = cellOf(iso);
    if (!el) return false;
    el.focus({ preventScroll: !scroll });
    return document.activeElement === el;
  }
  export function scrollToCell(iso: string, behavior: ScrollBehavior): void {
    cellOf(iso)?.scrollIntoView({ block: 'center', behavior });
  }
  /** 롤빙 정지점인 칸(마지막으로 포커스를 받은 칸)으로 포커스를 준다 */
  export function focusCurrent(): void {
    if (tabIso) focusCell(tabIso, false);
  }

  function applySelection(list: string[]) {
    const sel = app.ui.selected;
    const keep = new Set(list);
    for (const d of [...sel]) if (!keep.has(d)) sel.delete(d);
    for (const d of list) sel.add(d);
    onselect?.(sel.size);
  }

  function pick(iso: string, ctrl: boolean, shift: boolean) {
    const r = resolveClick(app.ui.selected, days, { iso, ctrl, shift, anchor });
    anchor = r.anchor;
    applySelection(r.selected);
    focusIso = iso;
    if (r.open) onopen(iso);
  }

  function activate(e: MouseEvent, iso: string) {
    pick(iso, e.ctrlKey || e.metaKey, e.shiftKey);
  }
  /** 선택 상자: 누르면 토글, Shift 는 범위를 더한다 */
  function check(e: MouseEvent, iso: string) {
    pick(iso, true, e.shiftKey);
  }

  async function onkeydown(e: KeyboardEvent) {
    if (isImeKey(e) || e.defaultPrevented) return;
    const el = e.target as HTMLElement;
    // 칸 자체에서 누른 키만 다룬다(칩의 키는 PlanScreen 이 처리한다)
    if (el.getAttribute('role') !== 'gridcell' || !el.dataset.date || e.altKey) return;
    const iso = el.dataset.date;
    const mod = e.ctrlKey || e.metaKey;
    if (isGridKey(e.key)) {
      e.preventDefault();
      const to = gridMove(days, iso, e.key, mod);
      if (!to) return;
      if (e.shiftKey && e.key !== 'Home' && e.key !== 'End') {
        const a = anchor && days.includes(anchor) ? anchor : iso;
        anchor = a;
        applySelection(rangeBetween(days, a, to));
      }
      focusCell(to);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      pick(iso, false, false);
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      pick(iso, true, e.shiftKey);
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      anchor = days[0] ?? null;
      applySelection(inDayOrder(days, days));
    }
  }

  // 시험이 바뀌어 포커스를 둔 칸이 사라지면 다시 계산한다(tabIso 가 처리). 선택 중 범위 밖 날짜는 정리한다
  $effect(() => {
    const keep = new Set(days);
    const sel = app.ui.selected;
    for (const d of [...sel]) if (!keep.has(d)) sel.delete(d);
  });
</script>

<div class="pl-calwrap">
  <p class="sr-only" id={hintId}>{P.gridKeys}</p>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_interactive_supports_focus -->
  <div role="grid" class="pl-grid" aria-label={P.gridLabel} aria-describedby={hintId} aria-multiselectable="true" bind:this={gridEl} {onkeydown}>
    <div role="row" class="pl-row pl-head">
      {#each HEAD as wd (wd)}<div role="columnheader" class="pl-wh" data-w={wd}>{WD[wd]}</div>{/each}
    </div>
    {#each rows as row (row.key)}
      <div role="row" class="pl-row">
        {#each row.cells as iso, ci (iso ?? 'pad' + ci)}
          {#if iso}
            <CalCell
              {iso}
              {exam}
              list={byDate[iso] ?? EMPTY}
              first={days[0]}
              {today}
              examN={examIdx.get(iso) ?? 0}
              selected={app.ui.selected.has(iso)}
              current={showCurrent && viewIso === iso}
              tabbable={tabIso === iso}
              onactivate={activate}
              oncheck={check}
              onfocuscell={(d) => (focusIso = d)}
              {onchipdown}
              {onchipmove}
              {onchipdone}
            />
          {:else}
            <div role="gridcell" class="pl-cell pad" aria-label={P.padCell} aria-hidden="true"></div>
          {/if}
        {/each}
      </div>
    {/each}
  </div>
</div>

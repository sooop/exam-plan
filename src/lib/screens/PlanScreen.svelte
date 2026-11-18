<!-- props 없음, app 스토어를 직접 사용한다(src/lib/app/app.svelte.ts 의 app).
     준비 계획 탭: 상단 도구줄(보관함·직전 리캡·오늘) · 지연 배너(이월) · 달력(role=grid) + 날짜 상세(DayCard) · 보관함 · 일괄 작업 막대.
     기준 폭은 900px 하나: 넓으면 우측 상세 고정, 좁으면 날짜를 눌러 하단 시트(Layer)에 같은 DayCard. 세부 구현은 src/lib/screens/plan/.
     주 동작(강조색 채움 단추)은 '오늘로 이월' 하나뿐이다. -->
<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Archive from '@lucide/svelte/icons/archive';
  import { app } from '../app/app.svelte';
  import { ICON } from '../app/icons';
  import { S, T2, fmtFull, fmtMD } from '../app/strings';
  import { todayISO } from '../core/dates';
  import { carryOver, getExam, overdue, prepDays, unplaced } from '../core/planner';
  import type { Task } from '../core/types';
  import { Motion } from '../motion/motion';
  import { slideFx } from '../motion/motion.svelte';
  import { isImeKey } from '../ui/layerCore';
  import Layer from '../ui/Layer.svelte';
  import { moveTasksTo, toggleTaskDone } from './shared/actions';
  import DatePickerSheet from './shared/DatePickerSheet.svelte';
  import DayCard from './shared/DayCard.svelte';
  import { chipInfo } from './shared/logic';
  import './plan/plan.css';
  import BulkBar from './plan/BulkBar.svelte';
  import Calendar from './plan/Calendar.svelte';
  import { createPlanDrag } from './plan/drag';
  import { isMoveArrow, keyMoveDate, tasksByDateSorted } from './plan/logic';
  import { openerFor, regionOf, rescueFocus, subjectFor, type Region } from './plan/ops';
  import RecapPanel from './plan/RecapPanel.svelte';
  import { P } from './plan/texts';
  import Vault from './plan/Vault.svelte';

  const NARROW = '(max-width: 900px)';

  const ex = $derived(app.cur());
  const days = $derived(ex ? prepDays(ex) : []);
  // 날짜별 할일은 한 번만 만든다(칸마다 다시 걸러내지 않는다)
  const byDate = $derived(ex ? tasksByDateSorted(ex.tasks) : {});
  const loose = $derived(ex ? unplaced(ex) : []);
  const today = todayISO();
  const od = $derived(ex ? overdue(ex, today) : []);
  /** 날짜 상세로 보이는 날: 연 날짜 → 오늘 → 첫 날 */
  const viewIso = $derived.by(() => {
    const o = app.ui.openDayIso;
    if (o && days.includes(o)) return o;
    return days.includes(today) ? today : (days[0] ?? '');
  });

  let narrow = $state(typeof matchMedia === 'function' && matchMedia(NARROW).matches);
  let vaultOpen = $state(!(typeof matchMedia === 'function' && matchMedia(NARROW).matches));
  let recapOpen = $state(false);
  let sheetOpen = $state(false);
  let announce = $state('');
  let root: HTMLElement | undefined = $state();
  let cal: ReturnType<typeof Calendar> | undefined = $state();
  let recapBtn: HTMLButtonElement | undefined = $state();

  // 한 기준 폭(900px)만 본다. 넓어지면 시트는 닫는다(상세는 우측 패널이 맡는다)
  $effect(() => {
    const mq = matchMedia(NARROW);
    narrow = mq.matches;
    const on = (e: MediaQueryListEvent) => {
      narrow = e.matches;
      if (!e.matches) sheetOpen = false;
    };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });

  /** 스크린리더 안내(같은 문구가 이어져도 다시 읽히게 한 번 비운다) */
  function say(text: string) {
    announce = '';
    requestAnimationFrame(() => (announce = text));
  }

  const cellOf = (iso: string): HTMLElement | null => root?.querySelector<HTMLElement>('.pl-cell[data-date="' + iso + '"]') ?? null;

  // ───────── 이동 뒤 포커스·안내 ─────────
  function afterMove(id: string, region: Region | null, to: string | null) {
    if (!root) return;
    rescueFocus(root, id, [region, 'cal', 'day', 'vault'], () => (to ? cellOf(to) : (root?.querySelector<HTMLElement>('[data-vault-toggle]') ?? null)));
  }
  /** 키보드·시트로 옮겼을 때 받는 칸(없으면 보관함 단추)이 한 번 튕겨 받았음을 알린다(끌기는 착지 연출이 대신한다) */
  function receive(to: string | null) {
    void tick().then(() => Motion.pulse(to ? cellOf(to) : (root?.querySelector<HTMLElement>('[data-vault-toggle]') ?? null)));
  }
  function onDragMoved(id: string, to: string | null) {
    const e = app.cur();
    const t = e?.tasks.find((x) => x.id === id);
    if (!e || !t) return;
    const text = chipInfo(e, t, subjectFor(e, t).name).text;
    say(to ? P.movedTo(text, fmtFull(to)) : P.movedToVault(text));
    afterMove(id, null, to);
  }

  const drag = createPlanDrag({
    root: () => root,
    exam: () => app.cur(),
    days: () => days,
    vaultOpen: () => vaultOpen,
    setVaultOpen: (v) => (vaultOpen = v),
    onMoved: onDragMoved,
  });
  // 끄는 사이 데이터가 바뀌면(되돌리기·원격 갱신) 끌기를 버린다
  $effect(() => {
    void app.state.updatedAt;
    drag.tokenChanged();
  });
  onDestroy(() => drag.dispose());

  /** 끌기 직후의 click 이 완료 토글·날짜 열기로 번지지 않게 한다 */
  function guardClick(e: MouseEvent) {
    if (drag.justDragged()) {
      e.stopPropagation();
      e.preventDefault();
    }
  }

  // ───────── 열기·선택 ─────────
  function open(iso: string) {
    app.ui.openDayIso = iso;
    if (narrow) sheetOpen = true;
  }
  function clearSel() {
    const inBar = !!document.activeElement?.closest('.pl-bar');
    app.clearSelection();
    say(P.selectedAnnounce(0));
    // 막대 안에 있던 포커스가 body 로 떨어지지 않게 칸으로 돌린다
    if (inBar) cal?.focusCurrent();
  }
  function goToday() {
    if (!days.includes(today)) return;
    app.ui.openDayIso = today;
    cal?.scrollToCell(today, Motion.on() && !Motion.reduced() ? 'smooth' : 'auto');
    cal?.focusCell(today, false);
  }

  // ───────── 칩 동작 ─────────
  function chipDone(t: Task) {
    if (!ex || drag.justDragged()) return;
    toggleTaskDone(ex.id, t.id);
  }
  let pickIds = $state<string[]>([]);
  let pickOpen = $state(false);
  let pickOpener = $state<HTMLElement | null>(null);
  function chipMove(t: Task, opener: HTMLElement) {
    pickIds = [t.id];
    pickOpener = openerFor(opener);
    pickOpen = true;
  }
  function picked(to: string | null) {
    const e = app.cur();
    const id = pickIds[0];
    const t = e?.tasks.find((x) => x.id === id);
    if (!e || !t) return;
    const text = chipInfo(e, t, subjectFor(e, t).name).text;
    if (moveTasksTo(e.id, pickIds, to) > 0) {
      say(to ? P.movedTo(text, fmtFull(to)) : P.movedToVault(text));
      afterMove(id, null, to);
      receive(to);
    }
  }

  // ───────── 키보드 ─────────
  /** 칩에서 Alt+←/→(전날·다음날), Alt+↑/↓(전주·다음주) */
  function moveByKey(e: KeyboardEvent) {
    const exam = app.cur();
    const chip = (e.target as Element | null)?.closest<HTMLElement>('[data-task-id]');
    const t = exam?.tasks.find((x) => x.id === chip?.dataset.taskId);
    if (!exam || !chip || !t) return;
    e.preventDefault();
    const to = keyMoveDate(days, t.date, e.key);
    if (!to) return;
    const region = regionOf(chip);
    const text = chipInfo(exam, t, subjectFor(exam, t).name).text;
    if (moveTasksTo(exam.id, [t.id], to) < 1) return;
    say(P.movedTo(text, fmtFull(to)));
    afterMove(t.id, region, to);
    receive(to);
  }
  function rootKey(e: KeyboardEvent) {
    if (isImeKey(e) || e.defaultPrevented || !ex) return;
    if (e.key === 'Escape') {
      // Esc 는 안쪽부터 한 단계씩: 선택 해제
      if (app.ui.selected.size > 0) {
        e.preventDefault();
        e.stopPropagation();
        clearSel();
      }
      return;
    }
    if (isMoveArrow(e)) moveByKey(e);
  }

  // ───────── 이월 ─────────
  function carry() {
    const e = app.cur();
    if (!e) return;
    const r = app.mutate(
      P.mutCarry,
      (s) => {
        const x = getExam(s, e.id);
        return x ? carryOver(x, today) : { moved: 0, target: null as string | null };
      },
      { big: true },
    );
    if (r.moved <= 0 || !r.target) return;
    const target = r.target;
    app.toastUndo(S.carried(r.moved, fmtMD(target)));
    app.ui.openDayIso = target;
    // 이월 단추가 있던 배너는 닫히는 연출 뒤에 사라지므로 포커스를 먼저 받은 칸으로 옮긴다
    if (document.activeElement?.closest('.pl-banner')) cal?.focusCell(target, false);
    // 배너가 사라지며 포커스가 body 로 떨어지지 않게 받은 칸으로 옮기고 pulse 로 알린다
    void tick().then(() => {
      requestAnimationFrame(() => {
        const a = document.activeElement;
        if (!a || a === document.body || !a.isConnected) cal?.focusCell(target, false);
        Motion.pulse(cellOf(target));
      });
    });
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section aria-label={S.tabs.board} class="pl-root" bind:this={root} tabindex="-1" onkeydown={rootKey} onclickcapture={guardClick}>
  <p class="sr-only" role="status" aria-live="polite">{announce}</p>
  {#if !ex}
    <div class="pl-empty">
      <h2>{T2.noExamTitle}</h2>
      <p class="muted">{S.noExam}</p>
      <button type="button" class="btn" onclick={() => app.setTab('exam')}>{S.goExam}</button>
    </div>
  {:else if !days.length}
    <div class="pl-empty">
      <h2>{P.noPrepTitle}</h2>
      <p class="muted">{P.noPrepBody}</p>
      <button type="button" class="btn" onclick={() => app.setTab('exam')}>{S.goExam}</button>
    </div>
  {:else}
    {#key ex.id}
      {#if od.length}
        <div class="pl-banner" transition:slideFx>
          <b>{S.overdue(od.length)}</b>
          {#if today <= ex.end}<button type="button" class="btn primary" onclick={carry}>{S.carry}</button>{/if}
        </div>
      {/if}

      <div class="pl-toolbar" role="group" aria-label={P.toolbarLabel}>
        <button
          type="button"
          class="btn"
          data-vault-toggle
          aria-expanded={vaultOpen}
          aria-controls="pl-vault"
          aria-label={P.vaultToggleLabel(loose.length)}
          onclick={() => (vaultOpen = !vaultOpen)}
        >
          <Archive size={16} />{P.vaultToggle}<span class="pl-badge num" aria-hidden="true">{loose.length}</span>
        </button>
        <button
          type="button"
          class="btn"
          bind:this={recapBtn}
          aria-expanded={recapOpen}
          aria-controls="pl-recap"
          onclick={() => (recapOpen = !recapOpen)}
        >
          <ICON.rotateCcw size={16} />{P.recapToggle}
        </button>
        <span class="pl-grow"></span>
        {#if days.includes(today)}
          <button type="button" class="btn" onclick={goToday}>{S.jumpToday}</button>
        {/if}
      </div>

      <RecapPanel
        exam={ex}
        open={recapOpen}
        onclose={() => {
          recapOpen = false;
          recapBtn?.focus();
        }}
      />

      <div class="pl-board">
        <Calendar
          bind:this={cal}
          exam={ex}
          {days}
          {byDate}
          {today}
          {viewIso}
          showCurrent={!narrow}
          onopen={open}
          onchipdown={drag.start}
          onchipmove={chipMove}
          onchipdone={chipDone}
          onselect={(n) => say(P.selectedAnnounce(n))}
        />
        <aside class="pl-side" aria-label={P.detailLabel}>
          {#if !narrow}
            <div class="pl-card pl-dayhost" data-region="day" data-drop-day={viewIso}>
              <DayCard iso={viewIso} exam={ex} headingLevel={2} ontaskpointerdown={drag.start} />
            </div>
          {/if}
          <Vault exam={ex} {loose} open={vaultOpen} onchipdown={drag.start} onchipmove={chipMove} onchipdone={chipDone} />
        </aside>
      </div>

      <BulkBar exam={ex} {days} {byDate} onclear={clearSel} onselect={(n) => say(P.selectedAnnounce(n))} />

      {#if narrow}
        <Layer bind:open={sheetOpen} variant="sheet" label={P.sheetLabel(fmtFull(viewIso))}>
          <DayCard iso={viewIso} exam={ex} />
        </Layer>
      {/if}
      <DatePickerSheet bind:open={pickOpen} exam={ex} taskIds={pickIds} opener={pickOpener} onpick={picked} />
    {/key}
  {/if}
</section>

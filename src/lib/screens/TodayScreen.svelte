<!-- props 없음, app 스토어를 직접 사용한다(src/lib/app/app.svelte.ts 의 app).
     오늘 탭: 시험 머리말(D-day)과 전체 진행률, 지연 할일(이월), 오늘 할일, 다음 할일, 과목별 진행.
     구역 나누기는 today/logic.ts, 변경·연출·포커스는 today/ops.ts, 할일 한 줄은 today/TodayRow.svelte. -->
<script lang="ts">
  import { app } from '../app/app.svelte';
  import { S, T2, fmtFull } from '../app/strings';
  import { progress, subProgress, subjectOf } from '../core/planner';
  import { todayISO } from '../core/dates';
  import type { Task } from '../core/types';
  import ProgressBar from './shared/ProgressBar.svelte';
  import DatePickerSheet from './shared/DatePickerSheet.svelte';
  import TodayRow from './today/TodayRow.svelte';
  import { bodyMessage, classify } from './today/logic';
  import { doCarry, doMove, doToggle, ctxOf, type FocusCtx } from './today/ops';
  import { TT } from './today/texts';

  const ex = $derived(app.cur());
  const view = $derived(ex ? classify(ex, todayISO()) : null);
  const prog = $derived(ex ? progress(ex) : null);

  let root: HTMLElement | undefined = $state();

  /** 날짜 옮기기 시트 상태. 시트는 화면에 하나만 두고, 연 행의 단추를 opener 로 넘겨 닫힌 뒤 포커스를 돌려받게 한다 */
  let pickOpen = $state(false);
  let pickIds = $state.raw<string[]>([]);
  let pickOpener = $state.raw<HTMLElement | null>(null);
  let pickCtx: FocusCtx = { list: null, index: -1 };

  const curId = (): string | null => app.cur()?.id ?? null;

  function onToggle(t: Task, row: HTMLElement) {
    const id = curId();
    if (root && id) doToggle(root, id, t.id, row);
  }
  function onMove(t: Task, opener: HTMLElement) {
    pickCtx = ctxOf(opener);
    pickIds = [t.id];
    pickOpener = opener;
    pickOpen = true;
  }
  function onPick(iso: string | null) {
    const id = curId();
    const taskId = pickIds[0];
    if (root && id && taskId) doMove(root, id, taskId, iso, pickCtx);
  }
  function onCarry() {
    const id = curId();
    if (root && id) doCarry(root, id, todayISO());
  }
  function createExam() {
    app.ui.creating = true;
    app.setTab('exam');
  }
</script>

<section class="today" aria-label={S.tabs.today} bind:this={root} tabindex="-1">
  {#if ex && view && prog}
    <header class="head">
      <p class="name muted">{ex.name}</p>
      <p class="dday num">{view.ddayText}</p>
      {#if prog.total > 0}
        <div class="overall">
          <ProgressBar done={prog.done} total={prog.total} label={TT.overall} showPercent />
        </div>
      {/if}
    </header>

    {#if view.overdue.length > 0}
      <div class="block" role="region" aria-labelledby="today-overdue-title">
        <div class="block-head">
          <h2 id="today-overdue-title" class="sec">{S.overdue(view.overdue.length)}</h2>
          {#if view.canCarry}
            <button type="button" class="btn primary" onclick={onCarry}>{S.carry}</button>
          {/if}
        </div>
        <ul class="rows" data-list="overdue" data-flip aria-labelledby="today-overdue-title">
          {#each view.overdue as t (t.id)}
            <TodayRow task={t} exam={ex} ontoggle={onToggle} onmove={onMove} />
          {/each}
        </ul>
      </div>
    {/if}

    <section class="block" aria-labelledby="today-title">
      <h2 id="today-title" class="sec">{S.today} {fmtFull(todayISO())}</h2>
      {#if view.body === 'today'}
        <ul class="rows" data-list="today" data-flip aria-labelledby="today-title">
          {#each view.todays as t (t.id)}
            <TodayRow task={t} exam={ex} ontoggle={onToggle} onmove={onMove} />
          {/each}
        </ul>
      {:else}
        <p class="muted">{bodyMessage(view.body, ex)}</p>
        {#if view.body !== 'afterExam'}
          <button type="button" class="btn" onclick={() => app.setTab('board')}>{S.goBoard}</button>
        {/if}
      {/if}
    </section>

    {#if view.upcoming.length > 0}
      <section class="block" aria-labelledby="today-upcoming-title">
        <h2 id="today-upcoming-title" class="sec">{S.upcoming}</h2>
        {#each view.upcoming as g (g.iso)}
          <div class="day">
            <h3 id={'today-up-' + g.iso} class="dayh num">{fmtFull(g.iso)}</h3>
            <ul class="rows" data-list={'day-' + g.iso} data-flip aria-labelledby={'today-up-' + g.iso}>
              {#each g.tasks as t (t.id)}
                <TodayRow task={t} exam={ex} ontoggle={onToggle} onmove={onMove} />
              {/each}
            </ul>
          </div>
        {/each}
      </section>
    {/if}

    {#if ex.subs.length > 0}
      <section class="block" aria-labelledby="today-subjects-title">
        <h2 id="today-subjects-title" class="sec">{S.subjects}</h2>
        <ul class="subs">
          {#each ex.subs as es (es.id)}
            {@const sj = subjectOf(app.state, es)}
            {@const sp = subProgress(ex, es)}
            <li class="sub">
              <p class="sub-name" style:--c={sj.color}><span class="dot" aria-hidden="true"></span><span class="ellip">{sj.name}</span></p>
              <ProgressBar done={sp.done} total={sp.total} label={sj.name} color={sj.color} />
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <!-- 항상 마운트해 둔다(닫는 연출과 포커스 복귀는 시트가 살아 있어야 한다). 열림은 pickOpen 이 정한다 -->
    <DatePickerSheet bind:open={pickOpen} exam={ex} taskIds={pickIds} opener={pickOpener} onpick={onPick} />
  {:else if app.state.exams.length === 0}
    <div class="empty">
      <h2>{T2.noExamTitle}</h2>
      <p class="muted">{S.noExam}</p>
      <button type="button" class="btn primary" onclick={createExam}>{TT.createExam}</button>
    </div>
  {:else}
    <div class="empty">
      <p class="muted">{TT.noActive}</p>
      <button type="button" class="btn" onclick={() => app.setTab('exam')}>{S.goExam}</button>
    </div>
  {/if}
</section>

<style>
  .today { display: grid; gap: 16px; max-width: 760px; min-width: 0; }
  .today:focus { outline: none; }
  .head { display: grid; gap: 6px; min-width: 0; }
  .name { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
  .dday { margin: 0; font-size: 28px; font-weight: 700; font-family: var(--mono); }
  .overall { margin-top: 4px; }
  .num { font-variant-numeric: tabular-nums; }
  .block { display: grid; gap: 8px; min-width: 0; }
  .block-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .sec { margin: 0; font-size: 16px; font-weight: 700; }
  .rows { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; min-width: 0; }
  .day { display: grid; gap: 4px; min-width: 0; }
  .dayh { margin: 0; font-size: 13px; font-weight: 600; color: var(--muted); }
  .subs { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; min-width: 0; }
  .sub { display: grid; gap: 4px; min-width: 0; }
  .sub-name { display: flex; align-items: center; gap: 6px; margin: 0; min-width: 0; font-size: 14px; }
  .sub-name .ellip { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--c, var(--muted)); }
  .empty { display: grid; gap: 10px; justify-items: start; padding: 16px 0; }
  .empty h2 { margin: 0; font-size: 18px; }
  .empty p { margin: 0; }
</style>

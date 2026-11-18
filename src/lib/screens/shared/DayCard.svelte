<script lang="ts">
  // 날짜 상세 본문: 날짜 제목·태그, 바쁨 정도 칩, 메모 단추, 개수/권장, 그 날의 할일 칩 목록, 완료·이월 요약.
  // 우측 고정 패널과 하단 시트가 같은 컴포넌트를 쓴다(바깥 틀은 부모 몫). app 을 직접 읽으므로 변경이 알아서 반영된다.
  // 할일 칩의 끌기는 부모가 ontaskpointerdown 으로 연결한다. 날짜 옮기기 시트(DatePickerSheet)는 이 안에 하나 있다.
  // 부모가 이 날짜 칸을 끌어 놓기 대상으로 삼을 수 있게 루트에 data-date·data-day-drop 이 있다.
  import { flushSync } from 'svelte';
  import { app } from '../../app/app.svelte';
  import { ICON } from '../../app/icons';
  import { S, WD, fmtMD } from '../../app/strings';
  import { PALETTE, dayInfo, examDays, holidayName, overdue, subjectOf, todayISO, weekday } from '../../core';
  import type { Exam, Task } from '../../core/types';
  import { moveTasksTo, toggleTaskDone } from './actions';
  import DatePickerSheet from './DatePickerSheet.svelte';
  import LevelChip from './LevelChip.svelte';
  import { daySummary } from './logic';
  import Meter from './Meter.svelte';
  import MemoButton from './MemoButton.svelte';
  import TaskChip from './TaskChip.svelte';
  import { neighborIndex } from '../../ui/layerCore';
  import { layerStack } from '../../ui/layerStack.svelte';
  import { T } from './texts';

  interface Props {
    iso: string;
    exam: Exam;
    /** 할일 칩 안의 pointerdown(옮기기 단추 제외). 부모가 DragSession 을 시작한다. fromHandle: 손잡이에서 눌렀는가 */
    ontaskpointerdown?: (e: PointerEvent, task: Task, fromHandle: boolean) => void;
    /** 제목 요소의 헤딩 수준(기본 3) */
    headingLevel?: 2 | 3 | 4;
    /** 루트 요소(끌어 놓기 대상 판정·강조용) */
    element?: HTMLElement;
  }
  let { iso, exam, ontaskpointerdown, headingLevel = 3, element = $bindable() }: Props = $props();

  const WarnIcon = ICON.triangleAlert;
  const today = $derived(todayISO());
  const info = $derived(dayInfo(app.state, exam, iso));
  const w = $derived(weekday(iso));
  const hol = $derived(holidayName(exam, iso));
  const exIdx = $derived(examDays(exam).indexOf(iso) + 1);
  const examSubs = $derived(exam.subs.filter((x) => x.examDate === iso).map((x) => subjectOf(app.state, x).name).join(', '));
  const mine = $derived(
    exam.tasks.filter((t) => t.date === iso).sort((a, b) => a.esId.localeCompare(b.esId) || a.type.localeCompare(b.type) || a.seq - b.seq),
  );
  const sum = $derived(daySummary(mine, iso, today));
  const lateCount = $derived(iso === today ? overdue(exam, today).length : 0);
  const titleId = 'daycard-' + Math.random().toString(36).slice(2, 8);

  function subjectFor(t: Task): { name: string; color: string } {
    const es = exam.subs.find((s) => s.id === t.esId);
    return es ? subjectOf(app.state, es) : { name: T.noName, color: PALETTE[7] };
  }

  let moveIds = $state<string[]>([]);
  let moveOpen = $state(false);
  let moveOpener = $state<HTMLElement | null>(null);
  /** 연 칩의 칸 번호: 칩이 사라지면 같은 번호의 이웃 칩으로 포커스를 옮긴다 */
  let moveIdx = -1;
  const chipButtons = (): HTMLElement[] => [...(element?.querySelectorAll<HTMLElement>('.chips li button.main') ?? [])];
  function openMove(t: Task, opener: HTMLElement) {
    moveIdx = mine.findIndex((x) => x.id === t.id);
    moveIds = [t.id];
    moveOpener = opener;
    moveOpen = true;
  }
  function picked(to: string | null) {
    const idx = moveIdx;
    flushSync(() => { moveTasksTo(exam.id, moveIds, to); });
    // 시트가 닫힐 때 연 단추가 사라졌으면: 같은 날의 이웃 칩, 칩이 없으면 날짜 칸 머리(이 구역의 루트)
    layerStack.offerRestore(() => {
      const btns = chipButtons();
      const i = neighborIndex(idx, btns.length);
      return i >= 0 ? btns[i] : (element ?? null);
    });
  }
</script>

<section class="day" tabindex="-1" bind:this={element} data-date={iso} data-day-drop data-level={info.level} data-over={info.over ? '' : undefined} aria-labelledby={titleId}>
  <div class="dh">
    <svelte:element this={'h' + headingLevel} class="date" id={titleId} data-hol={hol ? '' : undefined}>
      {fmtMD(iso)}<span class="wd">{WD[w]}</span>
    </svelte:element>
    {#if iso === today}<span class="tag today">{S.today}</span>{/if}
    {#if hol}<span class="tag">{hol}</span>{/if}
    {#if exIdx}<span class="tag">{S.examDayN(exIdx)}</span>{/if}
    <span class="grow"></span>
    <LevelChip {exam} {iso} />
  </div>
  <div class="dh">
    <MemoButton {exam} {iso} />
    <span class="grow"></span>
    <span class="cnt"><Meter level={info.level} count={info.count} limit={info.limit} decorative /></span>
  </div>
  {#if exIdx && examSubs}<div class="eline">{examSubs}</div>{/if}

  {#if mine.length}
    <ul class="chips" aria-label={T.dayListLabel(fmtMD(iso))}>
      {#each mine as t (t.id)}
        <li>
          <TaskChip
            task={t}
            {exam}
            subject={subjectFor(t)}
            onToggleDone={(task) => toggleTaskDone(exam.id, task.id)}
            onMove={openMove}
            onpointerdown={ontaskpointerdown}
          />
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty muted">{T.dayEmpty}</p>
  {/if}

  <p class="sum muted">
    {#if sum.total}<span class="num">{T.dayDoneSummary(sum.done, sum.total)}</span>{/if}
    {#if sum.past && sum.total}
      <span class="late" data-late={sum.unfinished ? '' : undefined}>
        {#if sum.unfinished}<WarnIcon size={13} />{/if}{sum.unfinished ? T.dayUnfinishedPast(sum.unfinished) : T.dayAllDonePast}
      </span>
    {/if}
    {#if lateCount}<span class="late" data-late><WarnIcon size={13} />{S.overdue(lateCount)}</span>{/if}
  </p>
</section>

<DatePickerSheet bind:open={moveOpen} {exam} taskIds={moveIds} opener={moveOpener} onpick={picked} />

<style>
  .day { display: grid; gap: 8px; min-width: 0; }
  .day:focus { outline: none; }
  .dh { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
  .grow { flex: 1; }
  .date { min-width: 0; margin: 0; font-size: 18px; }
  .date[data-hol] { color: var(--red-text); }
  .wd { margin-left: 4px; font-size: 14px; color: var(--muted); font-weight: 500; }
  .tag { font-size: 12px; padding: 0 7px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); line-height: 20px; white-space: nowrap; }
  .tag.today { border-color: var(--focus); color: var(--accent-text); font-weight: 600; }
  .eline { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; min-height: 28px; }
  .chips li { min-width: 0; max-width: 100%; display: flex; }
  .empty { font-size: 13px; }
  .sum { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 12px; margin: 0; }
  .late { display: inline-flex; align-items: center; gap: 4px; }
  .late[data-late] { color: var(--red-text); font-weight: 600; }
</style>

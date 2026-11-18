<script lang="ts">
  // 달력 칸 하나: 요약만 보인다(날짜 번호·휴일·시험 일차·메모·바쁨 정도 Meter(개수/권장)·할일 칩 또는 점). 상세는 DayCard 하나가 맡는다.
  // role=gridcell. 접근성 이름은 칸의 정보 전체('6월 3일 화, 할일 4개 중 2개 완료, 바쁨 보통, 메모 있음').
  // 칩은 TaskChip(compact). 칩 안의 버튼은 탭 정지점에서 뺀다(격자 전체가 정지점 하나).
  import { app } from '../../app/app.svelte';
  import { ICON } from '../../app/icons';
  import { S, levelLabel } from '../../app/strings';
  import { dayInfo, holidayName } from '../../core/planner';
  import { weekday } from '../../core/dates';
  import type { Exam, Task } from '../../core/types';
  import { tip } from '../../ui/tip';
  import Meter from '../shared/Meter.svelte';
  import { dayFill } from '../shared/logic';
  import TaskChip from '../shared/TaskChip.svelte';
  import { cellLabel, cellNumber, koDate } from './logic';
  import { quietTabs, subjectFor } from './ops';
  import { P } from './texts';

  interface Props {
    iso: string;
    exam: Exam;
    /** 이 날짜의 할일(정렬된 것) */
    list: Task[];
    /** 준비 기간의 첫 날(칸 머리 숫자 표기용) */
    first: string;
    today: string;
    /** 시험 n일차(0 이면 시험일이 아님) */
    examN: number;
    selected: boolean;
    /** 날짜 상세로 열려 있는 칸(넓은 폭의 우측 패널) */
    current: boolean;
    /** 롤빙 tabindex 0 인 칸 */
    tabbable: boolean;
    onactivate: (e: MouseEvent, iso: string) => void;
    oncheck: (e: MouseEvent, iso: string) => void;
    onfocuscell: (iso: string) => void;
    onchipdown: (e: PointerEvent, task: Task, fromHandle: boolean) => void;
    onchipmove: (task: Task, opener: HTMLElement) => void;
    onchipdone: (task: Task) => void;
  }
  let { iso, exam, list, first, today, examN, selected, current, tabbable, onactivate, oncheck, onfocuscell, onchipdown, onchipmove, onchipdone }: Props = $props();

  const NoteIcon = ICON.stickyNote;
  const info = $derived(dayInfo(app.state, exam, iso, { [iso]: list }));
  const hol = $derived(holidayName(exam, iso));
  const note = $derived(exam.days[iso]?.note ?? '');
  const done = $derived(list.filter((t) => t.done).length);
  const w = $derived(weekday(iso));
  const label = $derived(
    cellLabel({ iso, count: info.count, done, levelLabel: levelLabel(info.level), over: info.over, limit: info.limit, note: !!note, holiday: hol, examDay: examN, today: iso === today }),
  );

  function click(e: MouseEvent) {
    // 칩·선택 상자의 클릭은 그 동작이 처리한다
    if ((e.target as Element).closest('.chip, .pl-selbox')) return;
    onactivate(e, iso);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  role="gridcell"
  class="pl-cell"
  data-region="cal"
  data-date={iso}
  data-drop-day={iso}
  data-level={info.level}
  data-over={info.over ? '' : undefined}
  data-today={iso === today ? '' : undefined}
  data-past={iso < today ? '' : undefined}
  data-sel={selected ? '' : undefined}
  data-cur={current ? '' : undefined}
  aria-selected={selected}
  aria-current={iso === today ? 'date' : undefined}
  aria-label={label}
  tabindex={tabbable ? 0 : -1}
  style:--fill={dayFill(info.count, info.limit).toFixed(2)}
  onclick={click}
  onfocusin={() => onfocuscell(iso)}
>
  <div class="pl-ch">
    <label class="pl-selbox">
      <input type="checkbox" tabindex="-1" checked={selected} aria-label={P.selectDay(koDate(iso))} onclick={(e) => { e.stopPropagation(); oncheck(e, iso); }} />
    </label>
    <span class="pl-num" data-w={w} data-hol={hol ? '' : undefined} aria-hidden="true">{cellNumber(iso, first)}</span>
    {#if hol}<span class="pl-hn" aria-hidden="true">{hol}</span>{/if}
    {#if examN}<span class="pl-hn ex" aria-hidden="true">{S.examDayN(examN)}</span>{/if}
    <span class="pl-grow"></span>
    {#if note}<span class="pl-mi" aria-hidden="true" use:tip={note}><NoteIcon size={13} /></span>{/if}
  </div>
  <div class="pl-meter" aria-hidden="true"><Meter level={info.level} count={info.count} limit={info.limit} decorative size="sm" /></div>
  {#if list.length}
    <div class="pl-chips" use:quietTabs>
      {#each list as t (t.id)}
        <TaskChip
          task={t}
          {exam}
          subject={subjectFor(exam, t)}
          compact
          onToggleDone={onchipdone}
          onMove={onchipmove}
          onpointerdown={onchipdown}
        />
      {/each}
    </div>
    <div class="pl-dots" aria-hidden="true">
      {#each list as t (t.id)}<i style:--c={subjectFor(exam, t).color} data-done={t.done ? '' : undefined}></i>{/each}
    </div>
  {/if}
</div>

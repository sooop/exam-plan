
<script lang="ts">
  // 오늘 탭의 할일 한 줄: 공용 할일 칩(완료 토글 단추 + 날짜 옮기기 단추) + 날짜.
  // 완료·옮기기의 변경과 포커스는 부모(TodayScreen → ops.ts)가 맡는다. 이 파일은 그리기만 한다.
  import { app } from '../../app/app.svelte';
  import { fmtFull } from '../../app/strings';
  import { subjectOf } from '../../core/planner';
  import type { Exam, Task } from '../../core/types';
  import TaskChip from '../shared/TaskChip.svelte';
  import { TT } from './texts';

  interface Props {
    task: Task;
    exam: Exam;
    ontoggle: (task: Task, row: HTMLElement) => void;
    onmove: (task: Task, opener: HTMLElement) => void;
  }
  let { task, exam, ontoggle, onmove }: Props = $props();

  let row: HTMLLIElement | undefined = $state();

  /** 과목이 없는 할일(손상된 데이터)은 이름 없음으로 그린다. 색은 토큰으로만 */
  const subject = $derived.by(() => {
    const es = exam.subs.find((s) => s.id === task.esId);
    return es ? subjectOf(app.state, es) : { name: TT.noSubject, color: 'var(--muted)' };
  });
</script>

<li class="row" data-row data-task-id={task.id} bind:this={row}>
  <div class="cell">
    <TaskChip
      {task}
      {exam}
      {subject}
      onToggleDone={(t) => { if (row) ontoggle(t, row); }}
      onMove={(t, opener) => onmove(t, opener)}
    />
  </div>
  <span class="when">{task.date ? fmtFull(task.date) : TT.noDate}</span>
</li>

<style>
  .row { display: flex; align-items: center; gap: 8px; min-width: 0; list-style: none; }
  .cell { flex: 1 1 auto; min-width: 0; display: flex; }
  .cell :global(.chip) { flex: 1 1 auto; min-width: 0; }
  .when { flex: none; font-size: 13px; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
</style>

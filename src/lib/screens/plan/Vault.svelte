<script lang="ts">
  // 보관함: 날짜가 없는 할일(미배치)을 과목별로 보여 주고, 놓기 대상이 된다. 접기·펼치기는 Motion.slide(hidden 을 함께 관리).
  // 칩은 끌어서 날짜 칸·날짜 상세에 놓거나, 옮기기 단추·Alt+→/↓ 로 첫 날짜에 넣을 수 있다.
  import { app } from '../../app/app.svelte';
  import { S } from '../../app/strings';
  import type { Exam, Task } from '../../core/types';
  import { tip } from '../../ui/tip';
  import TaskChip from '../shared/TaskChip.svelte';
  import { groupLoose } from './logic';
  import { collapsible, subjectFor } from './ops';
  import { P } from './texts';

  interface Props {
    exam: Exam;
    /** 미배치 할일 */
    loose: Task[];
    open: boolean;
    onchipdown: (e: PointerEvent, task: Task, fromHandle: boolean) => void;
    onchipmove: (task: Task, opener: HTMLElement) => void;
    onchipdone: (task: Task) => void;
  }
  let { exam, loose, open, onchipdown, onchipmove, onchipdone }: Props = $props();

  const groups = $derived(groupLoose(exam.subs, loose));
</script>

<section
  id="pl-vault"
  class="pl-card pl-vault"
  data-region="vault"
  data-drop-vault
  aria-label={P.vaultLabel}
  use:collapsible={open}
>
  <h2 class="pl-vt">{S.vaultTitle}<span class="pl-vcount num">{loose.length}</span></h2>
  {#if !exam.subs.length}
    <p class="muted">{S.vaultNoSubs}</p>
    <button type="button" class="btn" onclick={() => app.setTab('exam')}>{S.goExam}</button>
  {:else if !loose.length}
    <p>{S.vaultNone}</p>
    <p class="muted pl-small">{P.vaultNoneHint}</p>
  {:else}
    {#each groups as g (g.esId)}
      {@const sj = g.tasks[0] ? subjectFor(exam, g.tasks[0]) : { name: '', color: '' }}
      <div class="pl-grp" role="group" aria-label={P.vaultGroupLabel(sj.name, g.tasks.length)}>
        <div class="pl-gh" style:--c={sj.color}>
          <span class="pl-dot" aria-hidden="true"></span>
          <span class="pl-gname" use:tip={sj.name}>{sj.name}</span>
          <span class="muted num pl-gcount" aria-hidden="true">{g.tasks.length}</span>
        </div>
        <div class="pl-items">
          {#each g.tasks as t (t.id)}
            <TaskChip task={t} {exam} subject={sj} onToggleDone={onchipdone} onMove={onchipmove} onpointerdown={onchipdown} />
          {/each}
        </div>
      </div>
    {/each}
    <p class="muted pl-small">{P.vaultDropHint}</p>
  {/if}
</section>

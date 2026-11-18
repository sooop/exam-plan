<!-- props 없음, app 스토어를 직접 사용한다(src/lib/app/app.svelte.ts 의 app).
     시험 일정 탭: 시험 만들기(app.ui.creating 이거나 시험이 없을 때), 시험 정보 편집·삭제, 날짜별 과목 배치, 과목 정보 서랍.
     세부 구현은 src/lib/screens/exam/. 과목 정보 서랍(SubjectDrawer)은 app.ui.subId 로 열고 닫으므로 다른 화면도 그대로 쓸 수 있다. -->
<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../app/app.svelte';
  import { S, T2 } from '../app/strings';
  import './exam/exam.css';
  import CreateForm from './exam/CreateForm.svelte';
  import ExamInfo from './exam/ExamInfo.svelte';
  import Schedule from './exam/Schedule.svelte';
  import SubjectDrawer from './exam/SubjectDrawer.svelte';
  import { addInputEl } from './exam/ops';
  import { UNDATED } from './exam/logic';

  const ex = $derived(app.cur());
  const showCreate = $derived(app.ui.creating || !ex);
  const noExam = $derived(app.state.exams.length === 0);

  let root: HTMLElement | undefined = $state();
  /** 시험을 지운 직후 시험 만들기 화면이 열리면 이름 입력칸에 포커스를 준다 */
  let focusCreate = $state(false);

  async function created() {
    // 만든 시험의 날짜 미정 행 입력칸으로: 바로 과목을 넣을 수 있다
    await tick();
    addInputEl(UNDATED)?.focus();
  }
  async function deleted() {
    if (!app.state.exams.length) focusCreate = true;
    await tick();
    if (app.state.exams.length) root?.focus();
  }
</script>

<section aria-label={S.tabs.exam} bind:this={root} tabindex="-1" class="ex-root">
  {#if showCreate}
    {#if noExam}
      <div class="ex-empty">
        <h2>{T2.noExamTitle}</h2>
        <p class="muted">{S.noExam}</p>
      </div>
    {/if}
    <CreateForm autofocus={app.ui.creating || focusCreate} oncreated={created} />
  {:else if ex}
    {#key ex.id}
      <div class="ex-stack">
        <ExamInfo {ex} ondeleted={deleted} />
        <Schedule {ex} />
      </div>
    {/key}
  {/if}
  <SubjectDrawer />
</section>

<style>
  .ex-root { min-width: 0; }
  .ex-root:focus { outline: none; }
</style>

<script lang="ts">
  // 직전 리캡 패널: 시험 전 일수(1~30)를 입력하고 '추가'하면 core recapBatch 가 과목별 미배치 리캡을 시험 전 며칠 안에 고르게 배치한다.
  // 일수와 배치는 한 번의 app.mutate(big)이고 결과(배치/제외 건수)는 되돌리기 토스트로 알린다. 한글 조합 중 Enter·Esc 는 무시한다.
  import { app } from '../../app/app.svelte';
  import { S } from '../../app/strings';
  import { todayISO } from '../../core/dates';
  import { getExam, recapBatch } from '../../core/planner';
  import type { Exam } from '../../core/types';
  import { isImeKey } from '../../ui/layerCore';
  import { toast } from '../../ui/toast.svelte';
  import { parseRecapDays } from './logic';
  import { acknowledgeCells, collapsible } from './ops';
  import { P } from './texts';

  interface Props {
    exam: Exam;
    open: boolean;
    /** Esc 로 닫는다(포커스는 부모가 토글 단추로 돌린다) */
    onclose: () => void;
  }
  let { exam, open, onclose }: Props = $props();

  let draft = $state(String(app.state.recapDays));
  const left = $derived(exam.tasks.filter((t) => t.type === 'r' && !t.date).length);

  function run() {
    if (left === 0) return;
    const n = parseRecapDays(draft, app.state.recapDays);
    draft = String(n);
    const before = new Set(exam.tasks.filter((t) => t.type === 'r' && !t.date).map((t) => t.id));
    const r = app.mutate(
      P.mutRecap,
      (s) => {
        const e = getExam(s, exam.id);
        if (!e) return { placed: 0, skipped: 0, hasRecap: false };
        s.recapDays = n;
        return recapBatch(s, e, n, todayISO());
      },
      { big: true },
    );
    if (!r.hasRecap) toast.info(S.recapNone);
    else if (r.placed > 0) {
      app.toastUndo(P.recapResult(r.placed, r.skipped));
      // 새로 배치된 리캡이 들어간 칸을 알린다
      const after = app.cur();
      const dates = new Set<string>();
      for (const t of after?.tasks ?? []) if (t.date && before.has(t.id)) dates.add(t.date);
      acknowledgeCells([...dates].sort());
    }
    else toast.info(S.recapSkip(r.skipped));
  }

  function onkeydown(e: KeyboardEvent) {
    if (isImeKey(e)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }
</script>

<section id="pl-recap" class="pl-card pl-recap" aria-label={P.recapPanel} use:collapsible={open}>
  <div class="pl-recaprow">
    <span>{S.recapFrom}</span>
    <input
      type="number"
      min="1"
      max="30"
      inputmode="numeric"
      value={draft}
      oninput={(e) => (draft = e.currentTarget.value)}
      aria-label={P.recapDaysLabel}
      {onkeydown}
    />
    <span>{S.recapDays}</span>
    <button type="button" class="btn" disabled={left === 0} onclick={run}>{S.recapRun}</button>
    <span class="muted pl-small">{left > 0 ? S.recapLeft(left) : P.recapEmpty}</span>
  </div>
  <p class="muted pl-small">{P.recapHint}</p>
</section>

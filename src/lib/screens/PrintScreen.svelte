<!-- 달력 탭: 활성 시험의 계획을 표(달력)로 본다. 읽기 전용(app.state 를 바꾸지 않는다). 보기 형식만 print/view.svelte.ts 의 상태.
     인쇄는 이 화면의 표를 그대로 찍는다(셸의 상단 바·탭·단추는 @media print 에서 숨긴다). 저장은 독립 HTML 파일이다. -->
<script lang="ts">
  import { flushSync, onMount, tick } from 'svelte';
  import { app } from '../app/app.svelte';
  import { ICON } from '../app/icons';
  import { S } from '../app/strings';
  import { downloadText } from '../app/download';
  import { toast } from '../ui/toast.svelte';
  import { buildCalModel, buildStandaloneHtml, calendarFileName, CAL_VIEWS, fitCalendar, FIT_SIZES, renderCalendarHtml, splitNotice, type SplitPlan } from './print/grid';
  import { WEEK_CSS } from './print/printCss';
  import { PT } from './print/texts';
  import { calUi } from './print/view.svelte';

  const ex = $derived(app.cur());
  /* 할일이 많아 나눈 단위의 계획(단위 번호 -> 주 쪽을 한 번 더 나눌지). 분할은 맞춤이 정하고(runFit) 단위당 최대 두 단계다.
     분할은 분할 전 표(base)에 묶여 있어 데이터·보기 형식이 바뀌면 저절로 비워진다 */
  const NO_SPLIT: SplitPlan = new Map();
  let splitState = $state<{ base: string; units: SplitPlan }>({ base: '', units: NO_SPLIT });
  const base = $derived(ex ? renderCalendarHtml(buildCalModel(app.state, ex, calUi.view)) : '');
  const splitSet = $derived(splitState.base === base ? splitState.units : NO_SPLIT);
  const model = $derived(ex ? buildCalModel(app.state, ex, calUi.view, undefined, splitSet) : null);
  const html = $derived(model ? renderCalendarHtml(model) : '');
  const perPage = $derived(model?.perPage ?? 0);
  const splitNote = $derived(perPage ? splitNotice(perPage, splitSet) : '');

  /* 표를 감싸는 요소. 저장할 때 이 안의 달력 요소를 그대로 옮긴다(화면과 같은 표) */
  let host: HTMLDivElement | undefined = $state();

  /* 맞춤(글자 크기·병합·줄임): 표를 그린 뒤, 인쇄 직전, 크기가 바뀔 때 돌린다. 1주·2주 보기에만 일이 있다 */
  let cut = $state(0);
  let scroller: HTMLDivElement | undefined = $state();
  let scale = $state(1);
  /* A4 가로 한 쪽의 폭(281mm). 화면 미리보기는 이 크기 그대로 맞춰 재고 폭에 맞게 축소해 보여 준다 */
  const PAGE_PX = (281 * 96) / 25.4;

  /* 맞춘다. 최소 글자+병합에서도 넘치는 쪽은 나눈다(표를 다시 그린 뒤 11pt 부터 다시 맞춘다).
     1단계: 단위를 2쪽으로(2주 단위는 주별, 그 밖은 요일 카드 4칸씩). 2단계: 2주 단위의 주 쪽이 또 넘치면 그 주 쪽을 요일 카드 4칸씩 둘로.
     쪽마다 한 단계씩만 올라가므로(더 나눌 수 없는 쪽은 needSplit 이 되지 않는다) 반복은 유한하다. */
  function runFit() {
    if (!host) { cut = 0; return; }
    const cfg = { sizes: FIT_SIZES, moreTpl: PT.more('{n}'), deferCut: true };
    let r = fitCalendar(host, cfg);
    for (let guard = 0; guard < 64; guard++) {
      const need = r.filter((x) => x.needSplit);
      if (!need.length) break;
      const next = new Map<number, readonly [boolean, boolean]>(splitState.base === base ? splitState.units : NO_SPLIT);
      for (const x of need) {
        const cur = next.get(x.unit);
        if (!cur) next.set(x.unit, [false, false]);
        else if (x.part === 1) next.set(x.unit, [true, cur[1]]);
        else if (x.part === 2) next.set(x.unit, [cur[0], true]);
      }
      splitState = { base, units: next };
      flushSync();
      r = fitCalendar(host, cfg);
    }
    cut = r.reduce((n, x) => n + x.cutTasks, 0);
  }

  function measureScale() {
    if (scroller) scale = Math.min(1, Math.max(0.2, scroller.clientWidth / PAGE_PX));
  }

  $effect(() => {
    void html;
    void host;
    void calUi.view;
    tick().then(() => { measureScale(); runFit(); });
  });

  onMount(() => {
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measureScale()) : null;
    if (scroller) ro?.observe(scroller);
    window.addEventListener('beforeprint', runFit);
    document.fonts?.ready.then(runFit);
    return () => { ro?.disconnect(); window.removeEventListener('beforeprint', runFit); };
  });

  function printCal() {
    try {
      runFit();
      window.print();
    } catch {
      toast.error(PT.printFail(PT.reasonPrint));
    }
  }

  function saveHtml() {
    const root = host?.firstElementChild;
    if (!ex || !root) {
      toast.error(PT.saveFail(PT.reasonNoCalendar));
      return;
    }
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      toast.error(PT.saveFail(PT.reasonNoFileApi));
      return;
    }
    const ok = downloadText(calendarFileName(ex.name, calUi.view), buildStandaloneHtml(ex.name, root.outerHTML), 'text/html');
    if (ok) toast.success(PT.saved);
    else toast.error(PT.saveFail(PT.reasonDownload));
  }
</script>

<svelte:head>{@html '<style>' + WEEK_CSS + '</style>'}</svelte:head>

<section class="cal-page" aria-label={S.tabs.print}>
  {#if !ex}
    <div class="empty"><p>{PT.noExam}</p></div>
  {:else if model?.empty === 'noprep'}
    <div class="empty"><p>{PT.noPrep}</p></div>
  {:else if model}
    <div class="cal-tools">
      <div class="seg" role="group" aria-label={S.printModeLabel}>
        {#each CAL_VIEWS as v (v.key)}
          <button type="button" class="seg-btn" aria-pressed={calUi.view === v.key} onclick={() => (calUi.view = v.key)}>{v.label}</button>
        {/each}
      </div>
      <div class="tools-end">
        <button type="button" class="btn primary" onclick={printCal}><ICON.printer size={16} />{S.printBtn}</button>
        <button type="button" class="btn" onclick={saveHtml}><ICON.download size={16} />{S.printSave}</button>
      </div>
    </div>
    {#if calUi.view === 'all'}<p class="cal-hint muted">{PT.scrollHint}</p>{/if}
    <!-- 가로로 넘치는 영역은 키보드로도 밀 수 있어야 하므로(WCAG 2.1.1) 포커스를 받게 둔다 -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="cal-scroll" role="region" aria-label={PT.scrollLabel} tabindex="0" bind:this={scroller}>
      <div class="cal" class:wkv={calUi.view !== 'all'} style:--s={scale} bind:this={host}>{@html html}</div>
    </div>
    {#if splitNote}<p class="cal-note muted" role="status">{splitNote}</p>{/if}
    {#if cut > 0}<p class="cal-note muted" role="status">{PT.reduced(cut)}</p>{/if}
  {/if}
</section>

<style>
  .cal-page { display: grid; gap: 12px; }
  .empty { padding: 24px 16px; border: 1px dashed var(--line); border-radius: var(--radius-lg); color: var(--muted); }
  .empty p { margin: 0; }

  /* 단추 줄: 강조 채움은 '인쇄' 하나. 보기 형식은 테두리와 투명 바탕만 쓴다 */
  .cal-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
  .tools-end { display: flex; flex-wrap: wrap; gap: 8px; }
  .seg { display: inline-flex; flex-wrap: wrap; gap: 4px; }
  .seg-btn {
    min-height: var(--target); padding: 4px 12px; border: 1px solid var(--line); border-radius: var(--radius);
    background: transparent; color: var(--muted);
  }
  .seg-btn:hover:not(:disabled) { background: var(--panel); color: var(--text); }
  .seg-btn[aria-pressed='true'] { color: var(--text); border-color: var(--text); font-weight: 600; background: var(--panel); }

  /* 좁은 화면에서 표가 넘치면 이 영역이 가로로 스크롤된다. 안내 문장은 좁은 화면에서만 보인다 */
  .cal-scroll { overflow-x: auto; max-width: 100%; border-radius: var(--radius); }
  .cal-hint, .cal-note { font-size: 13px; margin: 0; }
  .cal-hint { display: none; }
  @media (max-width: 900px) { .cal-hint { display: block; } }

  /* ---- 표(화면용). 원본 PRINT_CSS 의 구조를 앱 토큰으로 다시 쓴 것이다 ---- */
  .cal { font: 13px/1.4 var(--font); color: var(--text); }
  .cal :global(svg.i) {
    width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2;
    stroke-linecap: round; stroke-linejoin: round; flex: none;
  }

  /* 한 장 달력 */
  .cal :global(.pg-title) { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 6px; font-size: 16px; }
  .cal :global(.pg-title span) { font-size: 12px; color: var(--muted); }
  .cal :global(.pg-legend) { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--muted); margin-bottom: 8px; }
  .cal :global(.pg-legend span) { display: inline-flex; gap: 4px; align-items: center; }
  .cal :global(.pg-grid) {
    display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); min-width: 640px;
    border-top: 1px solid var(--line); border-left: 1px solid var(--line);
  }
  .cal :global(.pg-wd) { padding: 4px 6px; font-weight: 600; background: var(--panel); border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); text-align: center; }
  .cal :global(.pg-wd:nth-child(6)) { color: var(--blue-text); }
  .cal :global(.pg-wd:nth-child(7)) { color: var(--red-text); }
  .cal :global(.pg-cell) {
    position: relative; min-height: 96px; min-width: 0; padding: 4px 6px;
    border-right: 1px solid var(--line); border-bottom: 1px solid var(--line);
  }
  .cal :global(.pg-cell[data-we]) { background: var(--panel); }
  .cal :global(.pg-cell.out) { background: repeating-linear-gradient(135deg, var(--bg) 0 5px, var(--panel) 5px 6px); }
  .cal :global(.pg-cell[data-today]) { box-shadow: inset 0 0 0 2px var(--accent); }
  .cal :global(.pg-h) { display: flex; gap: 4px; align-items: center; min-width: 0; }
  .cal :global(.pg-h b) { font-size: 13px; font-variant-numeric: tabular-nums; }
  .cal :global(.pg-cell[data-hol] .pg-h b) { color: var(--red-text); }
  .cal :global(.pg-h small) { min-width: 0; font-size: 11px; color: var(--red-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cal :global(.pg-exam) {
    font-size: 12px; font-weight: 600; background: var(--accent-soft); color: var(--accent-text);
    border-radius: 4px; padding: 0 4px; margin: 2px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cal :global(.pg-memo) { font-size: 12px; color: var(--muted); font-style: italic; overflow-wrap: anywhere; }
  .cal :global(.pg-t) { list-style: none; margin: 2px 0 0; padding: 0; }
  .cal :global(.pg-t li) { display: flex; min-width: 0; font-size: 12px; line-height: 1.6; }
  .cal :global(.pg-t .pt) { display: flex; gap: 4px; align-items: center; min-width: 0; width: 100%; }
  .cal :global(.pg-t .tl) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cal :global(.pg-t .bx) {
    width: 10px; height: 10px; border: 1px solid var(--muted); border-radius: 3px; flex: none;
  }
  .cal :global(.pg-t li[data-done] .bx) { background: var(--muted); }
  .cal :global(.pg-t li[data-done]) { color: var(--muted); text-decoration: line-through; }

  /* 주간 달력(1주·2주) */
  .cal :global(.wk-head) { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; padding-bottom: 8px; border-bottom: 2px solid var(--text); }
  .cal :global(.wk-head .ex) { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: var(--accent-text); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cal :global(.wk-head h3) { margin: 2px 0 0; font-size: 22px; line-height: 1.2; font-weight: 800; letter-spacing: -0.02em; white-space: nowrap; }
  .cal :global(.wk-sum) { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; justify-content: flex-end; min-width: 0; }
  .cal :global(.wk-sum span) {
    display: inline-flex; align-items: center; gap: 5px; max-width: 100%; font-size: 12px; padding: 2px 9px;
    border-radius: 999px; border: 1px solid var(--line); background: var(--bg); white-space: nowrap;
  }
  .cal :global(.wk-sum span i) { width: 8px; height: 8px; border-radius: 50%; background: var(--c); flex: none; }
  .cal :global(.wk-sum .tot) { background: var(--text); color: var(--bg); border-color: var(--text); font-weight: 600; }
  .cal :global(.pgn) { font: 600 12px/1 var(--mono); color: var(--muted); white-space: nowrap; padding-bottom: 4px; font-variant-numeric: tabular-nums; }
  /* 배치(열 4개·줄 균등 분할)와 카드 글자 크기(--fs 의 비율)는 print/printCss.ts 의 WEEK_CSS 가 정한다(저장 파일과 같은 규칙) */
  .cal :global(.wk-grid) { display: grid; }
  .cal :global(.wk-day) {
    position: relative; display: flex; flex-direction: column; min-width: 0; overflow: hidden;
    border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg);
  }
  .cal :global(.wk-day[data-we]), .cal :global(.wk-day.note) { background: var(--panel); }
  .cal :global(.wk-day.out) { border-style: dashed; background: transparent; opacity: 0.45; }
  .cal :global(.wk-dh) { display: flex; align-items: baseline; gap: 6px; min-width: 0; padding: 8px 10px 6px; border-bottom: 1px solid var(--line); }
  .cal :global(.wk-dh .n) { font-size: 24px; line-height: 1; font-weight: 800; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
  .cal :global(.wk-dh .w) { font-size: 12px; font-weight: 700; color: var(--muted); }
  .cal :global(.wk-dh small) { min-width: 0; font-size: 11px; color: var(--red-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cal :global(.wk-dh .d) { margin-left: auto; font: 600 11px/1 var(--mono); color: var(--muted); white-space: nowrap; }
  .cal :global(.wk-day[data-w='6'] .n), .cal :global(.wk-day[data-w='6'] .w) { color: var(--blue-text); }
  .cal :global(.wk-day[data-w='0'] .n), .cal :global(.wk-day[data-w='0'] .w),
  .cal :global(.wk-day[data-hol] .n), .cal :global(.wk-day[data-hol] .w) { color: var(--red-text); }
  .cal :global(.wk-day[data-today]) { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
  .cal :global(.wk-day[data-today] .wk-dh) { background: var(--accent-soft); }
  .cal :global(.wk-day[data-exam] .wk-dh) { background: var(--text); border-bottom-color: var(--text); }
  .cal :global(.wk-day[data-exam] .wk-dh .n), .cal :global(.wk-day[data-exam] .wk-dh .w), .cal :global(.wk-day[data-exam] .wk-dh .d) { color: var(--bg); }
  .cal :global(.wk-exam) { margin: 8px 8px 0; padding: 6px 8px; border-radius: 6px; background: var(--accent-soft); color: var(--accent-text); font-size: 12px; line-height: 1.35; }
  .cal :global(.wk-exam b) { display: block; font-size: 11px; letter-spacing: 0.04em; }
  .cal :global(.wk-memo) {
    display: flex; gap: 6px; align-items: flex-start; margin: 8px 8px 0; padding: 4px 8px; border-radius: 6px;
    background: var(--panel); font-size: 12px; color: var(--muted); overflow-wrap: anywhere;
  }
  .cal :global(.wk-memo svg.i) { margin-top: 2px; }
  .cal :global(.wk-t) { list-style: none; margin: 0; padding: 8px 8px 0; }
  .cal :global(.wk-t li + li) { margin-top: 4px; }
  .cal :global(.wk-row) {
    display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 8px; align-items: center; width: 100%; min-width: 0;
    padding: 4px 6px; border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--c) 45%, var(--bg));
    background: color-mix(in srgb, var(--c) 11%, var(--bg));
  }
  .cal :global(.wk-row[data-kind='리캡']) { border-style: dashed; }
  .cal :global(.wk-row .bx) {
    grid-row: span 2; width: 15px; height: 15px; border: 1.5px solid var(--c); border-radius: 4px;
    background: var(--bg); display: inline-flex; align-items: center; justify-content: center; color: var(--accent-ink);
  }
  .cal :global(.wk-row .bx svg.i) { width: 11px; height: 11px; stroke-width: 3; }
  .cal :global(.wk-row[data-done] .bx) { background: var(--c); }
  .cal :global(.wk-row b) { min-width: 0; font-size: 13px; font-weight: 700; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cal :global(.wk-row small) { font-size: 11px; color: var(--muted); line-height: 1.2; }
  .cal :global(.wk-row[data-done] b) { text-decoration: line-through; color: var(--muted); font-weight: 500; }
  .cal :global(.wk-lines) {
    flex: 1; min-height: 60px; margin: 8px 9px 9px;
    background: repeating-linear-gradient(to bottom, transparent 0, transparent 27px, var(--line) 27px, var(--line) 28px);
  }

  /* 1주·2주 보기: 한 쪽을 실제 용지 크기(mm)로 그린 뒤 화면 폭에 맞게 줄여 보인다(맞춤 측정은 줄이기 전 크기로 한다) */
  .cal.wkv { width: calc(281mm * var(--s, 1)); overflow: hidden; }
  .cal :global(.pg.wk) {
    transform: scale(var(--s, 1)); transform-origin: 0 0; background: var(--bg);
    margin-bottom: calc((var(--s, 1) - 1) * 186mm + 12px); outline: 1px solid var(--line);
  }

  /* 인쇄: 셸(상단 바·탭·안내 배너·토스트)과 이 화면의 단추·안내는 숨기고(display:none, 높이를 차지하지 않는다) 달력 표만 남긴다.
     쪽 나눔이 확실히 먹도록 시트(.pg)의 조상은 모두 block 이고 높이·여백·안쪽 여백 규칙을 푼다(flex·grid 조상은 쪽 나눔을 무시할 수 있다).
     쪽 나눔은 첫 쪽이 아닌 쪽의 앞(break-before)에만 둔다. 마지막 쪽 뒤에는 나눔이 없어 빈 쪽이 생기지 않는다. */
  @media print {
    @page { size: A4 landscape; margin: 8mm; }
    :global(html), :global(body) { height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; background: #fff !important; }
    :global(body > :not(#app)) { display: none !important; }
    :global(#app), :global(#app .shell), :global(#app .body), :global(#app .panel:not([hidden])), .cal-page {
      display: block !important; height: auto !important; min-height: 0 !important; max-height: none !important;
      width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 !important; overflow: visible !important;
    }
    :global(#app .shell > :not(.body)) { display: none !important; }
    .cal-tools, .cal-hint, .cal-note { display: none !important; }
    .cal { width: auto; margin: 0; padding: 0; }
    .cal.wkv { width: auto; overflow: visible; }
    .cal :global(.pgs) { display: block; }
    .cal :global(.pg.wk) { transform: none; margin: 0; outline: 0; }
    .cal-scroll { overflow: visible !important; width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 !important; border-radius: 0 !important; }
    .cal :global(*) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cal :global(.pg-grid), .cal :global(.wk-grid) { min-width: 0 !important; }
    .cal :global(.pg + .pg) { break-before: page; page-break-before: always; }
    .cal :global(.pg-cell) { min-height: 27mm; }
    .cal :global(.pg-cell[data-today]), .cal :global(.wk-day[data-today]) { box-shadow: none; }
    .cal :global(.wk-day) { break-inside: avoid; }
    .cal :global(.wk-day[data-today]) { border-color: var(--line); }
    .cal :global(.wk-day[data-today] .wk-dh) { background: transparent; }
  }
</style>

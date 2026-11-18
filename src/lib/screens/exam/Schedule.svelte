<script lang="ts">
  // 날짜별 과목 배치: 시험 기간의 날짜 행마다 과목 칩과 과목 추가 입력, 날짜 미정 행, 공통 과목 빠른 추가.
  // 칩 끌기는 포인터 기반(DragSession + Motion.dragGhost): 스프링 고스트, 원래 자리 슬롯, 놓을 행 강조, 가장자리 스크롤, Esc 취소, 착지.
  // 키보드는 칩에서 Alt+↑/↓, 과목 정보 서랍의 '시험 날짜' 선택으로도 옮길 수 있다.
  import { onDestroy } from 'svelte';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import { app } from '../../app/app.svelte';
  import { ICON } from '../../app/icons';
  import { fmtFull, S } from '../../app/strings';
  import { examDays, subjectOf } from '../../core/planner';
  import type { Exam, SubPlacement } from '../../core/types';
  import { Motion } from '../../motion/motion';
  import { DragSession } from '../../motion/drag-session';
  import type { DragGhostHandle } from '../../motion/types';
  import { isImeKey } from '../../ui/layerCore';
  import { tip } from '../../ui/tip';
  import { toast } from '../../ui/toast.svelte';
  import { addInputEl, addSubsFx, chipEl, moveSubFx } from './ops';
  import { edgeDir, failMsg, keyToDate, moveTarget, quickCandidates, rowAt, rowKeyOf, UNDATED, withRo, type RowRect } from './logic';
  import { COMMON_SUBJECTS, X } from './texts';

  interface Props {
    ex: Exam;
  }
  let { ex }: Props = $props();

  interface Row { key: string; date: string | null; label: string; sub: string }

  const days = $derived(examDays(ex));
  const rows = $derived<Row[]>([
    ...days.map((d, i) => ({ key: d, date: d, label: S.dayN(i + 1), sub: fmtFull(d) })),
    { key: UNDATED, date: null, label: S.undated, sub: '' },
  ]);
  const groups = $derived.by(() => {
    const m: Record<string, SubPlacement[]> = {};
    for (const r of rows) m[r.key] = [];
    for (const es of ex.subs) m[rowKeyOf(es.examDate, days)].push(es);
    return m;
  });
  const cand = $derived(
    quickCandidates(app.state.library.map((l) => l.name), ex.subs.map((es) => subjectOf(app.state, es).name), COMMON_SUBJECTS),
  );

  let drafts = $state<Record<string, string>>({});
  let addError = $state('');
  let announce = $state('');
  let quickEl: HTMLElement | undefined = $state();

  // ───────── 과목 추가 ─────────
  function submitAdd(e: SubmitEvent, row: Row) {
    e.preventDefault();
    const r = addSubsFx(ex.id, { text: drafts[row.key] ?? '' }, row.date);
    if ('error' in r) {
      addError = failMsg(X.addSubFail, r.error);
      return;
    }
    addError = '';
    drafts[row.key] = '';
    if (r.added > 1 || r.dup) toast.success(S.addedN(r.added, r.dup));
  }
  function onAddKey(e: KeyboardEvent) {
    // 한글 조합을 확정하는 Enter 가 제출로 번지지 않게 한다
    if (isImeKey(e) && e.key === 'Enter') e.preventDefault();
  }
  function quickAdd(name: string, i: number) {
    const r = addSubsFx(ex.id, { name }, null);
    if ('error' in r) {
      addError = failMsg(X.addSubFail, r.error);
      return;
    }
    addError = '';
    // 누른 단추는 후보에서 사라지므로 다음 후보(없으면 앞 후보, 그것도 없으면 날짜 미정 입력칸)로 포커스를 옮긴다
    const btns = quickEl?.querySelectorAll<HTMLElement>('button');
    (btns && btns.length ? btns[Math.min(i, btns.length - 1)] : addInputEl(UNDATED))?.focus();
  }

  // ───────── 칩 열기·키보드 이동 ─────────
  function openSub(es: SubPlacement) {
    if (session.justDragged) return;
    app.ui.subId = es.id;
  }
  const rowLabelOf = (es: SubPlacement): string => rows.find((r) => r.key === rowKeyOf(es.examDate, days))?.label ?? S.undated;

  function onChipKey(e: KeyboardEvent, es: SubPlacement) {
    if (isImeKey(e)) return;
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const cur = es.examDate && days.includes(es.examDate) ? es.examDate : null;
    const t = moveTarget(days, cur, e.key === 'ArrowUp' ? -1 : 1);
    if (!t) return;
    const res = moveSubFx(ex.id, es.id, t.to);
    if (!res.changed) return;
    // 칩은 다른 행에서 새로 만들어진 요소이므로 포커스를 다시 준다
    res.chip?.querySelector<HTMLElement>('.ex-chip-main')?.focus();
    Motion.pulse(res.chip);
    announce = X.moved(subjectOf(app.state, es).name, rowLabelOf(es));
  }

  // ───────── 끌기 ─────────
  let dragId = $state<string | null>(null);
  let slotId = $state<string | null>(null);
  /** 끌기 세대: 놓은 뒤 착지를 기다리는 사이 새로 집었으면 앞 끌기의 마무리가 새 끌기의 슬롯을 지우지 않게 비교한다 */
  let dragGen = 0;
  let overKey = $state<string | null>(null);

  const rowRects = (): RowRect[] =>
    Array.from(document.querySelectorAll<HTMLElement>('.ex-days .ex-day')).map((el) => {
      const r = el.getBoundingClientRect();
      return { key: el.dataset.k ?? '', left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });

  function caption(): string {
    if (overKey == null) return X.moveBack;
    const es = dragId ? ex.subs.find((s) => s.id === dragId) : null;
    const row = rows.find((r) => r.key === overKey);
    if (!es || !row) return '';
    return overKey === rowKeyOf(es.examDate, days) ? X.moveStay : X.moveCaption(withRo(row.label));
  }

  async function finishDrop(grabbed: number, ghost: DragGhostHandle | null, key: string | null) {
    const es = ex.subs[grabbed];
    if (!es) {
      ghost?.destroy();
      return;
    }
    const id = es.id;
    const home = chipEl(id);
    const gen = dragGen;
    slotId = id;
    if (key == null) {
      // 행 밖에 놓았다: 원래 자리로 돌아간다(옮기지 않는다)
      if (ghost) await ghost.cancel(home ?? undefined);
      if (gen === dragGen) slotId = null;
      return;
    }
    const res = moveSubFx(ex.id, id, keyToDate(key));
    const target = res.chip ?? home;
    // 놓은 지점에서 들어갈 자리(새로 만들어진 칩의 슬롯)로 내려앉는다
    if (ghost) {
      if (target) await ghost.land(target.getBoundingClientRect());
      else ghost.destroy();
    }
    if (gen === dragGen) slotId = null;
    if (res.changed) {
      Motion.pulse(chipEl(id));
      announce = X.moved(subjectOf(app.state, es).name, rowLabelOf(es));
    }
  }

  /** 포인터 아래의 행을 다시 읽어 강조·설명 띠·고스트를 갱신한다 */
  function refresh() {
    const p = session.pt;
    const key = rowAt(rowRects(), p.x, p.y, overKey);
    if (key !== overKey) {
      overKey = key;
      session.ghost?.setLabel(caption());
    }
    session.ghost?.move(p.x, p.y);
    session.edgeV = edgeDir(p.y, 0, window.innerHeight);
  }
  /** 휠·터치패드로 스크롤해 포인터 아래 행이 바뀌어도 강조가 낡지 않게 한다 */
  const onScroll = () => {
    if (session.active) refresh();
  };
  const session = new DragSession<{ key: string | null }>({
    scroller: () => (document.scrollingElement as HTMLElement | null) ?? undefined,
    // 고스트 복제는 슬롯 스타일을 주기 전에 일어난다(슬롯은 반응형 상태라 다음 갱신 때 적용된다)
    ghostItems: (_p, moving) => {
      const es = ex.subs[moving[0]];
      const el = es ? chipEl(es.id) : null;
      return el ? [el] : [];
    },
    home: (grabbed) => {
      const es = ex.subs[grabbed];
      return es ? chipEl(es.id) : null;
    },
    token: () => `${ex.id}:${app.state.updatedAt}`,
    edgeStep: 14,
    begin: (press) => {
      const es = ex.subs[press.index];
      if (!es) return null;
      dragGen += 1;
      window.addEventListener('scroll', onScroll, true);
      dragId = es.id;
      slotId = es.id;
      overKey = rowKeyOf(es.examDate, days);
      document.documentElement.classList.add('mo-dragging');
      return [press.index];
    },
    label: () => caption(),
    update: () => refresh(),
    snapshot: () => ({ key: overKey }),
    drop: (_moving, grabbed, ghost, snap) => {
      void finishDrop(grabbed, ghost, snap.key);
    },
    ended: () => {
      window.removeEventListener('scroll', onScroll, true);
      dragId = null;
      overKey = null;
      slotId = null;
      document.documentElement.classList.remove('mo-dragging');
    },
    clear: () => {},
    // 취소로 돌아가는 동안 원래 자리는 슬롯으로 둔다
    returning: (m) => {
      if (m.length) slotId = ex.subs[m[0]]?.id ?? null;
      // 복귀가 끝났을 때 그 사이 새로 집은 칩이 있으면 그 슬롯을 지우지 않는다
      else if (!session.press) slotId = null;
    },
  });

  function onChipDown(e: PointerEvent, esId: string) {
    const idx = ex.subs.findIndex((s) => s.id === esId);
    if (idx < 0) return;
    // 돌아가는 중(.mo-slot 이 남은 칩)을 다시 집으면 복제본이 슬롯 모양이 된다: 복제(첫 이동) 전에 거둔다
    if (!session.press) slotId = null;
    session.start(e, idx, !!(e.target as HTMLElement).closest('.ex-grip'));
  }

  // 끄는 사이 데이터가 바뀌면(되돌리기·원격 갱신) 끌기를 버린다
  $effect(() => {
    void app.state.updatedAt;
    session.tokenChanged();
  });

  onDestroy(() => {
    window.removeEventListener('scroll', onScroll, true);
    session.dispose();
    document.documentElement.classList.remove('mo-dragging');
  });
</script>

<div>
  <h2 class="ex-sec">{S.examSchedule}</h2>
  <p class="ex-hint" style="margin-bottom:10px">{X.scheduleHint}</p>
  <p class="ex-err" role="alert">{addError}</p>
  <p class="sr-only" role="status">{announce}</p>

  <datalist id="ex-subject-list">
    {#each app.state.library as l (l.id)}<option value={l.name}></option>{/each}
  </datalist>

  <div class="ex-days">
    {#each rows as row (row.key)}
      <div
        class="ex-day"
        class:mo-drop-over={dragId !== null && overKey === row.key}
        data-k={row.key}
        data-mo-drop={dragId !== null ? '' : undefined}
      >
        <div class="ex-lab">{row.label}{#if row.sub}<small>{row.sub}</small>{/if}</div>
        <div class="ex-items">
          {#each groups[row.key] as es (es.id)}
            {@const sj = subjectOf(app.state, es)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="ex-chip" class:mo-slot={slotId === es.id} data-es={es.id} style:--c={sj.color} onpointerdown={(e) => onChipDown(e, es.id)}>
              <button
                type="button"
                class="ex-chip-main"
                aria-haspopup="dialog"
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                aria-label={X.chipLabel(sj.name, row.label)}
                onclick={() => openSub(es)}
                onkeydown={(e) => onChipKey(e, es)}
              >
                <span class="ex-l1">
                  <b class="ex-name">{sj.name}</b>
                  <span class="ex-sz" role="img" aria-label={X.szLabel(es.plan.n, es.plan.m, es.plan.r)}>
                    <span><ICON.bookOpen size={13} />{es.plan.n}</span>
                    <span><ICON.penLine size={13} />{es.plan.m}</span>
                    <span><ICON.rotateCcw size={13} />{es.plan.r}</span>
                  </span>
                </span>
                {#if es.range}<small>{es.range.split('\n')[0]}</small>{/if}
              </button>
              <span class="ex-grip" aria-hidden="true"><GripVertical size={14} /></span>
            </div>
          {/each}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <form class="ex-add" onsubmit={(e) => submitAdd(e, row)} onkeydown={onAddKey}>
            <input
              type="text"
              list="ex-subject-list"
              bind:value={drafts[row.key]}
              oninput={() => (addError = '')}
              placeholder={S.addSubPh}
              maxlength="40"
              autocomplete="off"
              enterkeyhint="done"
              data-fk="add-{row.key}"
              aria-label={X.addSubLabel(row.label)}
            />
            <button type="submit" class="icon-btn" aria-label={X.addSubSubmit(row.label)} use:tip={X.addSubSubmit(row.label)}><ICON.plus size={18} /></button>
          </form>
        </div>
      </div>
    {/each}
  </div>

  {#if cand.length}
    <div class="ex-quick" bind:this={quickEl}>
      <span class="muted">{S.quickAdd}</span>
      {#each cand as nm, i (nm)}
        <button type="button" class="ex-qchip" aria-label={X.quickAddLabel(nm)} onclick={() => quickAdd(nm, i)}>
          <ICON.plus size={13} /><span>{nm}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

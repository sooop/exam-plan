<script lang="ts">
  // 과목 정보 서랍의 본문. 모든 변경은 입력 확정(blur·Enter·단추) 시점에 app.mutate 로 적용하고, 화면 전체를 다시 그리지 않으므로 포커스가 유지된다.
  // 과목명·색은 보관함(전역) 값이라 다른 시험에도 적용된다.
  import { tick, untrack } from 'svelte';
  import { app } from '../../app/app.svelte';
  import { ICON } from '../../app/icons';
  import { fmtFull, S } from '../../app/strings';
  import { MAX_COUNT, MAX_TEXT, PALETTE } from '../../core/constants';
  import { examDays, getExam, normalizeLink, previewPlanChange, renameSubject, setPlan, subjectOf, subProgress } from '../../core/planner';
  import type { Exam, Plan, State, SubPlacement } from '../../core/types';
  import { normName } from '../../core/util';
  import ConfirmBlock from '../../ui/ConfirmBlock.svelte';
  import IconButton from '../../ui/IconButton.svelte';
  import { isImeKey } from '../../ui/layerCore';
  import { colorName, failMsg, nextPlan, planEqual } from './logic';
  import { addInputEl, moveSubFx, removeSubFx } from './ops';
  import { X } from './texts';

  interface Props {
    ex: Exam;
    es: SubPlacement;
  }
  let { ex, es }: Props = $props();

  const sj = $derived(subjectOf(app.state, es));
  const lib = $derived(app.state.library.find((l) => l.id === es.subjectId));
  const days = $derived(examDays(ex));
  const sp = $derived(subProgress(ex, es));

  const exId = untrack(() => ex.id);
  const esId = untrack(() => es.id);
  const subOf = (s: State) => getExam(s, exId)?.subs.find((v) => v.id === esId);

  let nameEl: HTMLInputElement | undefined = $state();
  let rangeEl: HTMLTextAreaElement | undefined = $state();
  let commentEl: HTMLTextAreaElement | undefined = $state();
  let nameErr = $state('');
  let dateErr = $state('');
  // 긴 글 입력 길이(한도에 가까워지면 알린다)
  let rangeLen = $state(untrack(() => es.range.length));
  let commentLen = $state(untrack(() => es.comment.length));
  const nearMax = (n: number) => n >= MAX_TEXT * 0.8;

  // ───────── 과목명 ─────────
  function commitName() {
    if (!nameEl) return;
    const v = nameEl.value;
    if (normName(v).slice(0, 40) === sj.name) {
      nameErr = '';
      nameEl.value = sj.name;
      return;
    }
    const r = app.mutate(X.lbl.rename, (s) => renameSubject(s, es.subjectId, v));
    if (r.error) {
      nameErr = failMsg(X.renameFail, r.error);
      return;
    }
    nameErr = '';
    nameEl.value = sj.name;
  }
  function onNameKey(e: KeyboardEvent) {
    if (isImeKey(e) || e.key !== 'Enter') return;
    e.preventDefault();
    commitName();
  }

  // ───────── 색 ─────────
  function setColor(c: string) {
    app.mutate(X.lbl.color, (s) => {
      const l = s.library.find((x) => x.id === es.subjectId);
      if (l) l.color = c;
    });
  }

  // ───────── 시험 날짜 ─────────
  function onDate(e: Event) {
    const sel = e.currentTarget as HTMLSelectElement;
    const res = moveSubFx(exId, esId, sel.value || null);
    if (res.ok) {
      dateErr = '';
      return;
    }
    dateErr = failMsg(X.moveFail, X.moveBadDate);
    sel.value = es.examDate ?? '';
  }

  // ───────── 범위·코멘트 ─────────
  function commitText(key: 'range' | 'comment', el: HTMLTextAreaElement | undefined) {
    if (!el) return;
    const v = el.value.slice(0, MAX_TEXT);
    if (v === es[key]) return;
    app.mutate(X.lbl[key], (s) => {
      const x = subOf(s);
      if (x) x[key] = v;
    });
  }

  // ───────── 링크 ─────────
  let linkLabel = $state('');
  let linkUrl = $state('');
  let linkErr = $state('');
  let linkLabelEl: HTMLInputElement | undefined = $state();
  let linksEl: HTMLElement | undefined = $state();

  function addLink() {
    const href = normalizeLink(linkUrl);
    if (!href) {
      linkErr = failMsg(X.linkFail, S.linkBad);
      return;
    }
    const label = linkLabel.trim().slice(0, 60);
    app.mutate(X.lbl.linkAdd, (s) => {
      subOf(s)?.links.push({ label, url: href });
    });
    linkErr = '';
    linkLabel = '';
    linkUrl = '';
  }
  function onLinkKey(e: KeyboardEvent) {
    if (isImeKey(e) || e.key !== 'Enter') return;
    e.preventDefault();
    addLink();
  }
  async function delLink(i: number) {
    app.mutate(X.lbl.linkDel, (s) => {
      subOf(s)?.links.splice(i, 1);
    });
    app.toastUndo(X.linkDeleted);
    await tick();
    // 누른 단추는 사라지므로 다음 링크의 삭제 단추(없으면 앞 링크, 그것도 없으면 링크 이름 입력칸)로 포커스를 옮긴다
    const btns = linksEl?.querySelectorAll<HTMLElement>('[data-link-del]');
    (btns && btns.length ? btns[Math.min(i, btns.length - 1)] : linkLabelEl)?.focus();
  }

  // ───────── 분량 ─────────
  let draft = $state<{ n: number | null; m: number | null; r: number | null }>({ n: 0, m: 0, r: 0 });
  let pending = $state<{ plan: Plan; lost: number } | null>(null);
  let planEl: HTMLElement | undefined = $state();

  // 저장소의 분량이 바뀌면(적용·되돌리기) 입력 초안을 맞춘다. 확인을 기다리는 중에는 초안을 두고 본다
  $effect(() => {
    const { n, m, r } = es.plan;
    untrack(() => {
      if (!pending) draft = { n, m, r };
    });
  });

  function commitPlan() {
    if (pending) return;
    const next = nextPlan(draft);
    draft = { ...next };
    if (planEqual(next, es.plan)) return;
    const lost = previewPlanChange(ex, es, next);
    if (lost > 0) {
      pending = { plan: next, lost };
      return;
    }
    applyPlan(next, 0);
  }
  function applyPlan(next: Plan, lost: number) {
    app.mutate(X.lbl.plan, (s) => {
      const e = getExam(s, exId);
      const x = e?.subs.find((v) => v.id === esId);
      if (e && x) setPlan(e, x, next);
    }, { big: lost > 0 });
    // 확인 블록의 '줄이기' 단추를 눌러 적용했으면 그 단추가 사라지므로 분량 입력칸으로 포커스를 돌린다
    const act = document.activeElement;
    const inConfirm = !!act?.closest('.confirm') && !!planEl && act.closest('.ex-fg') === planEl.closest('.ex-fg');
    pending = null;
    if (inConfirm) void tick().then(() => planEl?.querySelector<HTMLElement>('input')?.focus());
    if (lost > 0) app.toastUndo(X.planCutDone(lost));
  }
  function cancelPlan() {
    pending = null;
    draft = { ...es.plan };
    planEl?.querySelector<HTMLElement>('input')?.focus();
  }
  function onPlanKey(e: KeyboardEvent) {
    if (isImeKey(e) || e.key !== 'Enter') return;
    e.preventDefault();
    commitPlan();
  }

  // ───────── 시험에서 과목 삭제 ─────────
  let confirmDel = $state(false);
  let delBtn: HTMLButtonElement | undefined = $state();

  function removeThis() {
    const name = sj.name;
    confirmDel = false;
    app.ui.subId = null;
    const r = removeSubFx(exId, esId);
    if (r.ok) app.toastUndo(X.subDeleted(name));
    // 서랍이 닫히고 칩이 사라지므로 그 날짜 행의 과목 추가 입력칸으로 포커스를 옮긴다
    void tick().then(() => requestAnimationFrame(() => addInputEl(r.rowKey)?.focus()));
  }
  function cancelDel() {
    confirmDel = false;
    void tick().then(() => delBtn?.focus());
  }

  /** 서랍을 닫기 전에 아직 확정하지 않은 입력을 적용한다(적용할 수 있는 것만. 못 하는 것은 unsaved 로 알린다) */
  export function flush() {
    commitName();
    commitText('range', rangeEl);
    commitText('comment', commentEl);
    commitPlan();
  }

  /** 확정하지 못하고 남은 입력(닫으면 사라진다): 추가하지 않은 링크, 확인을 기다리는 분량 줄이기, 검증에 실패한 과목명 */
  export function unsaved(): { parts: string[]; notes: string[] } {
    const parts: string[] = [];
    const notes: string[] = [];
    if (linkLabel.trim() || linkUrl.trim()) parts.push(X.unsavedLink);
    if (pending) {
      parts.push(X.unsavedPlan);
      notes.push(X.planNotApplied(pending.lost));
    }
    if (nameErr && nameEl && normName(nameEl.value).slice(0, 40) !== sj.name) {
      parts.push(X.unsavedName);
      notes.push(nameErr);
    }
    return { parts, notes };
  }

  const planFields: { key: 'n' | 'm' | 'r'; label: string }[] = [
    { key: 'n', label: S.planN },
    { key: 'm', label: S.planM },
    { key: 'r', label: S.planR },
  ];
</script>

<div class="ex-drawer">
  <p class="ex-hint">{X.drawerHint}</p>

  <div class="ex-fg">
    <label class="f">
      <span>{S.subName}</span>
      <input
        type="text" bind:this={nameEl} value={sj.name} maxlength="40" autocomplete="off" data-autofocus
        aria-label={S.subName} aria-describedby="ex-name-note" aria-invalid={nameErr ? 'true' : undefined}
        onchange={commitName} onkeydown={onNameKey} oninput={() => (nameErr = '')}
      />
    </label>
    <p class="ex-hint" id="ex-name-note">{X.globalNote}</p>
    <p class="ex-err" role="alert">{nameErr}</p>
  </div>

  <div class="ex-fg">
    <div class="t" id="ex-color-label">{S.subColor}</div>
    <div class="ex-swatches" role="group" aria-labelledby="ex-color-label">
      {#each PALETTE as c (c)}
        {@const on = !!lib && lib.color.toUpperCase() === c.toUpperCase()}
        <button type="button" class="ex-sw" style:--c={c} aria-label={colorName(c)} aria-pressed={on} onclick={() => setColor(c)}>
          {#if on}<ICON.check size={16} />{/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="ex-fg">
    <label class="f">
      <span>{S.subDate}</span>
      <select aria-label={S.subDate} value={es.examDate ?? ''} onchange={onDate}>
        <option value="">{S.undated}</option>
        {#each days as d, i (d)}
          <option value={d}>{S.dayN(i + 1)} {fmtFull(d)}</option>
        {/each}
      </select>
    </label>
    <p class="ex-err" role="alert">{dateErr}</p>
  </div>

  <label class="f">
    <span>{S.subRange}</span>
    <textarea rows="3" maxlength={MAX_TEXT} bind:this={rangeEl} value={es.range} aria-label={S.subRange} oninput={(e) => (rangeLen = e.currentTarget.value.length)} onchange={() => commitText('range', rangeEl)}></textarea>
    {#if nearMax(rangeLen)}<small class="ex-hint" aria-live="polite">{X.textCount(rangeLen, MAX_TEXT)}</small>{/if}
  </label>
  <label class="f">
    <span>{S.subComment}</span>
    <textarea rows="3" maxlength={MAX_TEXT} bind:this={commentEl} value={es.comment} aria-label={S.subComment} oninput={(e) => (commentLen = e.currentTarget.value.length)} onchange={() => commitText('comment', commentEl)}></textarea>
    {#if nearMax(commentLen)}<small class="ex-hint" aria-live="polite">{X.textCount(commentLen, MAX_TEXT)}</small>{/if}
  </label>

  <div class="ex-fg">
    <div class="t">{S.subLinks}</div>
    <div class="ex-links" bind:this={linksEl}>
      {#each es.links as l, i (i + '|' + l.url)}
        <div class="ex-link">
          <a href={l.url} target="_blank" rel="noopener noreferrer">{l.label || l.url}</a>
          <IconButton label={X.linkDelete(l.label || l.url)} icon={ICON.x} onclick={() => delLink(i)} />
        </div>
      {/each}
      <div class="ex-linkadd">
        <input type="text" bind:this={linkLabelEl} bind:value={linkLabel} placeholder={S.linkLabel} maxlength="60" aria-label={S.linkLabel} onkeydown={onLinkKey} oninput={() => (linkErr = '')} />
        <input type="url" bind:value={linkUrl} placeholder={S.linkUrl} aria-label={S.linkUrl} autocapitalize="off" spellcheck="false" onkeydown={onLinkKey} oninput={() => (linkErr = '')} />
        <button type="button" class="btn" onclick={addLink}>{S.linkAdd}</button>
      </div>
      <p class="ex-err" role="alert">{linkErr}</p>
    </div>
  </div>

  <div class="ex-fg">
    <div class="t">{S.planTitle}</div>
    <div class="ex-plan" bind:this={planEl}>
      {#each planFields as pf (pf.key)}
        <label>
          {pf.label}
          <input
            type="number" min="0" max={MAX_COUNT} inputmode="numeric" bind:value={draft[pf.key]}
            aria-label={X.planInput(pf.label)}
            oninput={() => (pending = null)} onblur={commitPlan} onkeydown={onPlanKey}
          />
        </label>
      {/each}
    </div>
    <div class="ex-sum">{S.planSum(es.plan.n, es.plan.m, es.plan.r, sp.placed, sp.total)}</div>
    {#if pending}
      <ConfirmBlock message={S.planCut(pending.lost)} confirmLabel={S.cut} cancelLabel={S.cancel} onconfirm={() => applyPlan(pending!.plan, pending!.lost)} oncancel={cancelPlan} />
    {/if}
  </div>

  <div class="ex-fg">
    {#if confirmDel}
      <ConfirmBlock message={X.subDeleteConfirm(sj.name, sp.placed, sp.total)} confirmLabel={S.del} cancelLabel={S.cancel} onconfirm={removeThis} oncancel={cancelDel} />
    {:else}
      <div>
        <button type="button" class="btn danger" bind:this={delBtn} onclick={() => (confirmDel = true)}><ICON.trash2 size={16} />{S.subDel}</button>
      </div>
    {/if}
  </div>
</div>

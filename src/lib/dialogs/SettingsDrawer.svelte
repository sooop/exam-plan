<script lang="ts">
  // 설정 서랍(Layer variant='drawer'). 값은 입력이 확정될 때(blur·Enter·선택) app.mutate('설정 변경') 로 바꾼다.
  // 숫자는 범위를 벗어나면 잘라 적용하고 안내한다. 되돌릴 수 있으므로 확인을 묻지 않는다.
  // 요일별 기본값: 선택된 시험이 있으면 그 시험(exam.week)에, 없으면 새 시험의 기본값(state.week)에 쓴다(legacy 와 같다).
  import { app } from '../app/app.svelte';
  import { S, WD, levelLabel } from '../app/strings';
  import { LEVELS, MAX_COUNT } from '../core/constants';
  import { cleanPlan, cleanWeek } from '../core/planner';
  import { isLevel } from '../core/util';
  import type { Week, State } from '../core/types';
  import { THEMES, type Theme } from '../storage/prefs';
  import Layer from '../ui/Layer.svelte';
  import Switch from '../ui/Switch.svelte';
  import { isImeKey } from '../ui/layerCore';
  import { applyAnim, currentTheme, readStoredAnim, setThemePref, writeStoredAnim } from './appearance';
  import { clampNumber, numClampNotice, numEmptyNotice } from './logic';
  import { D } from './texts';

  interface Props {
    open?: boolean;
    /** 닫힌 뒤 포커스를 돌려줄 요소(설정 단추) */
    opener?: HTMLElement | null;
  }
  let { open = $bindable(false), opener = null }: Props = $props();

  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
  const PLAN_FIELDS = [
    { key: 'n', label: S.planN },
    { key: 'm', label: S.planM },
    { key: 'r', label: S.planR },
  ] as const;
  const LIMIT_RANGE = { lo: 0, hi: 20 };
  const PLAN_RANGE = { lo: 0, hi: MAX_COUNT };
  const RECAP_RANGE = { lo: 1, hi: 30 };

  /** 마지막 입력 안내(범위 밖 잘라 적용, 빈 값 유지). 서랍 아래 고정 자리에 보인다 */
  let notice = $state('');
  let theme = $state<Theme>(currentTheme());
  let animOn = $state(readStoredAnim());

  const exam = $derived(app.cur());
  const weekTargetText = $derived(exam ? D.weekToExam(exam.name) : D.weekToNew);
  const weekNow = (w: number): string => (exam ? exam.week[w] : app.state.week[w]) ?? '';

  /**
   * 숫자 입력 하나를 확정한다. 빈 값이면 이전 값을 되돌리고, 범위 밖이면 잘라 적용하며 안내한다.
   * 값이 같으면 상태를 바꾸지 않는다(mutate 가 같은 내용을 무시한다).
   */
  function applyNumber(input: HTMLInputElement, label: string, range: { lo: number; hi: number }, current: number, set: (s: State, v: number) => void) {
    const r = clampNumber(input.value, range.lo, range.hi);
    if (!r.ok) {
      input.value = String(current);
      notice = numEmptyNotice(label, current);
      return;
    }
    input.value = String(r.value);
    notice = r.clamped ? numClampNotice(label, range.lo, range.hi, r.value) : '';
    if (r.value !== current) app.mutate(D.settingLabel, (s) => set(s, r.value));
  }

  /** Enter 로 확정(한글 조합 중에는 무시). 입력칸에 포커스를 둔 채 적용한다 */
  function onEnter(e: KeyboardEvent, commit: () => void) {
    if (isImeKey(e) || e.key !== 'Enter') return;
    e.preventDefault();
    commit();
  }

  function setWeek(w: number, value: string) {
    app.mutate(D.settingLabel, (s) => {
      const ex = s.activeId ? s.exams.find((x) => x.id === s.activeId) : undefined;
      const next: Week = { ...cleanWeek(ex ? ex.week : s.week) };
      if (isLevel(value)) next[w] = value;
      else delete next[w];
      if (ex) ex.week = next;
      else s.week = next;
    });
  }

  function pickTheme(k: Theme) {
    theme = k;
    setThemePref(k);
  }

  function pickAnim(on: boolean) {
    animOn = on;
    applyAnim(on);
    writeStoredAnim(on);
  }
</script>

<Layer bind:open variant="drawer" title={S.settings} {opener}>
  <div class="dlg-body">
    <fieldset class="dlg-sec">
      <legend>{S.weekTitle}</legend>
      <p class="dlg-hint">{weekTargetText}</p>
      <div class="dlg-grid">
        {#each WEEK_ORDER as w (w)}
          <label class="f">
            <span>{WD[w]}</span>
            <select value={weekNow(w)} onchange={(e) => setWeek(w, e.currentTarget.value)}>
              <option value="">{S.weekAuto}</option>
              {#each LEVELS as lv (lv.key)}<option value={lv.key}>{lv.label}</option>{/each}
            </select>
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset class="dlg-sec">
      <legend>{S.limitsTitle}</legend>
      <p class="dlg-hint">{S.limitsHint} · {D.limitsRange(LIMIT_RANGE.lo, LIMIT_RANGE.hi)}</p>
      <div class="dlg-grid">
        {#each LEVELS as lv (lv.key)}
          <label class="f">
            <span>{levelLabel(lv.key)}</span>
            <input
              type="number"
              inputmode="numeric"
              min={LIMIT_RANGE.lo}
              max={LIMIT_RANGE.hi}
              value={app.state.limits[lv.key]}
              onblur={(e) => applyNumber(e.currentTarget, levelLabel(lv.key), LIMIT_RANGE, app.state.limits[lv.key], (s, v) => { s.limits[lv.key] = v; })}
              onkeydown={(e) => onEnter(e, () => applyNumber(e.currentTarget, levelLabel(lv.key), LIMIT_RANGE, app.state.limits[lv.key], (s, v) => { s.limits[lv.key] = v; }))}
            />
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset class="dlg-sec">
      <legend>{S.defPlanTitle}</legend>
      <p class="dlg-hint">{D.limitsRange(PLAN_RANGE.lo, PLAN_RANGE.hi)}</p>
      <div class="dlg-grid">
        {#each PLAN_FIELDS as f (f.key)}
          <label class="f">
            <span>{f.label}</span>
            <input
              type="number"
              inputmode="numeric"
              min={PLAN_RANGE.lo}
              max={PLAN_RANGE.hi}
              value={app.state.defPlan[f.key]}
              onblur={(e) => applyNumber(e.currentTarget, f.label, PLAN_RANGE, app.state.defPlan[f.key], (s, v) => { s.defPlan = cleanPlan({ ...s.defPlan, [f.key]: v }); })}
              onkeydown={(e) => onEnter(e, () => applyNumber(e.currentTarget, f.label, PLAN_RANGE, app.state.defPlan[f.key], (s, v) => { s.defPlan = cleanPlan({ ...s.defPlan, [f.key]: v }); }))}
            />
          </label>
        {/each}
      </div>
    </fieldset>

    <fieldset class="dlg-sec">
      <legend>{S.recapDefault}</legend>
      <p class="dlg-hint">{D.limitsRange(RECAP_RANGE.lo, RECAP_RANGE.hi)}</p>
      <div class="dlg-grid">
        <label class="f">
          <span>{S.recapDefault}</span>
          <input
            type="number"
            inputmode="numeric"
            min={RECAP_RANGE.lo}
            max={RECAP_RANGE.hi}
            value={app.state.recapDays}
            onblur={(e) => applyNumber(e.currentTarget, S.recapDefault, RECAP_RANGE, app.state.recapDays, (s, v) => { s.recapDays = v; })}
            onkeydown={(e) => onEnter(e, () => applyNumber(e.currentTarget, S.recapDefault, RECAP_RANGE, app.state.recapDays, (s, v) => { s.recapDays = v; }))}
          />
        </label>
      </div>
    </fieldset>

    <fieldset class="dlg-sec">
      <legend>{S.themeTitle}</legend>
      <div class="dlg-seg" role="group" aria-label={S.themeTitle}>
        {#each THEMES as k (k)}
          <button type="button" class="btn" aria-pressed={theme === k} onclick={() => pickTheme(k)}>{S.themes[k]}</button>
        {/each}
      </div>
      <p class="dlg-hint">{D.themeHint}</p>
    </fieldset>

    <fieldset class="dlg-sec">
      <legend>{D.animLabel}</legend>
      <div class="dlg-switch-row">
        <Switch checked={animOn} label={D.animLabel} describedby="dlg-anim-hint" onchange={pickAnim} />
        <span class="dlg-state" aria-hidden="true">{animOn ? D.animOn : D.animOff}</span>
      </div>
      <p id="dlg-anim-hint" class="dlg-hint">{D.animHint}</p>
    </fieldset>
  </div>

  {#snippet footer()}
    <p class="dlg-status" role="status">{notice}</p>
  {/snippet}
</Layer>

<style>
  .dlg-body { display: grid; gap: 22px; min-width: 0; }
  .dlg-sec { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 8px; }
  .dlg-sec legend { font-size: 15px; font-weight: 600; padding: 0; margin-bottom: 2px; }
  .dlg-hint { font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
  .dlg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 10px; min-width: 0; }
  .dlg-grid input[type='number'] { width: 100%; }
  .dlg-seg { display: flex; flex-wrap: wrap; gap: 6px; }
  /* 선택 상태: 배경과 네 변 테두리로 나타낸다(강조색 채움은 서랍에서 쓰지 않는다) */
  .dlg-seg .btn[aria-pressed='true'] { background: var(--panel2); border-color: var(--text); font-weight: 600; }
  .dlg-switch-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .dlg-state { font-size: 14px; color: var(--muted); }
  .dlg-status { margin: 0; width: 100%; font-size: 14px; overflow-wrap: anywhere; color: var(--muted); }
</style>

<script lang="ts">
  // 할일 칩. 과목 색 바탕 + 종류 아이콘·라벨 + 완료 표시. 리캡은 점선 윤곽(색 밖의 단서).
  //  - 본체 단추: 누르거나 Enter·Space 로 완료 토글. 스크린리더 라벨은 '국어 교재 3회 · 완료'(상태가 라벨 안에 있다)
  //  - 날짜 옮기기 단추: onMove(task, 단추) 를 부른다(부모가 DatePickerSheet 를 연다). 칩에서 Shift+F10·ContextMenu 키로도 열린다
  //  - 끌기: 이 컴포넌트는 끌기를 구현하지 않는다. 칩 어디서든 pointerdown 이 onpointerdown(e, task, fromHandle) 로 올라가고,
  //    손잡이 요소는 [data-drag-handle](touch-action: none). 터치는 손잡이에서만 시작하는 것을 권장한다(목록 스크롤 보호).
  //    칩 루트에는 data-task-id·data-kind 가 있다. 끄는 중의 표시(원래 자리 슬롯)는 Motion 의 .mo-slot 이 맡는다.
  //  - 눌림 영역: 본체·옮기기 단추는 시각 크기(높이 28px)를 그대로 두고 ::after 로 36px 이상으로 넓힌다(마우스에서도). 달력 칸의 compact 칩은 기본적으로 넓히지 않는다(--chip-hit, README).
  import { ICON, LEGACY_ICON } from '../../app/icons';
  import { KIND_ICON, S } from '../../app/strings';
  import type { Exam, Task } from '../../core/types';
  import { tip } from '../../ui/tip';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import { chipInfo, isMoveKey } from './logic';
  import { T } from './texts';

  interface Props {
    task: Task;
    exam: Exam;
    /** 과목 이름과 색(#rrggbb). 색은 데이터라 style 변수로만 쓴다 */
    subject: { name: string; color: string };
    /** 일괄 선택에서 고른 칩: 윤곽으로 표시한다(의미는 부모가 접근성 텍스트로 전한다) */
    selected?: boolean;
    /** 좁은 자리(날짜 칸·오늘 목록): 종류 글자·손잡이를 줄인다 */
    compact?: boolean;
    /** 읽기 전용: 완료·옮기기 단추를 막는다 */
    disabled?: boolean;
    /** 끌기 손잡이를 보인다(부모가 끌기를 연결하지 않으면 false) */
    showHandle?: boolean;
    onToggleDone?: (task: Task) => void;
    onMove?: (task: Task, opener: HTMLElement) => void;
    /** 칩 안의 pointerdown(옮기기 단추 제외). fromHandle: 손잡이에서 눌렀는가 */
    onpointerdown?: (e: PointerEvent, task: Task, fromHandle: boolean) => void;
    /** 루트 요소(끌기 고스트·FLIP·포커스 복원용) */
    element?: HTMLElement;
  }
  let {
    task, exam, subject, selected = false, compact = false, disabled = false, showHandle = true, onToggleDone, onMove, onpointerdown,
    element = $bindable(),
  }: Props = $props();

  const info = $derived(chipInfo(exam, task, subject.name));
  const KindIcon = $derived(info.kind ? ICON[LEGACY_ICON[KIND_ICON[info.kind]]] : ICON.bookOpen);
  const CheckIcon = ICON.check;
  const CalIcon = ICON.calendarDays;
  let moveBtn: HTMLButtonElement | undefined = $state();

  function down(e: PointerEvent) {
    const t = e.target as Element | null;
    if (!onpointerdown || t?.closest('.mv')) return;
    onpointerdown(e, task, !!t?.closest('[data-drag-handle]'));
  }
  function key(e: KeyboardEvent) {
    if (e.isComposing || e.keyCode === 229) return;
    if (isMoveKey(e) && moveBtn && !disabled) {
      e.preventDefault();
      onMove?.(task, moveBtn);
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="chip"
  bind:this={element}
  style:--c={subject.color}
  data-task-id={task.id}
  data-kind={info.kind}
  data-done={task.done ? '' : undefined}
  data-selected={selected ? '' : undefined}
  data-compact={compact ? '' : undefined}
  data-draggable={onpointerdown ? '' : undefined}
  onpointerdown={down}
  onkeydown={key}
>
  {#if showHandle && onpointerdown}
    <span class="grip" data-drag-handle aria-hidden="true"><GripVertical size={14} /></span>
  {/if}
  <button
    type="button"
    class="main"
    aria-label={info.a11y}
    {disabled}
    onclick={() => onToggleDone?.(task)}
    use:tip={{ title: info.text, lines: [info.kind + (task.date ? '' : ' · ' + T.chipUnplaced), S.done + ': ' + (task.done ? T.chipDone : T.chipNotDone)], delay: 800, warm: false }}
  >
    <span class="box" aria-hidden="true">{#if task.done}<CheckIcon size={12} />{/if}</span>
    <span class="kind" aria-hidden="true"><KindIcon size={14} /></span>
    <span class="text">{info.text}</span>
    {#if !compact && info.kind}<span class="kl" aria-hidden="true">{info.kind}</span>{/if}
  </button>
  <button
    type="button"
    class="mv"
    bind:this={moveBtn}
    aria-haspopup="dialog"
    aria-label={T.chipMoveLabel(info.text)}
    {disabled}
    onclick={(e) => onMove?.(task, e.currentTarget)}
    use:tip={{ title: S.moveDate, kbd: 'Shift+F10' }}
  >
    <CalIcon size={14} />
  </button>
</div>

<style>
  .chip {
    display: inline-flex; align-items: center; gap: 2px; max-width: 100%; min-width: 0; min-height: 32px; padding: 0 2px; border-radius: var(--radius);
    background: color-mix(in srgb, var(--c) 32%, var(--bg));
    border: 1px solid color-mix(in srgb, var(--c) 75%, var(--text) 10%);
    color: var(--text);
  }
  .chip[data-kind='리캡'] { border-style: dashed; }
  .chip[data-selected] { outline: 2px solid var(--accent-strong); outline-offset: 1px; }
  .chip[data-draggable] { cursor: grab; }
  @media (hover: hover) {
    .chip:hover { box-shadow: 0 2px 8px color-mix(in srgb, var(--text) 14%, transparent); }
  }
  .grip { display: inline-grid; place-items: center; width: 20px; align-self: stretch; touch-action: none; color: var(--muted); cursor: grab; flex: none; }
  .chip[data-compact] .grip { width: 16px; }
  .main, .mv { position: relative; border: 0; background: transparent; color: inherit; border-radius: 6px; min-height: 28px; }
  /* 눌림 영역 확장: 시각 크기는 그대로, 보이지 않는 ::after 가 --chip-hit(기본 36px) 이상으로 넓힌다.
   * compact 칩의 기본값은 0px(넓히지 않음): 달력 칸 안에서 칸·이웃 칩의 영역을 침범하지 않는다. 쓰는 쪽이 .chip 에 --chip-hit 를 주면 바뀐다. */
  .chip { --chip-hit: 36px; }
  .chip[data-compact] { --chip-hit: 0px; }
  .main::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: max(100%, var(--chip-hit)); transform: translateY(-50%); }
  .mv::after { content: ''; position: absolute; left: 50%; top: 50%; width: max(100%, var(--chip-hit)); height: max(100%, var(--chip-hit)); transform: translate(-50%, -50%); }
  .main { display: inline-flex; align-items: center; gap: 6px; padding: 2px 6px 2px 4px; min-width: 0; flex: 1 1 auto; text-align: left; }
  .main:hover:not(:disabled), .mv:hover:not(:disabled) { background: color-mix(in srgb, var(--text) 10%, transparent); }
  .main:disabled, .mv:disabled { opacity: 0.45; }
  .mv { display: inline-grid; place-items: center; width: 28px; padding: 0; flex: none; color: var(--muted); }
  .box { width: 16px; height: 16px; flex: none; border: 1.8px solid var(--text); border-radius: 4px; background: var(--bg); display: grid; place-items: center; }
  .kind { display: inline-grid; flex: none; color: var(--text); }
  .text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kl { flex: none; font-size: 12px; color: var(--muted); }
  .chip[data-done] .text { text-decoration: line-through; color: var(--muted); }
  /* 터치: 실제 크기를 36px 로 키운다. 손잡이도 compact 포함 36px(위의 compact 16px 규칙보다 특이도를 맞춘다) */
  @media (pointer: coarse) {
    .chip, .chip[data-compact] { min-height: var(--target); }
    .main { min-height: var(--target); }
    .mv { width: var(--target); min-height: var(--target); }
    .grip, .chip[data-compact] .grip { width: var(--target); }
  }
</style>

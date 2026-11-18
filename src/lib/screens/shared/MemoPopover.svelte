<script lang="ts">
  // 날짜 메모 팝오버(Layer popover). 60자. Enter 저장(닫기) · Shift+Enter 줄바꿈.
  // 감사 결함 수정: 한글 조합 중(isComposing, keyCode 229)의 Enter·Esc 는 저장도 닫기도 하지 않는다(logic.memoKey, Layer 도 같은 규칙).
  // 어떤 방법으로 닫아도(Enter·완료·Esc·바깥 클릭·Tab) 입력한 글은 저장한다(잃지 않기). 지우기는 빈 메모로 저장한다.
  // 변경은 shared/actions.ts 의 saveDayNote → app.mutate('메모 변경') 이고 바뀐 것이 없으면 아무것도 하지 않는다.
  import { untrack } from 'svelte';
  import { S, fmtFull } from '../../app/strings';
  import type { Exam } from '../../core/types';
  import Layer from '../../ui/Layer.svelte';
  import { saveDayNote } from './actions';
  import { MEMO_MAX, memoKey } from './logic';
  import { T } from './texts';

  interface Props {
    open?: boolean;
    anchor: HTMLElement | null;
    exam: Exam;
    iso: string;
    placement?: string;
    onclose?: () => void;
  }
  let { open = $bindable(false), anchor, exam, iso, placement = 'bottom-start', onclose }: Props = $props();

  const saved = $derived(exam.days[iso]?.note ?? '');
  let draft = $state('');
  let ta: HTMLTextAreaElement | undefined = $state();
  const hintId = 'memo-hint-' + Math.random().toString(36).slice(2, 8);
  const closeId = hintId + '-c';

  // 열릴 때 저장된 값으로 시작한다(열려 있는 동안 원격 변경이 와도 입력 중인 글은 덮지 않는다)
  $effect(() => {
    if (open) draft = untrack(() => exam.days[iso]?.note ?? '');
  });

  function finish() {
    saveDayNote(exam.id, iso, draft);
  }
  function done() {
    finish();
    open = false;
  }
  function clear() {
    draft = '';
    done();
  }
  function keydown(e: KeyboardEvent) {
    const k = memoKey(e);
    if (k === 'save') {
      e.preventDefault();
      done();
    }
    // 'ignore'(조합 중)와 'default' 는 아무것도 막지 않는다. 조합 중 Esc 는 Layer 도 무시한다.
  }
  const initialFocus = () => ta ?? null;
</script>

<Layer bind:open variant="popover" {anchor} {placement} title={T.memoTitle(fmtFull(iso))} width="300px" {initialFocus}
  onclose={() => { finish(); onclose?.(); }}>
  <div class="memo">
    <textarea
      bind:this={ta}
      bind:value={draft}
      rows="2"
      maxlength={MEMO_MAX}
      placeholder={S.memoPh}
      aria-label={S.memo}
      aria-describedby="{hintId} {closeId}"
      onkeydown={keydown}
    ></textarea>
    <div class="meta muted">
      <span id={hintId}>{T.memoHint}</span>
      <span class="num" aria-hidden="true">{T.memoCount(draft.length, MEMO_MAX)}</span>
    </div>
    <p class="close-hint muted" id={closeId}>{T.memoCloseHint}</p>
    <div class="row">
      {#if saved || draft}<button type="button" class="btn" onclick={clear}>{S.memoClear}</button>{/if}
      <!-- 팝오버 안의 단추는 강조색 채움을 쓰지 않는다(화면의 주 동작은 팝오버 밖에 있다) -->
      <button type="button" class="btn" onclick={done}>{S.memoDone}</button>
    </div>
  </div>
</Layer>

<style>
  .memo { display: grid; gap: 6px; }
  textarea { min-height: 72px; }
  .meta { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
  .close-hint { margin: 0; font-size: 12px; }
  @media (pointer: coarse) { .close-hint { display: none; } }
  .row { display: flex; justify-content: flex-end; gap: 6px; }
</style>

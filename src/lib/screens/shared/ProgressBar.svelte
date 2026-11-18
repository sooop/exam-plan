<script lang="ts">
  // 진행률 막대 + 숫자(완료/전체, 퍼센트). role=progressbar. 전체가 0 이면 빈 막대와 '0/0'.
  import { progressOf } from './logic';
  import { T } from './texts';

  interface Props {
    done: number;
    total: number;
    /** 접근성 이름(예: 과목 이름). 생략하면 '진행률' */
    label?: string;
    /** 막대 색(CSS 색 값, 예: 과목 색). 생략하면 강조색 */
    color?: string;
    /** 숫자를 보이지 않고 막대만(숫자는 접근성 텍스트에 남는다) */
    hideNumbers?: boolean;
    /** 퍼센트도 보인다 */
    showPercent?: boolean;
  }
  let { done, total, label = T.progressLabel, color, hideNumbers = false, showPercent = false }: Props = $props();

  const p = $derived(progressOf(done, total));
</script>

<div class="pb" style:--bar={color}>
  <div
    class="track"
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={Math.max(1, p.total)}
    aria-valuenow={p.done}
    aria-valuetext={T.progressText(label, p.done, p.total, p.pct)}
  >
    <span class="fill" style:width={p.pct + '%'}></span>
  </div>
  {#if !hideNumbers}
    <span class="nums num" aria-hidden="true">{T.progressNums(p.done, p.total)}{#if showPercent} · {p.pct}%{/if}</span>
  {/if}
</div>

<style>
  .pb { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .track { flex: 1; min-width: 40px; height: 8px; border-radius: 999px; background: color-mix(in srgb, var(--text) 14%, transparent); overflow: hidden; }
  .fill { display: block; height: 100%; border-radius: 999px; background: var(--bar, var(--accent-strong)); min-width: 0; transition: width var(--dur-2) var(--ease-out); }
  .nums { font-family: var(--mono); font-size: 12px; color: var(--muted); white-space: nowrap; }
</style>

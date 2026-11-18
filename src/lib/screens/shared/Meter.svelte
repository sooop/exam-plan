<script lang="ts">
  // 날짜 바쁨 게이지. 막대 5개의 높이가 단계마다 높아지고(모양), 채워진 막대 수와 색이 단계를 나타낸다.
  // count·limit 을 주면 '개수/한도' 숫자를 병기한다. 넘치면 경고 아이콘 + 굵은 글자 + 점선 막대로도 표시한다(색만으로 구분하지 않는다).
  // decorative 면 aria-hidden(옆에 같은 뜻의 글자가 있을 때). 아니면 role=img 에 접근성 텍스트가 붙는다.
  import { ICON } from '../../app/icons';
  import type { LevelKey } from '../../core/types';
  import { gauge, levelStep, meterLabel } from './logic';

  interface Props {
    level: LevelKey;
    /** 이 날 배치된 할일 수 */
    count?: number;
    /** 권장 한도 */
    limit?: number;
    /** 숫자를 보이지 않고 막대만 */
    hideCount?: boolean;
    /** 막대를 장식으로 취급(옆에 글자가 있을 때). 숫자는 계속 읽힌다 */
    decorative?: boolean;
    size?: 'sm' | 'md';
  }
  let { level, count, limit, hideCount = false, decorative = false, size = 'md' }: Props = $props();

  const step = $derived(levelStep(level));
  const g = $derived(count !== undefined && limit !== undefined ? gauge(count, limit) : null);
  const label = $derived(g ? meterLabel(level) + ', ' + g.label : meterLabel(level));
  const ExclIcon = ICON.triangleAlert;
</script>

<span class="meter-wrap" data-size={size}>
  <span
    class="meter"
    data-lv={level}
    data-over={g?.over ? '' : undefined}
    role={decorative ? undefined : 'img'}
    aria-label={decorative ? undefined : label}
    aria-hidden={decorative ? 'true' : undefined}
  >
    {#each [1, 2, 3, 4, 5] as i (i)}<i data-on={i <= step ? '' : undefined}></i>{/each}
  </span>
  {#if g && !hideCount}
    <span class="num" data-over={g.over ? '' : undefined}>
      {#if g.over}<ExclIcon size={size === 'sm' ? 12 : 14} />{/if}<span aria-hidden="true">{g.text}</span>{#if decorative}<span class="sr-only">{g.label}</span>{/if}
    </span>
  {/if}
</span>

<style>
  .meter-wrap { display: inline-flex; align-items: center; gap: 6px; vertical-align: middle; }
  .meter { display: inline-flex; gap: 2px; align-items: flex-end; height: 12px; --lvc: var(--lv-normal); }
  .meter i { width: 4px; border-radius: 1px; background: color-mix(in srgb, var(--text) 18%, transparent); }
  .meter i:nth-child(1) { height: 5px; }
  .meter i:nth-child(2) { height: 7px; }
  .meter i:nth-child(3) { height: 9px; }
  .meter i:nth-child(4) { height: 11px; }
  .meter i:nth-child(5) { height: 12px; }
  .meter i[data-on] { background: var(--lvc); }
  .meter[data-lv='calm'] { --lvc: var(--lv-calm); }
  .meter[data-lv='easy'] { --lvc: var(--lv-easy); }
  .meter[data-lv='normal'] { --lvc: var(--lv-normal); }
  .meter[data-lv='busy'] { --lvc: var(--lv-busy); }
  .meter[data-lv='packed'] { --lvc: var(--lv-packed); }
  /* 넘침: 채운 막대가 점선 윤곽이 된다(색 밖의 단서) */
  .meter[data-over] i[data-on] { background: color-mix(in srgb, var(--red) 55%, transparent); outline: 1px dashed var(--red-text); outline-offset: -1px; }
  .num { display: inline-flex; align-items: center; gap: 3px; font-family: var(--mono); font-size: 13px; font-variant-numeric: tabular-nums; color: var(--text); white-space: nowrap; }
  .num[data-over] { color: var(--red-text); font-weight: 700; }
  [data-size='sm'] .meter { height: 10px; }
  [data-size='sm'] .meter i { width: 3px; }
  [data-size='sm'] .num { font-size: 12px; }
</style>

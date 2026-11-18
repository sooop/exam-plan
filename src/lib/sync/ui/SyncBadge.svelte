<script lang="ts">
  // 헤더용 동기화 상태 단추. 단계별 아이콘·색·짧은 라벨을 보이고, 누르면 동기화 대화상자(syncUi.open)를 연다.
  // 상태는 호버 툴팁에만 두지 않는다: 라벨 글자와 aria-label 이 있어 키보드·터치·스크린 리더에서도 읽힌다.
  // 오류와 문제 때문에 멈춘 경우는 아이콘 모양(경고 삼각형·일시 정지)과 굵은 글자로 주의를 끈다. 색만 쓰지 않는다.
  import { onDestroy } from 'svelte';
  import { phaseTone } from 'sync-kit';
  import { ICON, SYNC_ICON } from '../../app/icons';
  import { T2 } from '../../app/strings';
  import { tip } from '../../ui/tip';
  import { sync, syncUi } from '../state.svelte';
  import { formatAgo } from './format';
  import { needsAttention } from './logic';

  /** 마지막 동기화 상대 시각을 다시 그리는 간격 */
  const TICK_MS = 30_000;

  let now = $state(Date.now());
  const timer = setInterval(() => (now = Date.now()), TICK_MS);
  onDestroy(() => clearInterval(timer));

  const phase = $derived(sync.status.phase);
  const label = $derived(T2.syncPhase[phase]);
  const tone = $derived(phaseTone(phase));
  const Icon = $derived(ICON[SYNC_ICON[phase]]);
  const attention = $derived(needsAttention(phase, !!sync.status.lastError));
  const srText = $derived(T2.syncBadgeLabel(label));
  /** 툴팁: 연결된 기기에서만 마지막 동기화 시각을 보인다 */
  const detail = $derived(sync.config ? [`마지막 동기화: ${formatAgo(sync.status.lastSyncAt, now)}`] : []);
</script>

<button
  type="button"
  class="sync-badge tone-{tone}"
  class:attention
  aria-label={srText}
  use:tip={{ title: label, lines: detail }}
  onclick={() => (syncUi.open = true)}
>
  <span class="ico" aria-hidden="true"><Icon size={16} class={phase === 'syncing' ? 'sy-spin' : undefined} /></span>
  <span class="lbl" aria-hidden="true">{label}</span>
  <span class="sr-only">{srText}</span>
</button>

<style>
  .sync-badge {
    display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-height: var(--target); padding: 0 10px;
    border: 1px solid var(--line); border-radius: var(--radius); background: transparent; color: var(--muted); font-size: 13px;
  }
  .sync-badge:hover:not(:disabled) { background: var(--panel2); }
  .sync-badge .ico { display: inline-flex; flex: none; }
  .sync-badge .lbl { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sync-badge.tone-ok { color: var(--green-text); }
  .sync-badge.tone-busy { color: var(--text); }
  .sync-badge.tone-warn, .sync-badge.tone-muted { color: var(--muted); }
  .sync-badge.tone-error, .sync-badge.attention { color: var(--red-text); border-color: color-mix(in srgb, var(--red) 50%, var(--line)); font-weight: 600; }
  /* 좁은 화면에서는 아이콘만 보인다(라벨은 sr-only 와 aria-label 로 남는다) */
  @media (max-width: 640px) { .sync-badge .lbl { display: none; } }
</style>

<script lang="ts">
  // 토스트 표시 영역. 앱에 한 번만 둔다(어디에 두어도 body 로 옮겨져 모달의 inert 에 막히지 않는다).
  // role=status(정보·성공)와 role=alert(오류) 영역은 내용이 없을 때도 DOM 에 있어야 바뀐 내용을 읽어 준다.
  // 등장·퇴장은 Motion 의 toast 값(200/130ms), 남은 토스트는 Motion.flip 으로 미끄러져 자리를 잡는다.
  import { flushSync, onMount } from 'svelte';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Info from '@lucide/svelte/icons/info';
  import { Motion } from '../motion/motion';
  import { portal } from './portal';
  import { toast } from './toast.svelte';

  let host: HTMLElement | undefined = $state();
  let statusEl: HTMLElement | undefined = $state();
  let alertEl: HTMLElement | undefined = $state();

  const polite = $derived(toast.items.filter((t) => t.kind !== 'error'));
  const alerts = $derived(toast.items.filter((t) => t.kind === 'error'));

  onMount(() => toast.attachHost());

  /** 나타남: 아래에서 8px 올라오며 페이드 */
  function appear(node: HTMLElement) {
    void Motion.enter(node, 'toast');
  }

  const leaving = new Set<number>();
  $effect(() => {
    for (const t of toast.items) {
      if (!t.leaving || leaving.has(t.id)) continue;
      leaving.add(t.id);
      leave(t.id);
    }
  });

  /** 퇴장 연출(130ms)이 끝나면 목록에서 치우고, 남은 토스트(와 영역)가 미끄러져 자리를 잡는다 */
  function leave(id: number) {
    const el = host?.querySelector<HTMLElement>(`[data-toast-id="${id}"]`);
    const finish = () => {
      leaving.delete(id);
      const mutate = () => flushSync(() => toast.remove(id));
      if (host && statusEl && alertEl) Motion.flip(host, () => Motion.flip(statusEl!, () => Motion.flip(alertEl!, mutate)));
      else toast.remove(id);
    };
    if (!el) {
      leaving.delete(id);
      toast.remove(id);
      return;
    }
    void Motion.leave(el, 'toast', finish);
  }
</script>

<div class="host" bind:this={host} use:portal data-modal-safe>
  <div class="region" bind:this={statusEl} role="status" aria-live="polite" aria-relevant="additions text">
    {#each polite as t (t.id)}
      {@render item(t)}
    {/each}
  </div>
  <div class="region" bind:this={alertEl} role="alert" aria-relevant="additions text">
    {#each alerts as t (t.id)}
      {@render item(t)}
    {/each}
  </div>
</div>

{#snippet item(t: (typeof toast.items)[number])}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="toast"
    class:error={t.kind === 'error'}
    data-toast-id={t.id}
    use:appear
    onclick={() => toast.dismiss(t.id)}
    onpointerenter={() => toast.hold(t.id)}
    onpointerleave={() => toast.release(t.id)}
    onfocusin={() => toast.hold(t.id)}
    onfocusout={() => toast.release(t.id)}
  >
    {#if t.kind === 'error'}<CircleAlert size={16} aria-hidden="true" />
    {:else if t.kind === 'success'}<CircleCheck size={16} aria-hidden="true" />
    {:else}<Info size={16} aria-hidden="true" />{/if}
    <span class="text">{t.text}</span>
    {#if t.action}
      {@const a = t.action}
      <button
        type="button"
        class="act"
        onclick={(e) => {
          e.stopPropagation();
          toast.dismiss(t.id);
          a.run();
        }}
      >
        {a.label}
      </button>
    {/if}
  </div>
{/snippet}

<style>
  /* column-reverse: 먼저 뜬 토스트가 아래에 머물고 새 것은 그 위에 쌓인다(읽는 순서는 DOM 순서 그대로) */
  .host {
    position: fixed; left: 0; right: 0; z-index: var(--z-toast); bottom: calc(var(--toast-lift, 0px) + max(16px, env(safe-area-inset-bottom)));
    display: flex; flex-direction: column-reverse; align-items: center; gap: 8px; pointer-events: none;
  }
  .region { display: flex; flex-direction: column-reverse; align-items: center; gap: 8px; max-width: 100%; }
  .toast {
    pointer-events: auto; display: flex; align-items: center; gap: 8px; max-width: min(420px, calc(100vw - 32px));
    padding: 8px 12px; border-radius: var(--radius); background: var(--toast-bg); color: var(--toast-fg);
    box-shadow: var(--shadow); font-size: 14px; cursor: pointer;
  }
  .toast.error { background: var(--danger-strong); color: var(--accent-ink); }
  .toast :global(svg) { flex: none; }
  .text { min-width: 0; overflow-wrap: anywhere; }
  .act {
    flex: none; padding: 2px 10px; min-height: 28px; border-radius: 6px; background: transparent; color: inherit; font-weight: 600;
    border: 1px solid color-mix(in srgb, currentColor 55%, transparent);
  }
  .act:hover:not(:disabled) { background: color-mix(in srgb, currentColor 18%, transparent); }
  .act:focus-visible { outline-color: currentColor; }
  @media (pointer: coarse) { .act { min-height: var(--target); } }
</style>

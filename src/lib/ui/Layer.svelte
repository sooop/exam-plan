<script lang="ts" module>
  let uid = 0;
</script>

<script lang="ts">
  // 모달·서랍(우측)·시트(하단)·앵커 팝오버를 하나로 통합한 층. 모든 층이 layerStack 하나를 공유한다.
  //
  //   <Layer bind:open variant="modal" title="과목 추가" {dirty} onclose={(reason) => ...}>
  //     ...본문...
  //     {#snippet footer()}<button class="btn" onclick={...}>취소</button>{/snippet}
  //   </Layer>
  //
  // 규칙(ui-principles 3·4): Esc·Tab 은 맨 위 층만 받는다 / 한글 조합 중 Enter·Esc 무시 / 열릴 때 첫 입력(없으면 첫 동작 단추)에 포커스,
  // 닫히면 연 요소로 복귀 / 모달·서랍·시트는 뒤 화면을 inert 로 막되 토스트는 막지 않는다 / 바깥 클릭은 누름과 뗌이 모두 배경일 때만 /
  // 입력이 있으면 '버리고 닫을까요?' / 처리 중(busy)에는 닫기 불가.
  import { onDestroy, tick, untrack, type Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import { Motion } from '../motion/motion';
  import { slideFx } from '../motion/motion.svelte';
  import ConfirmBlock from './ConfirmBlock.svelte';
  import {
    createBackdropGuard, decideClose, hasBlockingBelow, parsePlacement, placePopover, restoreChoice,
    type CloseReason, type LayerVariant,
  } from './layerCore';
  import { layerStack, type LayerHandle } from './layerStack.svelte';
  import { portal } from './portal';
  import { tip } from './tip';

  interface Props {
    /** 열림 여부. bind:open 으로 쓰거나 값만 넘기고 onclose 에서 끈다 */
    open?: boolean;
    variant?: LayerVariant;
    /** 제목: h2 로 그리고 aria-labelledby 로 이름을 붙인다. 제목이 없으면 label 이 aria-label 이 된다 */
    title?: string;
    label?: string;
    /** 팝오버의 앵커 요소 */
    anchor?: HTMLElement | null;
    /** 팝오버 배치: 'bottom-start'(기본) | 'bottom-end' | 'bottom' | 'top-start' | 'top-end' | 'top'. 공간이 모자라면 뒤집힌다 */
    placement?: string;
    /** 입력한 내용이 있다(미리 채운 값 그대로면 false 로 계산해 넘긴다). true 면 닫기 전에 '버리고 닫을까요?' 를 묻는다 */
    dirty?: boolean;
    discardMessage?: string;
    /** 닫아도 되는지 검사하는 가드. false 를 돌려주면 닫지 않는다 */
    canClose?: () => boolean;
    /** 처리 중: 닫기 불가이고 X 도 비활성으로 보인다 */
    busy?: boolean;
    /** 닫는 요청이 받아들여졌다(open 은 이미 false). 이유: x · escape · backdrop · tab · cancel · api · anchor-lost */
    onclose?: (reason: CloseReason) => void;
    /** 닫는 연출까지 끝나 DOM 에서 치워졌다 */
    onclosed?: () => void;
    closeOnBackdrop?: boolean;
    /** X 단추(모달·서랍·시트). 기본 true */
    showClose?: boolean;
    /** 첫 포커스: 선택자 또는 함수. 생략하면 [data-autofocus] → 첫 입력 → 첫 동작 단추 */
    initialFocus?: string | (() => HTMLElement | null);
    /** 닫힌 뒤 포커스를 돌려줄 요소. 생략하면 열 때의 activeElement(팝오버는 앵커) */
    opener?: HTMLElement | null;
    /**
     * 닫힌 뒤 연 요소(opener)가 사라졌을 때만 부르는 대체 포커스 대상(같은 구역의 이웃 행, 없으면 화면 머리 등). null 이면 건드리지 않는다.
     * 생략하면 layerStack.offerRestore 로 맡겨 둔 것을 쓴다.
     */
    restoreFocusTo?: () => HTMLElement | null;
    /** 팝오버의 role. 메뉴나 목록 상자면 'menu'·'listbox'(항목의 role 은 쓰는 쪽이 준다). 기본 dialog */
    role?: 'dialog' | 'menu' | 'listbox';
    /** 본체 폭(CSS 값). 모달 기본 480px, 서랍 420px, 시트 640px */
    width?: string;
    /**
     * 닫히는 동안(연출 중) 본문·푸터를 닫기 직전 모양 그대로 유지한다. 부모가 닫힘과 동시에 목록·폼 값을 비워
     * 층이 쪼그라들거나 '없습니다' 문구가 번쩍이는 것을 막는다. 본문은 닫기 직전의 DOM 사본(조작 불가)으로 대체되고 연출이 끝나면 치워진다.
     * 쓰기 전에 값을 비우는 쪽을 onclosed 로 미루는 방법도 있으나, 이 prop 은 그럴 수 없는 곳(부모가 바로 비움)용이다.
     */
    keepContentWhileClosing?: boolean;
    children?: Snippet;
    footer?: Snippet;
  }

  let {
    open = $bindable(false), variant = 'modal', title, label, anchor = null, placement = 'bottom-start', dirty = false,
    discardMessage = '입력한 내용을 버리고 닫을까요?', canClose, busy = false, onclose, onclosed, closeOnBackdrop = true,
    showClose = true, initialFocus, opener, restoreFocusTo, role = 'dialog', width, keepContentWhileClosing = false, children, footer,
  }: Props = $props();

  type Phase = 'closed' | 'open' | 'leaving';
  let phase = $state<Phase>('closed');
  let id = $state(0);
  let asking = $state(false);
  let dim = $state(true);
  let root: HTMLElement | undefined = $state();
  let box: HTMLElement | undefined = $state();
  let scrim: HTMLElement | undefined = $state();
  let content: HTMLElement | undefined = $state();
  /** keepContentWhileClosing: 닫기 직전 본문·푸터의 사본 */
  let frozen = $state<DocumentFragment | null>(null);

  const titleId = `layer-title-${++uid}`;
  const guard = createBackdropGuard();
  let openerEl: HTMLElement | null = null;
  let beforeAsk: HTMLElement | null = null;
  let pendingReason: CloseReason = 'cancel';
  /** 닫는 연출의 세대: 닫히는 도중 다시 열면 앞 세대의 마무리가 실행되지 않게 한다 */
  let leaveGen = 0;

  const blocking = $derived(variant !== 'popover');
  const boxKind = $derived(variant === 'modal' ? 'modal' : variant === 'drawer' ? 'panel-right' : variant === 'sheet' ? 'panel-bottom' : 'pop');
  // 딤: 모달은 값표의 backdrop(400ms 열림·110ms 늦게 시작, 140ms 닫힘). 서랍·시트는 본체(panel)와 같은 길이 220/170 이다
  // (표에 없는 220/140 을 쓰면 본체보다 먼저 끝난 딤이 되살아나 보이기도 한다). 두 요소의 닫힘 끝은 doClose 가 함께 마무리한다.
  const scrimKind = $derived(variant === 'modal' ? 'backdrop' : { ms: 220, outMs: 170 });

  const handle: LayerHandle = {
    requestClose: (reason) => requestClose(reason),
    el: () => root ?? null,
    box: () => box ?? null,
    contains: (n) => !!(box?.contains(n) || anchor?.contains(n)),
  };

  // ---- open 과 연동 ----
  $effect(() => {
    const want = open;
    untrack(() => (want ? doOpen() : doClose()));
  });

  function doOpen() {
    if (phase === 'open') return;
    if (phase === 'leaving') {
      // 닫히는 도중 다시 열렸다: 앞의 연출을 거두고 이어받는다
      leaveGen++;
      phase = 'open';
      frozen = null;
      // 먼저 끝나 숨겨 둔 요소를 되살린다
      if (box) box.style.visibility = '';
      if (scrim) scrim.style.visibility = '';
      layerStack.setClosing(id, false);
      void tick().then(() => {
        playEnter();
        focusInitial();
      });
      return;
    }
    const ae = document.activeElement;
    openerEl = opener ?? (variant === 'popover' && anchor ? anchor : ae instanceof HTMLElement && ae !== document.body ? ae : null);
    dim = !hasBlockingBelow(layerStack.entries);
    asking = false;
    frozen = null;
    id = layerStack.register(variant, handle);
    phase = 'open';
    void tick().then(() => {
      if (phase !== 'open') return;
      position();
      playEnter();
      focusInitial();
    });
  }

  function doClose() {
    if (phase !== 'open') return;
    const wasTop = layerStack.isTop(id);
    phase = 'leaving';
    asking = false;
    guard.reset();
    layerStack.setClosing(id, true); // 이 순간부터 뒤 화면의 inert 가 풀린다: 연출을 기다리지 않는다
    restoreFocus(wasTop);
    const gen = ++leaveGen;
    let pending = scrim ? 2 : 1;
    // 먼저 끝난 요소는 Motion.leave 가 곧바로 채움(forwards)을 풀어 원래 모습(불투명)으로 돌아온다.
    // 나머지를 기다리는 동안 되살아나 보이지 않게 숨겨 둔다(딤 220/170 과 본체 길이가 달라도 안전).
    const doneFor = (el: HTMLElement) => () => {
      if (gen !== leaveGen || phase !== 'leaving') return;
      el.style.visibility = 'hidden';
      if (--pending > 0) return;
      finalize();
    };
    if (!box) {
      finalize();
      return;
    }
    Motion.leave(box, boxKind, doneFor(box));
    if (scrim) Motion.leave(scrim, scrimKind, doneFor(scrim));
  }

  /** 닫히는 동안 보일 본문·푸터의 사본을 뜬다(닫기 직전의 DOM 에서) */
  function freeze() {
    if (!keepContentWhileClosing || !content || frozen) return;
    const f = document.createDocumentFragment();
    for (const c of content.childNodes) f.append(c.cloneNode(true));
    frozen = f;
  }
  // 부모가 open 을 꺼서 닫을 때: DOM 이 갱신되기 전(pre)에 사본을 뜬다
  $effect.pre(() => {
    if (!open) untrack(() => {
      if (phase === 'open') freeze();
    });
  });
  function paintFrozen(node: HTMLElement) {
    if (frozen) node.append(frozen.cloneNode(true));
  }

  function finalize() {
    // 안쪽의 global 전환(ConfirmBlock 의 slide)이 DOM 제거를 잠시 붙들어도 화면·입력을 가리지 않게 한다
    if (root) {
      root.style.visibility = 'hidden';
      root.style.pointerEvents = 'none';
    }
    frozen = null;
    phase = 'closed';
    layerStack.unregister(id);
    id = 0;
    onclosed?.();
  }

  onDestroy(() => {
    // 층이 열린 채 컴포넌트가 사라져도 뒤 화면이 계속 막혀 있지 않게 한다
    if (id) layerStack.unregister(id);
  });

  function playEnter() {
    if (box) void Motion.enter(box, boxKind);
    if (scrim) void Motion.enter(scrim, scrimKind);
  }

  // ---- 닫기 ----
  /** 닫기 요청: busy·canClose 가드와 '버리고 닫을까요?' 를 거친다 */
  export function requestClose(reason: CloseReason = 'api') {
    if (phase !== 'open') return;
    if (asking) {
      // 이미 묻는 중: Esc·X 는 질문을 거두고(계속 편집), 배경 클릭은 무시한다
      if (reason !== 'backdrop') cancelAsk();
      return;
    }
    const d = decideClose({ busy, canClose: canClose ? canClose() !== false : true, dirty });
    if (d === 'blocked') return;
    if (d === 'confirm') {
      pendingReason = reason;
      const ae = document.activeElement;
      beforeAsk = ae instanceof HTMLElement && box?.contains(ae) ? ae : null;
      asking = true;
      return;
    }
    close(reason);
  }

  /** 확인 없이 닫는다. 단 busy 와 canClose 는 지킨다(프로그램에서 저장을 마치고 닫을 때) */
  export function close(reason: CloseReason = 'api') {
    if (phase !== 'open') return;
    if (busy) return;
    if (canClose && canClose() === false) return;
    freeze();
    open = false;
    doClose();
    onclose?.(reason);
  }

  export function isOpen() {
    return phase === 'open';
  }

  function cancelAsk() {
    asking = false;
    beforeAsk?.focus({ preventScroll: true });
    beforeAsk = null;
  }
  function confirmDiscard() {
    asking = false;
    close(pendingReason);
  }

  // ---- 포커스 ----
  const INPUTS = 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable=""], [contenteditable="true"]';
  const ACTIONS = 'button:not([disabled]):not([data-layer-close]), a[href], [tabindex]:not([tabindex="-1"])';

  function focusInitial() {
    if (!box) return;
    let el: HTMLElement | null = null;
    if (typeof initialFocus === 'function') el = initialFocus();
    else if (initialFocus) el = box.querySelector<HTMLElement>(initialFocus);
    el ??= box.querySelector<HTMLElement>('[data-autofocus]');
    el ??= box.querySelector<HTMLElement>(INPUTS);
    el ??= box.querySelector<HTMLElement>(ACTIONS);
    (el ?? box).focus({ preventScroll: true });
  }

  function restoreFocus(wasTop: boolean) {
    const ae = document.activeElement;
    const nowhere = !ae || ae === document.body || ae === document.documentElement;
    const choice = restoreChoice({
      wasTop,
      focusNowhere: nowhere,
      focusInsideClosed: !nowhere && !!box && box.contains(ae),
      openerAlive: !!openerEl && openerEl.isConnected && !openerEl.closest('[inert]'),
    });
    if (choice === 'opener') openerEl?.focus({ preventScroll: true });
    else if (choice === 'fallback') {
      const fn = restoreFocusTo ?? layerStack.takeRestore();
      fn?.()?.focus({ preventScroll: true });
    }
  }

  // ---- 바깥 클릭: 누름과 뗌이 모두 배경일 때만 ----
  function ondown(e: PointerEvent) {
    guard.down(e.target === scrim && !layerStack.consumed.has(e));
  }
  function onup(e: PointerEvent) {
    if (guard.up(e.target === scrim) && closeOnBackdrop && layerStack.isTop(id)) requestClose('backdrop');
  }

  // ---- 팝오버 위치: 앵커 쪽 모서리에서 자라나고, 화면 안으로 보정하고, 아래가 모자라면 위로 뒤집는다 ----
  function position() {
    if (variant !== 'popover' || !box) return;
    if (!anchor || !anchor.isConnected) {
      close('anchor-lost');
      return;
    }
    const r = anchor.getBoundingClientRect();
    if (!r.width && !r.height) {
      close('anchor-lost');
      return;
    }
    const s = box.getBoundingClientRect();
    const pl = parsePlacement(placement);
    const p = placePopover({
      anchor: { left: r.left, top: r.top, width: r.width, height: r.height },
      size: { width: s.width, height: Math.min(s.height, box.scrollHeight) },
      viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      side: pl.side,
      align: pl.align,
    });
    box.style.left = `${p.left}px`;
    box.style.top = `${p.top}px`;
    box.style.maxHeight = `${p.maxHeight}px`;
    box.style.transformOrigin = p.origin;
    box.style.visibility = '';
    box.dataset.side = p.side;
  }

  $effect(() => {
    if (variant !== 'popover' || phase !== 'open') return;
    const on = () => position();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
    };
  });
</script>

{#if phase !== 'closed'}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="layer"
    bind:this={root}
    data-variant={variant}
    data-closing={phase === 'leaving' ? '' : undefined}
    data-layer-id={id}
    style:z-index="calc(var(--z-layer) + {layerStack.indexOf(id)})"
    use:portal
    onpointerdown={ondown}
    onpointerup={onup}
  >
    {#if blocking}
      <div class="scrim" class:clear={!dim} bind:this={scrim} aria-hidden="true"></div>
    {/if}
    <div
      class="box"
      bind:this={box}
      role={blocking ? 'dialog' : role}
      aria-modal={blocking ? 'true' : undefined}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
      tabindex="-1"
      style:--w={width}
      style:visibility={variant === 'popover' ? 'hidden' : undefined}
    >
      {#if title}
        <header class="head"><h2 id={titleId}>{title}</h2></header>
      {/if}
      {#if blocking && showClose}
        <button
          type="button"
          class="icon-btn x"
          data-layer-close
          aria-label="닫기"
          disabled={busy}
          use:tip={{ title: '닫기', kbd: 'Esc' }}
          onclick={() => requestClose('x')}
        >
          <X size={18} />
        </button>
      {/if}
      {#if frozen && phase === 'leaving'}
        <div class="content" inert aria-hidden="true" use:paintFrozen></div>
      {:else}
        <div class="content" bind:this={content}>
          <div class="body">{@render children?.()}</div>
          {#if asking}
            <div class="ask" transition:slideFx>
              <ConfirmBlock
                message={discardMessage}
                confirmLabel="버리고 닫기"
                cancelLabel="계속 편집"
                animate={false}
                onconfirm={confirmDiscard}
                oncancel={cancelAsk}
              />
            </div>
          {/if}
          {#if footer}
            <footer class="foot">{@render footer()}</footer>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .layer { position: fixed; inset: 0; display: flex; }
  .layer[data-closing] { pointer-events: none; }
  .layer[data-variant='popover'] { inset: auto; left: 0; top: 0; width: 0; height: 0; overflow: visible; }

  .scrim { position: absolute; inset: 0; background: var(--scrim); }
  .scrim.clear { background: transparent; }

  .box {
    position: relative; display: flex; flex-direction: column; min-height: 0; background: var(--bg); color: var(--text);
    border: 1px solid var(--line); box-shadow: var(--shadow);
  }
  .box:focus, .box:focus-visible { outline: none; }

  /* 모달: 가운데. 작은 화면에서도 가장자리 여백을 남긴다 */
  [data-variant='modal'] { align-items: center; justify-content: center; padding: 16px; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
  [data-variant='modal'] .box {
    width: min(var(--w, 480px), 100%); max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px); border-radius: var(--radius-lg);
  }

  /* 서랍: 우측. 좁은 화면에서는 전체 폭 */
  [data-variant='drawer'] { justify-content: flex-end; }
  [data-variant='drawer'] .box {
    width: min(var(--w, 420px), 100vw); height: 100vh; height: 100dvh; border-width: 0 0 0 1px; border-radius: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  /* 시트: 하단 */
  [data-variant='sheet'] { align-items: flex-end; justify-content: center; }
  [data-variant='sheet'] .box {
    width: min(var(--w, 640px), 100vw); max-height: 85vh; max-height: 85dvh; border-width: 1px 1px 0; border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  /* 팝오버: 위치는 position() 이 left·top·max-height·transform-origin 을 채운다 */
  [data-variant='popover'] .box {
    position: fixed; left: 0; top: 0; width: max-content; min-width: 160px; max-width: min(360px, calc(100vw - 16px));
    overflow: auto; background: var(--panel); border-radius: var(--radius);
  }

  /* 내용 감싸개: 레이아웃에는 없는 것으로 친다(.body·.foot 이 .box 의 flex 자식 그대로) */
  .content { display: contents; }
  .head { padding: 16px 52px 8px 20px; }
  .head h2 { font-size: 17px; line-height: 1.35; overflow-wrap: anywhere; }
  .x { position: absolute; top: 8px; right: 8px; z-index: 1; }
  .body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px 20px 16px; overscroll-behavior: contain; }
  [data-variant='popover'] .body { padding: 8px; overflow: visible; }
  /* 제목이 없는 층은 X(top 8 + 최대 36px)가 본문 첫 줄과 겹치지 않게 머리 영역을 비워 둔다 */
  .box:not(:has(.head)) .body { padding-top: 16px; }
  .box:not(:has(.head)):has(.x) .body { padding-top: 48px; }
  [data-variant='popover'] .box:not(:has(.head)) .body { padding-top: 8px; }
  .ask { padding: 0 20px 12px; }
  .foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--line); }
</style>

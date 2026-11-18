// 층(모달·서랍·시트·팝오버) 스택의 순수 로직. DOM 에 의존하지 않으므로 vitest 로 직접 시험한다(tests/ui/layerStack.test.ts).
// DOM 에 닿는 부분(리스너, inert 적용, 포커스)은 layerStack.svelte.ts 와 Layer.svelte 가 맡는다.

export type LayerVariant = 'modal' | 'drawer' | 'sheet' | 'popover';
export type CloseReason = 'x' | 'escape' | 'backdrop' | 'tab' | 'cancel' | 'api' | 'anchor-lost';

/** 스택에 쌓이는 층의 최소 정보 */
export interface StackEntry {
  id: number;
  variant: LayerVariant;
  /** 닫히는 연출 중이다: 맨 위 판정·배경 막기에서 빠진다(조작은 연출을 기다리지 않는다) */
  closing: boolean;
}

/** 뒤 화면을 막는 층인가(팝오버는 막지 않는다) */
export const isBlocking = (v: LayerVariant): boolean => v !== 'popover';

/** 맨 위 층: 닫히는 중이 아닌 마지막 층 */
export function topEntry<T extends StackEntry>(stack: readonly T[]): T | null {
  for (let i = stack.length - 1; i >= 0; i--) if (!stack[i].closing) return stack[i];
  return null;
}
export const isTop = (stack: readonly StackEntry[], id: number): boolean => topEntry(stack)?.id === id;

/** 한글 조합(IME) 중의 키인가: Enter·Esc·방향키를 처리하는 모든 핸들러가 첫 줄에서 건너뛴다 */
export const isImeKey = (e: { isComposing?: boolean; keyCode?: number }): boolean => !!e.isComposing || e.keyCode === 229;

export interface KeyInfo {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  /** 안쪽 핸들러가 이미 처리했다 */
  defaultPrevented?: boolean;
}

export type KeyRoute =
  | { kind: 'none' }
  /** Esc: 맨 위 층에 닫기를 요청한다 */
  | { kind: 'close'; id: number }
  /** Tab: 맨 위 층만 받는다. 팝오버는 닫고, 나머지는 포커스를 가둔다 */
  | { kind: 'tab'; id: number; variant: LayerVariant; shift: boolean };

/** 키 하나를 어느 층이 받을지 정한다. Esc 와 Tab 은 맨 위 층만 받는다 */
export function routeKey(stack: readonly StackEntry[], k: KeyInfo): KeyRoute {
  const top = topEntry(stack);
  if (!top) return { kind: 'none' };
  if (isImeKey(k) || k.defaultPrevented) return { kind: 'none' };
  if (k.key === 'Escape' && !k.altKey && !k.ctrlKey && !k.metaKey) return { kind: 'close', id: top.id };
  if (k.key === 'Tab' && !k.altKey && !k.ctrlKey && !k.metaKey) return { kind: 'tab', id: top.id, variant: top.variant, shift: !!k.shiftKey };
  return { kind: 'none' };
}

export interface InertPlan {
  /** 앱 본체(#app)를 막는가 */
  app: boolean;
  /** 막아야 하는 층의 id: 맨 위 막는 층보다 아래에 있는 모든 층 */
  layers: number[];
}

/**
 * 배경 막기 계획. 맨 위의 막는 층(모달·서랍·시트)보다 아래에 있는 것은 앱 본체와 아래 층 전부 inert 로 막는다.
 * 팝오버는 아무것도 막지 않고, 닫히는 중인 층은 막는 층으로 치지 않는다. 토스트·툴팁은 스택 밖이라 항상 안 막힌다.
 */
export function inertPlan(stack: readonly StackEntry[]): InertPlan {
  let topBlock = -1;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (!stack[i].closing && isBlocking(stack[i].variant)) {
      topBlock = i;
      break;
    }
  }
  if (topBlock < 0) return { app: false, layers: [] };
  return { app: true, layers: stack.slice(0, topBlock).map((e) => e.id) };
}

/** 이 층 아래에 이미 뒤를 막는(= 딤을 그리는) 층이 있는가: 딤이 겹쳐 점점 어두워지지 않게 한다 */
export const hasBlockingBelow = (stack: readonly StackEntry[]): boolean => stack.some((e) => !e.closing && isBlocking(e.variant));

/**
 * 포커스 가둘 때 후보가 되는 요소의 선택자. 모든 항목이 tabindex="-1" 을 제외한다:
 * 롤빙(활성 항목만 tabindex=0)을 쓰는 목록에서는 활성 항목 하나만 후보가 되어야 Tab 가장자리 판정이 맞는다.
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])', 'textarea:not([disabled])',
  '[contenteditable=""]', '[contenteditable="true"]', '[tabindex]', 'summary',
].map((s) => `${s}:not([tabindex^="-"])`).join(',');

/**
 * Tab 이 창 밖으로 나가지 않게 가장자리에서만 되돌린다.
 * count·active 는 '탭으로 닿는 요소'(FOCUSABLE_SELECTOR 후보) 목록 기준이다.
 * active 가 -1 이면 목록 밖: 목록에 없는 요소(tabindex=-1 인 항목·창 자신)에 포커스가 있을 때는 around 로
 * 그 요소의 앞·뒤에 후보가 몇 개 있는지 알리면, 진행 방향에 후보가 남아 있는 동안은 기본 동작에 맡기고 끝에서만 돌린다.
 * 반환: 옮길 순번 / -1 은 포커스 가능 요소가 없으니 창 자신에 머문다 / null 은 기본 동작에 맡긴다
 */
export function trapTarget(count: number, active: number, shift: boolean, around?: { before: number; after: number }): number | null {
  if (count <= 0) return -1;
  if ((active < 0 || active >= count) && around) {
    if (shift) return around.before > 0 ? null : count - 1;
    return around.after > 0 ? null : 0;
  }
  if (active < 0 || active >= count) return shift ? count - 1 : 0;
  if (!shift && active === count - 1) return 0;
  if (shift && active === 0) return count - 1;
  return null;
}

/**
 * 바깥 클릭 닫기 판정: pointerdown 과 pointerup 이 모두 배경일 때만 닫는다.
 * 입력창에서 글자를 끌다가 창 밖에서 놓았을 때 닫히면 안 된다.
 */
export function createBackdropGuard() {
  let downOnBackdrop = false;
  return {
    down(onBackdrop: boolean) {
      downOnBackdrop = onBackdrop;
    },
    /** 뗐다. 닫아야 하면 true */
    up(onBackdrop: boolean): boolean {
      const ok = downOnBackdrop && onBackdrop;
      downOnBackdrop = false;
      return ok;
    },
    reset() {
      downOnBackdrop = false;
    },
  };
}

/** 닫힌 뒤 포커스를 연 요소로 돌릴지: 맨 위였고 연 요소가 살아 있으며, 포커스가 어디에도 없거나 닫히는 층 안에 있을 때만 */
export function shouldRestoreFocus(s: { wasTop: boolean; focusNowhere: boolean; focusInsideClosed: boolean; openerAlive: boolean }): boolean {
  return s.wasTop && s.openerAlive && (s.focusNowhere || s.focusInsideClosed);
}

export type CloseDecision = 'blocked' | 'confirm' | 'close';
/**
 * 닫기 요청을 어떻게 처리할지 정한다. 처리 중(busy)이거나 canClose 가 거짓이면 막고,
 * 입력한 내용이 있으면(dirty, 미리 채운 값 그대로면 거짓) 한 번 묻고, 아니면 닫는다.
 * force 는 프로그램에서 확인 없이 닫을 때(버리고 닫기를 이미 눌렀을 때)다.
 */
export function decideClose(s: { busy: boolean; canClose: boolean; dirty: boolean; force?: boolean }): CloseDecision {
  if (s.busy) return 'blocked';
  if (!s.canClose) return 'blocked';
  if (s.dirty && !s.force) return 'confirm';
  return 'close';
}

// ---------- 앵커 팝오버 위치 ----------

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
export type PopSide = 'bottom' | 'top';
export type PopAlign = 'start' | 'end' | 'center';

export interface PlaceInput {
  anchor: Box;
  size: { width: number; height: number };
  viewport: { width: number; height: number };
  side?: PopSide;
  align?: PopAlign;
  gap?: number;
  pad?: number;
}
export interface Placement {
  left: number;
  top: number;
  side: PopSide;
  /** 앵커 쪽 모서리에서 자라나도록 하는 transform-origin(px 기준, 팝오버 자신의 좌표) */
  origin: string;
  /** 화면 안에 들어오도록 줄인 최대 높이 */
  maxHeight: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 팝오버 위치. 기본은 앵커 아래. 아래 공간이 모자라고 위가 더 넓으면 위로 뒤집고, 가로는 화면 안으로 당긴다.
 * 어느 쪽도 다 안 들어가면 더 넓은 쪽에 맞춰 maxHeight 로 줄인다(내용은 스크롤).
 */
export function placePopover(p: PlaceInput): Placement {
  const { anchor: a, size, viewport: vp } = p;
  const gap = p.gap ?? 6;
  const pad = p.pad ?? 8;
  const align = p.align ?? 'start';
  const spaceBelow = vp.height - (a.top + a.height) - gap - pad;
  const spaceAbove = a.top - gap - pad;
  let side: PopSide = p.side ?? 'bottom';
  const own = side === 'bottom' ? spaceBelow : spaceAbove;
  const other = side === 'bottom' ? spaceAbove : spaceBelow;
  if (size.height > own && other > own) side = side === 'bottom' ? 'top' : 'bottom';
  const space = Math.max(0, side === 'bottom' ? spaceBelow : spaceAbove);
  const h = Math.min(size.height, space);
  const top = side === 'bottom' ? a.top + a.height + gap : a.top - gap - h;
  const rawLeft = align === 'start' ? a.left : align === 'end' ? a.left + a.width - size.width : a.left + a.width / 2 - size.width / 2;
  const left = size.width >= vp.width - pad * 2 ? pad : clamp(rawLeft, pad, vp.width - size.width - pad);
  const ax = align === 'start' ? a.left : align === 'end' ? a.left + a.width : a.left + a.width / 2;
  const ox = clamp(ax - left, 0, size.width);
  return { left, top, side, origin: `${Math.round(ox)}px ${side === 'bottom' ? 'top' : 'bottom'}`, maxHeight: Math.floor(space) };
}

/** 'bottom-start' 같은 배치 문자열을 풀어 쓴다 */
export function parsePlacement(s: string | undefined): { side: PopSide; align: PopAlign } {
  const [a, b] = (s ?? 'bottom-start').split('-');
  return { side: a === 'top' ? 'top' : 'bottom', align: b === 'end' ? 'end' : b === 'center' ? 'center' : 'start' };
}

// ---------- 포커스를 가진 항목이 사라졌을 때의 대체 대상(DOM 비의존) ----------

/** 항목이 사라진 자리(index, 사라지기 전 번호)에서 남은 count 개 중 포커스를 받을 이웃의 번호. 같은 번호의 다음 항목이 우선, 끝이면 앞 항목. 비었으면 -1 */
export function neighborIndex(index: number, count: number): number {
  if (count <= 0) return -1;
  return Math.min(Math.max(index, 0), count - 1);
}

/**
 * 포커스가 '살아 있는가'. body 이거나 DOM 에서 떨어졌거나, 닫히는 중인 층·inert·aria-hidden 안에 있으면 죽은 것으로 본다
 * (닫히는 층의 옵션은 연출이 끝날 때까지 DOM 에 남아 있어 isConnected 만으로는 살아 있는 것처럼 보인다).
 */
export function focusIsLive(s: { isBody: boolean; connected: boolean; inClosingLayer: boolean; inertOrHidden: boolean }): boolean {
  return !s.isBody && s.connected && !s.inClosingLayer && !s.inertOrHidden;
}

export type RestoreChoice = 'opener' | 'fallback' | 'none';
/** 층이 닫힌 뒤 포커스를 어디로 돌릴지: 연 요소가 살아 있으면 그곳, 사라졌으면 호출한 화면이 준 대체 대상, 그 밖에는 건드리지 않는다 */
export function restoreChoice(s: { wasTop: boolean; focusNowhere: boolean; focusInsideClosed: boolean; openerAlive: boolean }): RestoreChoice {
  if (!s.wasTop || !(s.focusNowhere || s.focusInsideClosed)) return 'none';
  return s.openerAlive ? 'opener' : 'fallback';
}

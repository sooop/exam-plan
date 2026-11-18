// 툴팁 action: <button use:tip={{ title: '닫기', kbd: 'Esc' }}> 또는 use:tip="닫기".
// 터치에서는 띄우지 않고, 키보드 포커스는 :focus-visible 일 때만 띄운다. 누르면·Esc·스크롤·끌기 중에는 닫는다.
// 위치는 층 팝오버와 같은 placePopover 로 잡는다. 네이티브 title 은 쓰지 않는다.
import { Motion } from '../motion/motion';
import { placePopover } from './layerCore';

export interface TipOptions {
  title: string;
  /** 설명 줄 */
  lines?: string[];
  /** 단축키(키 모양으로 그린다) */
  kbd?: string;
  /** 표시 지연(ms). 기본 400, 촘촘한 목록은 800 */
  delay?: number;
  /** 직전에 툴팁을 닫았으면 지연 없이 띄울지. 촘촘한 목록은 false */
  warm?: boolean;
  /** 참이면 띄우지 않는다(여러 개를 고르는 중 등) */
  quiet?: () => boolean;
  placement?: 'top' | 'bottom';
}
export type TipParam = string | TipOptions | null | undefined;

const DEFAULT_DELAY = 400;
/** 직전 툴팁을 닫은 뒤 이 시간 안에 다른 곳에 올리면 지연 없이 띄운다 */
const WARM_MS = 300;

const norm = (p: TipParam): TipOptions | null => (typeof p === 'string' ? (p ? { title: p } : null) : p && p.title ? p : null);

let lastHide = 0;
let shown: { el: HTMLElement; owner: HTMLElement } | null = null;
let seq = 0;

function hideShown(): void {
  if (!shown) return;
  const { el } = shown;
  shown = null;
  lastHide = performance.now();
  Motion.leave(el, 'tip');
}

function show(owner: HTMLElement, o: TipOptions): void {
  hideShown();
  const el = document.createElement('div');
  el.className = 'ui-tip';
  el.setAttribute('role', 'tooltip');
  el.id = `ui-tip-${++seq}`;
  const t = document.createElement('div');
  t.textContent = o.title;
  if (o.kbd) {
    const k = document.createElement('kbd');
    k.textContent = o.kbd;
    t.appendChild(k);
  }
  el.appendChild(t);
  for (const line of o.lines ?? []) {
    const d = document.createElement('div');
    d.textContent = line;
    el.appendChild(d);
  }
  el.style.visibility = 'hidden';
  document.body.appendChild(el);
  const r = owner.getBoundingClientRect();
  const s = el.getBoundingClientRect();
  const p = placePopover({
    anchor: { left: r.left, top: r.top, width: r.width, height: r.height },
    size: { width: s.width, height: s.height },
    viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
    side: o.placement ?? 'bottom',
    align: 'center',
    gap: 6,
  });
  el.style.left = `${p.left}px`;
  el.style.top = `${p.top}px`;
  el.style.visibility = '';
  shown = { el, owner };
  void Motion.enter(el, 'tip');
}

export function tip(node: HTMLElement, param: TipParam) {
  let opts = norm(param);
  let timer = 0;

  const cancel = () => {
    clearTimeout(timer);
    timer = 0;
  };
  const hide = () => {
    cancel();
    if (shown?.owner === node) hideShown();
  };
  const schedule = (viaPointer: boolean) => {
    cancel();
    if (!opts || opts.quiet?.()) return;
    if (document.documentElement.classList.contains('mo-dragging')) return;
    if (node.hasAttribute('disabled') && !node.hasAttribute('data-tip-disabled')) return;
    const warm = opts.warm !== false && performance.now() - lastHide < WARM_MS;
    const delay = warm || !viaPointer ? 0 : (opts.delay ?? DEFAULT_DELAY);
    timer = window.setTimeout(() => {
      timer = 0;
      if (opts) show(node, opts);
    }, delay);
  };

  const onEnter = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return; // 터치에서는 띄우지 않는다
    // 여러 개를 고르는 중(Ctrl·Shift)에는 띄우지 않는다
    if (e.ctrlKey || e.shiftKey || e.metaKey) return;
    schedule(true);
  };
  const onFocus = () => {
    // 마우스 클릭으로 생긴 포커스에는 띄우지 않는다
    if (node.matches(':focus-visible')) schedule(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && shown?.owner === node) {
      hide(); // 툴팁만 닫는다: 층의 Esc 로 번지지 않게 하지는 않는다(툴팁은 층이 아니다)
    }
  };
  const onScroll = () => hide();

  node.addEventListener('pointerenter', onEnter);
  node.addEventListener('pointerleave', hide);
  node.addEventListener('pointerdown', hide);
  node.addEventListener('focus', onFocus);
  node.addEventListener('blur', hide);
  node.addEventListener('keydown', onKey);
  window.addEventListener('scroll', onScroll, true);

  return {
    update(next: TipParam) {
      opts = norm(next);
      if (!opts) hide();
    },
    destroy() {
      hide();
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', hide);
      node.removeEventListener('pointerdown', hide);
      node.removeEventListener('focus', onFocus);
      node.removeEventListener('blur', hide);
      node.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    },
  };
}

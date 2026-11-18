// 층 스택: 모달·서랍·시트·팝오버가 하나의 스택을 쓴다. 판정은 layerCore.ts(순수 함수), 여기는 리스너·inert·포커스 가두기만 맡는다.
import { FOCUSABLE_SELECTOR, inertPlan, routeKey, topEntry, trapTarget, type CloseReason, type LayerVariant, type StackEntry } from './layerCore';

/** Layer 컴포넌트가 스택에 맡기는 손잡이 */
export interface LayerHandle {
  /** 닫기 요청(canClose·dirty 판정을 거친다) */
  requestClose(reason: CloseReason): void;
  /** 층의 뿌리 요소(아래 층이 막힐 때 inert 가 걸린다) */
  el(): HTMLElement | null;
  /** 포커스를 가두는 범위(대화상자 본체) */
  box(): HTMLElement | null;
  /** 이 노드가 이 층(또는 팝오버의 앵커) 안에 있는가: 바깥 누름 판정 */
  contains(node: Node): boolean;
}
interface Entry extends StackEntry {
  handle: LayerHandle;
}

export { FOCUSABLE_SELECTOR };

const visible = (el: HTMLElement) => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[inert]');

class LayerStack {
  /** 열린 순서대로의 층(닫히는 중인 것도 연출이 끝날 때까지 남는다) */
  entries = $state.raw<Entry[]>([]);
  /** 앱 본체의 id. 모달·서랍·시트가 열리면 이 요소에 inert 가 걸린다(토스트·툴팁은 body 에 두므로 막히지 않는다) */
  appRootId = 'app';
  /** 팝오버의 바깥 누름이 이미 처리한 pointerdown: 아래 층의 바깥 클릭 판정이 같은 클릭으로 닫히지 않게 한다 */
  consumed = new WeakSet<Event>();
  #seq = 0;
  #listening = false;
  #offered: (() => HTMLElement | null) | null = null;
  #offerTimer = 0;

  /**
   * 층을 닫는 조작(선택 확정 등)을 하는 쪽이, 그 조작으로 연 요소가 사라질 때 포커스를 받을 대상을 미리 맡긴다.
   * 다음에 닫히는 층이 연 요소가 사라졌을 때만 한 번 불러 쓰고(Layer 의 restoreFocusTo 가 우선), 안 쓰이면 한 프레임 뒤 버린다.
   */
  offerRestore(fn: () => HTMLElement | null): void {
    this.#offered = fn;
    if (typeof requestAnimationFrame === 'undefined') return;
    const mine = ++this.#offerTimer;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (mine === this.#offerTimer) this.#offered = null; }));
  }
  takeRestore(): (() => HTMLElement | null) | null {
    const f = this.#offered;
    this.#offered = null;
    return f;
  }

  /** 맨 위 층의 id(닫히는 중인 것은 제외). 없으면 0 */
  get topId(): number {
    return topEntry(this.entries)?.id ?? 0;
  }
  /** 닫히는 중이 아닌 층의 수 */
  get depth(): number {
    return this.entries.filter((e) => !e.closing).length;
  }
  isTop(id: number): boolean {
    return this.topId === id;
  }
  /** z-index 에 더할 순번 */
  indexOf(id: number): number {
    return this.entries.findIndex((e) => e.id === id);
  }

  register(variant: LayerVariant, handle: LayerHandle): number {
    const id = ++this.#seq;
    this.entries = [...this.entries, { id, variant, closing: false, handle }];
    this.#listen();
    this.#sync();
    return id;
  }
  unregister(id: number): void {
    if (!this.entries.some((e) => e.id === id)) return;
    this.entries = this.entries.filter((e) => e.id !== id);
    if (!this.entries.length) this.#unlisten();
    this.#sync();
  }
  setClosing(id: number, closing: boolean): void {
    this.entries = this.entries.map((e) => (e.id === id ? { ...e, closing } : e));
    this.#sync();
  }

  /** 프로그램에서 맨 위 층을 닫는다. 닫을 층이 없으면 false */
  closeTop(reason: CloseReason = 'api'): boolean {
    const t = topEntry(this.entries);
    if (!t) return false;
    t.handle.requestClose(reason);
    return true;
  }
  /** 모든 층을 위에서부터 닫는다(각 층의 canClose·dirty 판정을 거친다) */
  closeAll(reason: CloseReason = 'api'): void {
    for (const e of [...this.entries].reverse()) if (!e.closing) e.handle.requestClose(reason);
  }

  /** 뒤 화면 막기: 맨 위 막는 층 아래의 앱 본체와 층에 inert 를 건다 */
  #sync(): void {
    if (typeof document === 'undefined') return;
    const plan = inertPlan(this.entries);
    const app = document.getElementById(this.appRootId);
    if (app) app.inert = plan.app;
    for (const e of this.entries) {
      const el = e.handle.el();
      if (el) el.inert = plan.layers.includes(e.id);
    }
  }

  #listen(): void {
    if (this.#listening || typeof document === 'undefined') return;
    this.#listening = true;
    // 안쪽 핸들러가 먼저 처리할 수 있도록 Esc·Tab 은 버블 단계에서 받는다
    document.addEventListener('keydown', this.#onKey);
    document.addEventListener('pointerdown', this.#onPointerDown, true);
  }
  #unlisten(): void {
    if (!this.#listening) return;
    this.#listening = false;
    document.removeEventListener('keydown', this.#onKey);
    document.removeEventListener('pointerdown', this.#onPointerDown, true);
  }

  #onKey = (e: KeyboardEvent): void => {
    const r = routeKey(this.entries, e);
    if (r.kind === 'none') return;
    const entry = this.entries.find((x) => x.id === r.id);
    if (!entry) return;
    if (r.kind === 'close') {
      e.preventDefault();
      e.stopPropagation();
      entry.handle.requestClose('escape');
      return;
    }
    // Tab: 팝오버는 닫는다(포커스는 연 요소로). 나머지는 창 안에서만 돈다
    if (r.variant === 'popover') {
      e.preventDefault();
      entry.handle.requestClose('tab');
      return;
    }
    const box = entry.handle.box();
    if (!box) return;
    const list = [...box.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(visible);
    const active = list.indexOf(document.activeElement as HTMLElement);
    let around: { before: number; after: number } | undefined;
    if (active < 0) {
      // 목록 밖 요소(tabindex=-1 인 롤빙 항목·창 자신)에 포커스가 있으면 앞뒤에 후보가 남았는지 본다
      const cur = document.activeElement;
      if (cur && cur !== box && box.contains(cur)) {
        const before = list.filter((x) => cur.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_PRECEDING).length;
        around = { before, after: list.length - before };
      }
    }
    const to = trapTarget(list.length, active, r.shift, around);
    if (to === null) return;
    e.preventDefault();
    (to < 0 ? box : list[to]).focus({ preventScroll: true });
  };

  #onPointerDown = (e: PointerEvent): void => {
    const t = topEntry(this.entries);
    if (!t || t.variant !== 'popover') return;
    const node = e.target as Node | null;
    if (!node || t.handle.contains(node)) return;
    this.consumed.add(e);
    t.handle.requestClose('backdrop');
  };
}

export const layerStack = new LayerStack();

// Motion 의 공개 형태. motion.ts 의 본문은 형 검사를 끄고 있으므로, 쓰는 쪽은 이 선언만 믿는다.

/** enter·leave 가 아는 종류(값표는 ui-motion SKILL.md) */
export type MotionKind =
  | 'tip' | 'pop' | 'modal' | 'backdrop'
  | 'panel-right' | 'panel-left' | 'panel-bottom'
  | 'toast' | 'overlay' | 'list';

export type SpringName = 'pop' | 'bouncy' | 'glide' | 'heavy' | 'snappy';
export interface SpringSpec { k: number; c: number; m?: number }
export interface SolvedSpring { duration: number; css: string; fn: (p: number) => number }

export type FlashAction = 'convert' | 'insert' | 'tidy' | 'conflict' | 'remove';
export type FlashKind = 'info' | 'success' | 'accent' | 'warn' | 'danger';

export interface FlyRect { left: number; top: number; width: number; height: number }

export interface DragGhostOptions {
  /** 끄는 요소들. 첫 번째가 집은 것이고 최대 4장이 부채꼴로 보인다 */
  items: HTMLElement[];
  /** 개수 배지(2 이상일 때만 보인다). 생략하면 items.length */
  count?: number;
  pointer: { x: number; y: number };
  /** 고스트 아래 설명 띠 */
  label?: string;
}

export interface DragGhostHandle {
  el: HTMLElement;
  /** 포인터 위치를 알린다(고스트는 스프링으로 따라온다) */
  move(x: number, y: number): void;
  setLabel(text: string): void;
  /** 바깥 대상 위에 올라가면 true: 절반 크기로 줄어든다 */
  setInto(v: boolean): void;
  /** 지금 화면 위의 사각형(집은 것 기준) */
  rect(): FlyRect;
  /** 놓았다: rect(들어갈 자리의 화면 사각형)에 내려앉은 뒤 사라진다 */
  land(rect: FlyRect): Promise<void>;
  /** 대상 안으로 빨려 들어간 뒤 사라지고, 대상이 pulse 로 받는다 */
  into(target: Element): Promise<void>;
  /** 취소: home(기본은 집은 요소)의 현재 자리로 돌아간 뒤 사라진다 */
  cancel(home?: Element): Promise<void>;
  /** 연출 없이 즉시 치운다(여러 번 불러도 안전) */
  destroy(): void;
}

export interface SortableOptions {
  handle?: string;
  group?: (item: HTMLElement) => HTMLElement[] | null;
  label?: (items: HTMLElement[], target: Element | null) => string;
  onMove?: (e: { item: HTMLElement; items: HTMLElement[]; from: number; to: number }) => void;
  onDropInto?: (e: { items: HTMLElement[]; target: Element }) => void;
}

export interface MotionApi {
  MOTION: Record<string, Record<string, number>>;
  SPRING: Record<SpringName, SpringSpec>;
  LIST_FX_MAX: number;
  /** 애니메이션이 켜져 있는가(data-anim !== 'off') */
  on(): boolean;
  /** 동작 줄이기 */
  reduced(): boolean;
  spring(bounce?: number): (t: number) => number;
  springOf(spec: SpringName | SpringSpec): SolvedSpring;
  /** 이미 보이게 한 요소를 나타낸다 */
  enter(el: Element | null | undefined, kind: MotionKind | Record<string, unknown>): Promise<void>;
  /** 사라지게 한 뒤 after 를 부른다(생략하면 DOM 에서 제거). 도중에 enter 가 불리면 after 는 실행되지 않는다 */
  leave(el: Element | null | undefined, kind: MotionKind | Record<string, unknown>, after?: () => void): Promise<void>;
  dialog: { open(d: HTMLDialogElement): Promise<void>; close(d: HTMLDialogElement, value?: string): Promise<void> };
  slide(el: HTMLElement, open: boolean): Promise<void>;
  flash(target: Element | DOMRect | null | undefined, action?: FlashAction | FlashKind): Promise<void>;
  FLASH_ACTION: Record<FlashAction, FlashKind>;
  insert(el: Element | null | undefined): Promise<void>;
  /** danger flash 로 알린 뒤 접히며 사라지고 DOM 에서 제거된다 */
  remove(el: Element | null | undefined): Promise<void>;
  /** mutate 가 자식 순서·구성을 바꾸는 동안 남은 자식이 미끄러져 자리를 잡는다 */
  flip(container: Element, mutate: () => void, skip?: Element | null, springName?: SpringName | null): void;
  pulse(el: Element | null | undefined, strength?: number): void;
  ghostOf(el: HTMLElement, count: number): HTMLElement;
  flyGhost(el: HTMLElement, from: FlyRect, to: FlyRect, into?: boolean): Promise<void>;
  dragGhost(o: DragGhostOptions): DragGhostHandle;
  sortable(list: HTMLElement, opts?: SortableOptions): () => void;
}

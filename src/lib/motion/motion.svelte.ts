// Svelte 전환(transition:) 판: 값은 motion.ts 의 Motion.MOTION 표(단일 출처)를 그대로 읽는다.
// 쓰는 것만 둔다: panelFx(일괄 막대 등), slideFx(접기·펼치기·인라인 확인·배너), listFx(목록 항목).
// <html data-anim="off"> 이면 모든 효과가 길이 0 이다. 동작 줄이기에서는 이동·확대 없이 90ms 페이드만.
import { Motion, motionEnabled, prefersReducedMotion } from './motion';

const MOTION = Motion.MOTION;
/** 닫힘 길이(ms): motion.ts KINDS 의 'panel-*'(170)와 slide()(200)와 같은 값 */
const EXIT = { panel: 170, slide: 200 };

/** 애니메이션이 켜져 있는가(<html data-anim="off"> 이 아닌가) */
export const animOn = motionEnabled;
/** OS 의 '동작 줄이기': 이동·확대·스프링 없이 페이드만 한다 */
const reduced = prefersReducedMotion;

// ---- 이징 ----
/** cubic-bezier 와 같은 곡선 */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t: number) => ((ax * t + bx) * t + cx) * t;
  const Y = (t: number) => ((ay * t + by) * t + cy) * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 20; i++) {
      const d = X(t) - x;
      if (Math.abs(d) < 1e-5) break;
      if (d > 0) hi = t; else lo = t;
      t = (lo + hi) / 2;
    }
    return Y(t);
  };
}
/** 강한 ease-out: cubic-bezier(.2,.8,.2,1) */
export const easeOut = bezier(0.2, 0.8, 0.2, 1);

type Dir = { direction: 'in' | 'out' | 'both' };
type Fx = { delay?: number; duration: number; easing?: (t: number) => number; css: (t: number, u: number) => string };
const NONE: Fx = { duration: 0, css: () => '' };
const easeIn = (t: number) => t * t * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** 요소가 이미 가진 transform(위치 잡기용 등)을 보존하며 덧붙인다 */
function baseTransform(node: Element) {
  const t = getComputedStyle(node).transform;
  return t === 'none' ? '' : t + ' ';
}

/** 패널·시트. side: 어느 쪽에서 들어오는지 */
export function panelFx(node: Element, p: { side?: 'left' | 'right' | 'bottom' } | undefined, { direction }: Dir): Fx {
  if (!animOn()) return NONE;
  const out = direction === 'out', red = reduced(), base = baseTransform(node);
  const d = MOTION.panel.x, side = p?.side ?? 'right';
  const x = side === 'left' ? -d : side === 'right' ? d : 0, y = side === 'bottom' ? d : 0;
  return {
    duration: out ? (red ? 90 : EXIT.panel) : MOTION.panel.ms,
    easing: out ? easeIn : easeOut,
    css: (t, u) => (red ? `opacity:${Math.min(1, t)}` : `opacity:${Math.min(1, t)};transform:${base}translate(${x * u}px,${y * u}px)`),
  };
}

/**
 * 높이가 펼쳐지고 접히는 슬라이드(ui-motion 표 '접기·펼치기': 열림 220ms ease-out, 닫힘 200ms ease-in-out).
 * 접기·펼치기 영역, 인라인 확인 블록, 배너에 `transition:slideFx`(부모 {#if} 에 맞춰 재생하려면 `|global`).
 * p.off 면 연출 없음. 동작 줄이기에서는 높이 변화 없이 90ms 페이드만.
 */
export function slideFx(node: Element, p?: { off?: boolean }, { direction }: Dir = { direction: 'both' }): Fx {
  if (!animOn() || p?.off) return NONE;
  const st = getComputedStyle(node), red = reduced();
  const h = (node as HTMLElement).offsetHeight;
  const pt = parseFloat(st.paddingTop), pb = parseFloat(st.paddingBottom), mt = parseFloat(st.marginTop), mb = parseFloat(st.marginBottom);
  return {
    duration: red ? 90 : direction === 'out' ? EXIT.slide : MOTION.panel.ms,
    easing: direction === 'out' ? easeInOut : easeOut,
    css: (t) => red
      ? `opacity:${t}`
      : `overflow:hidden;opacity:${Math.min(1, t * 1.4)};height:${t * h}px;padding-top:${t * pt}px;padding-bottom:${t * pb}px;margin-top:${t * mt}px;margin-bottom:${t * mb}px`,
  };
}

// ---- 목록 항목(카드)의 들고 남: flash 없이 흐려지며 나타나고 사라진다. 보기 전환·검색처럼 여러 장이 한꺼번에 바뀔 때 쓴다 ----
/** `{#each}` 항목에 transition:listFx 로 붙인다(자리 이동은 animate:flip 이 맡는다). off 이면 길이 0 */
export function listFx(_node: Element, p: { off?: boolean } | undefined, { direction }: Dir): Fx {
  if (!animOn() || p?.off) return NONE;
  const out = direction === 'out', red = reduced();
  return {
    duration: red ? 90 : Math.round(out ? MOTION.list.ms * 0.75 : MOTION.list.ms),
    easing: easeOut,
    // animate:flip 이 같은 요소의 transform 을 쓰므로 겹치지 않게 개별 속성(scale·translate)으로 움직인다
    css: (t, u) => red ? `opacity:${t}` : `opacity:${t};scale:${1 - 0.04 * u};translate:0 ${out ? 0 : -6 * u}px`,
  };
}

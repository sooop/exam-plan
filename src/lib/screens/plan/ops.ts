// 준비 계획 화면의 DOM 도우미(포커스 되찾기, 접기·펼치기 action, 과목 정보). 순수 로직은 logic.ts.
import { tick } from 'svelte';
import { app } from '../../app/app.svelte';
import { PALETTE, subjectOf } from '../../core';
import type { Exam, Task } from '../../core/types';
import { Motion } from '../../motion/motion';
import { focusIsLive } from '../../ui/layerCore';
import { layerStack } from '../../ui/layerStack.svelte';
import { T } from '../shared/texts';

/** 할일의 과목 이름·색(과목이 사라졌으면 기본 색) */
export function subjectFor(ex: Exam, t: Task): { name: string; color: string } {
  const es = ex.subs.find((s) => s.id === t.esId);
  return es ? subjectOf(app.state, es) : { name: T.noName, color: PALETTE[7] };
}

/** 구역 표시: 달력 칸(cal)·날짜 상세 패널(day)·보관함(vault). 칩의 소속을 알아낼 때 쓴다 */
export type Region = 'cal' | 'day' | 'vault';
export const regionOf = (el: Element | null): Region | null => (el?.closest<HTMLElement>('[data-region]')?.dataset.region as Region | undefined) ?? null;

const visible = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/** root 안에서 그 할일의 칩 요소들(달력 칸·상세·보관함에 각각 있을 수 있다) */
export const chipRoots = (root: ParentNode, id: string): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-task-id]')).filter((el) => el.dataset.taskId === id);

/** 눈에 보이는 칩 요소. prefer 순서로 구역을 먼저 본다 */
export function visibleChip(root: ParentNode, id: string, prefer: readonly (Region | null)[] = []): HTMLElement | null {
  const all = chipRoots(root, id).filter(visible);
  for (const r of prefer) {
    const hit = all.find((el) => regionOf(el) === r);
    if (hit) return hit;
  }
  return all[0] ?? null;
}

/** 포커스가 body 이거나 사라졌거나 닫히는 층·inert·aria-hidden 안에 있으면 잃은 것으로 본다 */
const focusLost = (): boolean => {
  const a = document.activeElement;
  return !a || !focusIsLive({
    isBody: a === document.body || a === document.documentElement,
    connected: a.isConnected,
    inClosingLayer: !!a.closest('[data-closing]'),
    inertOrHidden: !!a.closest('[inert], [aria-hidden="true"]'),
  });
};

/**
 * 포커스가 body 로 떨어졌으면(칩이 사라지거나 다른 칸에서 새로 만들어졌으면) 그 할일의 칩 본체로, 칩이 안 보이면 fallback(칸 등)으로 준다.
 * 포커스가 살아 있으면 건드리지 않는다. 시트·토스트가 포커스를 돌려주는 것이 끝난 뒤에 보도록 한 프레임 미룬다.
 */
export function rescueFocus(root: ParentNode, id: string, prefer: readonly (Region | null)[], fallback: () => HTMLElement | null): void {
  const target = (): HTMLElement | null => visibleChip(root, id, prefer)?.querySelector<HTMLElement>('button.main') ?? fallback();
  // 날짜 시트가 닫히며 연 요소가 사라졌으면 Layer 가 이 대상을 부른다
  layerStack.offerRestore(target);
  requestAnimationFrame(() => {
    if (!focusLost()) return;
    const btn = visibleChip(root, id, prefer)?.querySelector<HTMLElement>('button.main') ?? null;
    if (btn) {
      btn.focus();
      if (!focusLost()) return;
    }
    fallback()?.focus();
  });
}

/**
 * 값이 바뀐 칸들에 받는 반응(색 띠 flash)을 보인다: 일괄 바쁨 정도 변경·리캡 배치처럼 사용자가 어디가 바뀌었는지 눈으로 따라가야 할 때.
 * DOM 이 갱신된 뒤 한 프레임 미뤄 그린다. 한 번에 최대 42칸(6주)만 보인다.
 */
export function acknowledgeCells(isos: readonly string[]): void {
  if (!isos.length) return;
  void tick().then(() => {
    requestAnimationFrame(() => {
      for (const iso of isos.slice(0, 42)) void Motion.flash(document.querySelector<HTMLElement>('.pl-cell[data-date="' + iso + '"]'), 'tidy');
    });
  });
}

/** 칸 안 칩의 버튼은 탭 정지점에서 뺀다(격자 전체가 정지점 하나. 칩은 클릭·끌기·Alt+방향키·날짜 상세로 닿는다) */
export function quietTabs(node: HTMLElement) {
  const fix = () => {
    node.querySelectorAll<HTMLElement>('button').forEach((b) => {
      if (b.tabIndex !== -1) b.tabIndex = -1;
    });
  };
  fix();
  const mo = new MutationObserver(fix);
  mo.observe(node, { childList: true, subtree: true });
  return { destroy: () => mo.disconnect() };
}

/** 접기·펼치기: 처음에는 연출 없이 hidden 만 맞추고, 값이 바뀌면 Motion.slide. 애니메이션을 끄면 즉시 */
export function collapsible(node: HTMLElement, open: boolean) {
  node.hidden = !open;
  return {
    update(next: boolean) {
      void Motion.slide(node, next);
    },
  };
}

/** 이 요소 안에서 숨김이 아닌 첫 포커스 후보(옮기기 단추가 숨겨진 칸 칩의 시트 복귀용) */
export function openerFor(opener: HTMLElement): HTMLElement {
  if (visible(opener)) return opener;
  return opener.closest('[data-task-id]')?.querySelector<HTMLElement>('button.main') ?? opener;
}

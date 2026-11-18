// 오늘 탭의 변경 + 연출 + 포커스. 변경은 app.mutate 로만 한다(완료·옮기기는 shared/actions, 이월은 여기).
// 사용자의 조작으로 생긴 변화에만 Motion.flip 을 입힌다(첫 렌더는 이 함수를 거치지 않으므로 제외된다).
// 목록 상한(80개)은 Motion.flip 이 스스로 지킨다.
import { flushSync } from 'svelte';
import { app } from '../../app/app.svelte';
import { S, fmtMD } from '../../app/strings';
import { carryOver, getExam } from '../../core/planner';
import { Motion } from '../../motion/motion';
import { focusIsLive, neighborIndex } from '../../ui/layerCore';
import { layerStack } from '../../ui/layerStack.svelte';
import { moveTasksTo, toggleTaskDone } from '../shared/actions';
import { TT } from './texts';

/** 포커스 기억: 조작한 행이 속한 구역(data-list)과 그 구역 안의 번호. 행이 사라지면 이 자리의 이웃 행으로 옮긴다 */
export interface FocusCtx {
  list: string | null;
  index: number;
}

const rowsIn = (scope: ParentNode): HTMLElement[] => [...scope.querySelectorAll<HTMLElement>('[data-row]')];

/** 요소가 속한 행의 구역과 번호(조작 전에 잰다) */
export function ctxOf(el: Element): FocusCtx {
  const row = el.closest<HTMLElement>('[data-row]');
  const scope = row?.closest<HTMLElement>('[data-list]') ?? null;
  const rows = scope ? rowsIn(scope) : [];
  return { list: scope?.dataset.list ?? null, index: row ? rows.indexOf(row) : -1 };
}

/** 조작으로 생긴 자리 이동: 목록 안의 남은 행이 미끄러져 자리를 잡는다. mutate 안에서 DOM 이 동기로 바뀌어야 한다 */
export function flipAll(root: HTMLElement, mutate: () => void): void {
  const lists = [...root.querySelectorAll<HTMLElement>('[data-flip]')];
  const run = lists.reduceRight<() => void>((inner, box) => () => Motion.flip(box, inner), mutate);
  run();
}

/** 요소(또는 그 조상)가 닫히는 층 안이거나 inert·aria-hidden 으로 가려져 있는가 */
const isDead = (a: Element | null): boolean =>
  !a || !focusIsLive({
    isBody: a === document.body || a === document.documentElement,
    connected: a.isConnected,
    inClosingLayer: !!a.closest('[data-closing]'),
    inertOrHidden: !!a.closest('[inert], [aria-hidden="true"]'),
  });

/** 같은 구역의 이웃 행(구역이 비면 화면의 다른 행)의 단추, 행이 하나도 없으면 화면 머리(root) */
export function neighborTarget(root: HTMLElement, ctx: FocusCtx): HTMLElement {
  const scope = ctx.list ? root.querySelector<HTMLElement>(`[data-list="${CSS.escape(ctx.list)}"]`) : null;
  let rows = scope ? rowsIn(scope) : [];
  if (!rows.length) rows = rowsIn(root);
  const i = neighborIndex(ctx.index, rows.length);
  if (i < 0) return root;
  return rows[i].querySelector<HTMLElement>('button') ?? root;
}

/**
 * 포커스가 어디에도 없거나(body) 닫히는 층 안에 남아 있으면(행이 사라졌으면) 같은 구역의 이웃 행으로 옮긴다.
 * 구역이 비었으면 화면의 다른 행, 그것도 없으면 화면 머리(root)로 준다. 포커스가 살아 있으면 건드리지 않는다.
 */
export function refocus(root: HTMLElement, ctx: FocusCtx): void {
  if (!isDead(document.activeElement)) return;
  neighborTarget(root, ctx).focus();
}

/** 변경 뒤 포커스를 정한다. 시트·토스트가 닫히며 포커스를 돌리는 것이 끝난 뒤에 본다 */
export function afterChange(root: HTMLElement, ctx: FocusCtx): void {
  requestAnimationFrame(() => refocus(root, ctx));
}

/** 완료 토글(shared/actions.toggleTaskDone). 행이 구역을 옮기거나 사라지면 포커스는 afterChange 가 맞춘다 */
export function doToggle(root: HTMLElement, examId: string, taskId: string, row: HTMLElement): void {
  const ctx = ctxOf(row);
  flipAll(root, () => flushSync(() => { toggleTaskDone(examId, taskId); }));
  afterChange(root, ctx);
}

/** 날짜 옮기기(shared/actions.moveTasksTo). iso 가 null 이면 보관함으로 */
export function doMove(root: HTMLElement, examId: string, taskId: string, iso: string | null, ctx: FocusCtx): void {
  flipAll(root, () => flushSync(() => { moveTasksTo(examId, [taskId], iso); }));
  // 날짜 시트가 닫히며 연 단추(옮겨진 행 안)가 사라졌으면 이웃 행으로: 시트가 닫히는 그 순간 Layer 가 부른다
  layerStack.offerRestore(() => neighborTarget(root, ctx));
  afterChange(root, ctx);
}

/** 지연 할일을 오늘(또는 준비 시작일)로 옮긴다. 큰 변경이라 되돌리기 토스트를 띄운다 */
export function doCarry(root: HTMLElement, examId: string, today: string): void {
  const box: { moved: number; target: string | null } = { moved: 0, target: null };
  flipAll(root, () => flushSync(() => {
    const r = app.mutate(TT.mutCarry, (s) => {
      const e = getExam(s, examId);
      return e ? carryOver(e, today) : { moved: 0, target: null };
    }, { big: true });
    box.moved = r.moved;
    box.target = r.target;
  }));
  if (box.moved > 0 && box.target) app.toastUndo(S.carried(box.moved, fmtMD(box.target)));
  afterChange(root, { list: 'today', index: 0 });
}

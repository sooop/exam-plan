import { describe, expect, it } from 'vitest';
import {
  FOCUSABLE_SELECTOR, createBackdropGuard, decideClose, hasBlockingBelow, inertPlan, isImeKey, isTop, parsePlacement, placePopover, routeKey,
  shouldRestoreFocus, topEntry, trapTarget, type StackEntry,
} from '../../src/lib/ui/layerCore';
import { layerStack, type LayerHandle } from '../../src/lib/ui/layerStack.svelte';

const e = (id: number, variant: StackEntry['variant'], closing = false): StackEntry => ({ id, variant, closing });

describe('맨 위 판정', () => {
  it('닫히는 중인 층은 맨 위가 아니다', () => {
    const s = [e(1, 'modal'), e(2, 'drawer', true)];
    expect(topEntry(s)?.id).toBe(1);
    expect(isTop(s, 1)).toBe(true);
    expect(isTop(s, 2)).toBe(false);
  });
  it('빈 스택은 맨 위가 없다', () => {
    expect(topEntry([])).toBeNull();
  });
});

describe('Esc·Tab 라우팅', () => {
  const stack = [e(1, 'modal'), e(2, 'popover')];
  it('Esc 는 맨 위 층만 받는다', () => {
    expect(routeKey(stack, { key: 'Escape' })).toEqual({ kind: 'close', id: 2 });
    expect(routeKey([e(1, 'modal'), e(2, 'drawer')], { key: 'Escape' })).toEqual({ kind: 'close', id: 2 });
  });
  it('Tab 도 맨 위 층만 받고, 팝오버인지 알린다', () => {
    expect(routeKey(stack, { key: 'Tab', shiftKey: true })).toEqual({ kind: 'tab', id: 2, variant: 'popover', shift: true });
    expect(routeKey([e(1, 'modal')], { key: 'Tab' })).toEqual({ kind: 'tab', id: 1, variant: 'modal', shift: false });
  });
  it('한글 조합 중(isComposing, keyCode 229)이면 무시한다', () => {
    expect(routeKey(stack, { key: 'Escape', isComposing: true })).toEqual({ kind: 'none' });
    expect(routeKey(stack, { key: 'Escape', keyCode: 229 })).toEqual({ kind: 'none' });
    expect(isImeKey({ isComposing: true })).toBe(true);
    expect(isImeKey({ keyCode: 229 })).toBe(true);
    expect(isImeKey({ keyCode: 27 })).toBe(false);
  });
  it('안쪽에서 이미 처리한 키(defaultPrevented)는 건너뛴다', () => {
    expect(routeKey(stack, { key: 'Escape', defaultPrevented: true })).toEqual({ kind: 'none' });
  });
  it('층이 없거나 다른 키면 아무것도 하지 않는다', () => {
    expect(routeKey([], { key: 'Escape' })).toEqual({ kind: 'none' });
    expect(routeKey(stack, { key: 'Enter' })).toEqual({ kind: 'none' });
    expect(routeKey(stack, { key: 'Escape', ctrlKey: true })).toEqual({ kind: 'none' });
  });
});

describe('배경 막기(inert)', () => {
  it('층이 없으면 아무것도 막지 않는다', () => {
    expect(inertPlan([])).toEqual({ app: false, layers: [] });
  });
  it('모달·서랍·시트는 앱 본체를 막는다', () => {
    for (const v of ['modal', 'drawer', 'sheet'] as const) expect(inertPlan([e(1, v)])).toEqual({ app: true, layers: [] });
  });
  it('팝오버만 있으면 아무것도 막지 않는다', () => {
    expect(inertPlan([e(1, 'popover')])).toEqual({ app: false, layers: [] });
  });
  it('맨 위 막는 층보다 아래의 층은 모두 막고, 그 위 팝오버는 막지 않는다', () => {
    expect(inertPlan([e(1, 'drawer'), e(2, 'popover'), e(3, 'modal'), e(4, 'popover')])).toEqual({ app: true, layers: [1, 2] });
  });
  it('닫히는 중인 층은 막는 층으로 치지 않아 뒤 화면이 바로 풀린다', () => {
    expect(inertPlan([e(1, 'modal', true)])).toEqual({ app: false, layers: [] });
    expect(inertPlan([e(1, 'drawer'), e(2, 'modal', true)])).toEqual({ app: true, layers: [] });
  });
  it('이미 막는 층이 아래에 있으면 딤을 겹치지 않는다', () => {
    expect(hasBlockingBelow([e(1, 'modal')])).toBe(true);
    expect(hasBlockingBelow([e(1, 'popover')])).toBe(false);
    expect(hasBlockingBelow([e(1, 'modal', true)])).toBe(false);
  });
});

describe('Tab 가두기', () => {
  it('가장자리에서만 되돌린다', () => {
    expect(trapTarget(3, 2, false)).toBe(0);
    expect(trapTarget(3, 0, true)).toBe(2);
    expect(trapTarget(3, 1, false)).toBeNull();
    expect(trapTarget(3, 1, true)).toBeNull();
  });
  it('창 밖에 포커스가 있으면 창 안으로 들인다', () => {
    expect(trapTarget(3, -1, false)).toBe(0);
    expect(trapTarget(3, -1, true)).toBe(2);
  });
  it('포커스 가능 요소가 없으면 창 자신에 머문다', () => {
    expect(trapTarget(0, -1, false)).toBe(-1);
  });
  it('후보 선택자는 모든 항목에서 tabindex=-1(음수)을 제외한다(N-H1)', () => {
    const parts = FOCUSABLE_SELECTOR.split(/,(?=[a-z\[])/);
    expect(parts.length).toBeGreaterThanOrEqual(9);
    for (const p of parts) expect(p, p).toContain(':not([tabindex^="-"])');
  });
  it('롤빙 목록(활성 항목만 후보)에서 활성 항목이 마지막이면 Tab 이 처음으로 돈다', () => {
    // 시트: [X, 활성 날짜 항목]. 비활성 21개는 후보가 아니므로 목록 길이는 2
    expect(trapTarget(2, 1, false)).toBe(0);
    expect(trapTarget(2, 0, true)).toBe(1);
  });
  it('목록 밖 요소(tabindex=-1)에 포커스가 있으면 진행 방향에 후보가 남은 동안만 기본 동작에 맡긴다', () => {
    expect(trapTarget(2, -1, false, { before: 1, after: 1 })).toBeNull();
    expect(trapTarget(2, -1, false, { before: 2, after: 0 })).toBe(0);
    expect(trapTarget(2, -1, true, { before: 0, after: 2 })).toBe(1);
    expect(trapTarget(2, -1, true, { before: 1, after: 1 })).toBeNull();
  });
});

describe('바깥 클릭 판정', () => {
  it('누름과 뗌이 모두 배경일 때만 닫는다', () => {
    const g = createBackdropGuard();
    g.down(true);
    expect(g.up(true)).toBe(true);
  });
  it('입력창에서 누르고 배경에서 놓으면 닫지 않는다', () => {
    const g = createBackdropGuard();
    g.down(false);
    expect(g.up(true)).toBe(false);
  });
  it('배경에서 누르고 창 안에서 놓으면 닫지 않는다', () => {
    const g = createBackdropGuard();
    g.down(true);
    expect(g.up(false)).toBe(false);
  });
  it('한 번 판정하면 상태를 비운다', () => {
    const g = createBackdropGuard();
    g.down(true);
    g.up(true);
    expect(g.up(true)).toBe(false);
  });
});

describe('포커스 복귀', () => {
  const base = { wasTop: true, focusNowhere: true, focusInsideClosed: false, openerAlive: true };
  it('맨 위였고 포커스가 어디에도 없거나 닫히는 층 안이면 돌린다', () => {
    expect(shouldRestoreFocus(base)).toBe(true);
    expect(shouldRestoreFocus({ ...base, focusNowhere: false, focusInsideClosed: true })).toBe(true);
  });
  it('연 요소가 사라졌으면 그대로 둔다', () => {
    expect(shouldRestoreFocus({ ...base, openerAlive: false })).toBe(false);
  });
  it('다른 곳이 이미 포커스를 가져갔으면 그대로 둔다', () => {
    expect(shouldRestoreFocus({ ...base, focusNowhere: false, focusInsideClosed: false })).toBe(false);
  });
  it('아래 층이 닫히는 경우는 건드리지 않는다', () => {
    expect(shouldRestoreFocus({ ...base, wasTop: false })).toBe(false);
  });
});

describe('닫기 결정', () => {
  const ok = { busy: false, canClose: true, dirty: false };
  it('처리 중이거나 가드가 거짓이면 막는다', () => {
    expect(decideClose({ ...ok, busy: true })).toBe('blocked');
    expect(decideClose({ ...ok, canClose: false })).toBe('blocked');
    expect(decideClose({ ...ok, busy: true, dirty: true })).toBe('blocked');
  });
  it('입력한 내용이 있으면 한 번 묻고, 미리 채운 값 그대로(dirty=false)면 묻지 않는다', () => {
    expect(decideClose({ ...ok, dirty: true })).toBe('confirm');
    expect(decideClose(ok)).toBe('close');
  });
  it('이미 버리기로 했으면(force) 묻지 않는다', () => {
    expect(decideClose({ ...ok, dirty: true, force: true })).toBe('close');
  });
});

describe('팝오버 위치', () => {
  const vp = { width: 800, height: 600 };
  const size = { width: 200, height: 150 };
  it('기본은 앵커 아래, 앵커 왼쪽 모서리에서 자란다', () => {
    const p = placePopover({ anchor: { left: 100, top: 100, width: 80, height: 30 }, size, viewport: vp });
    expect(p.side).toBe('bottom');
    expect(p.left).toBe(100);
    expect(p.top).toBe(100 + 30 + 6);
    expect(p.origin).toBe('0px top');
  });
  it('아래 공간이 모자라면 위로 뒤집고 아래쪽 모서리에서 자란다', () => {
    const p = placePopover({ anchor: { left: 100, top: 520, width: 80, height: 30 }, size, viewport: vp });
    expect(p.side).toBe('top');
    expect(p.top).toBe(520 - 6 - 150);
    expect(p.origin.endsWith('bottom')).toBe(true);
  });
  it('오른쪽 가장자리에서는 화면 안으로 당긴다', () => {
    const p = placePopover({ anchor: { left: 760, top: 100, width: 30, height: 30 }, size, viewport: vp });
    expect(p.left).toBe(800 - 200 - 8);
    expect(p.left + size.width).toBeLessThanOrEqual(vp.width - 8);
  });
  it('end 정렬은 앵커의 오른쪽 끝에 맞춘다', () => {
    const p = placePopover({ anchor: { left: 400, top: 100, width: 80, height: 30 }, size, viewport: vp, align: 'end' });
    expect(p.left).toBe(400 + 80 - 200);
    expect(p.origin).toBe('200px top');
  });
  it('어느 쪽에도 다 안 들어가면 넓은 쪽에 맞춰 높이를 줄인다', () => {
    const p = placePopover({ anchor: { left: 10, top: 200, width: 40, height: 30 }, size: { width: 200, height: 900 }, viewport: vp });
    expect(p.maxHeight).toBeLessThan(900);
    expect(p.top).toBeGreaterThanOrEqual(0);
    const bottom = p.side === 'bottom' ? p.top + p.maxHeight : 200 - 6;
    expect(bottom).toBeLessThanOrEqual(vp.height);
  });
  it('배치 문자열을 푼다', () => {
    expect(parsePlacement(undefined)).toEqual({ side: 'bottom', align: 'start' });
    expect(parsePlacement('top-end')).toEqual({ side: 'top', align: 'end' });
    expect(parsePlacement('bottom')).toEqual({ side: 'bottom', align: 'start' });
    expect(parsePlacement('top-center')).toEqual({ side: 'top', align: 'center' });
  });
});

describe('스택 스토어(DOM 없이)', () => {
  const handle = (log: string[], name: string): LayerHandle => ({
    requestClose: (r) => log.push(`${name}:${r}`),
    el: () => null,
    box: () => null,
    contains: () => false,
  });
  it('closeTop 은 맨 위 층에만 닫기를 요청한다', () => {
    const log: string[] = [];
    const a = layerStack.register('modal', handle(log, 'a'));
    const b = layerStack.register('popover', handle(log, 'b'));
    expect(layerStack.topId).toBe(b);
    expect(layerStack.closeTop()).toBe(true);
    expect(log).toEqual(['b:api']);
    layerStack.setClosing(b, true);
    expect(layerStack.topId).toBe(a);
    expect(layerStack.depth).toBe(1);
    layerStack.unregister(b);
    layerStack.unregister(a);
    expect(layerStack.closeTop()).toBe(false);
    expect(layerStack.entries).toHaveLength(0);
  });
  it('closeAll 은 위에서부터 모두에게 요청한다', () => {
    const log: string[] = [];
    const ids = [layerStack.register('drawer', handle(log, 'a')), layerStack.register('modal', handle(log, 'b'))];
    layerStack.closeAll();
    expect(log).toEqual(['b:api', 'a:api']);
    ids.forEach((i) => layerStack.unregister(i));
  });
  it('indexOf 는 z-index 순번을 준다', () => {
    const x = layerStack.register('modal', handle([], 'x'));
    const y = layerStack.register('modal', handle([], 'y'));
    expect(layerStack.indexOf(x)).toBeLessThan(layerStack.indexOf(y));
    layerStack.unregister(x);
    layerStack.unregister(y);
  });
});

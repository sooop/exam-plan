import { describe, expect, it } from 'vitest';
import { focusIsLive, neighborIndex, restoreChoice } from '../../src/lib/ui/layerCore';

describe('이웃 항목 선택(neighborIndex)', () => {
  it('같은 번호의 다음 항목이 우선이고 끝이면 앞 항목이다', () => {
    expect(neighborIndex(1, 3)).toBe(1);
    expect(neighborIndex(2, 2)).toBe(1);
    expect(neighborIndex(5, 3)).toBe(2);
  });
  it('번호를 모르면(-1) 첫 항목, 비었으면 -1', () => {
    expect(neighborIndex(-1, 3)).toBe(0);
    expect(neighborIndex(0, 0)).toBe(-1);
  });
});

describe('포커스가 살아 있는가(focusIsLive)', () => {
  const ok = { isBody: false, connected: true, inClosingLayer: false, inertOrHidden: false };
  it('멀쩡한 요소는 살아 있다', () => expect(focusIsLive(ok)).toBe(true));
  it('body·분리·닫히는 층·inert/aria-hidden 은 죽은 것이다', () => {
    expect(focusIsLive({ ...ok, isBody: true })).toBe(false);
    expect(focusIsLive({ ...ok, connected: false })).toBe(false);
    expect(focusIsLive({ ...ok, inClosingLayer: true })).toBe(false);
    expect(focusIsLive({ ...ok, inertOrHidden: true })).toBe(false);
  });
});

describe('복원 선택(restoreChoice)', () => {
  const base = { wasTop: true, focusNowhere: true, focusInsideClosed: false, openerAlive: true };
  it('연 요소가 살아 있으면 연 요소', () => expect(restoreChoice(base)).toBe('opener'));
  it('연 요소가 사라졌으면 대체 대상(닫히는 층 안 포커스여도)', () => {
    expect(restoreChoice({ ...base, openerAlive: false })).toBe('fallback');
    expect(restoreChoice({ ...base, openerAlive: false, focusNowhere: false, focusInsideClosed: true })).toBe('fallback');
  });
  it('맨 위가 아니거나 포커스가 다른 곳에 있으면 건드리지 않는다', () => {
    expect(restoreChoice({ ...base, wasTop: false })).toBe('none');
    expect(restoreChoice({ ...base, openerAlive: false, focusNowhere: false, focusInsideClosed: false })).toBe('none');
  });
});

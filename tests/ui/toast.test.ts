import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { overflowIds, remainingAfterHold, toastDuration, TOAST_MAX } from '../../src/lib/ui/toastCore';
import { toast } from '../../src/lib/ui/toast.svelte';

describe('토스트 정책', () => {
  it('오류는 정보·성공보다 오래 머문다', () => {
    expect(toastDuration('error', false)).toBeGreaterThan(toastDuration('info', false));
    expect(toastDuration('success', false)).toBe(toastDuration('info', false));
  });
  it('동작 단추가 있으면 가장 오래 머문다', () => {
    expect(toastDuration('info', true)).toBeGreaterThan(toastDuration('error', false));
  });
  it('직접 정한 시간이 우선한다', () => {
    expect(toastDuration('error', true, 1234)).toBe(1234);
  });
  it('올렸다 뗀 뒤에는 최소 시간을 보장한다', () => {
    expect(remainingAfterHold(100)).toBeGreaterThanOrEqual(1000);
    expect(remainingAfterHold(5000)).toBe(5000);
  });
  it('상한 초과분은 가장 오래된 것부터', () => {
    expect(TOAST_MAX).toBe(3);
    expect(overflowIds([{ id: 1 }, { id: 2 }, { id: 3 }])).toEqual([]);
    expect(overflowIds([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }])).toEqual([1, 2]);
  });
});

describe('토스트 스토어', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toast.clear();
  });
  afterEach(() => {
    toast.clear();
    vi.useRealTimers();
  });

  it('동시에 3개까지만 보인다', () => {
    for (let i = 1; i <= 5; i++) toast.info(`안내 ${i}`);
    expect(toast.items.map((t) => t.text)).toEqual(['안내 3', '안내 4', '안내 5']);
  });
  it('같은 내용은 쌓지 않고 시간만 다시 시작한다', () => {
    const a = toast.info('복사했습니다');
    vi.advanceTimersByTime(2000);
    const b = toast.info('복사했습니다');
    expect(b).toBe(a);
    expect(toast.items).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(toast.items).toHaveLength(1);
    vi.advanceTimersByTime(600);
    expect(toast.items).toHaveLength(0);
  });
  it('시간이 지나면 닫히고 오류는 더 오래 남는다', () => {
    toast.info('정보');
    toast.error('오류');
    vi.advanceTimersByTime(2600);
    expect(toast.items.map((t) => t.kind)).toEqual(['error']);
    vi.advanceTimersByTime(1500);
    expect(toast.items).toHaveLength(0);
  });
  it('올려 둔 동안은 사라지지 않고, 뗀 뒤 남은 시간 뒤에 닫힌다', () => {
    const id = toast.info('유지');
    vi.advanceTimersByTime(2000);
    toast.hold(id);
    vi.advanceTimersByTime(60000);
    expect(toast.items).toHaveLength(1);
    toast.release(id);
    vi.advanceTimersByTime(1400);
    expect(toast.items).toHaveLength(1);
    vi.advanceTimersByTime(200);
    expect(toast.items).toHaveLength(0);
  });
  it('누르면(dismiss) 닫힌다', () => {
    const id = toast.success('저장했습니다');
    toast.dismiss(id);
    expect(toast.items).toHaveLength(0);
  });
  it('호스트가 있으면 퇴장 연출을 위해 leaving 으로 남았다가 remove 로 치워진다', () => {
    const detach = toast.attachHost();
    const id = toast.info('연출');
    toast.dismiss(id);
    expect(toast.items[0]?.leaving).toBe(true);
    toast.remove(id);
    expect(toast.items).toHaveLength(0);
    detach();
  });
  it('호스트가 연출을 끝내지 못해도 안전장치로 치워진다', () => {
    const detach = toast.attachHost();
    const id = toast.info('유실');
    toast.dismiss(id);
    vi.advanceTimersByTime(1100);
    expect(toast.items.find((t) => t.id === id)).toBeUndefined();
    detach();
  });
  it('동작 단추를 담고, 같은 문구라도 단추가 있으면 따로 쌓는다', () => {
    const run = vi.fn();
    toast.info('삭제했습니다', { action: { label: '되돌리기', run } });
    toast.info('삭제했습니다', { action: { label: '되돌리기', run } });
    expect(toast.items).toHaveLength(2);
    expect(toast.items[0].action?.label).toBe('되돌리기');
  });
});

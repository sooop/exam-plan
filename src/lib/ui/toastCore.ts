// 토스트 정책의 순수 부분(길이·상한). DOM 에 의존하지 않는다.
export type ToastKind = 'info' | 'success' | 'error';

/** 동시에 보이는 토스트의 상한 */
export const TOAST_MAX = 3;

/** 머무는 시간(ms): 정보·성공 2.5초, 오류 4초(더 오래), 동작 단추("되돌리기")가 있으면 눌러 볼 시간을 주려고 8초 */
export const TOAST_MS = { info: 2500, success: 2500, error: 4000, action: 8000 } as const;
/** 마우스를 올렸다 뗀 뒤 남기는 최소 시간 */
export const TOAST_RELEASE_MIN_MS = 1500;

export function toastDuration(kind: ToastKind, hasAction: boolean, override?: number): number {
  if (override != null) return override;
  if (hasAction) return Math.max(TOAST_MS.action, TOAST_MS[kind]);
  return TOAST_MS[kind];
}

/** 올려 둔 동안 멈췄던 시간표: 남은 시간이 너무 짧으면 최소 시간으로 올린다 */
export const remainingAfterHold = (remaining: number): number => Math.max(TOAST_RELEASE_MIN_MS, remaining);

/** 새 토스트를 넣을 때 밀려나야 하는 가장 오래된 것들의 id(상한 초과분). 이미 사라지는 중인 것은 세지 않는다 */
export function overflowIds(live: readonly { id: number }[], max = TOAST_MAX): number[] {
  const over = live.length - max;
  return over > 0 ? live.slice(0, over).map((t) => t.id) : [];
}

// 토스트 스토어. 한 번 지나가는 일을 알린다(계속되는 문제는 계속 보이는 표시로 알린다).
//   toast.push({ kind: 'success', text: '과목 3개를 추가했습니다', action: { label: '되돌리기', run: undo } })
//   toast.info('복사했습니다') / toast.success(...) / toast.error('저장하지 못했습니다: 용량 초과')
// 동시에 3개까지, 오류는 더 오래, 마우스를 올린 동안 유지, 누르면 닫힌다. 화면은 ToastHost.svelte 가 그린다.
import { overflowIds, remainingAfterHold, toastDuration, type ToastKind } from './toastCore';

export type { ToastKind };
export interface ToastAction {
  label: string;
  /** 누르면 실행하고 토스트를 닫는다 */
  run: () => void;
}
export interface ToastInput {
  kind?: ToastKind;
  text: string;
  action?: ToastAction;
  /** 머무는 시간(ms)을 직접 정한다. 생략하면 종류에 따른 기본값 */
  duration?: number;
}
export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  action?: ToastAction;
  /** 닫는 연출 중(ToastHost 가 연출을 마치면 목록에서 치운다) */
  leaving: boolean;
}

/** 호스트가 없을 때(시험·초기화 전) 사라지는 중인 토스트를 치우기까지의 안전장치 */
const LEAVE_GUARD_MS = 1000;

class ToastStore {
  items = $state.raw<ToastItem[]>([]);
  #seq = 0;
  #timers = new Map<number, { handle: ReturnType<typeof setTimeout>; due: number }>();
  #held = new Map<number, number>(); // id → 멈춘 시점의 남은 시간
  #hosts = 0;

  push(input: ToastInput): number {
    const kind = input.kind ?? 'info';
    // 같은 내용이 이미 떠 있으면 새로 쌓지 않고 시간만 다시 시작한다(연타로 화면이 토스트로 차는 것을 막는다)
    if (!input.action) {
      const same = this.items.find((t) => !t.leaving && !t.action && t.kind === kind && t.text === input.text);
      if (same) {
        this.#clearTimer(same.id);
        this.#held.delete(same.id);
        this.#schedule(same.id, toastDuration(kind, false, input.duration));
        return same.id;
      }
    }
    const id = ++this.#seq;
    this.items = [...this.items, { id, kind, text: input.text, action: input.action, leaving: false }];
    this.#schedule(id, toastDuration(kind, !!input.action, input.duration));
    for (const old of overflowIds(this.items.filter((t) => !t.leaving))) this.dismiss(old);
    return id;
  }
  info(text: string, o: Omit<ToastInput, 'kind' | 'text'> = {}) {
    return this.push({ ...o, kind: 'info', text });
  }
  success(text: string, o: Omit<ToastInput, 'kind' | 'text'> = {}) {
    return this.push({ ...o, kind: 'success', text });
  }
  error(text: string, o: Omit<ToastInput, 'kind' | 'text'> = {}) {
    return this.push({ ...o, kind: 'error', text });
  }

  /** 닫는다. 호스트가 있으면 퇴장 연출 뒤에 치워지고, 없으면 바로 치워진다 */
  dismiss(id: number): void {
    this.#clearTimer(id);
    this.#held.delete(id);
    const t = this.items.find((x) => x.id === id);
    if (!t || t.leaving) return;
    if (this.#hosts === 0) {
      this.remove(id);
      return;
    }
    this.items = this.items.map((x) => (x.id === id ? { ...x, leaving: true } : x));
    // 안전장치: 호스트가 연출을 끝내지 못해도 남지 않는다
    setTimeout(() => this.remove(id), LEAVE_GUARD_MS);
  }
  /** 목록에서 치운다(ToastHost 가 퇴장 연출을 마친 뒤 부른다) */
  remove(id: number): void {
    this.#clearTimer(id);
    this.#held.delete(id);
    if (this.items.some((t) => t.id === id)) this.items = this.items.filter((t) => t.id !== id);
  }
  clear(): void {
    for (const t of this.items) this.dismiss(t.id);
  }

  /** 마우스를 올리거나 포커스가 들어와 있는 동안 사라지지 않게 멈춘다 */
  hold(id: number): void {
    const tm = this.#timers.get(id);
    if (!tm) return;
    this.#held.set(id, Math.max(0, tm.due - Date.now()));
    this.#clearTimer(id);
  }
  /** 떠났다: 남은 시간(최소 1.5초)만큼 더 보인 뒤 닫힌다 */
  release(id: number): void {
    const rest = this.#held.get(id);
    if (rest == null) return;
    this.#held.delete(id);
    this.#schedule(id, remainingAfterHold(rest));
  }

  /** ToastHost 가 마운트되면 부른다. 해제 함수를 돌려준다 */
  attachHost(): () => void {
    this.#hosts++;
    return () => {
      this.#hosts = Math.max(0, this.#hosts - 1);
    };
  }

  #clearTimer(id: number): void {
    const tm = this.#timers.get(id);
    if (tm) clearTimeout(tm.handle);
    this.#timers.delete(id);
  }
  #schedule(id: number, ms: number): void {
    this.#clearTimer(id);
    this.#timers.set(id, { handle: setTimeout(() => this.dismiss(id), ms), due: Date.now() + ms });
  }
}

export const toast = new ToastStore();

import type { LevelKey } from './types';
import { LEVEL_KEYS } from './constants';

let uidSeq = 0;
let uidSource: (() => string) | null = null;
export function uid(): string {
  if (uidSource) return uidSource();
  uidSeq += 1;
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + uidSeq.toString(36);
}

export const clampInt = (v: unknown, lo: number, hi: number): number => {
  const n = Math.round(Number(v));
  return isNaN(n) ? lo : Math.min(hi, Math.max(lo, n));
};
export const normName = (s: unknown): string => String(s || '').trim().replace(/\s+/g, ' ');
export const nameKey = (s: unknown): string => normName(s).toLowerCase();

/* 단계 키인지 확인한다. LEVEL_KEYS 에 있는 문자열만 참이다. */
export function isLevel(v: unknown): v is LevelKey {
  return typeof v === 'string' && (LEVEL_KEYS as readonly string[]).includes(v);
}

/* uid 주입점. 기본값은 원본과 같은 방식(시각 + 난수 + 순번)이다. null 을 주면 기본값으로 돌아간다. */
export function setUidSource(fn: (() => string) | null): void {
  uidSource = fn;
}

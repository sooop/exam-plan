import type { LevelKey, Limits, Plan } from './types';

/* 시험 공부 플래너 상수. legacy/exam-plan.html 의 Planner 상수와 같다. */
export const LEVELS: readonly { readonly key: LevelKey; readonly label: string }[] = [
  { key: 'calm', label: '한가함' },
  { key: 'easy', label: '여유' },
  { key: 'normal', label: '보통' },
  { key: 'busy', label: '바쁨' },
  { key: 'packed', label: '매우 바쁨' },
];
export const LEVEL_KEYS: readonly LevelKey[] = LEVELS.map((l) => l.key);
export const DEFAULT_LIMITS: Limits = { calm: 8, easy: 4, normal: 3, busy: 2, packed: 1 };
/* 4단계(v1) 저장본의 단계 이름을 5단계로 옮긴다. */
export const LEGACY_LEVELS: Readonly<Record<string, LevelKey>> = { relaxed: 'calm', medium: 'normal', tight: 'busy', busy: 'packed' };
export const PALETTE: readonly string[] = ['#C4705A', '#D9A441', '#7E9F6B', '#5F9EA0', '#6E8FBF', '#9A7DB8', '#C46A8E', '#8A8578'];
export const MAX_DAYS = 120;
export const MAX_COUNT = 30;
export const MAX_TEXT = 2000;
export const DEFAULT_PLAN: Plan = { n: 2, m: 2, r: 1 };

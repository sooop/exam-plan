/* 원본 legacy/exam-plan.html 의 Planner IIFE 를 잘라 실행하는 헬퍼와, 두 구현을 같은 조건에서 돌리는 도구.
   원본은 전역 Date·Math.random 을 직접 쓰므로, 시험 때마다 시각을 고정하고 난수를 같은 시드로 다시 연다. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

/* 새 TS 모듈 전체의 타입. 시험 코드는 이 타입으로 쓰고, 원본은 같은 이름의 함수를 런타임에 가리킨다. */
export type Core = typeof import('../../src/lib/core/index');

const HTML_PATH = fileURLToPath(new URL('../../legacy/exam-plan.html', import.meta.url));
const IIFE_START = 'const Planner = (function () {';

/* 고정 시각(한국 시간 2026-06-10 09:30). 로컬 시각 함수도 같은 값을 본다. */
export const FROZEN_NOW = new Date('2026-06-10T09:30:00+09:00');

/* legacy/exam-plan.html 에서 `const Planner = (function () {` 부터 그 IIFE 를 닫는 `})();` 까지를 잘라 낸다. */
export function legacySource(): string {
  const html = readFileSync(HTML_PATH, 'utf8');
  const start = html.indexOf(IIFE_START);
  if (start < 0) throw new Error('원본에서 Planner IIFE 시작을 찾지 못했다');
  const endRe = /\r?\n\}\)\(\);/g;
  endRe.lastIndex = start;
  const m = endRe.exec(html);
  if (!m) throw new Error('원본에서 Planner IIFE 끝을 찾지 못했다');
  return html.slice(start, m.index + m[0].length);
}

/* 원본 Planner 객체를 새로 만든다. 호출할 때마다 uid 순번이 0 부터 다시 시작한다. */
export function loadLegacy(): Core {
  const factory = new Function(`'use strict';\n${legacySource()}\nreturn Planner;`);
  return factory() as Core;
}

/* 새 TS 모듈을 새로 불러온다. vi.resetModules 로 uid 순번 등 모듈 상태를 초기화한다. */
export async function loadCore(): Promise<Core> {
  vi.resetModules();
  return import('../../src/lib/core/index');
}

/* 작은 시드 PRNG (mulberry32). 같은 시드면 같은 수열을 낸다. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 시각과 Math.random 을 고정한다. 두 구현에 같은 순서로 호출되면 uid 와 시각 출력이 같아진다. */
export function freezeEnv(seed = 20260610): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FROZEN_NOW);
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
}

export function restoreEnv(): void {
  vi.useRealTimers();
  vi.restoreAllMocks();
}

/* 같은 시나리오를 원본과 새 모듈에 각각 돌린다. 시나리오는 api 만 쓰고 입력을 안에서 새로 만든다. */
export async function runBoth<T>(scenario: (api: Core) => T): Promise<{ legacy: T; core: T }> {
  try {
    freezeEnv();
    const legacy = scenario(loadLegacy());
    freezeEnv();
    const core = scenario(await loadCore());
    return { legacy, core };
  } finally {
    restoreEnv();
  }
}

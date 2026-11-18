import { describe, expect, it } from 'vitest';
import { SPRING, settleTime, solveSpring, stepResponse } from '../../src/lib/motion/spring';

describe('스프링 풀이', () => {
  it('0 에서 시작해 1 로 수렴한다', () => {
    for (const s of Object.values(SPRING)) {
      expect(stepResponse(s, 0)).toBe(0);
      expect(Math.abs(stepResponse(s, 4) - 1)).toBeLessThan(0.002);
    }
  });
  it('값표의 길이(ms)와 같다: pop 396, bouncy 604, glide 504, heavy 587, snappy 283', () => {
    const want = { pop: 396, bouncy: 604, glide: 504, heavy: 587, snappy: 283 } as const;
    for (const [name, ms] of Object.entries(want)) {
      expect(Math.abs(solveSpring(SPRING[name as keyof typeof SPRING]).duration - ms)).toBeLessThanOrEqual(6);
    }
  });
  it('pop 은 한 번 넘치고 glide 는 거의 넘치지 않는다', () => {
    const peak = (k: keyof typeof SPRING) =>
      Math.max(...Array.from({ length: 200 }, (_, i) => stepResponse(SPRING[k], (i / 200) * settleTime(SPRING[k]))));
    expect(peak('pop')).toBeGreaterThan(1.05);
    expect(peak('glide')).toBeLessThan(1.02);
  });
  it('css 이징 문자열은 linear(...) 이고 1 로 끝난다', () => {
    const { css } = solveSpring(SPRING.pop);
    expect(css.startsWith('linear(0')).toBe(true);
    expect(css.endsWith(', 1)')).toBe(true);
  });
});

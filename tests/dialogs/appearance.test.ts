import { describe, expect, it } from 'vitest';
import { ANIM_KEY, readStoredAnim, writeStoredAnim, type KeyValueStore } from '../../src/lib/dialogs/appearance';

class Mem implements KeyValueStore {
  map = new Map<string, string>();
  fail = false;
  getItem(k: string) { if (this.fail) throw new Error('denied'); return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.fail) throw new Error('denied'); this.map.set(k, v); }
}

describe('애니메이션 저장 값(별도 키 examPlanner.anim)', () => {
  it('키 이름이 고정되어 있다', () => {
    expect(ANIM_KEY).toBe('examPlanner.anim');
  });
  it('저장된 값이 없으면 켜짐', () => {
    expect(readStoredAnim(new Mem())).toBe(true);
  });
  it('끈 값을 저장하고 다시 읽는다', () => {
    const m = new Mem();
    expect(writeStoredAnim(false, m)).toBe(true);
    expect(m.map.get(ANIM_KEY)).toBe('off');
    expect(readStoredAnim(m)).toBe(false);
    expect(writeStoredAnim(true, m)).toBe(true);
    expect(readStoredAnim(m)).toBe(true);
  });
  it('저장소가 없거나 막혀 있어도 예외 없이 기본값과 false 를 돌려준다', () => {
    expect(readStoredAnim(null)).toBe(true);
    expect(writeStoredAnim(false, null)).toBe(false);
    const m = new Mem();
    m.fail = true;
    expect(readStoredAnim(m)).toBe(true);
    expect(writeStoredAnim(false, m)).toBe(false);
  });
});

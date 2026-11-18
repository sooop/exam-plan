import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS, UI_KEY, loadPrefs, normalizeDeviceName, parsePrefs, resetPrefsMemory, savePrefs, updatePrefs,
  type StorageLike,
} from '../../src/lib/storage/prefs';

class Mem implements StorageLike {
  map = new Map<string, string>();
  fail = false;
  getItem(k: string) { if (this.fail) throw new Error('denied'); return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.fail) throw new Error('denied'); this.map.set(k, v); }
}

beforeEach(() => resetPrefsMemory());

describe('parsePrefs', () => {
  it('빈 값·깨진 JSON·배열은 기본값', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{깨짐')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('[]')).toEqual(DEFAULT_PREFS);
  });
  it('허용되지 않는 값은 걸러낸다', () => {
    expect(parsePrefs(JSON.stringify({ tab: 'nope', theme: 'neon', deviceName: 5 }))).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(JSON.stringify({ tab: 'today', theme: 'dark', deviceName: ' 내  폰 ' }))).toEqual({ tab: 'today', theme: 'dark', deviceName: '내 폰' });
  });
});

describe('normalizeDeviceName', () => {
  it('공백을 정리하고 1~30자만 허용', () => {
    expect(normalizeDeviceName('  a   b ')).toBe('a b');
    expect(normalizeDeviceName('')).toBeNull();
    expect(normalizeDeviceName('   ')).toBeNull();
    expect(normalizeDeviceName('가'.repeat(30))).toBe('가'.repeat(30));
    expect(normalizeDeviceName('가'.repeat(31))).toBeNull();
    expect(normalizeDeviceName('a\nb')).toBe('a b');
    expect(normalizeDeviceName(null)).toBeNull();
  });
});

describe('load/save', () => {
  it('저장하고 다시 읽는다', () => {
    const s = new Mem();
    expect(savePrefs({ tab: 'board', theme: 'light', deviceName: 'x' }, s)).toBe(true);
    expect(JSON.parse(s.map.get(UI_KEY)!)).toEqual({ tab: 'board', theme: 'light', deviceName: 'x' });
    expect(loadPrefs(s)).toEqual({ tab: 'board', theme: 'light', deviceName: 'x' });
  });
  it('updatePrefs 는 일부 필드만 바꾼다', () => {
    const s = new Mem();
    savePrefs({ tab: 'exam', theme: 'dark', deviceName: null }, s);
    expect(updatePrefs({ tab: 'print' }, s)).toEqual({ tab: 'print', theme: 'dark', deviceName: null });
  });
  it('저장소가 예외를 던져도 메모리로 동작한다', () => {
    const s = new Mem(); s.fail = true;
    expect(savePrefs({ tab: 'today', theme: 'dark', deviceName: null }, s)).toBe(false);
    expect(loadPrefs(s)).toEqual({ tab: 'today', theme: 'dark', deviceName: null });
  });
  it('저장소가 없어도(null) 동작한다', () => {
    expect(loadPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(updatePrefs({ theme: 'dark' }, null).theme).toBe('dark');
  });
});

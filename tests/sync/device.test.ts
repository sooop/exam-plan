import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WORDS, detectDevice, generateDeviceName, parseUserAgent, parseUserAgentData,
} from '../../src/lib/sync/device';
import { resetPrefsMemory } from '../../src/lib/storage/prefs';

const UA = {
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
};

describe('parseUserAgent', () => {
  it.each([
    [UA.win, 'Windows', 'Chrome'], [UA.edge, 'Windows', 'Edge'], [UA.iphone, 'iOS', 'Safari'],
    [UA.iphoneChrome, 'iOS', 'Chrome'], [UA.mac, 'macOS', 'Safari'], [UA.firefox, 'Linux', 'Firefox'],
    [UA.android, 'Android', 'Chrome'], [UA.samsung, 'Android', 'Samsung'],
  ])('%#', (ua, os, browser) => { expect(parseUserAgent(ua)).toEqual({ os, browser }); });

  it('알 수 없으면 기기·브라우저', () => {
    expect(parseUserAgent('')).toEqual({ os: '기기', browser: '브라우저' });
    expect(parseUserAgent(undefined)).toEqual({ os: '기기', browser: '브라우저' });
  });
  it('iPadOS 는 Macintosh 로 오지만 터치 지점이 있으면 iOS', () => {
    expect(parseUserAgent(UA.mac, 5).os).toBe('iOS');
  });
});

describe('detectDevice', () => {
  it('userAgentData 가 userAgent 보다 우선', () => {
    const r = detectDevice({
      userAgent: UA.firefox,
      userAgentData: { platform: 'Windows', brands: [{ brand: 'Not A;Brand' }, { brand: 'Chromium' }, { brand: 'Microsoft Edge' }] },
    });
    expect(r).toEqual({ os: 'Windows', browser: 'Edge' });
  });
  it('userAgentData 에 없는 항목은 userAgent 로 채운다', () => {
    expect(detectDevice({ userAgent: UA.win, userAgentData: { platform: '' } })).toEqual({ os: 'Windows', browser: 'Chrome' });
    expect(parseUserAgentData({ brands: [{ brand: 'Google Chrome' }] })).toEqual({ browser: 'Chrome' });
  });
  it('navigator 가 없거나 이상하면 기본값', () => {
    expect(detectDevice(null)).toEqual({ os: '기기', browser: '브라우저' });
    expect(detectDevice({})).toEqual({ os: '기기', browser: '브라우저' });
  });
});

describe('generateDeviceName', () => {
  it('단어 목록은 40개 이상, 한글만', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    WORDS.forEach((w) => expect(w).toMatch(/^[가-힣]+$/));
  });
  it('형식과 길이', () => {
    for (let i = 0; i < 200; i++) {
      const n = generateDeviceName({ os: 'Android', browser: 'Samsung' });
      expect(n).toMatch(/^Android · Samsung · (?:[가-힣]+-)?[A-Z2-9]{2}$/);
      expect(Array.from(n).length).toBeLessThanOrEqual(30);
    }
    expect(generateDeviceName({ os: 'Windows', browser: 'Chrome' }, () => 0)).toBe('Windows · Chrome · 푸른여우-AA');
  });
});

describe('getDeviceName / setDeviceName', () => {
  beforeEach(() => { resetPrefsMemory(); vi.unstubAllGlobals(); });

  it('처음 한 번 만들고 이후 같은 이름을 돌려준다, 고친 이름은 검증한다', async () => {
    const map = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); },
    });
    const { getDeviceName, setDeviceName } = await import('../../src/lib/sync/device');
    const a = getDeviceName();
    expect(a.split(' · ').length).toBe(3);
    expect(getDeviceName()).toBe(a);
    expect(JSON.parse(map.get('examPlanner.ui')!).deviceName).toBe(a);
    expect(setDeviceName('   ')).toMatchObject({ ok: false });
    expect(setDeviceName('가'.repeat(31))).toMatchObject({ ok: false });
    expect(setDeviceName('  내   노트북 ')).toEqual({ ok: true, name: '내 노트북' });
    expect(getDeviceName()).toBe('내 노트북');
  });

  it('저장소가 예외를 던져도 이름은 유지된다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } });
    const { getDeviceName } = await import('../../src/lib/sync/device');
    const a = getDeviceName();
    expect(getDeviceName()).toBe(a);
  });
});

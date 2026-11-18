import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressionAvailable, pack, unpack } from '../../src/lib/history/pack';
import { richState } from '../sync/helpers';

afterEach(() => vi.unstubAllGlobals());

describe('압축 왕복', () => {
  it('이 환경에서는 gzip 을 쓸 수 있다(Node CompressionStream)', () => {
    expect(compressionAvailable()).toBe(true);
  });

  it('상태 JSON 이 gzip 으로 더 작아지고 그대로 풀린다', async () => {
    const json = JSON.stringify(richState());
    const p = await pack(json);
    expect(p.enc).toBe('gzip');
    expect(p.data.length).toBeLessThan(json.length);
    expect(p.data).toBeInstanceOf(Uint8Array);
    expect(await unpack(p)).toBe(json);
  });

  it('한글·특수문자·빈 문자열도 그대로', async () => {
    for (const t of ['', '가나다 라마바 '.repeat(500), 'a"\\\n\t 끝']) {
      expect(await unpack(await pack(t))).toBe(t);
    }
  });

  it('압축 API 가 없으면 무압축으로 저장하고 읽는다', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    vi.stubGlobal('DecompressionStream', undefined);
    expect(compressionAvailable()).toBe(false);
    const p = await pack('시험 계획 '.repeat(100));
    expect(p.enc).toBe('raw');
    expect(await unpack(p)).toBe('시험 계획 '.repeat(100));
  });

  it('gzip 으로 저장된 것을 풀 수 없는 환경이면 던진다', async () => {
    const p = await pack('가나다'.repeat(200));
    expect(p.enc).toBe('gzip');
    vi.stubGlobal('DecompressionStream', undefined);
    await expect(unpack(p)).rejects.toThrow();
  });

  it('손상된 gzip 은 던진다', async () => {
    await expect(unpack({ enc: 'gzip', data: new Uint8Array([1, 2, 3, 4, 5]) })).rejects.toThrow();
  });
});

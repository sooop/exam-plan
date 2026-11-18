// 스냅샷 본문 압축. fflate 는 sync-kit 의 의존이라 앱 쪽 node_modules 에 없으므로(확인: node_modules/fflate 없음) 쓰지 않는다.
// 1순위 CompressionStream('gzip'), 없으면 무압축('raw'). 읽을 때는 저장된 enc 를 따른다.
import type { Packed } from './core';

const enc = new TextEncoder();
const dec = new TextDecoder();

type CS = new (format: 'gzip') => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };
type DS = CS;

function streams(): { C: CS; D: DS } | null {
  const g = globalThis as unknown as { CompressionStream?: CS; DecompressionStream?: DS };
  return g.CompressionStream && g.DecompressionStream && typeof Blob !== 'undefined' && typeof Response !== 'undefined'
    ? { C: g.CompressionStream, D: g.DecompressionStream }
    : null;
}

/** 이 환경에서 gzip 압축을 쓸 수 있는가 */
export const compressionAvailable = (): boolean => streams() !== null;

async function run(bytes: Uint8Array, T: CS): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new T('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 문자열을 압축한다. 압축할 수 없거나 실패하면 무압축 UTF-8 로 둔다(던지지 않는다) */
export async function pack(text: string): Promise<Packed> {
  const raw = enc.encode(text);
  const s = streams();
  if (s) {
    try {
      const data = await run(raw, s.C);
      if (data.length < raw.length) return { enc: 'gzip', data };
    } catch { /* 무압축으로 */ }
  }
  return { enc: 'raw', data: raw };
}

/** 풀어서 문자열로. gzip 인데 이 환경에서 풀 수 없거나 손상됐으면 던진다 */
export async function unpack(p: Packed): Promise<string> {
  if (p.enc === 'raw') return dec.decode(p.data);
  const s = streams();
  if (!s) throw new Error('gzip 을 풀 수 없는 환경입니다');
  return dec.decode(await run(p.data, s.D));
}

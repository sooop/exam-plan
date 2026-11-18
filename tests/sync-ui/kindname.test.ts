import { describe, expect, it } from 'vitest';
import { kindName } from '../../src/lib/sync/ui/logic';

describe('kindName (id 를 함께 받아 설정·시험·과목 목록을 구분)', () => {
  it("id 'settings' 는 kind 가 doc(시험과 같은 kind)이어도 설정", () => {
    expect(kindName('doc', 'settings')).toBe('설정');
  });
  it('옛 버전의 kind thread 설정도 id 가 settings 면 설정', () => {
    expect(kindName('thread', 'settings')).toBe('설정');
  });
  it("id 'e-' 는 시험, kind 가 무엇이든 id 를 먼저 본다", () => {
    expect(kindName('doc', 'e-abc123')).toBe('시험');
    expect(kindName('snippet', 'e-abc123')).toBe('시험');
  });
  it("id 'l-' 는 과목 목록", () => {
    expect(kindName('snippet', 'l-xyz')).toBe('과목 목록');
    expect(kindName('doc', 'l-xyz')).toBe('과목 목록');
  });
  it('id 가 없으면 kind 로 정한다(doc 은 시험)', () => {
    expect(kindName('doc')).toBe('시험');
    expect(kindName('snippet')).toBe('과목 목록');
  });
  it('알 수 없는 id 와 kind 는 항목', () => {
    expect(kindName('etc', 'zzz')).toBe('항목');
    expect(kindName('etc')).toBe('항목');
  });
});

import { describe, expect, it } from 'vitest';
import { draftAfterImport } from '../../src/lib/dialogs/logic';

// 데이터 서랍의 붙여넣기 초안 정책(N-M2): 서랍을 닫아도 초안은 남고, 붙여넣기 가져오기에 성공했을 때만 비운다.
describe('draftAfterImport (붙여넣기 초안은 성공한 붙여넣기 뒤에만 비운다)', () => {
  const draft = '{"app":"exam-planner"}';

  it('붙여넣기가 성공하면 초안을 비운다', () => {
    expect(draftAfterImport(draft, 'paste', true)).toBe('');
  });

  it('붙여넣기가 실패하면 초안을 그대로 둔다(고쳐서 다시 쓸 수 있게)', () => {
    expect(draftAfterImport(draft, 'paste', false)).toBe(draft);
  });

  it('파일 열기·끌어 놓기 가져오기는 붙여넣기 초안을 건드리지 않는다', () => {
    expect(draftAfterImport(draft, 'file', true)).toBe(draft);
    expect(draftAfterImport(draft, 'drop', true)).toBe(draft);
    expect(draftAfterImport(draft, 'file', false)).toBe(draft);
    expect(draftAfterImport(draft, 'drop', false)).toBe(draft);
  });

  it('빈 초안은 어떤 경우에도 빈 채로 남는다', () => {
    expect(draftAfterImport('', 'paste', true)).toBe('');
    expect(draftAfterImport('', 'paste', false)).toBe('');
    expect(draftAfterImport('', 'file', true)).toBe('');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { createDraft, hasCreateDraft, resetCreateDraft } from '../../../src/lib/screens/exam/draft.svelte';
import { applyStartChange } from '../../../src/lib/screens/exam/logic';

describe('시험 만들기 초안(탭을 옮겨도 남는다)', () => {
  beforeEach(() => resetCreateDraft());

  it('처음에는 비어 있다', () => {
    expect(hasCreateDraft()).toBe(false);
    expect(createDraft.f.name).toBe('');
  });
  it('입력하면 같은 모듈 상태에 남아 다른 곳(컴포넌트를 다시 만든 뒤)에서도 읽힌다', () => {
    createDraft.f.name = '기말고사';
    createDraft.f = applyStartChange(createDraft.f, '2026-12-10');
    expect(hasCreateDraft()).toBe(true);
    // 컴포넌트가 다시 만들어져도 같은 객체를 본다
    expect(createDraft.f.name).toBe('기말고사');
    expect(createDraft.f.prepStart).toBe('2026-11-12');
  });
  it('이름이 공백뿐이면 초안으로 치지 않는다', () => {
    createDraft.f.name = '   ';
    expect(hasCreateDraft()).toBe(false);
  });
  it('초기화하면 이름·날짜·준비 시작일 직접 입력 표시가 모두 지워진다', () => {
    createDraft.f.name = 'x';
    createDraft.f.prepTouched = true;
    createDraft.f = applyStartChange(createDraft.f, '2026-12-10');
    resetCreateDraft();
    expect(createDraft.f).toEqual({ name: '', start: '', end: '', prepStart: '', prepTouched: false });
  });
});

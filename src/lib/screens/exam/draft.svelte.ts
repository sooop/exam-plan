// 시험 만들기 폼의 입력 초안. Shell 은 선택된 탭만 마운트하므로 폼 컴포넌트의 지역 상태는 탭을 옮기면 사라진다.
// 그래서 초안을 모듈 수준 상태에 두어, 다른 탭에 다녀와도 입력이 남게 한다. 만들기·취소 때 비운다.
import { emptyCreateForm, type CreateFormState } from './logic';

export const createDraft = $state<{ f: CreateFormState }>({ f: emptyCreateForm() });

/** 초안을 비운다(만들었거나 취소했을 때) */
export function resetCreateDraft(): void {
  createDraft.f = emptyCreateForm();
}

/** 이름이나 날짜가 하나라도 들어 있는가 */
export function hasCreateDraft(): boolean {
  const f = createDraft.f;
  return !!(f.name.trim() || f.start || f.end || f.prepStart);
}

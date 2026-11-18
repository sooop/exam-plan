// HistoryPanel 서버 렌더 스모크: 컴파일되고 첫 화면의 구조(단추·탭·빈 상태)가 나오는지만 본다. 동작·움직임은 브라우저에서 확인해야 한다.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import HistoryPanel from '../../src/lib/history/HistoryPanel.svelte';
import { H } from '../../src/lib/history/texts';

describe('HistoryPanel (SSR 스모크)', () => {
  const { body } = render(HistoryPanel);

  it('상단 단추와 되돌리기 안내', () => {
    expect(body).toContain(H.saveNow);
    expect(body).toContain(H.undo);
    expect(body).toContain(H.redo);
    expect(body).toContain(H.undoNone); // 되돌릴 변경이 없으면 이유를 글자로 보인다
    expect(body).toMatch(/disabled/);
  });

  it('탭: role=tablist 와 선택 상태', () => {
    expect(body).toContain('role="tablist"');
    expect(body).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>스냅샷</);
    expect(body).toMatch(/role="tab"[^>]*aria-selected="false"[^>]*>작업 기록</);
    expect(body).toContain('role="tabpanel"');
  });

  it('이력이 없으면 채워지는 방법을 알려 주는 빈 상태, 강조 채움 단추는 없다', () => {
    expect(body.includes(H.empty) || body.includes(H.loading)).toBe(true);
    expect(body).not.toContain('btn primary');
  });
});

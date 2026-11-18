import { describe, expect, it } from 'vitest';
import { H, loserSubjectOf, loserWording } from '../../src/lib/history/texts';

describe('loserSubjectOf (충돌 스냅샷의 대상)', () => {
  it('sync-loser 가 아니면 null', () => {
    expect(loserSubjectOf({ kind: 'manual' })).toBeNull();
    expect(loserSubjectOf({ kind: 'before-sync', subject: 'settings' })).toBeNull();
  });
  it("sync-loser 에 subject 'settings' 가 있으면 설정, 없으면 시험", () => {
    expect(loserSubjectOf({ kind: 'sync-loser', subject: 'settings' })).toBe('settings');
    expect(loserSubjectOf({ kind: 'sync-loser' })).toBe('exam');
  });
});

describe('loserWording (대상별 문구)', () => {
  it('시험은 기존 문구를 그대로 쓴다', () => {
    const w = loserWording('exam');
    expect(w.button).toBe(H.restoreExam);
    expect(w.button).toBe('시험으로 복사…');
    expect(w.kindLabel).toBe(H.kind['sync-loser']);
    expect(w.confirm("진 시험")).toBe(H.restoreExamConfirm('진 시험'));
    expect(w.confirmLabel).toBe(H.restoreExamConfirmLabel);
    expect(w.tag).toBe('시험');
    expect(w.restoredToast).toBeNull();
  });
  it('설정은 설정으로 되돌리기 계열 문구와 지정된 확인 문장을 쓴다', () => {
    const w = loserWording('settings');
    expect(w.button).toBe('설정으로 되돌리기…');
    expect(w.confirmLabel).toBe('설정으로 되돌리기');
    expect(w.confirm('무엇이든')).toBe('이 기기의 현재 설정을 먼저 이력에 보존한 뒤 동기화 전의 설정으로 되돌립니다. 시험과 과목 목록은 바뀌지 않습니다');
    expect(w.kindLabel).toBe(H.kindSettingsLoser);
    expect(w.kindLabel).not.toBe(H.kind['sync-loser']);
    expect(w.tag).toBe('설정');
    expect(w.restoredToast).toBe(H.settingsRestoredToast);
  });
  it('시험과 설정의 단추 문구는 서로 다르다', () => {
    expect(loserWording('exam').button).not.toBe(loserWording('settings').button);
    expect(loserWording('exam').tag).not.toBe(loserWording('settings').tag);
  });
});

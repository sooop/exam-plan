import { describe, expect, it } from 'vitest';
import { errorReason, failureMessage, formatAgo, formatMb, formatSize } from '../../src/lib/sync/ui/format';

// 로컬 시각으로 만든다(시간대와 무관하게 같은 날짜 계산을 시험하려고)
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 11, 18, 12, 0);

describe('formatAgo (상대 시각)', () => {
  it('1분 미만과 미래 시각은 방금', () => {
    expect(formatAgo(NOW - 30_000, NOW)).toBe('방금');
    expect(formatAgo(NOW + 5_000, NOW)).toBe('방금');
  });

  it('1시간 미만은 분 단위', () => {
    expect(formatAgo(NOW - 60_000, NOW)).toBe('1분 전');
    expect(formatAgo(NOW - 59 * 60_000 - 59_000, NOW)).toBe('59분 전');
  });

  it('같은 날 1시간 이상은 시간 단위', () => {
    expect(formatAgo(at(2026, 11, 18, 9, 0), NOW)).toBe('3시간 전');
    expect(formatAgo(at(2026, 11, 18, 0, 30), NOW)).toBe('11시간 전');
  });

  it('하루 전 날짜는 어제', () => {
    expect(formatAgo(at(2026, 11, 17, 23, 0), NOW)).toBe('어제');
  });

  it('그 밖의 날짜는 올해면 월·일, 다른 해면 연도를 붙인다', () => {
    expect(formatAgo(at(2026, 11, 10, 8, 0), NOW)).toBe('11월 10일');
    expect(formatAgo(at(2025, 12, 31, 8, 0), NOW)).toBe('2025년 12월 31일');
  });

  it('기록이 없으면 없음', () => {
    expect(formatAgo(0, NOW)).toBe('없음');
  });
});

describe('errorReason (오류 사유 추출)', () => {
  it('Error 의 메시지를 쓰고 끝 마침표를 뗀다', () => {
    expect(errorReason(new Error('네트워크 연결이 끊겼습니다.'))).toBe('네트워크 연결이 끊겼습니다');
  });

  it('문자열과 {message}·{error} 객체를 받는다', () => {
    expect(errorReason('서버 응답 없음')).toBe('서버 응답 없음');
    expect(errorReason({ message: '키가 맞지 않습니다' })).toBe('키가 맞지 않습니다');
    expect(errorReason({ error: '한도 초과' })).toBe('한도 초과');
  });

  it('공백은 한 칸으로 정리한다', () => {
    expect(errorReason('  초대   코드가\n없습니다  ')).toBe('초대 코드가 없습니다');
  });

  it('읽을 것이 없으면 알 수 없는 오류', () => {
    expect(errorReason(null)).toBe('알 수 없는 오류');
    expect(errorReason(undefined)).toBe('알 수 없는 오류');
    expect(errorReason({})).toBe('알 수 없는 오류');
    expect(errorReason(new Error('   '))).toBe('알 수 없는 오류');
  });
});

describe('failureMessage (실패 문장)', () => {
  it('진행 문구의 "하는 중…"을 "하지 못했습니다"로 바꾸고 사유를 잇는다', () => {
    expect(failureMessage('동기화하는 중…', new Error('시간 초과'))).toBe('동기화하지 못했습니다: 시간 초과');
    expect(failureMessage('연결을 해제하는 중…', 'DB 잠김')).toBe('연결을 해제하지 못했습니다: DB 잠김');
    expect(failureMessage('서버에 올리는 중…', null)).toBe('서버에 올리지 못했습니다: 알 수 없는 오류');
  });
});

describe('크기 표기', () => {
  it('KB 와 MB', () => {
    expect(formatSize(262144)).toBe('256KB');
    expect(formatSize(1000)).toBe('1KB');
    expect(formatSize(1048576)).toBe('1.0MB');
    expect(formatMb(5242880)).toBe('5.0MB');
  });
});

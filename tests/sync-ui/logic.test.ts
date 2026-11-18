import { describe, expect, it } from 'vitest';
import {
  fillTarget, kindName, maskKey, maxItemText, needsAttention, problemAction, problemBody, retryText, serverLimitText, usageMeters,
} from '../../src/lib/sync/ui/logic';

describe('fillTarget (강조색 채움 단추는 하나)', () => {
  const base = { connected: true, hasResync: false, hasMass: false, reKey: false };
  it('연결 전에는 연결 단추', () => {
    expect(fillTarget({ ...base, connected: false })).toBe('connect');
  });
  it('resync 와 대량 삭제가 같이 있으면 resync 만 채운다', () => {
    expect(fillTarget({ ...base, hasResync: true, hasMass: true })).toBe('resync');
    expect(fillTarget({ ...base, hasMass: true, reKey: true })).toBe('mass');
  });
  it('키 다시 입력 중이면 키 바꾸기, 아니면 없음', () => {
    expect(fillTarget({ ...base, reKey: true })).toBe('rekey');
    expect(fillTarget(base)).toBe('none');
  });
});

describe('problemAction (오류 kind 별 조치 카드)', () => {
  it('키 문제는 키 다시 입력', () => {
    expect(problemAction('unauthorized')).toBe('rekey');
    expect(problemAction('crypto')).toBe('rekey');
  });
  it('일시적인 문제는 다시 시도', () => {
    expect(problemAction('unavailable')).toBe('retry');
    expect(problemAction('network')).toBe('retry');
    expect(problemAction('forbidden')).toBe('retry');
  });
  it('한도 문제는 조치 단추 없음(기다리거나 줄인다)', () => {
    expect(problemAction('rate-limited')).toBe('none');
    expect(problemAction('space-full')).toBe('none');
    expect(problemAction('item-limit')).toBe('none');
    expect(problemAction('item-too-large')).toBe('none');
  });
});

describe('problemBody (문제 안내 문장)', () => {
  it('하루 한도: 재개 시각이 없으면 내일 UTC 0시', () => {
    expect(problemBody({ kind: 'rate-limited' })).toContain('내일(UTC 0시 이후) 이어집니다');
  });
  it('한도 문제 안내에는 SYNC_LIMITS 기준 서버 한도를 쓴다', () => {
    expect(serverLimitText()).toBe('항목 1000개, 전체 5.0MB, 항목 하나 256KB');
    expect(problemBody({ kind: 'space-full' })).toContain('항목 1000개, 전체 5.0MB, 항목 하나 256KB');
    expect(maxItemText()).toBe('256KB');
  });
  it('키 문제는 기기 간 키 확인 안내', () => {
    expect(problemBody({ kind: 'unauthorized' })).toContain('키를 잘못 입력했거나');
  });
  it('자동 재시도 안내: 시각이 없으면 수동', () => {
    expect(retryText(undefined)).toBe('자동으로 다시 시도하지 않습니다. 지금 동기화로 다시 시도하세요');
    expect(retryText(Date.now() + 60_000)).toMatch(/에 자동으로 다시 시도합니다$/);
  });
});

describe('usageMeters (사용량, 오늘 쓰기 한도는 SYNC_LIMITS 3000)', () => {
  it('사용량이 없으면 칸을 만들지 않는다', () => {
    expect(usageMeters(undefined)).toEqual([]);
  });
  it('오늘 쓰기는 3000 기준으로 계산한다(sync-kit 기본 300 이면 1000 건에 상한 1 이 된다)', () => {
    const [items, bytes, writes] = usageMeters({ items: 500, bytes: 2621440, dailyWrites: 1000 });
    expect(items.ratio).toBeCloseTo(0.5);
    expect(bytes.ratio).toBeCloseTo(0.5);
    expect(writes.ratio).toBeCloseTo(1000 / 3000);
    expect(writes.text).toBe('1,000 / 3,000회');
    expect(writes.near).toBe(false);
  });
  it('80% 이상이면 한도 가까움', () => {
    const [, , writes] = usageMeters({ items: 0, bytes: 0, dailyWrites: 2400 });
    expect(writes.near).toBe(true);
    expect(writes.ratio).toBeCloseTo(0.8);
  });
  it('칸 이름과 글자 표기', () => {
    const m = usageMeters({ items: 10, bytes: 1048576, dailyWrites: 5 });
    expect(m.map((x) => x.label)).toEqual(['항목 수', '저장 용량', '오늘 쓰기']);
    expect(m[0].text).toBe('10 / 1,000개');
    expect(m[1].text).toBe('1.0MB / 5.0MB');
  });
});

describe('키 가리기와 항목 이름', () => {
  it('영문 대문자·숫자는 가리고 하이픈은 남긴다', () => {
    expect(maskKey('AB12-CD34')).toBe('••••-••••');
  });
  it('종류 이름: 시험·과목 목록·설정, 모르는 종류는 항목', () => {
    expect(kindName('doc')).toBe('시험');
    expect(kindName('snippet')).toBe('과목 목록');
    expect(kindName('thread')).toBe('설정');
    expect(kindName('etc')).toBe('항목');
  });
});

describe('needsAttention (헤더 배지 주의 표시)', () => {
  it('오류는 주의', () => {
    expect(needsAttention('error', true)).toBe(true);
  });
  it('문제 때문에 멈춘 경우만 주의, 사용자가 직접 멈춘 것은 아님', () => {
    expect(needsAttention('paused', true)).toBe(true);
    expect(needsAttention('paused', false)).toBe(false);
  });
  it('정상 상태는 주의 없음', () => {
    expect(needsAttention('idle', false)).toBe(false);
    expect(needsAttention('syncing', false)).toBe(false);
  });
});

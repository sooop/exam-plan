/* 오늘 탭 순수 로직 시험. 구역 분류는 원본 legacy 의 todayTab 이 쓰는 함수(overdue·tasksByDate·prepDays·progress·subProgress)를
   같은 입력에 돌린 결과와 대조한다. 원본의 todayTab 자체는 DOM 을 만들므로 그 머리·구역 규칙을 아래에 옮겨 적어 비교한다. */
import { describe, expect, it } from 'vitest';
import * as core from '../../../src/lib/core';
import { addSub, newExam, newState, moveTask, setPlan } from '../../../src/lib/core';
import type { Exam, State } from '../../../src/lib/core/types';
import { S, fmtMD } from '../../../src/lib/app/strings';
import { TT } from '../../../src/lib/screens/today/texts';
import {
  UPCOMING_LIMIT, bodyMessage, bodyOf, classify, ddayText, phaseOf,
} from '../../../src/lib/screens/today/logic';
import { loadLegacy } from '../../core/legacy-loader';
import { buildRich } from '../../core/fixtures';

const legacy = loadLegacy();

/* 원본 todayTab 의 머리 규칙(legacy head) 그대로 */
function legacyHead(ex: Exam, today: string): string {
  if (today > ex.end) return S.afterExam;
  if (today >= ex.start) return S.duringExam;
  return S.remainDays(legacy.diffDays(today, ex.start));
}

/* 원본 todayTab 의 다음 할일 규칙: 준비 기간 날짜 중 오늘 뒤이고 할일이 있는 날짜 앞에서 3개 */
function legacyUpcoming(ex: Exam, today: string): { iso: string; ids: string[] }[] {
  const map = legacy.tasksByDate(ex);
  return legacy.prepDays(ex)
    .filter((d) => d > today && (map[d] || []).length)
    .slice(0, 3)
    .map((iso) => ({ iso, ids: (map[iso] || []).map((t) => t.id) }));
}

function setupExam(): { st: State; ex: Exam } {
  const st = buildRich(core);
  return { st, ex: st.exams[0] };
}

describe('phaseOf · ddayText (머리말)', () => {
  const ex = { start: '2026-06-22', end: '2026-06-26' };
  it('시작 전·시험 기간·종료 뒤를 나눈다(경계 포함)', () => {
    expect(phaseOf(ex, '2026-06-21')).toBe('before');
    expect(phaseOf(ex, '2026-06-22')).toBe('during');
    expect(phaseOf(ex, '2026-06-26')).toBe('during');
    expect(phaseOf(ex, '2026-06-27')).toBe('after');
  });
  it('문구는 원본 head 와 같다', () => {
    expect(ddayText(ex, '2026-06-10')).toBe(S.remainDays(12));
    expect(ddayText(ex, '2026-06-22')).toBe(S.duringExam);
    expect(ddayText(ex, '2026-06-30')).toBe(S.afterExam);
    expect(ddayText(ex, '2026-06-10')).toBe(legacyHead(ex as Exam, '2026-06-10'));
    expect(ddayText(ex, '2026-06-24')).toBe(legacyHead(ex as Exam, '2026-06-24'));
  });
});

describe('bodyOf · bodyMessage (본문 상태, 각각 다른 문장)', () => {
  const base = { end: '2026-06-26', prepStart: '2026-06-01' };
  it('준비 기간 전·시험 후·오늘 할일 있음·오늘 할일 없음·할일 없음을 나눈다', () => {
    expect(bodyOf({ ...base, tasks: [] }, '2026-05-31', 0)).toBe('beforePrep');
    expect(bodyOf({ ...base, tasks: [] }, '2026-06-01', 0)).toBe('noTasks');
    expect(bodyOf({ ...base, tasks: [{} as never] }, '2026-06-01', 0)).toBe('noneToday');
    expect(bodyOf({ ...base, tasks: [{} as never] }, '2026-06-01', 2)).toBe('today');
    expect(bodyOf({ ...base, tasks: [{} as never] }, '2026-06-27', 0)).toBe('afterExam');
  });
  it('안내 문장은 상태마다 다르고 준비 시작일이 들어간다', () => {
    const ex = { prepStart: '2026-06-01' };
    const msgs = (['beforePrep', 'afterExam', 'noneToday', 'noTasks'] as const).map((b) => bodyMessage(b, ex));
    expect(new Set(msgs).size).toBe(4);
    for (const m of msgs) expect(m.length).toBeGreaterThan(0);
    expect(bodyMessage('beforePrep', ex)).toContain(fmtMD('2026-06-01'));
    expect(bodyMessage('today', ex)).toBe('');
  });
});

describe('classify (원본 todayTab 구역과 대조)', () => {
  const days = ['2026-03-30', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-06', '2026-04-07', '2026-04-18', '2026-04-24', '2026-04-25', '2026-06-10'];

  it('지연·오늘·다음 할일·머리말이 원본과 같은 입력에서 같다', () => {
    const { ex } = setupExam();
    for (const today of days) {
      const v = classify(ex, today);
      const map = legacy.tasksByDate(ex);
      // 지연: 원본 overdue 와 같은 객체·같은 순서
      expect(v.overdue.map((t) => t.id)).toEqual(legacy.overdue(ex, today).map((t) => t.id));
      // 오늘: 원본 목록을 원본 정렬 규칙으로 정렬한 것과 같다
      const expToday = (map[today] || []).slice().sort((a, b) => a.esId.localeCompare(b.esId) || a.seq - b.seq);
      expect(v.todays.map((t) => t.id)).toEqual(expToday.map((t) => t.id));
      // 다음 할일: 날짜·할일 id 가 원본과 같다
      expect(v.upcoming.map((g) => ({ iso: g.iso, ids: g.tasks.map((t) => t.id) }))).toEqual(legacyUpcoming(ex, today));
      // 머리말
      expect(v.ddayText).toBe(legacyHead(ex, today));
      // 이월 단추: 원본은 오늘이 종료일 이전일 때 보인다
      expect(v.canCarry).toBe(today <= ex.end);
    }
  });

  it('같은 객체를 돌려준다(복사본을 만들지 않는다)', () => {
    const { st, ex } = setupExam();
    const v = classify(ex, '2026-04-06');
    const found = v.overdue.concat(v.todays, ...v.upcoming.map((g) => g.tasks));
    expect(found.length).toBeGreaterThan(0);
    for (const t of found) expect(ex.tasks).toContain(t);
    expect(st.exams[0].tasks).toBe(ex.tasks);
  });

  it('지연 할일은 끝낸 것을 빼고, 오늘 할일은 끝낸 것도 남긴다(원본과 같다)', () => {
    const { ex } = setupExam();
    const v = classify(ex, '2026-04-06');
    expect(v.overdue.every((t) => !t.done && !!t.date && t.date < '2026-04-06')).toBe(true);
    expect(v.todays.some((t) => t.done)).toBe(true);
  });

  it('다음 할일은 최대 3개 날짜만 보이고, 오늘과 그 이전 날짜는 뺀다', () => {
    const st = newState();
    const r = newExam({ name: '중간', start: '2026-04-20', end: '2026-04-30', prepStart: '2026-04-14' });
    if ('error' in r) throw new Error(r.error);
    const ex = r.exam;
    st.exams.push(ex);
    const a = addSub(st, ex, '국어', null);
    if ('error' in a) throw new Error(a.error);
    setPlan(ex, a.sub, { n: 6, m: 0, r: 0 });
    const dates = ['2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17', '2026-04-18', '2026-04-19'];
    ex.tasks.forEach((t, i) => moveTask(ex, t.id, dates[i]));
    const v = classify(ex, '2026-04-15');
    expect(v.upcoming.map((g) => g.iso)).toEqual(['2026-04-16', '2026-04-17', '2026-04-18']);
    expect(v.upcoming.length).toBe(UPCOMING_LIMIT);
    expect(v.todays.length).toBe(1);
    expect(v.overdue.map((t) => t.date)).toEqual(['2026-04-14']);
  });

  it('준비 기간 전이면 오늘 목록은 비고 본문은 준비 기간 전 상태다', () => {
    const { ex } = setupExam();
    const v = classify(ex, '2026-03-30');
    expect(v.body).toBe('beforePrep');
    expect(v.todays).toEqual([]);
    expect(v.phase).toBe('before');
  });

  it('시험이 끝나면 이월을 보이지 않고 본문은 시험 후 상태다', () => {
    const { ex } = setupExam();
    const v = classify(ex, '2026-06-10');
    expect(v.body).toBe('afterExam');
    expect(v.canCarry).toBe(false);
    expect(v.phase).toBe('after');
  });
});

describe('진행률은 원본 progress·subProgress 와 같다', () => {
  it('전체와 과목별 완료 수', () => {
    const { ex } = setupExam();
    expect(core.progress(ex)).toEqual(legacy.progress(ex));
    for (const es of ex.subs) {
      const mine = core.subProgress(ex, es);
      const theirs = legacy.subProgress(ex, es);
      expect({ total: mine.total, done: mine.done, placed: mine.placed }).toEqual({ total: theirs.total, done: theirs.done, placed: theirs.placed });
    }
  });
});

describe('문구', () => {
  it('오늘 탭 새 문구는 비어 있지 않다', () => {
    for (const v of Object.values(TT)) if (typeof v === 'string') expect(v.length).toBeGreaterThan(0);
  });
  it('이모지나 장식 기호를 쓰지 않는다', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const v of Object.values(TT)) if (typeof v === 'string') expect(emoji.test(v)).toBe(false);
  });
});

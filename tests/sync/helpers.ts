// 어댑터 시험 공용: 메모리 SyncHost 와 상태 조립 도구
import type { Exam, State } from '../../src/lib/core/types';
import { addSub, newExam, newState, sanitizeState, setPlan, moveTask } from '../../src/lib/core';
import type { SyncHost } from '../../src/lib/sync/adapter';

export interface LoserRecord { name: string; exam: unknown; at: number }
export interface MemHost extends SyncHost {
  state: State;
  losers: LoserRecord[];
  /** 충돌에서 진 설정(preserveLoserSettings) */
  losersSettings: { name: string; settings: unknown; at: number }[];
  applied: number;
  appliedCalls: number;
}

/** 메모리 호스트. applyRemote 는 상태를 복사해 mutator 에 넘기고 결과를 받아 둔다(updatedAt 은 올리지 않는다) */
export function memHost(initial: State = newState()): MemHost {
  const h: MemHost = {
    state: initial,
    losers: [],
    losersSettings: [],
    applied: 0,
    appliedCalls: 0,
    getState: () => h.state,
    applyRemote(mutator) {
      const draft = JSON.parse(JSON.stringify(h.state)) as State;
      mutator(draft);
      h.state = draft;
      h.appliedCalls += 1;
    },
    preserveLoserExam(item) { h.losers.push(item); },
    preserveLoserSettings(item) { h.losersSettings.push(item); },
    onApplied() { h.applied += 1; },
  };
  return h;
}

export function mkExam(st: State, name: string, subjects: string[], opts: { start?: string; end?: string; prepStart?: string } = {}): Exam {
  const r = newExam({ name, start: opts.start ?? '2026-06-22', end: opts.end ?? '2026-06-26', prepStart: opts.prepStart ?? '2026-06-01' });
  if ('error' in r) throw new Error(r.error);
  st.exams.push(r.exam);
  if (!st.activeId) st.activeId = r.exam.id;
  for (const s of subjects) addSub(st, r.exam, s, null);
  return r.exam;
}

/** 시험 2개·과목 3개·배치된 할일·날짜 설정이 있는 상태. sanitizeState 를 한 번 거쳐 저장본과 같은 모양으로 만든다 */
export function richState(): State {
  const st = newState();
  const a = mkExam(st, '2026 중간고사', ['국어', '수학', '영어']);
  const b = mkExam(st, '기말고사', ['국어', '과학']);
  setPlan(a, a.subs[0], { n: 2, m: 1, r: 1 });
  moveTask(a, a.tasks[0].id, '2026-06-05');
  moveTask(a, a.tasks[1].id, '2026-06-08');
  a.subs[1].range = '1~3단원';
  a.subs[1].links = [{ label: '자료', url: 'https://example.com/a' }];
  a.days['2026-06-10'] = { level: 'busy', note: '학원' };
  a.week = { 1: 'busy' };
  st.limits.packed = 2;
  st.recapDays = 5;
  st.week = { 6: 'normal' };
  st.updatedAt = 1_700_000_000_000;
  st.activeId = b.id;
  const clean = sanitizeState(JSON.parse(JSON.stringify(st)));
  if (!clean) throw new Error('richState 가 sanitize 를 통과하지 못했다');
  return clean;
}


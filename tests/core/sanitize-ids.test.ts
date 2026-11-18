/* sanitizeState 의 id 40자 절단 규칙 시험. 저장하는 id 와 참조 검사가 모두 자른 값으로 같아야 한다. */
import { describe, expect, it } from 'vitest';
import { sanitizeState } from '../../src/lib/core/sanitize';
import type { State } from '../../src/lib/core/types';

const LONG_L = 'L'.repeat(45); // 라이브러리 id (40자 초과)
const LONG_S = 'S'.repeat(50); // 시험 안 과목 배치 id
const LONG_T = 'T'.repeat(41); // 할일 id
const LONG_E = 'E'.repeat(60); // 시험 id
const cut = (s: string) => s.slice(0, 40);

const exam = (id: unknown, subs: unknown[], tasks: unknown[], extra: Record<string, unknown> = {}) => ({
  id, name: '중간', start: '2026-04-20', end: '2026-04-24', prepStart: '2026-04-01', subs, tasks, days: {}, week: {}, ...extra,
});

/** 저장된 상태 안의 모든 참조가 같은 id 를 가리키는지 본다 */
function expectReferencesResolve(st: State): void {
  const libIds = new Set(st.library.map((s) => s.id));
  const examIds = new Set(st.exams.map((e) => e.id));
  expect(st.activeId === null || examIds.has(st.activeId)).toBe(true);
  for (const e of st.exams) {
    const esIds = new Set(e.subs.map((s) => s.id));
    for (const s of e.subs) expect(libIds.has(s.subjectId)).toBe(true);
    for (const t of e.tasks) expect(esIds.has(t.esId)).toBe(true);
  }
}

describe('id 40자 절단: 저장 값과 참조 검사가 같은 규칙을 쓴다', () => {
  it('40자를 넘는 id 는 자른 값으로 저장되고, 참조도 자른 값으로 연결된다', () => {
    const raw = {
      v: 3,
      library: [{ id: LONG_L, name: '국어' }],
      exams: [exam(LONG_E, [{ id: LONG_S, subjectId: LONG_L, plan: { n: 1, m: 0, r: 0 } }], [{ id: LONG_T, esId: LONG_S, type: 's', seq: 1, date: null, done: false }])],
      activeId: LONG_E,
    };
    const out = sanitizeState(raw)!;
    expect(out.library[0].id).toBe(cut(LONG_L));
    expect(out.exams[0].id).toBe(cut(LONG_E));
    expect(out.exams[0].subs[0].id).toBe(cut(LONG_S));
    expect(out.exams[0].subs[0].subjectId).toBe(cut(LONG_L));
    expect(out.exams[0].tasks.map((t) => [t.id, t.esId])).toEqual([[cut(LONG_T), cut(LONG_S)]]);
    expect(out.activeId).toBe(cut(LONG_E));
    expectReferencesResolve(out);
  });

  it('활성 시험 id 가 자른 값과 맞으면 그 시험을 고른다(자르기 전 값으로는 맞지 않는다)', () => {
    const raw = { v: 3, library: [], exams: [exam(LONG_E, [], [])], activeId: LONG_E };
    expect(sanitizeState(raw)!.activeId).toBe(cut(LONG_E));
  });

  it('자른 뒤 같은 라이브러리 id 가 되면 뒤의 항목을 버리고, 그 id 를 가리키는 과목은 남은 항목에 연결된다', () => {
    const LONG_L2 = 'L'.repeat(40) + 'M'.repeat(5); // 자르면 LONG_L 과 같다
    const drops: Record<string, number> = {};
    const raw = {
      v: 3,
      library: [{ id: LONG_L, name: '국어' }, { id: LONG_L2, name: '수학' }],
      exams: [exam('e1', [{ id: 's1', subjectId: LONG_L2, plan: {} }], [])],
    };
    const out = sanitizeState(raw, { onDrop: (k, n) => { drops[k] = (drops[k] ?? 0) + n; } })!;
    expect(out.library.map((s) => [s.id, s.name])).toEqual([[cut(LONG_L), '국어']]);
    expect(out.exams[0].subs.map((s) => s.subjectId)).toEqual([cut(LONG_L)]);
    expect(drops).toEqual({ library: 1 });
    expectReferencesResolve(out);
  });

  it('자른 뒤 같은 시험 id 가 되면 뒤의 시험을 버린다', () => {
    const LONG_E2 = 'E'.repeat(40) + 'F'.repeat(3);
    const drops: Record<string, number> = {};
    const raw = { v: 3, library: [], exams: [exam(LONG_E, [], []), exam(LONG_E2, [], [])] };
    const out = sanitizeState(raw, { onDrop: (k, n) => { drops[k] = (drops[k] ?? 0) + n; } })!;
    expect(out.exams.map((e) => e.id)).toEqual([cut(LONG_E)]);
    expect(drops).toEqual({ exam: 1 });
  });

  it('자른 뒤 같은 과목 배치 id 가 되면 뒤의 배치를 버리고, 그 id 를 가리키는 할일은 남은 배치에 붙는다', () => {
    const LONG_S2 = 'S'.repeat(40) + 'Q'.repeat(10);
    const drops: Record<string, number> = {};
    const raw = {
      v: 3,
      library: [{ id: 'a', name: '국어' }, { id: 'b', name: '수학' }],
      exams: [exam('e1',
        [{ id: LONG_S, subjectId: 'a', plan: { n: 2, m: 0, r: 0 } }, { id: LONG_S2, subjectId: 'b', plan: { n: 1, m: 0, r: 0 } }],
        [{ id: 't1', esId: LONG_S2, type: 's', seq: 1, date: null, done: false }, { id: 't2', esId: LONG_S, type: 's', seq: 1, date: null, done: false }])],
    };
    const out = sanitizeState(raw, { onDrop: (k, n) => { drops[k] = (drops[k] ?? 0) + n; } })!;
    expect(out.exams[0].subs.map((s) => s.id)).toEqual([cut(LONG_S)]);
    expect(out.exams[0].tasks.map((t) => [t.id, t.esId])).toEqual([['t1', cut(LONG_S)], ['t2', cut(LONG_S)]]);
    expect(drops).toEqual({ sub: 1 });
    expectReferencesResolve(out);
  });

  it('정리 결과를 다시 정리해도 같다(절단이 두 번 적용돼도 값이 바뀌지 않는다)', () => {
    const raw = {
      v: 3,
      library: [{ id: LONG_L, name: '국어' }],
      exams: [exam(LONG_E, [{ id: LONG_S, subjectId: LONG_L, plan: { n: 1, m: 0, r: 0 } }], [{ id: LONG_T, esId: LONG_S, type: 's', seq: 1, date: null, done: false }])],
      activeId: LONG_E,
    };
    const once = sanitizeState(raw)!;
    const twice = sanitizeState(JSON.parse(JSON.stringify(once)))!;
    expect(twice).toStrictEqual(once);
  });

  it('40자 이하의 짧은 id 는 그대로 보존된다', () => {
    const raw = {
      v: 3,
      library: [{ id: 'sub1', name: '국어' }],
      exams: [exam('ex1', [{ id: 'es1', subjectId: 'sub1', plan: { n: 1 } }], [{ id: 't1', esId: 'es1', type: 's', seq: 1, date: null, done: false }])],
      activeId: 'ex1',
    };
    const out = sanitizeState(raw)!;
    expect(out.library[0].id).toBe('sub1');
    expect(out.exams[0].subs[0]).toMatchObject({ id: 'es1', subjectId: 'sub1' });
    expect(out.exams[0].tasks[0]).toMatchObject({ id: 't1', esId: 'es1' });
    expect(out.activeId).toBe('ex1');
  });
});

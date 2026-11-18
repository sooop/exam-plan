import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addSubs, newExam, newState, previewExamFields } from '../../../src/lib/core/planner';
import type { Exam, State } from '../../../src/lib/core/types';
import { previewEdit } from '../../../src/lib/screens/exam/preview.svelte';

/** Svelte  와 같이 값을 Proxy 로 감싼다(vitest 는 서버 모드로 컴파일해  가 일반 객체라서, 복제 불가능한 Proxy 를 직접 만든다) */
function proxied<T extends object>(o: T): T {
  return new Proxy(o, {
    get(t, k, r) {
      const v = Reflect.get(t, k, r);
      return v && typeof v === 'object' ? proxied(v as object) : v;
    },
  });
}

function sample(): { state: State; exam: Exam } {
  const state = newState();
  const r = newExam({ name: '기말고사', start: '2026-12-10', end: '2026-12-12', prepStart: '2026-12-01' });
  if ('error' in r) throw new Error(r.error);
  addSubs(state, r.exam, { text: '국어, 수학' }, '2026-12-10');
  state.exams.push(r.exam);
  state.activeId = r.exam.id;
  return { state, exam: r.exam };
}

describe('시험 정보 영향 미리보기와 $state 프록시(H1 회귀)', () => {
  it('프록시를 core 의 previewExamFields 에 직접 넘기면 structuredClone 이 실패한다(이 함정을 막는 것이 previewEdit)', () => {
    const { state, exam } = sample();
    expect(() => previewExamFields(state, proxied(exam), { name: '새 이름', start: exam.start, end: exam.end, prepStart: exam.prepStart })).toThrow();
  });
  it('previewEdit 은 프록시를 넘겨도 터지지 않고 일반 객체와 같은 결과를 돌려준다', () => {
    const { state, exam } = sample();
    const fields = { name: '새 이름', start: '2026-12-11', end: '2026-12-12', prepStart: exam.prepStart };
    const viaProxy = previewEdit(state, proxied(exam), fields);
    expect(viaProxy.ok).toBe(true);
    expect(viaProxy).toEqual(previewExamFields(state, exam, fields));
    expect(viaProxy.changedSubDates).toBeGreaterThan(0);
  });
  it('previewEdit 은 원본을 바꾸지 않는다', () => {
    const { state, exam } = sample();
    const p = proxied(exam);
    previewEdit(state, p, { name: '새 이름', start: '2026-12-11', end: '2026-12-12', prepStart: exam.prepStart });
    expect(p.start).toBe('2026-12-10');
    expect(p.name).toBe('기말고사');
  });
  it('화면(.svelte)은 previewExamFields 를 직접 부르지 않는다', () => {
    const root = join(__dirname, '../../../src/lib');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.svelte') && /previewExamFields\s*\(/.test(readFileSync(p, 'utf8'))) hits.push(p);
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });
});

/* 할일 양을 바꿔 가며 쓰는 시험 입력과 PDF 텍스트 대조 도구(분할 인쇄 시험·검증 스크립트 공용).
   할일은 시드 난수로 날짜에 흩어 놓아(같은 과목의 이어지는 회차가 한 날에 몰리지 않게) 병합이 잘 먹지 않는 어려운 입력을 만든다. */
import * as core from '../../../src/lib/core/index';
import type { Exam, State } from '../../../src/lib/core/types';

export type Load = 'normal' | 'many' | 'verymany' | 'extreme';
/* 하루 평균 할일 수 */
export const PER_DAY: Record<Load, number> = { normal: 4, many: 8, verymany: 12, extreme: 15 };
export const SUBJECTS = ['국어', '수학', '영어', '과학', '사회', '한국사'];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* weeks: 4 또는 5(준비 기간 주 수, 월요일 시작). perDay: 준비 기간 하루당 할일 수. 마지막 주의 일부 날은 시험 기간이다 */
export function buildLoad(weeks: 4 | 5, perDay: number, seed = 7): { state: State; exam: Exam } {
  const st = core.newState();
  const [start, end] = weeks === 4 ? ['2026-12-07', '2026-12-11'] : ['2026-12-14', '2026-12-18'];
  const exam = (core.newExam({ name: '2학기 기말고사', start, end, prepStart: '2026-11-16' }) as { exam: Exam }).exam;
  st.exams.push(exam);
  st.activeId = exam.id;
  core.addSubs(st, exam, SUBJECTS.join(', '), null);
  const days = core.prepDays(exam);
  const per = Math.ceil((perDay * days.length) / exam.subs.length);
  const n = Math.min(30, Math.ceil(per * 0.45));
  const m = Math.min(30, Math.ceil(per * 0.4));
  const r = Math.min(30, Math.max(0, per - n - m));
  exam.subs.forEach((s) => core.setPlan(exam, s, { n, m, r }));
  const rand = rng(seed);
  const order = exam.tasks.map((_, i) => i).sort(() => rand() - 0.5);
  order.forEach((ti, k) => { exam.tasks[ti].date = days[k % days.length]; });
  return { state: st, exam };
}

/* 모든 할일이 PDF 텍스트에 나타나는지 대조한다. 라벨('국어 3/10') 그대로이거나 병합 표기('국어 3–5/10')의 범위 안이면 나타난 것이다.
   빠진 할일의 라벨을 돌려준다. */
export function missingTasks(state: State, exam: Exam, text: string): string[] {
  const flat = text.replace(/\s+/g, ' ');
  const seen = new Set<string>();
  const re = /([가-힣A-Za-z0-9]+(?: 리캡)?) (\d+)(?:[–-](\d+))?\/(\d+)/g;
  let mt: RegExpExecArray | null;
  while ((mt = re.exec(flat))) {
    const a = Number(mt[2]);
    const z = mt[3] ? Number(mt[3]) : a;
    for (let q = a; q <= z; q++) seen.add(mt[1] + '|' + q + '|' + mt[4]);
  }
  const out: string[] = [];
  exam.tasks.forEach((t) => {
    if (!t.date) return;
    const label = core.taskLabel(state, exam, t);
    const mm = /^(.+) (\d+)\/(\d+)$/.exec(label);
    if (!mm || !seen.has(mm[1] + '|' + mm[2] + '|' + mm[3])) out.push(label);
  });
  return out;
}

/* sanitizeState 의 버린 항목 보고(onDrop)와 importMerge 의 skipped·skippedDetail 시험. */
import { describe, expect, it } from 'vitest';
import * as core from '../../src/lib/core/index';
import { exportPayload, importMerge, sanitizeState, type DropKind } from '../../src/lib/core/sanitize';
import { newState } from '../../src/lib/core/planner';
import { buildRich } from './fixtures';

type Counts = Partial<Record<DropKind, number>>;

function collect(input: unknown): { out: ReturnType<typeof sanitizeState>; drops: Counts } {
  const drops: Counts = {};
  const out = sanitizeState(input, { onDrop: (k, n) => { drops[k] = (drops[k] ?? 0) + n; } });
  return { out, drops };
}

const exam = (id: string, subs: unknown[] = [], tasks: unknown[] = [], extra: Record<string, unknown> = {}) => ({
  id, name: '중간', start: '2026-04-20', end: '2026-04-24', prepStart: '2026-04-01', subs, tasks, days: {}, week: {}, ...extra,
});
const lib = (id: string, name: string) => ({ id, name, color: '#C4705A' });
const link = (i: number) => ({ label: 'l' + i, url: 'https://example.com/' + i });

describe('sanitizeState: 버린 항목 보고', () => {
  it('옵션을 주지 않으면 결과가 옵션을 준 것과 같다', () => {
    const raw = { v: 3, library: [lib('a', '국어'), null], exams: [exam('e1', [{ id: 's1', subjectId: 'a', plan: {} }]), null] };
    expect(sanitizeState(raw)).toStrictEqual(sanitizeState(raw, { onDrop: () => {} }));
  });

  it('시험 단위: 날짜가 거꾸로, 이름이 비었거나, 빈 항목은 exam 으로 센다', () => {
    const raw = {
      v: 3, library: [],
      exams: [
        exam('ok'),
        { ...exam('bad-date'), end: '2026-04-10' },
        { ...exam('no-name'), name: '   ' },
        null,
      ],
    };
    const { out, drops } = collect(raw);
    expect(out!.exams.map((e) => e.id)).toEqual(['ok']);
    expect(drops).toEqual({ exam: 3 });
  });

  it('과목 배치: 없는 과목, 같은 과목 두 번, 같은 배치 id 는 sub 로 센다', () => {
    const raw = {
      v: 3, library: [lib('a', '국어')],
      exams: [exam('e1', [
        { id: 's1', subjectId: 'a', plan: {} },
        { id: 's2', subjectId: 'zzz', plan: {} },
        { id: 's3', subjectId: 'a', plan: {} },
        { id: 's1', subjectId: 'a', plan: {} },
      ])],
    };
    const { out, drops } = collect(raw);
    expect(out!.exams[0].subs.map((s) => s.id)).toEqual(['s1']);
    expect(drops).toEqual({ sub: 3 });
  });

  it('할일: 종류가 틀리거나, 배치가 없거나, id 가 겹치면 task 로 센다', () => {
    const raw = {
      v: 3, library: [lib('a', '국어')],
      exams: [exam('e1', [{ id: 's1', subjectId: 'a', plan: { n: 2, m: 0, r: 0 } }], [
        { id: 't1', esId: 's1', type: 's', seq: 1, date: null, done: false },
        { id: 't2', esId: 's1', type: 'x', seq: 2, date: null, done: false },
        { id: 't3', esId: 'nope', type: 's', seq: 1, date: null, done: false },
        { id: 't1', esId: 's1', type: 's', seq: 3, date: null, done: false },
        { id: 't4', esId: 's1', type: 's', seq: 4, date: null, done: false },
      ])],
    };
    const { out, drops } = collect(raw);
    expect(out!.exams[0].tasks.map((t) => t.id)).toEqual(['t1', 't4']);
    expect(drops).toEqual({ task: 3 });
  });

  it('분량이 줄어 맞춰 지운 할일은 task 로 세고, 늘린 할일은 세지 않는다', () => {
    const raw = {
      v: 3, library: [lib('a', '국어'), lib('b', '수학')],
      exams: [exam('e1', [
        { id: 's1', subjectId: 'a', plan: { n: 0, m: 0, r: 0 } },
        { id: 's2', subjectId: 'b', plan: { n: 2, m: 0, r: 0 } },
      ], [
        { id: 't1', esId: 's1', type: 's', seq: 1, date: null, done: false },
        { id: 't2', esId: 's1', type: 's', seq: 2, date: null, done: false },
      ])],
    };
    const { out, drops } = collect(raw);
    expect(out!.exams[0].tasks.filter((t) => t.esId === 's1')).toHaveLength(0);
    expect(out!.exams[0].tasks.filter((t) => t.esId === 's2')).toHaveLength(2);
    expect(drops).toEqual({ task: 2 });
  });

  it('링크: 주소가 안전하지 않거나 null 이거나 20개를 넘는 것은 link 로 센다', () => {
    // 앞 20개(인덱스 0~19) 안에서 잘못된 2개(주소·null)가 빠지고, 인덱스 20~23 의 4개는 한도 때문에 빠진다
    const links = [link(0), { label: 'bad', url: 'javascript:alert(1)' }, null, ...Array.from({ length: 21 }, (_, i) => link(i + 1))];
    const raw = { v: 3, library: [lib('a', '국어')], exams: [exam('e1', [{ id: 's1', subjectId: 'a', plan: {}, links }])] };
    const { out, drops } = collect(raw);
    expect(out!.exams[0].subs[0].links).toHaveLength(18);
    expect(drops).toEqual({ link: 6 });
  });

  it('과목 보관함: 중복 이름, 빈 이름, null, 중복 id 는 library 로 센다', () => {
    const raw = {
      v: 3,
      library: [lib('a', '국어'), lib('b', '  국어 '), null, { id: 'c', name: '' }, { id: 'a', name: '수학' }],
      exams: [],
    };
    const { out, drops } = collect(raw);
    expect(out!.library.map((s) => s.id)).toEqual(['a']);
    expect(drops).toEqual({ library: 4 });
  });

  it('정상 데이터는 아무것도 세지 않는다', () => {
    const st = buildRich(core);
    const { drops } = collect(JSON.parse(JSON.stringify(st)));
    expect(drops).toEqual({});
  });
});

describe('importMerge: skipped 와 skippedDetail', () => {
  it('정상 파일은 기존 모양({added, dup, skipped:0})을 그대로 낸다', () => {
    const payload = exportPayload(buildRich(core));
    const r = importMerge(newState(), JSON.parse(JSON.stringify(payload)));
    expect(r).toStrictEqual({ added: 2, dup: 0, skipped: 0 });
    expect('skippedDetail' in r).toBe(false);
  });

  it('시험 단위 제외는 skipped 에, 안의 항목 제외는 skippedDetail 에 센다', () => {
    const payload = JSON.parse(JSON.stringify(exportPayload(buildRich(core)))) as {
      state: { exams: Record<string, any>[]; library: unknown[] };
    };
    const firstSub = payload.state.exams[0].subs[0];
    payload.state.exams.push({ id: 'bad-date', name: '잘못', start: '2026-12-10', end: '2026-12-01', prepStart: '2026-11-01', subs: [], tasks: [], days: {}, week: {} });
    payload.state.exams[0].subs.push({ id: 'zz', subjectId: 'nope', plan: {} });
    payload.state.exams[0].tasks.push({ id: 'tx', esId: firstSub.id, type: 'x', seq: 1, date: null, done: false });
    payload.state.library.push(null);
    const r = importMerge(newState(), payload as never);
    expect(r).toMatchObject({ added: 2, dup: 0, skipped: 1, skippedDetail: { exams: 1, subs: 1, tasks: 1, library: 1 } });
  });

  it('이미 있는 시험은 중복으로 세고 skipped 에 넣지 않는다', () => {
    const src = buildRich(core);
    const payload = JSON.parse(JSON.stringify(exportPayload(src)));
    const target = newState();
    importMerge(target, JSON.parse(JSON.stringify(payload)));
    const again = importMerge(target, payload);
    expect(again).toStrictEqual({ added: 0, dup: 2, skipped: 0 });
  });
});

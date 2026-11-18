/* 원본 Planner 와 새 TS 모듈의 대조 시험. 같은 입력을 두 구현에 넣어 결과를 deepEqual 로 비교한다. */
import { afterEach, describe, expect, it } from 'vitest';
import { FROZEN_NOW, mulberry32, restoreEnv, runBoth, type Core } from './legacy-loader';
import type { Exam, State, SubPlacement, Task } from '../../src/lib/core/types';
import { buildRich } from './fixtures';

afterEach(() => restoreEnv());

/* 날짜 범위 안의 모든 날짜에 대한 dayInfo 와 판정. */
function dayReport(api: Core, st: State, e: Exam): unknown[] {
  return api.prepDays(e).map((iso) => ({
    iso,
    info: api.dayInfo(st, e, iso),
    holiday: api.isHoliday(e, iso),
    holidayName: api.holidayName(e, iso),
    level: api.levelOf(e, iso),
    defaultLevel: api.defaultLevel(e, iso),
  }));
}

describe('상수와 날짜 함수 (원본 대조)', () => {
  it('상수 표가 원본과 같다', async () => {
    const { legacy, core } = await runBoth((api) => ({
      LEVELS: api.LEVELS,
      LEVEL_KEYS: api.LEVEL_KEYS,
      DEFAULT_LIMITS: api.DEFAULT_LIMITS,
      PALETTE: api.PALETTE,
      HOLIDAYS: api.HOLIDAYS,
      DEFAULT_PLAN: api.DEFAULT_PLAN,
      MAX_COUNT: api.MAX_COUNT,
    }));
    expect(core).toStrictEqual(legacy);
    expect(Object.keys(legacy.HOLIDAYS).length).toBeGreaterThan(30);
  });

  it('날짜 함수 전체가 같은 결과를 낸다', async () => {
    const inputs = ['2026-01-01', '2024-02-29', '2026-02-29', '2026-13-01', '2026-1-01', 'abc', '', '2026-01-01T00', '1999-12-31', '2027-12-31'];
    const scenario = (api: Core) => ({
      isISO: [...inputs, 20260101, null, undefined].map((s) => api.isISO(s)),
      parse: inputs.map((s) => api.parseISO(s).getTime()),
      toISO: inputs.map((s) => api.toISO(api.parseISO(s))),
      addDays: [
        api.addDays('2026-02-27', 3), api.addDays('2026-12-31', 1), api.addDays('2026-03-01', -1),
        api.addDays('2024-02-28', 1), api.addDays('2026-01-01', -400),
      ],
      diffDays: [api.diffDays('2026-01-01', '2026-03-01'), api.diffDays('2026-03-01', '2026-01-01'), api.diffDays('2026-05-05', '2026-05-05')],
      weekday: ['2026-06-07', '2026-06-08', '2026-06-13', '2026-01-01'].map((s) => api.weekday(s)),
      rangeDays: [
        api.rangeDays('2026-04-01', '2026-04-05'),
        api.rangeDays('2026-04-05', '2026-04-01'),
        api.rangeDays('bad', '2026-04-05'),
        api.rangeDays('2026-02-27', '2026-03-02'),
        api.rangeDays('2026-01-01', '2027-12-31'),
      ],
      rangeLen: api.rangeDays('2026-01-01', '2027-12-31').length,
      todayISO: api.todayISO(),
      normName: ['  a   b\tc ', '', null, undefined, 42].map((s) => api.normName(s)),
      nameKey: ['  Hello   World ', 'ÉCOLE'].map((s) => api.nameKey(s)),
    });
    const { legacy, core } = await runBoth(scenario);
    expect(core).toStrictEqual(legacy);
    expect(legacy.rangeLen).toBe(401);
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${FROZEN_NOW.getFullYear()}-${pad(FROZEN_NOW.getMonth() + 1)}-${pad(FROZEN_NOW.getDate())}`;
    expect(legacy.todayISO).toBe(local);
  });

  it('uid 와 비결정 요소는 같은 순서로 같은 값을 낸다', async () => {
    const { legacy, core } = await runBoth((api) => [api.uid(), api.uid(), api.newState().updatedAt, api.exportPayload(api.newState()).exportedAt]);
    expect(core).toStrictEqual(legacy);
  });
});

describe('상태와 시험 (원본 대조)', () => {
  it('newState 와 newExam 의 정상·오류 입력', async () => {
    const inputs = [
      { name: '  중간  ', start: '2026-04-20', end: '2026-04-24', prepStart: '2026-04-01' },
      { name: '기본 준비일', start: '2026-04-20', end: '2026-04-24' },
      { name: '', start: '2026-04-20', end: '2026-04-24' },
      { name: 'x', start: '2026-04-20', end: '2026-04-19' },
      { name: 'x', start: '2026-02-30', end: '2026-03-01' },
      { name: 'x', start: '2026-04-20', end: '2026-04-24', prepStart: '2026-04-25' },
      { name: 'x', start: '2026-01-01', end: '2026-06-30', prepStart: '2026-01-01' },
      { name: 'x', start: '2026-03-01', end: '2026-03-01', prepStart: 'nope' },
      { name: 'x', start: '2026-05-01', end: '2026-05-10' },
    ];
    const scenario = (api: Core) => ({
      state: api.newState(),
      validate: inputs.map((f) => api.validateExamFields(f)),
      exams: inputs.map((f) => api.newExam(f)),
    });
    const { legacy, core } = await runBoth(scenario);
    expect(core).toStrictEqual(legacy);
    expect(legacy.validate.filter((v) => v === null).length).toBe(3);
  });

  it('과목 보관함: ensureSubject 팔레트 순환, renameSubject, findSubject, subjectOf', async () => {
    const scenario = (api: Core) => {
      const st = api.newState();
      const names = ['국어', '수학', '영어', '과학', '역사', '물리', '화학', '생명', '지리', '윤리', '  국어 ', '', 'a'.repeat(50)];
      const ensured = names.map((n) => api.ensureSubject(st, n));
      const rename = [
        api.renameSubject(st, st.library[0].id, '  국   어2 '),
        api.renameSubject(st, st.library[0].id, '수학'),
        api.renameSubject(st, st.library[1].id, ''),
        api.renameSubject(st, 'missing', '새 과목'),
      ];
      return {
        ensured,
        rename,
        library: st.library,
        find: [api.findSubject(st, '수학'), api.findSubject(st, '  영어 '), api.findSubject(st, '없음')],
        subjectOf: [api.subjectOf(st, { id: 'x', subjectId: 'missing' } as SubPlacement), api.subjectOf(st, { id: 'y', subjectId: st.library[2].id } as SubPlacement)],
      };
    };
    const { legacy, core } = await runBoth(scenario);
    expect(core).toStrictEqual(legacy);
    expect(legacy.library.length).toBe(11);
  });

  it('addSubs, addSub, removeSub, setSubDate 와 링크 정규화', async () => {
    const scenario = (api: Core) => {
      const st = buildRich(api);
      const e1 = st.exams[0];
      const e2 = st.exams[1];
      const results = [
        api.addSubs(st, e1, '  화학 , 화학\n지구과학 / 생명 、 ', '2026-04-21'),
        api.addSubs(st, e1, ' , ', null),
        api.addSubs(st, e1, '화학', null),
        api.addSubs(st, e2, '윤리', '2026-07-01'),
        api.addSub(st, e2, '윤리', null),
        api.addSub(st, e2, '', null),
        api.addSub(st, e2, '지리', '2026-06-23'),
      ];
      const setDates = [
        api.setSubDate(e1, e1.subs[0], '2026-04-23'),
        api.setSubDate(e1, e1.subs[0], '2099-01-01'),
        api.setSubDate(e1, e1.subs[0], null),
        api.setSubDate(e2, e2.subs[0], '2026-06-24'),
      ];
      const sub0 = e2.subs[0];
      const removed = api.removeSub(e2, sub0.id);
      const links = ['example.com/a?b=1', 'https://x.y/z', 'javascript:alert(1)', '  ', 'ftp://a.b', 'http://[bad', null].map((u) => api.normalizeLink(u));
      return { results, setDates, removed, links, state: st };
    };
    const { legacy, core } = await runBoth(scenario);
    expect(core).toStrictEqual(legacy);
    expect(legacy.results[0]).toMatchObject({ added: 2, dup: 2 });
  });

  it('sanitize 와 링크 정규화를 거친 subs 의 링크 목록', async () => {
    const scenario = (api: Core) => {
      const st = buildRich(api);
      const raw = JSON.parse(JSON.stringify(st));
      raw.exams[0].subs[0].links = [
        { label: 'ok', url: 'example.com/path' },
        { label: '나쁨', url: 'javascript:alert(1)' },
        { label: 'x'.repeat(80), url: 'https://ex.com' },
        null,
        { url: '' },
      ];
      const out = api.sanitizeState(raw);
      return out;
    };
    const { legacy, core } = await runBoth(scenario);
    expect(core).toStrictEqual(legacy);
    expect(legacy?.exams[0].subs[0].links.length).toBe(2);
  });
});

describe('시험 과목 분량과 할일 (원본 대조)', () => {
  it('setPlan, syncTasks, previewPlanChange, taskLabel, taskKind, cleanPlan, cleanWeek, planTotals', async () => {
    const scenario = (api: Core) => {
      const st = buildRich(api);
      const e1 = st.exams[0];
      const es = e1.subs[0];
      const preview = [
        api.previewPlanChange(e1, es, { n: 1, m: 0, r: 0 }),
        api.previewPlanChange(e1, es, { n: 0, m: 0, r: 0 }),
        api.previewPlanChange(e1, es, { n: 9, m: 9, r: 9 }),
      ];
      api.setPlan(e1, es, { n: 1, m: 0, r: 0 });
      const afterDown = e1.tasks.filter((t) => t.esId === es.id).length;
      api.setPlan(e1, es, { n: 4, m: 3, r: 5 });
      api.setPlan(e1, es, { n: 99, m: -4, r: 2.6 });
      const labels = e1.tasks.map((t) => [api.taskLabel(st, e1, t), api.taskKind(e1, t)]);
      const cleaned = [
        api.cleanPlan(null), api.cleanPlan('x'), api.cleanPlan({ n: '7', m: undefined, r: 'abc' }), api.cleanPlan({ n: 31 }),
      ];
      const weeks = [api.cleanWeek({ 0: 'calm', 1: 'nope', 2: 'packed', 9: 'busy' }), api.cleanWeek(null), api.cleanWeek([ 'busy' ])];
      return {
        preview,
        afterDown,
        tasks: e1.tasks,
        labels,
        cleaned,
        weeks,
        totals: api.planTotals(es.plan),
        defPlanCopy: api.cleanPlan(st.defPlan),
      };
    };
    const { legacy, core } = await runBoth(scenario);
    expect(core).toStrictEqual(legacy);
    expect(legacy.preview[2]).toBe(0);
  });

  it('moveTask, normalizeOrder, toggleDone, overdue, carryOver, recapBatch', async () => {
    const scenario = (api: Core) => {
      const st = buildRich(api);
      const e1 = st.exams[0];
      const e2 = st.exams[1];
      const recaps1 = e1.tasks.filter((t) => t.type === 'r');
      const moves = [
        api.moveTask(e1, recaps1[0].id, '2026-04-10'),
        api.moveTask(e1, recaps1[1].id, '2026-04-03'),
        api.moveTask(e1, recaps1[2].id, null),
        api.moveTask(e1, 'missing', '2026-04-03'),
        api.moveTask(e1, recaps1[0].id, '2026-05-30'),
      ];
      api.normalizeOrder(e1);
      const toggled = [api.toggleDone(e1, 'missing'), api.toggleDone(e1, recaps1[0].id)];
      const overdueA = api.overdue(e1, '2026-04-06').map((t) => t.id);
      const overdueB = api.overdue(e2, '2026-06-24').map((t) => t.id);
      const carry = api.carryOver(e1, '2026-04-07');
      const carryLate = api.carryOver(e2, '2026-07-01');
      const carryEarly = api.carryOver(e2, '2026-01-01');
      const recap = api.recapBatch(st, e2, 7, '2026-06-15');
      const recapNoToday = api.recapBatch(st, e1, 3, null);
      const recapEmpty = api.recapBatch(st, e1, 0, '2026-04-01');
      return {
        moves,
        toggled,
        overdueA,
        overdueB,
        carry,
        carryLate,
        carryEarly,
        recap,
        recapNoToday,
        recapEmpty,
        tasks: [...e1.tasks, ...e2.tasks],
      };
    };
    const { legacy, core } = await runBoth(scenario);
    expect(core).toStrictEqual(legacy);
    expect(legacy.recap.placed).toBeGreaterThan(0);
  });

  it('날짜 설정, 배치 요약, 진행률', async () => {
    const scenario = (api: Core) => {
      const st = buildRich(api);
      const e1 = st.exams[0];
      const e2 = st.exams[1];
      const notes = [
        api.setDayNote(e1, '2026-04-09', 'x'.repeat(100)),
        api.setDayNote(e1, '2026-04-10', '   '),
        api.setDayNote(e1, '2026-04-11', 12345),
      ];
      const levels = [
        api.setDayLevel(e1, ['2026-04-12'], 'easy'),
        api.setDayLevel(e1, ['2026-04-13'], 'bogus'),
        api.setDayLevel(e1, ['2026-04-06'], null),
        api.setDayLevel(e1, ['2026-04-07', '2026-04-08'], 'calm'),
      ];
      const holidays = [
        api.setHoliday(e1, '2026-04-12', true),
        api.setHoliday(e1, '2026-04-12', null),
        api.setHoliday(e1, '2026-05-05', false),
        api.setHoliday(e1, '2026-05-05', true),
        api.setHoliday(e2, '2026-06-06', null),
      ];
      const dayKeysE1 = Object.keys(e1.days).sort();
      const e1Days = JSON.parse(JSON.stringify(e1.days));
      const map = api.tasksByDate(e1);
      const unplaced = api.unplaced(e1).map((t: Task) => t.id);
      const progress = [api.progress(e1), api.progress(e2)];
      const subProgress = e1.subs.map((s) => api.subProgress(e1, s));
      return {
        notes,
        levels,
        holidays,
        dayKeysE1,
        e1Days,
        mapKeys: Object.keys(map).sort(),
        mapCounts: Object.keys(map).sort().map((k) => map[k].length),
        unplaced,
        progress,
        subProgress,
        report1: dayReport(api, st, e1),
        report2: dayReport(api, st, e2),
      };
    };
    const { legacy, core } = await runBoth(scenario);
    expect(core).toStrictEqual(legacy);
    expect(legacy.dayKeysE1.length).toBeGreaterThan(3);
  });

  it('updateExamFields: 날짜를 줄이면 범위 밖 할일과 날짜 설정이 정리된다', async () => {
    const scenario = (api: Core) => {
      const st = buildRich(api);
      const e1 = st.exams[0];
      const bad = api.updateExamFields(e1, { name: 'x', start: '2026-04-20', end: '2026-04-20', prepStart: '2026-04-03' });
      const worse = api.updateExamFields(e1, { name: '', start: '2026-04-20', end: '2026-04-20' });
      const good = api.updateExamFields(e1, { name: ' 바뀐  이름 ', start: '2026-04-21', end: '2026-04-23', prepStart: '2026-04-05' });
      return {
        bad,
        worse,
        good,
        exam: e1,
        e1Days: JSON.parse(JSON.stringify(e1.days)),
        subs: e1.subs,
      };
    };
    const { legacy, core } = await runBoth(scenario);
    expect(core).toStrictEqual(legacy);
    expect(legacy.good).toHaveProperty('unplaced');
    expect(legacy.worse).toHaveProperty('error');
    expect(legacy.bad).toHaveProperty('unplaced');
  });

  it('exportPayload 과 importMerge (정상, 형식 오류, 중복, 과목 병합)', async () => {
    const scenario = (api: Core) => {
      const src = buildRich(api);
      const payload = api.exportPayload(src);
      const target = api.newState();
      api.ensureSubject(target, '국어');
      api.ensureSubject(target, '영어');
      const merged = api.importMerge(target, JSON.parse(JSON.stringify(payload)) as never);
      const again = api.importMerge(target, JSON.parse(JSON.stringify(payload)) as never);
      const bad = [
        api.importMerge(target, null as never),
        api.importMerge(target, { app: 'other', state: src } as never),
        api.importMerge(target, { app: 'exam-planner', state: 'nope' } as never),
      ];
      return { payload, merged, again, bad, target };
    };
    const { legacy, core } = await runBoth(scenario);
    expect(core).toStrictEqual(legacy);
    expect(legacy.merged).toStrictEqual({ added: 2, dup: 0, skipped: 0 });
    expect(legacy.again).toStrictEqual({ added: 0, dup: 2, skipped: 0 });
  });
});

describe('정리와 검증 sanitizeState (원본 대조)', () => {
  const v1Raw = {
    v: 1,
    limits: { relaxed: 6, easy: 4, medium: 3, tight: 2, busy: 1, packed: 9 },
    recapDays: 5,
    week: { 0: 'relaxed', 6: 'busy', 3: 'tight' },
    defPlan: { n: 2, m: 3, r: 1 },
    library: [{ id: 'sub1', name: '국어', color: '#C4705A' }, { id: 'sub2', name: '수학', color: 'bad' }],
    exams: [{
      id: 'ex1', name: '중간', start: '2026-04-20', end: '2026-04-24', prepStart: '2026-04-01',
      subs: [
        { id: 'es1', subjectId: 'sub1', examDate: '2026-04-22', plan: { n: 1, m: 1, r: 1 } },
        { id: 'es2', subjectId: 'sub2', examDate: '2026-04-30', plan: { n: 2, m: 0, r: 0 } },
      ],
      tasks: [
        { id: 't1', esId: 'es1', type: 's', seq: 1, date: '2026-04-05', done: true },
        { id: 't2', esId: 'es1', type: 'r', seq: 1, date: '2026-03-01', done: false },
        { id: 't3', esId: 'es2', type: 'x', seq: 1, date: null, done: false },
      ],
      days: {
        '2026-04-06': { level: 'tight', note: '  메모 ' },
        '2026-04-07': { level: 'relaxed', holiday: true },
        '2026-04-08': { level: 'busy' },
        '2026-04-09': { level: 'packed' },
        '2026-05-01': { note: '범위 밖' },
      },
      week: { 1: 'tight' },
    }],
    activeId: 'ex1',
  };

  it('정상 v3 데이터는 그대로 보존된다', async () => {
    const scenario = (api: Core) => {
      const st = buildRich(api);
      return api.sanitizeState(JSON.parse(JSON.stringify(st)));
    };
    const { legacy, core } = await runBoth(scenario);
    expect(core).toStrictEqual(legacy);
    expect(legacy?.exams.length).toBe(2);
  });

  it('v1 레거시 데이터는 단계 이름을 5단계로 옮긴다', async () => {
    const { legacy, core } = await runBoth((api) => api.sanitizeState(JSON.parse(JSON.stringify(v1Raw))));
    expect(core).toStrictEqual(legacy);
    expect(legacy?.limits).toStrictEqual({ calm: 6, easy: 4, normal: 3, busy: 2, packed: 1 });
  });

  it('v2 의 한가한 날 한도 5 는 8 로 올리고, 다른 값은 그대로 둔다', async () => {
    const v2a = { v: 2, limits: { calm: 5, easy: 4, normal: 3, busy: 2, packed: 1 }, library: [], exams: [] };
    const v2b = { v: 2, limits: { calm: 6, easy: 4 }, library: [], exams: [] };
    const { legacy, core } = await runBoth((api) => [api.sanitizeState(v2a), api.sanitizeState(v2b)]);
    expect(core).toStrictEqual(legacy);
    expect(legacy[0]?.limits.calm).toBe(8);
    expect(legacy[1]?.limits.calm).toBe(6);
  });

  it('손상된 입력은 원본과 같이 정리하거나 null 을 낸다', async () => {
    const corrupt: unknown[] = [
      null, undefined, 'text', 42, [], {}, { exams: {}, library: [] }, { exams: [] }, { library: [] },
      { v: 3, exams: [], library: [], limits: 'bad', recapDays: 'x', updatedAt: '17', week: [1, 2] },
      {
        v: 3, limits: { calm: 99, easy: -5, normal: NaN, busy: '3', packed: 2.4 }, recapDays: 500, defPlan: 'x',
        library: [
          { id: 'a', name: '  국어  ', color: '#abcdef' },
          { id: 'a', name: '중복 id', color: '#000000' },
          { id: 'b', name: '국어', color: '#111111' },
          { id: 'c', name: 'z'.repeat(60), color: 'red' },
          null,
          { id: 5, name: 'number id' },
        ],
        exams: [
          { id: 'e1', name: 'ok', start: '2026-04-01', end: '2026-04-10', prepStart: '2026-03-20',
            subs: [
              { id: 's1', subjectId: 'a', examDate: '2026-04-05', range: 'r'.repeat(3000), plan: { n: 40, m: -1, r: 'x' } },
              { id: 's1', subjectId: 'a', plan: {} },
              { id: 's2', subjectId: 'a', plan: {} },
              { id: 's3', subjectId: 'zzz', plan: {} },
              { id: 's4', subjectId: 'c', examDate: '2099-01-01', plan: { n: 1, m: 1, r: 1 } },
            ],
            tasks: [
              { id: 't1', esId: 's1', type: 's', seq: 999, date: '2026-03-25', done: 1 },
              { id: 't1', esId: 's1', type: 's', seq: 1, date: null },
              { id: 't2', esId: 'nope', type: 's', seq: 1, date: null },
              { id: 't3', esId: 's4', type: 'r', seq: 1, date: '2026-04-02', done: true },
            ],
            days: {
              '2026-04-02': { level: 'busy', note: '  <b>x</b>  ', holiday: false },
              '2026-04-03': { level: 'nope' },
              '2026-04-04': 'str',
              '2026-06-01': { level: 'busy' },
              '2026-04-05': {},
            },
            week: { 1: 'busy', 9: 'calm' },
          },
          { id: 'e1', name: '중복', start: '2026-04-01', end: '2026-04-02', prepStart: '2026-04-01' },
          { id: 'e2', name: 'bad', start: '2026-04-10', end: '2026-04-01', prepStart: '2026-04-01' },
          { id: 'e3', name: 'long', start: '2026-01-01', end: '2026-12-31', prepStart: '2026-01-01' },
          { id: 'e4', name: '', start: '2026-04-01', end: '2026-04-02', prepStart: '2026-04-01' },
          null,
        ],
        activeId: 'missing',
      },
      { v: 3, library: [], exams: [{ id: 'q', name: 'n', start: '2026-02-30', end: '2026-03-01', prepStart: '2026-02-01' }], activeId: 'q' },
      { v: 1, library: [{ id: 'x', name: 'y' }], exams: [{ id: 'z', name: 'w', start: '2026-05-01', end: '2026-05-02', prepStart: '2026-05-01', subs: [{ id: 'k', subjectId: 'x', plan: {} }], days: { '2026-05-01': { level: 'relaxed' } } }], activeId: 'z' },
    ];
    const { legacy, core } = await runBoth((api) => corrupt.map((c) => api.sanitizeState(c)));
    expect(core).toStrictEqual(legacy);
    expect(legacy.slice(0, 3)).toStrictEqual([null, null, null]);
    expect(legacy[5]).toBeNull();
  });
});

describe('무작위 연산 순서 (원본 대조)', () => {
  /* 같은 시드로 같은 연산 순서를 두 구현에 적용하고, 매 단계의 결과와 최종 상태를 비교한다. */
  function fuzz(api: Core, seed: number, steps: number): unknown[] {
    const rnd = mulberry32(seed);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
    const st = buildRich(api);
    const names = ['국어', '수학', '영어', '과학', '역사', '물리', '화학', '생명', '지리'];
    const levels = ['calm', 'easy', 'normal', 'busy', 'packed', 'bogus'];
    const log: unknown[] = [];
    for (let i = 0; i < steps; i += 1) {
      const e = pick(st.exams);
      const days = api.prepDays(e);
      const day = () => pick(days);
      const op = Math.floor(rnd() * 14);
      switch (op) {
        case 0:
          log.push(api.addSubs(st, e, pick(names) + ', ' + pick(names), rnd() < 0.5 ? day() : null));
          break;
        case 1:
          if (e.subs.length) log.push(api.removeSub(e, pick(e.subs).id));
          break;
        case 2:
          if (e.subs.length) {
            const s = pick(e.subs);
            api.setPlan(e, s, { n: Math.floor(rnd() * 6), m: Math.floor(rnd() * 6), r: Math.floor(rnd() * 4) });
            log.push(s.plan);
          }
          break;
        case 3:
          if (e.tasks.length) log.push(api.moveTask(e, pick(e.tasks).id, rnd() < 0.15 ? null : day()));
          break;
        case 4:
          if (e.tasks.length) log.push(api.toggleDone(e, pick(e.tasks).id));
          break;
        case 5:
          api.setDayLevel(e, [day(), day()], pick(levels));
          break;
        case 6:
          api.setDayNote(e, day(), rnd() < 0.2 ? '' : 'memo ' + Math.floor(rnd() * 100));
          break;
        case 7:
          api.setHoliday(e, day(), rnd() < 0.3 ? null : rnd() < 0.5);
          break;
        case 8:
          log.push(api.recapBatch(st, e, Math.floor(rnd() * 10), rnd() < 0.5 ? day() : null));
          break;
        case 9:
          log.push(api.carryOver(e, day()));
          break;
        case 10:
          api.normalizeOrder(e);
          break;
        case 11:
          if (e.subs.length) log.push(api.setSubDate(e, pick(e.subs), rnd() < 0.2 ? null : day()));
          break;
        case 12:
          log.push(api.renameSubject(st, pick(st.library).id, pick(names)));
          break;
        default:
          log.push(api.updateExamFields(e, {
            name: e.name,
            start: e.start,
            end: rnd() < 0.5 ? e.end : day(),
            prepStart: rnd() < 0.5 ? e.prepStart : day(),
          }));
          break;
      }
      log.push(api.overdue(e, day()).map((t) => t.id));
    }
    log.push(st);
    return log;
  }

  it('시드 3개, 연산 400개 순서가 같은 결과를 낸다', async () => {
    for (const seed of [1, 7, 99]) {
      const { legacy, core } = await runBoth((api) => fuzz(api, seed, 400));
      expect(core).toStrictEqual(legacy);
    }
  });
});

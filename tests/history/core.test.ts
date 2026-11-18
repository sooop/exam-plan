import { describe, expect, it } from 'vitest';
import { newState } from '../../src/lib/core/planner';
import { sanitizeState } from '../../src/lib/core/sanitize';
import {
  AUTO_KEEP_COUNT, AUTO_KEEP_DAYS, AUTO_MERGE_MS, DAY_MS, LOG_MAX, LOG_MERGE_MS, SYNC_COALESCE_MS,
  appendLog, countsOfExam, countsOfState, decideAdd, examAsRestored, formatBytes, formatWhen, hashText, makeId,
  planRetention, serializeState, summaryLine, type LogEntry, type SnapshotKind, type SnapshotMeta,
} from '../../src/lib/history/core';
import { richState } from '../sync/helpers';

const NOW = new Date(2026, 10, 18, 14, 20).getTime();
const meta = (id: string, at: number, kind: SnapshotKind = 'auto', extra: Partial<SnapshotMeta> = {}): SnapshotMeta => ({
  id, at, kind, label: id, device: 'd', pinned: false, hash: id, counts: { exams: 0, tasks: 0, subs: 0, library: 0 }, bytes: 1, ...extra,
});

describe('해시·직렬화', () => {
  it('같은 문자열은 같은 해시, 다르면 다르다', () => {
    expect(hashText('abc')).toBe(hashText('abc'));
    expect(hashText('abc')).not.toBe(hashText('abd'));
    expect(hashText('')).toMatch(/^[0-9a-z]+$/);
  });

  it('상태 해시는 updatedAt 과 activeId 를 무시하고 내용 변화는 잡는다', () => {
    const s = richState();
    const base = serializeState(s);
    expect(serializeState({ ...s, updatedAt: s.updatedAt + 5, activeId: s.exams[0].id }).hash).toBe(base.hash);
    const changed = JSON.parse(JSON.stringify(s));
    changed.exams[0].name = '다른 이름';
    expect(serializeState(changed).hash).not.toBe(base.hash);
  });

  it('개수 집계', () => {
    const s = richState();
    const c = countsOfState(s);
    expect(c.exams).toBe(2);
    expect(c.tasks).toBe(s.exams[0].tasks.length + s.exams[1].tasks.length);
    expect(c.subs).toBe(5);
    expect(c.library).toBe(s.library.length);
    expect(countsOfExam({ tasks: [1, 2], subs: [1] })).toEqual({ exams: 1, tasks: 2, subs: 1, library: 0 });
    expect(countsOfExam('엉뚱한 값')).toEqual({ exams: 1, tasks: 0, subs: 0, library: 0 });
    expect(countsOfExam(null).tasks).toBe(0);
  });

  it('id 는 시각순으로 정렬된다', () => {
    expect(makeId('s-', 5, 1, 'ab') < makeId('s-', 10, 0, 'ab')).toBe(true);
    expect(makeId('s-', 5, 1, 'ab')).not.toBe(makeId('s-', 5, 2, 'ab'));
  });
});

describe('decideAdd', () => {
  it('새 내용은 add', () => {
    expect(decideAdd([meta('a', 1000)], { kind: 'before-big', hash: 'z', at: 2000, label: 'x' })).toEqual({ action: 'add' });
  });

  it('같은 내용(해시)은 한 건으로 합친다. 수동 요청이면 수동으로 올린다', () => {
    const list = [meta('a', 1000, 'auto', { hash: 'h' })];
    expect(decideAdd(list, { kind: 'auto', hash: 'h', at: 9e6, label: 'x' })).toEqual({ action: 'touch', id: 'a', promote: false });
    expect(decideAdd(list, { kind: 'manual', hash: 'h', at: 9e6, label: 'x' })).toEqual({ action: 'touch', id: 'a', promote: true });
    const man = [meta('m', 1000, 'manual', { hash: 'h' })];
    expect(decideAdd(man, { kind: 'manual', hash: 'h', at: 9e6, label: 'x' })).toEqual({ action: 'touch', id: 'm', promote: false });
  });

  it('동기화 충돌 항목과 상태 스냅샷은 같은 해시여도 서로 합치지 않는다', () => {
    const list = [meta('l', 1000, 'sync-loser', { hash: 'h' })];
    expect(decideAdd(list, { kind: 'auto', hash: 'h', at: 5000, label: 'x' }).action).toBe('add');
    expect(decideAdd(list, { kind: 'sync-loser', hash: 'h', at: 5000, label: 'x' }).action).toBe('touch');
  });

  it('짧은 시간 안의 연속 자동은 직전 것을 갈아 끼운다(고정·수동·시간 초과는 제외)', () => {
    const a = meta('a', 1_000_000, 'auto');
    expect(decideAdd([a], { kind: 'auto', hash: 'n', at: 1_000_000 + AUTO_MERGE_MS - 1, label: 'x' })).toEqual({ action: 'replace', id: 'a' });
    expect(decideAdd([a], { kind: 'auto', hash: 'n', at: 1_000_000 + AUTO_MERGE_MS, label: 'x' }).action).toBe('add');
    expect(decideAdd([{ ...a, pinned: true }], { kind: 'auto', hash: 'n', at: 1_000_100, label: 'x' }).action).toBe('add');
    expect(decideAdd([meta('m', 1_000_000, 'manual')], { kind: 'auto', hash: 'n', at: 1_000_100, label: 'x' }).action).toBe('add');
    expect(decideAdd([meta('b', 1_000_000, 'before-big')], { kind: 'auto', hash: 'n', at: 1_000_100, label: 'x' }).action).toBe('add');
  });

  it('큰 변경 전은 연속이어도 갈아 끼우지 않는다(더 옛 상태를 잃지 않게)', () => {
    expect(decideAdd([meta('b', 1000, 'before-big')], { kind: 'before-big', hash: 'n', at: 1500, label: 'x' }).action).toBe('add');
  });

  it('동기화 전은 짧은 간격이면 건너뛴다', () => {
    const s = meta('s', 1_000_000, 'before-sync');
    expect(decideAdd([s], { kind: 'before-sync', hash: 'n', at: 1_000_000 + SYNC_COALESCE_MS - 1, label: 'x' })).toEqual({ action: 'skip', reason: 'coalesced' });
    expect(decideAdd([s], { kind: 'before-sync', hash: 'n', at: 1_000_000 + SYNC_COALESCE_MS, label: 'x' }).action).toBe('add');
  });
});

describe('planRetention', () => {
  it('최근 30개를 넘는 자동류만 정리한다', () => {
    const list = Array.from({ length: 35 }, (_, i) => meta(`a${i}`, NOW - i * 1000, i % 2 ? 'before-big' : 'auto'));
    const del = planRetention(list, NOW);
    expect(del).toHaveLength(35 - AUTO_KEEP_COUNT);
    expect(del.sort()).toEqual(['a30', 'a31', 'a32', 'a33', 'a34']);
  });

  it('90일을 넘은 것은 개수와 무관하게 정리한다', () => {
    const list = [meta('new', NOW), meta('old', NOW - (AUTO_KEEP_DAYS * DAY_MS + 1)), meta('edge', NOW - AUTO_KEEP_DAYS * DAY_MS)];
    expect(planRetention(list, NOW)).toEqual(['old']);
  });

  it('핀·수동·동기화 충돌은 아무리 많고 오래돼도 정리하지 않는다', () => {
    const ancient = NOW - 400 * DAY_MS;
    const list = [
      ...Array.from({ length: 40 }, (_, i) => meta(`m${i}`, ancient - i, 'manual')),
      ...Array.from({ length: 40 }, (_, i) => meta(`l${i}`, ancient - i, 'sync-loser')),
      ...Array.from({ length: 40 }, (_, i) => meta(`p${i}`, ancient - i, 'auto', { pinned: true })),
    ];
    expect(planRetention(list, NOW)).toEqual([]);
  });

  it('핀은 개수 한도에 세지 않는다', () => {
    const list = [
      ...Array.from({ length: 30 }, (_, i) => meta(`a${i}`, NOW - i)),
      ...Array.from({ length: 10 }, (_, i) => meta(`p${i}`, NOW - 100 - i, 'auto', { pinned: true })),
    ];
    expect(planRetention(list, NOW)).toEqual([]);
  });

  it('한도를 바꿔 줄 수 있다', () => {
    const list = [meta('a', NOW), meta('b', NOW - 1), meta('c', NOW - 2)];
    expect(planRetention(list, NOW, { keepCount: 1 }).sort()).toEqual(['b', 'c']);
  });
});

describe('appendLog', () => {
  let n = 0;
  const id = () => `id${n++}`;
  const run = (log: LogEntry[], at: number, label: string, kind: 'local' | 'sync-received' | 'restore' = 'local', device = 'A') =>
    appendLog(log, { at, device, label, kind }, id);

  it('같은 label 의 짧은 간격은 한 건으로 합친다', () => {
    let r = run([], 1000, '메모');
    r = run(r.log, 1000 + LOG_MERGE_MS, '메모');
    expect(r.log).toHaveLength(1);
    expect(r.log[0]).toMatchObject({ count: 2, at: 1000 + LOG_MERGE_MS });
    expect(r.written.id).toBe(r.log[0].id);
  });

  it('간격이 길거나 label·종류·기기가 다르면 새 항목', () => {
    let r = run([], 1000, '메모');
    r = run(r.log, 1000 + LOG_MERGE_MS + 1, '메모');
    r = run(r.log, 1000 + LOG_MERGE_MS + 2, '다른');
    r = run(r.log, 1000 + LOG_MERGE_MS + 3, '다른', 'sync-received');
    r = run(r.log, 1000 + LOG_MERGE_MS + 4, '다른', 'sync-received', 'B');
    expect(r.log).toHaveLength(5);
  });

  it('입력 배열을 바꾸지 않는다', () => {
    const a = run([], 1, 'x').log;
    const copy = JSON.stringify(a);
    run(a, 2, 'x');
    expect(JSON.stringify(a)).toBe(copy);
  });

  it(`최근 ${LOG_MAX}건만 남기고 밀려난 id 를 알려 준다`, () => {
    let log: LogEntry[] = [];
    const removed: string[] = [];
    for (let i = 0; i < LOG_MAX + 7; i++) {
      const r = run(log, i * 100_000, `작업 ${i}`);
      log = r.log;
      removed.push(...r.removedIds);
    }
    expect(log).toHaveLength(LOG_MAX);
    expect(removed).toHaveLength(7);
    expect(log[0].label).toBe('작업 7');
    expect(log[log.length - 1].label).toBe(`작업 ${LOG_MAX + 6}`);
  });
});

describe('표시', () => {
  it('오늘·어제·올해·이전 해', () => {
    expect(formatWhen(NOW - 60_000, NOW)).toBe('오늘 14:19');
    expect(formatWhen(new Date(2026, 10, 17, 9, 5).getTime(), NOW)).toBe('어제 09:05');
    expect(formatWhen(new Date(2026, 2, 5, 9, 5).getTime(), NOW)).toBe('3월 5일 09:05');
    expect(formatWhen(new Date(2025, 2, 5, 9, 5).getTime(), NOW)).toBe('2025년 3월 5일 09:05');
  });

  it('크기', () => {
    expect(formatBytes(0)).toBe('0B');
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(18 * 1024)).toBe('18KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5MB');
  });

  it('요약 줄', () => {
    const m = meta('a', NOW, 'auto', { counts: { exams: 2, tasks: 48, subs: 5, library: 3 }, bytes: 18 * 1024 });
    expect(summaryLine(m, NOW)).toBe('오늘 14:20 · 시험 2 · 할일 48 · 18KB');
    expect(summaryLine({ ...m, kind: 'sync-loser' }, NOW)).toBe('오늘 14:20 · 할일 48 · 18KB');
  });
});

describe('examAsRestored', () => {
  it('새 id·접미사·새 과목/할일 id 로 추가한 후보 상태가 sanitizeState 를 통과한다', () => {
    const cur = richState();
    const src = JSON.parse(JSON.stringify(cur.exams[0]));
    let k = 0;
    const r = examAsRestored(src, cur, () => `n${k++}`)!;
    const clean = sanitizeState(r.state)!;
    expect(clean.exams).toHaveLength(3);
    const added = clean.exams.find((e) => e.id === r.examId)!;
    expect(added.name).toBe('2026 중간고사 (복원)');
    expect(added.id).not.toBe(src.id);
    expect(added.subs.map((s) => s.id)).not.toContain(src.subs[0].id);
    expect(added.tasks.length).toBe(src.tasks.length);
    expect(added.tasks.every((t) => added.subs.some((s) => s.id === t.esId))).toBe(true);
  });

  it('이름이 길면 접미사까지 60자 안', () => {
    const cur = newState();
    const r = examAsRestored({ name: '가'.repeat(80), start: '2026-06-22', end: '2026-06-26', prepStart: '2026-06-01' }, cur, () => 'x1')!;
    const added = sanitizeState(r.state)!.exams[0];
    expect(Array.from(added.name)).toHaveLength(60);
    expect(added.name.endsWith(' (복원)')).toBe(true);
  });

  it('라이브러리에 없는 과목은 자리 표시 항목으로 살린다', () => {
    const cur = newState();
    const exam = {
      id: 'e', name: '시험', start: '2026-06-22', end: '2026-06-26', prepStart: '2026-06-01',
      subs: [{ id: 's1', subjectId: 'gone', examDate: null, range: '', comment: '', links: [], plan: { n: 1, m: 0, r: 0 } }], tasks: [], days: {}, week: {},
    };
    let k = 0;
    const r = examAsRestored(exam, cur, () => `u${k++}`)!;
    const clean = sanitizeState(r.state)!;
    expect(clean.exams[0].subs).toHaveLength(1);
    expect(clean.library.map((l) => l.id)).toContain('gone');
  });

  it('모양이 틀리면 null, 입력은 바뀌지 않는다', () => {
    const cur = richState();
    const before = JSON.stringify(cur);
    expect(examAsRestored(null, cur, () => 'x')).toBeNull();
    expect(examAsRestored([], cur, () => 'x')).toBeNull();
    expect(examAsRestored({ name: '  ' }, cur, () => 'x')).toBeNull();
    examAsRestored(cur.exams[0], cur, () => 'x');
    expect(JSON.stringify(cur)).toBe(before);
  });
});

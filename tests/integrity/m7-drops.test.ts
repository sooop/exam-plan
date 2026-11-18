// M-7(주장 4 잔여): 과목·할일·링크·라이브러리 단위 폐기가 알림·백업 없이 사라지던 결함의 회귀 시험.
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createValidator, droppedNotice } from '../../src/lib/app/appCore';
import { newState } from '../../src/lib/core';
import type { State } from '../../src/lib/core/types';
import { resetPrefsMemory } from '../../src/lib/storage/prefs';
import { mkExam } from '../sync/helpers';
import { Mem, mkTab, putRawIdb } from './harness';

function dirtyRaw(): { raw: State; subsBefore: number } {
  const st = newState();
  mkExam(st, 'E1', ['수학', '영어']);
  st.updatedAt = 5000;
  const raw = JSON.parse(JSON.stringify(st)) as State;
  raw.library.push({ id: 'dup-lib', name: ' 수학 ', color: '#C4705A' }); // 같은 이름의 두 번째 라이브러리 항목
  raw.exams[0].subs[1].subjectId = 'dup-lib'; // 뒤 id 를 참조하던 과목은 버려진다
  raw.exams[0].subs[0].links = Array.from({ length: 25 }, (_, i) => ({ label: 'L' + i, url: 'https://example.com/' + i }));
  return { raw, subsBefore: raw.exams[0].subs.length };
}

describe('M-7 하위 항목 폐기', () => {
  it('validator: 시험 단위가 아닌 폐기도 센다', () => {
    const v = createValidator();
    const { raw } = dirtyRaw();
    const s = v.validate(raw)!;
    expect(v.droppedOf(s)).toBeGreaterThan(0);
    const d = v.detailOf(s);
    expect(d.exams).toBe(0);
    expect(d.library).toBe(1);
    expect(d.subs).toBe(1);
    expect(d.links).toBe(5);
  });
  it('앱: dropped 가 0 이 아니고 원본이 partial 백업으로 남고 알림 문구가 종류를 말한다', async () => {
    resetPrefsMemory();
    const idb = new IDBFactory(); const storage = new Mem();
    const { raw, subsBefore } = dirtyRaw();
    await putRawIdb(idb, raw);
    const app = mkTab(idb, storage);
    await app.init();
    const ex = app.state.exams[0];
    expect(ex.subs.length).toBeLessThan(subsBefore);
    expect(app.dropped).toBeGreaterThan(0); // 수정 전에는 0
    expect(app.droppedBackupKey).not.toBeNull(); // 수정 전에는 백업 없음
    const keys = await app.store.listCorruptBackups();
    expect(keys).toContain(app.droppedBackupKey);
    const text = droppedNotice(app.dropped, true, app.droppedDetail);
    expect(text).toContain('과목 1개');
    expect(text).toContain('링크 5개');
    expect(text).toContain('원본을 백업');
    app.dispose();
  });
  it('시험 통째 폐기만 있을 때의 문구는 그대로다', () => {
    expect(droppedNotice(2, false)).toContain('읽을 수 없는 시험 2개');
    expect(droppedNotice(2, false, { exams: 2, subs: 0, tasks: 0, library: 0, links: 0 })).toContain('읽을 수 없는 시험 2개');
  });
});

import { describe, expect, it } from 'vitest';
import { newExam, newState } from '../../src/lib/core/planner';
import { exportPayload, importMerge } from '../../src/lib/core/sanitize';
import type { State } from '../../src/lib/core/types';
import {
  MAX_IMPORT_BYTES, clampNumber, countImport, failureReason, fileSizeFailure, importFailureText, inspectImportText, isFileDrag,
  parseAnimValue, pickImportFile, rawExamCount, runImport, animValue, skippedNoteText,
} from '../../src/lib/dialogs/logic';

/** 시험 한 건이 든 상태(정상 시험 1개) */
function oneExamState(): State {
  const s = newState();
  const r = newExam({ name: '기말고사', start: '2026-12-01', end: '2026-12-10' });
  if (!('exam' in r)) throw new Error('fixture');
  s.exams.push(r.exam);
  return s;
}

/** 정상 시험 1개 + 날짜가 거꾸로인 시험 1개가 든 저장 텍스트 */
function payloadWithBadExam(): string {
  const p = exportPayload(oneExamState()) as unknown as { state: { exams: Record<string, unknown>[] } };
  p.state.exams.push({
    id: 'bad-1', name: '잘못된 시험', start: '2026-12-10', end: '2026-12-01', prepStart: '2026-11-01',
    subs: [], tasks: [], days: {}, week: {},
  });
  return JSON.stringify(p);
}

describe('clampNumber', () => {
  it('범위 안의 값은 그대로 적용한다', () => {
    expect(clampNumber('5', 0, 20)).toEqual({ ok: true, value: 5, clamped: false });
    expect(clampNumber(0, 0, 20)).toEqual({ ok: true, value: 0, clamped: false });
    expect(clampNumber('20', 0, 20)).toEqual({ ok: true, value: 20, clamped: false });
  });
  it('범위 밖이면 잘라서 적용하고 잘렸다고 표시한다', () => {
    expect(clampNumber('25', 0, 20)).toEqual({ ok: true, value: 20, clamped: true });
    expect(clampNumber('-3', 0, 20)).toEqual({ ok: true, value: 0, clamped: true });
    expect(clampNumber('31', 1, 30)).toEqual({ ok: true, value: 30, clamped: true });
    expect(clampNumber('0', 1, 30)).toEqual({ ok: true, value: 1, clamped: true });
  });
  it('소수는 반올림하며 잘린 것으로 보지 않는다', () => {
    expect(clampNumber('2.4', 0, 20)).toEqual({ ok: true, value: 2, clamped: false });
    expect(clampNumber('2.5', 0, 20)).toEqual({ ok: true, value: 3, clamped: false });
  });
  it('빈 값이나 숫자가 아니면 ok 가 false 다(호출자가 이전 값을 유지한다)', () => {
    expect(clampNumber('', 0, 20)).toEqual({ ok: false });
    expect(clampNumber('   ', 0, 20)).toEqual({ ok: false });
    expect(clampNumber('abc', 0, 20)).toEqual({ ok: false });
    expect(clampNumber(Number.NaN, 0, 20)).toEqual({ ok: false });
  });
});

describe('fileSizeFailure', () => {
  it('상한 이하는 통과하고 넘으면 size 사유다', () => {
    expect(fileSizeFailure(0)).toBeNull();
    expect(fileSizeFailure(MAX_IMPORT_BYTES)).toBeNull();
    expect(fileSizeFailure(MAX_IMPORT_BYTES + 1)).toEqual({ kind: 'size' });
  });
});

describe('pickImportFile', () => {
  it('목록이 비었으면 파일이 없다', () => {
    expect(pickImportFile([])).toEqual({ file: null, ignored: 0 });
  });
  it('여러 개면 JSON 으로 보이는 것을 고르고 나머지는 버린 것으로 센다', () => {
    const files = [{ name: 'memo.pdf' }, { name: 'backup.json' }, { name: 'other.txt' }];
    expect(pickImportFile(files)).toEqual({ file: { name: 'backup.json' }, ignored: 2 });
  });
  it('JSON 으로 보이는 것이 없으면 첫 파일을 고른다', () => {
    const files = [{ name: 'a.png', type: 'image/png' }, { name: 'b.png', type: 'image/png' }];
    expect(pickImportFile(files)).toEqual({ file: { name: 'a.png', type: 'image/png' }, ignored: 1 });
  });
  it('한 개면 버린 파일이 없다. 확장자 없는 이름도 JSON 후보다', () => {
    expect(pickImportFile([{ name: 'export' }])).toEqual({ file: { name: 'export' }, ignored: 0 });
    expect(pickImportFile([{ name: 'x.png', type: 'image/png' }, { name: 'data', type: '' }])).toEqual({ file: { name: 'data', type: '' }, ignored: 1 });
  });
});

describe('isFileDrag', () => {
  it('Files 형식이 있을 때만 파일 끌기다', () => {
    expect(isFileDrag(['Files'])).toBe(true);
    expect(isFileDrag(['text/plain', 'Files'])).toBe(true);
    expect(isFileDrag(['text/plain'])).toBe(false);
    expect(isFileDrag([])).toBe(false);
    expect(isFileDrag(null)).toBe(false);
    expect(isFileDrag(undefined)).toBe(false);
  });
});

describe('parseAnimValue / animValue', () => {
  it('off 만 끈 것이고, 없거나 알 수 없는 값은 켜짐이다', () => {
    expect(parseAnimValue('off')).toBe(false);
    expect(parseAnimValue('on')).toBe(true);
    expect(parseAnimValue(null)).toBe(true);
    expect(parseAnimValue(undefined)).toBe(true);
    expect(parseAnimValue('garbage')).toBe(true);
    expect(animValue(true)).toBe('on');
    expect(animValue(false)).toBe('off');
  });
});

describe('inspectImportText 오류 분류', () => {
  const fail = (text: string) => {
    const r = inspectImportText(text);
    if (r.ok) throw new Error('expected failure');
    return r.failure;
  };
  it('빈 입력은 empty', () => {
    expect(fail('')).toEqual({ kind: 'empty' });
    expect(fail('   \n ')).toEqual({ kind: 'empty' });
  });
  it('JSON 문법이 아니면 json', () => {
    expect(fail('{bad')).toEqual({ kind: 'json' });
  });
  it('최상위가 객체가 아니면 notObject', () => {
    expect(fail('[1, 2]')).toEqual({ kind: 'notObject' });
    expect(fail('"text"')).toEqual({ kind: 'notObject' });
  });
  it('앱 식별자가 없거나 다르면 appMissing·appOther', () => {
    expect(fail('{"state":{"exams":[],"library":[]}}')).toEqual({ kind: 'appMissing' });
    expect(fail('{"app":"other-app","state":{"exams":[],"library":[]}}')).toEqual({ kind: 'appOther' });
  });
  it('파일 버전이 이 앱보다 새로우면 version', () => {
    expect(fail('{"app":"exam-planner","version":2,"state":{"exams":[],"library":[]}}')).toEqual({ kind: 'version', found: 2 });
  });
  it('시험·과목 배열이 없으면 format', () => {
    expect(fail('{"app":"exam-planner","version":1,"state":{"library":[]}}')).toEqual({ kind: 'format' });
    expect(fail('{"app":"exam-planner","version":1}')).toEqual({ kind: 'format' });
  });
  it('데이터 버전이 이 앱보다 새로우면 stateVersion', () => {
    expect(fail('{"app":"exam-planner","version":1,"state":{"v":4,"exams":[],"library":[]}}')).toEqual({ kind: 'stateVersion', found: 4 });
  });
  it('정상 파일은 ok 이고 payload 를 돌려준다', () => {
    const r = inspectImportText(JSON.stringify(exportPayload(oneExamState())));
    expect(r.ok).toBe(true);
    if (r.ok) expect(rawExamCount(r.payload)).toBe(1);
  });
});

describe('skippedNoteText: 시험 안에서 빠진 항목 안내', () => {
  it('빠진 것이 없으면 빈 문자열이다', () => {
    expect(skippedNoteText(undefined)).toBe('');
    expect(skippedNoteText({ exams: 0, subs: 0, tasks: 0, library: 0 })).toBe('');
  });
  it('빠진 항목만 종류별로 적는다', () => {
    expect(skippedNoteText({ exams: 0, subs: 2, tasks: 0, library: 1 })).toBe('형식이 맞지 않거나 중복이라 빠진 항목: 과목 배치 2개, 과목 보관함 1개');
  });
});

describe('runImport: 시험 안에서 빠진 항목을 문구에 덧붙인다', () => {
  it('시험은 남고 과목 배치만 빠지면 건수 문구 뒤에 안내가 붙는다', () => {
    const p = exportPayload(oneExamState()) as unknown as { state: { exams: Record<string, any>[] } };
    p.state.exams[0].subs.push({ id: 'zz', subjectId: 'nope', plan: {} });
    const target = newState();
    const out = runImport(JSON.stringify(p), 'file', (pl) => importMerge(target, pl));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.counts).toEqual({ added: 1, dup: 0, excluded: 0 });
      expect(out.text).toBe('추가 1, 중복 0, 제외 0 형식이 맞지 않거나 중복이라 빠진 항목: 과목 배치 1개');
      expect(out.detail).toEqual({ exams: 0, subs: 1, tasks: 0, library: 0 });
    }
  });
});

describe('countImport: 건수 계산', () => {
  it('입력 시험 수에서 추가와 중복을 뺀 나머지를 제외로 본다', () => {
    expect(countImport(3, { added: 1, dup: 1 })).toEqual({ added: 1, dup: 1, excluded: 1 });
    expect(countImport(2, { added: 2, dup: 0 })).toEqual({ added: 2, dup: 0, excluded: 0 });
  });
  it('음수가 나오지 않는다', () => {
    expect(countImport(1, { added: 2, dup: 0 })).toEqual({ added: 2, dup: 0, excluded: 0 });
  });
});

describe('runImport: core importMerge 와 함께', () => {
  it('처음 가져오면 추가 1, 같은 파일을 다시 가져오면 중복 1 이다', () => {
    const target = newState();
    const text = JSON.stringify(exportPayload(oneExamState()));
    const merge = (p: Record<string, unknown>) => importMerge(target, p);

    const first = runImport(text, 'paste', merge);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.counts).toEqual({ added: 1, dup: 0, excluded: 0 });
    expect(target.exams).toHaveLength(1);

    const again = runImport(text, 'paste', merge);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.counts).toEqual({ added: 0, dup: 1, excluded: 0 });
    expect(target.exams).toHaveLength(1);
  });

  it('날짜가 맞지 않아 버려진 시험은 제외로 센다(예전에는 항상 0 이었다)', () => {
    const target = newState();
    const out = runImport(payloadWithBadExam(), 'file', (p) => importMerge(target, p));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.counts).toEqual({ added: 1, dup: 0, excluded: 1 });
      expect(out.text).toBe('추가 1, 중복 0, 제외 1');
    }
  });

  it('추가·중복·제외가 한 번에 섞인 경우', () => {
    const mine = oneExamState(); // 이 기기에 이미 있는 시험(중복이 될 것)
    const extra = newExam({ name: '중간고사', start: '2026-10-01', end: '2026-10-05' });
    const src = newState();
    src.exams.push(mine.exams[0]);
    if ('exam' in extra) src.exams.push(extra.exam); // 새 시험(추가)
    const p = JSON.parse(JSON.stringify(exportPayload(src))) as { state: { exams: Record<string, unknown>[] } };
    p.state.exams.push({
      id: 'bad-2', name: '잘못된 시험', start: '2026-12-10', end: '2026-12-01', prepStart: '2026-11-01',
      subs: [], tasks: [], days: {}, week: {},
    }); // 제외
    const out = runImport(JSON.stringify(p), 'paste', (pl) => importMerge(mine, pl));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.counts).toEqual({ added: 1, dup: 1, excluded: 1 });
      expect(mine.exams).toHaveLength(2);
    }
  });

  it('병합이 오류를 돌려주면 format 으로 보고한다', () => {
    const out = runImport(JSON.stringify(exportPayload(oneExamState())), 'file', () => ({ error: 'format' }));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure).toEqual({ kind: 'format' });
      expect(out.text).toBe('파일을 가져오지 못했습니다: ' + failureReason({ kind: 'format' }));
    }
  });

  it('병합이 던지면 unknown 으로 보고하고 던지지 않는다', () => {
    const out = runImport(JSON.stringify(exportPayload(oneExamState())), 'paste', () => {
      throw new Error('boom');
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failure).toEqual({ kind: 'unknown' });
  });

  it('검사에서 막히면 병합을 부르지 않고 사유를 그대로 보인다', () => {
    let called = false;
    const out = runImport('{"app":"exam-planner","version":9,"state":{"exams":[],"library":[]}}', 'paste', () => {
      called = true;
      return { added: 0, dup: 0, skipped: 0 };
    });
    expect(called).toBe(false);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.text.startsWith('붙여넣은 내용을 가져오지 못했습니다: ')).toBe(true);
      expect(out.text).toContain('버전 9');
    }
  });
});

describe('importFailureText: 무엇을 하지 못했는지: 이유', () => {
  it('출처에 따라 앞부분이 다르고 이유 끝에 마침표가 없다', () => {
    const paste = importFailureText({ kind: 'json' }, 'paste');
    const file = importFailureText({ kind: 'json' }, 'drop');
    expect(paste.startsWith('붙여넣은 내용을 가져오지 못했습니다: ')).toBe(true);
    expect(file.startsWith('파일을 가져오지 못했습니다: ')).toBe(true);
    expect(paste.endsWith('.')).toBe(false);
    expect(importFailureText({ kind: 'size' }, 'file')).toBe('파일을 가져오지 못했습니다: 파일이 20MB 를 넘습니다');
  });
});

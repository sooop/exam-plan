// 설정·데이터 서랍의 순수 로직(DOM·스토어 비의존). tests/dialogs 가 시험한다.
// 가져오기 결과 건수, 오류 분류, 파일 크기·목록 고르기, 숫자 범위 자르기, 파일 끌기 판정, 애니메이션 값.
import { S } from '../app/strings';
import { D } from './texts';
import type { SkippedDetail } from '../core/sanitize';

/* ---------- 파일 ---------- */

/** 가져오기 파일 상한(바이트). 이보다 크면 읽지 않는다 */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

/** 파일 크기 검사. 상한 이하면 null, 넘으면 실패 사유 */
export function fileSizeFailure(size: number): ImportFailure | null {
  return size > MAX_IMPORT_BYTES ? { kind: 'size' } : null;
}

export interface PickableFile { name: string; type?: string }

/** 목록에서 가져올 파일 하나를 고른다. JSON 으로 보이는 것을 우선하고, 없으면 첫 파일. ignored 는 버린 개수 */
export function pickImportFile<T extends PickableFile>(files: readonly T[]): { file: T | null; ignored: number } {
  if (!files.length) return { file: null, ignored: 0 };
  const file = files.find(looksLikeJson) ?? files[0];
  return { file, ignored: files.length > 1 ? files.length - 1 : 0 };
}

/** JSON 으로 보이는 파일인가: .json 확장자, application/json, text/plain, 확장자 없는 이름 */
export function looksLikeJson(f: PickableFile): boolean {
  const n = f.name.toLowerCase();
  const t = (f.type ?? '').toLowerCase();
  return n.endsWith('.json') || t === 'application/json' || t === 'text/plain' || (!t && !/\.[^./\\]+$/.test(n));
}

/** 끌기 항목이 파일인가(글자 선택 끌기는 false). types 는 DataTransfer.types */
export function isFileDrag(types: Iterable<string> | null | undefined): boolean {
  return Array.from(types ?? []).includes('Files');
}

/* ---------- 숫자 입력 ---------- */

export type ClampResult = { ok: true; value: number; clamped: boolean } | { ok: false };

/**
 * 숫자 입력을 정수로 만들어 [lo, hi] 안으로 자른다. 빈 값·숫자가 아니면 ok:false(호출자가 이전 값을 유지한다).
 * clamped 는 범위 밖이어서 잘랐는지(안내를 보일지)를 뜻한다. 소수는 반올림하고 잘린 것으로 보지 않는다.
 */
export function clampNumber(raw: string | number, lo: number, hi: number): ClampResult {
  if (typeof raw === 'string' && raw.trim() === '') return { ok: false };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false };
  const r = Math.round(n);
  const value = Math.min(hi, Math.max(lo, r));
  return { ok: true, value, clamped: value !== r };
}

/* ---------- 애니메이션 설정 값 ---------- */

/** 저장된 값을 애니메이션 켜짐 여부로 바꾼다. 'off' 만 끈 것이고, 없거나 알 수 없는 값은 켜짐(기본) */
export function parseAnimValue(raw: string | null | undefined): boolean {
  return raw !== 'off';
}

/** 켜짐 여부를 html[data-anim] 과 저장 값에 쓰는 문자열 */
export const animValue = (on: boolean): 'on' | 'off' => (on ? 'on' : 'off');

/* ---------- 가져오기: 검사 ---------- */

export type ImportSource = 'paste' | 'file' | 'drop';

/** 가져오기가 실패한 이유. 사용자에게는 importFailureText 로 보인다 */
export type ImportFailure =
  | { kind: 'empty' }
  | { kind: 'json' }
  | { kind: 'notObject' }
  | { kind: 'appMissing' }
  | { kind: 'appOther' }
  | { kind: 'version'; found: number }
  | { kind: 'stateVersion'; found: number }
  | { kind: 'format' }
  | { kind: 'size' }
  | { kind: 'read' }
  | { kind: 'unknown' };

/** 이 앱이 내보내는 파일의 식별자와 버전(core exportPayload 와 같다) */
export const APP_ID = 'exam-planner';
export const EXPORT_VERSION = 1;
/** 이 앱이 읽을 수 있는 최신 데이터 버전(core newState 의 v) */
export const STATE_VERSION_MAX = 3;

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);

export type InspectResult = { ok: true; payload: Rec } | { ok: false; failure: ImportFailure };

/**
 * 텍스트가 가져올 수 있는 모양인지 본다(병합 전 단계). 시험 하나하나의 검증은 core importMerge(sanitize)가 한다.
 * 여기서는 빈 입력, JSON 문법, 객체 여부, 앱 식별자, 파일·데이터 버전, 시험·과목 배열의 존재만 구분한다.
 */
export function inspectImportText(text: string): InspectResult {
  if (!text.trim()) return { ok: false, failure: { kind: 'empty' } };
  let v: unknown;
  try { v = JSON.parse(text); } catch { return { ok: false, failure: { kind: 'json' } }; }
  if (!isRecord(v)) return { ok: false, failure: { kind: 'notObject' } };
  if (!('app' in v)) return { ok: false, failure: { kind: 'appMissing' } };
  if (v.app !== APP_ID) return { ok: false, failure: { kind: 'appOther' } };
  if (typeof v.version === 'number' && v.version > EXPORT_VERSION) return { ok: false, failure: { kind: 'version', found: v.version } };
  const st = v.state;
  if (!isRecord(st) || !Array.isArray(st.exams) || !Array.isArray(st.library)) return { ok: false, failure: { kind: 'format' } };
  if (typeof st.v === 'number' && st.v > STATE_VERSION_MAX) return { ok: false, failure: { kind: 'stateVersion', found: st.v } };
  return { ok: true, payload: v };
}

/** 입력 payload 의 시험 개수(병합 전). state.exams 가 배열이 아니면 0 */
export function rawExamCount(payload: Rec): number {
  const st = payload.state;
  return isRecord(st) && Array.isArray(st.exams) ? st.exams.length : 0;
}

/* ---------- 가져오기: 건수와 문구 ---------- */

export interface ImportCounts { added: number; dup: number; excluded: number }

/** core importMerge 의 반환값과 입력 시험 수로 건수를 정한다. excluded 는 입력 시험 중 병합되지도 중복도 아닌 것 */
export function countImport(rawExams: number, r: { added: number; dup: number }): ImportCounts {
  return { added: r.added, dup: r.dup, excluded: Math.max(0, rawExams - r.added - r.dup) };
}

export type MergeResult = { error: string } | { added: number; dup: number; skipped: number; skippedDetail?: SkippedDetail };
export type MergeFn = (payload: Rec) => MergeResult;

/** 시험은 남았지만 안의 항목이 빠진 건수(core importMerge 의 skippedDetail). 빠진 것이 없으면 값이 없다 */
export function skippedNoteText(d: SkippedDetail | undefined): string {
  return d ? D.skippedNote(d.subs, d.tasks, d.library) : '';
}

export type ImportOutcome =
  | { ok: true; counts: ImportCounts; text: string; detail?: SkippedDetail }
  | { ok: false; failure: ImportFailure; text: string };

/**
 * 가져오기 한 번의 결과. 검사 → 병합(merge 주입) → 건수 → 문구. 병합 함수는 화면이 app.mutate 로 감싸 넘긴다.
 * 병합이 던지면 unknown 으로 보고, 병합이 error 를 돌려주면 format 으로 보고한다.
 */
export function runImport(text: string, source: ImportSource, merge: MergeFn): ImportOutcome {
  const ins = inspectImportText(text);
  if (!ins.ok) return { ok: false, failure: ins.failure, text: importFailureText(ins.failure, source) };
  let r: MergeResult;
  try {
    r = merge(ins.payload);
  } catch {
    return { ok: false, failure: { kind: 'unknown' }, text: importFailureText({ kind: 'unknown' }, source) };
  }
  if ('error' in r) return { ok: false, failure: { kind: 'format' }, text: importFailureText({ kind: 'format' }, source) };
  const counts = countImport(rawExamCount(ins.payload), r);
  const note = skippedNoteText(r.skippedDetail);
  return { ok: true, counts, text: importResultText(counts) + (note ? ' ' + note : ''), detail: r.skippedDetail };
}

/**
 * 붙여넣기 초안을 가져오기 뒤 어떻게 할지. 붙여넣기가 성공했을 때만 비운다.
 * 실패하면 고친 뒤 다시 쓸 수 있게 남기고, 파일 열기·끌어 놓기는 붙여넣기 초안과 상관없으므로 건드리지 않는다.
 */
export function draftAfterImport(draft: string, source: ImportSource, ok: boolean): string {
  return ok && source === 'paste' ? '' : draft;
}

/** 성공 문구: 추가·중복·제외 건수 */
export const importResultText = (c: ImportCounts): string => S.importRes(c.added, c.dup, c.excluded);

/** 실패 문구: '무엇을 하지 못했는지: 이유'. 이유 끝에 마침표를 붙이지 않는다 */
export function importFailureText(f: ImportFailure, source: ImportSource): string {
  const prefix = source === 'paste' ? D.failPrefixPaste : D.failPrefixFile;
  return prefix + failureReason(f);
}

export function failureReason(f: ImportFailure): string {
  switch (f.kind) {
    case 'empty': return D.reason.empty;
    case 'json': return D.reason.json;
    case 'notObject': return D.reason.notObject;
    case 'appMissing': return D.reason.appMissing;
    case 'appOther': return D.reason.appOther;
    case 'version': return D.reason.version(f.found);
    case 'stateVersion': return D.reason.stateVersion(f.found);
    case 'format': return D.reason.format;
    case 'size': return D.reason.size;
    case 'read': return D.reason.read;
    case 'unknown': return D.reason.unknown;
  }
}

/* ---------- 숫자 범위 안내 ---------- */

/** 범위 밖 입력을 잘라 적용했을 때 안내. 값이 비었으면 이전 값을 유지했다고 안내 */
export const numEmptyNotice = (label: string, current: number): string => D.numEmpty(label, current);
export const numClampNotice = (label: string, lo: number, hi: number, value: number): string => D.numClamped(label, lo, hi, value);

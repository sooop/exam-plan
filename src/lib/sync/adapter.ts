// 시험 공부 플래너 상태(State) <-> 동기화 항목 어댑터. 참고: sync-kit docs/ADAPTER-GUIDE.md
//
// ───────── 항목 설계 ─────────
//  - 시험 1개      -> kind 'doc'     , id 'e-<exam.id>'     , data = 시험 전체(id 포함)
//  - 과목 라이브러리 1개 -> kind 'snippet', id 'l-<library.id>'  , data = { name, color }  (id 가 해시로 줄었을 때만 id 도 포함)
//  - 설정          -> kind 'doc'     , id 'settings'(고정)  , data = { limits, defPlan, recapDays, week }
//    (옛 버전이 올린 kind 'thread' 설정도 id 로 알아보고 받는다. 'doc' 으로 바꾼 것은 충돌에서 진 설정도 preserveLoser 로 이력에 남기려는 것이다)
//  동기화하지 않는 것: activeId(기기별 선택), UI 상태, 시험 순서(state.exams 의 배열 순서), State.v.
//
// ───────── 시험 data 에 id 를 넣는 이유(결정) ─────────
//  항목 id 는 'e-' + exam.id 이지만 62자를 넘기거나 허용 문자([A-Za-z0-9_-])가 아니면 접두사 + contentHash(id) 로 줄어
//  거꾸로 풀 수 없다. 받는 쪽이 항상 같은 exam.id 를 복원하도록 시험 data 에는 id 를 항상 넣는다(약 20바이트).
//  apply 는 examItemId(data.id) === item.id 를 확인해, 항목과 내용이 어긋난 데이터를 거부한다.
//
// ───────── 로컬 id 를 평문에 넣는 문제는 이 앱에 해당 없다 ─────────
//  ADAPTER-GUIDE 3번의 문제는 id 가 기기마다 다르게 만들어지는 앱에서 생긴다. 이 앱의 exam.id·library.id·sub.id 는
//  uid()(시각 + 난수 + 순번)로 한 번 만들어져 가져오기·동기화 때 그대로 퍼지고(importMerge 도 id 충돌이 아니면 유지),
//  어느 기기에서나 같은 대상을 가리킨다. 그래서 subjectId(라이브러리 id) 같은 참조를 그대로 평문에 보낸다.
//  예외 하나: 두 기기가 같은 이름의 과목을 따로 만들면 id 만 다른 같은 과목이 생긴다(importMerge 는 이름으로 합치므로
//  가져오기에서도 생긴다). 이 경우는 아래 '이름 중복 합치기' 규칙으로 해결한다.
//  서버는 항목 id 를 평문으로 본다. id 에는 접두사와 무작위 id 만 있고 시험 이름·과목명은 들어가지 않는다.
//
// ───────── 시각(updatedAt) ─────────
//  충돌 판정(둘 다 고친 항목에서 더 늦은 쪽이 이김)에만 쓰이고 변경 감지 해시에는 들어가지 않는다(시험 data 의 at 은 data 에 들어간다).
//  - 시험: exam.at(그 시험을 마지막으로 실제 바꾼 시각). 없으면(옛 저장본) state.updatedAt.
//  - 설정: state.settingsAt(설정을 마지막으로 실제 바꾼 시각). 없으면 0 - 한 번도 바꾼 적 없는 기기의 기본값은 서버 설정을 이기지 못한다.
//  - 라이브러리: state.updatedAt(항목별 시각이 없다).
//  원격 반영(applyRemote)은 state.updatedAt 을 올리지 않는다 - 화면 쪽 구현이 로컬 편집 때만 올려야 한다. 원격 설정을 받으면 settingsAt 을 그 시각으로 맞춘다.
//
// ───────── apply 규칙 ─────────
//  모든 원격 데이터는 sanitizeState 로 검증·정리한 뒤에만 쓴다(원격 데이터를 신뢰하지 않는다).
//  - 검증에 실패하면(모양이 틀림, 항목 id 와 내용 불일치, 값 범위 위반) 상태를 바꾸지 않고 'deferred' 를 돌려준다.
//    'applied' 로 답하면 엔진은 그 항목을 받은 것으로 기록하는데, 로컬에는 없으니 다음 푸시가 삭제로 오해해 서버의
//    (새 버전 앱이 쓴 것일 수도 있는) 정상 데이터를 지운다. 'deferred' 는 보류 상태라 푸시 대상에서 빠지고 서버 사본이 남는다.
//    다음 동기화에서 다시 시도하고, 서버 쪽 항목이 고쳐지면 그 새 사본으로 대체된다.
//  - 'deferred' 가 쓰이는 조건: (1) 시험이 참조하는 라이브러리 id(subs[].subjectId)가 로컬 라이브러리에 아직 없다
//    (라이브러리 항목이 나중에 도착), (2) 위의 검증 실패.
//  - 이 앱에 없는 종류(kind)·알 수 없는 id 는 'applied' 로 답하고 무시한다(guide: 'deferred' 면 영원히 재시도).
//  - 삭제 항목은 항상 'applied'.
//  - 시험을 반영한 뒤 activeId 가 가리키는 시험이 없으면(삭제됨) 첫 시험, 시험이 없으면 null. activeId 가 null 이고 시험이
//    생겼으면 첫 시험으로 정한다(기기별 값이라 동기화되지 않는다).
//  - 반영 결과가 현재 상태와 같으면(변화 없음) host.applyRemote 를 부르지 않는다.
//
// ───────── 라이브러리 이름 중복 합치기 규칙 ─────────
//  같은 nameKey(공백 정리·소문자)를 가진 라이브러리 항목이 id 만 달리 둘 이상 생기면:
//   1) id 를 문자열 사전순(<)으로 비교해 가장 작은 쪽을 정본으로 한다. 어느 기기에서나 같은 결론이 난다.
//   2) 나머지(패자)는 로컬 라이브러리에서 지운다. 정본의 이름·색은, 정본이 들어오는 원격 항목이면 원격 값이고,
//      이미 로컬에 있던 항목이면 로컬 값이다(들어오는 쪽이 패자면 버려진다).
//   3) 모든 시험의 subs[].subjectId 가 패자이면 정본 id 로 바꾼다. 한 시험에 두 id 가 함께 있었다면 앞선 과목만 남기고
//      뒤 과목과 그 할일은 지운다(한 시험에 같은 과목은 하나).
//   4) 패자가 로컬 목록에서 사라지므로 엔진은 다음 푸시에서 패자 항목을 삭제로 올리고, 바뀐 시험도 새 내용으로 올라간다.
//  라이브러리 항목이 원격에서 삭제되면 로컬에서 지우고, 그 id 를 참조하는 과목(subs)과 그 할일도 함께 지운다.
//  (sanitizeState 가 라이브러리에 없는 subjectId 의 과목을 버리는 규칙과 같다.)
import type { ItemKind, LocalItem, SyncAdapter } from 'sync-kit';
import { contentHash, stableStringify } from 'sync-kit';
import { newState } from '../core/planner';
import { sanitizeState } from '../core/sanitize';
import { nameKey } from '../core/util';
import type { Exam, Limits, Plan, State, Week } from '../core/types';
import { KIND_EXAM, KIND_LIBRARY, KIND_SETTINGS, KIND_SETTINGS_LEGACY } from './appTypes';

// ───────── 호스트(앱 저장소와의 접점) ─────────
export interface SyncHost {
  /** 현재 앱 상태. 어댑터는 읽기만 하고 변경하지 않는다(필요하면 복사한다) */
  getState(): State;
  /**
   * 원격 변경을 앱 상태에 반영한다. mutator 가 받는 draft 를 고치면 되고, 구현은 그 결과를 앱 상태로 삼아 저장한다.
   * 로컬 변경으로 취급하면 안 된다: notifyLocalChange(엔진 markDirty)를 부르지 않고, state.updatedAt 을 올리지 않는다.
   * mutator 는 한 번만 호출되며 동기 함수다.
   */
  applyRemote(mutator: (draft: State) => void): void;
  /** 충돌에서 진 시험을 이 기기의 로컬 이력에 남긴다(서버에는 올리지 않는다). name 은 '동기화 전(YYYY-MM-DD)' */
  preserveLoserExam(item: { name: string; exam: unknown; at: number }): void;
  /** 충돌에서 진 설정을 이 기기의 로컬 이력에 남긴다(서버에는 올리지 않는다). settings 는 설정 값 JSON, at 은 그 설정의 변경 시각 */
  preserveLoserSettings?(item: { name: string; settings: unknown; at: number }): void;
  /**
   * 엔진이 로컬 항목을 읽기 직전에 부른다(listLocal). 다른 탭이 더 새 저장본을 썼으면 먼저 반영한다.
   * 던지면 이번 사이클은 미뤄진다(엔진은 listLocal 예외를 오류로 처리하고 아무것도 올리거나 지우지 않는다).
   */
  ensureFresh?(): Promise<void>;
  /** 원격 반영이 끝나 화면을 갱신할 때(한 번의 동기화 적용 묶음당 한 번) */
  onApplied?(): void;
}

export interface SyncAdapterOptions {
  now?: () => number;
}

// ───────── 항목 id ─────────
const MAX_ID = 62; // sync-kit 한도(64) 아래의 여유
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const EXAM_PREFIX = 'e-';
const LIBRARY_PREFIX = 'l-';
export const SETTINGS_ID = 'settings';

/** 접두사 + id. 길이가 62자를 넘거나 허용 문자 밖이면 접두사 + contentHash(id) (ADAPTER-GUIDE 2번) */
function prefixed(prefix: string, id: string): string {
  const s = prefix + id;
  return s.length <= MAX_ID && SAFE_ID.test(id) ? s : prefix + contentHash(id);
}
export const examItemId = (examId: string): string => prefixed(EXAM_PREFIX, examId);
export const libraryItemId = (libraryId: string): string => prefixed(LIBRARY_PREFIX, libraryId);

/** id 접두사로 종류를 알려 준다(해시로 줄어도 접두사는 같다). 모르는 id 는 undefined */
export function kindOfId(id: string): ItemKind | undefined {
  if (id === SETTINGS_ID) return KIND_SETTINGS; // 시험과 같은 'doc'. 구분은 항목 id
  if (id.startsWith(EXAM_PREFIX)) return KIND_EXAM;
  if (id.startsWith(LIBRARY_PREFIX)) return KIND_LIBRARY;
  return undefined;
}

// ───────── 항목 data 모양 ─────────
/** kind 'doc': 시험 전체(Exam 과 같은 모양, id 포함) */
export type ExamData = Exam;
/** kind 'snippet': 라이브러리 항목. id 는 항목 id 가 해시로 줄어 id 를 복원할 수 없을 때만 들어간다 */
export interface LibraryData { name: string; color: string; id?: string }
/** id 'settings': 설정 */
export interface SettingsData { limits: Limits; defPlan: Plan; recapDays: number; week: Week }

// ───────── 내부 도구 ─────────
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T; // $state 프록시도 안전하게 복사된다
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const pad = (n: number) => String(n).padStart(2, '0');
const sameJson = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

/** 검증용 상태 틀: sanitizeState 에 넘겨 원격 데이터를 정리한다 */
function shell(library: unknown[], exams: unknown[]): unknown {
  return { ...newState(), library, exams };
}

/** activeId 보정: 가리키는 시험이 없으면 첫 시험, 시험이 없으면 null */
function fixActive(draft: State): void {
  if (draft.activeId !== null && draft.exams.some((e) => e.id === draft.activeId)) return;
  draft.activeId = draft.exams.length ? draft.exams[0].id : null;
}

/** 패자 library id 들을 정본으로 바꾼다. 한 시험에 정본과 패자가 함께 있으면 뒤의 과목을 그 할일과 함께 지운다 */
function remapSubjects(draft: State, losers: Set<string>, canonical: string): void {
  for (const ex of draft.exams) {
    if (!ex.subs.some((s) => losers.has(s.subjectId))) continue;
    const seen = new Set<string>();
    const dropped = new Set<string>();
    const subs = [];
    for (const s of ex.subs) {
      const subjectId = losers.has(s.subjectId) ? canonical : s.subjectId;
      if (seen.has(subjectId)) { dropped.add(s.id); continue; }
      seen.add(subjectId);
      subs.push(subjectId === s.subjectId ? s : { ...s, subjectId });
    }
    ex.subs = subs;
    if (dropped.size) ex.tasks = ex.tasks.filter((t) => !dropped.has(t.esId));
  }
}

/** library 항목 하나를 지우고 그 id 를 참조하는 과목·할일도 지운다 */
function dropLibrary(draft: State, libraryId: string): void {
  draft.library = draft.library.filter((l) => l.id !== libraryId);
  for (const ex of draft.exams) {
    const gone = new Set(ex.subs.filter((s) => s.subjectId === libraryId).map((s) => s.id));
    if (!gone.size) continue;
    ex.subs = ex.subs.filter((s) => !gone.has(s.id));
    ex.tasks = ex.tasks.filter((t) => !gone.has(t.esId));
  }
}

type Outcome = 'applied' | 'deferred';

export function createSyncAdapter(host: SyncHost, options: SyncAdapterOptions = {}): SyncAdapter {
  const now = () => (options.now ?? Date.now)();

  // ───────── 읽기 ─────────
  async function listLocal(): Promise<LocalItem[]> {
    await host.ensureFresh?.(); // 낡은 상태로 항목을 내놓으면 엔진이 다른 탭·기기의 항목을 삭제로 올린다
    const st = host.getState();
    const at = Number(st.updatedAt) || 0;
    const items: LocalItem[] = [];
    for (const e of st.exams) {
      items.push({ id: examItemId(e.id), kind: KIND_EXAM, updatedAt: Number(e.at) > 0 ? Number(e.at) : at, deleted: false, data: clone(e) });
    }
    for (const l of st.library) {
      const id = libraryItemId(l.id);
      const data: LibraryData = { name: l.name, color: l.color, ...(id === LIBRARY_PREFIX + l.id ? {} : { id: l.id }) };
      items.push({ id, kind: KIND_LIBRARY, updatedAt: at, deleted: false, data });
    }
    const settings: SettingsData = clone({ limits: st.limits, defPlan: st.defPlan, recapDays: st.recapDays, week: st.week });
    items.push({ id: SETTINGS_ID, kind: KIND_SETTINGS, updatedAt: Number(st.settingsAt) > 0 ? Number(st.settingsAt) : 0, deleted: false, data: settings });
    // 결정적 출력: 상태의 배열 순서와 무관하게 id 순
    return items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  // ───────── 쓰기 ─────────
  // 각 변환은 draft 를 고치는 함수다. 'deferred' 를 돌려줄 때는 draft 를 바꾸지 않는다.
  function mutateExam(draft: State, item: LocalItem): Outcome {
    if (item.deleted || item.data === null) {
      draft.exams = draft.exams.filter((e) => examItemId(e.id) !== item.id);
      fixActive(draft);
      return 'applied';
    }
    const raw = item.data;
    if (!isObj(raw) || typeof raw.id !== 'string' || examItemId(raw.id) !== item.id) return 'deferred';
    const have = new Set(draft.library.map((l) => l.id));
    const refs = Array.isArray(raw.subs) ? raw.subs.flatMap((s) => (isObj(s) && typeof s.subjectId === 'string' ? [s.subjectId] : [])) : [];
    if (refs.some((r) => !have.has(r))) return 'deferred'; // 라이브러리 항목이 나중에 도착한다
    const clean = sanitizeState(shell(clone(draft.library), [clone(raw)]));
    if (!clean || clean.exams.length !== 1) return 'deferred';
    const exam = clean.exams[0];
    const at = draft.exams.findIndex((e) => e.id === exam.id);
    if (at >= 0) draft.exams[at] = exam; else draft.exams.push(exam);
    fixActive(draft);
    return 'applied';
  }

  function mutateLibrary(draft: State, item: LocalItem): Outcome {
    if (item.deleted || item.data === null) {
      const lib = draft.library.find((l) => libraryItemId(l.id) === item.id);
      if (lib) dropLibrary(draft, lib.id);
      return 'applied';
    }
    const raw = item.data;
    if (!isObj(raw)) return 'deferred';
    const local = draft.library.find((l) => libraryItemId(l.id) === item.id);
    const id = local?.id ?? (typeof raw.id === 'string' ? raw.id : item.id.slice(LIBRARY_PREFIX.length));
    if (libraryItemId(id) !== item.id) return 'deferred';
    const clean = sanitizeState(shell([{ id, name: raw.name, color: raw.color }], []));
    if (!clean || clean.library.length !== 1 || clean.library[0].id !== id) return 'deferred';
    const incoming = clean.library[0];

    // 이름 중복 합치기: id 사전순으로 가장 작은 쪽이 정본
    const same = draft.library.filter((l) => l.id !== id && nameKey(l.name) === nameKey(incoming.name));
    const ids = [id, ...same.map((l) => l.id)];
    const canonical = ids.reduce((a, b) => (b < a ? b : a));
    const losers = new Set(ids.filter((x) => x !== canonical));
    if (canonical === id) {
      const at = draft.library.findIndex((l) => l.id === id);
      if (at >= 0) draft.library[at] = incoming; else draft.library.push(incoming);
    }
    if (losers.size) {
      draft.library = draft.library.filter((l) => !losers.has(l.id));
      remapSubjects(draft, losers, canonical);
    }
    return 'applied';
  }

  function mutateSettings(draft: State, item: LocalItem): Outcome {
    if (item.deleted || item.data === null) return 'applied'; // 설정은 지우지 않는다(listLocal 이 계속 내놓아 다음 푸시가 되살린다)
    const raw = item.data;
    if (!isObj(raw) || !isObj(raw.limits) || !isObj(raw.defPlan) || !isObj(raw.week) || typeof raw.recapDays !== 'number') return 'deferred';
    const clean = sanitizeState({ ...newState(), limits: raw.limits, defPlan: raw.defPlan, recapDays: raw.recapDays, week: raw.week, library: [], exams: [] });
    if (!clean) return 'deferred';
    draft.limits = clean.limits;
    draft.defPlan = clean.defPlan;
    draft.recapDays = clean.recapDays;
    draft.week = clean.week;
    if (item.updatedAt > 0) draft.settingsAt = Math.floor(item.updatedAt); // 이 설정의 변경 시각을 따라간다(로컬 편집 시각이 아니다)
    return 'applied';
  }

  function mutate(draft: State, item: LocalItem): Outcome {
    if (item.id === SETTINGS_ID) {
      // 설정은 시험과 같은 'doc' 이다. 옛 버전이 올린 'thread' 도 받는다. 다른 종류로 온 settings 는 잘못된 데이터다
      if (item.deleted) return 'applied';
      if (item.kind !== KIND_SETTINGS && item.kind !== KIND_SETTINGS_LEGACY) return 'deferred';
      return mutateSettings(draft, item);
    }
    const kind = item.deleted ? (kindOfId(item.id) ?? item.kind) : item.kind;
    // 항목 id 와 kind 가 어긋나면(다른 종류의 id) 잘못된 데이터다
    const byId = kindOfId(item.id);
    if (kind !== KIND_EXAM && kind !== KIND_LIBRARY) return 'applied'; // 모르는 종류는 무시
    if (byId === undefined) return item.deleted ? 'applied' : 'deferred';
    if (byId !== kind) return item.deleted ? 'applied' : 'deferred';
    if (kind === KIND_EXAM) return mutateExam(draft, item);
    return mutateLibrary(draft, item);
  }

  // ───────── 적용 알림 ─────────
  let depth = 0;
  let touched = false;
  function setApplying(on: boolean): void {
    if (on) { depth++; return; }
    depth = Math.max(0, depth - 1);
    if (depth === 0 && touched) {
      touched = false;
      host.onApplied?.();
    }
  }
  function notify(): void {
    if (depth > 0) touched = true; // 엔진이 setApplying 으로 묶은 안: 끝에 한 번만 알린다
    else host.onApplied?.();
  }

  /** 항목 하나를 반영한다. 변화가 있을 때만 host.applyRemote 를 부르고, 'deferred' 면 아무것도 하지 않는다 */
  function run(item: LocalItem): Outcome {
    // 먼저 복사본에 적용해 결과와 변화 여부를 알아낸다(host 상태는 건드리지 않는다)
    const probe = clone(host.getState());
    const before = stableStringify(probe);
    const outcome = mutate(probe, item);
    if (outcome === 'deferred') return outcome;
    if (stableStringify(probe) === before) return outcome;
    host.applyRemote((draft) => { mutate(draft, item); });
    notify();
    return outcome;
  }

  return {
    listLocal,
    kindOfId,
    async apply(item) { return run(item); },
    async preserveLoser(item) {
      // kind 'doc' 인 시험과 설정만 불린다. 엔진은 로컬에 있는 항목에 대해서만 부르므로 대상이 없는 경우는 없다
      if (item.deleted || !isObj(item.data)) return;
      if (item.id === SETTINGS_ID) {
        // 한 번도 바꾼 적 없는 기본값(updatedAt 0)은 남길 것이 없다
        if (item.updatedAt > 0) host.preserveLoserSettings?.({ name: '동기화 전 설정', settings: clone(item.data), at: item.updatedAt });
        return;
      }
      if (item.kind !== KIND_EXAM || kindOfId(item.id) !== KIND_EXAM) return;
      const t = new Date(now());
      host.preserveLoserExam({
        name: `동기화 전(${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())})`,
        exam: clone(item.data),
        at: now(),
      });
    },
    async removeLocal(item) {
      // 되돌릴 수 없는 완전 삭제. 설정은 지우지 않는다(기본값으로 되돌리지 않는다)
      if (item.id === SETTINGS_ID) return; // 설정은 시험과 같은 kind 'doc' 이라 id 로 가린다
      const kind = kindOfId(item.id) ?? item.kind;
      run({ id: item.id, kind, updatedAt: 0, deleted: true, data: null });
    },
    setApplying,
  };
}

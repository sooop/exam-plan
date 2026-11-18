// 변경 이력 화면 문구. 화면 파일에 한국어 문장을 직접 쓰지 않는다.
import type { LogKind, SnapshotKind } from './core';

export const H = {
  title: '변경 이력',
  saveNow: '지금 저장',
  saveNowTip: '현재 상태를 스냅샷으로 남깁니다',
  undo: '실행 취소',
  redo: '다시 실행',
  undoLine: (label: string) => `되돌리기: ${label}`,
  redoLine: (label: string) => `다시 실행: ${label}`,
  undoNone: '되돌릴 변경이 없습니다. 이 창을 연 뒤에 바꾼 내용만 되돌릴 수 있습니다.',
  redoNone: '다시 실행할 변경이 없습니다.',
  undone: (label: string) => `되돌렸습니다: ${label}`,
  redone: (label: string) => `다시 실행했습니다: ${label}`,

  tabsLabel: '변경 이력 보기',
  tabSnapshots: '스냅샷',
  tabLog: '작업 기록',

  kind: {
    auto: '자동',
    manual: '수동',
    'before-big': '큰 변경 전',
    'before-sync': '동기화 전',
    'before-restore': '복원 전',
    'sync-loser': '동기화 충돌',
  } satisfies Record<SnapshotKind, string>,
  logKind: {
    local: '이 기기에서 변경',
    'sync-received': '동기화로 받음',
    restore: '이력 복원',
  } satisfies Record<LogKind, string>,

  // 스냅샷 이름(label)
  autoLabel: '변경 시작 전',
  manualLabel: '직접 저장',
  beforeSyncLabel: '동기화로 변경을 받기 전',
  beforeRestoreLabel: (when: string) => `복원 전 (${when} 시점으로 되돌리기 직전)`,
  restoreLabel: '이력 복원',
  restoreExamLabel: '시험 복원',
  restoreSettingsLabel: '설정 복원',
  settingsLoserLabel: '동기화 전 설정',
  syncReceivedLabel: '다른 기기의 변경을 받음',

  pin: '고정',
  unpin: '고정 해제',
  pinnedTip: '고정한 스냅샷은 자동으로 정리되지 않습니다',
  remove: '삭제',
  restore: '되돌리기…',
  restoreExam: '시험으로 복사…',
  restoreConfirm: (exams: number, tasks: number) => `현재 상태를 먼저 보존한 뒤 이 시점으로 되돌립니다. 시험 ${exams}개·할일 ${tasks}개`,
  restoreConfirmLabel: '되돌리기',
  restoreExamConfirm: (name: string) => `진 쪽 시험 '${name}'을(를) 새 시험으로 복사해 되살립니다. 지금 시험은 바뀌지 않습니다.`,
  restoreExamConfirmLabel: '시험으로 복사',
  restoreSettings: '설정으로 되돌리기…',
  restoreSettingsConfirm: '이 기기의 현재 설정을 먼저 이력에 보존한 뒤 동기화 전의 설정으로 되돌립니다. 시험과 과목 목록은 바뀌지 않습니다',
  restoreSettingsConfirmLabel: '설정으로 되돌리기',
  settingsRestoredToast: '동기화 전의 설정으로 되돌렸습니다.',
  kindSettingsLoser: '설정 충돌',
  tagExam: '시험',
  tagSettings: '설정',
  removeConfirm: '이 스냅샷을 삭제합니다. 되돌릴 수 없습니다.',
  removeConfirmLabel: '삭제',
  restoreBusy: '되돌리는 중…',
  removeBusy: '삭제하는 중…',

  empty: '아직 스냅샷이 없습니다. 시험을 바꾸기 시작하면 자동으로 쌓이고, 위의 지금 저장으로 직접 남길 수도 있습니다.',
  emptyLog: '아직 작업 기록이 없습니다. 시험이나 할일을 바꾸면 이 기기의 변경이 여기에 쌓입니다.',
  loading: '이력을 불러오는 중…',
  more: (n: number) => `더 보기 (${n}개 더)`,
  listLabel: '스냅샷 목록',
  logLabel: '작업 기록 목록',
  noLabel: '(이름 없음)',
  thisDevice: '이 기기',
  syncedBadge: '동기화로 받음',
  times: (n: number) => `${n}회`,

  // 결과 알림
  savedToast: '스냅샷을 저장했습니다.',
  savedSame: '같은 내용의 스냅샷이 이미 있어 그 항목을 최신으로 올렸습니다.',
  savedFail: '스냅샷을 저장하지 못했습니다.',
  restoredToast: '이 시점으로 되돌렸습니다. 되돌리기 직전 상태는 복원 전 스냅샷에 남았습니다.',
  restoredSame: '현재 상태가 이미 같은 내용입니다.',
  restoredNotDurable: '되돌렸습니다. 다만 직전 상태를 저장소에 남기지 못해 이 창을 닫으면 사라집니다. 실행 취소로 되돌릴 수 있습니다.',
  examRestoredToast: (name: string) => `시험 '${name}'을(를) 복사해 되살렸습니다.`,
  removedToast: '스냅샷을 삭제했습니다.',
  removeFail: '스냅샷을 삭제하지 못했습니다.',

  // 상태
  statusMemory: '이 브라우저에서 이력을 저장할 수 없습니다. 이 창을 닫으면 이력이 사라집니다.',
  statusFailed: (why: string) => `이력을 저장하지 못했습니다. ${why}`,
  statusQuota: '저장 공간이 부족합니다. 오래된 스냅샷을 삭제해 보세요.',
  statusTimeout: '저장소가 응답하지 않았습니다. 잠시 뒤 다시 시도합니다.',
  statusError: '저장소에 쓰는 중 오류가 났습니다.',
  prunedNotice: (n: number, keep: number, days: number) =>
    `오래된 자동 스냅샷 ${n}개를 정리했습니다. 자동 스냅샷은 최근 ${keep}개 또는 ${days}일까지만 보관합니다. 고정하거나 직접 저장한 것은 지우지 않습니다.`,
  dismiss: '닫기',

  // 오류 사유
  errNoApp: '앱이 아직 연결되지 않았습니다.',
  errGuard: '저장된 데이터를 불러오지 못한 상태에서는 되돌릴 수 없습니다. 먼저 불러오기 문제를 해결해 주세요.',
  errNotFound: '스냅샷을 찾을 수 없습니다.',
  errUnpack: '스냅샷 내용을 풀지 못했습니다. 저장된 데이터가 손상됐을 수 있습니다.',
  errParse: '스냅샷 내용을 읽지 못했습니다. 저장된 데이터가 손상됐을 수 있습니다.',
  errInvalid: '스냅샷이 현재 형식과 맞지 않아 되돌리지 않았습니다.',
  errPartial: '스냅샷의 일부 시험을 읽을 수 없어 되돌리지 않았습니다.',
  errNoState: '이 스냅샷에는 전체 상태가 없습니다.',
  errNoExam: '이 스냅샷에는 시험 데이터가 없습니다.',
  errExamInvalid: '진 쪽 시험 데이터가 올바르지 않아 되살리지 못했습니다.',
  errApply: '되돌리는 중 오류가 나 상태를 바꾸지 않았습니다.',
  errPreserve: '지금 상태를 이력에 보존하지 못해 되돌리지 않았습니다. 잠시 뒤 다시 시도하거나 먼저 JSON 으로 내보내 주세요.',
  errSettingsInvalid: '진 쪽 설정이 올바르지 않아 되돌리지 못했습니다.',
  errCapacity: '시험을 더 추가할 수 없어 되살리지 못했습니다.',
} as const;

export const RESTORED_SUFFIX = ' (복원)';

/** 충돌 스냅샷의 대상: 진 시험 하나인지 진 설정 값인지(SnapshotMeta.subject 로 가린다) */
export type LoserSubject = 'exam' | 'settings';

/** 충돌 스냅샷이면 대상을, 그 밖의 종류(자동·수동 등)면 null */
export function loserSubjectOf(m: { kind: SnapshotKind; subject?: 'settings' }): LoserSubject | null {
  if (m.kind !== 'sync-loser') return null;
  return m.subject === 'settings' ? 'settings' : 'exam';
}

/**
 * 대상별 화면 문구. 시험은 '시험으로 복사…', 설정은 '설정으로 되돌리기…'.
 * confirm 은 확인 블록 문장, tag 는 목록 부가정보(가운뎃점)에 붙는 구분 글자다.
 */
export function loserWording(s: LoserSubject): {
  button: string; kindLabel: string; tag: string; confirm: (name: string) => string; confirmLabel: string; danger: boolean; restoredToast: string | null;
} {
  return s === 'settings'
    ? {
        button: H.restoreSettings, kindLabel: H.kindSettingsLoser, tag: H.tagSettings,
        confirm: () => H.restoreSettingsConfirm, confirmLabel: H.restoreSettingsConfirmLabel, danger: false, restoredToast: H.settingsRestoredToast,
      }
    : {
        button: H.restoreExam, kindLabel: H.kind['sync-loser'], tag: H.tagExam,
        confirm: (name) => H.restoreExamConfirm(name), confirmLabel: H.restoreExamConfirmLabel, danger: false, restoredToast: null,
      };
}

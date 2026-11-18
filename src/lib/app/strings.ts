// 화면 문구 모음. legacy/exam-plan.html 958~1006·1033~1034행의 S·WD·fmtMD·fmtFull·KIND_ICON·levelLabel 을 이식했다(문구는 그대로).
// 새로 필요한 문구는 아래 T2 에만 둔다. 화면은 문구를 직접 쓰지 않고 여기서 가져온다.
import { LEVELS } from '../core/constants';
import { weekday } from '../core/dates';
import type { LevelKey } from '../core/types';

export const S = {
  tabs: { exam: '시험 일정', board: '준비 계획', today: '오늘', print: '달력' },
  editMode: '편집', levelTitle: '바쁨 정도', levelDefault: '기본값으로', levelPer: (n: number) => '권장 ' + n + '개', levelChip: (d: string, l: string) => d + ' 바쁨 정도 ' + l + ', 변경',
  memo: '메모', memoPh: '학원 일정 등', memoClear: '지우기', memoDone: '완료',
  printModeLabel: '보기 형식', weekTotal: (n: number) => '할일 ' + n, printModeAll: '한 장 계획표', printModeTwo: '2주 달력', printModeOne: '1주 달력', printBtn: '인쇄', printSave: 'HTML로 저장', printSaved: 'HTML 파일로 저장했습니다. 파일을 열어 인쇄하세요.', printFail: '파일을 저장하지 못했습니다.',
  legendStudy: '교재·자습서·핸드아웃', legendWork: '문제집', legendRecap: '리캡', legendLevel: '바쁨 정도', examLine: (n: number, names: string) => '시험 ' + n + '일차 ' + names, printNone: '인쇄할 시험이 없습니다.',
  szTip: (n: number, m: number, r: number) => '교재 ' + n + '회, 문제집 ' + m + '회, 리캡 ' + r + '회',
  limitsHint: '날짜별 권장 할일 수',
  newExam: '새 시험', createExam: '시험 만들기', cancel: '취소', del: '삭제', close: '닫기',
  fName: '시험 이름', fStart: '시작일', fEnd: '종료일', fPrep: '준비 시작일', namePh: '예: 2학기 기말고사',
  examDeleteConfirm: '이 시험과 배치한 할일이 모두 삭제됩니다. 삭제한 시험은 복구할 수 없습니다.',
  examSchedule: '일차별 시험 과목', undated: '날짜 미정', addSub: '과목 추가', addSubPh: '과목 (쉼표로 여러 개)', addSubDone: '추가', addedN: (a: number, d: number) => a + '과목을 추가했습니다.' + (d ? ' 이미 있는 ' + d + '과목은 건너뛰었습니다.' : ''), quickAdd: '빠른 추가', prepWeeks: (n: number) => n + '주 전', weekTitle: '요일별 기본 바쁨 정도', weekAuto: '기본', defPlanTitle: '새 과목 기본 분량',
  vault: '보관함', vaultNone: '배치할 회차가 없습니다.', vaultNoSubs: '과목을 먼저 등록해 주세요.', goExam: '시험 일정으로',
  vaultCount: (n: number) => '보관함 ' + n + '개',
  selWeekend: '주말·공휴일', selEmpty: '비어 있는 날', vaultTitle: '배치 대기', selClear: '선택 해제', selCount: (n: number) => n + '일 선택', levelReset: '기본값',
  recapOpen: '직전 리캡 추가', recapFrom: '시험 전', recapDays: '일', recapRun: '추가', recapLeft: (n: number) => '미배치 리캡 ' + n + '개',
  recapNone: '배치할 리캡 회차가 없습니다. 과목에서 리캡 횟수를 정해 주세요.',
  recapDone: (n: number) => '리캡 ' + n + '개를 배치했습니다.',
  recapSkip: (n: number) => '남은 날이 없어 ' + n + '개는 보관함에 남았습니다.',
  overdue: (n: number) => '밀린 할일 ' + n + '개', carry: '오늘로 이월', jumpToday: '오늘',
  carried: (n: number, d: string) => '밀린 할일 ' + n + '개를 ' + d + '로 옮겼습니다.',
  overLimit: (d: string, n: number) => d + ' 할일이 권장 개수(' + n + '개)를 넘었습니다.',
  noteLabel: '메모', notePh: '메모 (학원 등)', holidayOn: '휴일로 표시', holidayOff: '휴일 표시 해제',
  today: '오늘', examDayN: (n: number) => '시험 ' + n + '일차', dayN: (n: number) => n + '일차',
  pickTitle: '날짜 선택', toVault: '보관함으로', moveDate: '날짜 옮기기', done: '완료',
  todayEmpty: '오늘 배치된 할일이 없습니다.', todayOut: (d: string) => '준비 기간은 ' + d + '부터입니다.', goBoard: '준비 계획으로',
  upcoming: '다음 할일', subjects: '과목별 진행', noExam: '시험을 만들면 과목과 할일을 배치할 수 있습니다.',
  subTitle: '과목 정보', subName: '과목명', subColor: '색', subDate: '시험 날짜', subRange: '시험 범위', subComment: '코멘트', subLinks: '자료 링크',
  linkLabel: '이름', linkUrl: '주소', linkAdd: '추가', linkBad: '올바른 주소를 입력해 주세요. (http 또는 https)',
  planTitle: '분량', planN: '교재·자습서·핸드아웃', planM: '문제집', planR: '리캡',
  planSum: (n: number, m: number, r: number, p: number, t: number) => '본 학습 ' + (n + m) + '회, 리캡 ' + r + '회 · 배치 ' + p + '/' + t,
  planCut: (k: number) => '분량을 줄이면 배치한 할일 ' + k + '개가 삭제됩니다.', cut: '줄이기',
  subDel: '이 시험에서 삭제', subDelConfirm: (k: number) => '이 시험에서 과목과 배치한 할일 ' + k + '개가 삭제됩니다.',
  settings: '설정', data: '데이터', limitsTitle: '날짜별 권장 할일 수', recapDefault: '직전 리캡 기본 일수', themeTitle: '화면 색', themes: { auto: '자동', light: '밝게', dark: '어둡게' },
  export: '내보내기', exportFile: 'JSON 파일 저장', exportCopy: 'JSON 복사', copied: '복사했습니다.', copyFail: '복사하지 못했습니다. 파일로 저장해 주세요.',
  exported: '파일로 내보냈습니다.', exportFail: '파일을 저장하지 못했습니다. JSON 복사를 이용해 주세요.',
  import: '가져오기', importFile: '파일 열기', importPaste: '내보낸 JSON을 붙여넣거나 파일을 놓으세요', importRun: '가져오기', dropOpen: '놓아서 열기',
  importBad: '가져올 수 없는 파일입니다. 이 앱에서 내보낸 JSON 파일을 선택해 주세요.',
  importRes: (a: number, d: number, s: number) => '추가 ' + a + ', 중복 ' + d + ', 제외 ' + s, importMulti: '한 번에 파일 하나만 가져옵니다. 나머지는 제외했습니다.',
  syncLocal: '이 브라우저에만 저장됨', syncLocalTip: '브라우저 데이터를 지우면 사라집니다. 데이터에서 내보내기로 백업할 수 있습니다.',
  syncing: '동기화 중…', synced: '동기화됨',
  syncErr: '동기화하지 못했습니다', syncErrTip: '변경 내용은 이 브라우저에 저장됩니다. 연결되면 다시 시도합니다.',
  syncQuota: '서버에 저장하지 못했습니다', syncQuotaTip: '용량을 넘었습니다. 지난 시험을 삭제하면 줄일 수 있습니다. 변경 내용은 이 브라우저에 저장됩니다.',
  saveFail: '이 브라우저에 저장하지 못했습니다', saveFailTip: '저장 공간이 부족하거나 막혀 있습니다. 데이터에서 내보내기로 백업해 주세요.',
  remainDays: (n: number) => (n > 0 ? '시험 시작까지 ' + n + '일' : n === 0 ? '오늘 시험 시작' : ''), duringExam: '시험 기간', afterExam: '시험이 끝났습니다.',
};
export const WD: readonly string[] = ['일', '월', '화', '수', '목', '금', '토'];
export const fmtMD = (iso: string): string => +iso.slice(5, 7) + '/' + +iso.slice(8, 10);
export const fmtFull = (iso: string): string => fmtMD(iso) + '(' + WD[weekday(iso)] + ')';
export type KindName = "교재" | "문제집" | "리캡";
export const KIND_ICON: Readonly<Record<KindName, "book-open" | "pen-line" | "rotate-ccw">> = { '교재': 'book-open', '문제집': 'pen-line', '리캡': 'rotate-ccw' };
export const levelLabel = (k: LevelKey | string): string => (LEVELS.find((l) => l.key === k)?.label ?? "");

/* ---------- 새 문구(이 앱 재구성에서 추가) ---------- */
export const T2 = {
  appTitle: '시험 공부 플래너',
  loading: '저장된 데이터를 불러오는 중입니다…',
  topBar: '상단 메뉴', examSelect: '시험 선택', tabsLabel: '화면 선택', openSync: '동기화 상태 열기', openSettings: '설정', openData: '데이터',
  /* 동기화 상태 배지(sync.status.phase 별 짧은 문구) */
  syncPhase: {
    off: '이 브라우저에만 저장됨', idle: '동기화됨', pending: '동기화 대기 중', syncing: '동기화 중…',
    offline: '오프라인', error: '동기화 오류', paused: '동기화 멈춤',
  },
  syncBadgeLabel: (text: string) => '동기화 상태: ' + text + '. 눌러서 자세히 보기',
  /* 저장 상태 */
  saveState: { idle: '', dirty: '저장 대기 중', saving: '저장 중…', saved: '저장됨', blocked: '저장이 멈춰 있습니다', failed: '저장하지 못했습니다' },
  saveWhereMemory: '저장 위치: 이 창의 메모리(창을 닫으면 사라집니다)',
  saveFailedTitle: '이 브라우저에 저장하지 못했습니다', saveFailedAction: '데이터 열기',
  saveFailedHint: '변경 내용은 이 창에만 있습니다. 데이터에서 JSON 파일로 내보내 보관해 주세요.',
  /* 불러오기 문제 */
  loadFailedTitle: '저장된 데이터를 불러오지 못했습니다', loadCorruptTitle: '저장된 데이터를 읽을 수 없습니다',
  loadGuardNote: '저장된 데이터를 덮어쓰지 않도록 저장을 멈췄습니다.',
  retry: '다시 시도', allowSave: '그래도 저장', allowSaveWarn: '저장된 데이터가 있다면 지금 상태로 덮어씁니다. 계속할까요?',
  allowSaveConfirm: '덮어쓰고 저장',
  exportCorrupt: '손상된 원본 내보내기', exportCorruptFail: '손상된 원본을 내보내지 못했습니다.', exportCorruptDone: '손상된 원본을 파일로 내보냈습니다.',
  corruptBackupKept: '원본은 이 브라우저에 따로 보관했습니다.', corruptBackupMissing: '원본을 따로 보관하지 못했습니다.',
  retryStillFailed: '아직 불러오지 못했습니다.', retryOk: '저장된 데이터를 불러왔습니다.',
  syncHeld: '저장된 데이터를 확인하기 전에는 동기화를 시작하지 않습니다.',
  droppedExams: (n: number) => '읽을 수 없는 시험 ' + n + '개를 제외하고 불러왔습니다. 다음 저장 때 완전히 사라집니다.',
  dismiss: '닫기',
  /* 다른 탭의 변경 */
  externalTitle: '다른 탭의 변경을 불러올까요?',
  externalBody: '다른 탭에서 더 새로운 내용이 저장되었습니다. 이 탭에는 아직 저장되지 않은 변경이 있습니다.',
  externalLoad: '다른 탭 내용 불러오기', externalKeep: '이 탭 내용 유지',
  externalLoaded: '다른 탭의 변경을 불러왔습니다.', externalKept: '이 탭의 내용을 유지합니다.',
  /* 되돌리기·다시 실행 */
  undo: '되돌리기', redo: '다시 실행',
  undone: (label: string) => '되돌렸습니다: ' + label, redone: (label: string) => '다시 실행했습니다: ' + label,
  nothingToUndo: '되돌릴 변경이 없습니다.', nothingToRedo: '다시 실행할 변경이 없습니다.',
  undoStale: '그 뒤에 다른 변경이 있어 이 변경만 되돌릴 수 없습니다. 위쪽 되돌리기(Ctrl+Z)로 차례대로 되돌려 주세요.',
  defaultLabel: '변경',
  /* 일괄 선택 막대 */
  bulkCount: (n: number) => n + '칸 선택', bulkClear: '선택 해제', bulkBar: '선택한 칸 일괄 변경',
  noExamTitle: '아직 시험이 없습니다',
} as const;

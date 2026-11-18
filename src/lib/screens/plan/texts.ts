// 준비 계획 화면의 새 문구. 기존 문구는 src/lib/app/strings.ts 의 S, 공용 컴포넌트 문구는 shared/texts.ts 의 T 를 쓴다.
export const P = {
  /* 달력 격자 */
  gridLabel: '준비 기간 달력',
  padCell: '준비 기간 밖의 빈 칸',
  gridKeys: '방향키로 날짜 이동, Enter 로 상세 열기, Space 로 선택, Ctrl+클릭·Shift+클릭으로 여러 날 선택',
  /** 접근성 이름에 쓰는 날짜: '6월 3일' */
  koDate: (month: number, day: number) => month + '월 ' + day + '일',
  selectDay: (koDate: string) => koDate + ' 선택',
  cellToday: '오늘',
  cellExamDay: (n: number) => '시험 ' + n + '일차',
  cellTasks: (total: number, done: number) => (total > 0 ? '할일 ' + total + '개 중 ' + done + '개 완료' : '할일 없음'),
  cellLevel: (label: string) => '바쁨 ' + label,
  cellOver: (limit: number) => '권장 ' + limit + '개 초과',
  cellNote: '메모 있음',
  cellNoteIcon: '메모',

  /* 날짜 상세 */
  detailLabel: '날짜 상세',
  sheetLabel: (date: string) => date + ' 상세',

  /* 상단 도구줄·배너 */
  toolbarLabel: '준비 계획 도구',
  vaultToggle: '보관함',
  vaultToggleLabel: (n: number) => '보관함, 미배치 할일 ' + n + '개',
  recapToggle: '직전 리캡',

  /* 직전 리캡 패널 */
  recapPanel: '직전 리캡 추가',
  recapHint: '과목별 미배치 리캡을 시험 전 며칠 안에 고르게 배치합니다.',
  recapDaysLabel: '시험 전 일수(1~30)',
  recapEmpty: '배치할 리캡이 없습니다. 과목에서 리캡 횟수를 정하면 여기에서 배치할 수 있습니다.',
  recapResult: (placed: number, skipped: number) =>
    '리캡 ' + placed + '개를 배치했습니다.' + (skipped > 0 ? ' 남은 날이 없어 ' + skipped + '개는 보관함에 남았습니다.' : ''),
  mutRecap: '직전 리캡 추가',

  /* 이월 */
  mutCarry: '밀린 할일 이월',

  /* 보관함 */
  vaultLabel: '보관함(미배치 할일)',
  vaultNoneHint: '모든 회차가 날짜에 배치되어 있습니다. 과목 분량을 늘리거나 할일을 보관함으로 옮기면 여기에 나타납니다.',
  vaultDropHint: '여기에 놓으면 날짜가 비워집니다.',
  vaultGroupLabel: (name: string, n: number) => name + ' 미배치 ' + n + '개',

  /* 일괄 작업 막대 */
  bulkLabel: '선택한 날 일괄 작업',
  bulkLevelGroup: '바쁨 정도',
  bulkLevelBtn: (label: string, limit: number, n: number) => n + '일의 바쁨 정도를 ' + label + ' 단계로 바꾸기, 권장 ' + limit + '개',
  bulkResetBtn: (n: number) => n + '일의 바쁨 정도를 기본값으로',
  bulkMore: '더 보기',
  bulkMoreLabel: '선택 도구 더 보기',
  selectWeekend: '주말·공휴일 선택',
  selectEmpty: '비어 있는 날 선택',
  selectAll: '전체 선택',
  mutBulkLevel: '바쁨 정도 일괄 변경',
  bulkLevelDone: (n: number, label: string) => n + '일의 바쁨 정도를 ' + label + ' 단계로 바꿨습니다.',
  bulkResetDone: (n: number) => n + '일의 바쁨 정도를 기본값으로 되돌렸습니다.',
  bulkNoChange: '선택한 날의 바쁨 정도는 이미 그 값입니다.',
  selectedAnnounce: (n: number) => (n > 0 ? n + '일 선택됨' : '선택을 모두 풀었습니다'),
  selAddedNone: '선택할 날이 없습니다.',

  /* 빈 상태 */
  noPrepTitle: '준비 기간이 없습니다',
  noPrepBody: '시험 일정에서 준비 시작일과 시험 기간을 확인해 주세요. 준비 기간에 날짜가 있어야 할일을 배치할 수 있습니다.',

  /* 끌기·이동 */
  dragMove: (date: string) => date + '로 이동',
  dragMoveOver: (date: string) => date + '로 이동 · 권장 개수 초과',
  dragStay: '이미 이 날짜에 있습니다',
  dragVault: '보관함으로',
  dragVaultStay: '이미 보관함에 있습니다',
  dragBack: '놓으면 원래 자리로 돌아갑니다',
  movedTo: (text: string, date: string) => text + ' 할일을 ' + date + '로 옮겼습니다.',
  movedToVault: (text: string) => text + ' 할일을 보관함으로 옮겼습니다.',
  moveKeys: 'Alt+방향키로 날짜 이동',
} as const;

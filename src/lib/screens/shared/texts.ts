// 공용 컴포넌트의 새 문구. legacy 문구는 src/lib/app/strings.ts 의 S, 앱 공통 새 문구는 T2 를 쓴다.
export const T = {
  /* 게이지·진행률 */
  gaugeCount: (count: number, limit: number) => count + '/' + limit,
  gaugeLabel: (count: number, limit: number, over: boolean) => '할일 ' + count + '개, 권장 ' + limit + '개' + (over ? ', 권장 개수 초과' : ''),
  meterLabel: (levelLabel: string, step: number) => '바쁨 정도 ' + levelLabel + ', 5단계 중 ' + step + '단계',
  overShort: '초과',
  progressLabel: '진행률',
  progressNums: (done: number, total: number) => done + '/' + total,
  progressText: (label: string, done: number, total: number, pct: number) => label + ' ' + done + '개 완료, 전체 ' + total + '개 중 ' + pct + '%',

  /* 할일 칩 */
  chipDone: '완료',
  chipNotDone: '미완료',
  chipA11y: (name: string, kind: string, seq: number, done: boolean) => name + ' ' + kind + ' ' + seq + '회 · ' + (done ? '완료' : '미완료'),
  chipMoveLabel: (text: string) => text + ' 날짜 옮기기',
  chipMoveHint: 'Shift+F10 으로도 열 수 있습니다',
  chipDragHandle: (text: string) => text + ' 끌어서 옮기기',
  chipUnplaced: '날짜 없음',

  /* 날짜 선택 시트 */
  pickMany: (n: number) => '할일 ' + n + '개를 옮길 날짜',
  pickCurrent: '현재',
  pickVaultHere: '이미 보관함에 있음',
  pickVaultDesc: '날짜를 비우고 배치 대기로 돌려놓습니다',
  pickOverHint: '권장 개수 초과',
  pickEmptyRange: '준비 기간이 없습니다.',
  pickOptionLabel: (date: string, levelLabel: string, count: number, limit: number, extra: string[]) =>
    [date, levelLabel + ' ' + count + '개 중 권장 ' + limit + '개'].concat(extra).join(', '),
  pickVaultOptionLabel: (extra: string[]) => ['보관함으로'].concat(extra).join(', '),
  pickListLabel: '날짜 목록',
  pickKeyHint: '↑↓ 이동 · Enter 선택',

  /* 바쁨 정도·메모 팝오버 */
  levelOptionLabel: (label: string, limit: number) => label + ', 권장 ' + limit + '개',
  levelKeyHint: '↑↓ 이동 · Enter 선택',
  switchOn: '켜짐',
  switchOff: '꺼짐',
  memoHint: 'Enter 저장 · Shift+Enter 줄바꿈',
  memoCloseHint: 'Esc·Tab·바깥 클릭: 저장하고 닫기',
  memoCount: (n: number, max: number) => n + '/' + max,
  memoButtonLabel: (date: string, note: string) => date + ' 메모' + (note ? ': ' + note : ''),
  memoAdd: '메모 추가',
  memoTitle: (date: string) => date + ' 메모',

  /* 날짜 카드 */
  dayEmpty: '이 날 배치된 할일이 없습니다. 날짜 옮기기로 넣거나 끌어 놓을 수 있습니다.',
  dayDoneSummary: (done: number, total: number) => '완료 ' + done + '/' + total,
  dayUnfinishedPast: (k: number) => '끝내지 못한 할일 ' + k + '개',
  dayAllDonePast: '모두 끝냈습니다',
  noName: '(이름 없음)',
  dayListLabel: (date: string) => date + ' 할일 목록',

  /* 되돌리기 이름·알림 */
  mutLevel: '바쁨 정도 변경',
  mutNote: '메모 변경',
  mutDone: '완료 변경',
  mutMove: '할일 이동',
  movedMany: (n: number) => '할일 ' + n + '개를 옮겼습니다.',
  movedToVault: (n: number) => '할일 ' + n + '개를 보관함으로 돌려놓았습니다.',
} as const;

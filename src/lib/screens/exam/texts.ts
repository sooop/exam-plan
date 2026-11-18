// 시험 일정 화면(시험 만들기·시험 정보·날짜별 과목 배치·과목 정보 서랍)의 새 문구.
// 공용 문구는 src/lib/app/strings.ts 의 S·T2 를 쓰고, 이 화면에서만 새로 필요한 것만 여기에 둔다.
export const COMMON_SUBJECTS: readonly string[] = ['국어', '수학', '영어', '과학', '사회', '역사', '도덕', '기술·가정', '한문', '정보', '음악', '미술', '체육'];

/* PALETTE(core/constants) 8색의 이름. 스위치의 aria-label 은 16진 값이 아니라 이 이름을 쓴다 */
export const COLOR_NAMES: Readonly<Record<string, string>> = {
  '#C4705A': '벽돌색', '#D9A441': '황금색', '#7E9F6B': '풀색', '#5F9EA0': '청록색',
  '#6E8FBF': '파란색', '#9A7DB8': '보라색', '#C46A8E': '분홍색', '#8A8578': '회색',
};

export const X = {
  /* 되돌리기 이력에 남는 변경 이름(되돌리면 '되돌렸습니다: 이름' 으로 보인다) */
  lbl: {
    create: '시험 만들기', delExam: '시험 삭제', addSub: '과목 추가', delSub: '시험에서 과목 삭제', moveSub: '과목 시험 날짜 이동',
    rename: '과목명 변경', color: '과목 색 변경', range: '시험 범위 변경', comment: '코멘트 변경', linkAdd: '링크 추가', linkDel: '링크 삭제', plan: '분량 변경',
  },
  /* 시험 만들기 */
  createFail: '시험을 만들지 못했습니다',
  startFirst: '먼저 시작일을 입력해 주세요.',
  /* 시험 정보 */
  infoLabel: '시험 정보',
  editFail: '시험 정보를 바꾸지 못했습니다',
  editLabel: '시험 정보 변경',
  editHint: 'Enter 로 적용하고 Esc 로 입력을 되돌립니다. 입력칸을 벗어나도 적용됩니다.',
  apply: '적용',
  revert: '입력 취소',
  applyDates: '날짜 바꾸기',
  edited: '시험 정보를 바꿨습니다.',
  deleteExam: '시험 삭제',
  examDeleteConfirm: (name: string, subs: number, tasks: number) =>
    `'${name}' 시험을 삭제할까요? 과목 ${subs}개와 할일 ${tasks}개가 함께 삭제됩니다. 삭제한 직후에는 되돌리기로 복구할 수 있습니다.`,
  examDeleted: (name: string) => `'${name}' 시험을 삭제했습니다.`,
  impactTasksDays: (t: number, d: number, n: number) => `할일 ${t}개가 미배치로 바뀌고 날짜 설정 ${d}개(메모 ${n}개)가 삭제됩니다`,
  impactTasks: (t: number) => `할일 ${t}개가 미배치로 바뀝니다`,
  impactDays: (d: number, n: number) => `날짜 설정 ${d}개(메모 ${n}개)가 삭제됩니다`,
  impactSubsJoin: (head: string, s: number) => `${head}. 과목 시험 날짜 ${s}개는 날짜 미정으로 바뀝니다`,
  impactSubsOnly: (s: number) => `과목 시험 날짜 ${s}개가 날짜 미정으로 바뀝니다`,
  /* 날짜별 과목 배치 */
  scheduleHint: '과목 칩을 끌어 다른 날짜로 옮길 수 있습니다. 키보드는 칩에서 Alt+↑/↓ 로 앞뒤 날짜로 옮깁니다.',
  addSubFail: '과목을 추가하지 못했습니다',
  addSubLabel: (row: string) => `${row} 과목 추가`,
  addSubSubmit: (row: string) => `${row} 과목 추가하기`,
  quickAddLabel: (name: string) => `${name} 과목을 날짜 미정으로 추가`,
  chipLabel: (name: string, row: string) => `${name}, ${row}. 과목 정보 열기`,
  szLabel: (n: number, m: number, r: number) => `교재 ${n}회, 문제집 ${m}회, 리캡 ${r}회`,
  moved: (name: string, row: string) => `${name} 과목의 시험 날짜를 바꿨습니다: ${row}`,
  moveCaption: (rowWithRo: string) => `${rowWithRo} 이동`,
  moveStay: '같은 날짜',
  moveBack: '놓을 수 없는 곳: 원래 자리로 돌아갑니다',
  /* 과목 정보 서랍 */
  globalNote: '과목 이름과 색은 보관함 전체에서 같이 쓰므로 다른 시험에도 적용됩니다.',
  renameFail: '과목명을 바꾸지 못했습니다',
  customColor: '사용자 색',
  linkFail: '링크를 추가하지 못했습니다',
  linkDelete: (name: string) => `${name} 링크 삭제`,
  linkDeleted: '링크를 삭제했습니다.',
  planCutDone: (k: number) => `분량을 줄여 할일 ${k}개를 삭제했습니다.`,
  planInput: (label: string) => `${label} 횟수 (0부터 30)`,
  subDeleted: (name: string) => `'${name}' 과목을 이 시험에서 삭제했습니다.`,
  subDeleteConfirm: (name: string, placed: number, total: number) =>
    `'${name}' 과목을 이 시험에서 삭제할까요? 과목과 할일 ${total}개(배치한 것 ${placed}개)가 삭제됩니다.`,
  moveFail: '시험 날짜를 바꾸지 못했습니다',
  moveBadDate: '선택한 날짜가 시험 기간에 없습니다',
  drawerHint: '입력칸을 벗어나거나 Enter 를 누르면 저장됩니다.',
  linkDiscard: '입력한 링크를 추가하지 않고 닫을까요?',
  textCount: (n: number, max: number) => `${n}/${max}자`,
  /* 닫을 때 적용하지 못한 입력 */
  unsavedLink: '추가하지 않은 링크',
  unsavedPlan: '확인 대기 중인 분량 줄이기',
  unsavedName: '바꾸지 못한 과목명',
  unsavedDiscard: (parts: string[]) => `적용하지 않은 입력이 있습니다: ${parts.join(', ')}. 버리고 닫을까요?`,
  planNotApplied: (k: number) => `분량 줄이기를 적용하지 않았습니다: 할일 ${k}개가 삭제되어 확인이 필요했습니다.`,
} as const;

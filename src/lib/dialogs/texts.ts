// 설정·데이터 서랍의 새 문구. 기존 문구는 src/lib/app/strings.ts 의 S·T2 를 쓰고, 이 파일에는 서랍에서 새로 필요한 것만 둔다.
// 오류 문구는 '무엇을 하지 못했는지: 이유' 형식이다. 이유 끝에는 마침표를 붙이지 않는다.

export const D = {
  /* 설정 서랍 */
  settingLabel: '설정 변경',
  weekToExam: (name: string) => '선택한 시험 "' + name + '"의 요일별 기본값을 바꿉니다.',
  weekToNew: '시험이 선택되어 있지 않아 새 시험에 쓸 요일별 기본값을 바꿉니다.',
  limitsRange: (lo: number, hi: number) => lo + '~' + hi + ' 사이의 숫자',
  numEmpty: (label: string, current: number) => label + ': 숫자를 입력해 주세요. 이전 값 ' + current + '을(를) 유지했습니다',
  numClamped: (label: string, lo: number, hi: number, value: number) => label + ': ' + lo + '~' + hi + ' 사이로 맞춰 ' + value + '(으)로 적용했습니다',
  themeHint: '이 기기에만 저장합니다.',
  animLabel: '화면 움직임',
  animHint: '켜면 화면이 나타나고 사라질 때 움직입니다. 끄면 즉시 바뀝니다. 이 기기에만 저장합니다.',
  animOn: '켜짐',
  animOff: '꺼짐',

  /* 데이터 서랍: 저장 실패 안내와 변경 이력 구역 */
  historyTitle: '변경 이력',
  saveNow: '지금 파일로 저장',
  saveAlertHead: '저장하지 못한 변경이 있습니다',
  saveAlertMemory: '저장 위치: 이 창의 메모리(창을 닫으면 사라집니다)',

  /* 데이터 서랍: 내보내기 */
  exportNote: '내보낸 파일은 이 앱의 가져오기로 다시 읽을 수 있습니다.',
  exportFailed: '백업 파일을 만들지 못했습니다: 브라우저가 내려받기를 끝내지 못했습니다',
  exportedTo: (file: string) => file + ' 파일로 내보냈습니다',
  copyFailed: 'JSON 을 복사하지 못했습니다: 브라우저가 클립보드 쓰기를 막았습니다. 파일로 저장해 주세요',
  copiedFlash: 'JSON 을 복사했습니다',

  /* 데이터 서랍: 가져오기 */
  importIntro: '내보낸 JSON 을 열거나 놓거나 붙여넣으면 지금 데이터에 합칩니다. 같은 시험은 덮어쓰지 않고 건너뜁니다.',
  dropHint: '여기에 JSON 파일을 놓으세요. 한 번에 파일 하나만, 20MB 이하입니다.',
  dropActive: '놓아서 열기',
  openFile: '파일 열기…',
  readingFile: '파일을 읽는 중…',
  importLabel: '데이터 가져오기',
  importToast: '데이터를 가져왔습니다',
  excludedHint: '제외한 시험은 날짜 범위(준비 기간 120일 이하)나 이름이 맞지 않거나, 파일 안에 같은 시험이 두 번 들어 있는 경우입니다. 제외한 시험 안의 과목·할일은 시험 한 건으로만 셉니다. 남은 시험 안에서 맞지 않는 과목 배치·할일·과목 보관함 항목은 \'빠진 항목\'으로 따로 셉니다. 링크, 날짜별 설정(단계·메모·휴일), 요일 기본값은 세지 않아 맞지 않으면 조용히 빠질 수 있습니다.',
  /** 가져오기 중 시험은 남았지만 안의 항목이 빠진 경우의 안내. 빠진 것이 없으면 빈 문자열 */
  skippedNote: (subs: number, tasks: number, library: number): string => {
    const parts: string[] = [];
    if (subs > 0) parts.push('과목 배치 ' + subs + '개');
    if (tasks > 0) parts.push('할일 ' + tasks + '개');
    if (library > 0) parts.push('과목 보관함 ' + library + '개');
    return parts.length ? '형식이 맞지 않거나 중복이라 빠진 항목: ' + parts.join(', ') : '';
  },

  /* 가져오기 실패: 앞부분(무엇을 하지 못했는지)과 이유 */
  failPrefixPaste: '붙여넣은 내용을 가져오지 못했습니다: ',
  failPrefixFile: '파일을 가져오지 못했습니다: ',
  reason: {
    empty: '내용이 비어 있습니다',
    json: 'JSON 형식이 맞지 않습니다. 내보낸 파일 전체를 가져왔는지 확인해 주세요',
    notObject: 'JSON 의 가장 바깥이 객체가 아닙니다',
    appMissing: '이 앱에서 내보낸 파일이 아닙니다(앱 식별자가 없습니다)',
    appOther: '이 앱에서 내보낸 파일이 아닙니다(앱 식별자가 다릅니다)',
    version: (found: number) => '더 새 버전의 앱에서 만든 파일입니다(파일 버전 ' + found + '). 이 앱은 버전 1 까지 읽습니다',
    stateVersion: (found: number) => '시험 데이터 버전 ' + found + '은(는) 이 앱이 읽을 수 없습니다',
    format: '시험 데이터의 구조가 맞지 않습니다',
    size: '파일이 20MB 를 넘습니다',
    read: '파일 내용을 읽지 못했습니다',
    unknown: '알 수 없는 이유로 합치지 못했습니다',
  },
} as const;

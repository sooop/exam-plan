// 데이터 무결성 방어(2026-11 감사)로 생긴 화면 문구. strings.ts(T2)는 그대로 두고 여기에 둔다.
// Shell.svelte 가 배너·토스트에 쓴다: app.degraded · app.syncGate · app.hasEditsWhileFailed · app.droppedDetail (연결 방법은 app.svelte.ts 위쪽 주석).

export const T3 = {
  /* IndexedDB 를 읽지 못하고 localStorage 사본으로 열었을 때(app.degraded) */
  degradedTitle: '저장소를 읽지 못해 임시 사본으로 열었습니다',
  degradedBody: '이 브라우저의 기본 저장소(IndexedDB)를 읽지 못했습니다. 낡은 사본일 수 있어 이 창의 편집은 임시 저장소에만 저장하고 동기화도 시작하지 않습니다.',
  degradedRetry: '저장소 다시 읽기',
  degradedStill: '아직 저장소를 읽지 못했습니다.',
  degradedOk: '저장소를 다시 읽었습니다.',
  /* 로컬이 비었는데 서버에 항목이 있을 때(app.syncGate) */
  gateTitle: '이 기기에 데이터가 없습니다',
  gateBody: (n: number) => '이 기기에는 데이터가 없는데 서버에 ' + n + '개 항목이 있습니다. 그대로 동기화하면 서버의 항목이 지워질 수 있어 동기화를 멈췄습니다.',
  gateServerCopy: '서버 사본 받기',
  gateKeepEmpty: '비어 있는 상태로 두기',
  gateServerCopyFail: '서버 사본을 받지 못했습니다: 이 기기의 동기화 정보를 지우지 못했습니다',
  gateKeepEmptyDone:'동기화를 일시정지했습니다. 서버 데이터는 그대로입니다.',
  /* 다른 탭에서 바뀐 내용을 먼저 확인해야 해서 동기화를 미룰 때(엔진이 보여 주는 오류 문구) */
  syncDeferredExternal: '다른 탭에서 바뀐 내용을 먼저 확인해야 해서 이번 동기화를 미뤘습니다.',
  /* 다시 시도 */
  retryPreserveTitle: '이 편집을 이력에 보존하고 저장본을 불러옵니다',
  retryPreserveBody: '저장본을 읽지 못하는 동안 입력한 편집이 있습니다. 불러오면 화면은 저장본으로 바뀌고, 지금 편집은 변경 이력(다시 불러오기 전)에 보존됩니다.',
  retryPreserveConfirm: '보존하고 불러오기',
  retryPreserved: '읽기 실패 중 입력한 편집은 변경 이력에 보존했습니다.',
  /* 이력의 동기화 충돌 설정 */
  settingsLoserLabel: '동기화 전 설정',
  /* 다른 탭 내용을 버릴 때 이력 이름 */
  externalDiscardedLabel: '다른 탭 내용(유지하지 않음)',
  beforeRetryLabel: '다시 불러오기 전',
} as const;

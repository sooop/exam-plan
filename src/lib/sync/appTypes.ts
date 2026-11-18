// 이 앱의 동기화 상수. 코어(엔진·프로토콜)는 sync-kit 패키지에 있다. 어댑터는 이 상수를 가져다 쓴다.

/** 서버의 ALLOWED_APPS 와 같은 값. 한 번 정하면 바꾸지 않는다(바꾸면 같은 키로도 다른 공간이 된다) */
export const APP_ID = 'exam-planner';

/** localStorage 키: 동기화 설정({workerUrl, syncKey, inviteCode?, enabled}). 번들·내보내기·백업에 넣지 않는다 */
export const SYNC_CONFIG_KEY = 'examPlanner.sync';
/** 동기화 메타(커서·항목별 rev)를 두는 IndexedDB 이름 */
export const SYNC_META_DB = 'exam-plan-sync';
/** 탭 락 이름: 같은 브라우저에서 엔진은 한 탭만 */
export const SYNC_LOCK_NAME = 'exam-plan-sync-engine';

/**
 * ItemKind 선택(SyncPlain.kind).
 *  - exam: 'doc'     시험 1개 = 항목 1개. 충돌에서 진 쪽이 preserveLoser 로 기기 로컬 이력에 보존되는 것은 'doc' 뿐이다.
 *  - library: 'snippet'  라이브러리(과목 묶음) 항목 1개 = 항목 1개.
 *  - settings: 'doc'     설정 전체 = 항목 1개(id 'settings'). 충돌에서 진 설정도 preserveLoser 로 이력에 남도록 시험과 같은 'doc' 을 쓴다
 *    (엔진은 kind 'doc' 에만 preserveLoser 를 부른다). 시험과의 구분은 kind 가 아니라 항목 id 로 한다.
 *    옛 버전은 'thread' 로 올렸으므로 받을 때는 둘 다 설정으로 본다(KIND_SETTINGS_LEGACY).
 */
export const KIND_EXAM = 'doc' as const;
export const KIND_LIBRARY = 'snippet' as const;
export const KIND_SETTINGS = 'doc' as const;
export const KIND_SETTINGS_LEGACY = 'thread' as const;

/**
 * 서버 한도 재정의. server/wrangler.toml.example 의 MAX_DAILY_WRITES("3000") 와 같은 값이어야 한다.
 * createSyncEngine({ limits }) 에 넘겨 '한도 근접'(80%) 판정과 전송 늦춤이 3000 건 기준으로 일어나게 하고,
 * 사용량 표시(syncLabels.usageRatio(usage, SYNC_LIMITS))에도 같은 값을 쓴다. 서버 값을 바꾸면 여기도 함께 바꾼다.
 */
export const SYNC_LIMITS = { MAX_DAILY_WRITES: 3000 } as const;

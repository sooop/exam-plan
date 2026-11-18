# 시험 공부 플래너 (exam-plan)

시험 일정에 맞춰 과목별 공부 분량(교재·문제집·리캡)을 날짜에 나눠 배치하는 개인용 플래너입니다. 데이터는 기본적으로 이 기기의 브라우저에 저장되고, 설정하면 동기화 서버를 거쳐 여러 기기가 같은 데이터를 함께 씁니다.

- 기술: TypeScript, Svelte 5, Vite, vitest, svelte-check
- 동기화 엔진과 프로토콜은 별도 저장소 `sync-kit` 에 있고, `package.json` 의 `"sync-kit": "file:../sync-kit"` 로 가져옵니다. 따라서 `../sync-kit` 폴더가 있어야 설치됩니다.
- 이 저장소는 git 저장소가 아닙니다.

## 폴더 구조

| 경로 | 역할 |
|---|---|
| `src/main.ts`, `src/App.svelte`, `src/app.css` | 진입점, 루트 컴포넌트, 디자인 토큰(색·단추·포커스 링) |
| `src/lib/core` | 순수 도메인 로직. 날짜·공휴일·배치 계산(`planner.ts`), 상태 정리·검증과 가져오기 병합(`sanitize.ts`), 타입·상수 |
| `src/lib/storage` | 로컬 저장소. IndexedDB 를 먼저 쓰고, 안 되면 localStorage, 그래도 안 되면 메모리로 폴백(`store.ts`). 화면 설정(`prefs.ts`) |
| `src/lib/sync` | 동기화 어댑터(시험·과목·설정을 sync-kit 항목으로 바꾼다), 동기화 설정과 상태, 기기 식별(`adapter.ts`, `state.svelte.ts`, `device.ts`). `sync/ui` 는 동기화 대화상자와 배지 |
| `src/lib/history` | 변경 이력. 되돌릴 수 있는 스냅샷, 작업 기록, 동기화 충돌에서 진 시험의 보존. IndexedDB `examPlannerHistory` 에 둔다(자세한 정책은 아래 참고) |
| `src/lib/app` | 앱 코어와 셸. 모든 화면이 읽고 바꾸는 `app` 하나(`app.svelte.ts`, `appCore.ts`)와 상단 바·탭·화면 영역을 잡는 셸(`Shell.svelte`) |
| `src/lib/screens` | 화면. `exam`(시험 일정·과목), `plan`(달력·보관함·리캡), `today`(오늘 할일), `print`(인쇄용 보기), `shared`(여러 화면이 쓰는 조각) |
| `src/lib/ui` | 모든 화면이 쓰는 공용 층·토스트·스위치·툴팁 |
| `src/lib/motion` | 애니메이션 길이·이징·스프링 값과 드래그 세션. 값은 이 안의 것만 쓴다 |
| `src/lib/dialogs` | 데이터 서랍과 설정 서랍. 내보내기·가져오기(검사, 병합, 건수 문구), 외관 설정 |
| `server/` | 동기화 서버(Cloudflare Worker + D1). `schema.sql`, `src`, `test`. 배포 설정 파일은 저장소에 올리지 않는다 |
| `docs/` | 문서. `DEPLOY.md`(동기화 서버 배포 안내) |
| `legacy/` | 원본 단일 파일 `exam-plan.html`. 새 구현과 대조하는 기준이다(아래 참고) |
| `tests/` | vitest 시험. `core`(원본 대조 포함), `dialogs`, `history`, `storage`, `sync`, `sync-ui`, `screens`, `ui`, `app`, `smoke.test.ts` |
| `index.html`, `vite.config.ts`, `svelte.config.js`, `tsconfig.json` | 빌드와 타입 설정 |
| `dist-static/`, `dist-single/` | 빌드 산출물(`.gitignore` 에 있다) |

## 명령

| 명령 | 내용 |
|---|---|
| `npm run dev` | 개발 서버(`vite --mode dev`). 개발 서버는 저장소 관리자가 직접 띄우고 끈다. 여기서는 실행 방법만 적는다 |
| `npm run build:static` | 여러 파일로 된 정적 사이트를 `dist-static/` 에 만든다(상대 경로) |
| `npm run build:single` | 파일 하나짜리 HTML `dist-single/exam-plan.html` 을 만든다 |
| `npm run build` | `build:static` 과 `build:single` 을 차례로 실행한다 |
| `npm run check` | `svelte-check` 로 타입과 Svelte 문법을 검사한다(오류·경고 0 이 기준) |
| `npm test` | `vitest run` 으로 전체 시험을 한 번 돌린다 |

## 산출물 위치

- `dist-static/`: 여러 파일로 된 정적 사이트. 웹 서버에 올려 쓴다.
- `dist-single/exam-plan.html`: 스크립트와 스타일을 모두 넣은 HTML 한 개. 파일을 복사해 바로 열 수 있다. 다만 아래 '알려진 한계'를 본다.

## 동기화 설정 요약

- 동기화 설정이 없으면 연결되지 않은 상태입니다. 동기화 대화상자(`src/lib/sync/ui/SyncDialog.svelte`)에서 동기화 서버 주소(`workerUrl`)와 동기화 키(`syncKey`)를 넣어 연결합니다.
- 새 공간을 만들 때만 초대 코드(`inviteCode`)가 필요합니다. 다른 기기는 같은 동기화 키를 입력하고 초대 코드는 생략합니다.
- **동기화 키를 잃으면 데이터를 되찾을 수 없습니다.** 서버는 키를 모릅니다. 키를 아는 사람은 누구나 데이터를 읽고 쓸 수 있으니 남에게 보이지 않게 보관합니다.
- 설정은 localStorage `examPlanner.sync`(`{workerUrl, syncKey, inviteCode?, enabled}`)에만 있습니다. 내보내기 파일과 백업에는 들어가지 않습니다.
- 서버 배포 순서와 주의 사항은 [docs/DEPLOY.md](docs/DEPLOY.md) 를 봅니다.

## 데이터가 저장되는 곳

| 저장소 | 이름 | 내용 |
|---|---|---|
| IndexedDB | `examPlanner` (객체 저장소 `kv`) | 현재 데이터(시험·과목·설정). 저장소 정의는 `src/lib/storage/store.ts` |
| IndexedDB | `examPlannerHistory` (객체 저장소 `snapshots`, `log`) | 변경 이력 스냅샷과 작업 기록. 서버로 올리지 않는다 |
| IndexedDB | `exam-plan-sync` | 동기화 메타(커서, 항목별 판본) |
| localStorage | `examPlanner.state.v1` | IndexedDB 를 쓸 수 없을 때의 현재 데이터 폴백 |
| localStorage | `examPlanner.corrupt.<시각>` | 손상되었거나 일부가 버려진 원본을 보존한 키(접두사 `examPlanner.corrupt.`) |
| localStorage | `examPlanner.ui` | 기기별 화면 설정(탭, 테마, 기기 이름) |
| localStorage | `examPlanner.anim` | 애니메이션 켜짐·꺼짐 |
| localStorage | `examPlanner.sync` | 동기화 설정(위 참고) |
| localStorage | `examPlanner.history.pruneNoticed` | 이력 정리 알림을 이미 보여 줬는지 |

탭 사이 알림은 BroadcastChannel `examPlanner.state` 를 씁니다(저장소가 아니라 채널입니다).

## 변경 이력 정책 상수

이력의 자세한 동작은 [src/lib/history/README.md](src/lib/history/README.md) 에 있고, 값은 `src/lib/history/core.ts` 에 있습니다.

| 상수 | 값 | 의미 |
|---|---|---|
| `AUTO_KEEP_COUNT` | 30 | 자동·큰 변경 전·동기화 전·복원 전 스냅샷의 최대 개수(핀 제외) |
| `AUTO_KEEP_DAYS` | 90 | 같은 종류의 최대 보관 일수. 개수와 기간 중 먼저 오는 한도를 따른다 |
| `AUTO_MERGE_MS` | 2분 | 직전 스냅샷이 자동이고 이 시간 안이면 새로 쌓지 않고 갈아 끼운다 |
| `SYNC_COALESCE_MS` | 30초 | 동기화 전 스냅샷이 이 안에 또 요청되면 앞의 것을 두고 건너뛴다 |
| `LOG_MAX` | 500 | 작업 기록 최대 건수(넘치면 오래된 것부터) |
| `LOG_MERGE_MS` | 10초 | 같은 기기·이름·종류의 기록이 이 간격 안에 이어지면 한 건으로 센다 |
| `LABEL_MAX` | 60 | 스냅샷 이름 글자 수 |
| `LIST_PAGE` | 50 | 목록 첫 표시 개수 |

정리 대상은 자동·큰 변경 전·동기화 전·복원 전 스냅샷 중 핀이 아닌 것뿐입니다. 수동 저장과 충돌에서 진 시험은 사용자가 지울 때까지 남습니다.

## legacy/exam-plan.html

원래 한 파일로 만들어진 앱입니다. 지금의 TypeScript 구현은 이 파일의 로직을 옮긴 것이고, `tests/core` 의 대조 시험은 같은 입력을 원본과 새 구현에 넣어 결과가 같은지 봅니다(`tests/core/legacy-loader.ts` 가 원본의 Planner 부분을 잘라 실행합니다). 그래서 원본은 기준이므로 고치지 않습니다. 앱을 실제로 쓰는 데는 필요하지 않습니다.

## 알려진 한계

- **`file://` 로 단일 HTML 을 열면 동기화가 보장되지 않습니다.** `dist-single/exam-plan.html` 을 탐색기에서 바로 열면 주소가 `file://` 가 되고, 이 경로에서의 동작은 검증하지 않았습니다(sync-kit 의 `README.md` '검증되지 않음' 항목). 동기화를 쓰려면 웹 서버에 올린 주소로 여세요.
- 동기화 서버의 실환경 동작 중 보관 기간(30일) 경과 후 삭제 정리, 재동기화(resync), 브라우저별 이벤트 차이는 검증되지 않았습니다(sync-kit 문서 기준).
- 가져오기의 '제외 N' 은 시험 단위입니다. 시험은 남았지만 안의 과목 배치·할일·과목 보관함 항목이 맞지 않아 빠진 것은 '빠진 항목'으로 따로 적습니다. 링크, 날짜별 설정(단계·메모·휴일), 요일 기본값이 맞지 않아 빠진 것은 세지 않습니다.
- **수정과 삭제가 겹치면 수정이 이깁니다.** 한 기기가 시험을 지우고 다른 기기가 같은 시험을 고쳤으면 순서와 무관하게 고친 쪽이 남아 지운 시험이 되살아납니다(sync-kit 엔진의 규칙이고 서버가 삭제 항목의 본문과 시각을 지우기 때문입니다). 알림은 없습니다.
- **앱 버전이 섞인 기기끼리는 동기화하지 마세요.** 새 버전이 시험에 필드를 추가하면 낡은 버전이 받으면서 그 필드를 떨어뜨리고 되올려 새 버전 기기의 필드도 사라질 수 있습니다. 모든 기기를 함께 갱신하세요(sync-kit ADAPTER-GUIDE 3번).

# exam-planner 동기화 서버 배포 안내

이 문서는 `server/` 폴더의 Worker 와 D1 데이터베이스를 exam-planner 전용으로 배포하는 순서입니다.
근거는 sync-kit 저장소의 `server/README.md`, `docs/OPERATIONS.md`, `docs/PROTOCOL.md` 입니다.
명령은 그 문서와 같고, `wrangler` 버전만 고정했습니다(1절 참고).

> 이 문서의 명령은 아직 한 번도 실행하지 않았습니다. 실행해서 확인한 것은 없습니다. 근거 문서에 없는 명령이나 실행으로 확인하지 못한 항목은 "미확인"으로 표시합니다.

## 0. 먼저 읽을 경고

- **동기화 키를 잃으면 복구할 수 없습니다.** 서버는 키를 모르고, 키 없이는 데이터를 풀 수 없습니다. 키를 아는 사람은 누구나 데이터를 읽고 쓸 수 있으니 남에게 보이지 않게 보관합니다.
- **초대 코드(`INVITE_CODE`)** 는 새 공간을 만들 때만 필요합니다. 정한 값을 따로 적어 둡니다.
- **공간은 지울 수 없습니다.** 서버 코드(`server/src/handler.ts`)에는 공간을 지우는 경로가 없습니다. 새 동기화 키로 "새로 시작"할 때마다 공간이 하나씩 영구히 쓰입니다. `MAX_SPACES` 는 5 이므로 시험용 키를 여러 번 만들면 5개를 금방 채우고, 그 뒤로는 새 공간이 403 으로 거부됩니다. 처음 한 번만 "새로 시작"을 쓰고, 다른 기기는 "다른 기기의 키로 연결"을 씁니다.
- **설정 파일을 저장소에 올리지 않습니다.** `server/wrangler.toml` 과 `.dev.vars` 는 `.gitignore` 에 있습니다. `INVITE_CODE` 는 `wrangler.toml` 에 쓰지 않고 secret 으로만 설정합니다.

## 1. 준비물과 wrangler 버전

- Cloudflare 무료 계정: https://dash.cloudflare.com/sign-up
- Node.js LTS. 터미널에서 `node -v` 를 실행해 버전이 나오면 설치된 것입니다.
- **wrangler 버전: `npx wrangler@4`** (모든 명령에서 `npx wrangler` 대신 씀)
  - 근거: sync-kit 저장소 루트 `package.json` 의 `"wrangler": "^4.163.0"` 이므로 메이저 버전은 4 입니다. sync-kit 잠금 파일(`package-lock.json`)에는 4.164.0 이 적혀 있습니다.
  - 이 프로젝트(`exam-plan`)의 `package.json` 에는 wrangler 가 없습니다. 그래서 `npx wrangler@4` 는 처음 실행할 때 npm 에서 내려받습니다. 이 방식으로 실행해 본 적은 없습니다(미확인).
  - sync-kit 문서의 `npx --no-install wrangler --version` 확인은 sync-kit 루트 `npm install` 이 있을 때만 맞는 명령이라 이 문서에서는 쓰지 않습니다.
  - **Windows 에서 `npx wrangler` 가 "'wrangler'은(는) 내부 또는 외부 명령... 이 아닙니다" 로 실패하면**(`npx wrangler@4` 도 같은 증상이 확인됐습니다): 이미 설치된 sync-kit 의 wrangler 를 절대 경로로 부릅니다. `D:\Projects\sync-kit\node_modules\.bin\wrangler.cmd --version` 이 `4.164.0` 을 출력합니다(확인됨). 아래 모든 명령의 `npx wrangler@4` 를 이 경로로 바꿔 `server` 폴더에서 실행하면 됩니다. 매번 길게 치기 싫으면 같은 터미널에서 `doskey wr=D:\Projects\sync-kit\node_modules\.bin\wrangler.cmd $*` 를 한 번 실행하고 `wr login`, `wr d1 create exam-plan-db` 처럼 씁니다(PowerShell 이면 `Set-Alias wr D:\Projects\sync-kit\node_modules\.bin\wrangler.cmd`).

## 2. 배포 순서

모든 명령은 `server` 폴더에서 실행합니다.

### 2-1. 서버 폴더로 이동

PowerShell:

```
cd D:\Projects\exam-plan\server
```

Git Bash:

```
cd /d/Projects/exam-plan/server
```

확인: 폴더에 `README.md`, `schema.sql`, `src`, `test`, `tsconfig.json`, `wrangler.toml.example` 이 보입니다.

### 2-2. wrangler 버전 확인

```
npx wrangler@4 --version
```

미확인: sync-kit 문서의 확인 명령(`npx --no-install wrangler --version`)을 버전 고정 형태로 바꾼 것입니다. 출력되는 버전이 4.x 인지 확인합니다.

### 2-3. Cloudflare 로그인

```
npx wrangler@4 login
```

브라우저가 열리면 Cloudflare 계정으로 로그인하고 권한 요청을 허용합니다.

확인:

```
npx wrangler@4 whoami
```

본인 계정 이메일이 표시됩니다.

### 2-4. 설정 파일 만들기

견본 `wrangler.toml.example` 을 복사해 `wrangler.toml` 을 만듭니다.

```
cp wrangler.toml.example wrangler.toml
```

PowerShell 에서도 `cp` 는 복사 명령으로 동작합니다.

`wrangler.toml` 을 편집기로 열고 다음 한 곳만 바꿉니다.

- `database_name = "<db-name>"` 의 따옴표 안을 `exam-plan-db` 로 바꿉니다. 2-5 의 `d1 create` 에도 같은 이름을 씁니다.

이미 채워진 값(확인만 합니다):

- `name = "exam-plan-sync"` (Worker 이름. 배포 주소에 들어갑니다)
- `ALLOWED_APPS = "exam-planner"` (앱 식별자. 앱이 보내는 `X-App-Id` 와 같아야 합니다)
- 한도 값(`MAX_SPACES = "5"`, `MAX_DAILY_WRITES = "3000"` 등). 이유는 `wrangler.toml` 의 한국어 주석에 있습니다.

### 2-5. 데이터베이스 만들기

```
npx wrangler@4 d1 create exam-plan-db
```

출력에 `database_id` 가 나옵니다(`xxxxxxxx-xxxx-…` 형태의 값).

1. `wrangler.toml` 을 엽니다.
2. `database_id = "<wrangler d1 create 출력값>"` 줄의 따옴표 안을 출력된 `database_id` 로 바꿉니다.

```toml
database_id = "여기에 출력된 값"
```

명령이 "설정 파일에 바인딩을 추가할까요?"라고 물으면 `n` 을 입력합니다. 값은 위 방법으로 직접 바꿉니다. 질문 문구와 동작은 Wrangler 버전에 따라 다를 수 있으니, 화면이 다르면 https://developers.cloudflare.com/d1/get-started/ 를 확인합니다.

확인: `wrangler.toml` 의 값에 `<` 나 `>` 가 남아 있지 않습니다. 편집기에서 `<` 를 검색해 결과가 없는지 봅니다.

### 2-6. (선택) 내 컴퓨터에서 먼저 시험

건너뛰어도 됩니다.

```
npx wrangler@4 d1 execute exam-plan-db --local --file=./schema.sql
npx wrangler@4 dev
```

`wrangler dev` 가 실행되는 동안 터미널에 `http://localhost:8787` 같은 주소가 나옵니다. 다른 탭에서 그 주소 뒤에 `/v1/health` 를 붙여 열어 `{"ok":true}` 가 보이는지 확인합니다. 끝내려면 `wrangler dev` 터미널에서 `Ctrl+C` 를 누릅니다.

### 2-7. 원격 데이터베이스에 스키마 적용

```
npx wrangler@4 d1 execute exam-plan-db --remote --file=./schema.sql
```

실제 Cloudflare 데이터베이스를 바꾼다는 확인 질문이 나오면 `y` 를 입력합니다.

확인: `spaces`, `items` 두 테이블을 만들었다는 실행 결과가 나옵니다. `schema.sql` 은 `CREATE TABLE IF NOT EXISTS` 를 쓰므로 같은 명령을 다시 실행해도 안전합니다.

### 2-8. 배포

```
npx wrangler@4 deploy
```

- 처음 배포하면 `workers.dev` 하위 도메인 등록을 묻습니다. 원하는 이름을 입력합니다. 이 이름이 Worker 주소에 들어갑니다.
- 배포가 끝나면 `https://exam-plan-sync.<하위도메인>.workers.dev` 형태의 주소가 출력됩니다. 적어 둡니다.
- 배포 직후 주소에 접속하면 523 오류가 날 수 있습니다. 1분쯤 기다린 뒤 다시 시도합니다.

### 2-9. 초대 코드 설정

배포 후에 실행합니다(sync-kit 문서 순서 그대로).

```
npx wrangler@4 secret put INVITE_CODE
```

프롬프트에 초대 코드를 입력하고 Enter 를 누릅니다. 입력한 글자는 화면에 보이지 않을 수 있습니다. 추측하기 어려운 긴 문자열을 쓰고, 앱 연결 때 다시 입력하므로 따로 적어 둡니다.

확인: `Success` 로 시작하는 메시지가 나옵니다.

초대 코드를 설정하지 않으면 새 공간을 만들 수 없습니다(403).

### 2-10. 동작 확인

브라우저 주소창에 다음을 입력합니다.

```
https://exam-plan-sync.<하위도메인>.workers.dev/v1/health
```

기대 응답: HTTP 200, 본문 `{"ok":true}`. `<하위도메인>` 은 2-8 에서 출력된 값으로 바꿉니다.

## 3. 앱에 입력할 값

앱의 동기화 대화상자에서 다음을 입력합니다(sync-kit 문서 3절).

| 칸 | 값 |
|---|---|
| Worker 주소 | `https://exam-plan-sync.<하위도메인>.workers.dev` (https 로 시작) |
| 초대 코드 | 2-9 에서 정한 `INVITE_CODE` 값. "이 기기에서 새로 시작"을 고를 때만 입력 |
| 앱 식별자(appId) | `exam-planner`. 앱 설정에서 이 값으로 보내야 합니다 |

흐름: "이 기기에서 새로 시작" → Worker 주소 → 초대 코드 → "새로 시작" → 앱이 새 동기화 키를 보여 줍니다. 이 키를 안전한 곳에 적어 둡니다. 다른 기기는 "다른 기기의 키로 연결"을 고르고 키를 붙여 넣습니다. 이때 초대 코드는 필요 없습니다.

**주의**: 앱 쪽 연결 코드는 현재 작업 중입니다. `src/lib/sync/state.svelte.ts` 가 `sync-kit` 을 import 하고, `connectNew`(새로 시작)와 `connectExisting`(다른 기기의 키로 연결)을 제공합니다. Worker 주소는 `https://` 로 시작해야 하며, `localhost` 에 한해서만 `http://` 를 허용합니다. 앱의 appId 는 `src/lib/sync/appTypes.ts` 의 `APP_ID` 에서 오는데, 이 파일이 아직 없어 값은 미확인입니다. 반드시 `exam-planner` 여야 합니다. 앱을 실제로 연결해 본 적은 없습니다(미확인).

## 4. 정적 사이트 배포

동기화 서버와는 별개로, 앱 화면을 배포하는 방법입니다. `server` 가 아니라 `exam-plan` 루트에서 실행합니다.

### 4-1. Cloudflare Pages 에 직접 업로드

```
cd D:\Projects\exam-plan
npm run build:static
npx wrangler@4 pages deploy dist-static --project-name exam-planner
```

- `npm run build:static` 은 `package.json` 의 scripts 에 있고, `vite.config.ts` 에서 `dist-static` 으로 출력합니다(여러 파일, 상대 경로).
- `pages deploy` 명령과 `--project-name exam-planner` 값은 sync-kit 문서에 근거가 없습니다. 미확인입니다. 프로젝트 이름은 임의로 정했고, 처음 실행할 때 프로젝트 생성을 묻는지도 미확인입니다.
- 정적 사이트의 출처(Pages 주소)와 Worker 주소는 다릅니다. Worker 는 `Access-Control-Allow-Origin: *` 이므로 출처가 달라도 요청이 허용됩니다(7절).

### 4-2. 단일 HTML 파일로 배포

```
cd D:\Projects\exam-plan
npm run build:single
```

`vite.config.ts` 주석에 따르면 `dist-single\exam-plan.html` 한 파일이 나옵니다. 이 파일을 원하는 정적 호스팅에 올리면 됩니다. 실제 빌드 결과와 호스팅 동작은 미확인입니다.

`file://` 로 파일을 직접 열면 브라우저마다 요청과 저장 방식이 달라 동기화가 이상할 수 있습니다. 동작을 확인하지 않았으므로, 문제가 있으면 HTTPS 로 연 페이지에서 시험합니다(sync-kit `docs/OPERATIONS.md` 문제 해결과 같은 내용).

## 5. 서버 한도 변경

1. `server\wrangler.toml` 의 `[vars]` 값을 고칩니다. 값은 따옴표로 감싼 문자열입니다.
2. `server` 폴더에서 다시 배포합니다.

```
npx wrangler@4 deploy
```

이미 만든 공간에도 새 값이 바로 적용됩니다(sync-kit `docs/OPERATIONS.md`).

`schema.sql` 을 바꿨을 때만 원격 스키마를 다시 적용합니다.

```
npx wrangler@4 d1 execute exam-plan-db --remote --file=./schema.sql
```

한도 값 주의(OPERATIONS 근거):

- 값을 낮추면 서버가 422 로 거부합니다. 값을 올리면 클라이언트의 항목 크기 사전 검사가 먼저 걸립니다. 클라이언트 표시는 기본값 기준이므로 기본값에서 크게 벗어나지 않는 편이 좋습니다.
- `MAX_BODY_BYTES`, `MAX_PUSH_ITEMS`, `PULL_MAX_ITEMS`, `PULL_MAX_BYTES` 는 견본에 없으므로 바꾸지 않습니다.

사용량 확인(D1 읽기 행을 씁니다. 필요할 때만 실행):

```
npx wrangler@4 d1 execute exam-plan-db --remote --command "SELECT substr(space_id, 1, 8) AS space, app_id, item_count, bytes_used, ROUND(bytes_used * 100.0 / 5242880, 1) AS used_pct, day, day_writes, seq, purged_seq FROM spaces ORDER BY bytes_used DESC"
```

`5242880` 은 `MAX_SPACE_BYTES` 기본값입니다. 바꿨다면 그 값으로 고칩니다. 쿼리는 읽기 전용 `SELECT` 입니다.

## 6. 문제 해결

| 응답 | 의미 | 조치 |
|---|---|---|
| 401 `unauthorized` | 동기화 키가 이 공간의 키와 다르다. appId 가 공간을 만든 값과 다르다(예: `exam-planner` 가 아님). 헤더 형식이 틀렸다 | 키를 다시 입력한다. 앱의 appId 설정을 확인한다 |
| 403 `forbidden` | 초대 코드가 틀렸다. `INVITE_CODE` 가 설정되지 않았다. `ALLOWED_APPS` 에 appId 가 없다. 공간 수가 `MAX_SPACES`(5) 에 닿았다 | `npx wrangler@4 secret put INVITE_CODE` 를 다시 실행한다. `wrangler.toml` 의 `ALLOWED_APPS` 를 확인한다. 공간 5개가 찼다면 시험용 공간이 쌓였을 수 있다(공간은 지울 수 없음) |
| 413 `body_too_large` | 요청이 `MAX_BODY_BYTES` 를 넘었다 | 앱이 나눠 보내므로 대개 재시도로 해결된다. 계속되면 직접 만든 클라이언트의 분할을 확인한다 |
| 422 `item_too_large` | 항목 하나가 `MAX_ITEM_BYTES`(256 KB) 를 넘었다 | 항목을 줄이거나 나눈다 |
| 422 `item_limit` | 항목 수가 `MAX_ITEMS_PER_SPACE`(1000) 를 넘었다 | 쓰지 않는 항목을 지우거나 값을 올리고 `npx wrangler@4 deploy` |
| 422 `space_full` | 공간 용량이 `MAX_SPACE_BYTES`(5 MB) 를 넘었다 | 쓰지 않는 항목을 지우거나 값을 올리고 `npx wrangler@4 deploy` |
| 429 `daily_write_limit` | 공간의 하루 쓰기가 `MAX_DAILY_WRITES`(3000) 에 닿았다 | 다음 00:00 UTC(한국 시간 오전 9시) 이후 자동으로 이어진다. 항목은 기기에 남는다. 자주 닿으면 dirty 루프(같은 항목 rev 가 계속 오름)를 먼저 의심한다. OPERATIONS 의 rev 분포 쿼리로 확인한다 |
| 503 `unavailable` | D1 또는 서버가 잠시 응답하지 않는다. 원격 DB 에 스키마를 적용하지 않았을 때도 난다. `Retry-After: 10` 이 붙는다 | 잠시 후 자동 재시도된다. 계속되면 2-7 의 스키마 적용을 확인한다 |
| 523 | 배포 직후 주소가 준비되지 않았다 | 1분 뒤 다시 시도한다 |
| 브라우저의 CORS 오류 | Worker 주소가 틀렸거나 Worker 가 응답하지 못했다 | 주소 끝의 오타를 확인하고 `/v1/health` 가 `{"ok":true}` 로 열리는지 본다 |
| 동기화 키를 잃었다 | 서버가 키를 모른다 | 복구할 수 없다. 연결된 다른 기기의 동기화 대화상자에서 키를 복사한다. 모든 기기에서 잃었다면 새 키로 "새로 시작"해야 하며, 이전 공간의 데이터는 읽을 수 없다 |

## 7. 알아둘 점

이 절은 2026-11-18 기준으로 서버 코드와 문서를 읽어 확인한 사실입니다.

- **CORS 가 `*` 로 하드코딩돼 있습니다.** `server/src/handler.ts` 의 `CORS` 상수(34~39행)가 `Access-Control-Allow-Origin: '*'` 를 넣고, 모든 응답(`/v1/health` 와 204 사전 요청 포함)에 붙습니다. sync-kit 문서(`PROTOCOL.md`, `OPERATIONS.md`)는 이를 "모든 출처 허용"으로 기술합니다. 영향: 어느 웹페이지에서든 키를 가진 쪽이 Worker 를 호출할 수 있고, 접근 권한은 동기화 키뿐입니다. 이 설정을 바꾸려면 `server/src` 를 고쳐야 하는데, 이번 작업에서는 수정하지 않았습니다.
- **클라이언트와 서버의 계약은 맞습니다(코드 대조).** sync-kit `core/src/transport.ts` 는 `POST {주소}/v1/sync` 로 보내고 `X-App-Id`, `X-Space-Id`, `Authorization: Bearer`, `Content-Type` 을 보내며, `X-Invite-Code` 는 값이 있을 때만 붙입니다. 서버의 허용 헤더(`X-App-Id, X-Space-Id, Authorization, X-Invite-Code, Content-Type`)와 경로(`/v1/sync`, `/v1/health`)가 이와 같습니다. 주소 끝의 `/` 는 클라이언트가 제거합니다. appId `exam-planner` 는 서버 정규식 `^[a-z0-9-]{1,32}$` 를 통과합니다.
- **앱 쪽 appId 는 아직 확인할 수 없습니다.** `src/lib/sync/state.svelte.ts` 는 `APP_ID` 를 `./appTypes` 에서 가져오는데 그 파일이 없습니다. 앱이 실제로 `X-App-Id: exam-planner` 를 보내는지는 확인하지 못했습니다. 앱의 동기화 안내 문구에는 예시 주소 `md-works-sync` 가 적혀 있으니, 주소 예시를 바꿀 때 참고합니다.
- **공간을 지우는 기능이 없습니다.** 서버 API 와 `schema.sql` 어디에도 공간 삭제가 없습니다. 삭제는 D1 에 직접 접근해 `spaces` 와 `items` 행을 지우는 방법뿐이며, 이 문서는 그 방법을 안내하지 않습니다.
- **삭제 기록 정리는 쓰기 요청의 약 5% 에서만 실행됩니다**(PROTOCOL.md). 삭제 항목이 많이 남아 보여도 이상이 아닙니다.
- **`wrangler.toml` 의 `database_id` 는 비밀 값은 아니지만 저장소에 올리지 않습니다.** `.gitignore` 의 `server/wrangler.toml` 항목이 이를 막습니다. 실제 파일은 이 작업에서 만들지 않았습니다.

## 8. 실행 확인 현황

| 항목 | 상태 |
|---|---|
| `server/` 복사, 파일 목록 확인 | 확인함(`fd` 로 9개 파일, 원본과 같음) |
| `wrangler.toml.example` 편집 | 확인함(값과 주석 검색) |
| 이 문서의 wrangler 명령 전체 | 미확인(실행하지 않음) |
| `npx wrangler@4` 의 npm 내려받기 | 실패(이 PC 의 Windows·npm 11 환경에서 `npx wrangler@4 --version` 이 "명령이 아닙니다" 로 끝남). sync-kit 설치본의 절대 경로 실행은 성공(4.164.0) |
| `pages deploy` 명령과 프로젝트 이름 | 미확인(sync-kit 문서 근거 없음) |
| `npm run build:static`, `build:single` 결과 파일 | 미확인(vite.config.ts 설정 근거만 확인) |
| 앱의 동기화 연결(`connectNew`/`connectExisting`) | 미확인(구현 진행 중, 실행해 보지 않음) |
| 앱의 `APP_ID` 값 | 미확인(`src/lib/sync/appTypes.ts` 없음) |

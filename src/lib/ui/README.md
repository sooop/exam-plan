# src/lib/ui

모든 화면이 공용으로 쓰는 층·토스트·스위치·툴팁. 화면마다 모달·토스트·툴팁을 다시 만들지 않는다. 토큰·단추·포커스 링은 `src/app.css`, 움직임은 `src/lib/motion`.

앱 진입점이 `import './app.css'` 를 해야 토큰이 적용된다(이 단계에서는 `src/main.ts` 를 건드리지 않았다). 토스트를 쓰는 화면은 앱 루트에 `<ToastHost />` 를 한 번 둔다.

## 파일

| 파일 | 용도 |
|---|---|
| `Layer.svelte` | 모달·서랍·시트·앵커 팝오버를 하나로 통합한 층 |
| `layerStack.svelte.ts` | 층 스택 스토어(`layerStack`): Esc·Tab 라우팅, inert, 포커스 가두기, 팝오버 바깥 누름, `closeTop()`·`closeAll()` |
| `layerCore.ts` | 스택의 순수 로직(DOM 비의존): `routeKey`·`inertPlan`·`trapTarget`·`createBackdropGuard`·`shouldRestoreFocus`·`decideClose`·`placePopover`. `tests/ui/layerStack.test.ts` 가 시험한다 |
| `toast.svelte.ts` · `toastCore.ts` · `ToastHost.svelte` | 토스트 스토어·정책(순수)·표시 영역 |
| `Switch.svelte` · `IconButton.svelte` · `ConfirmBlock.svelte` | 스위치, 아이콘 단추(aria-label + 툴팁), 되돌릴 수 없는 동작의 인라인 확인 블록 |
| `Banner.svelte` | 화면 위쪽에 붙는 안내 배너(role 지정, slide 연출, 조치·닫기 단추) |
| `tip.ts` | 툴팁 action `use:tip` |
| `portal.ts` | action `use:portal`: 요소를 body 로 옮긴다(층·토스트가 `#app` 의 inert 에 막히지 않게) |
| `Gallery.svelte` · `gallery.html` · `gallery-main.ts` | 개발용 견본(앱에 포함되지 않음) |

## Layer

```svelte
<Layer bind:open variant="modal" title="과목 추가" {dirty} {busy} canClose={() => ok} onclose={(reason) => ...}>
  본문
  {#snippet footer()}<button class="btn">취소</button><button class="btn primary">추가</button>{/snippet}
</Layer>
```

| prop | 기본 | 설명 |
|---|---|---|
| `open` (bindable) | false | 열림. `bind:open` 이거나 값만 넘기고 `onclose` 에서 끈다 |
| `variant` | `'modal'` | `'modal'` 가운데, `'drawer'` 우측, `'sheet'` 하단, `'popover'` 앵커 |
| `title` / `label` | - | `title` 은 h2 + `aria-labelledby`. 제목이 없으면 `label` 이 `aria-label` |
| `anchor` / `placement` | null / `'bottom-start'` | 팝오버 전용. `bottom\|top` + `-start\|-end\|-center`. 공간이 모자라면 위/아래로 뒤집고 화면 안으로 당긴다. 앵커 쪽 모서리에서 자라남 |
| `dirty` | false | true 면 X·Esc·바깥 클릭·`close` 요청 시 '버리고 닫을까요?' 를 인라인으로 묻는다(처음 포커스는 '계속 편집'). 미리 채운 값 그대로면 false 로 계산해 넘긴다 |
| `canClose` | - | `() => boolean`. false 면 닫지 않는다 |
| `busy` | false | 닫기 불가, X 비활성 |
| `onclose(reason)` | - | 닫기 요청이 받아들여졌을 때. reason: `x`·`escape`·`backdrop`·`tab`·`cancel`·`api`·`anchor-lost`. 부모가 `open=false` 로 끈 경우에는 불리지 않는다 |
| `onclosed()` | - | 닫는 연출까지 끝나 DOM 에서 치워진 뒤 |
| `closeOnBackdrop` | true | 바깥 클릭 닫기(누름과 뗌이 모두 배경일 때만) |
| `showClose` | true | X 단추(우상단, `aria-label="닫기"`, 툴팁 `닫기 (Esc)`). 팝오버에는 없다 |
| `initialFocus` | - | 선택자 또는 `() => HTMLElement`. 생략하면 `[data-autofocus]` → 첫 입력 → 첫 동작 단추(X 제외) |
| `opener` | - | 닫힌 뒤 포커스를 돌려줄 요소. 생략하면 연 순간의 activeElement(팝오버는 앵커) |
| `role` | `'dialog'` | 팝오버만. `'menu'`·`'listbox'` 도 가능 |
| `width` | 모달 480px · 서랍 420px · 시트 640px | CSS 값 |
| `keepContentWhileClosing` | false | 닫히는 동안(연출 중) 본문·푸터를 닫기 직전 모양 그대로 둔다(아래) |
| `children` / `footer` | - | 본문 / 하단 단추 줄 snippet |

프로그램에서 닫기: `bind:this={layer}` 후 `layer.requestClose('api')`(가드·dirty 확인을 거침), `layer.close('api')`(확인 없이 닫되 `busy`·`canClose` 는 지킴), `layer.isOpen()`. 또는 `layerStack.closeTop()` / `layerStack.closeAll()`.

- Esc·Tab 은 맨 위 층만 받는다(닫히는 중인 층은 제외). 한글 조합 중(`isComposing`·`keyCode 229`)에는 무시한다. 안쪽에서 `preventDefault` 한 키는 건너뛴다(가장 안쪽부터 한 단계씩 풀기).
- 모달·서랍·시트는 `#app`(와 그 아래 층)에 `inert` 를 건다. 토스트·툴팁은 body 에 있어 막히지 않는다. 앱 루트 id 가 다르면 `layerStack.appRootId` 를 바꾼다.
- 닫기는 연출을 기다리지 않는다: 닫기 시작과 동시에 뒤 화면이 풀리고 포커스가 돌아가며, 닫히는 도중 다시 열어도 꼬이지 않는다.
- 팝오버가 열린 채 아래 층의 배경을 누르면 팝오버만 닫히고 아래 층은 닫히지 않는다.
- 모달 안의 입력은 일반 DOM 이므로 쓰는 쪽에서 `bind:value` 로 `dirty` 를 계산한다.
- 닫힘 연출의 끝: 본체와 딤은 서로 길이가 달라도(서랍·시트 딤 220/170ms, 본체 panel 220/170ms, 모달 딤 400/140ms·본체 400/130ms) 먼저 끝난 쪽을 숨겨 두고 둘 다 끝난 뒤에 함께 치운다. 먼저 끝난 요소가 마지막에 되살아나 보이지 않는다.
- 제목(`title`)이 없는 모달·서랍·시트는 X 가 본문 첫 줄과 겹치지 않게 본문 위에 48px 의 머리 영역을 비운다. 첫 줄에 날짜 제목처럼 보이는 것이 있으면 `title` 을 주는 편이 공간 낭비가 없다.
- '버리고 닫을까요?' 인라인 확인은 높이가 펼쳐지고 접힌다(slide).

### 닫히는 동안 내용 유지: `keepContentWhileClosing`

부모가 `open=false` 와 **동시에** 목록·폼 값을 비우면(`{#if items.length}…{:else}없습니다{/if}`, `$derived(open ? … : [])`, 삭제 직후 `subId=null` 등) 닫히는 170ms 동안 층이 쪼그라들거나 '없습니다' 문구가 번쩍인다. 두 가지 방법이 있다.

1. 부모가 비우는 시점을 `onclosed`(연출이 끝나 DOM 이 치워진 뒤)로 미룬다. 가장 단순하다.
2. 비우는 시점을 못 미루면 `<Layer keepContentWhileClosing …>`. 닫기 직전(부모의 DOM 갱신 전)에 본문·푸터의 DOM 사본을 떠 두고, 닫히는 동안 실제 본문 대신 그 사본(조작 불가 `inert`·`aria-hidden`)을 보여 준다. 연출이 끝나면 사본도 치워진다. 사본은 정적이라 닫히는 동안의 값 변화·입력 상태(스크롤 위치 등)는 반영되지 않고, 닫히는 동안 실제 본문이 언마운트되므로 본문 컴포넌트의 정리 코드(onDestroy)가 닫기 시작 시점에 실행된다. 본문 안의 `bind:` 입력은 닫기 직전 값이 사본에 복사된다.

날짜 선택 시트(`screens/shared/DatePickerSheet`)와 바쁨 정도 팝오버는 이 prop 대신 닫기 직전 값을 보관하는 방식으로 고쳤다(자체 파생값이 `open` 에서만 갱신된다). 서랍(`SubjectDrawer`)·`SyncDialog` 처럼 닫힘과 동시에 비우는 곳은 `keepContentWhileClosing` 을 붙이면 된다.

## Banner

```svelte
{#if failed}
  <Banner role="alert" tone="danger" actions={[{ label: '다시 시도', onclick: retry }, { label: '원본 내보내기', onclick: exportRaw }]} onclose={dismiss}>
    저장된 데이터를 읽을 수 없습니다: 저장소가 응답하지 않습니다.
  </Banner>
{/if}
```

| prop | 기본 | 설명 |
|---|---|---|
| `role` | `'status'` | `'alert'`(실패·즉시 알림) 또는 `'status'`(정보·진행). 요소가 붙을 때 보조기술이 읽는다 |
| `tone` | `'info'` | 왼쪽 띠 색: `info` · `warn` · `danger` |
| `message` / `children` | - | 문구('무엇이 어떻다: 이유'). snippet 이 있으면 snippet 이 우선 |
| `actions` | `[]` | `{ label, onclick, disabled?, primary?, ariaLabel? }[]`. 단추는 기본이 일반(`.btn`) 단추다. `primary: true` 는 그 화면의 주 동작일 때만(화면당 채움 단추 하나) |
| `extra` | - | 단추 줄 앞의 자유 snippet(링크 등) |
| `onclose` / `closeLabel` | - / `'닫기'` | 주면 닫기 X 가 나타난다 |
| `animate` | true | false 면 연출 없이 붙고 떨어진다 |

붙고 떨어질 때 slide(열림 220ms ease-out · 닫힘 200ms ease-in-out, 동작 줄이기는 90ms 페이드, `data-anim=off` 면 즉시). 부모의 `{#if}` 로 붙었다 떨어지면 재생되도록 global 전환이다. Shell 의 배너 4종(`Shell.svelte`)이 이것으로 바뀔 때: 읽기 실패·손상은 `tone="danger"` + `role="alert"`, 저장 실패는 `danger`/`alert`, 다른 탭 변경은 `warn`/`status`.

## 토스트

```ts
import { toast } from '../ui/toast.svelte';
toast.push({ kind: 'success', text: '과목 3개를 추가했습니다', action: { label: '되돌리기', run: undo } });
toast.info(text, opts?) / toast.success(text, opts?) / toast.error(text, opts?)   // opts: { action?, duration? }
toast.dismiss(id) / toast.clear()
```

동시에 3개까지(넘치면 가장 오래된 것부터 닫힘), 정보·성공 2.5초 / 오류 4초 / 동작 단추가 있으면 8초, 마우스를 올리거나 포커스가 있는 동안 유지(뗀 뒤 최소 1.5초), 누르면 닫힘, 같은 문구가 이미 떠 있으면 새로 쌓지 않고 시간만 다시 시작한다. `ToastHost` 는 `role="status"`(정보·성공)와 `role="alert"`(오류) 영역을 내용이 없을 때도 유지한다.

## 그 밖

- `<Switch bind:checked onchange={(v) => ...} label="..." disabled describedby="id">자식 라벨</Switch>`: `role="switch"`.
- `<IconButton label="설정" shortcut="Esc" icon={Settings} pressed expanded haspopup controls disabled tabindex onclick />`: `aria-label` + 툴팁 자동.
- `<ConfirmBlock message confirmLabel="삭제" cancelLabel="취소" danger busy animate onconfirm oncancel />`: 처음 포커스가 취소. Esc 는 이 블록만 취소. 나타남·사라짐에 높이가 펼쳐지고 접히는 slide 가 내장되어 있다(부모의 `{#if}` 에 맞춰 재생되도록 `transition:slideFx|global`; 감싸는 쪽이 이미 같은 연출을 하면 `animate={false}`). 주의: global 전환이라 이 블록이 떠 있는 채 화면 전체가 언마운트되면 접히는 200ms 동안 DOM 제거가 늦어진다(Layer 는 이를 가려 둔다).
- `<Banner role tone message actions onclose animate extra>`: 아래 참조.
- 스피너: `<Icon class="sy-spin" />`(또는 아무 요소에 `class="sy-spin"`). 한 바퀴 `--dur-spin`(1.2s, linear)이고 동작 줄이기·`data-anim="off"` 에서도 돈다(진행 표시이므로). 각 화면이 `@keyframes sy-spin` 을 따로 두지 않는다(`motion.css` 에 있다).
- `use:tip={{ title, kbd?, lines?, delay?, warm?, quiet?, placement? }}` 또는 `use:tip="문구"`: 터치에서는 안 뜨고 키보드는 `:focus-visible` 일 때만, 누르거나 Esc·스크롤·끌기 중에는 닫힌다. 네이티브 `title` 은 쓰지 않는다.

## 견본(Gallery)으로 확인하는 방법

앱 진입점(`src/App.svelte`, `src/main.ts`)은 건드리지 않는다. 개발 서버(`npm run dev`)를 띄운 뒤 주소창에 `/src/lib/ui/gallery.html` 을 연다. Vite 개발 서버는 프로젝트 안의 모든 html 을 서비스하므로 별도 설정이 없다. 프로덕션 빌드(`build`)는 `index.html` 만 입력으로 쓰므로 견본은 포함되지 않는다. 견본 위쪽에서 테마(자동·밝게·어둡게)와 애니메이션(`data-anim`)을 바꿔 가며 다음을 눈으로 본다.

1. 모달에서 값을 바꾸고 Esc·X·바깥 클릭: '버리고 닫을까요?' 가 뜨고 포커스가 '계속 편집'에 있다. 값이 '국어' 그대로면 묻지 않는다.
2. 모달 위에 서랍·모달·팝오버를 겹치고 Esc: 맨 위 것만 닫힌다. 닫은 뒤 포커스가 연 단추로 돌아온다.
3. 입력창에서 글자를 끌어 모달 밖에서 놓아도 닫히지 않는다. 한글을 조합하는 중 Esc 는 닫지 않는다.
4. 열리고 닫히는 도중 같은 단추를 연타해도 꼬이지 않는다. 애니메이션을 끄면 즉시 처리된다.
5. 토스트 5개 연속(상한 3), 오류 토스트 위에 마우스 유지, 되돌리기 단추.
6. 끌기 고스트: 손잡이를 끌어 따라옴·기울기·슬롯, Esc 취소.

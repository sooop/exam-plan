<script lang="ts">
  // '동기화' 대화상자(md-works SyncDialog 를 옮긴 것). 외곽은 Layer(modal)가 맡는다: 닫기·Esc·바깥 클릭·포커스·inert.
  // 상태 줄 → (연결 전) 연결 폼 / (연결 후) 문제 안내 → 키·사용량·동기화 범위 → 이 기기 → 연결 해제.
  // 열림 상태는 syncUi.open(SyncBadge·명령이 연다). 입력 오류는 칸 옆, 작업 결과 오류는 스크롤 밖 고정 영역(role=alert).
  // 키·Worker 주소는 localStorage('examPlanner.sync')에만 있고 번들·내보내기·백업에는 들어가지 않는다.
  import { onDestroy, tick } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import Copy from '@lucide/svelte/icons/copy';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import { groupKeyInput, phaseLabel, phaseTone, problemTitle } from 'sync-kit';
  import { app } from '../../app/app.svelte';
  import { ICON, SYNC_ICON } from '../../app/icons';
  import { listFx } from '../../motion/motion.svelte';
  import ConfirmBlock from '../../ui/ConfirmBlock.svelte';
  import IconButton from '../../ui/IconButton.svelte';
  import Layer from '../../ui/Layer.svelte';
  import { isImeKey } from '../../ui/layerCore';
  import Switch from '../../ui/Switch.svelte';
  import { generateDeviceName, getDeviceName, setDeviceName } from '../device';
  import {
    sync, syncUi, SyncInputError, connectNew, connectExisting, disconnect, clearSyncMeta, pause, resume, syncNow, resolveResync, resolveMassDelete,
  } from '../state.svelte';
  import { errorReason, failureMessage, formatAgo, formatSize } from './format';
  import { fillTarget, kindName, maskKey, maxItemText, needsAttention, problemAction, problemBody, usageMeters } from './logic';

  /** 상대 시각(방금·N분 전)을 다시 그리는 간격 */
  const TICK_MS = 30_000;
  /** 복사 성공 표시를 되돌리는 시간 */
  const COPIED_MS = 1800;

  let busy = $state('');
  let actionError = $state('');
  let now = $state(Date.now());

  // ---- 연결 폼 (파생 값보다 먼저 선언한다) ----
  type Mode = 'new' | 'existing';
  let mode = $state<Mode>('new');
  let workerUrl = $state('');
  let inviteCode = $state('');
  let keyInput = $state('');
  let errUrl = $state('');
  let errInvite = $state('');
  let errKey = $state('');
  let createdKey = $state(''); // 방금 만든 키를 한 번 보여 준다(보관 안내)
  // 키 다시 입력(unauthorized·crypto)
  let reKey = $state(false);

  // ---- 상태 ----
  const status = $derived(sync.status);
  const connected = $derived(!!sync.config);
  const tone = $derived(phaseTone(status.phase));
  const StatusIcon = $derived(ICON[SYNC_ICON[status.phase]]);
  const AlertIcon = ICON.triangleAlert;
  const problem = $derived(status.lastError);
  const syncing = $derived(status.phase === 'syncing');
  const meters = $derived(usageMeters(status.usage));
  const fill = $derived(fillTarget({ connected, hasResync: !!status.resync, hasMass: !!status.massDelete, reKey }));
  /** 입력한 내용이 있으면 X·Esc·바깥 클릭이 '버리고 닫을까요?' 를 거친다. 미리 채운 값은 없으므로 입력 여부만 본다 */
  const dirty = $derived(connected ? reKey && keyInput !== '' : workerUrl.trim() !== '' || inviteCode !== '' || keyInput !== '');
  const attention = $derived(needsAttention(status.phase, !!problem));

  $effect(() => {
    // 열릴 때: 기기 이름과 상대 시각을 맞추고 주기적으로 다시 그린다. 닫히는 동안에는 내용을 그대로 둔다(연출이 끝난 뒤 afterClose)
    if (!syncUi.open) return;
    now = Date.now();
    loadDevice();
    const t = setInterval(() => (now = Date.now()), TICK_MS);
    return () => clearInterval(t);
  });
  onDestroy(() => clearTimeout(copyTimer));

  function resetForms() {
    keyInput = ''; inviteCode = ''; errUrl = errInvite = errKey = ''; reKey = false; confirming = null; keyShown = false; createdKey = '';
  }
  /** 닫는 연출이 끝나 DOM 에서 치워진 뒤에만 입력·키 표시·안내를 지운다(닫히는 동안 내용이 비어 쪼그라들지 않게) */
  function afterClose() {
    resetForms();
    actionError = '';
  }

  const MODES: { id: Mode; label: string }[] = [
    { id: 'new', label: '이 기기에서 새로 시작' },
    { id: 'existing', label: '다른 기기의 키로 연결' },
  ];
  function onModeKey(e: KeyboardEvent) {
    if (e.isComposing) return;
    const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    const first = e.key === 'Home';
    const last = e.key === 'End';
    if (!fwd && !back && !first && !last) return;
    e.preventDefault();
    if (first) mode = MODES[0].id;
    else if (last) mode = MODES[MODES.length - 1].id;
    else mode = mode === 'new' ? 'existing' : 'new';
    void tick().then(() => document.getElementById(`sy-mode-${mode}`)?.focus());
  }

  function onKeyInput() { keyInput = groupKeyInput(keyInput); errKey = ''; }
  /** 폼 안의 Enter: 한글 조합 중이면 제출하지 않는다 */
  const onFormKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && isImeKey(e)) e.preventDefault(); };

  /** 입력 오류는 해당 칸 옆에, 그 밖의 오류는 상단 고정 영역에 보인다 */
  function showError(e: unknown) {
    if (e instanceof SyncInputError) {
      if (e.field === 'workerUrl') { errUrl = e.message; void tick().then(() => document.getElementById('sy-url')?.focus()); }
      else if (e.field === 'inviteCode') { errInvite = e.message; void tick().then(() => document.getElementById('sy-invite')?.focus()); }
      else { errKey = e.message; void tick().then(() => document.getElementById(reKey ? 'sy-rekey' : 'sy-key')?.focus()); }
    } else {
      actionError = `동기화 설정을 저장하지 못했습니다: ${errorReason(e)}`;
    }
  }

  async function submitConnect() {
    if (busy) return;
    errUrl = errInvite = errKey = ''; actionError = '';
    busy = '연결하는 중…';
    try {
      if (mode === 'new') {
        await clearSyncMeta().catch(() => {});
        createdKey = await connectNew(workerUrl, inviteCode);
        keyShown = true;
      } else {
        await clearSyncMeta().catch(() => {});
        await connectExisting(workerUrl, keyInput);
      }
      keyInput = ''; inviteCode = '';
    } catch (e) {
      showError(e);
    } finally {
      busy = '';
    }
  }

  // ---- 키 표시·복사 ----
  let keyShown = $state(false);
  let copied = $state(false);
  let copyFallback = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  const masked = $derived(maskKey(sync.config?.syncKey ?? ''));

  async function copyKey() {
    const k = sync.config?.syncKey;
    if (!k) return;
    try {
      await navigator.clipboard.writeText(k);
      copied = true; copyFallback = false;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), COPIED_MS);
    } catch {
      // 클립보드를 못 쓰는 환경: 키를 보이고 선택해서 직접 복사하게 한다
      keyShown = true; copyFallback = true;
      void tick().then(() => { const el = document.getElementById('sy-keybox') as HTMLInputElement | null; el?.focus(); el?.select(); });
    }
  }

  // ---- 동작 ----
  async function run(label: string, fn: () => Promise<void>) {
    if (busy) return;
    actionError = '';
    busy = label;
    try { await fn(); } catch (e) { actionError = failureMessage(label, e); } finally { busy = ''; }
  }
  const doSyncNow = () => run('동기화하는 중…', syncNow);

  // 확인 단계(되돌릴 수 없는 동작): ConfirmBlock 이 그린다. 처음 포커스는 취소에 있다
  type Confirm = 'disconnect' | 'resync-delete' | 'mass-proceed';
  let confirming = $state<Confirm | null>(null);
  const ask = (c: Confirm) => { confirming = c; };
  /** 취소하면 확인을 연 단추로 포커스를 돌려준다 */
  const cancelConfirm = () => {
    const c = confirming;
    confirming = null;
    void tick().then(() => document.getElementById(c === 'disconnect' ? 'sy-disconnect' : c === 'mass-proceed' ? 'sy-mass-proceed' : 'sy-resync-delete')?.focus());
  };

  async function doDisconnect() {
    confirming = null;
    await run('연결을 해제하는 중…', async () => {
      disconnect();
      await clearSyncMeta().catch(() => {}); // 키를 지웠으니 이 공간의 커서·rev 는 쓸모없다(시험·과목 항목은 그대로)
      createdKey = ''; keyShown = false; mode = 'new';
    });
  }
  // 이 기기의 내용이 바뀌는 선택(이 기기에서 지우기, 서버 사본으로 되돌리기) 직전에는 현재 상태를 이력에 보존한다
  const preserveBefore = (label: string) => { try { app.hooks.onBeforeBigChange?.(label); } catch { /* 이력 보존 실패가 동작을 막지 않는다 */ } };
  const doResync = (c: 'upload' | 'delete') => {
    confirming = null;
    if (c === 'delete') preserveBefore('이 기기에서 지우기');
    return run(c === 'upload' ? '서버에 올리는 중…' : '이 기기에서 지우는 중…', () => resolveResync(c));
  };
  const doMass = (c: 'proceed' | 'restore') => {
    if (c === 'restore') preserveBefore('서버 사본으로 되돌리기');
    return run(c === 'proceed' ? '삭제를 반영하는 중…' : '서버 사본으로 되돌리는 중…', () => resolveMassDelete(c));
  };

  async function openReKey() { reKey = true; keyInput = ''; errKey = ''; await tick(); document.getElementById('sy-rekey')?.focus(); }
  const cancelReKey = () => { reKey = false; keyInput = ''; errKey = ''; };
  async function submitReKey() {
    if (busy || !sync.config) return;
    errKey = ''; actionError = '';
    busy = '키를 확인하는 중…';
    try {
      await connectExisting(sync.config.workerUrl, keyInput);
      keyInput = ''; reKey = false;
    } catch (e) { showError(e); } finally { busy = ''; }
  }

  const toggleAuto = (on: boolean) => { if (on) resume(); else pause(); };

  // ---- 이 기기: 기기 이름(작업 기록에 표시, 서버로 보내지 않는다) ----
  let deviceSaved = $state('');
  let deviceDraft = $state('');
  let deviceErr = $state('');

  function loadDevice() {
    deviceSaved = getDeviceName();
    deviceDraft = deviceSaved;
    deviceErr = '';
  }
  /** 입력을 확정한다(Enter 또는 칸을 벗어날 때). 1~30자가 아니면 칸 아래에 사유를 낸다 */
  function commitDevice() {
    if (deviceDraft === deviceSaved) { deviceErr = ''; return; }
    const r = setDeviceName(deviceDraft);
    if (!r.ok) { deviceErr = r.error; return; }
    deviceErr = '';
    deviceSaved = r.name;
    deviceDraft = r.name;
  }
  function onDeviceKey(e: KeyboardEvent) {
    if (isImeKey(e)) return;
    if (e.key === 'Enter') { e.preventDefault(); commitDevice(); }
  }
  /** 새 이름을 제안한다. 확정(Enter·칸 벗어남) 전에는 저장하지 않으므로 칸에 포커스를 옮겨 둔다 */
  function regenerateDevice() {
    deviceDraft = generateDeviceName();
    deviceErr = '';
    void tick().then(() => { const el = document.getElementById('sy-device') as HTMLInputElement | null; el?.focus(); el?.select(); });
  }
</script>

<!-- 외곽: 모달 층. 닫기 단추·Esc·바깥 클릭·포커스 복귀·뒤 화면 inert 는 Layer 가 맡는다. 처리 중(busy)에는 닫히지 않는다 -->
<Layer bind:open={syncUi.open} variant="modal" title="동기화" busy={!!busy} {dirty} width="560px" initialFocus="#sy-url, #sy-syncnow" onclosed={afterClose}>
  <div class="sy">
    <!-- 상태 줄과 작업 결과: 본문을 스크롤해도 맨 위에 고정된다. 두 영역은 내용이 없어도 DOM 에 있다 -->
    <div class="top">
      <div class="statusrow" role="status" aria-live="polite">
        <span class="state tone-{tone}" class:attention>
          <span class="ico" aria-hidden="true"><StatusIcon size={16} class={syncing ? 'sy-spin' : undefined} /></span>
          <span class="txt">{phaseLabel(status)}</span>
        </span>
        {#if connected}
          <span class="when">마지막 동기화: <b>{formatAgo(status.lastSyncAt, now)}</b></span>
          <button type="button" id="sy-syncnow" class="btn" disabled={!!busy || syncing} onclick={doSyncNow}>
            {syncing ? '동기화하는 중…' : '지금 동기화'}
          </button>
        {/if}
      </div>
      <div class="notices">
        <div role="status" aria-live="polite">{#if busy}<p class="busy">{busy}</p>{/if}</div>
        <div role="alert">{#if actionError}<p class="note err">{actionError}</p>{/if}</div>
      </div>
    </div>

    {#if !connected}
      <!-- ───── 연결 전 ───── -->
      <section aria-labelledby="sy-h-connect">
        <h3 id="sy-h-connect">연결</h3>
        <p class="hint">같은 키를 입력한 기기끼리 시험·과목 항목과 설정을 공유합니다. 내용은 이 기기에서 암호화해 올리며, 서버는 읽을 수 없습니다. 서버는 직접 배포한 Cloudflare Worker 입니다.</p>

        <label class="field"><span>Worker 주소</span>
          <input id="sy-url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://exam-plan-sync.내이름.workers.dev"
            bind:value={workerUrl} oninput={() => (errUrl = '')} aria-invalid={!!errUrl} aria-describedby="sy-url-err" disabled={!!busy} />
        </label>
        <div id="sy-url-err" class="errline" role="alert">{errUrl}</div>

        <div class="seg" role="radiogroup" aria-label="연결 방법">
          {#each MODES as m (m.id)}
            <button type="button" role="radio" id={`sy-mode-${m.id}`} aria-checked={mode === m.id} tabindex={mode === m.id ? 0 : -1}
              class="seg-btn" class:active={mode === m.id} onclick={() => (mode = m.id)} onkeydown={onModeKey} disabled={!!busy}>{m.label}</button>
          {/each}
        </div>

        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <form class="connect" onkeydown={onFormKey} onsubmit={(e) => { e.preventDefault(); void submitConnect(); }}>
          {#if mode === 'new'}
            <p class="hint">이 기기에서 새 동기화 키를 만들고 서버에 새 공간을 엽니다. 다른 기기는 만들어진 키로 연결합니다.</p>
            <label class="field"><span>초대 코드</span>
              <input id="sy-invite" type="text" autocomplete="off" spellcheck="false" placeholder="Worker 를 배포할 때 정한 코드"
                bind:value={inviteCode} oninput={() => (errInvite = '')} aria-invalid={!!errInvite} aria-describedby="sy-invite-err" disabled={!!busy} />
            </label>
            <div id="sy-invite-err" class="errline" role="alert">{errInvite}</div>
          {:else}
            <p class="hint">다른 기기의 동기화 대화상자에서 키를 복사해 붙여 넣으세요. 공백·소문자는 자동으로 정리됩니다.</p>
            <label class="field"><span>동기화 키</span>
              <input id="sy-key" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" class="mono" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX"
                bind:value={keyInput} oninput={onKeyInput} aria-invalid={!!errKey} aria-describedby="sy-key-err" disabled={!!busy} />
            </label>
            <div id="sy-key-err" class="errline" role="alert">{errKey}</div>
          {/if}
          <p class="hint">동기화 키는 이 브라우저에 저장됩니다. 공용 컴퓨터에서는 사용 후 연결을 해제하세요.</p>
          <div class="actions">
            <button type="submit" class="btn primary" disabled={!!busy || !workerUrl.trim() || (mode === 'new' ? !inviteCode.trim() : !keyInput)}>
              {busy ? '연결하는 중…' : mode === 'new' ? '새로 시작' : '연결'}
            </button>
          </div>
        </form>
      </section>

      {@render deviceBlock()}
    {:else}
      <!-- ───── 문제 안내(해결될 때까지 보인다) ───── -->
      {#if status.resync}
        <section class="card" aria-labelledby="sy-h-resync" transition:listFx>
          <h3 id="sy-h-resync"><AlertIcon size={15} /> 서버에 없는 항목이 {status.resync.orphans.length}개 있습니다</h3>
          <p class="hint">이 기기에서 오랫동안 동기화하지 않아, 서버가 그동안의 삭제 기록을 정리했습니다. 아래 항목은 서버에 없는데 이 기기에는 남아 있습니다. 어떻게 할지 고르세요.</p>
          <ul class="items" aria-label="서버에 없는 항목">
            {#each status.resync.orphans as o (o.id)}<li><span class="kind">{kindName(o.kind, o.id)}</span><span class="name">{o.label}</span></li>{/each}
          </ul>
          {#if confirming === 'resync-delete'}
            <ConfirmBlock confirmLabel="지우기" busy={!!busy} busyLabel="지우는 중…" onconfirm={() => doResync('delete')} oncancel={cancelConfirm}>
              {#snippet children()}이 기기에서 {status.resync?.orphans.length ?? 0}개 항목을 지웁니다. 서버에도 없으므로 <b>되돌릴 수 없습니다.</b>{/snippet}
            </ConfirmBlock>
          {:else}
            <div class="actions">
              <button type="button" id="sy-resync-delete" class="btn" onclick={() => ask('resync-delete')} disabled={!!busy}>이 기기에서 지우기…</button>
              <button type="button" class="btn" class:primary={fill === 'resync'} onclick={() => doResync('upload')} disabled={!!busy}>서버에 올리기</button>
            </div>
          {/if}
        </section>
      {/if}

      {#if status.massDelete}
        <section class="card" aria-labelledby="sy-h-mass" transition:listFx>
          <h3 id="sy-h-mass"><AlertIcon size={15} /> 항목이 한꺼번에 사라졌습니다</h3>
          <p class="line">이 기기에서 전체 {status.massDelete.total}개 중 {status.massDelete.missing}개가 사라진 것으로 보여 동기화를 멈췄습니다.</p>
          <p class="hint">저장소를 읽지 못했거나 실제로 많이 지운 경우입니다. 실제로 지운 게 맞다면 삭제를 서버와 다른 기기에도 반영하고, 아니라면 서버 사본으로 되돌리세요.</p>
          {#if confirming === 'mass-proceed'}
            <ConfirmBlock confirmLabel="삭제 반영" busy={!!busy} busyLabel="반영하는 중…" onconfirm={() => { confirming = null; void doMass('proceed'); }} oncancel={cancelConfirm}>
              {#snippet children()}전체 {status.massDelete?.total ?? 0}개 중 {status.massDelete?.missing ?? 0}개의 삭제를 서버에 반영합니다. 서버에서 지워지면 <b>다른 기기에서도 해당 항목이 지워지며 되돌릴 수 없습니다.</b>{/snippet}
            </ConfirmBlock>
          {:else}
            <div class="actions">
              <button type="button" id="sy-mass-proceed" class="btn" onclick={() => ask('mass-proceed')} disabled={!!busy}>삭제를 서버에도 반영…</button>
              <button type="button" class="btn" class:primary={fill === 'mass'} onclick={() => doMass('restore')} disabled={!!busy}>서버 사본으로 되돌리기</button>
            </div>
          {/if}
        </section>
      {/if}

      {#if problem && !status.massDelete}
        {@const action = problemAction(problem.kind)}
        <section class="card warn" aria-labelledby="sy-h-prob" transition:listFx>
          <h3 id="sy-h-prob"><AlertIcon size={15} /> {problemTitle(problem)}</h3>
          <p class="line">{problemBody(problem)}</p>
          {#if problem.message}<p class="hint raw">{problem.message}</p>{/if}
          {#if action === 'rekey'}
            {#if reKey}
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <form class="rekey" onkeydown={onFormKey} onsubmit={(e) => { e.preventDefault(); void submitReKey(); }}>
                <label class="field"><span>동기화 키</span>
                  <input id="sy-rekey" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" class="mono" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX"
                    bind:value={keyInput} oninput={onKeyInput} aria-invalid={!!errKey} aria-describedby="sy-rekey-err" disabled={!!busy} />
                </label>
                <div id="sy-rekey-err" class="errline" role="alert">{errKey}</div>
                <div class="actions">
                  <button type="button" class="btn" onclick={cancelReKey} disabled={!!busy}>취소</button>
                  <button type="submit" class="btn" class:primary={fill === 'rekey'} disabled={!!busy || !keyInput}>키 바꾸기</button>
                </div>
              </form>
            {:else}
              <div class="actions"><button type="button" class="btn" onclick={openReKey} disabled={!!busy}>키 다시 입력…</button></div>
            {/if}
          {:else if action === 'retry'}
            <div class="actions"><button type="button" class="btn" onclick={doSyncNow} disabled={!!busy || syncing}>다시 시도</button></div>
          {/if}
        </section>
      {/if}

      {#if status.oversize.length}
        <section class="card warn" aria-labelledby="sy-h-over" transition:listFx>
          <h3 id="sy-h-over"><AlertIcon size={15} /> 동기화되지 않는 항목 {status.oversize.length}개</h3>
          <p class="hint">항목 하나는 {maxItemText()}까지만 동기화됩니다. 시험이나 과목을 나누거나 줄이세요. 줄이면 자동으로 올라갑니다.</p>
          <ul class="items" aria-label="동기화되지 않는 항목">
            {#each status.oversize as o (o.id)}<li><span class="name">{o.label}</span><span class="size">{formatSize(o.bytes)}</span></li>{/each}
          </ul>
        </section>
      {/if}

      <!-- ───── 연결됨 ───── -->
      <section aria-labelledby="sy-h-key">
        <h3 id="sy-h-key">동기화 키</h3>
        {#if createdKey}
          <p class="line"><b>새 키를 만들었습니다.</b> 다른 기기를 연결할 때 필요합니다. 서버는 키를 모르므로 <b>잃어버리면 복구할 수 없습니다.</b> 안전한 곳에 따로 적어 두세요.</p>
        {:else}
          <p class="hint">다른 기기에서 '다른 기기의 키로 연결'을 고르고 이 키를 입력하세요. 키를 아는 사람은 누구나 이 데이터를 읽을 수 있습니다.</p>
        {/if}
        <div class="keyrow">
          <input id="sy-keybox" class="mono" readonly type="text" spellcheck="false" aria-label="동기화 키" value={keyShown ? (sync.config?.syncKey ?? '') : masked} />
          <IconButton label="키 보기" pressed={keyShown} icon={keyShown ? EyeOff : Eye} onclick={() => (keyShown = !keyShown)} />
          <IconButton label={copied ? '복사했습니다' : '키 복사'} icon={copied ? Check : Copy} onclick={copyKey} />
        </div>
        <div class="sr-only" role="status" aria-live="polite">{copied ? '키를 복사했습니다' : ''}</div>
        {#if copyFallback}<p class="hint">클립보드를 쓸 수 없습니다. 위 입력에서 키를 선택해 직접 복사하세요.</p>{/if}
        <p class="hint">서버: <span class="mono wrap">{sync.config?.workerUrl}</span></p>
        <Switch checked={sync.enabled} onchange={toggleAuto}>자동 동기화 (끄면 멈춥니다)</Switch>
      </section>

      <section aria-labelledby="sy-h-usage">
        <h3 id="sy-h-usage">사용량</h3>
        {#if status.usage}
          {#each meters as m (m.label)}
            <div class="meter" class:near={m.near}>
              <div class="mrow"><span>{m.label}</span><span class="num">{m.text}{#if m.near} · 한도 가까움{/if}</span></div>
              <div class="bar" role="progressbar" aria-label={m.label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(m.ratio * 100)} aria-valuetext={m.text}>
                <span style:width="{Math.round(m.ratio * 100)}%"></span>
              </div>
            </div>
          {/each}
          {#if status.throttled}<p class="hint warn">오늘 쓰기 한도의 80% 에 가까워 올리는 간격을 5분으로 늘렸습니다.</p>{/if}
        {:else}
          <p class="hint">동기화하면 서버 사용량이 여기에 표시됩니다.</p>
        {/if}
      </section>

      <section aria-labelledby="sy-h-scope">
        <h3 id="sy-h-scope">동기화되는 것</h3>
        <ul class="plain">
          <li><b>시험</b>: 과목·할일·날짜별 계획·메모 포함</li>
          <li><b>과목 목록</b></li>
          <li><b>설정</b>: 권장 개수·기본 분량·요일 기본값</li>
        </ul>
        <p class="hint"><b>기기마다 따로 두는 것</b>: 활성 시험·화면 설정·변경 이력(스냅샷·작업 기록)</p>
      </section>

      {@render deviceBlock()}

      <section aria-labelledby="sy-h-off">
        <h3 id="sy-h-off">연결 해제</h3>
        {#if confirming === 'disconnect'}
          <ConfirmBlock confirmLabel="연결 해제" busy={!!busy} busyLabel="해제하는 중…" onconfirm={doDisconnect} oncancel={cancelConfirm}>
            {#snippet children()}이 기기의 키와 설정만 지웁니다. <b>시험·과목 항목은 남습니다.</b> 서버와 다른 기기의 데이터는 그대로입니다. 키를 따로 적어 두지 않았다면 이 기기에서도 다시 연결할 수 없습니다.{/snippet}
          </ConfirmBlock>
        {:else}
          <p class="hint">이 기기의 키만 지우고 시험·과목 항목은 남깁니다.</p>
          <div class="actions"><button type="button" id="sy-disconnect" class="btn" onclick={() => ask('disconnect')} disabled={!!busy}>연결 해제…</button></div>
        {/if}
      </section>
    {/if}
  </div>
</Layer>

<!-- 이 기기: 기기 이름. 확정(Enter·칸 벗어남) 전에는 저장하지 않는다 -->
{#snippet deviceBlock()}
  <section aria-labelledby="sy-h-device">
    <h3 id="sy-h-device">이 기기</h3>
    <label class="field"><span>기기 이름</span>
      <input id="sy-device" type="text" autocomplete="off" spellcheck="false" bind:value={deviceDraft}
        onkeydown={onDeviceKey} onblur={commitDevice} aria-invalid={!!deviceErr} aria-describedby="sy-device-hint sy-device-err" />
    </label>
    <div id="sy-device-err" class="errline" role="alert">{deviceErr}</div>
    <div class="actions"><button type="button" class="btn" onclick={regenerateDevice}>다시 만들기</button></div>
    <p id="sy-device-hint" class="hint">이 이름은 변경 이력의 작업 기록에 표시되며 서버로 보내지 않습니다.{deviceDraft !== deviceSaved ? ' Enter 를 누르거나 칸을 벗어나면 이 이름으로 바뀝니다.' : ''}</p>
  </section>
{/snippet}

<style>
  .sy { display: flex; flex-direction: column; }
  .sy p { margin: 0; }
  .sy h3 { margin: 0; font-size: 14px; display: flex; align-items: center; gap: 6px; }

  /* 상단 고정: 상태 줄과 작업 결과. 본문(Layer 의 .body)이 스크롤되어도 남는다 */
  .top { position: sticky; top: -8px; z-index: 1; margin: -8px -20px 0; padding: 8px 20px 4px; background: var(--bg); }
  .statusrow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); font-size: 13px; }
  .state { display: inline-flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 200px; }
  .state .txt { overflow-wrap: anywhere; }
  .state.attention { font-weight: 600; }
  .tone-ok { color: var(--green-text); }
  .tone-error { color: var(--red-text); }
  .tone-muted, .tone-warn { color: var(--muted); }
  .tone-busy { color: var(--text); }
  .when { color: var(--muted); font-variant-numeric: tabular-nums; }
  .statusrow .btn { margin-left: auto; }
  .notices { margin-top: 8px; }
  .notices > div { min-height: 0; }
  .busy { font-size: 13px; color: var(--muted); padding: 4px 10px; }
  .note { padding: 8px 10px; border-radius: var(--radius); font-size: 13px; overflow-wrap: anywhere; }
  .note.err { background: color-mix(in srgb, var(--red) 12%, transparent); color: var(--red-text); }

  section { padding: 12px 0; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
  .top + section { border-top: 0; padding-top: 4px; }
  section.card { padding: 12px; margin-top: 8px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--panel); }
  section.card.warn { border-color: color-mix(in srgb, var(--red) 50%, var(--line)); }
  section.card h3 { color: var(--red-text); }
  .line { font-size: 13px; overflow-wrap: anywhere; }
  .hint { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
  .hint.raw { font-size: 11.5px; }
  .hint.warn { color: var(--red-text); }
  .errline { font-size: 12px; color: var(--red-text); overflow-wrap: anywhere; }
  .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .wrap { overflow-wrap: anywhere; }

  .field { display: flex; flex-direction: row; gap: 8px; align-items: center; font-size: 13px; width: 100%; }
  .field > span { flex: none; min-width: 6.5em; color: var(--muted); }
  .field input, .keyrow input {
    flex: 1; min-width: 0; min-height: var(--target); margin: 0; padding: 6px 8px; width: auto;
    border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); color: var(--text); font-size: var(--field);
  }
  .field input[aria-invalid='true'] { border-color: var(--red-text); }
  .connect, .rekey { display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .seg { display: flex; gap: 6px; width: 100%; }
  .seg-btn { flex: 1; min-height: var(--target); padding: 6px 8px; border: 1px solid var(--line); border-radius: var(--radius); background: transparent; color: var(--text); font-size: 13px; }
  .seg-btn:hover:not(:disabled) { background: var(--panel2); }
  .seg-btn.active { background: var(--accent-soft); border-color: var(--accent); }
  .seg-btn:disabled { opacity: .45; }
  .keyrow { display: flex; gap: 4px; align-items: center; width: 100%; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; width: 100%; flex-wrap: wrap; }

  .items { list-style: none; margin: 0; padding: 0; width: 100%; max-height: 160px; overflow-y: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg); }
  .items li { display: flex; gap: 8px; align-items: baseline; padding: 4px 8px; font-size: 12.5px; border-bottom: 1px solid var(--line); }
  .items li:last-child { border-bottom: 0; }
  .items .kind { flex: none; color: var(--muted); }
  .items .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .items .size { flex: none; font-variant-numeric: tabular-nums; color: var(--muted); }
  .plain { margin: 0; padding-left: 18px; font-size: 13px; display: grid; gap: 4px; }

  .meter { width: 100%; font-size: 12.5px; }
  .mrow { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 3px; }
  .mrow .num { font-variant-numeric: tabular-nums; color: var(--muted); }
  .meter.near .mrow .num { color: var(--red-text); font-weight: 600; }
  .bar { height: 8px; border-radius: 4px; background: var(--line); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); transition: width var(--dur-2) var(--ease-out); }
  .meter.near .bar span { background: var(--red); }

  @media (pointer: coarse) {
    .field input, .keyrow input { font-size: 16px; min-height: var(--target); }
    .seg-btn, .actions .btn, .statusrow .btn { min-height: var(--target); }
  }
  @media (max-width: 640px) {
    .field { flex-direction: column; align-items: stretch; gap: 4px; }
  }
</style>

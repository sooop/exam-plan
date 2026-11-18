<script lang="ts">
  // 개발용 견본: 층(모달·서랍·시트·팝오버)·토스트·스위치·확인 블록·끌기 고스트를 한 화면에서 띄워 본다. 앱 화면에는 쓰지 않는다.
  // 여는 방법은 src/lib/ui/README.md 를 본다.
  import { onMount } from 'svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Settings from '@lucide/svelte/icons/settings';
  import ConfirmBlock from './ConfirmBlock.svelte';
  import IconButton from './IconButton.svelte';
  import Layer from './Layer.svelte';
  import Switch from './Switch.svelte';
  import ToastHost from './ToastHost.svelte';
  import { layerStack } from './layerStack.svelte';
  import { toast } from './toast.svelte';
  import { Motion } from '../motion/motion';

  // 환경 스위치
  let theme = $state<'auto' | 'light' | 'dark'>('auto');
  let anim = $state(true);
  $effect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.anim = anim ? 'on' : 'off';
  });

  // 층
  let modalOpen = $state(false);
  let modal2Open = $state(false);
  let drawerOpen = $state(false);
  let sheetOpen = $state(false);
  let popOpen = $state(false);
  let busyOpen = $state(false);
  let guardOpen = $state(false);
  let popInModalOpen = $state(false);
  let popAnchor = $state<HTMLElement | null>(null);
  let popInModalAnchor = $state<HTMLElement | null>(null);
  let drawer: Layer | undefined = $state();

  // 입력이 있는 모달: 미리 채운 값 그대로면 묻지 않는다
  const PRESET = '국어';
  let name = $state(PRESET);
  const dirty = $derived(name.trim() !== PRESET);
  let lastClose = $state('-');

  // 처리 중 모달
  let busy = $state(false);
  function runBusy() {
    busy = true;
    setTimeout(() => {
      busy = false;
      busyOpen = false;
      toast.success('저장했습니다');
    }, 2500);
  }

  // 가드
  let allowClose = $state(false);

  // 스위치
  let sw1 = $state(true);
  let sw2 = $state(false);

  // 확인 블록
  let showConfirm = $state(false);

  // 끌기 고스트: Motion.sortable (포인터 이벤트 기반 스프링 고스트)
  let list: HTMLElement | undefined = $state();
  let items = $state(['국어', '수학', '영어', '과학', '사회']);
  onMount(() => {
    if (!list) return;
    return Motion.sortable(list, {
      handle: '.grip',
      onMove: ({ from, to }) => {
        const copy = [...items];
        const [m] = copy.splice(from, 1);
        copy.splice(to, 0, m);
        // 순서는 DOM 이 이미 바뀌었으므로 상태만 맞춘다(Svelte 가 다시 그리지 않게 같은 순서의 배열을 둔다)
        items = copy;
        toast.info(`${m} 을(를) ${to + 1}번째로 옮겼습니다`);
      },
    });
  });
</script>

<main class="gal">
  <header class="bar">
    <h1>UI 견본</h1>
    <label class="f inline">테마
      <select bind:value={theme}>
        <option value="auto">자동</option>
        <option value="light">밝게</option>
        <option value="dark">어둡게</option>
      </select>
    </label>
    <Switch bind:checked={anim}>애니메이션</Switch>
    <span class="muted num" aria-live="off">열린 층 {layerStack.depth}개</span>
  </header>

  <section>
    <h2>층</h2>
    <div class="row">
      <button type="button" class="btn primary" onclick={() => { name = PRESET; modalOpen = true; }}>모달</button>
      <button type="button" class="btn" onclick={() => (drawerOpen = true)}>서랍</button>
      <button type="button" class="btn" onclick={() => (sheetOpen = true)}>시트</button>
      <button type="button" class="btn" bind:this={popAnchor} aria-haspopup="dialog" aria-expanded={popOpen} onclick={() => (popOpen = !popOpen)}>팝오버</button>
      <button type="button" class="btn" onclick={() => (busyOpen = true)}>처리 중 모달</button>
      <button type="button" class="btn" onclick={() => { allowClose = false; guardOpen = true; }}>canClose 가드</button>
      <IconButton label="설정 서랍" icon={Settings} haspopup="dialog" onclick={() => (drawerOpen = true)} />
    </div>
    <p class="muted">모달 안에서 값을 바꾸고 Esc·X·바깥 클릭·취소를 눌러 보세요. '국어' 그대로면 묻지 않습니다. 모달 위에 서랍·팝오버를 겹쳐 Esc 를 눌러 보세요.</p>
    <p class="muted">직전 닫힘 이유: <b>{lastClose}</b>. <button type="button" class="btn ghost" onclick={() => layerStack.closeTop()}>맨 위 닫기(API)</button>
      <button type="button" class="btn ghost" onclick={() => layerStack.closeAll()}>모두 닫기(API)</button></p>
  </section>

  <section>
    <h2>토스트</h2>
    <div class="row">
      <button type="button" class="btn" onclick={() => toast.info('안내 문구입니다')}>정보</button>
      <button type="button" class="btn" onclick={() => toast.success('과목 3개를 추가했습니다')}>성공</button>
      <button type="button" class="btn" onclick={() => toast.error('백업 파일을 만들지 못했습니다: 저장 공간이 부족합니다')}>오류</button>
      <button type="button" class="btn" onclick={() => toast.info('시험 1개를 삭제했습니다', { action: { label: '되돌리기', run: () => toast.success('되돌렸습니다') } })}>되돌리기 단추</button>
      <button type="button" class="btn" onclick={() => { for (let i = 1; i <= 5; i++) toast.info(`안내 ${i}`); }}>5개 연속(상한 3)</button>
    </div>
  </section>

  <section>
    <h2>스위치 · 확인 블록</h2>
    <div class="col">
      <Switch bind:checked={sw1}>켜면 완료한 할 일을 숨깁니다</Switch>
      <Switch bind:checked={sw2} onchange={(v) => toast.info(v ? '켰습니다' : '껐습니다')}>켜면 주말에도 계획을 배치합니다</Switch>
      <Switch label="이름만 있는 스위치(aria-label)" checked={true} disabled />
      <div>
        {#if showConfirm}
          <ConfirmBlock
            message={'시험 "중간고사"와 배치된 할 일 12개가 완전히 삭제되며 되돌릴 수 없습니다'}
            confirmLabel="삭제"
            onconfirm={() => { showConfirm = false; toast.success('삭제했습니다'); }}
            oncancel={() => (showConfirm = false)}
          />
        {:else}
          <button type="button" class="btn danger" onclick={() => (showConfirm = true)}>시험 삭제…</button>
        {/if}
      </div>
    </div>
  </section>

  <section>
    <h2>끌기 고스트 (Motion.sortable)</h2>
    <ul class="sort" bind:this={list}>
      {#each items as it (it)}
        <li class="srow"><span class="grip" aria-hidden="true">⠿</span><span>{it}</span></li>
      {/each}
    </ul>
    <p class="muted">손잡이를 끌면 스프링 고스트가 따라오고, 빈 슬롯이 열립니다. Esc·창 전환은 취소이고 Alt+↑/↓ 는 한 칸 이동입니다. 항목을 Tab 으로 닿게 하려면 쓰는 쪽에서 tabindex 를 줍니다.</p>
  </section>
</main>

<!-- 모달: 입력이 있으면 닫기 전에 묻는다 -->
<Layer
  bind:open={modalOpen}
  title="과목 추가"
  {dirty}
  onclose={(r) => (lastClose = r)}
>
  <label class="f">과목 이름
    <input type="text" bind:value={name} />
  </label>
  <p class="muted">입력이 '{PRESET}' 그대로면 묻지 않고 닫힙니다.</p>
  <div class="row">
    <button type="button" class="btn" onclick={() => (modal2Open = true)}>모달 위에 모달</button>
    <button type="button" class="btn" bind:this={popInModalAnchor} onclick={() => (popInModalOpen = !popInModalOpen)}>팝오버 열기</button>
  </div>
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => drawerOpen = true}>서랍 열기</button>
    <button type="button" class="btn" onclick={() => { modalOpen = false; lastClose = 'cancel'; }}>취소</button>
    <button type="button" class="btn primary" onclick={() => { modalOpen = false; toast.success(`'${name}' 을(를) 추가했습니다`); }}>추가</button>
  {/snippet}
</Layer>

<Layer bind:open={modal2Open} title="두 번째 모달" width="360px">
  <p>맨 위 층만 Esc 를 받습니다. 딤은 겹쳐 어두워지지 않습니다.</p>
</Layer>

<Layer bind:open={popInModalOpen} variant="popover" anchor={popInModalAnchor} label="모달 안 팝오버" placement="bottom-start">
  <p>모달 위의 팝오버입니다. Tab 을 누르면 닫히고 앵커로 포커스가 돌아갑니다.</p>
  <button type="button" class="btn">동작</button>
</Layer>

<Layer bind:open={drawerOpen} variant="drawer" title="설정" bind:this={drawer} onclose={(r) => (lastClose = r)}>
  <div class="col">
    <Switch bind:checked={sw1}>켜면 완료한 할 일을 숨깁니다</Switch>
    <Switch bind:checked={sw2}>켜면 주말에도 계획을 배치합니다</Switch>
    <button type="button" class="btn" onclick={() => (modalOpen = true)}>서랍 위에 모달</button>
  </div>
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => drawer?.close('cancel')}>닫기</button>
  {/snippet}
</Layer>

<Layer bind:open={sheetOpen} variant="sheet" title="날짜 선택">
  <p>하단 시트입니다. 좁은 화면에서 서랍 대신 씁니다.</p>
</Layer>

<Layer bind:open={popOpen} variant="popover" anchor={popAnchor} label="바쁨 정도" placement="bottom-start">
  <div class="col">
    <button type="button" class="btn ghost">여유</button>
    <button type="button" class="btn ghost">보통</button>
    <button type="button" class="btn ghost">바쁨</button>
  </div>
</Layer>

<Layer bind:open={busyOpen} title="가져오는 중" {busy}>
  <p>{busy ? '처리하는 중에는 Esc·X·바깥 클릭으로 닫히지 않습니다.' : '시작을 누르면 2.5초 동안 닫을 수 없습니다.'}</p>
  {#snippet footer()}
    <button type="button" class="btn" disabled={busy} onclick={() => (busyOpen = false)}>취소</button>
    <button type="button" class="btn primary" disabled={busy} aria-busy={busy} onclick={runBusy}>{busy ? '가져오는 중…' : '시작'}</button>
  {/snippet}
</Layer>

<Layer bind:open={guardOpen} title="가드 시험" canClose={() => allowClose}>
  <Switch bind:checked={allowClose}>켜면 닫을 수 있습니다</Switch>
  <p class="muted">꺼져 있는 동안 canClose 가 false 를 돌려주므로 닫히지 않습니다.</p>
</Layer>

<ToastHost />

<style>
  .gal { max-width: 860px; margin: 0 auto; padding: 16px; display: grid; gap: 24px; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
  .bar h1 { font-size: 20px; margin-right: auto; }
  .inline { display: inline-flex; align-items: center; gap: 8px; }
  .inline select { width: auto; }
  section { display: grid; gap: 10px; }
  section h2 { font-size: 15px; color: var(--muted); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .col { display: grid; gap: 8px; justify-items: start; }
  .sort { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-width: 360px; }
  .srow { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); }
  .grip { cursor: grab; touch-action: none; color: var(--muted); user-select: none; padding: 0 4px; }
</style>

<script lang="ts" module>
  export interface BannerAction {
    label: string;
    onclick: () => void;
    disabled?: boolean;
    /** 강조색 채움(기본 false): 화면의 주 동작일 때만 */
    primary?: boolean;
    /** 접근성 이름이 라벨과 달라야 할 때("다시 시도" 대신 "저장된 데이터 다시 불러오기") */
    ariaLabel?: string;
  }
</script>

<script lang="ts">
  // 화면 위쪽(탭 위 등)에 붙는 한 줄(또는 줄바꿈) 안내 배너. 저장 실패·읽기 실패·다른 탭 변경 같은 '지금 알아야 하는 상태'용.
  //
  //   {#if failed}
  //     <Banner role="alert" tone="danger" actions={[{ label: '다시 시도', onclick: retry }, { label: '내보내기', onclick: exp }]} onclose={dismiss}>
  //       저장된 데이터를 읽을 수 없습니다: 저장소 응답이 없습니다.
  //     </Banner>
  //   {/if}
  //
  // - 나타남·사라짐은 높이가 펼쳐지고 접히는 slide(열림 220ms · 닫힘 200ms, 동작 줄이기에서는 90ms 페이드, data-anim=off 면 즉시).
  //   부모의 `{#if}` 로 붙었다 떨어질 때 재생되도록 global 전환이다.
  // - role: 'alert'(실패·즉시 알림) / 'status'(정보·진행). 기본 status. 둘 다 요소가 붙을 때 보조기술이 읽는다.
  // - 조치 단추는 기본이 일반(.btn) 단추다. 강조색 채움(primary)은 화면 하나에 하나이므로 배너 조치에는 쓰지 않는다.
  //   정말 이 배너의 조치가 그 화면의 주 동작이면 그 항목에만 primary: true.
  // - 닫기 X 는 onclose 를 주면 나타난다(조치가 아니라 '이 안내를 치운다'일 때만).
  import type { Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import { slideFx } from '../motion/motion.svelte';
  import { tip } from './tip';

  interface Props {
    role?: 'alert' | 'status';
    /** 왼쪽 띠 색: info(기본) · warn · danger */
    tone?: 'info' | 'warn' | 'danger';
    /** 문구: 무엇이 어떻다 + 이유. 본문 snippet 이 있으면 snippet 이 우선 */
    message?: string;
    children?: Snippet;
    actions?: BannerAction[];
    /** 단추 줄 앞의 자유 영역(링크 등) */
    extra?: Snippet;
    /** 주면 닫기 X 가 나타난다 */
    onclose?: () => void;
    closeLabel?: string;
    /** false 면 연출 없이 붙고 떨어진다(감싸는 쪽이 이미 연출할 때) */
    animate?: boolean;
  }
  let { role = 'status', tone = 'info', message, children, actions = [], extra, onclose, closeLabel = '닫기', animate = true }: Props = $props();
</script>

<div class="banner" data-tone={tone} {role} transition:slideFx|global={{ off: !animate }}>
  <p class="msg">{#if children}{@render children()}{:else}{message}{/if}</p>
  {#if actions.length || extra || onclose}
    <div class="acts">
      {@render extra?.()}
      {#each actions as a (a.label)}
        <button type="button" class="btn" class:primary={a.primary} aria-label={a.ariaLabel} disabled={a.disabled} onclick={a.onclick}>{a.label}</button>
      {/each}
      {#if onclose}
        <button type="button" class="icon-btn" aria-label={closeLabel} use:tip={closeLabel} onclick={onclose}><X size={18} /></button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .banner {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; min-width: 0;
    padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); color: var(--text);
  }
  /* 한 변만 굵은 색 테두리를 쓰지 않는다: 네 변 테두리 색으로 구분하고, 뜻은 글(제목·본문)이 전한다 */
  .banner[data-tone='info'] { border-color: var(--blue-text); }
  .banner[data-tone='warn'] { border-color: var(--lv-busy); }
  .banner[data-tone='danger'] { border-color: var(--red-text); }
  .msg { flex: 1 1 240px; min-width: 0; overflow-wrap: anywhere; font-size: 14px; }
  .acts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-left: auto; }
</style>

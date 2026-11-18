<script lang="ts">
  // 앱 루트: 셸과, 전역 대화상자(동기화·설정·데이터+변경 이력)를 한 곳에서 마운트한다.
  import Shell from './lib/app/Shell.svelte';
  import SyncDialog from './lib/sync/ui/SyncDialog.svelte';
  import SettingsDrawer from './lib/dialogs/SettingsDrawer.svelte';
  import DataDrawer from './lib/dialogs/DataDrawer.svelte';
  import HistoryPanel from './lib/history/HistoryPanel.svelte';
  import { syncUi } from './lib/sync/state.svelte';

  let settingsOpen = $state(false);
  let dataOpen = $state(false);
  let settingsOpener = $state<HTMLElement | null>(null);
  let dataOpener = $state<HTMLElement | null>(null);
</script>

<Shell
  onopenSync={() => (syncUi.open = true)}
  onopenSettings={(el) => { settingsOpener = el; settingsOpen = true; }}
  onopenData={(el) => { dataOpener = el; dataOpen = true; }}
/>

<SyncDialog />
<SettingsDrawer bind:open={settingsOpen} opener={settingsOpener} />
<DataDrawer bind:open={dataOpen} opener={dataOpener} history={historySection} />

{#snippet historySection()}
  <HistoryPanel />
{/snippet}

<script lang="ts">
  import * as fx from '../../../fixtures/offline';
  import PhoneShell from '../../shell/PhoneShell.svelte';
  import DownloadsScreen from '../DownloadsScreen.svelte';
</script>

<div class="board">
  <PhoneShell active="settings">
    <DownloadsScreen offline={fx.downloadsState} />
  </PhoneShell>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

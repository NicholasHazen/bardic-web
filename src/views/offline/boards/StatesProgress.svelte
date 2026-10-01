<script lang="ts">
  import * as fx from '../../../fixtures/offline';
  import DownloadProgressView from '../DownloadProgressView.svelte';

  /** Not a design board: the download card in the states the boards do not draw (paused, waiting for Wi-Fi, full device, offline, failed). */
  const states = [fx.ashPaused, fx.ashWaitingWifi, fx.ashDeviceFull, fx.ashOffline, fx.ashIdleFailed];
</script>

<div class="gallery">
  {#each states as b}
    <DownloadProgressView book={b} rows={b.chapters.filter((c) => c.state === 'failed' || c.state === 'out_of_date')} unmetered={null} />
  {/each}
</div>

<style>
  .gallery { width: 390px; display: flex; flex-direction: column; gap: 24px; padding: 16px 0; background: var(--base); color: var(--ink); }
</style>

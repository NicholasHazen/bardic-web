<script lang="ts">
  import Button from '../../../components/Button.svelte';
  import * as fx from '../../../fixtures/offline';
  import PhoneShell from '../../shell/PhoneShell.svelte';
  import RoundButton from '../../shell/RoundButton.svelte';
  import DownloadProgressView from '../DownloadProgressView.svelte';
</script>

<div class="board">
  <PhoneShell active="library">
    <div class="page">
      <div class="bar">
        <RoundButton label="Back to library" icon="back" />
        <div class="grow"></div>
        <RoundButton label="Edit this book" icon="more" />
      </div>
      <div class="cta"><Button size={52} icon="play" style="width: 100%">Continue listening</Button></div>
      <DownloadProgressView book={fx.ashDownloading} rows={fx.ashDownloadingRows} unmetered={true} />
    </div>
  </PhoneShell>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
  .page { display: flex; flex-direction: column; gap: 14px; height: 100%; overflow: hidden; }
  .bar { display: flex; align-items: center; padding: 8px 12px 0; }
  .grow { flex: 1; }
  .cta { padding: 0 20px; }
</style>

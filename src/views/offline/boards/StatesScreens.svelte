<script lang="ts">
  import * as fx from '../../../fixtures/offline';
  import PhoneShell from '../../shell/PhoneShell.svelte';
  import DownloadsScreen from '../DownloadsScreen.svelte';
  import ServerOfflineView from '../ServerOfflineView.svelte';
  import OfflineFrame from './OfflineFrame.svelte';

  /** Not a design board: Downloads with removed books, an unknown free space and the rule on; Away from home with nothing on the device. */
</script>

<div class="gallery">
  <div class="cell"><PhoneShell active="settings"><DownloadsScreen offline={fx.downloadsBusyState} /></PhoneShell></div>
  <div class="cell"><OfflineFrame tab="home"><ServerOfflineView playable={[]} inset={100} /></OfflineFrame></div>
</div>

<style>
  .gallery { display: flex; gap: 24px; width: 820px; background: #000; padding: 8px; }
  .cell { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

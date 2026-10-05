<script lang="ts">
  import * as fx from '../../../fixtures/offline';
  import SheetFrame from '../../voices/boards/SheetFrame.svelte';
  import DownloadSheet from '../DownloadSheet.svelte';
</script>

<SheetFrame>
  <DownloadSheet voiceName="Samantha" previews={fx.sheetPreviews} wholeBookEstimate={fx.wholeBookEstimate} chapters={fx.pickChapters} freeBytes={fx.freeBytes} unmetered={true} scrim={0.6} />
</SheetFrame>

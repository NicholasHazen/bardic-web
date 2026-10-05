<script lang="ts">
  import MiniPlayer from '../../../components/MiniPlayer.svelte';
  import * as fx from '../../../fixtures/book';
  import * as lib from '../../../fixtures/library';
  import TabletShell from '../../shell/TabletShell.svelte';
  import BookView from '../BookView.svelte';
</script>

<div class="board">
  <TabletShell active="library">
    <BookView layout="tablet" header={fx.header} primaryLabel="Continue listening" audiobook={fx.samantha} others={[fx.koreTablet]} addRow={false} chapters={fx.allChapters()} ondownload={() => {}} />
    {#snippet player()}<MiniPlayer {...lib.miniPlayer} />{/snippet}
  </TabletShell>
</div>

<style>
  .board { width: 1194px; height: 834px; position: relative; overflow: hidden; }
</style>

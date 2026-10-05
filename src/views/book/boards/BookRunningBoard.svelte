<script lang="ts">
  import MiniPlayer from '../../../components/MiniPlayer.svelte';
  import * as fx from '../../../fixtures/book';
  import * as lib from '../../../fixtures/library';
  import PhoneShell from '../../shell/PhoneShell.svelte';
  import BookView from '../BookView.svelte';
</script>

<div class="board">
  <PhoneShell active="library">
    <BookView header={fx.header} primaryLabel="Continue listening" audiobook={fx.samanthaRunning} chapters={fx.shortChapters(fx.audioRunning)} />
    {#snippet player()}<MiniPlayer {...lib.miniPlayer} />{/snippet}
  </PhoneShell>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

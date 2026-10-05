<script lang="ts">
  import MiniPlayer from '../../../components/MiniPlayer.svelte';
  import * as fx from '../../../fixtures/library';
  import PhoneShell from '../../shell/PhoneShell.svelte';
  import LibraryView from '../LibraryView.svelte';
</script>

<div class="board">
  <PhoneShell active="library">
    <LibraryView listener={fx.listener} books={fx.libraryBooks} count={9} />
    {#snippet player()}<MiniPlayer {...fx.miniPlayer} />{/snippet}
  </PhoneShell>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

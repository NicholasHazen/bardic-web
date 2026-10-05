<script lang="ts">
  import * as fx from '../../../fixtures/manage';
  import * as lib from '../../../fixtures/library';
  import LibraryView from '../../library/LibraryView.svelte';
  import PhoneShell from '../../shell/PhoneShell.svelte';
  import DeletionBanner from '../DeletionBanner.svelte';
</script>

<div class="board">
  <PhoneShell active="library">
    <LibraryView listener={lib.listener} books={fx.libraryAfterDelete} summary={false} />
    {#snippet player()}<DeletionBanner title={fx.book.title} seconds={47} />{/snippet}
  </PhoneShell>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

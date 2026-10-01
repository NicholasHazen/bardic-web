<script lang="ts">
  import Sheet from '../../../components/Sheet.svelte';
  import * as fx from '../../../fixtures/library';
  import PhoneShell from '../../shell/PhoneShell.svelte';
  import DuplicatePanel from '../DuplicatePanel.svelte';
  import LibraryView from '../LibraryView.svelte';
</script>

<div class="board">
  <PhoneShell active="library">
    <LibraryView listener={fx.listener} books={fx.libraryBooksDuplicate} summary={false} />
    {#snippet overlay()}
      <Sheet eyebrow="Add a book" title="Already in your library" onclose={() => {}}>
        <DuplicatePanel fileName={fx.importFile.name} existing={fx.existingAsh} />
      </Sheet>
    {/snippet}
  </PhoneShell>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

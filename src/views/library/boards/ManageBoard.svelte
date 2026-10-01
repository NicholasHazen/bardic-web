<script lang="ts">
  import * as fx from '../../../fixtures/library';
  import PhoneShell from '../../shell/PhoneShell.svelte';
  import ManageView from '../ManageView.svelte';
</script>

<div class="board">
  <PhoneShell active="library" tabbar={false}>
    <ManageView books={fx.manageBooks.slice(0, 3)} count={9} series={fx.manageSeries} editingId="ash" />
  </PhoneShell>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

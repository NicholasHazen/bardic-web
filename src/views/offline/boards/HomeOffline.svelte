<script lang="ts">
  import MiniPlayer from '../../../components/MiniPlayer.svelte';
  import * as fx from '../../../fixtures/library';
  import PhoneShell from '../../shell/PhoneShell.svelte';
  import HomeOfflineView from '../HomeOfflineView.svelte';
</script>

<div class="board">
  <PhoneShell active="home">
    <HomeOfflineView listener={fx.listener} continueItem={fx.continueAsh} books={[...fx.homeOnDevice, ...fx.homeRecent]} />
    {#snippet player()}<MiniPlayer {...fx.miniPlayer} />{/snippet}
  </PhoneShell>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

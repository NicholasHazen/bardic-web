<script lang="ts">
  import MiniPlayer from '../../../components/MiniPlayer.svelte';
  import * as fx from '../../../fixtures/library';
  import TabletShell from '../../shell/TabletShell.svelte';
  import HomeView from '../HomeView.svelte';
  import ListenerButton from '../ListenerButton.svelte';
</script>

<div class="board">
  <TabletShell active="home">
    <HomeView layout="tablet" listener={fx.listener} continueItem={fx.continueAsh} onDevice={fx.homeOnDevice} recent={fx.homeRecent} />
    {#snippet player()}<MiniPlayer {...fx.miniPlayer} />{/snippet}
    {#snippet avatar()}<ListenerButton listener={fx.listener} size={44} selected />{/snippet}
  </TabletShell>
</div>

<style>
  .board { width: 1194px; height: 834px; position: relative; overflow: hidden; }
</style>

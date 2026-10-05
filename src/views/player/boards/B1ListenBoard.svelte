<script lang="ts">
  import * as fx from '../../../fixtures/player';
  import NowPlayingView from '../NowPlayingView.svelte';

</script>

<div class="board">
  <NowPlayingView state={fx.nowPlayingState} appearance={fx.appearancePhone} layout="phone" />
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

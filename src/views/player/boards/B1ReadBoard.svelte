<script lang="ts">
  import * as fx from '../../../fixtures/player';
  import NowPlayingView from '../NowPlayingView.svelte';

</script>

<div class="board">
  <NowPlayingView state={fx.nowPlayingRead} appearance={fx.appearancePhone} layout="phone" markedLineIds={fx.markedLines} />
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

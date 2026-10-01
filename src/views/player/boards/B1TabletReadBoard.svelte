<script lang="ts">
  import * as fx from '../../../fixtures/player';
  import NowPlayingView from '../NowPlayingView.svelte';

</script>

<div class="board">
  <NowPlayingView state={fx.nowPlayingRead} appearance={fx.appearancePortrait} layout="tablet-portrait" markedLineIds={fx.markedLines} />
</div>

<style>
  .board { width: 834px; height: 1194px; position: relative; overflow: hidden; }
</style>

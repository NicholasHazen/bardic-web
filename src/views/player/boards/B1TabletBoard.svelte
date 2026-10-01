<script lang="ts">
  import * as fx from '../../../fixtures/player';
  import NowPlayingView from '../NowPlayingView.svelte';

</script>

<div class="board">
  <NowPlayingView state={fx.nowPlayingState} appearance={fx.appearanceLandscape} layout="tablet-landscape" markedLineIds={fx.markedLines} />
</div>

<style>
  .board { width: 1194px; height: 834px; position: relative; overflow: hidden; }
</style>

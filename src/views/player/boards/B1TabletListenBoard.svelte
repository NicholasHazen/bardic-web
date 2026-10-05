<script lang="ts">
  import * as fx from '../../../fixtures/player';
  import NowPlayingView from '../NowPlayingView.svelte';

</script>

<div class="board">
  <NowPlayingView state={fx.nowPlayingState} appearance={fx.appearancePortrait} layout="tablet-portrait" byline={fx.byline} />
</div>

<style>
  .board { width: 834px; height: 1194px; position: relative; overflow: hidden; }
</style>

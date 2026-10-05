<script lang="ts">
  import * as pfx from '../../../fixtures/player';
  import * as fx from '../../../fixtures/offline';
  import NowPlayingView from '../../player/NowPlayingView.svelte';
</script>

<div class="board">
  <NowPlayingView state={pfx.nowPlayingRead} appearance={pfx.appearancePhone} layout="phone" markedLineIds={pfx.markedLines} download={{ fraction: fx.ringFraction, label: fx.ringLabelText }} />
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

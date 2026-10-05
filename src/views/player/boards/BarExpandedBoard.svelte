<script lang="ts">
  import * as fx from '../../../fixtures/player';
  import BarExpanded from '../BarExpanded.svelte';
  import BarExpandedBackdrop from './BarExpandedBackdrop.svelte';
</script>

<div class="board">
  <BarExpandedBackdrop />
  <BarExpanded state={fx.nowPlayingState} />
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

<script lang="ts">
  import type { Glow } from '../../../components/Aura.svelte';
  import * as fx from '../../../fixtures/player';
  import NowPlayingView from '../NowPlayingView.svelte';

  // This board draws its glows a little differently from the other Read boards (smaller, other blurs).
  const glows: Glow[] = [
    { x: -90, y: -80, size: 360, color: 'var(--glow)', opacity: 0.55, blur: 80 },
    { x: 200, y: 520, size: 340, color: 'var(--glow2)', opacity: 0.42, blur: 90 },
    { x: -60, y: 650, size: 260, color: 'var(--glow)', opacity: 0.22, blur: 80 },
  ];
</script>

<div class="board">
  <NowPlayingView state={fx.nowPlayingRead} appearance={fx.appearancePhone} layout="phone" markedLineIds={fx.markedLines} controlsOpen {glows} />
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

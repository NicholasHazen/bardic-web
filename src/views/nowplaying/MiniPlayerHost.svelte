<script lang="ts">
  import { player } from '../../player/player';
  import { SPEEDS } from '../../player/types';
  import MiniPlayerBar from '../player/MiniPlayerBar.svelte';

  /** The bar above the tab bar on every screen while a book is loaded. */
  const nextSpeed = (cur: number) => SPEEDS.find((s) => s > cur + 0.001) ?? SPEEDS[0];
</script>

<MiniPlayerBar
  state={$player}
  onexpand={() => $player.book && (location.hash = `#/listen/${$player.book.id}`)}
  onplaypause={() => player.toggle()}
  onspeed={() => player.setSpeed(nextSpeed($player.speed))}
/>

<script lang="ts">
  import MiniPlayer from '../../components/MiniPlayer.svelte';
  import { barDetail, speedLabel, type BarState } from './nowPlaying';

  interface Props {
    state: BarState;
    /** tap the cover or the title: open Now Playing */
    onexpand?: () => void;
    onplaypause?: () => void;
    onspeed?: () => void;
  }
  let { state, onexpand, onplaypause, onspeed }: Props = $props();
</script>

<!-- The bar above the tab bar (phone) or at the bottom of the content (tablet). Nothing loaded: no bar. -->
{#if state.loaded && state.book}
  <div class="bar">
    <button type="button" class="open" aria-label="Open Now Playing: {state.book.title}" onclick={onexpand}></button>
    <MiniPlayer
      title={state.book.title}
      detail={barDetail(state)}
      color={state.book.coverColor}
      progress={state.bookProgress}
      speed={speedLabel(state.speed)}
      playing={state.playing}
      {onplaypause}
      {onspeed}
    />
  </div>
{/if}

<style>
  .bar { position: relative; }
  /* the tap target for "open" sits under the bar's own buttons, which stay on top */
  .open { position: absolute; inset: 0; padding: 0; border: 0; border-radius: 20px; background: transparent; cursor: pointer; }
  .bar :global(.glass) { pointer-events: none; }
  .bar :global(.glass button) { pointer-events: auto; }
</style>

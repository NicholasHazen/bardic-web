<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    w: number;
    h: number;
    /**
     * Strength of the dimming behind a sheet on this board (the design uses 0.3 over Now Playing and 0.6 over Home;
     * the shared Sheet draws 0.55). Board only: the real screens use the Sheet's own.
     */
    scrim?: number;
    children: Snippet;
  }
  let { w, h, scrim, children }: Props = $props();
</script>

<!-- A board is the screen at the design's own size. -->
<div class="frame" class:scrimmed={scrim !== undefined} style:width="{w}px" style:height="{h}px" style:--scrim={scrim}>
  {@render children()}
</div>

<style>
  .frame { position: relative; overflow: hidden; background: #1a0e0c; }
  .scrimmed :global(.scrim) { background: rgba(10, 8, 16, var(--scrim)); }
</style>

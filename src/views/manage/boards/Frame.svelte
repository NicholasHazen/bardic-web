<script lang="ts">
  import type { Snippet } from 'svelte';
  /** A board is the screen at the design's own size (390 x 844). */
  let { children }: { children: Snippet } = $props();
</script>

<div class="frame">{@render children()}</div>

<style>
  .frame { position: relative; width: 390px; height: 844px; overflow: hidden; background: #1a0e0c; }
</style>

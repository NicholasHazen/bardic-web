<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    w: number;
    h: number;
    children: Snippet;
  }
  let { w, h, children }: Props = $props();
</script>

<!-- A board is the screen at the design's own size. -->
<div style:width="{w}px" style:height="{h}px" style="position:relative;overflow:hidden;background:#1a0e0c">
  {@render children()}
</div>

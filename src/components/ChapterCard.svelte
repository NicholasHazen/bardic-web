<script lang="ts">
  import type { Snippet } from 'svelte';
  import Glass from './Glass.svelte';
  /** The glass card that holds ChapterRow items, with an optional footer action. */
  let { children, footer }: { children: Snippet; footer?: Snippet } = $props();
</script>

<Glass radius={16} style="margin: 0; overflow: hidden">
  {@render children()}
  {#if footer}<div class="footer">{@render footer()}</div>{/if}
</Glass>

<style>
  .footer { padding: 2px 8px; }
</style>

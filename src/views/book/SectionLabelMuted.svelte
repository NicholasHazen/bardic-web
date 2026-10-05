<script lang="ts">
  import type { Snippet } from 'svelte';
  /** The small caps label of the book page ("Audiobook", "Other audiobooks"): muted, unlike the accent SectionLabel. */
  let { children }: { children: Snippet } = $props();
</script>

<h2>{@render children()}</h2>

<style>
  h2 {
    margin: 0;
    padding: var(--label-pad, 0 24px);
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    line-height: 1.35;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
</style>

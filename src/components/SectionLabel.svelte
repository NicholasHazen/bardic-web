<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<span class="label">{@render children()}</span>

<style>
  .label {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    line-height: 1.35;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
</style>

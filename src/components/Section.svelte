<script lang="ts">
  import type { Snippet } from 'svelte';
  import SectionLabel from './SectionLabel.svelte';
  let { label, children }: { label: string; children: Snippet } = $props();
</script>

<div class="section">
  <SectionLabel>{label}</SectionLabel>
  {@render children()}
</div>

<style>
  .section { display: flex; flex-direction: column; gap: 14px; }
</style>

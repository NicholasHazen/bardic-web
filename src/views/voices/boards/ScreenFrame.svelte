<script lang="ts">
  import type { Snippet } from 'svelte';
  import PhoneShell from '../../shell/PhoneShell.svelte';

  /** A Settings screen at the phone's size with the tab bar, as the boards draw them. */
  let { children }: { children: Snippet } = $props();
</script>

<div class="board">
  <PhoneShell active="settings">{@render children()}</PhoneShell>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

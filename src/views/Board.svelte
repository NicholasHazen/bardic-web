<script lang="ts">
  import { boards } from './boards';

  let { name }: { name: string } = $props();
  const View = $derived(boards[name]);
</script>

<!-- A design board rendered from fixtures, at the board's own size. The design check opens
     these routes; the same views are what the real screens are built from. -->
{#if View}
  <View />
{:else}
  <p style="padding: 24px">No board called “{name}” has been built yet.</p>
{/if}

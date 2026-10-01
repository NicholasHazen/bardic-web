<script lang="ts">
  import { route } from './lib/router';
  import Board from './views/Board.svelte';
  import Health from './views/Health.svelte';
</script>

{#if $route.startsWith('/board/')}
  <Board name={$route.slice('/board/'.length)} />
{:else}
  <Health />
{/if}

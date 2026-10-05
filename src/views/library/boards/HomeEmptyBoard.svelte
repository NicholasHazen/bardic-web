<script lang="ts">
  import * as fx from '../../../fixtures/library';
  import PhoneShell from '../../shell/PhoneShell.svelte';
  import HomeView from '../HomeView.svelte';
</script>

<div class="board">
  <PhoneShell active="home">
    <HomeView listener={fx.listener} empty />
  </PhoneShell>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

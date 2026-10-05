<script lang="ts">
  import * as fx from '../../../fixtures/manage';
  import PhoneShell from '../../shell/PhoneShell.svelte';
  import ServerNameView from '../ServerNameView.svelte';
</script>

<div class="board">
  <PhoneShell active="settings">
    <ServerNameView name={fx.serverName} details={fx.serverDetails} />
  </PhoneShell>
</div>

<style>
  .board { width: 390px; height: 844px; position: relative; overflow: hidden; }
</style>

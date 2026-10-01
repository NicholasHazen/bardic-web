<script lang="ts">
  import { listenerStore } from '../../state/listener';
  import AddListenerSheet from './AddListenerSheet.svelte';
  import { rowsOf } from './connect';
  import DeleteListenerSheet from './DeleteListenerSheet.svelte';
  import EditListenerSheet from './EditListenerSheet.svelte';
  import ManageScreen from './ManageScreen.svelte';

  interface Props {
    /** Back to Settings. */
    onback?: () => void;
  }
  let { onback }: Props = $props();

  type Mode = { kind: 'none' } | { kind: 'add' } | { kind: 'edit'; id: string } | { kind: 'delete'; id: string };
  let mode = $state<Mode>({ kind: 'none' });

  const rows = $derived(rowsOf($listenerStore.listeners));
  const close = () => (mode = { kind: 'none' });
</script>

<!-- Settings > Listeners (L5). Add, rename and delete are sheets over the list. -->
<div class="page">
  <ManageScreen listeners={rows} currentId={$listenerStore.currentId} intro={mode.kind === 'none'} {onback} onedit={(id) => (mode = { kind: 'edit', id })} onadd={() => (mode = { kind: 'add' })} />
  {#if mode.kind === 'add'}
    <AddListenerSheet select={false} onadded={close} onclose={close} />
  {:else if mode.kind === 'edit'}
    {@const id = mode.id}
    <EditListenerSheet {id} ondelete={() => (mode = { kind: 'delete', id })} onclose={close} />
  {:else if mode.kind === 'delete'}
    <DeleteListenerSheet id={mode.id} ondeleted={close} onclose={close} />
  {/if}
</div>

<style>
  .page { position: relative; width: 100%; min-height: 100%; height: 100%; }
</style>

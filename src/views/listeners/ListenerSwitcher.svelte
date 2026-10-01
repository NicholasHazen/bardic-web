<script lang="ts">
  import { listenerStore } from '../../state/listener';
  import AddListenerSheet from './AddListenerSheet.svelte';
  import { rowsOf } from './connect';
  import SwitchSheet from './SwitchSheet.svelte';

  interface Props {
    /** Phone: a sheet from the bottom. Tablet: a card beside the rail. */
    placement?: 'bottom' | 'popover';
    /** Set while audio plays: the sheet says that switching pauses it (L4). */
    playing?: { bookTitle: string } | null;
    /** Called before this device switches to a different listener; pause playback here (L4). */
    onbeforeswitch?: () => void;
    /** Open Settings, Listeners. The sheet closes first. */
    onmanage?: () => void;
    onclose?: () => void;
  }
  let { placement = 'bottom', playing = null, onbeforeswitch, onmanage, onclose }: Props = $props();

  let adding = $state(false);
  const rows = $derived(rowsOf($listenerStore.listeners));

  function choose(id: string) {
    if (id !== $listenerStore.currentId) {
      onbeforeswitch?.();
      listenerStore.select(id);
    }
    onclose?.();
  }
</script>

{#if adding}
  <AddListenerSheet select={false} onadded={() => (adding = false)} onclose={() => (adding = false)} />
{:else}
  <SwitchSheet
    listeners={rows}
    currentId={$listenerStore.currentId}
    {playing}
    {placement}
    fixed
    onselect={choose}
    onadd={() => (adding = true)}
    onmanage={() => {
      onclose?.();
      onmanage?.();
    }}
    {onclose}
  />
{/if}

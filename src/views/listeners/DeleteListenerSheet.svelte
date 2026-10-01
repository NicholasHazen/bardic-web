<script lang="ts">
  import { onMount } from 'svelte';
  import { listenerStore } from '../../state/listener';
  import { saveErrorText } from './connect';
  import DeleteSheet from './DeleteSheet.svelte';

  interface Props {
    id: string;
    /** Called after the listener is gone. */
    ondeleted?: () => void;
    onclose?: () => void;
  }
  let { id, ondeleted, onclose }: Props = $props();

  const target = $derived($listenerStore.listeners.find((l) => l.id === id));
  // Remember the name so the sheet can still say who was deleted while it closes.
  let name = $state($listenerStore.listeners.find((l) => l.id === id)?.name ?? '');
  $effect(() => {
    if (target) name = target.name;
  });

  let booksStarted = $state<number | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  onMount(async () => {
    const r = await listenerStore.impact(id);
    booksStarted = r.ok ? r.value.books_started : null;
  });

  const others = $derived($listenerStore.listeners.filter((l) => l.id !== id).map((l) => l.name));

  async function confirm() {
    busy = true;
    error = null;
    const r = await listenerStore.remove(id);
    busy = false;
    if (r.ok) ondeleted?.();
    else error = r.error.code === 'last_listener' ? 'Bardic always keeps one listener, so the last one can’t be deleted.' : saveErrorText(r.error);
  }
</script>

<DeleteSheet {name} otherNames={others} {booksStarted} {busy} {error} fixed onconfirm={confirm} {onclose} />

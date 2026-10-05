<script lang="ts">
  import { avatarHue, cleanName, nameFeedback } from '../../lib/listenerText';
  import { listenerStore } from '../../state/listener';
  import { saveErrorText } from './connect';
  import NameSheet from './NameSheet.svelte';

  interface Props {
    id: string;
    ondelete?: () => void;
    onclose?: () => void;
  }
  let { id, ondelete, onclose }: Props = $props();

  const stored = $derived($listenerStore.listeners.find((l) => l.id === id));
  // The field starts from the stored name once; later renames from other devices do not overwrite typing.
  let name = $state($listenerStore.listeners.find((l) => l.id === id)?.name ?? '');
  let busy = $state(false);
  let serverError = $state<string | null>(null);

  const feedback = $derived(serverError ?? nameFeedback(name, $listenerStore.listeners, id));
  const unchanged = $derived(cleanName(name) === stored?.name);

  async function save() {
    busy = true;
    serverError = null;
    const r = await listenerStore.rename(id, name);
    busy = false;
    if (r.ok) onclose?.();
    else serverError = saveErrorText(r.error);
  }

  // A listener deleted on another device closes the sheet instead of editing nothing.
  $effect(() => {
    if (!stored) onclose?.();
  });
</script>

{#if stored}
  <NameSheet
    mode="edit"
    eyebrow={$listenerStore.listeners.length === 1 ? 'Listeners' : `Listeners · ${stored.name}`}
    bind:name
    hue={avatarHue(id)}
    avatarName={stored.name}
    error={feedback}
    {unchanged}
    onlyOne={$listenerStore.listeners.length === 1}
    {busy}
    fixed
    onsave={save}
    {ondelete}
    {onclose}
  />
{/if}

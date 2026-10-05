<script lang="ts">
  import { avatarHue, nameFeedback } from '../../lib/listenerText';
  import { listenerStore, type Listener } from '../../state/listener';
  import { saveErrorText } from './connect';
  import NameSheet from './NameSheet.svelte';

  interface Props {
    /** Also switch this device to the new listener. Default: only when none is selected yet. */
    select?: boolean;
    onadded?: (listener: Listener) => void;
    onclose?: () => void;
  }
  let { select, onadded, onclose }: Props = $props();

  let name = $state('');
  let busy = $state(false);
  let serverError = $state<string | null>(null);

  const feedback = $derived(serverError ?? nameFeedback(name, $listenerStore.listeners));

  async function save() {
    busy = true;
    serverError = null;
    const r = await listenerStore.create(name, { select });
    busy = false;
    if (r.ok) onadded?.(r.value);
    else serverError = saveErrorText(r.error);
  }
</script>

<NameSheet
  mode="add"
  eyebrow="Listeners"
  bind:name
  hue={avatarHue(name)}
  error={feedback}
  {busy}
  fixed
  onsave={save}
  {onclose}
/>

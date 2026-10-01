<script lang="ts">
  import { onMount } from 'svelte';
  import { sources, voiceActions } from '../../state/voices';
  import type { SourceKind } from '../../lib/voiceText';
  import SetupVoiceView from './SetupVoiceView.svelte';

  /**
   * First-time voice set up (V8): shown when no source is set up. Breeze and Gemini continue on their own screens
   * (`#/settings/voices/breeze`, `#/settings/premium`); "Use these voices" takes the voices on Your Bardic computer
   * and calls `oncomplete`.
   */
  interface Props {
    onclose?: () => void;
    /** A source was set up here; the chooser can open. */
    oncomplete?: () => void;
    /** Read the sources when shown. The voice chooser, which has read them already, turns this off. */
    load?: boolean;
    placement?: 'bottom' | 'popover';
  }
  let { onclose, oncomplete, load = true, placement = 'bottom' }: Props = $props();

  let busy = $state<SourceKind | null>(null);
  let error = $state('');

  onMount(() => {
    if (load) void voiceActions.openVoiceScreen();
  });

  function leaveTo(hash: string) {
    location.hash = hash;
    onclose?.();
  }
  async function useLocal() {
    busy = 'local';
    error = '';
    const r = await voiceActions.configure('local', { enabled: true });
    busy = null;
    if (r.ok) oncomplete?.();
    else error = `Nothing was changed. ${r.detail}`;
  }
</script>

<SetupVoiceView
  sources={$sources.items}
  {busy}
  {error}
  {placement}
  fixed
  {onclose}
  onbreeze={() => leaveTo('#/settings/voices/breeze')}
  ongemini={() => leaveTo('#/settings/premium')}
  onlocal={useLocal}
/>

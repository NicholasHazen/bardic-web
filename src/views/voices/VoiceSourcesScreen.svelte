<script lang="ts">
  import { onMount } from 'svelte';
  import { sources, voiceActions } from '../../state/voices';
  import SourcesView from './SourcesView.svelte';

  /**
   * Settings > Voices ([VoiceSources], V5): one card per source with its status. Reads the sources when shown and asks
   * each set-up source to re-read its voices (V9). Route `#/settings/voices`; the integrator puts it inside the Shell.
   */
  interface Props {
    onback?: () => void;
    /** Default to the hash routes `#/settings/voices/breeze`, `#/settings/premium` (W4) and `#/settings/voices/default`. */
    onmanagebreeze?: () => void;
    onmanagekey?: () => void;
    onvoices?: () => void;
  }
  let {
    onback = () => (location.hash = '#/settings'),
    onmanagebreeze = () => (location.hash = '#/settings/voices/breeze'),
    onmanagekey = () => (location.hash = '#/settings/premium'),
    onvoices = () => (location.hash = '#/settings/voices/default'),
  }: Props = $props();

  onMount(() => void voiceActions.openVoiceScreen());
</script>

<SourcesView
  sources={$sources.items}
  loading={$sources.status === 'loading' || $sources.status === 'idle'}
  error={$sources.status === 'error' ? `Your Bardic computer could not be reached, so the sources may be out of date. ${$sources.error ?? ''}`.trim() : ''}
  {onback}
  {onmanagebreeze}
  {onmanagekey}
  {onvoices}
  onretry={() => voiceActions.openVoiceScreen()}
/>

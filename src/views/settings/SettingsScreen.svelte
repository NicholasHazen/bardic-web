<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../../api/client';
  import { avatarHue } from '../../lib/listenerText';
  import { allowanceSummary, defaultVoiceSummary } from '../../lib/voiceText';
  import { currentListener, listenerStore } from '../../state/listener';
  import { listenerSettings, settingsActions, sources, voiceActions, voices } from '../../state/voices';
  import { offline } from '../../offline/offline';
  import { downloadsSummary } from '../offline/connected/mapping';
  import { KeyProblemBanner } from '../account';
  import SettingsView from './SettingsView.svelte';

  /**
   * Settings ([Settings]): the listener, voices, Allowance and this device. Shown in the Shell on `#/settings`.
   * The rows link to `#/settings/listeners`, `#/settings/voices/default`, `#/settings/voices/breeze`,
   * `#/settings/premium` (PremiumAccountScreen), `#/settings/voices`, `#/settings/allowance` (AllowanceScreen), `#/settings/downloads` (W5) and
   * `#/settings/reader` (W3).
   */
  interface Props {
    /** Opens the listener switcher. The Listener row opens Listeners (where switching lives), so this is not used on a phone. */
    onswitchlistener?: () => void;
    /** Overrides the summary of the Downloads row (by default "1.2 GB · 3 books", from what this device holds). */
    downloads?: string;
  }
  let { onswitchlistener, downloads }: Props = $props();
  const downloadsLine = $derived(downloads ?? downloadsSummary($offline));

  const who = $derived(currentListener($listenerStore));
  const listenerId = $derived($listenerStore.currentId);
  let allowance = $state('');

  const defaultVoice = $derived.by(() => {
    const id = $listenerSettings.settings?.default_voice_id;
    return defaultVoiceSummary(id ? $voices.items.find((v) => v.id === id) : null);
  });

  onMount(() => {
    void voiceActions.loadSources();
    void voiceActions.loadVoices();
    if (listenerId) void settingsActions.load(listenerId);
    void api
      .GET('/api/allowance')
      .then((r) => {
        if (r.response.ok && r.data) allowance = allowanceSummary(r.data);
      })
      .catch(() => {});
  });
</script>

<!-- shown only while the Google key is rejected; what is kept comes first -->
<KeyProblemBanner />
<SettingsView
  listener={{ name: who?.name ?? '', hue: who ? avatarHue(who.id) : undefined }}
  {defaultVoice}
  sources={$sources.items}
  allowance={allowance || 'Monthly limit and what was spent'}
  downloads={downloadsLine}
  {onswitchlistener}
/>

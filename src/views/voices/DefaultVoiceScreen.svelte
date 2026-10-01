<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { defaultDetail, geminiReady, groupVoices, toRow } from '../../lib/voiceText';
  import { listenerStore } from '../../state/listener';
  import { listenerSettings, samples, settingsActions, sources, voiceActions, voices } from '../../state/voices';
  import DefaultVoiceView from './DefaultVoiceView.svelte';

  /**
   * Settings > Default voice ([VoiceDefault], V6): used when the listener presses play on a book with no audiobook yet.
   * Saved to the listener's settings as soon as a voice is chosen. Route `#/settings/voices/default`.
   */
  interface Props {
    onback?: () => void;
  }
  let { onback = () => (location.hash = '#/settings') }: Props = $props();

  const listenerId = $derived($listenerStore.currentId);
  const groups = $derived(groupVoices($voices.items));
  const ordered = $derived([...groups.free, ...groups.premium]);
  const keyOk = $derived(geminiReady($sources.items));
  const rows = $derived(ordered.map((v) => ({ ...toRow(v, defaultDetail), hint: v.tier === 'free' ? 'Free. Nothing is spent.' : keyOk ? 'A short example. It counts toward spending.' : 'A Google key is needed to hear a premium example.' })));
  let message = $state('');
  let failed = $state('');

  onMount(() => {
    void voiceActions.openVoiceScreen();
    if (listenerId) void settingsActions.load(listenerId);
  });
  onDestroy(() => samples.stop());

  async function pick(id: string) {
    if (!listenerId) return;
    failed = '';
    message = '';
    const r = await settingsActions.setDefaultVoice(listenerId, id);
    const name = ordered.find((v) => v.id === id)?.name ?? 'The voice';
    if (r.ok) message = `Default voice saved: ${name}.`;
    else failed = r.code === 'voice_not_found' ? 'That voice no longer exists. Nothing was changed.' : `Nothing was changed. ${r.detail}`;
  }
  function hear(id: string) {
    const v = $voices.items.find((x) => x.id === id);
    if (v) void samples.hear(v, keyOk);
  }
  const sampleLine = $derived($samples.voiceId && rows.some((r) => r.id === $samples.voiceId) ? $samples.message : '');
</script>

<DefaultVoiceView
  {rows}
  selectedId={$listenerSettings.settings?.default_voice_id ?? null}
  playingId={$samples.phase === 'loading' || $samples.phase === 'playing' ? $samples.voiceId : null}
  status={sampleLine || message}
  error={failed}
  loading={$voices.status === 'loading' || $voices.status === 'idle'}
  {onback}
  onpick={pick}
  onhear={hear}
/>

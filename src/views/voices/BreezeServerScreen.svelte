<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    addressProblem,
    connectProblem,
    geminiReady,
    isConfigured,
    normalizeAddress,
    serverDetail,
    sourceByKind,
    sourceProblem,
    toRow,
    voicesFound,
    type SourceProblem,
    type VoiceSource,
  } from '../../lib/voiceText';
  import { samples, sources, voiceActions, voices } from '../../state/voices';
  import BreezeView from './BreezeView.svelte';

  /**
   * Breeze server ([BreezeServer], V5): the address, a connection test, and the voices it reports. The voices are read
   * again when the screen opens. "Test connection" on a new address sets the server up (the server tests it first and
   * stores nothing when it fails); on the saved address it only tests. Route `#/settings/voices/breeze`.
   */
  interface Props {
    onback?: () => void;
  }
  let { onback = () => (location.hash = '#/settings/voices') }: Props = $props();

  const source = $derived(sourceByKind($sources.items, 'breeze'));
  const rows = $derived($voices.items.filter((v) => v.source_id === 'breeze').map((v) => ({ ...toRow(v, serverDetail), hint: 'Free. Nothing is spent.' })));
  const keyOk = $derived(geminiReady($sources.items));

  let address = $state('');
  let busy = $state<'test' | 'refresh' | null>(null);
  let problem = $state<SourceProblem | null>(null);

  // Fill the field with the saved address once the sources are read; after that it is the listener's.
  let filled = false;
  $effect(() => {
    if (filled || $sources.status !== 'ready') return;
    filled = true;
    if (source?.base_url) address = source.base_url;
  });

  onMount(() => void voiceActions.openVoiceScreen());
  onDestroy(() => samples.stop());

  const callout = $derived.by(() => {
    if (busy === 'test') return { tone: 'info' as const, title: 'Testing', body: 'Asking your server for its voices.' };
    if (problem) return { tone: 'error' as const, title: problem.title, body: problem.body };
    if (source && isConfigured(source)) {
      const p = sourceProblem(source);
      if (p) return { tone: 'error' as const, title: p.title, body: p.body };
      return { tone: 'good' as const, title: 'Connected', body: `${voicesFound(source.voice_count)}. Bardic asks your server for its voices when you open this screen and once a day.` };
    }
    return { tone: 'info' as const, title: 'Not set up', body: 'Enter the address of your Breeze server, then press Test connection.' };
  });

  function applied(r: { ok: true; value: VoiceSource } | { ok: false; detail: string; code?: string }) {
    if (r.ok) {
      problem = null;
      if (r.value.base_url) address = r.value.base_url;
    } else {
      problem = connectProblem(r.code, r.detail);
    }
  }

  async function test() {
    const bad = addressProblem(address);
    if (bad) {
      problem = { title: 'Check the address', body: bad };
      return;
    }
    const wanted = normalizeAddress(address);
    busy = 'test';
    problem = null;
    const r = source?.base_url === wanted && isConfigured(source) ? await voiceActions.test('breeze') : await voiceActions.configure('breeze', { base_url: wanted });
    busy = null;
    applied(r);
  }

  async function refresh() {
    busy = 'refresh';
    problem = null;
    const r = await voiceActions.refresh('breeze');
    busy = null;
    applied(r);
  }

  function hear(id: string) {
    const v = $voices.items.find((x) => x.id === id);
    if (v) void samples.hear(v, keyOk);
  }
  const status = $derived($samples.voiceId && rows.some((r) => r.id === $samples.voiceId) ? $samples.message : '');
</script>

<BreezeView
  bind:address
  {callout}
  {rows}
  total={source?.voice_count ?? rows.length}
  showVoices={!!source && isConfigured(source)}
  playingId={$samples.phase === 'loading' || $samples.phase === 'playing' ? $samples.voiceId : null}
  {status}
  {busy}
  {onback}
  ontest={test}
  onrefresh={refresh}
  onhear={hear}
/>

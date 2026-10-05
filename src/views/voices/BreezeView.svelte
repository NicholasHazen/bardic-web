<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Field from '../../components/Field.svelte';
  import type { SourceProblem, VoiceRowModel } from '../../lib/voiceText';
  import ScreenHead from './ScreenHead.svelte';
  import StatusCallout from './StatusCallout.svelte';
  import VoiceList from './VoiceList.svelte';

  /** Breeze server (V5): the address, a connection test, and the voices the server reports. */
  interface Props {
    address: string;
    /** What the connection callout says: tone, title and text. */
    callout: { tone: 'good' | 'info' | 'warn' | 'error'; title: string; body: string };
    rows: VoiceRowModel[];
    /** How many voices the server reports (the list may show fewer). */
    total: number;
    /** "Voices from your server" is shown while the server is set up. */
    showVoices?: boolean;
    playingId?: string | null;
    /** What the last example did, in words. */
    status?: string;
    busy?: 'test' | 'refresh' | null;
    onback?: () => void;
    ontest?: () => void;
    onrefresh?: () => void;
    onhear?: (id: string) => void;
  }
  let { address = $bindable(''), callout, rows, total, showVoices = true, playingId = null, status = '', busy = null, onback, ontest, onrefresh, onhear, }: Props = $props();
</script>

<div class="col">
  <ScreenHead title="Breeze" {onback} />
  <div class="pad">
    <div class="stack">
      <Field label="Server address" id="breeze-address" bind:value={address} inputmode="url" autocomplete="off" autocapitalize="off" spellcheck={false} placeholder="http://breeze.local:8080" />
      <StatusCallout tone={callout.tone} title={callout.title}>{callout.body}</StatusCallout>
    </div>
  </div>
  {#if showVoices}
    <section class="section" aria-labelledby="breeze-voices">
      <h2 id="breeze-voices">Voices from your server · {total}</h2>
      {#if status}<p class="live" role="status">{status}</p>{/if}
      <VoiceList {rows} choosable={false} {playingId} label="Voices from your server" style="margin:0 20px" {onhear} />
    </section>
  {/if}
  <div class="pad">
    <div class="buttons">
      <Button variant="glass" disabled={busy !== null} onclick={() => ontest?.()}>{busy === 'test' ? 'Testing…' : 'Test connection'}</Button>
      {#if showVoices}<Button variant="glass" disabled={busy !== null} onclick={() => onrefresh?.()}>{busy === 'refresh' ? 'Refreshing…' : 'Refresh voices'}</Button>{/if}
    </div>
  </div>
</div>

<style>
  .col { display: flex; flex-direction: column; gap: 14px; }
  .pad { padding: 0 20px; }
  .stack { display: flex; flex-direction: column; gap: 12px; }
  .section { display: flex; flex-direction: column; gap: 8px; }
  h2 { line-height: 1.35; margin: 0; padding: 0 24px; font-family: var(--font-ui); font-size: 12px; font-weight: 700; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase; }
  .buttons { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .live { margin: 0 24px; font-family: var(--font-ui); font-size: 13px; line-height: 1.35; color: var(--muted); }
</style>

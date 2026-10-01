<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import ScreenHead from '../voices/ScreenHead.svelte';
  import type { KeyBusy } from '../../state/allowance';
  import KeyField from './KeyField.svelte';

  /**
   * Premium voices, the Gemini account ([PremiumAccount]): enter or replace the key, check it, remove it. The key is
   * write-only: the field only ever holds what is being typed, and it is empty again as soon as the key is sent.
   */
  interface Props {
    /** connected: a key is stored and works. not_set_up: no key. unreachable: the key could not be checked just now. */
    status: 'connected' | 'not_set_up' | 'unreachable';
    draft?: string;
    callout: { tone: 'info' | 'warn' | 'error'; title: string; body: string };
    busy?: KeyBusy;
    /** Under the field: why a button is waiting, or what to do next. */
    hint?: string;
    /** "Prices as of 30 September 2026, from a list entered by hand." */
    prices?: string;
    onback?: () => void;
    oncheck?: () => void;
    ontest?: () => void;
    onremove?: () => void;
    oncancel?: () => void;
  }
  let { status, draft = $bindable(''), callout, busy = null, hint = '', prices = '', onback, oncheck, ontest, onremove, oncancel }: Props = $props();

  const typing = $derived(draft.trim().length > 0);
  const placeholder = $derived(status === 'connected' ? '••••••••••••••••••••' : 'Paste your Google API key');
  const btn = 'height:48px;border-radius:24px';
</script>

<div class="col">
  <ScreenHead title="Premium voices" {onback} />
  <div class="pad">
    <div class="stack">
      <KeyField id="gemini-key" label="Google API key" bind:value={draft} mark={status === 'connected' && !typing ? 'ok' : 'none'} {placeholder} describedby={hint ? 'gemini-key-hint' : undefined} />
      {#if hint}<span id="gemini-key-hint" class="hint">{hint}</span>{/if}
      <div aria-live="polite"><Callout tone={callout.tone} title={callout.title}>{callout.body}</Callout></div>
      <Glass radius={16} style="padding:14px">
        <div class="sent">
          <h2>What is sent</h2>
          <p>Only the words being spoken, one chunk at a time. Never your library, your name or your other listeners.</p>
        </div>
      </Glass>
      <div class="buttons">
        {#if typing}
          <Button style={btn} disabled={busy !== null} onclick={() => oncheck?.()}>{busy === 'check' ? 'Checking…' : status === 'connected' ? 'Replace key' : 'Check key'}</Button>
          <Button variant="glass" style={btn} disabled={busy !== null} onclick={() => oncancel?.()}>Cancel</Button>
        {:else if status === 'not_set_up'}
          <Button style={btn} disabled>Check key</Button>
        {:else}
          <Button variant="glass" style={btn} disabled={busy !== null} onclick={() => ontest?.()}>{busy === 'test' ? 'Testing…' : 'Test again'}</Button>
          <Button variant="remove" style={btn} disabled={busy !== null} onclick={() => onremove?.()}>Remove key</Button>
        {/if}
      </div>
      <span class="note">The key is stored on your Bardic computer and is never sent to the apps you open Bardic from.</span>
      {#if prices}<span class="note">{prices}</span>{/if}
    </div>
  </div>
</div>

<style>
  .col { display: flex; flex-direction: column; gap: 16px; }
  .pad { padding: 0 20px; }
  .stack { display: flex; flex-direction: column; gap: 16px; }
  .sent { display: flex; flex-direction: column; gap: 10px; }
  h2 { margin: 0; font-family: var(--font-ui); font-size: 12px; font-weight: 700; color: var(--muted); line-height: 1.35; letter-spacing: 0.1em; text-transform: uppercase; }
  p { margin: 0; font-family: var(--font-ui); font-size: 14px; font-weight: 400; color: var(--ink); line-height: 1.5; }
  .buttons { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .note { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .hint { margin-top: -10px; font-family: var(--font-ui); font-size: 12px; line-height: 1.35; color: var(--muted); }
</style>

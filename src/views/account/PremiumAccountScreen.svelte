<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { portal } from '../../lib/portal';
  import { cleanKey, keyProblemWords, KEY_CONNECTED, KEY_NOT_SET_UP, pricesLine, type Words } from '../../lib/accountText';
  import { keptStore, keyActions, keyBusy, keyOutcome, pricesActions, pricesStore } from '../../state/allowance';
  import { sourceByKind } from '../../lib/voiceText';
  import { sources, voiceActions } from '../../state/voices';
  import KeyProblemView from './KeyProblemView.svelte';
  import PremiumAccountView from './PremiumAccountView.svelte';
  import ScreenHead from '../voices/ScreenHead.svelte';

  /**
   * Premium voices, the Gemini account (V2, V5, PL11): the key field (write-only), Check key, Test again, Remove key,
   * prices as of, and how spending is counted. When Google rejected the key it shows the key problem instead. Route
   * `#/settings/premium`; goes inside <Shell active="settings">. Nothing here starts paid work: checking the key reads
   * Google's model list, which is free.
   */
  interface Props {
    onback?: () => void;
  }
  let { onback = () => (location.hash = '#/settings') }: Props = $props();

  const gemini = $derived(sourceByKind($sources.items, 'gemini'));
  const prices = $derived(pricesLine($pricesStore.items));

  /** What is being typed. Cleared the moment it is sent; never read back from the server. */
  let draft = $state('');
  let hint = $state('');
  let confirmRemove = $state(false);

  onMount(() => {
    keyActions.clearOutcome();
    void voiceActions.loadSources();
    void pricesActions.load();
    void keyActions.loadKept();
  });

  async function send() {
    const key = cleanKey(draft);
    draft = ''; // the field is empty from here on, whatever the answer is
    if (!key) {
      hint = 'Paste the key into the field first.';
      return;
    }
    hint = '';
    await keyActions.check(key);
  }

  function replace() {
    if (!draft.trim()) {
      hint = 'Paste the new key into the field, then press Replace key.';
      document.getElementById('gemini-key-replace')?.focus();
      return;
    }
    void send();
  }

  function cancel() {
    draft = '';
    hint = '';
  }

  async function remove() {
    confirmRemove = false;
    await keyActions.remove();
  }

  const attempt = $derived<Words | null>($keyOutcome && $keyOutcome.kind === 'problem' ? $keyOutcome.words : null);

  const callout = $derived.by(() => {
    if (attempt) return { tone: 'error' as const, ...attempt };
    if (gemini?.state === 'connected') return { tone: 'info' as const, ...KEY_CONNECTED };
    if (gemini?.state === 'unreachable')
      return {
        tone: 'error' as const,
        title: 'Can’t reach Google',
        body: 'Audio already made is kept and still plays. Bardic could not reach Google just now, so the key could not be checked. Press Test again.',
      };
    return { tone: 'info' as const, ...KEY_NOT_SET_UP };
  });
  const status = $derived(gemini?.state === 'connected' ? 'connected' : gemini?.state === 'unreachable' ? 'unreachable' : 'not_set_up');
  const ready = $derived($sources.status === 'ready' || $sources.items.length > 0);
</script>

{#if !ready}
  <div class="wait">
    <ScreenHead title="Premium voices" {onback} />
    {#if $sources.status === 'error'}
      <div class="pad">
        <Callout tone="error" title="Couldn’t reach your Bardic computer">
          Audio already made is kept and still plays. The key could not be read. {$sources.error ?? ''}
          {#snippet actions()}<Button variant="glass" onclick={() => voiceActions.loadSources()}>Try again</Button>{/snippet}
        </Callout>
      </div>
    {:else}
      <p class="pad msg" role="status">Reading the account…</p>
    {/if}
  </div>
{:else if gemini?.state === 'key_rejected'}
  <KeyProblemView
    words={keyProblemWords($keptStore)}
    bind:draft
    busy={$keyBusy}
    attempt={attempt}
    {hint}
    {onback}
    onreplace={replace}
    ontest={() => void keyActions.test()}
  />
{:else}
  <PremiumAccountView
    {status}
    bind:draft
    {callout}
    busy={$keyBusy}
    {hint}
    {prices}
    {onback}
    oncheck={() => void send()}
    ontest={() => void keyActions.test()}
    onremove={() => (confirmRemove = true)}
    oncancel={cancel}
  />
{/if}

{#if confirmRemove}
  <div use:portal>
  <Sheet title="Remove the key?" eyebrow="Premium voices" fixed onclose={() => (confirmRemove = false)}>
    <Glass radius={16} style="padding:14px">
      <p class="para">Audio already made is kept and still plays. Free voices are not affected.</p>
    </Glass>
    <p class="para">Premium voices stop working until you add a key. A plan in progress stops at its next request, keeping the chapters it has made.</p>
    <div class="actions">
      <Button variant="remove" size={52} style="width:100%" onclick={() => void remove()}>Remove key</Button>
      <Button variant="glass" size={52} style="width:100%" onclick={() => (confirmRemove = false)}>Keep the key</Button>
    </div>
  </Sheet>
  </div>
{/if}

<style>
  .wait { display: flex; flex-direction: column; gap: 16px; }
  .pad { padding: 0 20px; }
  .msg { margin: 0; font-family: var(--font-ui); font-size: 14px; color: var(--muted); }
  .para { margin: 0; font-family: var(--font-ui); font-size: 14px; line-height: 1.5; color: var(--ink); }
  .actions { display: flex; flex-direction: column; gap: 10px; }
</style>

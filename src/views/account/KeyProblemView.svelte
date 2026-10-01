<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import ScreenHead from '../voices/ScreenHead.svelte';
  import { KEY_PROBLEM_FREE, type Words } from '../../lib/accountText';
  import type { KeyBusy } from '../../state/allowance';
  import KeyField from './KeyField.svelte';

  /**
   * The premium key was rejected ([KeyProblem], PL11): what is kept first, then the one action, which is to replace the
   * key. Free voices are not affected. The key field is write-only and empty.
   */
  interface Props {
    /** What is kept and what stopped (from keyProblemWords). */
    words: Words;
    draft?: string;
    busy?: KeyBusy;
    /** What the last attempt said, if there was one (the rejected key again, or Google unreachable). */
    attempt?: Words | null;
    hint?: string;
    onback?: () => void;
    onreplace?: () => void;
    ontest?: () => void;
  }
  let { words, draft = $bindable(''), busy = null, attempt = null, hint = '', onback, onreplace, ontest }: Props = $props();

  const btn = 'height:48px;border-radius:24px';
</script>

<div class="col">
  <ScreenHead title="Premium voices" {onback} />
  <div class="pad">
    <div class="stack">
      <Callout tone="error" title={words.title}>{words.body}</Callout>
      <KeyField id="gemini-key-replace" label="Google API key" bind:value={draft} mark="bad" placeholder="••••••••••••••••••••" describedby={hint ? 'gemini-key-hint' : undefined} />
      {#if hint}<span id="gemini-key-hint" class="hint">{hint}</span>{/if}
      {#if attempt}<div aria-live="polite"><Callout tone="error" title={attempt.title}>{attempt.body}</Callout></div>{/if}
      <div class="buttons">
        <Button style={btn} disabled={busy !== null} onclick={() => onreplace?.()}>{busy === 'check' ? 'Checking…' : 'Replace key'}</Button>
        <Button variant="glass" style={btn} disabled={busy !== null} onclick={() => ontest?.()}>{busy === 'test' ? 'Testing…' : 'Test again'}</Button>
      </div>
      <span class="note">{KEY_PROBLEM_FREE}</span>
    </div>
  </div>
</div>

<style>
  .col { display: flex; flex-direction: column; gap: 16px; }
  .pad { padding: 0 20px; }
  .stack { display: flex; flex-direction: column; gap: 16px; }
  .buttons { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .note { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .hint { margin-top: -10px; font-family: var(--font-ui); font-size: 12px; line-height: 1.35; color: var(--muted); }
</style>

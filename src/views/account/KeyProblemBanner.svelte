<script lang="ts">
  import { onMount } from 'svelte';
  import { keyProblemWords } from '../../lib/accountText';
  import { sourceByKind } from '../../lib/voiceText';
  import { keptStore, keyActions } from '../../state/allowance';
  import { sources, voiceActions } from '../../state/voices';

  /**
   * The compact key problem (PL11) for the book page and Settings: shown only while the Gemini source says the key was
   * rejected. What is kept comes first; the one action is to replace the key, on `#/settings/premium`. Reads the
   * sources and the plans it stopped; it starts nothing.
   */
  onMount(() => {
    if ($sources.status === 'idle') void voiceActions.loadSources();
    void keyActions.loadKept();
  });

  const rejected = $derived(sourceByKind($sources.items, 'gemini')?.state === 'key_rejected');
  const words = $derived(keyProblemWords($keptStore));
</script>

{#if rejected}
  <div class="banner" role="alert">
    <span class="title">{words.title}</span>
    <span class="body">{words.body} Free voices are not affected.</span>
    <a class="btn" href="#/settings/premium">Replace key</a>
  </div>
{/if}

<style>
  .banner { border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; font-family: var(--font-ui); background: rgba(255, 120, 100, 0.22); }
  .title { font-size: 14px; font-weight: 700; color: #ffbcae; line-height: 1.35; }
  .body { font-size: 13px; color: var(--ink); line-height: 1.35; }
  .btn {
    align-self: flex-start;
    margin-top: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 44px;
    padding: 0 20px;
    border-radius: 22px;
    background: var(--accent);
    color: #1a1206;
    border: 1px solid rgba(255, 255, 255, 0.4);
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
  }
  .btn:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
</style>

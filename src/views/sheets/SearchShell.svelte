<script lang="ts">
  import type { Snippet } from 'svelte';
  import Glass from '../../components/Glass.svelte';
  import Glyph from '../shell/Glyph.svelte';
  import RoundButton from '../shell/RoundButton.svelte';

  /** The frame of a search screen: back button and title, the search field, then the content. */
  interface Props {
    title: string;
    query: string;
    /** Name of the field, e.g. "Find in this book". */
    fieldLabel: string;
    /** Gap between the parts (14 on Find in book, 16 on Search). */
    gap?: number;
    /** Gap between the back button and the title. */
    barGap?: number;
    onback?: () => void;
    /** The field changed (every keystroke; debounce in the owner). */
    oninput?: (query: string) => void;
    onenter?: () => void;
    onclear?: () => void;
    children: Snippet;
  }
  let { title, query = $bindable(), fieldLabel, gap = 14, barGap = 4, onback, oninput, onenter, onclear, children }: Props = $props();
</script>

<div class="page" style:gap="{gap}px">
  <div class="bar" style:gap="{barGap}px">
    <RoundButton label="Back" icon="back" onclick={onback} />
    <h1>{title}</h1>
  </div>
  <Glass radius={12} style="margin:0 20px;height:48px;padding:0 14px;display:flex;align-items:center">
    <form class="field" role="search" onsubmit={(e) => (e.preventDefault(), onenter?.())}>
      <span class="icon"><Glyph name="search" size={18} /></span>
      <input type="search" aria-label={fieldLabel} autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" bind:value={query} oninput={() => oninput?.(query)} />
      {#if query}
        <button type="button" class="clear" aria-label="Clear" onclick={() => ((query = ''), oninput?.(''), onclear?.())}><Glyph name="close" size={16} /></button>
      {/if}
    </form>
  </Glass>
  {@render children()}
</div>

<style>
  .page { display: flex; flex-direction: column; height: 100%; overflow: hidden; font-family: var(--font-ui); color: var(--ink); }
  .bar { display: flex; align-items: center; padding: 8px 12px 0; }
  h1 { margin: 0 0 0 4px; flex: 1; font-size: 20px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .field { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; margin: 0; }
  .icon { display: inline-flex; color: var(--muted); }
  input { flex: 1; min-width: 0; padding: 0; border: 0; outline: 0; background: transparent; font-family: var(--font-ui); font-size: 15px; font-weight: 500; color: var(--ink); line-height: 1.35; }
  input::-webkit-search-cancel-button { display: none; }
  /* 16 px icon in a 44 px target that takes no more room than the icon. */
  .clear { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; margin: -14px; padding: 0; border: 0; background: none; color: var(--muted); cursor: pointer; border-radius: 22px; flex-shrink: 0; }
  .clear:focus-visible { outline: 2px solid var(--accent); }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 6px; border-radius: 4px; }
</style>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import Glyph from '../shell/Glyph.svelte';

  interface Props {
    title: string;
    text: string;
    /** Buttons, centred under the text. */
    actions?: Snippet;
  }
  let { title, text, actions }: Props = $props();
</script>

<div class="empty" role="status">
  <div class="disc"><Glyph name="search" size={28} /></div>
  <span class="title">{title}</span>
  <span class="text">{text}</span>
  {#if actions}
    <div class="gap"></div>
    <div class="actions">{@render actions()}</div>
  {/if}
</div>

<style>
  .empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 56px 40px 0; text-align: center; }
  .disc { width: 64px; height: 64px; border-radius: 32px; background: rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center; color: var(--muted); }
  .title { font-size: 20px; font-weight: 700; color: var(--ink); line-height: 1.25; }
  .text { font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .gap { height: 8px; }
  .actions { display: flex; flex-direction: column; gap: 10px; align-items: center; }
</style>

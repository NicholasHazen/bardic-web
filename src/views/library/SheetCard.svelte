<script lang="ts">
  import type { Snippet } from 'svelte';
  import RoundButton from '../shell/RoundButton.svelte';

  // A sheet drawn as a card, for the Import board, which shows four sheet states side by side.
  interface Props {
    eyebrow?: string;
    title: string;
    width?: number;
    height?: number;
    children: Snippet;
  }
  let { eyebrow, title, width = 400, height = 480, children }: Props = $props();
</script>

<div class="card" style:width="{width}px" style:height="{height}px" role="group" aria-label={title}>
  <div class="grab"></div>
  <div class="head">
    <div class="titles">
      {#if eyebrow}<span class="eyebrow">{eyebrow}</span>{/if}
      <span class="title">{title}</span>
    </div>
    <div class="spacer"></div>
    <RoundButton label="Close" icon="close" />
  </div>
  {@render children()}
</div>

<style>
  .card {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px 20px 24px;
    border: 1px solid var(--edge);
    border-radius: 20px;
    background: rgba(22, 18, 32, 0.78);
    -webkit-backdrop-filter: blur(40px) saturate(1.7);
    backdrop-filter: blur(40px) saturate(1.7);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 20px 60px rgba(0, 0, 0, 0.5);
    font-family: var(--font-ui);
    color: var(--ink);
  }
  .grab { width: 40px; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.3); align-self: center; }
  .head { display: flex; align-items: flex-start; gap: 8px; }
  .titles { display: flex; flex-direction: column; gap: 2px; }
  .eyebrow { font-size: 11px; font-weight: 700; color: var(--accent); line-height: 1.35; letter-spacing: 0.14em; text-transform: uppercase; }
  .title { font-size: 24px; font-weight: 700; color: var(--ink); line-height: 1.35; letter-spacing: -0.02em; }
  .spacer { flex: 1; }
</style>

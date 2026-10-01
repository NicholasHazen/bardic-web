<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    tone?: 'info' | 'warn' | 'error';
    title: string;
    children: Snippet;
    /** Buttons, shown under the text. */
    actions?: Snippet;
  }
  let { tone = 'info', title, children, actions }: Props = $props();
</script>

<div class="callout {tone}" role={tone === 'error' ? 'alert' : undefined}>
  <span class="title">{title}</span>
  <span class="body">{@render children()}</span>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</div>

<style>
  .callout { border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; font-family: var(--font-ui); }
  .info { background: rgba(120, 180, 255, 0.2); --t: #bcdcff; }
  .warn { background: rgba(246, 185, 92, 0.2); --t: #ffd493; }
  .error { background: rgba(255, 120, 100, 0.22); --t: #ffbcae; }
  .title { font-size: 14px; font-weight: 700; color: var(--t); line-height: 1.35; }
  .body { font-size: 13px; font-weight: 400; color: var(--ink); line-height: 1.35; }
  .actions { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
</style>

<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    number: number | string;
    title: string;
    /** Line under the title. */
    detail?: string;
    /** The chapter the listener is in. */
    current?: boolean;
    /** Right side: usually a Badge. */
    trailing?: Snippet;
  }
  let { number, title, detail, current = false, trailing }: Props = $props();
</script>

<div class="row" class:current>
  <span class="num">{number}</span>
  <div class="text">
    <span class="title">{title}</span>
    {#if detail}<span class="detail">{detail}</span>{/if}
  </div>
  {@render trailing?.()}
</div>

<style>
  .row { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 0 16px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: transparent; }
  .row.current { background: rgba(255, 255, 255, 0.1); }
  .num { font-family: var(--font-ui); font-size: 13px; font-weight: 700; color: var(--muted); line-height: 1.35; width: 22px; flex-shrink: 0; }
  .current .num { color: var(--accent); }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; overflow-wrap: anywhere; padding-block: 8px; }
  .title { font-family: var(--font-book); font-size: 16px; font-weight: 400; color: var(--ink); line-height: 1.35; }
  .current .title { font-weight: 600; }
  .detail { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
</style>

<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props {
    /** idle also covers Not yet and Missing; here is the accent tone (You are here, Playing, progress). */
    tone?: 'idle' | 'ready' | 'making' | 'paid' | 'failed' | 'here';
    children: Snippet;
  }
  let { tone = 'idle', children }: Props = $props();
</script>

<span class="badge {tone}">{@render children()}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 9px;
    border-radius: 11px;
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .idle { background: rgba(255, 255, 255, 0.13); color: var(--ink); }
  .ready { background: rgba(130, 205, 120, 0.2); color: #c3f0ba; }
  .making { background: rgba(120, 180, 255, 0.2); color: #bcdcff; }
  .paid { background: rgba(246, 185, 92, 0.2); color: #ffd493; }
  .failed { background: rgba(255, 120, 100, 0.22); color: #ffbcae; }
  .here { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
</style>

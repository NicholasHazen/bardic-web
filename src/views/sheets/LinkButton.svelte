<script lang="ts">
  import type { Snippet } from 'svelte';

  /** A link that looks like Button (same sizes and variants): for going to another screen by route. */
  interface Props {
    href: string;
    variant?: 'primary' | 'glass';
    /** Height in px: 48 for the actions of a card. */
    height?: 44 | 48 | 52;
    onclick?: () => void;
    children: Snippet;
  }
  let { href, variant = 'primary', height = 48, onclick, children }: Props = $props();
</script>

<a {href} class="btn {variant}" style:height="{height}px" style:border-radius="{height / 2}px" onclick={() => onclick?.()}>{@render children()}</a>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-sizing: border-box; /* as a button is */
    width: 100%;
    padding: 0;
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
  }
  .primary { background: var(--accent); color: #1a1206; border: 1px solid rgba(255, 255, 255, 0.4); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 0 24px color-mix(in srgb, var(--accent) 40%, transparent); }
  .glass { background: rgba(255, 255, 255, 0.1); color: var(--ink); border: 1px solid var(--edge); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 6px 18px rgba(0, 0, 0, 0.25); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
  .btn:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
</style>

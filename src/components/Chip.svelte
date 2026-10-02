<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  interface Props extends Omit<HTMLButtonAttributes, 'children'> {
    selected?: boolean;
    children: Snippet;
  }
  let { selected = false, children, ...rest }: Props = $props();
</script>

<button type="button" class:on={selected} aria-pressed={selected} {...rest}>{@render children()}</button>

<style>
  button {
    position: relative;
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    height: 44px;
    margin-block: -1px;
    padding: 0 16px;
    border-radius: 20px;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 600;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.07);
    color: var(--muted);
    border: 1px solid rgba(255, 255, 255, 0.08);
    cursor: pointer;
  }
  button.on { background: rgba(255, 255, 255, 0.18); color: var(--ink); border-color: var(--edge); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (min-width: 768px) { button { color: color-mix(in srgb, var(--muted) 30%, var(--ink)); } }
</style>

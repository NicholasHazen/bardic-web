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
    display: inline-flex;
    align-items: center;
    box-sizing: content-box; /* as the design: 40px plus the 1px edge */
    height: 40px;
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
</style>

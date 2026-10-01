<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLButtonAttributes, 'children' | 'aria-label'> {
    label: string;
    width?: number;
    height?: number;
    /** `blur`: the backdrop blur the board draws on this control. */
    saturate?: boolean;
    children: Snippet;
  }
  let { label, width = 44, height = 44, saturate = true, children, ...rest }: Props = $props();
</script>

<button
  type="button"
  class="pb"
  class:sat={saturate}
  style:width="{width}px"
  style:height="{height}px"
  style:border-radius="{Math.min(width, height) / 2}px"
  aria-label={label}
  {...rest}
>
  {@render children()}
</button>

<style>
  .pb {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    flex-shrink: 0;
    cursor: pointer;
    color: var(--ink);
    background: var(--glass-control);
    border: 1px solid var(--edge);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 18px rgba(0, 0, 0, 0.25);
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
  }
  .sat { -webkit-backdrop-filter: blur(20px) saturate(1.7); backdrop-filter: blur(20px) saturate(1.7); }
</style>

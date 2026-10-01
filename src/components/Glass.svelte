<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLElement> {
    /** panel: controls and cards; bar: mini player; sheet: now playing; toast. */
    variant?: 'panel' | 'bar' | 'sheet' | 'toast';
    radius?: number;
    tag?: 'div' | 'button';
    /** Only for tag="button". */
    type?: 'button';
    children?: Snippet;
  }
  let { variant = 'panel', radius = 20, tag = 'div', children, class: cls = '', ...rest }: Props = $props();
</script>

<svelte:element this={tag} class="glass {variant} {cls}" style:--r="{radius}px" {...rest}>
  {@render children?.()}
</svelte:element>

<style>
  .glass {
    box-sizing: border-box;
    border: 1px solid var(--edge);
    border-radius: var(--r);
    -webkit-backdrop-filter: blur(var(--blur)) saturate(1.7);
    backdrop-filter: blur(var(--blur)) saturate(1.7);
    background: var(--fill);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), var(--shadow);
    color: var(--ink);
    font: inherit;
  }
  .panel { --fill: rgba(255, 255, 255, 0.09); --blur: 26px; --shadow: 0 10px 30px rgba(0, 0, 0, 0.28); }
  .toast { --fill: rgba(22, 18, 32, 0.86); --blur: 30px; --shadow: 0 10px 30px rgba(0, 0, 0, 0.28); }
  .bar { --fill: rgba(20, 16, 28, 0.6); --blur: 30px; --shadow: 0 12px 32px rgba(0, 0, 0, 0.45); }
  .sheet { --fill: rgba(20, 16, 28, 0.82); --blur: 40px; --shadow: 0 -12px 40px rgba(0, 0, 0, 0.5); }
  button.glass { cursor: pointer; }
</style>

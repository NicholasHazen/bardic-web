<script lang="ts">
  import Glyph, { type GlyphName } from './Glyph.svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLButtonAttributes, 'children' | 'aria-label'> {
    label: string;
    icon: GlyphName;
    tone?: 'glass' | 'ghost';
    iconSize?: number;
  }
  let { label, icon, tone = 'glass', iconSize = 22, ...rest }: Props = $props();
</script>

<!-- A 44 px round icon button with a name. -->
<button type="button" class={tone} aria-label={label} {...rest}><Glyph name={icon} size={iconSize} /></button>

<style>
  button {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    padding: 0;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--ink);
    cursor: pointer;
  }
  .glass {
    background: var(--glass-control);
    -webkit-backdrop-filter: blur(20px) saturate(1.7);
    backdrop-filter: blur(20px) saturate(1.7);
    border: 1px solid var(--edge);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 18px rgba(0, 0, 0, 0.25);
  }
  .ghost { background: transparent; border: 1px solid transparent; box-shadow: none; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>

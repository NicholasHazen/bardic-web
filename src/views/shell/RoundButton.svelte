<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Glyph, { type GlyphName } from './Glyph.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'children' | 'aria-label'> {
    label: string;
    icon: GlyphName;
    /** glass: the 44 px tool button; ghost: no chrome. */
    tone?: 'glass' | 'ghost';
    size?: number;
    iconSize?: number;
  }
  let { label, icon, tone = 'glass', size = 44, iconSize = 22, ...rest }: Props = $props();
</script>

<button type="button" class="rb {tone}" style:width="{size}px" style:height="{size}px" style:border-radius="{size / 2}px" aria-label={label} {...rest}>
  <Glyph name={icon} size={iconSize} />
</button>

<style>
  .rb { display: inline-flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; cursor: pointer; color: var(--ink); }
  .glass {
    background: var(--glass-control);
    -webkit-backdrop-filter: blur(20px) saturate(1.7);
    backdrop-filter: blur(20px) saturate(1.7);
    border: 1px solid var(--edge);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 18px rgba(0, 0, 0, 0.25);
  }
  .ghost { background: transparent; border: 1px solid transparent; box-shadow: none; }
</style>

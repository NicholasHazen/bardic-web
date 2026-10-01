<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'children' | 'aria-label'> {
    /** Required: icon buttons have no visible text. */
    label: string;
    icon: IconName;
    /** accent: the play button; glass: transport and tools; ghost: no chrome. */
    tone?: 'accent' | 'glass' | 'ghost';
    /** Button diameter in px (44 minimum for touch). */
    size?: number;
    iconSize?: number;
  }
  let { label, icon, tone = 'glass', size = 44, iconSize = 22, class: cls = '', ...rest }: Props = $props();
</script>

<button type="button" class="ib {tone} {cls}" style:width="{size}px" style:height="{size}px" style:border-radius="{size / 2}px" aria-label={label} {...rest}>
  <Icon name={icon} size={iconSize} />
</button>

<style>
  .ib {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    flex-shrink: 0;
    cursor: pointer;
    -webkit-backdrop-filter: blur(20px) saturate(1.7);
    backdrop-filter: blur(20px) saturate(1.7);
  }
  .accent {
    background: var(--accent);
    border: 1px solid rgba(255, 255, 255, 0.45);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 18px rgba(0, 0, 0, 0.25), 0 0 28px color-mix(in srgb, var(--accent) 53.3%, transparent);
    color: #1a1206;
  }
  .glass {
    background: var(--glass-control);
    border: 1px solid var(--edge);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 18px rgba(0, 0, 0, 0.25);
    color: var(--ink);
  }
  .ghost { background: transparent; border: 1px solid transparent; box-shadow: none; color: var(--ink); }
</style>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'children'> {
    variant?: 'primary' | 'glass' | 'text' | 'remove';
    /** Height in px: 44 default, 52 for the primary action of a screen. */
    size?: 44 | 52;
    icon?: IconName;
    iconPosition?: 'start' | 'end';
    iconSize?: number;
    children: Snippet;
  }
  let { variant = 'primary', size = 44, icon, iconPosition = 'start', iconSize = 18, children, class: cls = '', ...rest }: Props = $props();
</script>

<button type="button" class="btn {variant} s{size} {cls}" {...rest}>
  {#if icon && iconPosition === 'start'}<Icon name={icon} size={iconSize} />{/if}
  {@render children()}
  {#if icon && iconPosition === 'end'}<Icon name={icon} size={iconSize} />{/if}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 20px;
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  .s44 { height: 44px; border-radius: 22px; }
  .s52 { height: 52px; border-radius: 26px; font-size: 15px; }
  .primary {
    background: var(--accent);
    color: #1a1206;
    border: 1px solid rgba(255, 255, 255, 0.4);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 0 24px color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .glass {
    background: rgba(255, 255, 255, 0.1);
    color: var(--ink);
    border: 1px solid var(--edge);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 6px 18px rgba(0, 0, 0, 0.25);
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
  }
  .text { background: transparent; color: var(--accent); border: 1px solid transparent; padding: 0 8px; }
  .remove { background: rgba(255, 120, 100, 0.12); color: #ffbcae; border: 1px solid rgba(255, 120, 100, 0.45); }
  .btn:disabled {
    background: rgba(255, 255, 255, 0.1);
    color: var(--muted);
    border: 1px solid var(--edge);
    box-shadow: none;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    cursor: default;
  }
</style>

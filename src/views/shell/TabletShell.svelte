<script lang="ts" module>
  import type { Glow } from '../../components/Aura.svelte';
  /** The phone glows scaled for a 1194 x 834 screen. */
  export const TABLET_GLOWS: Glow[] = [
    { x: -127, y: -113, size: 537, color: 'var(--glow)', opacity: 0.55, blur: 90 },
    { x: 597, y: 500, size: 509, color: 'var(--glow2)', opacity: 0.42, blur: 100 },
    { x: -84, y: 650, size: 396, color: 'var(--glow)', opacity: 0.22, blur: 90 },
  ];
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import Aura from '../../components/Aura.svelte';
  import { applyPalette } from '../../theme/apply';
  import type { Palette } from '../../theme/derive';
  import Rail from './Rail.svelte';
  import type { TabId } from './tabs';

  interface Props {
    active: TabId;
    onnavigate?: (tab: TabId) => void;
    palette?: Palette;
    glows?: Glow[];
    /** The listener's avatar button, pinned to the bottom of the rail. */
    avatar?: Snippet;
    /** The mini player, centred at the bottom of the content area. */
    player?: Snippet;
    overlay?: Snippet;
    children: Snippet;
  }
  let { active, onnavigate, palette, glows = TABLET_GLOWS, avatar, player, overlay, children }: Props = $props();

  let root: HTMLDivElement;
  $effect(() => {
    if (palette) applyPalette(root, palette);
  });
</script>

<div class="shell" bind:this={root}>
  <Aura {glows} />
  <div class="layout">
    <Rail {active} {onnavigate} {avatar} />
    <div class="content" class:with-player={!!player}>{@render children()}</div>
  </div>
  {#if player}<div class="player"><div class="bar">{@render player()}</div></div>{/if}
  {@render overlay?.()}
</div>

<style>
  .shell { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--base); color: var(--ink); font-family: var(--font-ui); }
  .layout { position: relative; display: flex; align-items: stretch; height: 100%; }
  .content { flex: 1; min-width: 0; height: 100%; overflow-y: auto; scrollbar-width: none; box-sizing: border-box; padding-bottom: 40px; }
  .content::-webkit-scrollbar { display: none; }
  .content.with-player { padding-bottom: 140px; }
  .player { position: absolute; left: 96px; right: 0; bottom: 20px; display: flex; justify-content: center; pointer-events: none; }
  .bar { width: min(560px, calc(100% - 48px)); pointer-events: auto; }
</style>

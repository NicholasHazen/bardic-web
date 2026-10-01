<script lang="ts">
  import type { Snippet } from 'svelte';
  import Aura, { PHONE_GLOWS, type Glow } from '../../components/Aura.svelte';
  import { applyPalette } from '../../theme/apply';
  import type { Palette } from '../../theme/derive';
  import TabBar from './TabBar.svelte';
  import type { TabId } from './tabs';

  interface Props {
    /** Which tab is showing. */
    active: TabId;
    onnavigate?: (tab: TabId) => void;
    /** Show the tab bar. Pushed screens (Manage) hide it. */
    tabbar?: boolean;
    /** A book's palette (from its cover sample); omit for the default. */
    palette?: Palette;
    glows?: Glow[];
    /** The mini player, shown above the tab bar. */
    player?: Snippet;
    /** Sheets and scrims, drawn over everything. */
    overlay?: Snippet;
    children: Snippet;
  }
  let { active, onnavigate, tabbar = true, palette, glows = PHONE_GLOWS, player, overlay, children }: Props = $props();

  let root: HTMLDivElement;
  $effect(() => {
    if (palette) applyPalette(root, palette);
  });
</script>

<div class="shell" bind:this={root}>
  <Aura {glows} />
  <div class="content" class:with-player={!!player} class:bare={!tabbar}>{@render children()}</div>
  {#if player}<div class="player">{@render player()}</div>{/if}
  {#if tabbar}<TabBar {active} {onnavigate} />{/if}
  {@render overlay?.()}
</div>

<style>
  .shell { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--base); color: var(--ink); font-family: var(--font-ui); }
  .content { position: relative; height: 100%; overflow-y: auto; scrollbar-width: none; box-sizing: border-box; padding-bottom: 104px; }
  .content::-webkit-scrollbar { display: none; }
  .content.with-player { padding-bottom: 200px; }
  .content.bare { padding-bottom: 24px; }
  .player { position: absolute; left: 14px; right: 14px; bottom: 96px; }
</style>

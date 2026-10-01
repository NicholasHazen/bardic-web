<script lang="ts">
  import type { Snippet } from 'svelte';
  import { avatarHue } from '../../lib/listenerText';
  import { currentListener, listenerStore } from '../../state/listener';
  import type { Palette } from '../../theme/derive';
  import PhoneShell from './PhoneShell.svelte';
  import TabletShell from './TabletShell.svelte';
  import { goToTab, type TabId } from './tabs';
  import { isTablet } from './viewport';
  import ListenerButton from '../library/ListenerButton.svelte';

  /** The app frame: tab bar on a phone, a rail on a tablet (768 px and wider). Fills the viewport. */
  interface Props {
    active: TabId;
    /** Defaults to changing the hash route (#/, #/library, #/settings). */
    onnavigate?: (tab: TabId) => void;
    /** The listener switcher (shown by the integrator); called from the rail's avatar. */
    onswitchlistener?: () => void;
    /** Show the phone tab bar. Pushed screens such as Manage hide it. */
    tabbar?: boolean;
    palette?: Palette;
    /** The mini player. */
    player?: Snippet;
    overlay?: Snippet;
    children: Snippet;
  }
  let { active, onnavigate = goToTab, onswitchlistener, tabbar = true, palette, player, overlay, children }: Props = $props();

  const who = $derived(currentListener($listenerStore));
</script>

<div class="app">
  {#if $isTablet}
    <TabletShell {active} {onnavigate} {palette} {player} {overlay}>
      {#snippet avatar()}
        {#if who}<ListenerButton listener={{ name: who.name, hue: avatarHue(who.id) }} size={44} selected onclick={onswitchlistener} />{/if}
      {/snippet}
      {@render children()}
    </TabletShell>
  {:else}
    <PhoneShell {active} {onnavigate} {tabbar} {palette} {player} {overlay}>
      {@render children()}
    </PhoneShell>
  {/if}
</div>

<style>
  .app { position: fixed; inset: 0; width: 100%; height: 100dvh; }
</style>

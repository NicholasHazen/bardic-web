<script lang="ts">
  import type { Snippet } from 'svelte';
  import Aura, { PHONE_GLOWS, type Glow } from '../../../components/Aura.svelte';
  import TabBar from '../../shell/TabBar.svelte';
  import type { TabId } from '../../shell/tabs';

  /** A phone screen at the board's own size for the offline boards that do not scroll inside the shell: the aura, the screen, the tab bar and an overlay. */
  interface Props {
    tab: TabId;
    glows?: Glow[];
    overlay?: Snippet;
    children: Snippet;
  }
  let { tab, glows = PHONE_GLOWS, overlay, children }: Props = $props();
</script>

<div class="frame">
  <Aura {glows} />
  <div class="page">{@render children()}</div>
  <TabBar active={tab} />
  {@render overlay?.()}
</div>

<style>
  .frame { width: 390px; height: 844px; position: relative; overflow: hidden; background: var(--base); color: var(--ink); font-family: var(--font-ui); }
  .page { position: relative; height: 100%; }
</style>

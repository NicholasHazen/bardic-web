<script lang="ts">
  import Avatar from '../../components/Avatar.svelte';
  import { currentListener, listenerStore } from '../../state/listener';
  import { avatarHue } from '../../lib/listenerText';
  import ListenerSwitcher from './ListenerSwitcher.svelte';

  interface Props {
    /** Avatar size in px; the button is at least 44 px. */
    size?: number;
    placement?: 'bottom' | 'popover';
    playing?: { bookTitle: string } | null;
    onbeforeswitch?: () => void;
    onmanage?: () => void;
  }
  let { size = 40, placement = 'bottom', playing = null, onbeforeswitch, onmanage }: Props = $props();

  let open = $state(false);
  const me = $derived(currentListener($listenerStore));
</script>

<!-- L3: the current listener as an avatar; tapping it opens the switcher. -->
{#if me}
  <button type="button" class="who" aria-label="Listening as {me.name}. Change listener" aria-haspopup="dialog" aria-expanded={open} onclick={() => (open = true)}>
    <Avatar name={me.name} hue={avatarHue(me.id)} {size} />
  </button>
  {#if open}
    <ListenerSwitcher {placement} {playing} {onbeforeswitch} {onmanage} onclose={() => (open = false)} />
  {/if}
{/if}

<style>
  .who { min-width: 44px; min-height: 44px; border-radius: 50%; padding: 0; border: 0; background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer; }
  .who:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>

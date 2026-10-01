<script lang="ts">
  import Avatar from '../../components/Avatar.svelte';
  import type { ListenerModel } from './types';

  interface Props {
    listener: ListenerModel;
    /** Avatar diameter; the touch target stays 44. */
    size?: number;
    selected?: boolean;
    onclick?: () => void;
  }
  let { listener, size = 40, selected = false, onclick }: Props = $props();
</script>

<button type="button" aria-label="Listening as {listener.name}. Change listener" aria-haspopup="dialog" {onclick}>
  <Avatar name={listener.name} hue={listener.hue} {size} {selected} />
</button>

<style>
  button { width: 44px; height: 44px; border-radius: 50%; padding: 0; border: 0; background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer; }
</style>

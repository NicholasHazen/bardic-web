<script lang="ts">
  import { avatarHue, initialOf } from '../lib/listenerText';

  interface Props {
    name: string;
    size?: number;
    /** The current listener: a stronger ring. */
    selected?: boolean;
    /** 0 to 359. Defaults to a hue derived from the name; pass one derived from the listener's id when you have it. */
    hue?: number;
  }
  let { name, size = 40, selected = false, hue }: Props = $props();
  const h = $derived(hue ?? avatarHue(name));
</script>

<div
  class="avatar"
  class:selected
  style:width="{size}px"
  style:height="{size}px"
  style:background="hsl({h} 42% 30%)"
  aria-hidden="true"
>
  <span style:font-size="{Math.round(size * 0.41)}px">{initialOf(name)}</span>
</div>

<style>
  .avatar {
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.22);
  }
  .avatar.selected { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 0 0 2px rgba(255, 255, 255, 0.75); }
  span { font-family: var(--font-ui); font-weight: 700; color: #fff; line-height: 1; }
</style>

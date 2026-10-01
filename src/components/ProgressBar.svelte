<script lang="ts">
  interface Props {
    /** 0 to 1 */
    value: number;
    height?: number;
    track?: string;
    style?: string;
  }
  let { value, height = 3, track = 'rgba(255,255,255,.18)', style = '' }: Props = $props();
</script>

<div class="bar" style:height="{height}px" style:border-radius="{height === 4 ? 2 : height}px" style:background={track} {style}>
  <div class="fill" style:width="{value * 100}%" style:border-radius="{height === 4 ? 2 : height}px"></div>
</div>

<style>
  .bar { position: relative; flex: 1 1 auto; min-width: 0; }
  .fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--accent); }
</style>

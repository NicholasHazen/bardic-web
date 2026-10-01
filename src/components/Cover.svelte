<script lang="ts">
  interface Props {
    color: string;
    width: number;
    height: number;
    radius?: number;
    pad?: number;
    /** Drop shadow offset and blur. */
    shadowY?: number;
    shadowBlur?: number;
    /** Title printed on the cover (tiles only). */
    title?: string;
  }
  let { color, width, height, radius = 8, pad = 13, shadowY = 13, shadowBlur = 26, title }: Props = $props();
</script>

<div
  class="cover"
  style:width="{width}px"
  style:height="{height}px"
  style:border-radius="{radius}px"
  style:background={color}
  style:padding="{pad}px"
  style:box-shadow="0 {shadowY}px {shadowBlur}px rgba(0,0,0,.5)"
>
  {#if title}<span>{title}</span>{/if}
</div>

<style>
  .cover { box-sizing: border-box; display: flex; flex-direction: column; justify-content: flex-end; flex-shrink: 0; border: 1px solid rgba(255, 255, 255, 0.18); }
  span { font-family: var(--font-ui); font-size: 13px; font-weight: 700; line-height: 1; color: #fff; letter-spacing: -0.02em; }
</style>

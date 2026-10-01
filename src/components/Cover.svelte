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
    /** Title size in px. */
    titleSize?: number;
    /** Fill the parent's width at a 2:3 shape instead of using width and height. */
    fluid?: boolean;
    /** The book's cover image; drawn over the colour (which shows while it loads). */
    src?: string;
  }
  let { color, width, height, radius = 8, pad = 13, shadowY = 13, shadowBlur = 26, title, titleSize = 13, fluid = false, src }: Props = $props();
  let failed = $state(false);
</script>

<div
  class="cover"
  class:fluid
  class:img={!!src && !failed}
  style:width={fluid ? '100%' : `${width}px`}
  style:height={fluid ? undefined : `${height}px`}
  style:border-radius="{radius}px"
  style:background={color}
  style:padding="{pad}px"
  style:box-shadow="0 {shadowY}px {shadowBlur}px rgba(0,0,0,.5)"
>
  {#if src && !failed}
    <img {src} alt="" onerror={() => (failed = true)} style:border-radius="{Math.max(radius - 1, 0)}px" />
  {:else if title}
    <span style:font-size="{titleSize}px">{title}</span>
  {/if}
</div>

<style>
  .cover { box-sizing: border-box; display: flex; flex-direction: column; justify-content: flex-end; flex-shrink: 0; border: 1px solid rgba(255, 255, 255, 0.18); }
  .img { position: relative; }
  .fluid { aspect-ratio: 2 / 3; }
  span { font-family: var(--font-ui); font-size: 13px; font-weight: 700; line-height: 1; color: #fff; letter-spacing: -0.02em; }
  img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
</style>

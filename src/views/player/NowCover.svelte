<script lang="ts">
  import { contrast } from '../../theme/derive';
  interface Props {
    color: string;
    width: number;
    height: number;
    radius?: number;
    pad: number;
    title?: string;
    titleSize?: number;
    /** the drop shadow as the board draws it, e.g. "0 26px 50px rgba(0,0,0,.6)" */
    shadow: string;
    src?: string;
    /** in a column with too little room, shrink (keeping the 2:3 shape) instead of overflowing */
    shrink?: boolean;
  }
  let { color, width, height, radius = 10, pad, title, titleSize = 30, shadow, src, shrink = false }: Props = $props();
  let failed = $state(false);
  const img = $derived(!!src && !failed);
  const titleColor = $derived(/^#[0-9a-f]{6}$/i.test(color) && contrast('#ffffff', color) < 4.5 ? '#100c16' : '#ffffff');
</script>

<!-- The big cover of the Listen screens. Decorative: the title is printed again as text beside it. -->
<div class="cover" class:img class:shrink style:width={shrink ? undefined : `${width}px`} style:height="{height}px" style:flex={shrink ? `0 1 ${height}px` : undefined} style:border-radius="{radius}px" style:background={color} style:padding="{pad}px" style:box-shadow={shadow} aria-hidden="true">
  {#if img}
    <img {src} alt="" onerror={() => (failed = true)} style:border-radius="{radius - 1}px" />
  {:else if title}
    <span style:font-size="{titleSize}px" style:color={titleColor}>{title}</span>
  {/if}
</div>

<style>
  .cover { box-sizing: border-box; display: flex; flex-direction: column; justify-content: flex-end; flex-shrink: 0; border: 1px solid rgba(255, 255, 255, 0.18); }
  .shrink { aspect-ratio: 2 / 3; min-height: 96px; }
  .img { position: relative; }
  img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  span { font-family: var(--font-ui); font-weight: 700; line-height: 1; color: #fff; letter-spacing: -0.02em; }
  @media (max-width: 300px) {
    .cover.shrink { width: min(232px, calc(100vw - 48px)) !important; height: auto !important; aspect-ratio: 2 / 3; flex: none !important; min-height: 0; padding: 16px !important; }
    span { overflow-wrap: anywhere; }
  }
</style>

<script lang="ts">
  import Cover from '../../components/Cover.svelte';
  import ProgressBar from '../../components/ProgressBar.svelte';
  import Glyph from './Glyph.svelte';
  import type { ShelfBook } from './types';

  interface Props {
    heading: string;
    count?: string;
    books: ShelfBook[];
    /** Tile width; the cover is 1.5 times as tall. */
    width: number;
    gap: number;
    pad: number;
    titleSize: number;
    inset: number;
  }
  let { heading, count, books, width, gap, pad, titleSize, inset }: Props = $props();
  const height = $derived(Math.round(width * 1.5));
</script>

<!-- A shelf of covers as Home draws it; only here so the switcher boards have a Home behind the scrim. -->
<div class="shelf">
  <div class="head" style:padding="0 {inset}px">
    <span class="h">{heading}</span>
    {#if count}<span class="c">{count}</span>{/if}
  </div>
  <div class="tiles" style:gap="{gap}px" style:padding="0 {inset}px">
    {#each books as b}
      <div class="tile" style:width="{width}px">
        <div class="cw" style:width="{width}px" style:height="{height}px">
          <Cover color={b.color} {width} {height} pad={pad} shadowY={Math.round(width / 8)} shadowBlur={Math.round(width / 4)} title={b.title} {titleSize} />
          {#if b.onDevice}<div class="dl"><Glyph name="download" size={14} /></div>{/if}
        </div>
        <div class="meta">
          <span class="n" style:max-width="{width}px">{b.title}</span>
          <span class="a" style:max-width="{width}px">{b.second}</span>
        </div>
        {#if b.progress !== undefined}<ProgressBar value={b.progress} />{/if}
      </div>
    {/each}
  </div>
</div>

<style>
  span { line-height: 1.35; }
  .shelf { display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; align-items: center; gap: 8px; }
  .h { font-size: 17px; font-weight: 700; color: var(--ink); }
  .c { font-size: 12px; color: var(--muted); }
  .tiles { display: flex; align-items: flex-start; overflow: hidden; }
  .tile { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
  .cw { position: relative; }
  .dl { position: absolute; right: 6px; top: 6px; width: 26px; height: 26px; border-radius: 13px; background: rgba(14, 12, 22, 0.78); display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255, 255, 255, 0.3); color: var(--ink); }
  .meta { display: flex; flex-direction: column; gap: 1px; }
  .n { font-size: 13px; font-weight: 600; color: var(--ink); }
  .a { font-size: 12px; color: var(--muted); }
</style>

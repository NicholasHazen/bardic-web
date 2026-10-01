<script lang="ts">
  import Cover from './Cover.svelte';
  import ProgressBar from './ProgressBar.svelte';

  interface Props {
    title: string;
    /** Author, or "Vol. 2" inside a series. */
    subtitle?: string;
    color: string;
    /** Cover image URL (the colour shows until it loads). */
    coverSrc?: string;
    /** Tile width in px. The cover keeps a 2:3 shape and shrinks with its parent. */
    width?: number;
    /** 0 to 1: shows a thin bar under the tile. */
    progress?: number;
    /** A downloaded audiobook is held on this device: the mark in the corner. */
    onDevice?: boolean;
    /** Opens the book. */
    href?: string;
  }
  let { title, subtitle, color, coverSrc, width = 106, progress, onDevice = false, href }: Props = $props();

  // Cover metrics follow the design: padding is 12% of the width, shadow a quarter of it.
  const pad = $derived(Math.round(width * 0.12));
  const blur = $derived(Math.floor(width / 4));
  const titleSize = $derived(width >= 112 ? 15 : 13);
  const accessible = $derived([title, subtitle, progress !== undefined ? `${Math.round(progress * 100)} percent` : '', onDevice ? 'on this device' : ''].filter(Boolean).join(', '));
</script>

<svelte:element this={href ? 'a' : 'div'} class="tile" style:width="{width}px" style:max-width="100%" {href} aria-label={href ? accessible : undefined}>
  <div class="art">
    <Cover {color} width={width} height={Math.round(width * 1.5)} pad={pad} shadowY={pad} shadowBlur={blur} {title} {titleSize} src={coverSrc} fluid />
    {#if onDevice}
      <div class="mark" title="On this device" role="img" aria-label="On this device">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></svg>
      </div>
    {/if}
  </div>
  <div class="meta">
    <span class="name">{title}</span>
    {#if subtitle}<span class="sub">{subtitle}</span>{/if}
  </div>
  {#if progress !== undefined}<ProgressBar value={progress} />{/if}
</svelte:element>

<style>
  .tile { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; font-family: var(--font-ui); color: inherit; text-decoration: none; cursor: pointer; }
  .art { position: relative; }
  .mark { position: absolute; right: 6px; top: 6px; width: 26px; height: 26px; border-radius: 13px; background: rgba(14, 12, 22, 0.78); display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255, 255, 255, 0.3); }
  .meta { display: flex; flex-direction: column; gap: 1px; }
  .name { font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .sub { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
</style>

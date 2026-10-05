<script lang="ts">
  import Cover from '../../components/Cover.svelte';
  import OfflineGlyph from './OfflineGlyph.svelte';

  /** A book that needs the Bardic computer, shown away from home: the cover dimmed with the offline mark; not openable (O4). */
  interface Props {
    title: string;
    subtitle?: string;
    color: string;
    coverSrc?: string;
    width?: number;
  }
  let { title, subtitle, color, coverSrc, width = 100 }: Props = $props();

  const pad = $derived(Math.round(width * 0.12));
  const blur = $derived(Math.floor(width / 4));
</script>

<div class="tile" style:width="{width}px" role="group" aria-label="{title}{subtitle ? `, ${subtitle}` : ''}. Needs your Bardic computer">
  <div class="art">
    <Cover {color} src={coverSrc} {width} height={Math.round(width * 1.5)} {pad} shadowY={pad} shadowBlur={blur} />
    <div class="mark"><OfflineGlyph name="wifi-off" size={14} color="var(--ink)" /></div>
  </div>
  <div class="meta">
    <span class="name">{title}</span>
    {#if subtitle}<span class="sub">{subtitle}</span>{/if}
  </div>
</div>

<style>
  .tile { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; font-family: var(--font-ui); }
  .art { position: relative; opacity: 0.38; }
  .mark { position: absolute; right: 6px; top: 6px; width: 26px; height: 26px; border-radius: 13px; background: rgba(14, 12, 22, 0.78); display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255, 255, 255, 0.3); }
  .meta { display: flex; flex-direction: column; gap: 1px; overflow-wrap: anywhere; }
  .name { font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.35; max-width: 100px; }
  .sub { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; max-width: 100px; }
</style>

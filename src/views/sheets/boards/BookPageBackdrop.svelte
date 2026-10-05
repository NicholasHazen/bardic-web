<script lang="ts">
  import type { Snippet } from 'svelte';
  import Aura from '../../../components/Aura.svelte';
  import Badge from '../../../components/Badge.svelte';
  import Button from '../../../components/Button.svelte';
  import Cover from '../../../components/Cover.svelte';
  import MiniPlayer from '../../../components/MiniPlayer.svelte';
  import { book } from '../../../fixtures/sheets';
  import RoundButton from '../../shell/RoundButton.svelte';
  import TabBar from '../../shell/TabBar.svelte';

  /**
   * The book page behind the first-play states, with the mini player and the tab bar: a stand-in drawn from
   * fixtures for the design boards (the real book page is src/views/book). The status panel goes in `children`.
   */
  let { children }: { children: Snippet } = $props();
</script>

<Aura />
<div class="page">
  <div class="bar">
    <RoundButton label="Back to library" icon="back" />
    <div class="grow"></div>
    <RoundButton label="Edit this book" icon="more" />
  </div>
  <div class="hero">
    <div class="head">
      <Cover color={book.color} width={116} height={174} radius={8} pad={14} shadowY={14} shadowBlur={29} title={book.title} titleSize={15} />
      <div class="titles">
        <div class="series"><Badge tone="here">{book.seriesLine}</Badge></div>
        <h1>{book.title}</h1>
        <span class="author">{book.author}</span>
        <span class="meta">{book.meta}</span>
      </div>
    </div>
    <div class="cta"><Button size={52} icon="play" style="width:100%">Continue listening</Button></div>
  </div>
  {@render children()}
</div>
<div class="mini"><MiniPlayer title="The Ash Ledger" detail="Ch. 4 · 6 min ahead" progress={0.34} speed="1.25×" /></div>
<TabBar active="library" />

<style>
  .page { position: relative; display: flex; flex-direction: column; gap: 16px; font-family: var(--font-ui); color: var(--ink); }
  .bar { display: flex; align-items: center; padding: 8px 12px 0; }
  .grow { flex: 1; }
  .hero { display: flex; flex-direction: column; gap: 14px; }
  .head { display: flex; align-items: flex-start; gap: 16px; padding: 0 20px; }
  .titles { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
  .series { align-self: flex-start; font-family: serif; line-height: normal; }
  h1 { margin: 0; font-size: 27px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; line-height: 1.1; }
  .author { font-size: 14px; color: var(--muted); line-height: 1.35; }
  .meta { font-size: 12px; color: var(--muted); line-height: 1.35; }
  .cta { padding: 0 20px; }
  .mini { position: absolute; left: 14px; right: 14px; bottom: 96px; }
</style>

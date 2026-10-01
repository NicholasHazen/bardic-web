<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { ReaderAppearance } from '../../player/types';
  import Glyph from './Glyph.svelte';
  import PButton from './PButton.svelte';
  import { chapterLabel, type Layout, type NowPlayingState } from './nowPlaying';
  import { backLabel, followStep, highlightedLines, neighbourLine, paragraphsOf, readerColors, readerMetrics, type FollowEvent } from './reading';
  import Icon from '../../components/Icon.svelte';

  interface Props {
    state: Pick<NowPlayingState, 'chapter' | 'text' | 'lines' | 'currentLineId' | 'playing'>;
    appearance: ReaderAppearance;
    layout: Layout;
    /** lines to mark with a dotted underline (e.g. the line a search found) */
    markedLineIds?: string[];
    /** true while the view keeps the current line in view; false after the listener scrolled away */
    following?: boolean;
    ongotoline?: (lineId: string) => void;
    /** the Aa button inside the landscape panel (the phone and portrait screens have it in the top bar) */
    onopenAppearance?: () => void;
  }
  let { state, appearance, layout, markedLineIds = [], following = $bindable(true), ongotoline, onopenAppearance }: Props = $props();

  const panel = $derived(layout === 'tablet-landscape');
  const metrics = $derived(readerMetrics(appearance, layout));
  const colors = $derived(readerColors(appearance.theme));
  const paragraphs = $derived(paragraphsOf(state.text, state.lines));
  const marks = $derived(highlightedLines(state.currentLineId, markedLineIds));
  const label = $derived(chapterLabel(state.chapter));
  const away = $derived(!following);

  // svelte-ignore non_reactive_update
  let scroller: HTMLDivElement | undefined;
  /** until this time, scroll events are our own */
  let ours = 0;

  const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /** Bring the current line into the comfortable part of the view (not re-centred on every line). */
  function scrollToCurrent(force = false) {
    const box = scroller;
    const el = box?.querySelector<HTMLElement>('[data-current]');
    if (!box || !el) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const top = (r.top - b.top) / b.height;
    const bottom = (r.bottom - b.top) / b.height;
    if (!force && top >= 0.1 && bottom <= 0.7) return;
    const delta = r.top - b.top - b.height * 0.3;
    const smooth = !reduced();
    ours = performance.now() + (smooth ? 900 : 120);
    box.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' });
  }

  function send(event: FollowEvent) {
    const step = followStep(following ? 'following' : 'away', event);
    following = step.mode === 'following';
    if (step.scroll) void tick().then(() => scrollToCurrent(event === 'back-to-narration'));
  }

  // The spoken line moved: follow it. The first run is Read opening.
  let seen: string | null | undefined;
  $effect(() => {
    const id = state.currentLineId;
    untrack(() => {
      if (seen === undefined) {
        if (following) void tick().then(() => scrollToCurrent());
      } else if (id !== seen) send('line-changed');
    });
    seen = id;
  });
  let seenChapter: string | undefined;
  $effect(() => {
    const c = state.chapter?.id;
    untrack(() => {
      if (seenChapter !== undefined && c !== seenChapter) send('chapter-changed');
    });
    seenChapter = c;
  });

  function byHand() {
    if (following) send('user-scroll');
  }
  function onscroll() {
    if (performance.now() > ours) byHand();
  }
  const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', ' ', 'ArrowUp', 'ArrowDown']);
  function onkeydown(e: KeyboardEvent) {
    if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      // Shift + arrow: the next or previous line becomes the place, without a mouse
      e.preventDefault();
      const id = neighbourLine(state.lines, state.currentLineId, e.key === 'ArrowDown' ? 1 : -1);
      if (id) {
        send('line-tapped');
        ongotoline?.(id);
      }
      return;
    }
    if (SCROLL_KEYS.has(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) byHand();
  }
  function onclick(e: MouseEvent) {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (sel && !sel.isCollapsed && scroller?.contains(sel.anchorNode)) return; // selecting text, not jumping
    const id = (e.target as Element | null)?.closest<HTMLElement>('[data-line]')?.dataset.line;
    if (!id) return;
    send('line-tapped');
    ongotoline?.(id);
  }
</script>

{#snippet paras()}
  {#each paragraphs as p}
    <p class="p" style:font-family={metrics.fontFamily} style:font-size="{metrics.fontSize}px" style:line-height={metrics.lineHeight}>{#each p.parts as part}{#if part.lineId}<span class="line" class:current={marks.get(part.lineId) === 'current'} class:marked={marks.get(part.lineId) === 'marked'} data-line={part.lineId} data-current={marks.get(part.lineId) === 'current' ? '' : undefined}>{part.text}</span>{:else}{part.text}{/if}{/each}</p>
  {/each}
{/snippet}

{#snippet back()}
  {#if away}
    <button type="button" class="back" class:inpanel={panel} onclick={() => send('back-to-narration')}>
      <Icon name="play" size={16} />
      <span>{backLabel(state.playing)}</span>
    </button>
  {/if}
{/snippet}

<div
  class="read"
  class:panel
  style:--ink={colors.paper ? colors.ink : undefined}
  style:--muted={colors.paper ? colors.muted : undefined}
  style:--glass-control={colors.paper ? colors.glass : undefined}
  style:--edge={colors.paper ? colors.edge : undefined}
  style:--label-accent={colors.accent}
  style:background={panel && colors.paper ? colors.paper : undefined}
>
  {#if panel}
    <div class="head">
      <span class="label grow">{label}</span>
      <PButton label="Text settings" onclick={onopenAppearance}><Glyph name="text-size" /></PButton>
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_tabindex -->
    <div class="scroller panelscroll" bind:this={scroller} role="region" aria-label="Chapter text" tabindex="0" {onclick} {onscroll} {onkeydown} onwheel={byHand} ontouchmove={byHand}>
      <div class="col" style:gap="{metrics.gap}px">
        <h2 class="title" style:font-size="{metrics.titleSize}px">{state.chapter?.title ?? ''}</h2>
        {@render paras()}
      </div>
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_tabindex -->
    <div class="scroller" bind:this={scroller} role="region" aria-label="Chapter text" tabindex="0" {onclick} {onscroll} {onkeydown} onwheel={byHand} ontouchmove={byHand}>
      <div class="col screen" style:gap="{metrics.gap}px" style:width={metrics.columnWidth ? `${metrics.columnWidth}px` : undefined}>
        <span class="label">{label}</span>
        <h2 class="title" style:font-size="{metrics.titleSize}px">{state.chapter?.title ?? ''}</h2>
        {@render paras()}
      </div>
    </div>
  {/if}
  {@render back()}
</div>

<style>
  .read { position: relative; flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; color: var(--ink); }
  .read.panel {
    box-sizing: border-box;
    margin: 20px;
    padding: 28px 40px;
    overflow: hidden;
    background: rgba(14, 12, 22, 0.5);
    -webkit-backdrop-filter: blur(34px) saturate(1.7);
    backdrop-filter: blur(34px) saturate(1.7);
    border: 1px solid var(--edge);
    border-radius: 20px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 20px 50px rgba(0, 0, 0, 0.4);
  }
  .head { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .grow { flex: 1; }
  .scroller { flex: 1; min-height: 0; overflow-y: auto; display: flex; justify-content: center; scrollbar-width: none; outline-offset: -2px; }
  .scroller::-webkit-scrollbar { display: none; }
  .scroller:focus-visible { outline: 2px solid var(--accent); }
  .panelscroll { display: block; }
  .col { display: flex; flex-direction: column; }
  .col.screen { max-width: 100%; padding: 22px 26px 120px; box-sizing: border-box; }
  .panelscroll .col { padding-bottom: 40px; }
  .label { font-family: var(--font-ui); font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--label-accent, var(--accent)); }
  .title { margin: 0; font-family: var(--font-ui); font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; color: var(--ink); }
  .p { margin: 0; color: var(--ink); user-select: text; -webkit-user-select: text; }
  .line { border-radius: 4px; -webkit-box-decoration-break: clone; box-decoration-break: clone; cursor: pointer; }
  .line.current { background: color-mix(in srgb, var(--accent) 18%, transparent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent); }
  .line.marked { text-decoration: underline dotted var(--label-accent, var(--accent)); text-underline-offset: 5px; }
  .back {
    position: absolute;
    left: 50%;
    margin-left: -100px;
    bottom: 104px;
    width: 200px;
    height: 48px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0;
    cursor: pointer;
    color: #f5f1ea;
    background: rgba(22, 18, 32, 0.92);
    -webkit-backdrop-filter: blur(30px) saturate(1.7);
    backdrop-filter: blur(30px) saturate(1.7);
    border: 1px solid var(--edge);
    border-radius: 12px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 12px 30px rgba(0, 0, 0, 0.5);
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 700;
  }
  .back.inpanel { bottom: 24px; }
  .back span { line-height: 1.35; }
</style>

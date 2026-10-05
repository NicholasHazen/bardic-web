<script lang="ts">
  import Badge from '../../components/Badge.svelte';
  import Glass from '../../components/Glass.svelte';
  import SectionLabelMuted from './SectionLabelMuted.svelte';
  import Glyph from '../shell/Glyph.svelte';
  import BookGlyph from './BookGlyph.svelte';
  import { tierText, tierTone, type OtherAudiobookModel } from './types';

  /** The other audiobooks of this book (B3). Choosing one makes it this listener's current audiobook; the place is kept. */
  interface Props {
    items: OtherAudiobookModel[];
    /** Offer "Add another voice" under the list. */
    addRow?: boolean;
    onchoose?: (id: string) => void;
    onadd?: () => void;
  }
  let { items, addRow = true, onchoose, onadd }: Props = $props();
</script>

<div class="section">
  <SectionLabelMuted>Other audiobooks</SectionLabelMuted>
  <Glass radius={16} style="margin: var(--card-margin, 0 20px); overflow: hidden">
    {#each items as a, i (a.id)}
      <button type="button" class="row" class:last={i === items.length - 1 && !addRow} onclick={() => onchoose?.(a.id)} aria-label="Use {a.voice}, {tierText(a.tier)}, {a.line}">
        <span class="disc"><BookGlyph name="headphones" size={20} color="var(--accent)" /></span>
        <span class="text">
          <span class="name">
            <span class="voice">{a.voice}</span>
            <Badge tone={tierTone(a.tier)}>{tierText(a.tier)}</Badge>
          </span>
          <span class="sub">{a.line}</span>
        </span>
        <BookGlyph name="next" size={16} color="var(--muted)" />
      </button>
    {/each}
    {#if addRow}
      <button type="button" class="row add" onclick={onadd}>
        <span class="disc plain"><Glyph name="plus" size={20} color="var(--ink)" /></span>
        <span class="voice grow">Add another voice</span>
      </button>
    {/if}
  </Glass>
</div>

<style>
  .section { display: flex; flex-direction: column; gap: var(--section-gap, 10px); }
  .row {
    width: 100%;
    min-height: 66px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    box-sizing: border-box;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    text-align: left;
    cursor: pointer;
    font-family: var(--font-ui);
    color: var(--ink);
  }
  .row.last, .row.add { border-bottom: 0; }
  .add { min-height: 62px; }
  .disc { width: 40px; height: 40px; border-radius: 20px; background: color-mix(in srgb, var(--accent) 18%, transparent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .disc.plain { background: rgba(255, 255, 255, 0.1); }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .name { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .name :global(.badge) { max-width: 100%; height: auto; min-height: 22px; box-sizing: border-box; white-space: normal; overflow-wrap: anywhere; }
  .voice { font-size: 15px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .grow { flex: 1; }
  .sub { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .voice, .sub { overflow-wrap: anywhere; }
</style>

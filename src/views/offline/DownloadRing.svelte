<script lang="ts">
  import { decideAnnounce, percent, type AnnounceState } from './logic';
  import OfflineGlyph from './OfflineGlyph.svelte';

  /**
   * The small progress ring beside the reader controls while a download runs in the background ([ReadDownloading], O2).
   * A 44 px button that opens Downloads; the ring is 34 px. Position it from the parent (`style`); it never covers text.
   * Progress is spoken politely and rarely (every 10% and not more than every few seconds).
   */
  interface Props {
    /** 0 to 1; null when the progress is not known (a quarter of the ring shows) */
    fraction: number | null;
    /** The button's name, e.g. "Downloading 5 of 8 chapters. Open downloads" (ringLabel in logic.ts) */
    label: string;
    onclick?: () => void;
    /** Positioning from the parent, e.g. "position:absolute;left:284px;top:14px" */
    style?: string;
    /** Minimum milliseconds between spoken updates. */
    gapMs?: number;
  }
  let { fraction, label, onclick, style = '', gapMs = 5000 }: Props = $props();

  const pct = $derived(fraction === null ? null : percent(fraction));
  const arc = $derived(pct === null ? 25 : pct);

  let spoken = $state('');
  let last: AnnounceState | null = null;
  $effect(() => {
    const p = pct;
    if (p === null) {
      spoken = 'Downloading';
      return;
    }
    const d = decideAnnounce(last, p, Date.now(), gapMs);
    if (d.say) spoken = `Downloading, ${p} percent`;
    last = d.state;
  });
</script>

<span class="root" {style}>
  <button type="button" class="hit" aria-label={label} {onclick}>
    <span class="ring" style:background="conic-gradient(var(--accent) {arc}%, rgba(255, 255, 255, 0.22) 0)">
      <span class="hole"><OfflineGlyph name="download" size={14} color="var(--ink)" /></span>
    </span>
  </button>
  <span class="sr" role="status" aria-live="polite">{spoken}</span>
</span>

<style>
  .root { display: block; width: 44px; height: 44px; }
  .hit { width: 44px; height: 44px; border-radius: 22px; padding: 0; border: 0; background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .hit:focus-visible { outline: 2px solid var(--accent); outline-offset: 0; }
  .ring { width: 34px; height: 34px; border-radius: 17px; display: flex; align-items: center; justify-content: center; }
  .hole { width: 28px; height: 28px; border-radius: 14px; background: var(--ring-hole, #1b1524); display: flex; align-items: center; justify-content: center; }
  .sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
</style>

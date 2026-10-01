<script lang="ts">
  import Scrubber from '../../components/Scrubber.svelte';
  import { formatBookRemaining, formatClock, remainingLine, scrubFraction, secondsAt, spokenBookRemaining } from './nowPlaying';

  interface Props {
    position: number;
    duration: number;
    bookProgress: number;
    remainingSeconds: number | null;
    /** the horizontal padding of the block */
    padding?: string;
    /** leave out the elapsed / remaining line (the controls sheet has its own) */
    times?: boolean;
    /** only the time left on the right, without the percentage of the book */
    compact?: boolean;
    /** line height of the times, where the board sets one */
    leading?: number;
    /** how far the invisible touch band reaches above and below the 5 px track */
    hit?: number;
    onseek?: (seconds: number) => void;
  }
  let { position, duration, bookProgress, remainingSeconds, padding = '0 20px', times = true, compact = false, leading, hit = 20, onseek }: Props = $props();
  const spoken = $derived(spokenBookRemaining(remainingSeconds));
</script>

<div class="block" style:padding>
  <!-- the track is 5 px as drawn; an invisible band around it makes it a 44 px target -->
  <div class="hit" style:--hit="{hit}px"><Scrubber slim label="Position in this chapter" value={scrubFraction(position, duration)} onchange={(f) => { const s = secondsAt(f, duration); if (s !== null) onseek?.(s); }} /></div>
  {#if times}
    <div class="times" style:line-height={leading}>
      <span class="t grow" aria-label="{formatClock(position)} played in this chapter">{formatClock(position)}</span>
      <span class="t" aria-label={spoken ? `${spoken}, ${Math.round(bookProgress * 100)} percent of the book` : undefined}>{compact ? (formatBookRemaining(remainingSeconds) ?? '') : remainingLine(remainingSeconds, bookProgress)}</span>
    </div>
  {/if}
</div>

<style>
  .block { display: flex; flex-direction: column; gap: 6px; }
  .hit :global(.scrub)::before { content: ''; position: absolute; left: -10px; right: -10px; top: calc(-1 * var(--hit)); bottom: calc(-1 * var(--hit)); }
  .times { display: flex; align-items: center; }
  .times .t { line-height: inherit; }
  .t { font-family: var(--font-ui); font-size: 12px; color: var(--muted); }
  .grow { flex: 1; }
</style>

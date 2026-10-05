<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import type { Chapter } from '../../state/book';
  import type { Place } from '../../state/manage';
  import { formatPlaceTime } from '../sheets/placeTime';

  interface Props {
    bookTitle: string;
    entries: Place[];
    chapters: Chapter[];
    loading?: boolean;
    busy?: boolean;
    error?: string;
    placement?: 'bottom' | 'popover';
    onrestore: (p: Place) => void;
    onclose: () => void;
  }
  let { bookTitle, entries, chapters, loading = false, busy = false, error, placement = 'bottom', onrestore, onclose }: Props = $props();
  const chapterName = (p: Place) => {
    const c = chapters.find((c) => c.id === p.chapter_id);
    return c ? `Chapter ${c.index + 1} · ${c.title}` : 'Earlier chapter';
  };
</script>

<Sheet title="Recent places" eyebrow={bookTitle} fixed {placement} {onclose}>
  <p class="intro">Restore a recent place after an accidental jump. Your current place is kept in history.</p>
  {#if loading}
    <p role="status">Getting your recent places…</p>
  {:else if !entries.length && !error}
    <p>No earlier places yet. Larger jumps and places you leave after a while appear here.</p>
  {:else if entries.length}
    <Glass radius={16} style="overflow: hidden; flex-shrink: 0">
      <ul aria-label="Recent places">
        {#each entries as p (p.revision)}
          <li><button type="button" disabled={busy} onclick={() => onrestore(p)}>
            <span class="name">Restore {chapterName(p)}</span>
            <span class="detail">{Math.round(p.progress * 100)}% · {p.device_name ?? 'Another device'} · {formatPlaceTime(Date.parse(p.updated_at), Date.now())}</span>
          </button></li>
        {/each}
      </ul>
    </Glass>
  {/if}
  {#if error}<Callout tone="error" title="Your places are kept">{error}</Callout>{/if}
  <Button variant="glass" style="width: 100%; min-height: 48px; border-radius: 24px" onclick={onclose}>Close</Button>
</Sheet>

<style>
  .intro { margin: 0; font-size: 14px; color: var(--muted); line-height: 1.5; }
  ul { margin: 0; padding: 0; list-style: none; }
  li + li { border-top: 1px solid rgba(255,255,255,0.08); }
  button { display: flex; flex-direction: column; gap: 5px; width: 100%; min-height: 68px; padding: 14px; border: 0; background: transparent; text-align: left; color: var(--ink); font-family: var(--font-ui); cursor: pointer; overflow-wrap: anywhere; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  button:disabled { opacity: 0.6; cursor: default; }
  .name { font-size: 15px; font-weight: 600; }
  .detail { font-size: 12px; color: var(--muted); line-height: 1.5; }
</style>

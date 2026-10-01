<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import Button from '../../components/Button.svelte';
  import EmptyState from './EmptyState.svelte';
  import SearchShell from './SearchShell.svelte';
  import Seg from './Seg.svelte';
  import { DEBOUNCE_MS, createSearchDebounce, highlightPieces, passageCount, type SearchResultRow } from './search';

  /**
   * Find in book ([BookSearch]). The listener types; the view waits for a pause (`debounceMs`), cleans the query and calls
   * `onsearch(query)`. The owner runs `searchBook` and passes the rows back as `results` (build them with `hitToRow`);
   * nothing here talks to the server. Tapping a result calls `onopen(row)`, which goes to that line.
   */
  interface Props {
    query?: string;
    results: SearchResultRow[];
    /** All matches in the book (may be more than `results` when paged). null while unknown. */
    total: number | null;
    status?: 'idle' | 'searching' | 'done' | 'error';
    /** More matches can be fetched. */
    hasMore?: boolean;
    /** Searching earlier volumes too is offered (the board shows it); turn off where it cannot be done. */
    scopes?: boolean;
    scope?: 'book' | 'series';
    debounceMs?: number;
    onsearch?: (query: string) => void;
    onclear?: () => void;
    onscope?: (scope: 'book' | 'series') => void;
    onmore?: () => void;
    onopen?: (row: SearchResultRow) => void;
    onback?: () => void;
  }
  let { query = $bindable(''), results, total, status = 'done', hasMore = false, scopes = true, scope = 'book', debounceMs = DEBOUNCE_MS, onsearch, onclear, onscope, onmore, onopen, onback }: Props = $props();

  const debounce = createSearchDebounce(
    (q) => onsearch?.(q),
    () => onclear?.(),
    { delay: untrack(() => debounceMs) },
  );
  onDestroy(() => debounce.cancel());

  const searched = $derived(query.trim() !== '');
</script>

<SearchShell title="Find in this book" bind:query fieldLabel="Find in this book" gap={14} barGap={4} {onback} oninput={(q) => debounce.input(q)} onenter={() => debounce.flush()} onclear={() => debounce.reset()}>
  {#if scopes}
    <Seg
      label="Where to search"
      fontSize={12}
      style="margin:0 20px"
      value={scope}
      options={[
        { value: 'book', label: 'This book' },
        { value: 'series', label: 'With earlier volumes' },
      ]}
      onchange={(v) => onscope?.(v === 'series' ? 'series' : 'book')}
    />
  {/if}
  {#if !searched}
    <p class="info">Searches the exact text of the book; nothing is sent anywhere.</p>
  {:else if status === 'error'}
    <p class="info" role="alert">The search could not run. Nothing was changed.</p>
  {:else if status === 'searching' && results.length === 0}
    <p class="info" role="status">Searching&hellip;</p>
  {:else if results.length === 0 && status === 'done'}
    <EmptyState title="No passage matches “{query.trim()}”" text="Search looks at the exact words of this book. Check the spelling or try fewer words." />
  {:else}
    <p class="info" role="status">{total === null ? '' : `${passageCount(total)}. `}Searches the exact text of the book; nothing is sent anywhere.</p>
    <ul class="hits" aria-label="Results">
      {#each results as r (r.id)}
        <li>
          <button type="button" class="hit" onclick={() => onopen?.(r)}>
            <span class="head">
              <span class="chapter">{r.chapterLabel}</span>
              {#if r.passageLabel}<span class="passage">{r.passageLabel}</span>{/if}
            </span>
            <span class="line">{#each highlightPieces(r.text, r.ranges) as p}{#if p.mark}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}</span>
          </button>
        </li>
      {/each}
      {#if hasMore}
        <li class="more"><Button variant="glass" onclick={() => onmore?.()}>Show more</Button></li>
      {/if}
    </ul>
  {/if}
</SearchShell>

<style>
  .info { margin: 0; padding: 0 24px; font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .hits { list-style: none; margin: 0; padding: 0 0 24px; display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; }
  .hits::-webkit-scrollbar { display: none; }
  .hit {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: calc(100% - 40px);
    margin: 0 20px;
    padding: 12px 14px;
    box-sizing: border-box;
    text-align: left;
    cursor: pointer;
    color: var(--ink);
    background: rgba(255, 255, 255, 0.09);
    -webkit-backdrop-filter: blur(26px) saturate(1.7);
    backdrop-filter: blur(26px) saturate(1.7);
    border: 1px solid var(--edge);
    border-radius: 16px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 10px 30px rgba(0, 0, 0, 0.28);
    font: inherit;
  }
  .hit:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .head { display: flex; align-items: center; gap: 8px; }
  .chapter { font-size: 12px; font-weight: 700; color: var(--accent); line-height: 1.35; letter-spacing: 0.06em; text-transform: uppercase; }
  .passage { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .line { font-family: var(--font-book); font-size: 15px; line-height: 1.5; color: var(--ink); }
  mark { background: color-mix(in srgb, var(--accent) 25%, transparent); color: inherit; border-radius: 3px; padding: 0 2px; }
  .more { display: flex; justify-content: center; }
</style>

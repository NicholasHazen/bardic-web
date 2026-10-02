<script lang="ts">
  import { tick } from 'svelte';
  import Badge from '../../components/Badge.svelte';
  import BookCard from '../../components/BookCard.svelte';
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Chip from '../../components/Chip.svelte';
  import Glass from '../../components/Glass.svelte';
  import Glyph from '../shell/Glyph.svelte';
  import RoundButton from '../shell/RoundButton.svelte';
  import ListenerButton from './ListenerButton.svelte';
  import { FILTERS, SORTS, type BookCardModel, type LibraryFilter, type LibrarySort, type ListenerModel } from './types';

  interface Props {
    layout?: 'phone' | 'tablet';
    listener: ListenerModel;
    books: BookCardModel[];
    /** Shown as "9 books"; leave out while it is not known. */
    count?: number;
    filter?: LibraryFilter;
    sort?: LibrarySort;
    query?: string;
    loading?: boolean;
    error?: string;
    /** Show the count and sort row (the design leaves it out on the duplicate board). */
    summary?: boolean;
    onfilter?: (f: LibraryFilter) => void;
    onsort?: (s: LibrarySort) => void;
    onquery?: (q: string) => void;
    onaddbook?: () => void;
    onswitchlistener?: () => void;
    onretry?: () => void;
  }
  let {
    layout = 'phone',
    listener,
    books,
    count,
    filter = 'all',
    sort = 'recent',
    query = '',
    loading = false,
    error,
    summary = true,
    onfilter,
    onsort,
    onquery,
    onaddbook,
    onswitchlistener,
    onretry,
  }: Props = $props();

  const tablet = $derived(layout === 'tablet');
  let searchOpen = $state(false);
  let sortOpen = $state(false);
  let sortButton = $state<HTMLButtonElement>();
  let sortMenu = $state<HTMLDivElement>();
  let menuIndex = $state(0);
  const showSearch = $derived(tablet || searchOpen || query !== '');
  const sortLabel = $derived(SORTS.find((s) => s.id === sort)?.label ?? 'Recently read');
  const width = $derived(tablet ? 118 : 106);

  function toggleSearch() {
    if (searchOpen && query === '') searchOpen = false;
    else searchOpen = true;
  }
  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape' && sortOpen) {
      sortOpen = false;
      sortButton?.focus();
      e.stopPropagation();
    }
  }
  async function toggleSort(e: MouseEvent) {
    e.stopPropagation();
    sortOpen = !sortOpen;
    if (sortOpen) {
      menuIndex = Math.max(0, SORTS.findIndex((s) => s.id === sort));
      await tick();
      sortMenu?.querySelectorAll<HTMLButtonElement>('button')[menuIndex]?.focus();
    }
  }
  function menuKey(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      sortOpen = false;
      sortButton?.focus(); // native Tab continues to the next page control
    } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      menuIndex = e.key === 'Home' ? 0 : e.key === 'End' ? SORTS.length - 1 : (menuIndex + (e.key === 'ArrowDown' ? 1 : -1) + SORTS.length) % SORTS.length;
      sortMenu?.querySelectorAll<HTMLButtonElement>('button')[menuIndex]?.focus();
    }
  }
  function pickSort(s: LibrarySort) {
    sortOpen = false;
    sortButton?.focus();
    onsort?.(s);
  }
  const noun = (n: number) => (n === 1 ? 'book' : 'books');
</script>

<svelte:window onkeydown={onkey} onclick={() => (sortOpen = false)} />

<div class="page" class:wide={tablet}>
  <div class="top" class:t={tablet}>
    <h1>Library</h1>
    {#if tablet}
      {#if count !== undefined}<span class="total">{count} {noun(count)}</span>{:else}<span class="total"></span>{/if}
      <Glass radius={22} style="height: 44px; width: 280px; padding: 0 16px; display: flex; align-items: center">
        <label class="find">
          <Glyph name="search" size={16} color="var(--muted)" />
          <input type="search" placeholder="Find a book" aria-label="Find a book" value={query} oninput={(e) => onquery?.(e.currentTarget.value)} />
        </label>
      </Glass>
      <Button onclick={onaddbook}><Glyph name="plus" size={18} />Add a book</Button>
    {:else}
      <span class="grow"></span>
      <RoundButton label="Search" icon="search" aria-expanded={showSearch} onclick={toggleSearch} />
      <RoundButton label="Add a book" icon="plus" onclick={onaddbook} />
      <ListenerButton {listener} onclick={onswitchlistener} />
    {/if}
  </div>

  {#if !tablet && showSearch}
    <Glass radius={22} style="height: 44px; margin: 0 20px; padding: 0 16px; display: flex; align-items: center">
      <label class="find">
        <Glyph name="search" size={16} color="var(--muted)" />
        <input type="search" placeholder="Find a book" aria-label="Find a book" value={query} oninput={(e) => onquery?.(e.currentTarget.value)} />
      </label>
    </Glass>
  {/if}

  <div class="chips" class:t={tablet} role="group" aria-label="Show">
    {#each FILTERS as f}
      <Chip selected={filter === f.id} onclick={() => onfilter?.(f.id)}>{f.label}</Chip>
    {/each}
  </div>

  {#if summary && !tablet}
    <div class="summary">
      <span class="count">{#if count !== undefined}{count} {noun(count)}{/if}</span>
      <div class="sortwrap">
        <button bind:this={sortButton} type="button" class="sort" aria-haspopup="menu" aria-expanded={sortOpen} aria-controls="library-sort-menu" onclick={toggleSort}>
          {sortLabel}<Glyph name="chevron" size={14} color="var(--accent)" />
        </button>
        {#if sortOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div bind:this={sortMenu} id="library-sort-menu" class="menu" role="menu" tabindex="-1" aria-label="Sort by" onkeydown={menuKey} onclick={(e) => e.stopPropagation()}>
            {#each SORTS as s, i}
              <button type="button" role="menuitemradio" tabindex={menuIndex === i ? 0 : -1} aria-checked={sort === s.id} class:on={sort === s.id} onclick={() => pickSort(s.id)}>{s.label}</button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {:else if summary && tablet}
    <div class="summary t">
      <div class="sortwrap">
        <button bind:this={sortButton} type="button" class="sort" aria-haspopup="menu" aria-expanded={sortOpen} aria-controls="library-sort-menu" onclick={toggleSort}>
          Sort: {sortLabel}<Glyph name="chevron" size={14} color="var(--accent)" />
        </button>
        {#if sortOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div bind:this={sortMenu} id="library-sort-menu" class="menu left" role="menu" tabindex="-1" aria-label="Sort by" onkeydown={menuKey} onclick={(e) => e.stopPropagation()}>
            {#each SORTS as s, i}
              <button type="button" role="menuitemradio" tabindex={menuIndex === i ? 0 : -1} aria-checked={sort === s.id} class:on={sort === s.id} onclick={() => pickSort(s.id)}>{s.label}</button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if error}
    <div class="msg">
      <Callout tone="error" title="Couldn’t load your books">
        {error}
        {#snippet actions()}<Button variant="glass" onclick={onretry}>Try again</Button>{/snippet}
      </Callout>
    </div>
  {:else if books.length}
    <div class="grid" class:t={tablet}>
      {#each books as b (b.id)}
        {#if b.adding}
          <div class="adding" style:width="{width}px" style:max-width="100%">
            <div class="ghost"><span class="gname">{b.title}</span><Badge tone="making">Adding</Badge></div>
            <span class="gnote">Reading the file</span>
          </div>
        {:else}
          <BookCard title={b.title} subtitle={b.subtitle} color={b.color} coverSrc={b.coverSrc} progress={b.progress} onDevice={b.onDevice} href={b.href} {width} />
        {/if}
      {/each}
    </div>
  {:else if loading}
    <p class="empty" role="status">Loading your books</p>
  {:else}
    <div class="none" role="status">
      {#if query}
        <p class="empty">No book matches “{query}”.</p>
        <div><Button variant="glass" onclick={() => onquery?.('')}>Clear search</Button></div>
      {:else if filter === 'on_device'}
        <p class="empty">No audiobook is downloaded to this device yet. Open a book and choose Download to listen offline.</p>
      {:else if filter !== 'all'}
        <p class="empty">No books here yet.</p>
        <div><Button variant="glass" onclick={() => onfilter?.('all')}>Show all books</Button></div>
      {:else}
        <p class="empty">Your library is empty.</p>
        <div><Button onclick={onaddbook}><Glyph name="plus" size={18} />Add a book</Button></div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; font-family: var(--font-ui); }
  .page.wide { gap: 18px; }
  h1 { margin: 0; font-size: 32px; font-weight: 700; color: var(--ink); line-height: 1.35; letter-spacing: -0.02em; }
  .top { display: flex; align-items: center; gap: 8px; padding: 16px 20px 0; }
  .top.t { gap: 12px; padding: 28px 40px 0; }
  .top.t h1 { font-size: 36px; letter-spacing: -0.025em; }
  .grow { flex: 1; }
  .total { font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.35; flex: 1; margin-left: 8px; }
  .find { display: flex; align-items: center; gap: 8px; width: 100%; }
  .find input { padding: 0; border: 0; outline: 0; background: transparent; flex: 1; min-width: 0; font-family: var(--font-ui); font-size: 13px; color: var(--ink); height: 44px; margin-block: -2px; }
  .find input::placeholder { color: var(--muted); opacity: 1; }
  .find input::-webkit-search-cancel-button { display: none; }
  .chips { display: flex; align-items: center; gap: 8px; padding: 1px 20px; margin-block: -1px; overflow-x: auto; scrollbar-width: none; flex-shrink: 0; }
  .chips.t { padding: 1px 40px; }
  .summary { display: flex; align-items: center; gap: 8px; padding: 0 24px; }
  .summary.t { padding: 0 40px; }
  .count { font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.35; flex: 1; }
  .sortwrap { position: relative; display: flex; }
  .sort { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0; border: 0; background: none; font-family: var(--font-ui); font-size: 13px; font-weight: 600; color: var(--accent); line-height: 1.35; cursor: pointer; margin: -14px 0; }
  @media (min-width: 768px) { .sort { color: color-mix(in srgb, var(--accent) 20%, var(--ink)); } }
  .menu { position: absolute; right: 0; top: 100%; z-index: 5; min-width: 180px; display: flex; flex-direction: column; padding: 6px; border-radius: 16px; background: rgba(22, 18, 32, 0.94); border: 1px solid var(--edge); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55); -webkit-backdrop-filter: blur(30px); backdrop-filter: blur(30px); }
  .menu.left { right: auto; left: 0; }
  .menu button { min-height: 44px; padding: 0 14px; border: 0; border-radius: 10px; background: none; text-align: left; font-family: var(--font-ui); font-size: 14px; font-weight: 500; color: var(--ink); cursor: pointer; }
  .menu button.on { background: rgba(255, 255, 255, 0.14); color: var(--accent); font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px 14px; padding: 0 20px; }
  .grid.t { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 22px 18px; padding: 0 40px; }
  .adding { display: flex; flex-direction: column; gap: 6px; }
  .ghost { aspect-ratio: 2 / 3; border-radius: 8px; border: 1.5px dashed rgba(255, 255, 255, 0.4); box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; padding: 8px; }
  .gname { font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.35; overflow-wrap: anywhere; }
  .gnote { font-size: 12px; color: var(--muted); line-height: 1.35; }
  .msg { margin: 0 20px; }
  .none { display: flex; flex-direction: column; gap: 12px; padding: 0 24px; }
  .page.wide .none { padding: 0 40px; }
  .empty { margin: 0; padding: 0 24px; font-size: 14px; color: var(--muted); line-height: 1.5; }
  .none .empty { padding: 0; }
  .find:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (max-width: 300px) {
    .top { flex-wrap: wrap; padding-inline: 12px; }
    .top h1 { width: 100%; }
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); padding-inline: 12px; gap: 14px 10px; }
    .summary { flex-wrap: wrap; }
  }
</style>

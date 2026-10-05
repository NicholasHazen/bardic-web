<script lang="ts">
  import Badge from '../../components/Badge.svelte';
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Cover from '../../components/Cover.svelte';
  import Field from '../../components/Field.svelte';
  import Glass from '../../components/Glass.svelte';
  import RoundButton from '../shell/RoundButton.svelte';
  import type { ManageBookModel, SeriesModel } from './types';

  export interface BookEdit {
    id: string;
    title: string;
    author: string;
    seriesName: string;
    seriesOrder: string;
  }

  interface Props {
    tab?: 'books' | 'removed';
    books: ManageBookModel[];
    /** Total shown in the label; may be more than the rows loaded. */
    count?: number;
    removed?: ManageBookModel[];
    series?: SeriesModel[];
    /** The book whose details are open for editing. */
    editingId?: string | null;
    busy?: boolean;
    error?: string;
    ontab?: (tab: 'books' | 'removed') => void;
    onedit?: (id: string | null) => void;
    onsave?: (edit: BookEdit) => void;
    onrefreshcover?: (id: string) => void;
    onremove?: (id: string) => void;
    onrestore?: (id: string) => void;
    onopenseries?: (name: string) => void;
    onback?: () => void;
  }
  let {
    tab = 'books',
    books,
    count,
    removed = [],
    series = [],
    editingId = null,
    busy = false,
    error,
    ontab,
    onedit,
    onsave,
    onrefreshcover,
    onremove,
    onrestore,
    onopenseries,
    onback,
  }: Props = $props();

  let form = $state<BookEdit>({ id: '', title: '', author: '', seriesName: '', seriesOrder: '' });
  $effect(() => {
    const b = books.find((x) => x.id === editingId);
    if (b) form = { id: b.id, title: b.title, author: b.author, seriesName: b.seriesName, seriesOrder: b.seriesOrder };
  });
  const editing = $derived(books.find((b) => b.id === editingId));
  const valid = $derived(form.title.trim().length > 0 && (form.seriesOrder.trim() === '' || Number.isFinite(Number(form.seriesOrder))));
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && editingId && onedit?.(null)} />

<main class="page">
  <div class="top">
    <RoundButton label="Back" icon="back" onclick={onback} />
    <h1>Manage library</h1>
  </div>

  <Glass radius={22} style="margin: 0 20px; padding: 3px; height: 44px; box-sizing: border-box" role="tablist" aria-label="Show">
    <div class="seg">
      <button type="button" role="tab" aria-selected={tab === 'books'} class:on={tab === 'books'} onclick={() => ontab?.('books')}>Books</button>
      <button type="button" role="tab" aria-selected={tab === 'removed'} class:on={tab === 'removed'} onclick={() => ontab?.('removed')}>Removed</button>
    </div>
  </Glass>

  {#if error}<div class="msg"><Callout tone="error" title="That didn’t work">{error}</Callout></div>{/if}

  {#if tab === 'books'}
    <div class="group">
      <span class="label">Books{count !== undefined ? ` · ${count}` : ''}</span>
      {#each books as b (b.id)}
        {#if b.id === editingId && editing}
          <Glass radius={16} style="margin: 0 20px; padding: 14px; background: rgba(22,18,32,.6); border-color: var(--accent)">
            <div class="editor">
              <div class="line">
                <Cover color={b.color} src={b.coverSrc} width={40} height={60} radius={6} pad={5} shadowY={5} shadowBlur={10} />
                <div class="text grow"><span class="name strong">{b.title}</span><span class="by">{[b.author, `${b.chapters} ch`].filter(Boolean).join(' · ')}</span></div>
              </div>
              <Field label="Title" id="manage-title" bind:value={form.title} autocomplete="off" />
              <Field label="Author" id="manage-author" bind:value={form.author} autocomplete="off" />
              <div class="pair">
                <div class="col grow">
                  <label for="manage-series">Series</label>
                  <Glass radius={12} style="height: 44px; padding: 0 14px; display: flex; align-items: center">
                    <input id="manage-series" type="text" bind:value={form.seriesName} placeholder="None" autocomplete="off" />
                  </Glass>
                </div>
                <div class="col order">
                  <label for="manage-order">Order</label>
                  <Glass radius={12} style="height: 44px; padding: 0 14px; display: flex; align-items: center">
                    <input id="manage-order" type="text" inputmode="decimal" bind:value={form.seriesOrder} placeholder="–" autocomplete="off" />
                  </Glass>
                </div>
              </div>
              <div class="btns">
                <Button disabled={busy || !valid} onclick={() => onsave?.({ ...form })}>Save details</Button>
                <Button variant="glass" disabled={busy} onclick={() => onrefreshcover?.(b.id)}>Refresh cover</Button>
              </div>
              <div class="danger">
                <Button variant="text" style="color: #ffbcae; align-self: flex-start; padding: 0" disabled={busy} onclick={() => onremove?.(b.id)}>Remove from library</Button>
                <span class="note">The book, its audio and your places are kept. Restore any time from Removed. No disk space is freed.</span>
              </div>
            </div>
          </Glass>
        {:else}
          <Glass radius={12} style="margin: 0 20px; padding: 8px 8px 8px 12px">
            <div class="line">
              <Cover color={b.color} src={b.coverSrc} width={40} height={60} radius={6} pad={5} shadowY={5} shadowBlur={10} />
              <div class="text grow"><span class="name">{b.title}</span><span class="by">{[b.author, `${b.chapters} ch`].filter(Boolean).join(' · ')}</span></div>
              <RoundButton label="Edit details for {b.title}" icon="more" tone="ghost" iconSize={20} aria-expanded="false" onclick={() => onedit?.(b.id)} />
            </div>
          </Glass>
        {/if}
      {/each}
      {#if !books.length}<p class="empty">No books in your library yet.</p>{/if}
    </div>

    {#if series.length}
      <div class="group">
        <span class="label">Series · {series.length}</span>
        {#each series as s (s.name)}
          <Glass radius={16} style="margin: 0 20px; padding: 16px">
            <div class="series">
              <div class="line tight">
                <div class="col grow"><span class="sname">{s.name}</span><span class="by">{s.summary}</span></div>
                <Button variant="glass" onclick={() => onopenseries?.(s.name)}>Open series</Button>
              </div>
              {#each s.volumes as v (v.order)}
                <div class="vol">
                  <span class="order-n">{v.order}</span>
                  <span class="vtitle">{v.title}</span>
                  <Badge tone={v.available ? 'ready' : 'idle'}>{v.available ? 'Available' : 'Missing'}</Badge>
                </div>
              {/each}
            </div>
          </Glass>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="group">
      <span class="label">Removed · {removed.length}</span>
      {#each removed as b (b.id)}
        <Glass radius={12} style="margin: 0 20px; padding: 8px 8px 8px 12px">
          <div class="line">
            <Cover color={b.color} src={b.coverSrc} width={40} height={60} radius={6} pad={5} shadowY={5} shadowBlur={10} />
            <div class="text grow"><span class="name">{b.title}</span><span class="by">{b.author}</span></div>
            <Button variant="glass" disabled={busy} onclick={() => onrestore?.(b.id)}>Restore</Button>
          </div>
        </Glass>
      {/each}
      {#if !removed.length}<p class="empty">Nothing is removed. A removed book keeps its audio and your places, and can be restored here.</p>{/if}
    </div>
  {/if}
</main>

<style>
  .page { display: flex; flex-direction: column; gap: 14px; padding-bottom: 20px; font-family: var(--font-ui); }
  .top { display: flex; align-items: center; gap: 4px; padding: 8px 12px 0; }
  h1 { margin: 0 0 0 4px; font-size: 20px; font-weight: 700; color: var(--ink); line-height: 1.35; flex: 1; }
  .seg { display: flex; align-items: center; gap: 2px; }
  .seg button { position: relative; isolation: isolate; flex: 1; display: inline-flex; align-items: center; justify-content: center; height: 44px; margin-block: -3px; padding: 0; border: 0; border-radius: 19px; background: transparent; font-family: var(--font-ui); font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; }
  .seg button.on { color: var(--ink); }
  .seg button.on::before { content: ''; position: absolute; inset: 3px 0; border-radius: 19px; z-index: -1; background: rgba(255, 255, 255, 0.16); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35); }
  .seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .msg { margin: 0 20px; }
  .group { display: flex; flex-direction: column; gap: 8px; }
  .label { font-size: 12px; font-weight: 700; color: var(--muted); line-height: 1.35; letter-spacing: 0.1em; text-transform: uppercase; padding: 0 24px; }
  .line { display: flex; align-items: center; gap: 12px; }
  .line.tight { gap: 8px; }
  .text, .col { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .col { gap: 6px; }
  .grow { flex: 1; }
  .name { font-size: 15px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .name.strong { font-weight: 700; }
  .by { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .name, .by, .sname, .vtitle { overflow-wrap: anywhere; }
  .editor { display: flex; flex-direction: column; gap: 14px; }
  .pair { display: flex; align-items: center; gap: 10px; }
  .order { width: 84px; }
  .col label { font-size: 12px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  input { min-height: 44px; padding: 0; line-height: 1.35; border: 0; outline: 0; background: transparent; flex: 1; min-width: 0; width: 100%; font-family: var(--font-ui); font-size: 14px; color: var(--ink); }
  .col:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 12px; }
  input::placeholder { color: var(--muted); opacity: 0.8; }
  .btns { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .danger { display: flex; flex-direction: column; gap: 4px; }
  .note { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .series { display: flex; flex-direction: column; gap: 10px; }
  .sname { font-size: 16px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .vol { display: flex; align-items: center; gap: 10px; }
  .order-n { font-size: 12px; font-weight: 700; color: var(--muted); line-height: 1.35; min-width: 16px; flex-shrink: 0; }
  .vtitle { font-size: 14px; font-weight: 500; color: var(--ink); line-height: 1.35; flex: 1; min-width: 0; }
  .empty { margin: 0; padding: 0 24px; font-size: 14px; color: var(--muted); line-height: 1.5; }
  @media (max-width: 300px) {
    .pair, .btns, .line, .vol { flex-wrap: wrap; }
    .pair > .col { flex-basis: 100%; }
    .btns :global(button), .danger :global(button) { white-space: normal; height: auto; min-height: 44px; }
    .text { overflow-wrap: anywhere; }
  }
</style>

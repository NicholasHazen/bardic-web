<script lang="ts">
  import Sheet from '../../components/Sheet.svelte';
  import Button from '../../components/Button.svelte';
  import Glass from '../../components/Glass.svelte';
  import { FINISH_COPY, type FinishAction } from './logic';
  import ManageGlyph from './ManageGlyph.svelte';
  import type { ManageGlyphName } from './ManageGlyph.svelte';

  /**
   * The book menu ([BookMenu], A10): mark finished or not started, edit details, free up space, remove from
   * library, and delete permanently. Nothing in this sheet deletes by itself: Remove is reversible, and the last
   * two open sheets that say what goes first.
   */
  interface Props {
    bookTitle: string;
    /** Which of "Mark as finished" and "Mark as not started" the book's state calls for. */
    finish: FinishAction;
    /** Second line of Free up space ("Delete audio you can make again: 160 MB Samantha"). */
    freeSummary: string;
    /** False when there is no audio to free: the row is shown but cannot be used. */
    canFree?: boolean;
    /** Show Delete permanently (the board lists four rows; the connected menu adds this one). */
    showDelete?: boolean;
    busy?: boolean;
    error?: string;
    scrim?: number;
    fixed?: boolean;
    placement?: 'bottom' | 'popover';
    onfinish?: () => void;
    onedit?: () => void;
    onfree?: () => void;
    onremove?: () => void;
    ondelete?: () => void;
    /** C7 is available on a connected book; omitted by the unchanged design fixture. */
    onhistory?: () => void;
    onclose?: () => void;
  }
  let { bookTitle, finish, freeSummary, canFree = true, showDelete = false, busy = false, error, scrim, fixed = false, placement = 'bottom', onfinish, onedit, onfree, onremove, ondelete, onhistory, onclose }: Props = $props();

  interface Row {
    key: string;
    icon: ManageGlyphName;
    title: string;
    sub: string;
    danger?: boolean;
    disabled?: boolean;
    run?: () => void;
  }
  const rows = $derived.by<Row[]>(() => {
    const r: Row[] = [
      { key: 'finish', icon: 'check', title: FINISH_COPY[finish].title, sub: FINISH_COPY[finish].sub, run: onfinish },
      { key: 'edit', icon: 'edit', title: 'Edit details', sub: 'Title, author, series, cover', run: onedit },
      { key: 'free', icon: 'download', title: 'Free up space', sub: freeSummary, disabled: !canFree, run: onfree },
      { key: 'remove', icon: 'trash', title: 'Remove from library', sub: 'Keeps the audio and your places. Restore any time.', danger: true, run: onremove },
    ];
    if (onhistory) r.splice(1, 0, { key: 'history', icon: 'back', title: 'Recent places', sub: 'Restore a place after an accidental jump', run: onhistory });
    if (showDelete) r.push({ key: 'delete', icon: 'trash', title: 'Delete permanently…', sub: 'Asks first, then deletes the book and its audio after 60 seconds.', danger: true, run: ondelete });
    return r;
  });
</script>

<Sheet title="This book" eyebrow={bookTitle} {scrim} {fixed} {placement} {onclose}>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
  <Glass radius={16} style="overflow: hidden; flex-shrink: 0">
    {#each rows as r (r.key)}
      <button type="button" class="row" class:danger={r.danger} disabled={busy || r.disabled} onclick={r.run} data-action={r.key}>
        <span class="icon"><ManageGlyph name={r.icon} color={r.danger ? '#ffbcae' : 'var(--ink)'} /></span>
        <span class="text">
          <span class="name">{r.title}</span>
          <span class="sub">{r.sub}</span>
        </span>
      </button>
    {/each}
  </Glass>
  <Button variant="glass" style="width: 100%; height: 48px; border-radius: 24px" onclick={onclose}>Close</Button>
</Sheet>

<style>
  .row { width: 100%; min-height: 62px; display: flex; align-items: center; gap: 12px; padding: 0 14px; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: transparent; color: var(--ink); font-family: var(--font-ui); text-align: left; cursor: pointer; }
  .row:last-child { border-bottom: 0; }
  .row:disabled { cursor: default; opacity: 0.55; }
  .row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .icon { width: 34px; height: 34px; border-radius: 10px; background: rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .name { font-size: 15px; font-weight: 500; color: var(--ink); line-height: 1.35; }
  .danger .name { color: #ffbcae; }
  .sub { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .error { margin: 0; padding: 10px 14px; border-radius: 12px; background: rgba(255, 120, 100, 0.22); border: 1px solid rgba(255, 255, 255, 0.14); font-family: var(--font-ui); font-size: 13px; color: var(--ink); line-height: 1.35; }
</style>

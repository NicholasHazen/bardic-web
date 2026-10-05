<script lang="ts">
  import { onMount } from 'svelte';
  import { bookActions, libraryQuery } from '../../state/library';
  import { deletions, editRequest, manageActions, type Audiobook, type Place } from '../../state/manage';
  import type { Book, Chapter } from '../../state/book';
  import { player } from '../../player/player';
  import HistoryPlacesView from './HistoryPlacesView.svelte';
  import PlaceConflictSheet from '../sheets/PlaceConflictSheet.svelte';
  import { showToast } from '../../state/toast';
  import { isTablet } from '../shell/viewport';
  import BookMenuView from './BookMenuView.svelte';
  import DeleteConfirmView from './DeleteConfirmView.svelte';
  import FreeSpaceView from './FreeSpaceView.svelte';
  import { defaultChosen, deleteList, deleteRefusal, FINISH_COPY, finishAction, freedToast, freeRefusal, freeSpaceSummary, hasAudio } from './logic';
  import type { SpaceRow } from './types';

  /**
   * The book menu and the sheets it opens, connected to the server. Nothing is deleted from the menu itself:
   * Remove is reversible (the toast has Undo), Free up space deletes only audio that can be made again and says what
   * making it again costs, and Delete permanently is confirmed by the slide control and then waits 60 seconds.
   */
  interface Props {
    listenerId: string;
    book: Book;
    place: Place | null;
    audiobooks: Audiobook[];
    chapters?: Chapter[];
    onclose: () => void;
    /** Read the book page again after something changed. */
    onchanged?: () => void;
  }
  let { listenerId, book, place, audiobooks, chapters = [], onclose, onchanged }: Props = $props();

  let step = $state<'menu' | 'free' | 'delete' | 'history'>('menu');
  let busy = $state(false);
  let error = $state<string | undefined>();
  let rows = $state<SpaceRow[] | null>(null);
  let chosen = $state<ReadonlySet<string>>(new Set());
  let history = $state<Place[]>([]);
  let historyLoading = $state(false);
  let historySelection = $state<Place | null>(null);
  let restoreConflict = $state<'before' | 'after' | null>(null);
  const historyConflict = $derived(step === 'history' && $player.book?.id === book.id ? $player.conflict : null);

  const finish = $derived(finishAction(place));
  const placement = $derived($isTablet ? ('popover' as const) : ('bottom' as const));

  // What each audiobook would free: read when the menu opens, free of charge.
  onMount(() => {
    let live = true;
    void manageActions.spaceFor(audiobooks).then((r) => {
      if (!live) return;
      rows = r;
      chosen = defaultChosen(r);
    });
    return () => (live = false);
  });

  const freeSummary = $derived(rows ? freeSpaceSummary(rows) : audiobooks.length ? 'Checking what each audiobook uses…' : 'No audio on your Bardic computer to delete');
  const canFree = $derived(rows ? rows.some(hasAudio) : false);

  async function doFinish() {
    busy = true;
    error = undefined;
    const r = await manageActions.setFinished(listenerId, book.id, finish === 'finish');
    busy = false;
    if (!r.ok) {
      error = `Your place and your audio are unchanged. ${r.detail}`;
      return;
    }
    showToast({ message: FINISH_COPY[finish].toast });
    onchanged?.();
    libraryQuery.update((s) => ({ ...s }));
    onclose();
  }

  function doEdit() {
    editRequest.set(book.id);
    onclose();
    location.hash = '#/library/manage';
  }

  async function doRemove() {
    busy = true;
    error = undefined;
    const r = await bookActions.remove(listenerId, book.id);
    busy = false;
    if (!r.ok) {
      error = `The book is still in your library. ${r.detail}`;
      return;
    }
    const id = book.id;
    libraryQuery.update((s) => ({ ...s }));
    onclose();
    location.hash = '#/library';
    showToast(
      {
        message: `${book.title} removed. Its audio and your places are kept.`,
        actionLabel: 'Undo',
        onaction: () => {
          void bookActions.restore(listenerId, id).then((x) => {
            libraryQuery.update((s) => ({ ...s }));
            showToast({ message: x.ok ? `${book.title} is back in your library.` : `Couldn’t restore it. ${x.detail}` });
          });
        },
      },
      10000,
    );
  }

  async function doFree() {
    if (busy || !rows) return;
    const ids = rows.filter((r) => chosen.has(r.id)).map((r) => r.id);
    if (!ids.length) return;
    busy = true;
    error = undefined;
    const r = await manageActions.free(ids);
    busy = false;
    onchanged?.();
    if (r.refused) {
      const done = r.freedBytes > 0 ? ` ${freedToast(r.freedBytes)}` : '';
      error = `${freeRefusal(r.refused.code, r.refused.detail)}${done}`;
      // Read the sizes again: some audio may have gone before the refusal.
      void manageActions.spaceFor(audiobooks).then((x) => (rows = x));
      return;
    }
    showToast({ message: freedToast(r.freedBytes) });
    onclose();
  }

  async function doDelete() {
    if (busy) return;
    busy = true;
    error = undefined;
    const r = await deletions.schedule(listenerId, { id: book.id, title: book.title });
    busy = false;
    if (!r.ok) {
      error = deleteRefusal(r.code, r.detail);
      return;
    }
    // The server has hidden the book. The page for it is gone; the banner with Undo takes over.
    onclose();
    location.hash = '#/library';
  }

  async function openHistory() {
    step = 'history';
    error = undefined;
    historyLoading = true;
    historySelection = null;
    restoreConflict = null;
    if ($player.book?.id === book.id) {
      player.pause();
      await player.sync.flush();
    }
    const r = await manageActions.history(listenerId, book.id);
    historyLoading = false;
    if (r.ok) history = r.value;
    else error = `Your current place and recent places are unchanged. ${r.detail}`;
  }

  function restored(message = 'Recent place restored. Playback is paused.') {
    showToast({ message });
    onchanged?.();
    libraryQuery.update((s) => ({ ...s }));
    onclose();
  }

  async function restorePlace(p: Place) {
    if (busy) return;
    busy = true;
    error = undefined;
    historySelection = p;
    const result = await player.restorePlace(book.id, p);
    busy = false;
    if (result === 'restored') restored($player.placeSync === 'queued_offline' ? 'Recent place restored on this device. It will sync when your Bardic computer is back.' : undefined);
    else if (result === 'conflict_before' || result === 'conflict_after') restoreConflict = result === 'conflict_before' ? 'before' : 'after';
    else error = 'Your places are kept. This place could not be restored. Try again when your Bardic computer is reachable.';
  }

  async function resolveHistory(choice: 'mine' | 'theirs', opts: { alwaysNewest: boolean }) {
    if (busy) return;
    busy = true;
    error = undefined;
    await player.sync.resolve(choice);
    if (opts.alwaysNewest) {
      const r = await manageActions.useNewestPlace(listenerId);
      if (!r.ok) error = `Your chosen place is kept. The setting could not be saved. ${r.detail}`;
    }
    busy = false;
    if (!$player.conflict && !error) {
      if (restoreConflict === 'before' && historySelection) await restorePlace(historySelection);
      else if (restoreConflict === 'after') restored(choice === 'mine' ? 'Recent place restored. Both places are kept in history.' : 'Kept the newer place. Your recent places are unchanged.');
      else onchanged?.(); // a conflict already present when history opened was resolved; no restore was requested yet
    }
  }

  const deleteRows = $derived(deleteList({ chapters: book.chapter_count, words: book.word_count }, audiobooks.map((a) => ({ name: a.voice_name, bytes: a.bytes }))));
  const toStep = (s: 'menu' | 'free' | 'delete') => () => {
    step = s;
    error = undefined;
  };
</script>

{#if step === 'menu'}
  <BookMenuView
    bookTitle={book.title}
    {finish}
    {freeSummary}
    {canFree}
    showDelete
    {busy}
    {error}
    fixed
    {placement}
    {onclose}
    onfinish={doFinish}
    onedit={doEdit}
    onfree={toStep('free')}
    onremove={doRemove}
    ondelete={toStep('delete')}
    onhistory={openHistory}
  />
{:else if step === 'free'}
  <FreeSpaceView
    bookTitle={book.title}
    rows={rows ?? []}
    {chosen}
    loading={!rows}
    {busy}
    {error}
    fixed
    {placement}
    scrim={0.6}
    {onclose}
    ontoggle={(id) => {
      const n = new Set(chosen);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      chosen = n;
    }}
    onfree={doFree}
  />
{:else if step === 'history'}
  {#if historyConflict}
    <PlaceConflictSheet conflict={historyConflict} bookTitle={book.title} fixed {placement} {busy} onresolve={resolveHistory} {onclose} />
  {:else}
    <HistoryPlacesView bookTitle={book.title} entries={history} {chapters} loading={historyLoading} {busy} {error} {placement} onrestore={restorePlace} {onclose} />
  {/if}
{:else}
  <DeleteConfirmView bookTitle={book.title} rows={deleteRows} {busy} {error} fixed {placement} scrim={0.6} {onclose} onconfirm={doDelete} />
{/if}

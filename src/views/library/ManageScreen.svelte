<script lang="ts">
  import { bookActions, buildBookUpdate, followLibraryEvents, libraryQuery, manageList, toManage, toSeriesModel, type Series } from '../../state/library';
  import { listenerStore } from '../../state/listener';
  import { editRequest } from '../../state/manage';
  import { showToast } from '../../state/toast';
  import LibraryToast from './LibraryToast.svelte';
  import ManageView, { type BookEdit } from './ManageView.svelte';

  /** Edit books (A9): title, author, series and order, cover refresh, remove and restore. Never touches the text. */
  interface Props {
    /** Back to Library; defaults to the hash route. */
    onback?: () => void;
  }
  let { onback = () => (location.hash = '#/library') }: Props = $props();

  const listenerId = $derived($listenerStore.currentId);
  let tab = $state<'books' | 'removed'>('books');
  let editingId = $state<string | null>(null);
  let busy = $state(false);
  let error = $state<string | undefined>();
  let series = $state<Series[]>([]);
  // The book menu's "Edit details" opens this screen with that book's editor.
  $effect(() => {
    const id = $editRequest;
    if (id) {
      tab = 'books';
      editingId = id;
      editRequest.set(null);
    }
  });

  const live = $derived($manageList.books.filter((b) => b.state !== 'removed'));
  const gone = $derived($manageList.books.filter((b) => b.state === 'removed'));

  async function loadSeries() {
    if (!listenerId) return;
    const r = await bookActions.series(listenerId);
    if (r.ok) series = r.value?.items ?? [];
  }
  $effect(() => {
    const id = listenerId;
    if (!id) return;
    if (!manageList.configure(id, { q: '', filter: 'all', sort: 'title' }, true)) void manageList.load(false);
    void loadSeries();
    return followLibraryEvents(id);
  });

  async function after(r: { ok: boolean; detail?: string }, done: string) {
    busy = false;
    if (!r.ok) {
      error = r.detail;
      return false;
    }
    error = undefined;
    await Promise.all([manageList.load(false), loadSeries()]);
    // The Library keeps its own list; it refreshes itself on the next change notice, and now.
    libraryQuery.update((s) => ({ ...s }));
    if (done) showToast({ message: done });
    return true;
  }

  async function save(edit: BookEdit) {
    if (!listenerId) return;
    const original = $manageList.books.find((b) => b.id === edit.id);
    if (!original) return;
    const body = buildBookUpdate(original, edit);
    if (!Object.keys(body).length) {
      editingId = null;
      return;
    }
    busy = true;
    if (await after(await bookActions.update(listenerId, edit.id, body), 'Details saved.')) editingId = null;
  }
  async function refreshCover(id: string) {
    if (!listenerId) return;
    busy = true;
    await after(await bookActions.refreshCover(listenerId, id), 'Cover refreshed.');
  }
  async function remove(id: string) {
    if (!listenerId) return;
    busy = true;
    const title = $manageList.books.find((b) => b.id === id)?.title ?? 'The book';
    if (await after(await bookActions.remove(listenerId, id), `${title} removed. Its audio and your places are kept.`)) editingId = null;
  }
  async function restore(id: string) {
    if (!listenerId) return;
    busy = true;
    await after(await bookActions.restore(listenerId, id), 'Book restored.');
  }
  function openSeries(name: string) {
    libraryQuery.update((s) => ({ ...s, q: name }));
    location.hash = '#/library';
  }
</script>

<ManageView
  {tab}
  books={live.map(toManage)}
  count={live.length}
  removed={gone.map(toManage)}
  series={series.map(toSeriesModel)}
  {editingId}
  {busy}
  {error}
  ontab={(t) => ((tab = t), (editingId = null), (error = undefined))}
  onedit={(id) => ((editingId = id), (error = undefined))}
  onsave={save}
  onrefreshcover={refreshCover}
  onremove={remove}
  onrestore={restore}
  onopenseries={openSeries}
  {onback}
/>
<LibraryToast />

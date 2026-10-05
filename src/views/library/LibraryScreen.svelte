<script lang="ts">
  import { avatarHue } from '../../lib/listenerText';
  import { followLibraryEvents, libraryBooks, libraryList, libraryQuery, onDeviceIds, toCard } from '../../state/library';
  import { currentListener, listenerStore } from '../../state/listener';
  import { isTablet } from '../shell/viewport';
  import AddBookSheet from './AddBookSheet.svelte';
  import { importer } from './importer';
  import LibraryToast from './LibraryToast.svelte';
  import LibraryView from './LibraryView.svelte';
  import type { LibraryFilter, LibrarySort } from './types';

  /** Library, connected to the server: grid, search, filters, sort, series grouping (A7). */
  interface Props {
    onswitchlistener?: () => void;
  }
  let { onswitchlistener }: Props = $props();

  const who = $derived(currentListener($listenerStore));
  const listenerId = $derived($listenerStore.currentId);
  const listener = $derived({ name: who?.name ?? '', hue: who ? avatarHue(who.id) : undefined });

  // What is typed shows at once; the request follows 250 ms after the last key.
  let typed = $state($libraryQuery.q);
  $effect(() => {
    const q = typed;
    const t = setTimeout(() => libraryQuery.update((s) => (s.q === q ? s : { ...s, q })), 250);
    return () => clearTimeout(t);
  });

  $effect(() => {
    const id = listenerId;
    if (!id) return;
    if (!libraryList.configure(id, $libraryQuery)) void libraryList.load(false);
  });
  $effect(() => {
    const id = listenerId;
    if (id) return followLibraryEvents(id);
  });

  const cards = $derived($libraryBooks.books.map((b) => toCard(b, $onDeviceIds)));
  const ready = $derived($libraryBooks.state.status === 'ready');
  const count = $derived(ready && $libraryBooks.state.complete ? cards.length : undefined);
</script>

<LibraryView
  layout={$isTablet ? 'tablet' : 'phone'}
  {listener}
  books={cards}
  {count}
  filter={$libraryQuery.filter}
  sort={$libraryQuery.sort}
  query={typed}
  loading={$libraryBooks.state.status === 'loading' || $libraryBooks.state.status === 'idle'}
  error={$libraryBooks.state.status === 'error' && !cards.length ? $libraryBooks.state.error : undefined}
  onfilter={(filter: LibraryFilter) => libraryQuery.update((s) => ({ ...s, filter }))}
  onsort={(sort: LibrarySort) => libraryQuery.update((s) => ({ ...s, sort }))}
  onquery={(q) => (typed = q)}
  onaddbook={() => importer.open()}
  {onswitchlistener}
  onretry={() => libraryList.load()}
/>
<AddBookSheet />
<LibraryToast />

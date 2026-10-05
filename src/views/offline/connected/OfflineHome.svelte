<script lang="ts">
  import { browserStorage } from '../../../lib/clock';
  import { avatarHue } from '../../../lib/listenerText';
  import { offline } from '../../../offline/offline';
  import { listenerStore } from '../../../state/listener';
  import { startListening } from '../../nowplaying/start';
  import HomeOfflineView from '../HomeOfflineView.svelte';
  import { awayHome, readLocalPlace, recallHome } from './mapping';
  import { listenerName } from './listenerName';

  /** Home with the Bardic computer out of reach (O4): the books on this device open, the rest of the library is shown as unavailable. */
  interface Props {
    onswitchlistener?: () => void;
  }
  let { onswitchlistener }: Props = $props();

  const listenerId = $derived($listenerStore.currentId);
  const home = $derived.by(() => {
    if (!listenerId) return { books: [], continueItem: null };
    const places: Record<string, ReturnType<typeof readLocalPlace>> = {};
    for (const b of $offline.books) places[b.bookId] = readLocalPlace(browserStorage(), listenerId, b.bookId);
    return awayHome($offline, recallHome(browserStorage(), listenerId), places);
  });
  const listener = $derived({ name: listenerId ? listenerName(browserStorage(), listenerId) : '', hue: listenerId ? avatarHue(listenerId) : undefined });
</script>

<HomeOfflineView {listener} continueItem={home.continueItem} books={home.books} {onswitchlistener} oncontinue={() => home.continueItem && void startListening(home.continueItem.id)} />

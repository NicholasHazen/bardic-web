<script lang="ts">
  import HomeView from '../library/HomeView.svelte';
  import type { BookCardModel, ContinueModel, ListenerModel } from '../library/types';
  import { splitByDevice } from './logic';

  /**
   * Home away from home ([HomeOffline], O4): only the books on this device can be opened; the others are shown dimmed as
   * needing your Bardic computer. Built from HomeView, so Home, HomeTablet and HomeEmpty are untouched. `books` are all
   * the books of the library (Home's cards); `onDevice` on a card says a downloaded audiobook is held here.
   */
  interface Props {
    listener: ListenerModel;
    /** The book to carry on with; shown only when it is on this device. */
    continueItem?: ContinueModel | null;
    /** Every book Home would show (On this device and Recently added together). */
    books: BookCardModel[];
    onswitchlistener?: () => void;
    oncontinue?: () => void;
  }
  let { listener, continueItem = null, books, onswitchlistener, oncontinue }: Props = $props();

  const split = $derived(splitByDevice(books));
  const playable = $derived(continueItem && split.here.some((b) => b.id === continueItem.id) ? continueItem : null);
</script>

<HomeView {listener} continueItem={playable} onDevice={split.here} offline unavailable={split.away} {onswitchlistener} {oncontinue} />

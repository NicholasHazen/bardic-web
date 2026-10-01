<script lang="ts">
  import { avatarHue } from '../../lib/listenerText';
  import { bookActions, chapterLine, followLibraryEvents, homeCard, homeList, homeSections, onDeviceIds, toCard, toContinue, DEFAULT_QUERY, type Chapter } from '../../state/library';
  import { currentListener, listenerStore } from '../../state/listener';
  import { showToast } from '../../state/toast';
  import { isTablet } from '../shell/viewport';
  import AddBookSheet from './AddBookSheet.svelte';
  import HomeView from './HomeView.svelte';
  import { importer } from './importer';
  import LibraryToast from './LibraryToast.svelte';

  /** Home, connected to the server: Continue, On this device, Recently added (A8) and the first-run screen (A6). */
  interface Props {
    /** Opens the listener switcher. */
    onswitchlistener?: () => void;
    /** Continue listening: opens the player (W3). Defaults to the book page. */
    onplay?: (bookId: string) => void;
  }
  let { onswitchlistener, onplay }: Props = $props();

  const who = $derived(currentListener($listenerStore));
  const listenerId = $derived($listenerStore.currentId);
  const listener = $derived({ name: who?.name ?? '', hue: who ? avatarHue(who.id) : undefined });
  const sections = $derived(homeSections($homeList.books, $onDeviceIds));
  const empty = $derived($homeList.status === 'ready' && $homeList.books.length === 0);

  let chapters = $state<Chapter[]>([]);
  let chaptersFor = $state<string | null>(null);
  $effect(() => {
    const b = sections.continueBook;
    if (!b || chaptersFor === b.id) return;
    chaptersFor = b.id;
    void bookActions.chapters(b.id).then((r) => {
      if (r.ok && chaptersFor === b.id) chapters = r.value?.items ?? [];
    });
  });
  const continueItem = $derived.by(() => {
    const b = sections.continueBook;
    if (!b || !b.place) return null;
    return toContinue(b, chaptersFor === b.id ? chapterLine(chapters, b.place.chapter_id) : undefined);
  });

  // Load when shown (or when the listener changes) and follow change notices while shown.
  $effect(() => {
    const id = listenerId;
    if (!id) return;
    if (!homeList.configure(id, DEFAULT_QUERY)) void homeList.load(false);
    return followLibraryEvents(id);
  });

  let sampleBusy = $state(false);
  async function sample() {
    sampleBusy = true;
    const r = await bookActions.sample();
    sampleBusy = false;
    if (r.ok) {
      void homeList.load(false);
      showToast({ message: 'Sample added.', actionLabel: 'Open', href: `#/book/${r.value?.id ?? ''}` });
    } else showToast({ message: `Couldn’t add the sample. ${r.detail}` });
  }
  function play() {
    const id = continueItem?.id;
    if (!id) return;
    if (onplay) onplay(id);
    else location.hash = `#/book/${id}`;
  }
</script>

<HomeView
  layout={$isTablet ? 'tablet' : 'phone'}
  {listener}
  {continueItem}
  onDevice={sections.onDevice.map((b) => homeCard(b, $onDeviceIds))}
  recent={sections.recent.map((b) => ({ ...toCard(b, $onDeviceIds), progress: undefined, subtitle: b.author }))}
  {empty}
  error={$homeList.status === 'error' && !$homeList.books.length ? $homeList.error : undefined}
  {sampleBusy}
  {onswitchlistener}
  onaddbook={() => importer.open()}
  onchoosefile={(f) => importer.pick(f)}
  onsample={sample}
  oncontinue={play}
  onretry={() => homeList.load()}
/>
<AddBookSheet />
<LibraryToast />

<script lang="ts">
  import Glass from '../../../components/Glass.svelte';
  import { browserStorage } from '../../../lib/clock';
  import { offline } from '../../../offline/offline';
  import { listenerStore } from '../../../state/listener';
  import { paletteFromHex } from '../../../theme/fromHex';
  import BookView from '../../book/BookView.svelte';
  import MiniPlayerHost from '../../nowplaying/MiniPlayerHost.svelte';
  import { startListening } from '../../nowplaying/start';
  import Shell from '../../shell/Shell.svelte';
  import OfflineNotice from '../OfflineNotice.svelte';
  import BookDownloads from './BookDownloads.svelte';
  import UpdateAudioHost from './UpdateAudioHost.svelte';
  import { offlinePage, readLocalPlace } from './mapping';

  /**
   * A downloaded book's page with the Bardic computer out of reach (O4): the book, the voice and every chapter with the words the
   * device knows, built only from what the engine stores. Nothing here waits for the server.
   */
  interface Props {
    bookId: string;
    onswitchlistener?: () => void;
  }
  let { bookId, onswitchlistener }: Props = $props();

  const listenerId = $derived($listenerStore.currentId);
  // The audiobook of this book that holds the most on this device (the one the player opens too).
  const book = $derived.by(() => {
    const mine = $offline.books.filter((b) => b.bookId === bookId && b.chapters.some((c) => c.state === 'on_device' || c.state === 'out_of_date'));
    return mine.sort((a, b) => b.chapters.filter((c) => c.state === 'on_device').length - a.chapters.filter((c) => c.state === 'on_device').length)[0];
  });
  const place = $derived(listenerId ? readLocalPlace(browserStorage(), listenerId, bookId) : null);
  let expanded = $state(false);
  const page = $derived(book ? offlinePage(book, place, expanded) : null);
  const palette = $derived(book ? paletteFromHex(book.coverColor) : undefined);
  let updateOpen = $state(false);
</script>

<Shell active="library" {onswitchlistener} {palette}>
  {#snippet player()}<MiniPlayerHost />{/snippet}
  {#if page && book}
    <BookView
      header={page.header}
      primaryLabel={page.primaryLabel}
      audiobook={null}
      chapters={page.chapters}
      {audiobookSlot}
      {downloads}
      onback={() => (location.hash = '#/')}
      onplay={() => void startListening(bookId)}
      onshowall={() => (expanded = true)}
    />
  {/if}
  {#snippet overlay()}
    {#if updateOpen && book}<UpdateAudioHost audiobookId={book.audiobookId} onclose={() => (updateOpen = false)} />{/if}
  {/snippet}
</Shell>

{#snippet audiobookSlot()}
  {#if page && book}
    <Glass radius={16} style="margin: var(--card-margin, 0 20px); padding: 14px">
      <div class="card">
        <span class="voice">{page.card.voice}</span>
        <span class="sub">{page.deviceLine}</span>
        <OfflineNotice />
      </div>
    </Glass>
  {/if}
{/snippet}

{#snippet downloads()}
  {#if book}<BookDownloads audiobookId={book.audiobookId} onupdate={() => (updateOpen = true)} />{/if}
{/snippet}

<style>
  .card { display: flex; flex-direction: column; gap: 6px; font-family: var(--font-ui); overflow-wrap: anywhere; }
  .voice { font-size: 15px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .sub { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
</style>

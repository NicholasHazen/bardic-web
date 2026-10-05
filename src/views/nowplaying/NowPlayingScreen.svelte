<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import { deviceId } from '../../lib/device';
  import { api } from '../../api/client';
  import { readerActions, readerPreferences } from '../../state/reader';
  import { listenerStore } from '../../state/listener';
  import { apiContinuationDeps, SeriesContinuationStore } from '../../state/seriesContinuation';
  import { player } from '../../player/player';
  import { offline } from '../../offline/offline';
  import UnavailableChapterNotice from '../offline/UnavailableChapterNotice.svelte';
  import { nextForNotice, ringFor } from '../offline/connected/mapping';
  import { paletteFromHex } from '../../theme/fromHex';
  import NowPlayingView from '../player/NowPlayingView.svelte';
  import BookSearchView from '../sheets/BookSearchView.svelte';
  import ChaptersSheet from '../sheets/ChaptersSheet.svelte';
  import EndOfBookView from '../sheets/EndOfBookView.svelte';
  import PlaceConflictSheet from '../sheets/PlaceConflictSheet.svelte';
  import ReaderAppearanceSheet from '../sheets/ReaderAppearanceSheet.svelte';
  import SleepTimerSheet from '../sheets/SleepTimerSheet.svelte';
  import SpeedSheet from '../sheets/SpeedSheet.svelte';
  import type { ReaderAppearanceValue, ReaderExtras } from '../sheets/appearance';
  import { hitToRow, type SearchResultRow } from '../sheets/search';
  import { isTablet } from '../shell/viewport';
  import type { SleepTimer } from '../../player/types';

  /**
   * Now Playing, connected to the player engine (S1 to S9, C-series): Listen and Read, the sheets that change how
   * it plays (speed, sleep, chapters, reader appearance), search in the book, the place-conflict choice and the end
   * of the book. The screen only shows state and sends commands; the engine decides.
   */
  let { bookId }: { bookId: string } = $props();

  const s = $derived($player);
  const listenerId = $derived($listenerStore.currentId);

  // Open the book if it is not the one loaded (a deep link, or the mini-player of another book).
  $effect(() => {
    const id = bookId;
    untrack(() => {
      if (get(player).book?.id !== id) void player.open(id, { autoplay: false });
    });
  });

  const appearance = $derived($readerPreferences.appearance);
  const extras = $derived($readerPreferences.extras);
  const followNarration = $derived(extras.followNarration);
  let sheet = $state<null | 'speed' | 'sleep' | 'chapters' | 'appearance' | 'search'>(null);
  let storyOnly = $state(false);
  let following = $state(true);
  $effect(() => {
    // Only preference changes reset this flag; playback ticks leave a manual scroll-away alone.
    following = followNarration;
  });

  // viewport kind
  let w = $state(window.innerWidth);
  let h = $state(window.innerHeight);
  $effect(() => {
    const on = () => ((w = window.innerWidth), (h = window.innerHeight));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  });
  const layout = $derived(w < 768 ? 'phone' : w > h ? 'tablet-landscape' : 'tablet-portrait');
  const placement = $derived(layout === 'phone' || layout === 'tablet-portrait' ? 'bottom' : 'popover');

  // a clock for the sleep caption
  let now = $state(Date.now());
  $effect(() => {
    if (s.sleep.kind !== 'minutes' && sheet !== 'sleep') return;
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const palette = $derived(s.book ? paletteFromHex(s.book.coverColor) : undefined);
  const nowPlaying = $derived(s);

  function setAppearance(v: ReaderAppearanceValue) {
    readerActions.setAppearance(v);
  }
  function setExtras(v: ReaderExtras) {
    readerActions.setExtras(v);
  }
  const setSleep = (t: SleepTimer) => player.setSleep(t);

  // ---- search in the book
  let query = $state('');
  let results = $state<SearchResultRow[]>([]);
  let total = $state<number | null>(null);
  let status = $state<'idle' | 'searching' | 'done' | 'error'>('idle');
  let cursor = $state<string | null>(null);
  const chapterLabel = (id: string) => {
    const c = s.chapters.find((x) => x.id === id);
    return c ? (c.storyNumber !== null ? `Chapter ${c.storyNumber}` : c.title) : 'Chapter';
  };
  async function search(q: string, more = false) {
    if (!s.book) return;
    status = 'searching';
    const r = await api.GET('/api/books/{book_id}/search', {
      params: { path: { book_id: s.book.id }, query: { q, limit: 20, ...(more && cursor ? { after: cursor } : {}) } },
    });
    if (!r.data) return void (status = 'error');
    const rows = r.data.items.map((hit) => hitToRow(hit, chapterLabel(hit.chapter_id)));
    results = more ? [...results, ...rows] : rows;
    total = r.data.total;
    cursor = r.data.next;
    status = 'done';
  }
  function clearSearch() {
    results = [];
    total = null;
    status = 'idle';
    cursor = null;
  }
  function openHit(row: SearchResultRow) {
    sheet = null;
    player.gotoOffset(row.chapterId, row.start);
    player.setMode('read');
  }

  // ---- place conflict: remember "always use the newest" as the listener's setting
  async function resolve(choice: 'mine' | 'theirs', opts?: { alwaysNewest?: boolean }) {
    player.resolveConflict(choice);
    if (opts?.alwaysNewest && listenerId) {
      const cur = await api.GET('/api/listeners/{listener_id}/settings', { params: { path: { listener_id: listenerId } } });
      if (cur.data) {
        await api.PUT('/api/listeners/{listener_id}/settings', {
          params: { path: { listener_id: listenerId }, header: { 'X-Bardic-Device': deviceId() } },
          body: { ...cur.data, place_conflict: 'newest' },
        });
      }
    }
  }

  // ---- downloads (W5): the ring in Read while this audiobook downloads, and O5 when a chapter is not on this device
  let noticeDismissed = $state(false);
  const ring = $derived(ringFor($offline, s.audiobookId));
  const notDownloaded = $derived((s.needsYou?.code as string | undefined) === 'offline_not_downloaded' && !noticeDismissed);
  $effect(() => {
    void s.chapter?.id;
    noticeDismissed = false;
  });
  const deviceBook = $derived(s.audiobookId ? $offline.books.find((b) => b.audiobookId === s.audiobookId) : undefined);
  const next = $derived(nextForNotice((s as { offlineNext?: { chapterId: string; title: string } | null }).offlineNext, deviceBook, s.chapter?.index ?? 0));

  // ---- end of book (S9): scoped to this listener, route and end state, never to playback ticks.
  const continuation = new SeriesContinuationStore(apiContinuationDeps);
  const endBookId = $derived(s.finishedBook && s.book?.id === bookId ? s.book.id : null);
  let marked = $state(false);
  let marking = $state(false);
  let finishError = $state(false);
  let endRun = 0;
  $effect(() => {
    continuation.configure(listenerId, endBookId);
    ++endRun;
    marked = false;
    marking = false;
    finishError = false;
  });
  onDestroy(() => { ++endRun; continuation.dispose(); });
  async function markFinished() {
    if (marking || marked) return;
    const run = endRun;
    marking = true;
    finishError = false;
    const ok = await player.markFinished(true);
    if (run !== endRun) return;
    marking = false;
    marked = ok;
    finishError = !ok;
  }

  const go = (route: string) => (location.hash = `#${route}`);
  const back = () => (history.length > 1 ? history.back() : go('/'));
</script>

{#if s.book && s.chapter}
  <main class="screen" aria-label="Now Playing">
    <div class="underlay" inert={sheet === 'search' || s.finishedBook}>
    <NowPlayingView
      state={nowPlaying}
      {appearance}
      {layout}
      {palette}
      {now}
      bind:following
      {followNarration}
      pageWidth={extras.pageWidth}
      byline={s.book.author}
      ontoggle={() => player.toggle()}
      onskip={(sec) => player.skip(sec)}
      onseek={(sec) => player.seek(sec)}
      onnext={() => player.nextChapter()}
      onprevious={() => player.previousChapter()}
      ongotoline={(id) => player.gotoLine(id)}
      onsetmode={(m) => player.setMode(m)}
      onopenSpeed={() => (sheet = 'speed')}
      onopenSleep={() => (sheet = 'sleep')}
      onopenChapters={() => (sheet = 'chapters')}
      onopenVoice={() => go(`/book/${s.book?.id}`)}
      onopenAppearance={() => (sheet = 'appearance')}
      onopensearch={() => (sheet = 'search')}
      onmore={() => go(`/book/${s.book?.id}`)}
      oncollapse={back}
      download={ring}
      onopendownloads={() => go('/settings/downloads')}
      onneedsyou={(action) => go(action?.route ?? `/book/${s.book?.id}`)}
    />
    </div>

    {#if notDownloaded && s.chapter}
      <div class="unavailable">
        <UnavailableChapterNotice
          chapterNumber={s.chapter.storyNumber ?? s.chapter.index + 1}
          {next}
          onplaynext={(id) => player.gotoChapter(id)}
          ondismiss={() => (noticeDismissed = true)}
        />
      </div>
    {/if}

    {#if sheet === 'speed'}
      <SpeedSheet fixed {placement} speed={s.speed} onchange={(v) => player.setSpeed(v)} onclose={() => (sheet = null)} />
    {:else if sheet === 'sleep'}
      <SleepTimerSheet fixed {placement} timer={s.sleep} {now} onchange={setSleep} onclose={() => (sheet = null)} />
    {:else if sheet === 'chapters'}
      <ChaptersSheet
        fixed
        {placement}
        bookTitle={s.book.title}
        chapters={s.chapters}
        currentId={s.chapter.id}
        chapterOffset={s.chapterOffset}
        {storyOnly}
        onstoryonly={(v) => (storyOnly = v)}
        onselect={(id) => (player.gotoChapter(id), (sheet = null))}
        onmakeready={() => go(`/book/${s.book?.id}`)}
        onclose={() => (sheet = null)}
      />
    {:else if sheet === 'appearance'}
      <ReaderAppearanceSheet fixed placement={layout === 'tablet-landscape' ? 'popover' : 'bottom'} value={appearance} {extras} onchange={setAppearance} onextras={setExtras} onclose={() => (sheet = null)} />
    {/if}

    {#if sheet === 'search'}
      <div class="overlay">
        <BookSearchView
          bind:query
          {results}
          {total}
          {status}
          hasMore={cursor !== null}
          scopes={false}
          onsearch={(q) => void search(q)}
          onclear={clearSearch}
          onmore={() => void search(query, true)}
          onopen={openHit}
          onback={() => (sheet = null)}
        />
      </div>
    {/if}

    {#if s.conflict}
      <PlaceConflictSheet fixed conflict={s.conflict} bookTitle={s.book.title} onresolve={(c, o) => void resolve(c, o)} onclose={() => go(`/book/${s.book?.id}`)} />
    {/if}

    {#if s.finishedBook}
      <div class="overlay">
        <EndOfBookView
          title={s.book.title}
          coverColor={s.book.coverColor}
          coverSrc={s.book.coverSrc}
          summary={`Chapter ${s.chapter.storyTotal} of ${s.chapter.storyTotal}`}
          next={$continuation.next}
          missingVolume={$continuation.missingVolume}
          lookupStatus={$continuation.status}
          finished={marked}
          {marking}
          {finishError}
          onminimise={() => go('/')}
          onmore={() => go(`/book/${s.book?.id}`)}
          onfinish={() => void markFinished()}
          onnext={() => { if ($continuation.next) go(`/book/${$continuation.next.id}`); }}
          onretry={() => void continuation.refresh()}
          onrestart={() => player.listenAgain()}
        />
      </div>
    {/if}
  </main>
{:else}
  <div class="loading" role="status" aria-live="polite">Opening your book…</div>
{/if}

<style>
  .screen { position: fixed; inset: 0; }
  .underlay { height: 100%; }
  .overlay { position: fixed; inset: 0; z-index: 30; background: var(--base); overflow: auto; }
  .unavailable { position: fixed; left: 16px; right: 16px; bottom: 24px; z-index: 20; max-height: calc(100% - 48px); overflow-y: auto; }
  .loading { position: fixed; inset: 0; display: grid; place-items: center; color: var(--muted); }
</style>

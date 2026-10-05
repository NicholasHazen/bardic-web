<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import { avatarHue } from '../../lib/listenerText';
  import { bookStore, currentAudiobook, deviceChapters, deviceChapterDurations, followBookEvents, makeSheet, pageModel, type Audiobook } from '../../state/book';
  import { makeOptions } from '../../lib/bookAudio';
  import { currentListener, listenerStore } from '../../state/listener';
  import { isPlanNotice, planStore } from '../../state/plans';
  import { voices } from '../../state/voices';
  import { derivePalette } from '../../theme/derive';
  import { player } from '../../player/player';
  import { deletions } from '../../state/manage';
  import BookMenuHost from '../manage/BookMenuHost.svelte';
  import LibraryToast from '../library/LibraryToast.svelte';
  import { offline } from '../../offline/offline';
  import BookDownloads from '../offline/connected/BookDownloads.svelte';
  import DownloadSheetHost from '../offline/connected/DownloadSheetHost.svelte';
  import UpdateAudioHost from '../offline/connected/UpdateAudioHost.svelte';
  import { pickChapters } from '../offline/connected/mapping';
  import FirstPlayView from '../sheets/FirstPlayView.svelte';
  import NoVoiceView from '../sheets/NoVoiceView.svelte';
  import MiniPlayerHost from '../nowplaying/MiniPlayerHost.svelte';
  import { startListening } from '../nowplaying/start';
  import PlanFlow from '../plans/PlanFlow.svelte';
  import RunningPlan from '../plans/RunningPlan.svelte';
  import Shell from '../shell/Shell.svelte';
  import { isTablet } from '../shell/viewport';
  import VoiceChooserSheet from '../voices/VoiceChooserSheet.svelte';
  import BookView from './BookView.svelte';
  import MakeReadySheet from './MakeReadySheet.svelte';

  /**
   * The book page, connected to the server (B1 to B6, V3): the book, its audiobooks and the audio state of every
   * chapter, kept current from the event stream. Draws its own app frame (Library tab) because the page takes its
   * colours from the book's cover. Making ready starts here only for a free voice; a premium voice is made only from a
   * plan the listener approves in the plan sheet (W4): the page opens that sheet and shows the plan that is going.
   */
  interface Props {
    bookId: string;
    /** Opens the listener switcher (the rail's avatar on a tablet). */
    onswitchlistener?: () => void;
  }
  let { bookId, onswitchlistener }: Props = $props();

  const listenerId = $derived($listenerStore.currentId);
  const s = $derived($bookStore);

  $effect(() => {
    bookStore.configure(listenerId, bookId);
  });
  $effect(() => {
    const l = listenerId;
    if (!l) return;
    return followBookEvents(bookStore, l, bookId, (n) => {
      if (isPlanNotice(n.type)) planStore.refreshSoon();
    });
  });
  // The plans of this book, kept current (events, and a timer while one is going).
  $effect(() => {
    planStore.track(listenerId, bookId);
    return () => {
      // Leaving the page: stop reading plans, and close a sheet that was left open.
      planStore.track(null, null);
      planStore.close();
    };
  });

  let expanded = $state(false);
  let storyOnly = $state(false);
  let chooser = $state(false);
  let makeOpen = $state(false);
  let includeMatter = $state(false);
  let selected = $state('whole');
  let busy = $state(false);
  let actionRun = 0;
  // A deleted-for-good book is hidden by the server (reading it is 404). This asks the server whether that is why.
  const beingDeleted = $derived($deletions.items.some((i) => i.bookId === bookId));
  $effect(() => {
    const l = listenerId;
    if (l && s.status === 'missing') void deletions.adopt(l, bookId);
  });
  let sheetError = $state<string | undefined>();
  let problem = $state<{ title: string; text: string } | undefined>();
  let downloadOpen = $state(false);
  let updateOpen = $state(false);
  let menuOpen = $state(false);
  let chapterRefreshNotice = $state<string | undefined>();
  let updatingChapters = $state(false);
  let chapterRefreshRun = 0;

  // A different book or listener starts with the short list and nothing open.
  $effect(() => {
    void bookId;
    void listenerId;
    actionRun++;
    chapterRefreshRun++;
    busy = false;
    expanded = false;
    storyOnly = false;
    chooser = false;
    makeOpen = false;
    includeMatter = false;
    sheetError = undefined;
    problem = undefined;
    downloadOpen = false;
    updateOpen = false;
    menuOpen = false;
    chapterRefreshNotice = undefined;
    updatingChapters = false;
  });

  const page = $derived(pageModel(s, { expanded, storyOnly }, $deviceChapters, s.at, $deviceChapterDurations));
  const palette = $derived(derivePalette(s.book?.cover?.sample));
  const sheet = $derived(makeOpen ? makeSheet(s, selected, includeMatter) : undefined);
  const hasMatter = $derived(s.chapters.some((c) => c.kind !== 'story'));
  const current = $derived(currentAudiobook(s));
  const premium = $derived(current?.tier === 'premium');
  const planGoing = $derived(!!current && $planStore.track.active.some((p) => p.audiobook_id === current.id));
  const planEnded = $derived(!!current && $planStore.track.ended?.audiobook_id === current.id);
  // "Plan from chapter 4" when the listener is past the first chapter.
  const planFrom = $derived.by(() => {
    const o = makeOptions({ chapters: s.chapters.map((c) => ({ id: c.id, title: c.title, kind: c.kind, word_count: c.word_count })), audio: s.audio, currentId: s.place?.chapter_id }).find((x) => x.id === 'from');
    return o ? o.title.replace(/^From/, 'Plan from') : undefined;
  });
  // Compare what this device holds of the audiobook with the server when the page opens.
  const currentId = $derived(current?.id);
  $effect(() => {
    const id = currentId;
    if (id) void offline.checkUpdates(id);
  });
  const deviceBook = $derived(currentId ? $offline.books.find((b) => b.audiobookId === currentId) : undefined);
  const downloadChapters = $derived(pickChapters(s.chapters, s.audio, deviceBook));
  const freeVoiceName = $derived($voices.items.find((v) => v.id === s.defaultVoiceId && v.tier === 'free')?.name ?? null);

  /** Open the plan sheet. This prices the plan (free) and starts nothing; the sheet's Approve button is the only way on. */
  function openPlan(initial: 'whole' | 'from') {
    if (!listenerId || !current || current.tier !== 'premium') return;
    void planStore.open({ listenerId, bookId, audiobookId: current.id, voiceName: current.voice_name, initial });
  }
  function planFromChooser(p: { voice: { name: string }; scope: 'whole_book' | 'from_chapter'; audiobook: { id: string } }) {
    chooser = false;
    if (!listenerId) return;
    void planStore.open({ listenerId, bookId, audiobookId: p.audiobook.id, voiceName: p.voice.name, initial: p.scope === 'from_chapter' ? 'from' : 'whole' });
  }
  // Once a plan is approved the page shows the audiobook it is making.
  $effect(() => {
    const a = $planStore.flow.approved;
    if (!a || a.book_id !== bookId) return;
    untrack(() => {
      if (s.currentId !== a.audiobook_id) void chooseAudiobook(a.audiobook_id);
      else void bookStore.loadAudio();
      planStore.ackApproved();
    });
  });

  // Pressing play starts the sound from this tap; Now Playing opens once sound is playing. Until then this page
  // says what is happening: the first passage being made ([FirstPlay]) or what is needed ([NoVoice]).
  function play() {
    void startListening(bookId);
  }
  const mine = $derived($player.book?.id === bookId);
  const noVoice = $derived(mine && $player.needsYou?.code === 'no_voice');
  const gettingReady = $derived(mine && $player.listening === 'getting_ready');
  const otherNeed = $derived(mine && $player.needsYou && $player.needsYou.code !== 'no_voice' ? $player.needsYou : null);

  async function start() {
    if (!sheet) return;
    const mine = ++actionRun;
    const book = bookId;
    const listener = listenerId;
    busy = true;
    sheetError = undefined;
    const r = await bookStore.makeReady(sheet.chosen.scope);
    if (mine !== actionRun || book !== bookId || listener !== listenerId) return;
    busy = false;
    if (r.ok) makeOpen = false;
    else sheetError = r.detail;
  }

  async function act(run: () => Promise<{ ok: true } | { ok: false; detail: string }>, title: string) {
    const mine = ++actionRun;
    const book = bookId;
    const listener = listenerId;
    busy = true;
    problem = undefined;
    const r = await run();
    if (mine !== actionRun || book !== bookId || listener !== listenerId) return;
    busy = false;
    if (!r.ok) problem = { title, text: r.detail };
  }

  async function refreshChapterNames() {
    if (busy || updatingChapters || s.refreshingChapters) return;
    const book = bookId;
    const listener = listenerId;
    const before = JSON.stringify(s.chapters);
    const refreshRun = ++chapterRefreshRun;
    chapterRefreshNotice = undefined;
    updatingChapters = true;
    try {
      await act(async () => {
        const r = await bookStore.refreshChapters();
        if (!r.ok) return r;
        const refreshed = $bookStore;
        if (chapterRefreshRun !== refreshRun || bookId !== book || listenerId !== listener || refreshed.book?.id !== book) return { ok: true };
        player.updateChapterMetadata(book, refreshed.chapters);
        try {
          await offline.updateChapterMetadata(book, refreshed.chapters);
        } catch {
          return { ok: false, detail: 'Chapter details were updated on your Bardic computer. Downloaded text and audio are kept, but the updated details could not be saved on this device. Try updating again.' };
        }
        if (chapterRefreshRun === refreshRun && bookId === book && listenerId === listener) chapterRefreshNotice = before === JSON.stringify(refreshed.chapters) ? 'Chapter details are up to date.' : 'Chapter details updated.';
        return { ok: true };
      }, 'Couldn’t update chapter details');
    } finally {
      if (chapterRefreshRun === refreshRun && bookId === book && listenerId === listener) updatingChapters = false;
    }
  }

  function closeChooser() {
    chooser = false;
    void bookStore.loadAudio();
  }

  async function chooseAudiobook(id: string, opts: { makeAudio?: boolean } = {}): Promise<{ ok: true } | { ok: false; detail: string }> {
    await bookStore.loadAudio(); // also finds an audiobook the chooser just created
    if ($player.book?.id === bookId && $player.loaded) {
      if (!(await player.switchAudiobook(id, opts))) return { ok: false, detail: 'Your place and audio are kept. Resolve the place conflict, or try choosing the voice again.' };
      // The player writes its precise current offset and revision; the book page must not write its older snapshot.
      const result = await bookStore.choose(id, { writePlace: false });
      await bookStore.load(false);
      return result;
    }
    return bookStore.choose(id);
  }

  async function startChosen(ab: Audiobook) {
    player.preparePlayback();
    chooser = false;
    await act(async () => {
      const result = await chooseAudiobook(ab.id);
      if (result.ok) await startListening(bookId);
      return result;
    }, 'Couldn’t start listening');
  }

  async function makeChosen(ab: Audiobook) {
    chooser = false;
    await act(async () => {
      const result = await chooseAudiobook(ab.id, { makeAudio: false });
      if (result.ok) {
        selected = 'whole';
        includeMatter = false;
        sheetError = undefined;
        makeOpen = true;
      }
      return result;
    }, 'Couldn’t choose this audiobook');
  }
</script>

<Shell active="library" {onswitchlistener} {palette}>
  {#snippet player()}<MiniPlayerHost />{/snippet}
  {#if page}
    <BookView
      layout={$isTablet ? 'tablet' : 'phone'}
      playback={playbackPanel}
      header={page.header}
      primaryLabel={page.primaryLabel}
      audiobook={page.audiobook}
      others={page.others}
      chapters={page.chapters}
      {busy}
      {problem}
      premiumNote={premium ? 'Premium voices are made from a plan you approve first. Nothing is spent until you do.' : undefined}
      plan={planBlock}
      planActive={planGoing}
      onplan={() => openPlan('whole')}
      onplanfrom={planFrom ? () => openPlan('from') : undefined}
      planFromLabel={planFrom}
      onback={() => (location.hash = '#/library')}
      onmore={() => (menuOpen = true)}
      onplay={play}
      onchangevoice={() => (chooser = true)}
      ondownload={current && !planGoing ? () => (downloadOpen = true) : undefined}
      {downloads}
      onmakeready={() => {
        selected = 'whole';
        includeMatter = false;
        sheetError = undefined;
        makeOpen = true;
      }}
      onpause={() => act(() => bookStore.pause(), 'Couldn’t pause')}
      onresume={() => act(() => bookStore.resume(), 'Couldn’t resume')}
      onstop={() => act(() => bookStore.stop(), 'Couldn’t stop')}
      onchoose={(id) => act(() => chooseAudiobook(id), 'Couldn’t switch audiobook')}
      onshowall={() => (expanded = true)}
      onfilter={(v) => (storyOnly = v)}
      onrefreshchapters={s.book?.source_sha256 ? refreshChapterNames : undefined}
      refreshingChapters={updatingChapters || s.refreshingChapters}
      {chapterRefreshNotice}
      ondismissproblem={() => (problem = undefined)}
    />
  {:else if s.status === 'error'}
    <div class="note">
      <Callout tone="error" title="Couldn’t open this book">
        {s.error ?? 'Your Bardic computer could not be reached.'}
        {#snippet actions()}<Button variant="glass" onclick={() => bookStore.load()}>Try again</Button>{/snippet}
      </Callout>
    </div>
  {:else if s.status === 'missing' && beingDeleted}
    <div class="note">
      <Callout tone="warn" title="This book is being deleted">
        It is hidden and will be deleted for good when the countdown ends. Undo is below, until then.
        {#snippet actions()}<Button variant="glass" onclick={() => (location.hash = '#/library')}>Back to library</Button>{/snippet}
      </Callout>
    </div>
  {:else if s.status === 'missing'}
    <div class="note">
      <Callout tone="warn" title="This book is not here">
        It may have been removed. Your places are kept.
        {#snippet actions()}<Button variant="glass" onclick={() => (location.hash = '#/library')}>Back to library</Button>{/snippet}
      </Callout>
    </div>
  {:else}
    <p class="note" role="status">Opening the book…</p>
  {/if}

  {#snippet overlay()}
    {#if menuOpen && s.book && listenerId}
      <BookMenuHost {listenerId} book={s.book} place={s.place} audiobooks={s.audiobooks} chapters={s.chapters} onclose={() => (menuOpen = false)} onchanged={() => void bookStore.load(false)} />
    {/if}
    {#if sheet}
      <MakeReadySheet
        model={{ ...sheet.model, busy, error: sheetError }}
        placement={$isTablet ? 'popover' : 'bottom'}
        onselect={(id) => (selected = id)}
        includeMatter={hasMatter ? includeMatter : undefined}
        onmatter={(include) => { includeMatter = include; sheetError = undefined; }}
        onstart={start}
        onclose={() => (makeOpen = false)}
      />
    {/if}
    {#if downloadOpen && current}
      <DownloadSheetHost
        audiobookId={current.id}
        voiceName={current.voice_name}
        chapters={downloadChapters}
        onopendownloads={() => (location.hash = '#/settings/downloads')}
        onclose={() => (downloadOpen = false)}
      />
    {/if}
    {#if updateOpen && current}<UpdateAudioHost audiobookId={current.id} onclose={() => (updateOpen = false)} />{/if}
    {#if chooser}<VoiceChooserSheet {bookId} onclose={closeChooser} onstart={(ab) => void startChosen(ab)} onmakeready={(ab) => void makeChosen(ab)} onplan={planFromChooser} />{/if}
    <PlanFlow placement={$isTablet ? 'popover' : 'bottom'} />
  {/snippet}
</Shell>
<LibraryToast />

{#snippet planBlock()}
  {#if current && (planGoing || planEnded)}
    <RunningPlan
      audiobookId={current.id}
      voiceName={current.voice_name}
      chaptersReady={[...s.audio.values()].filter((a) => a.state === 'ready').length}
      {freeVoiceName}
      onfree={() => (chooser = true)}
    />
  {/if}
{/snippet}

{#snippet downloads()}
  {#if current}<BookDownloads audiobookId={current.id} onupdate={() => (updateOpen = true)} />{/if}
{/snippet}

{#snippet playbackPanel()}
  {#if noVoice}
    <NoVoiceView />
  {:else if gettingReady}
    <FirstPlayView voiceName={$player.voice?.name ?? 'your free voice'} onchoosevoice={() => (chooser = true)} />
  {:else if otherNeed}
    <Callout tone="error" title="Needs you">{otherNeed.text}</Callout>
  {/if}
{/snippet}

<style>
  .note { margin: 72px 20px 0; font-family: var(--font-ui); color: var(--muted); font-size: 14px; }
</style>

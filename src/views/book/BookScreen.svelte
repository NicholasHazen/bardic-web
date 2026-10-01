<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import { avatarHue } from '../../lib/listenerText';
  import { bookStore, currentAudiobook, deviceChapters, followBookEvents, makeSheet, pageModel } from '../../state/book';
  import { makeOptions } from '../../lib/bookAudio';
  import { currentListener, listenerStore } from '../../state/listener';
  import { isPlanNotice, planStore } from '../../state/plans';
  import { voices } from '../../state/voices';
  import { derivePalette } from '../../theme/derive';
  import { player } from '../../player/player';
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
  let selected = $state('whole');
  let busy = $state(false);
  let sheetError = $state<string | undefined>();
  let problem = $state<{ title: string; text: string } | undefined>();
  let downloadOpen = $state(false);
  let updateOpen = $state(false);

  // A different book starts with the short list and nothing open.
  $effect(() => {
    void bookId;
    expanded = false;
    storyOnly = false;
    chooser = false;
    makeOpen = false;
    problem = undefined;
    downloadOpen = false;
    updateOpen = false;
  });

  const page = $derived(pageModel(s, { expanded, storyOnly }, $deviceChapters));
  const palette = $derived(derivePalette(s.book?.cover?.sample));
  const sheet = $derived(makeOpen ? makeSheet(s, selected) : undefined);
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
      if (s.currentId !== a.audiobook_id) void bookStore.choose(a.audiobook_id);
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
    busy = true;
    sheetError = undefined;
    const r = await bookStore.makeReady(sheet.chosen.scope);
    busy = false;
    if (r.ok) makeOpen = false;
    else sheetError = r.detail;
  }

  async function act(run: () => Promise<{ ok: true } | { ok: false; detail: string }>, title: string) {
    busy = true;
    problem = undefined;
    const r = await run();
    busy = false;
    if (!r.ok) problem = { title, text: r.detail };
  }

  function closeChooser() {
    chooser = false;
    void bookStore.loadAudio();
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
      onmore={() => (location.hash = '#/library/manage')}
      onplay={play}
      onchangevoice={() => (chooser = true)}
      ondownload={current && !planGoing ? () => (downloadOpen = true) : undefined}
      {downloads}
      onmakeready={() => {
        selected = 'whole';
        sheetError = undefined;
        makeOpen = true;
      }}
      onpause={() => act(() => bookStore.pause(), 'Couldn’t pause')}
      onresume={() => act(() => bookStore.resume(), 'Couldn’t resume')}
      onstop={() => act(() => bookStore.stop(), 'Couldn’t stop')}
      onchoose={(id) => act(() => bookStore.choose(id), 'Couldn’t switch audiobook')}
      onshowall={() => (expanded = true)}
      onfilter={(v) => (storyOnly = v)}
      ondismissproblem={() => (problem = undefined)}
    />
  {:else if s.status === 'error'}
    <div class="note">
      <Callout tone="error" title="Couldn’t open this book">
        {s.error ?? 'Your Bardic computer could not be reached.'}
        {#snippet actions()}<Button variant="glass" onclick={() => bookStore.load()}>Try again</Button>{/snippet}
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
    {#if sheet}
      <MakeReadySheet
        model={{ ...sheet.model, busy, error: sheetError }}
        placement={$isTablet ? 'popover' : 'bottom'}
        onselect={(id) => (selected = id)}
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
    {#if chooser}<VoiceChooserSheet {bookId} onclose={closeChooser} onplan={planFromChooser} />{/if}
    <PlanFlow placement={$isTablet ? 'popover' : 'bottom'} />
  {/snippet}
</Shell>

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

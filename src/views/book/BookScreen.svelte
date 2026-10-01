<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import { avatarHue } from '../../lib/listenerText';
  import { bookStore, currentAudiobook, deviceChapters, followBookEvents, makeSheet, pageModel } from '../../state/book';
  import { currentListener, listenerStore } from '../../state/listener';
  import { derivePalette } from '../../theme/derive';
  import Shell from '../shell/Shell.svelte';
  import { isTablet } from '../shell/viewport';
  import VoiceChooserSheet from '../voices/VoiceChooserSheet.svelte';
  import BookView from './BookView.svelte';
  import MakeReadySheet from './MakeReadySheet.svelte';

  /**
   * The book page, connected to the server (B1 to B6, V3): the book, its audiobooks and the audio state of every
   * chapter, kept current from the event stream. Draws its own app frame (Library tab) because the page takes its
   * colours from the book's cover. Making ready starts here only for a free voice; premium goes through plans (W4).
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
    return followBookEvents(bookStore, l, bookId);
  });

  let expanded = $state(false);
  let storyOnly = $state(false);
  let chooser = $state(false);
  let makeOpen = $state(false);
  let selected = $state('whole');
  let busy = $state(false);
  let sheetError = $state<string | undefined>();
  let problem = $state<{ title: string; text: string } | undefined>();

  // A different book starts with the short list and nothing open.
  $effect(() => {
    void bookId;
    expanded = false;
    storyOnly = false;
    chooser = false;
    makeOpen = false;
    problem = undefined;
  });

  const page = $derived(pageModel(s, { expanded, storyOnly }, $deviceChapters));
  const palette = $derived(derivePalette(s.book?.cover?.sample));
  const sheet = $derived(makeOpen ? makeSheet(s, selected) : undefined);
  const premium = $derived(currentAudiobook(s)?.tier === 'premium');

  function play() {
    location.hash = `#/listen/${bookId}`;
  }

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
  {#if page}
    <BookView
      layout={$isTablet ? 'tablet' : 'phone'}
      header={page.header}
      primaryLabel={page.primaryLabel}
      audiobook={page.audiobook}
      others={page.others}
      chapters={page.chapters}
      {busy}
      {problem}
      premiumNote={premium ? 'Premium voices are made from a plan you approve first. Plans arrive in a later update; nothing is spent.' : undefined}
      onback={() => (location.hash = '#/library')}
      onmore={() => (location.hash = '#/library/manage')}
      onplay={play}
      onchangevoice={() => (chooser = true)}
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
    {#if chooser}<VoiceChooserSheet {bookId} onclose={closeChooser} />{/if}
  {/snippet}
</Shell>

<style>
  .note { margin: 72px 20px 0; font-family: var(--font-ui); color: var(--muted); font-size: 14px; }
</style>

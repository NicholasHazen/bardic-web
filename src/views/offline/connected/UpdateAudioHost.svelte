<script lang="ts">
  import { api } from '../../../api/client';
  import { offline } from '../../../offline/offline';
  import { isTablet } from '../../shell/viewport';
  import UpdateAudioSheet from '../UpdateAudioSheet.svelte';

  /**
   * The newer-audio sheet for one audiobook, connected (O6): Update replaces the chosen chapters, Keep what I have keeps the
   * copies held and stops offering them. Hearing the old copy plays the held one (`offline.heldChapter`); hearing the new
   * one plays the server's. One <audio> element serves both and stops when the sheet closes.
   */
  interface Props {
    audiobookId: string;
    onclose?: () => void;
    /** The sheet sits in the page (fixed), or in the app frame's overlay. */
    fixed?: boolean;
  }
  let { audiobookId, onclose, fixed = false }: Props = $props();

  const offers = $derived($offline.updates.filter((u) => u.audiobookId === audiobookId));
  const book = $derived($offline.books.find((b) => b.audiobookId === audiobookId));
  const numbers = $derived(Object.fromEntries((book?.chapters ?? []).map((c) => [c.chapterId, c.index + 1])));

  let busy = $state(false);
  let error = $state<string | undefined>();
  let playing = $state<{ chapterId: string; which: 'old' | 'new' } | null>(null);
  let audio: HTMLAudioElement | undefined = $state();

  // Nothing left to decide: the sheet closes by itself.
  let hadOffers = false;
  $effect(() => {
    if (offers.length > 0) hadOffers = true;
    else if (hadOffers && !busy) onclose?.();
  });

  function stop() {
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    playing = null;
  }
  $effect(() => () => stop());

  async function play(chapterId: string, which: 'old' | 'new') {
    if (!audio) return;
    stop();
    error = undefined;
    let url: string | null = null;
    if (which === 'old') {
      url = (await offline.heldChapter(audiobookId, chapterId))?.audioUrl ?? null;
    } else {
      const r = await api.GET('/api/audiobooks/{audiobook_id}/chapters', { params: { path: { audiobook_id: audiobookId } } }).catch(() => null);
      const id = r?.data?.items.find((c) => c.chapter_id === chapterId)?.audio?.id;
      url = id ? `/api/audio/${encodeURIComponent(id)}` : null;
    }
    if (!url) {
      error = which === 'old' ? 'Your downloaded copy is kept. It could not be opened to play here.' : 'Your downloaded copy is kept. The newer audio could not be reached to play.';
      return;
    }
    audio.src = url;
    playing = { chapterId, which };
    try {
      await audio.play();
    } catch {
      playing = null;
      error = 'Your downloaded copy is kept. The browser did not start the sound; press Hear again.';
    }
  }

  async function update(id: string, chapterIds: string[]) {
    stop();
    busy = true;
    error = undefined;
    try {
      await offline.applyUpdate(id, chapterIds);
    } catch {
      error = 'Your downloaded copies are kept. The update did not finish; try again.';
    }
    busy = false;
    if (!error && $offline.notice) error = $offline.notice;
  }
  function keep(id: string, chapterIds: string[]) {
    stop();
    offline.keepOld(id, chapterIds);
  }
</script>

<audio bind:this={audio} onended={() => (playing = null)} onerror={() => (playing = null)} preload="none"></audio>
{#if offers.length}
  <UpdateAudioSheet
    {offers}
    {numbers}
    {playing}
    {busy}
    {error}
    {fixed}
    placement={$isTablet ? 'popover' : 'bottom'}
    onplayold={(c) => void play(c, 'old')}
    onplaynew={(c) => void play(c, 'new')}
    onstopplaying={stop}
    onupdate={(id, ids) => void update(id, ids)}
    onkeep={keep}
    onclose={() => {
      stop();
      onclose?.();
    }}
  />
{/if}

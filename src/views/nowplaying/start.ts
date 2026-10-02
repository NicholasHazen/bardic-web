import { get } from 'svelte/store';
import { player } from '../../player/player';
import { api } from '../../api/client';
import { listenerStore } from '../../state/listener';
import { chooseVoiceForBook } from '../../state/voices';
import { planStore } from '../../state/plans';

let cancelPending: (() => void) | null = null;

/**
 * Start listening to a book. Called straight from the listener's tap so the browser lets sound start.
 * Stays where it is while the first audio is made (the book page shows "Getting ready" or what is needed),
 * and opens Now Playing as soon as sound is playing.
 */
export async function startListening(bookId: string): Promise<void> {
  cancelPending?.();
  player.preparePlayback();
  let here = location.hash;
  const listenerId = get(listenerStore).currentId;
  if (!listenerId) return;
  let cancelled = false;
  let opening = false;
  let stopPlayer = () => {};
  let stopListener = () => {};
  const active = () => !cancelled && get(listenerStore).currentId === listenerId && location.hash === here;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    stopPlayer();
    stopListener();
    window.removeEventListener('hashchange', changedRoute);
    if (cancelPending === cancel) cancelPending = null;
    // An opening player has its own async work: invalidate it too, before a late response can autoplay.
    const current = get(player);
    if (opening && (!current.loaded || current.book?.id === bookId)) player.close();
  };
  const finish = () => { opening = false; cancel(); };
  const changedRoute = (event: HashChangeEvent) => {
    // A quick leave-and-return still cancels this tap, even if both hash changes are queued together.
    const route = event.newURL ? new URL(event.newURL).hash : location.hash;
    if (route !== here) cancel();
  };
  cancelPending = cancel;
  stopListener = listenerStore.subscribe((state) => { if (state.currentId !== listenerId) cancel(); });
  window.addEventListener('hashchange', changedRoute);
  const navigate = (route: string) => { here = route; location.hash = route; };
  // The default is a voice, not an audiobook already made for every book. Create only the free record here;
  // premium generation still starts exclusively from the plan sheet's approval.
  if (get(player).book?.id !== bookId || !get(player).audiobookId) {
    try {
      const [books, settings] = await Promise.all([
        api.GET('/api/books/{book_id}/audiobooks', { params: { path: { book_id: bookId } } }),
        api.GET('/api/listeners/{listener_id}/settings', { params: { path: { listener_id: listenerId } } }),
      ]);
      if (!active()) return finish();
      const defaultVoiceId = settings.data?.default_voice_id;
      if (books.data?.items.length === 0 && defaultVoiceId) {
        const catalog = await api.GET('/api/voices');
        if (!active()) return finish();
        const voice = catalog.data?.items.find((v) => v.id === defaultVoiceId);
        if (voice) {
          const created = await chooseVoiceForBook(bookId, voice.id, listenerId);
          if (!active()) return finish();
          if (created.ok) {
            if (voice.tier === 'premium') {
              navigate(`#/book/${bookId}`);
              await planStore.open({ listenerId, bookId, audiobookId: created.value.id, voiceName: voice.name, initial: 'whole' });
              return finish();
            }
            if (get(player).book?.id === bookId) await player.switchAudiobook(created.value.id);
            if (!active()) return finish();
          }
        }
      }
    } catch {
      // An unreachable server still opens a downloaded book through the player's local ports.
    }
  }
  if (!active()) return finish();
  opening = true;
  try { await player.open(bookId, { autoplay: true }); }
  catch { return cancel(); }
  if (!active()) return cancel();
  const s = get(player);
  if (s.book?.id === bookId && s.playing && s.listening === 'playing') {
    navigate(`#/listen/${bookId}`);
    return finish();
  }
  const observe = player.subscribe((st) => {
    if (!active()) return cancel();
    if (st.book?.id === bookId && st.playing && st.listening === 'playing') {
      navigate(`#/listen/${bookId}`);
      finish();
    }
  });
  stopPlayer = observe;
  if (cancelled) stopPlayer();
}

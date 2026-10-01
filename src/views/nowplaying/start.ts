import { get } from 'svelte/store';
import { player } from '../../player/player';

/**
 * Start listening to a book. Called straight from the listener's tap so the browser lets sound start.
 * Stays where it is while the first audio is made (the book page shows "Getting ready" or what is needed),
 * and opens Now Playing as soon as sound is playing.
 */
export async function startListening(bookId: string): Promise<void> {
  const here = location.hash;
  await player.open(bookId, { autoplay: true });
  const s = get(player);
  if (s.book?.id === bookId && s.playing && s.listening === 'playing') {
    location.hash = `#/listen/${bookId}`;
    return;
  }
  const stop = player.subscribe((st) => {
    if (location.hash !== here) return stop();
    if (st.book?.id === bookId && st.playing && st.listening === 'playing') {
      stop();
      location.hash = `#/listen/${bookId}`;
    }
  });
  // do not wait forever on a screen the listener has left
  window.addEventListener('hashchange', stop, { once: true });
}

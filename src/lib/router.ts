import { readable } from 'svelte/store';

/** The current hash route without the leading `#`, e.g. `/board/Home`. */
export const route = readable(current(), (set) => {
  const on = () => set(current());
  window.addEventListener('hashchange', on);
  return () => window.removeEventListener('hashchange', on);
});

function current(): string {
  return location.hash.replace(/^#/, '') || '/';
}

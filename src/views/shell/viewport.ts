import { readable } from 'svelte/store';

/** Tablet layout (rail on the left) from this width up. */
export const TABLET_MIN_WIDTH = 768;

/** True when the viewport is tablet width; follows resizes. */
export const isTablet = readable(false, (set) => {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const mq = window.matchMedia(`(min-width: ${TABLET_MIN_WIDTH}px)`);
  const on = () => set(mq.matches);
  on();
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
});

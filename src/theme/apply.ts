import type { Palette } from './derive';

/** Set a book's colours on a container; everything inside reads the custom properties. */
export function applyPalette(el: HTMLElement, p: Palette): void {
  el.style.setProperty('--base', p.base);
  el.style.setProperty('--glow', p.glow);
  el.style.setProperty('--glow2', p.glow2);
  el.style.setProperty('--accent', p.accent);
}

// Test hook for the end-to-end tests: with `?e2e=player` in the URL the page exposes the player as
// `window.__player` and the element that is playing as `window.__audio`. Without that query it does nothing.
// The lead calls `installE2E()` once from src/main.ts; it costs one string check in production.
import { player } from '../player';

declare global {
  interface Window {
    __player?: typeof player;
    __audio?: HTMLAudioElement;
  }
}

export function installE2E(): void {
  if (typeof window === 'undefined') return;
  const hook = new URLSearchParams(window.location.search).get('e2e');
  if (hook !== 'player' && hook !== 'offline') return; // 'offline' pages need the player too

  window.__player = player;
  // remember the element that plays real audio (not the silent unlock clip)
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    if (this instanceof HTMLAudioElement && !this.src.startsWith('data:')) window.__audio = this;
    return play.call(this);
  };
}

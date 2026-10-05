// The audio engine: ONE audio element for the whole page (so the browser's permission to play, given by a
// tap, stays with it from chapter to chapter), the Media Session for lock screen and headset controls, and
// the line being spoken. It knows nothing about books, places or the server: it plays a URL and says what
// happened. docs/ARCHITECTURE.md section 6.
import type { Clock } from '../lib/clock';
import { lineAtTime } from '../lib/timings';
import type { LineTiming } from './types';

/** The part of HTMLAudioElement the engine uses (a fake in tests). */
export interface AudioLike {
  src: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  readonly readyState: number;
  playbackRate: number;
  preservesPitch: boolean;
  volume: number;
  preload: string;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

export const browserAudioFactory = (): AudioLike => {
  const el = new Audio();
  el.preload = 'auto';
  return el;
};

export interface SessionMetadata {
  title: string;
  /** the author */
  artist: string;
  /** the book */
  album: string;
  artwork: { src: string; sizes?: string; type?: string }[];
}

export interface SessionActions {
  play(): void;
  pause(): void;
  /** negative to go back */
  seekBy(seconds: number): void;
  seekTo(seconds: number): void;
  previous(): void;
  next(): void;
}

/** The Media Session API as the engine needs it (a fake in tests). */
export interface MediaSessionPort {
  setMetadata(m: SessionMetadata | null): void;
  setPlaybackState(s: 'playing' | 'paused' | 'none'): void;
  setActionHandler(action: string, handler: ((d: { seekOffset?: number; seekTime?: number }) => void) | null): void;
  setPositionState(s: { duration: number; position: number; playbackRate: number } | null): void;
}

/** navigator.mediaSession, or null where the browser has none. */
export function browserMediaSession(): MediaSessionPort | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null;
  const ms = navigator.mediaSession;
  return {
    setMetadata(m) {
      try {
        ms.metadata = m && typeof MediaMetadata !== 'undefined' ? new MediaMetadata(m) : null;
      } catch {
        /* artwork the browser refuses: the title still shows */
      }
    },
    setPlaybackState: (s) => void (ms.playbackState = s),
    setActionHandler(action, handler) {
      try {
        ms.setActionHandler(action as MediaSessionAction, handler as MediaSessionActionHandler | null);
      } catch {
        /* an action this browser does not know */
      }
    },
    setPositionState(s) {
      try {
        ms.setPositionState(s ?? undefined);
      } catch {
        /* invalid numbers while loading */
      }
    },
  };
}

export interface EngineHandlers {
  /** seconds; fires with every time update, seek and duration change */
  time(position: number, duration: number): void;
  /** the line spoken at the position changed (null when there are no timings) */
  line(lineId: string | null): void;
  /** the audio reached its end */
  ended(): void;
  /** the element started or stopped playing (the live `paused` state) */
  playState(playing: boolean): void;
  /** waiting for data (true) or data is flowing again (false) */
  buffering(waiting: boolean): void;
  /** the browser could not play this audio */
  error(): void;
}

export type PlayResult = 'playing' | 'blocked' | 'interrupted' | 'error' | 'nothing';

export const SKIP_SECONDS = 15;
/** a silent 0.1 s WAV; played inside a tap to earn the element permission before the real audio exists */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

const MEDIA_EVENTS = ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked', 'ended', 'waiting', 'stalled', 'playing', 'canplay', 'pause', 'play', 'error'] as const;

export class AudioEngine {
  private el: AudioLike | null = null;
  private pre: AudioLike | null = null;
  private preUrl: string | null = null;
  private metadataLoaded = false;
  private pendingSeek: number | null = null;
  private timings: readonly LineTiming[] = [];
  private lineId: string | null = null;
  private url = '';
  private rate = 1;
  private fadeTimer: number | undefined;
  private unlocked = false;
  private destroyed = false;
  private readonly listeners = new Map<string, () => void>();

  constructor(
    private readonly o: {
      factory: () => AudioLike;
      clock: Clock;
      handlers: EngineHandlers;
      session?: MediaSessionPort | null;
    },
  ) {}

  // ----------------------------------------------------------------------------- element

  private element(): AudioLike {
    if (this.el) return this.el;
    const el = this.o.factory();
    this.el = el;
    el.preservesPitch = true;
    el.playbackRate = this.rate;
    for (const type of MEDIA_EVENTS) {
      const fn = () => this.onMedia(type);
      this.listeners.set(type, fn);
      el.addEventListener(type, fn);
    }
    return el;
  }

  private onMedia(type: (typeof MEDIA_EVENTS)[number]): void {
    const el = this.el;
    if (!el || this.destroyed || !this.url) return;
    const h = this.o.handlers;
    switch (type) {
      case 'loadedmetadata':
        this.metadataLoaded = true;
        if (this.pendingSeek !== null) {
          el.currentTime = this.pendingSeek;
          this.pendingSeek = null;
        }
        this.emitTime();
        break;
      case 'durationchange':
      case 'timeupdate':
      case 'seeked':
        this.emitTime();
        break;
      case 'ended':
        this.emitTime();
        h.ended();
        break;
      case 'waiting':
      case 'stalled':
        if (!el.paused) h.buffering(true);
        break;
      case 'playing':
      case 'canplay':
        h.buffering(false);
        if (type === 'playing') h.playState(true);
        break;
      case 'play':
        h.playState(true);
        break;
      case 'pause':
        h.playState(false);
        break;
      case 'error':
        h.error();
        break;
    }
  }

  // ----------------------------------------------------------------------------- state

  get position(): number {
    if (this.pendingSeek !== null) return this.pendingSeek;
    return this.el?.currentTime ?? 0;
  }

  get duration(): number {
    const d = this.el?.duration ?? 0;
    return Number.isFinite(d) ? d : 0;
  }

  get playing(): boolean {
    return !!this.el && !!this.url && !this.el.paused;
  }

  get hasEnded(): boolean {
    return !!this.el?.ended;
  }

  get loaded(): boolean {
    return !!this.url;
  }

  // ----------------------------------------------------------------------------- loading

  /** Load a chapter's audio. Pauses what was playing; `startAt` (seconds) is applied as soon as the length is known. */
  load(url: string, o: { startAt?: number; rate?: number; timings?: readonly LineTiming[] } = {}): void {
    const el = this.element();
    this.cancelFade();
    el.pause();
    this.url = url;
    this.metadataLoaded = false;
    this.pendingSeek = Math.max(0, o.startAt ?? 0);
    if (o.rate) this.rate = o.rate;
    this.timings = o.timings ?? [];
    this.lineId = null;
    el.preload = 'auto';
    el.src = url;
    el.playbackRate = this.rate;
    el.preservesPitch = true;
    el.load();
    if (el.readyState >= 1) {
      // the browser already has the length (cached audio)
      this.metadataLoaded = true;
      if (this.pendingSeek !== null) el.currentTime = this.pendingSeek;
      this.pendingSeek = null;
    }
    this.emitTime();
  }

  /** Forget the loaded audio (the element stays, and keeps its permission to play). */
  unload(): void {
    const el = this.el;
    this.cancelFade();
    this.url = '';
    this.pendingSeek = null;
    this.metadataLoaded = false;
    this.timings = [];
    this.lineId = null;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    this.o.session?.setPlaybackState('none');
    this.o.session?.setPositionState(null);
  }

  setTimings(timings: readonly LineTiming[]): void {
    this.timings = timings;
    this.lineId = null;
    this.emitTime();
  }

  // ----------------------------------------------------------------------------- transport

  /**
   * Call this inside a tap when audio will start later (the chapter still has to be made): it plays a moment
   * of silence so the element is allowed to play the real audio when it arrives (iOS wants this).
   */
  unlock(): void {
    if (this.unlocked || this.url) return;
    this.unlocked = true;
    const el = this.element();
    el.src = SILENCE;
    void el.play().catch(() => {
      this.unlocked = false;
    });
  }

  /** Start playing. A refusal by the browser's autoplay rules is a result ('blocked'), never an error. */
  async play(): Promise<PlayResult> {
    const el = this.el;
    if (!el || !this.url) return 'nothing';
    this.cancelFade();
    el.volume = 1;
    this.unlocked = true;
    try {
      await el.play();
      this.o.session?.setPlaybackState('playing');
      return 'playing';
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      if (name === 'NotAllowedError') return 'blocked';
      if (name === 'AbortError') return 'interrupted';
      return 'error';
    }
  }

  pause(): void {
    this.cancelFade();
    const el = this.el;
    if (el) {
      el.pause();
      el.volume = 1;
    }
    this.o.session?.setPlaybackState('paused');
  }

  /** Fade out over `ms`, then pause. A play() or pause() meanwhile cancels the fade. Resolves true if it paused. */
  fadeOutAndPause(ms = 1500): Promise<boolean> {
    const el = this.el;
    if (!el || el.paused) return Promise.resolve(false);
    this.cancelFade();
    const steps = 10;
    return new Promise((resolve) => {
      let n = 0;
      const step = () => {
        n++;
        el.volume = Math.max(0, 1 - n / steps);
        if (n >= steps) {
          this.fadeTimer = undefined;
          this.pause();
          resolve(true);
        } else this.fadeTimer = this.o.clock.setTimeout(step, ms / steps);
      };
      this.fadeResolve = resolve;
      this.fadeTimer = this.o.clock.setTimeout(step, ms / steps);
    });
  }
  private fadeResolve: ((paused: boolean) => void) | null = null;

  private cancelFade(): void {
    if (this.fadeTimer !== undefined) {
      this.o.clock.clearTimeout(this.fadeTimer);
      this.fadeTimer = undefined;
      if (this.el) this.el.volume = 1;
      this.fadeResolve?.(false);
    }
    this.fadeResolve = null;
  }

  seek(seconds: number): void {
    const el = this.el;
    if (!el || !this.url) return;
    const max = this.duration > 0 ? this.duration : Infinity;
    const t = Math.min(Math.max(0, seconds), max);
    if (this.metadataLoaded) el.currentTime = t;
    else this.pendingSeek = t;
    this.emitTime();
  }

  setRate(rate: number): void {
    this.rate = rate;
    if (this.el) {
      this.el.playbackRate = rate;
      this.el.preservesPitch = true;
    }
  }

  // ----------------------------------------------------------------------------- the next chapter

  /**
   * Warm the browser's cache with the next chapter's audio (a second, silent element: the main one keeps
   * playing). 'metadata' only fetches the start; 'auto' fetches it all. The audio is immutable and
   * cacheable, so the hand-over then starts without a gap.
   */
  preload(url: string | null, mode: 'metadata' | 'auto' = 'auto'): void {
    if (url === null) {
      this.dropPreload();
      return;
    }
    if (this.preUrl === url) {
      if (mode === 'auto' && this.pre) this.pre.preload = 'auto';
      return;
    }
    this.dropPreload();
    const pre = this.o.factory();
    pre.preload = mode;
    pre.src = url;
    this.pre = pre;
    this.preUrl = url;
  }

  get preloaded(): string | null {
    return this.preUrl;
  }

  private dropPreload(): void {
    if (this.pre) {
      this.pre.removeAttribute('src');
      this.pre.load();
    }
    this.pre = null;
    this.preUrl = null;
  }

  // ----------------------------------------------------------------------------- the line and the lock screen

  private emitTime(): void {
    const pos = this.position;
    const dur = this.duration;
    this.o.handlers.time(pos, dur);
    const id = this.timings.length ? lineAtTime(this.timings, pos * 1000) : null;
    if (id !== this.lineId) {
      this.lineId = id;
      this.o.handlers.line(id);
    }
    const s = this.o.session;
    if (s && dur > 0) s.setPositionState({ duration: dur, position: Math.min(pos, dur), playbackRate: this.rate || 1 });
  }

  setMetadata(meta: SessionMetadata | null): void {
    this.o.session?.setMetadata(meta);
  }

  setActions(a: SessionActions | null): void {
    const s = this.o.session;
    if (!s) return;
    const set = (name: string, fn: ((d: { seekOffset?: number; seekTime?: number }) => void) | null) => s.setActionHandler(name, fn);
    if (!a) {
      for (const n of ['play', 'pause', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack']) set(n, null);
      return;
    }
    set('play', () => a.play());
    set('pause', () => a.pause());
    set('seekbackward', (d) => a.seekBy(-(d.seekOffset ?? SKIP_SECONDS)));
    set('seekforward', (d) => a.seekBy(d.seekOffset ?? SKIP_SECONDS));
    set('seekto', (d) => {
      if (typeof d.seekTime === 'number') a.seekTo(d.seekTime);
    });
    set('previoustrack', () => a.previous());
    set('nexttrack', () => a.next());
  }

  /** Release the element and the lock screen. */
  destroy(): void {
    this.destroyed = true;
    this.cancelFade();
    this.setActions(null);
    this.setMetadata(null);
    this.dropPreload();
    const el = this.el;
    if (el) {
      for (const [type, fn] of this.listeners) el.removeEventListener(type, fn);
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    this.listeners.clear();
    this.el = null;
    this.url = '';
  }
}

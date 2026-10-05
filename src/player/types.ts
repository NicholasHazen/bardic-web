// The contract between the player engine (src/player/**) and the Now Playing screens
// (src/views/player/**). The engine produces a PlayerState and accepts PlayerCommands; the screens
// are presentational components of (a slice of) PlayerState plus callbacks, so the design boards can
// render them from fixtures. Nothing here talks to the network or the DOM.

/** The four words the listener ever sees for what is happening (docs/UI-GUIDE.md). */
export type ListeningState = 'playing' | 'getting_ready' | 'waiting' | 'needs_you';

export type Mode = 'listen' | 'read';

/** One line of a chapter as the server stores it: a code point range of the chapter text. */
export interface TextLine {
  id: string;
  /** zero-based Unicode code point offsets, end exclusive */
  start: number;
  end: number;
}

/** When a line is spoken in the chapter's audio. Exact for Breeze, spread by length for Gemini. */
export interface LineTiming {
  lineId: string;
  startMs: number;
  endMs: number;
}

export interface BookInfo {
  id: string;
  title: string;
  author: string;
  coverSrc?: string;
  /** flat colour of the cover (sample hex) used when there is no real image */
  coverColor: string;
}

export interface ChapterInfo {
  id: string;
  /** zero-based position among all chapters */
  index: number;
  /** all chapters, front and back matter included */
  total: number;
  /** "Chapter 4 of 22" counts story chapters; null for matter */
  storyNumber: number | null;
  storyTotal: number;
  title: string;
  matter: boolean;
}

export interface VoiceInfo {
  id: string;
  name: string;
  tier: 'free' | 'premium';
}

export type SleepTimer =
  | { kind: 'off' }
  | { kind: 'minutes'; minutes: number; endsAt: number /* epoch ms */ }
  | { kind: 'end_of_chapter' };

/** Why the listener cannot just listen, in the words of the "Needs you" state. Always says what is kept first. */
export interface NeedsYou {
  code:
    | 'no_voice'
    | 'source_unreachable'
    | 'key_rejected'
    | 'limit_exceeded'
    | 'allowance_exceeded'
    | 'provider_refused'
    | 'repeated_failure'
    | 'voice_changed'
    | 'offline_not_downloaded'
    | 'premium_plan_required'
    | 'offline'
    | 'other';
  /** what is kept, then what is wrong, then (optionally) the one thing to do */
  text: string;
  /** a route or sheet the "Choose what to do" button opens */
  action?: { label: string; route: string };
}

export interface PlayerState {
  /** nothing loaded: no mini-player is shown */
  loaded: boolean;
  book: BookInfo | null;
  chapter: ChapterInfo | null;
  voice: VoiceInfo | null;
  audiobookId: string | null;

  /** the four listening states, or null when idle with nothing to say */
  listening: ListeningState | null;
  /** second line under the state word: "6 min ahead", "First audio in about 10 s", "Continues in about 40 s", ... */
  detail: string | null;
  needsYou: NeedsYou | null;

  playing: boolean;
  /** seconds into this chapter's audio */
  position: number;
  /** seconds, 0 until known */
  duration: number;
  /** seconds of made audio ahead of the position, across ready chapters (for "6 min ahead"); null if unknown */
  aheadSeconds: number | null;
  /** 0 to 1 of the whole book, by text offset, as the server's place progress */
  bookProgress: number;
  /** seconds left in the book if known (sum of ready durations), else null */
  remainingSeconds: number | null;

  speed: number;
  sleep: SleepTimer;
  mode: Mode;

  /** the chapter text and its lines, for Read mode; empty until loaded */
  text: string;
  lines: TextLine[];
  timings: LineTiming[];
  /** the line being spoken now (or the one the place is at when paused) */
  currentLineId: string | null;
  /** Unicode code point offset inside the current chapter; real snapshots retain it even before audio exists. */
  chapterOffset?: number;

  /** the chapter list for the chapters sheet */
  chapters: {
    id: string; title: string; index: number; storyNumber: number | null; matter: boolean;
    audio: 'ready' | 'on_device' | 'making' | 'not_yet';
    wordCount?: number; textLength?: number; pageCount?: number | null; durationSeconds?: number;
  }[];

  /** a place conflict waiting for the listener's choice (listener setting "ask"), else null */
  conflict: PlaceConflictInfo | null;
  /** the end of the book was reached */
  finishedBook: boolean;
  /** saving the place failed or is waiting for the network; the local copy is kept */
  placeSync: 'saved' | 'saving' | 'queued_offline';
  /**
   * Set with needsYou.code 'offline_not_downloaded' when the chapter asked for is not on this device and the Bardic computer
   * cannot be reached: the next chapter that is on this device. The screen offers it (gotoChapter(chapterId)).
   */
  offlineNext?: { chapterId: string; title: string } | null;
}

export interface PlaceSnapshot {
  chapterTitle: string;
  chapterIndex: number;
  /** 0 to 1 */
  progress: number;
  deviceName: string;
  /** epoch ms */
  updatedAt: number;
  mode: Mode;
}

export interface PlaceConflictInfo {
  /** what this device was about to write */
  mine: PlaceSnapshot;
  /** what the server has from another device */
  theirs: PlaceSnapshot;
}

/** Everything the screens can ask the engine to do. */
export interface PlayerCommands {
  /** Earn permission inside the listener's tap before asynchronous book/voice work. */
  preparePlayback(): void;
  /** load a book's current audiobook at the listener's place and start (or stay paused) */
  open(bookId: string, opts?: { autoplay?: boolean; chapterId?: string; offset?: number }): Promise<void>;
  /** Keep the current text place; existing sound continues until the chosen audiobook is ready there. */
  switchAudiobook(audiobookId: string, opts?: { makeAudio?: boolean }): Promise<boolean>;
  play(): void;
  pause(): void;
  toggle(): void;
  /** relative seek in seconds (back/forward 15) */
  skip(seconds: number): void;
  seek(seconds: number): void;
  nextChapter(): void;
  previousChapter(): void;
  gotoChapter(chapterId: string): void;
  /** jump to a line (tap in Read mode, search result) */
  gotoLine(lineId: string): void;
  gotoOffset(chapterId: string, offset: number): void;
  setSpeed(speed: number): void;
  setSleep(timer: SleepTimer): void;
  setMode(mode: Mode): void;
  /** the listener's answer to a place conflict */
  resolveConflict(choice: 'mine' | 'theirs'): void;
  /** stop and unload (closes the mini-player) */
  close(): void;
  /** the listener changed: pause and unload, keeping the place saved */
  listenerChanged(): void;
}

/** Reader appearance, kept per device. */
export interface ReaderAppearance {
  /** 19 to 23 px; the guide's reading sizes */
  size: number;
  theme: 'dark' | 'dim' | 'light' | 'sepia' | 'night';
  font: 'serif' | 'sans';
  /** line spacing multiple around 1.7 */
  spacing: number;
  /** dim the aura further in Read mode */
  dimAura: boolean;
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
/** any speed in this range is accepted (the list above is what the speed sheet offers) */
export const SPEED_MIN = 0.75;
export const SPEED_MAX = 2.5;

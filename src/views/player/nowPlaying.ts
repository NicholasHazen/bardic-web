// Pure rules for the Now Playing screens: how times, labels and the four listening states are worded.
// Nothing here touches the DOM, so it is unit tested (nowPlaying.test.ts).
import type { ChapterInfo, ListeningState, NeedsYou, PlayerState, SleepTimer } from '../../player/types';

/** The slice of the engine's state the screens read. */
export type NowPlayingState = Pick<
  PlayerState,
  | 'book'
  | 'chapter'
  | 'voice'
  | 'listening'
  | 'detail'
  | 'needsYou'
  | 'playing'
  | 'position'
  | 'duration'
  | 'bookProgress'
  | 'remainingSeconds'
  | 'speed'
  | 'sleep'
  | 'mode'
  | 'text'
  | 'lines'
  | 'currentLineId'
  | 'chapters'
>;

/** The slice the bar needs. */
export type BarState = Pick<
  PlayerState,
  'loaded' | 'book' | 'chapter' | 'listening' | 'detail' | 'playing' | 'bookProgress' | 'speed'
>;

export type Layout = 'phone' | 'tablet-landscape' | 'tablet-portrait';

/** m:ss, or h:mm:ss from an hour up. Missing or negative input reads 0:00. */
export function formatClock(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds ?? NaN) ? (seconds as number) : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

/**
 * Time left in the book as the boards write it: "~12:20" (hours and minutes from an hour up, else
 * minutes and seconds). The tilde is honest: the figure is a sum of known and estimated lengths.
 * Unknown stays unknown: null gives null, never "~0:00".
 */
export function formatBookRemaining(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return null;
  const s = Math.round(seconds);
  if (s >= 3600) {
    const mins = Math.round(s / 60);
    return `~${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  }
  return `~${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The same figure for a screen reader: "about 12 hours 20 minutes left in the book". */
export function spokenBookRemaining(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return null;
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m || !h) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  return `about ${parts.join(' ')} left in the book`;
}

/** 0 to 100, whole percent, clamped. */
export function percent(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.round(Math.min(1, Math.max(0, progress)) * 100);
}

/** "34% of book" */
export function percentOfBook(progress: number): string {
  return `${percent(progress)}% of book`;
}

/** The text on the right of the scrubber: "~12:20 · 34% of book", or just the percentage when the time is unknown. */
export function remainingLine(remainingSeconds: number | null, progress: number): string {
  const left = formatBookRemaining(remainingSeconds);
  return left ? `${left} · ${percentOfBook(progress)}` : percentOfBook(progress);
}

/** The capsule's label: "4:12 · 34%". */
export function capsuleLabel(position: number, progress: number): string {
  return `${formatClock(position)} · ${percent(progress)}%`;
}

/** Scrubber position 0 to 1 inside the chapter; 0 while the length is not known. */
export function scrubFraction(position: number, duration: number): number {
  if (!(duration > 0) || !Number.isFinite(position)) return 0;
  return Math.min(1, Math.max(0, position / duration));
}

/** Seconds to seek to for a scrubber fraction; null while the length is not known. */
export function secondsAt(fraction: number, duration: number): number | null {
  if (!(duration > 0)) return null;
  return Math.min(duration, Math.max(0, fraction * duration));
}

/** "Chapter 4 of 22". Counts story chapters; front and back matter has no number. */
export function chapterLabel(chapter: ChapterInfo | null): string {
  if (!chapter) return '';
  if (chapter.storyNumber === null || chapter.matter) return 'Front or back matter';
  return `Chapter ${chapter.storyNumber} of ${chapter.storyTotal}`;
}

/** "Chapter 4 · The Ferryman’s Ledger"; matter has just its title. */
export function chapterLine(chapter: ChapterInfo | null): string {
  if (!chapter) return '';
  if (chapter.storyNumber === null || chapter.matter) return chapter.title;
  return `Chapter ${chapter.storyNumber} · ${chapter.title}`;
}

/** "Ch. 4" for the bar; matter has none. */
export function shortChapter(chapter: ChapterInfo | null): string {
  return chapter && chapter.storyNumber !== null && !chapter.matter ? `Ch. ${chapter.storyNumber}` : '';
}

/** "1.25×", "1×", "0.75×". */
export function speedLabel(speed: number): string {
  const n = Math.round(speed * 100) / 100;
  return `${n}×`;
}

export type PillTone = 'here' | 'making' | 'paid' | 'failed';

export const LISTENING_WORDS: Record<ListeningState, string> = {
  playing: 'Playing',
  getting_ready: 'Getting ready',
  waiting: 'Waiting',
  needs_you: 'Needs you',
};

/** Tone per state (the same four tones the Badge component has): accent, info, warn, bad. */
export const LISTENING_TONES: Record<ListeningState, PillTone> = {
  playing: 'here',
  getting_ready: 'making',
  waiting: 'paid',
  needs_you: 'failed',
};

/** The dot colour in front of the word. */
export const LISTENING_DOTS: Record<ListeningState, string> = {
  playing: 'var(--accent)',
  getting_ready: '#bcdcff',
  waiting: '#ffd493',
  needs_you: '#ffbcae',
};

export interface Pill {
  state: ListeningState;
  word: string;
  tone: PillTone;
  dot: string;
  /** the line next to the word: "6 min ahead", "First audio in about 10 s"; for Needs you, what is kept and what is wrong */
  detail: string | null;
}

/** The listening-state pill, or null while there is nothing to say (idle, or paused with no problem). */
export function listeningPill(
  listening: ListeningState | null,
  detail: string | null,
  needsYou: NeedsYou | null = null,
): Pill | null {
  if (!listening) return null;
  const text = listening === 'needs_you' ? (needsYou?.text ?? detail) : detail;
  return {
    state: listening,
    word: LISTENING_WORDS[listening],
    tone: LISTENING_TONES[listening],
    dot: LISTENING_DOTS[listening],
    detail: text && text.trim() ? text : null,
  };
}

/** The spoken form for the polite live region: "Playing. 6 min ahead". */
export function liveAnnouncement(pill: Pill | null): string {
  if (!pill) return '';
  return pill.detail ? `${pill.word}. ${pill.detail}` : pill.word;
}

/** The bar's second line: "Ch. 4 · 6 min ahead". Paused with nothing to say shows how far through the book. */
export function barDetail(s: Pick<BarState, 'chapter' | 'listening' | 'detail' | 'playing' | 'bookProgress'>): string {
  const ch = shortChapter(s.chapter);
  let rest: string;
  if (s.listening === 'playing') rest = s.detail && s.detail.trim() ? s.detail : LISTENING_WORDS.playing;
  else if (s.listening) rest = LISTENING_WORDS[s.listening];
  else rest = `${percent(s.bookProgress)}%`;
  return ch ? `${ch} · ${rest}` : rest;
}

/** The caption under the Sleep button: "Sleep", or what is running. */
export function sleepCaption(sleep: SleepTimer, nowMs: number): string {
  if (sleep.kind === 'minutes') return `${Math.max(1, Math.ceil((sleep.endsAt - nowMs) / 60000))} min`;
  if (sleep.kind === 'end_of_chapter') return 'Chapter end';
  return 'Sleep';
}

/** The audio word for a chapter row (docs/UI-GUIDE.md). */
export function audioWord(audio: PlayerState['chapters'][number]['audio']): string {
  switch (audio) {
    case 'ready':
      return 'Ready';
    case 'on_device':
      return 'On this device';
    case 'making':
      return 'Making';
    default:
      return 'Not yet';
  }
}

export interface UpNextRow {
  id: string;
  number: string;
  title: string;
  word: string;
}

/** The next story chapters after the current one, with their audio words. Matter is skipped, as "next chapter" skips it. */
export function upNext(chapters: PlayerState['chapters'], currentId: string | null, count = 3): UpNextRow[] {
  const at = chapters.findIndex((c) => c.id === currentId);
  if (at < 0) return [];
  return chapters
    .slice(at + 1)
    .filter((c) => !c.matter)
    .slice(0, count)
    .map((c) => ({ id: c.id, number: c.storyNumber === null ? '' : String(c.storyNumber), title: c.title, word: audioWord(c.audio) }));
}

import { SPEEDS } from '../../player/types';

/** The next speed up or down the guide's list (0.75 to 2); stays put at either end. */
export function stepSpeed(speed: number, direction: 1 | -1): number {
  const list = SPEEDS as readonly number[];
  if (direction > 0) return list.find((s) => s > speed + 1e-9) ?? list[list.length - 1]!;
  return [...list].reverse().find((s) => s < speed - 1e-9) ?? list[0]!;
}

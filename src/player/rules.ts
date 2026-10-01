// The rules of the player that need no audio element, no server and no clock of their own: the words of the
// four listening states, who comes next, how far into the book, what "Needs you" says. Plain functions so
// they are unit tested; player.ts joins them to the engine, the place writer and the API.
import { nextChapter as nextIn, isMatter } from '../lib/bookAudio';
import type { ListeningState, NeedsYou } from './types';

export const FIRST_AUDIO_TEXT = 'First audio in about 10 s';
export const BACK_RESTART_SECONDS = 3;

/** "Less than a minute ahead", "6 min ahead", "1 h 5 min ahead". Null when unknown. */
export function aheadText(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  if (seconds < 60) return 'Less than a minute ahead';
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min ahead`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h ahead` : `${h} h ${m} min ahead`;
}

/** "Continues in about 40 s" from the moment the job will go on (epoch ms), or a plain line when it does not say. */
export function waitingText(untilMs: number | null, nowMs: number): string {
  if (untilMs === null) return 'Continues when the wait is over';
  const s = Math.ceil((untilMs - nowMs) / 1000);
  if (s <= 1) return 'Continues in a moment';
  if (s < 90) return `Continues in about ${s} s`;
  const min = Math.ceil(s / 60);
  if (min < 90) return `Continues in about ${min} min`;
  return `Continues in about ${Math.ceil(min / 60)} h`;
}

export interface ListeningInput {
  needs: NeedsYou | null;
  waiting: { until: number | null } | null;
  /** the listener wants to hear a chapter that has no audio yet */
  awaitingAudio: boolean;
  /** the element is waiting for data */
  buffering: boolean;
  playing: boolean;
  aheadSeconds: number | null;
  now: number;
}

/**
 * Exactly one of the four states, or none when there is nothing to say (docs/PRODUCT-SPEC.md 6.2).
 * Needs you first (it asks the listener for something), then Waiting (held by a limit; nothing is wrong), then
 * Getting ready (audio is on its way), then Playing. Pausing is never a problem: paused with nothing wrong is null.
 */
export function deriveListening(i: ListeningInput): { listening: ListeningState | null; detail: string | null } {
  if (i.needs) return { listening: 'needs_you', detail: i.needs.text };
  if (i.waiting && (i.awaitingAudio || i.playing)) return { listening: 'waiting', detail: waitingText(i.waiting.until, i.now) };
  if (i.awaitingAudio) return { listening: 'getting_ready', detail: FIRST_AUDIO_TEXT };
  if (i.playing && i.buffering) return { listening: 'getting_ready', detail: 'Back in a moment' };
  if (i.playing) return { listening: 'playing', detail: aheadText(i.aheadSeconds) };
  return { listening: null, detail: null };
}

// --------------------------------------------------------------------------- what comes next

type Matterish = { id: string; kind: 'story' | 'front_matter' | 'back_matter' };

/** The chapter after this one; front and back matter are skipped (B6). Undefined at the end. */
export const nextPlayable = <T extends Matterish>(chapters: readonly T[], fromId: string): T | undefined => nextIn(chapters, fromId, false);

/** The chapter before this one, skipping matter. Undefined at the start. */
export function previousPlayable<T extends Matterish>(chapters: readonly T[], fromId: string): T | undefined {
  const i = chapters.findIndex((c) => c.id === fromId);
  if (i <= 0) return undefined;
  for (let j = i - 1; j >= 0; j--) if (!isMatter(chapters[j]!)) return chapters[j];
  return undefined;
}

/** The first chapter the story starts at (not front matter). */
export const firstPlayable = <T extends Matterish>(chapters: readonly T[]): T | undefined => chapters.find((c) => !isMatter(c)) ?? chapters[0];

// --------------------------------------------------------------------------- how far

export interface ProgressChapter {
  id: string;
  index: number;
  kind: 'story' | 'front_matter' | 'back_matter';
  word_count: number;
}

/**
 * 0 to 1 of the story, by words, with `frac` of the chapter behind. Close to the server's measure (story text before
 * the place); the server's own figure replaces it whenever one is read. Front matter is 0, back matter 1.
 */
export function progressEstimate(chapters: readonly ProgressChapter[], chapterId: string, frac: number): number {
  const ch = chapters.find((c) => c.id === chapterId);
  const story = chapters.filter((c) => c.kind === 'story');
  const total = story.reduce((n, c) => n + c.word_count, 0);
  if (!ch || total <= 0) return 0;
  if (ch.kind !== 'story') return story.length && ch.index > story[story.length - 1]!.index ? 1 : 0;
  const before = story.filter((c) => c.index < ch.index).reduce((n, c) => n + c.word_count, 0);
  return Math.min(1, Math.max(0, (before + Math.min(1, Math.max(0, frac)) * ch.word_count) / total));
}

// --------------------------------------------------------------------------- Needs you

const KEPT = 'Your place and the chapters already made are kept.';

const KNOWN: ReadonlySet<NeedsYou['code']> = new Set(['no_voice', 'source_unreachable', 'key_rejected', 'limit_exceeded', 'allowance_exceeded', 'provider_refused', 'repeated_failure', 'voice_changed', 'offline_not_downloaded', 'other']);

/** The code a server detail maps to (open enumeration: unknown ones are 'other'). */
export function needsCode(serverCode: string | null | undefined): NeedsYou['code'] {
  if (serverCode === 'source_not_set_up') return 'no_voice';
  return serverCode && KNOWN.has(serverCode as NeedsYou['code']) ? (serverCode as NeedsYou['code']) : 'other';
}

/** A "Needs you" that starts with what is kept, then what is wrong, then what to do. */
export function needsYou(code: NeedsYou['code'], problem: string, route: string, label = 'Choose what to do'): NeedsYou {
  return { code, text: `${KEPT} ${problem}`.trim(), action: { label, route } };
}

/** What the premium rule says when a premium chapter has no audio: nothing is requested, nothing is spent. */
export const premiumNeeds = (route: string): NeedsYou => ({
  code: 'other',
  text: 'Your place is kept. Premium audio is made under a plan.',
  action: { label: 'Open the book', route },
});

export function needsFromServer(detail: { code: string; text: string } | null | undefined, route: string): NeedsYou {
  return needsYou(needsCode(detail?.code), detail?.text ?? 'Something needs your attention.', route);
}

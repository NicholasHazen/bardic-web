// Words for the first-play and conflict screens that depend on a number.
import type { PlaceConflictInfo, PlaceSnapshot } from '../../player/types';
import { formatPlaceTime } from './placeTime';

/** "First audio in about 10 seconds." For no estimate: null (unknown stays unknown, so nothing is said). */
export function firstAudioText(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 5) return 'First audio in a few seconds.';
  if (seconds < 90) return `First audio in about ${Math.round(seconds / 5) * 5} seconds.`;
  const m = Math.round(seconds / 60);
  return `First audio in about ${m} ${m === 1 ? 'minute' : 'minutes'}.`;
}

export interface PlaceCardModel {
  who: 'mine' | 'theirs';
  /** "This device" or the other device's name */
  device: string;
  /** "Yesterday, 9:40 pm" */
  when: string;
  /** "Chapter 9" (null when the number is not known) */
  chapterNumber: number | null;
  chapterTitle: string;
  /** whole percent, 0 to 100 */
  percent: number;
  /** the place offered first: the server's, which another device wrote after this device last synced (the board's highlight) */
  suggested: boolean;
}

export const percentOf = (progress: number) => Math.round(Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0)) * 100);

/**
 * Both places of a conflict, the other device's (the server's) first. `chapterNumbers` overrides the number shown (a book with front
 * matter numbers its story chapters from 1); without it the position among all chapters plus one is used.
 */
export function placeCards(
  c: PlaceConflictInfo,
  now: number,
  chapterNumbers: { mine?: number | null; theirs?: number | null } = {},
): [PlaceCardModel, PlaceCardModel] {
  const make = (who: 'mine' | 'theirs', p: PlaceSnapshot): PlaceCardModel => ({
    who,
    device: who === 'mine' ? 'This device' : p.deviceName,
    when: formatPlaceTime(p.updatedAt, now),
    chapterNumber: chapterNumbers[who] !== undefined ? chapterNumbers[who]! : p.chapterIndex + 1,
    chapterTitle: p.chapterTitle,
    percent: percentOf(p.progress),
    suggested: who === 'theirs',
  });
  return [make('theirs', c.theirs), make('mine', c.mine)];
}

/** "Chapter 9 · Salt Tithe" */
export const placeLine = (p: PlaceCardModel) => (p.chapterNumber != null ? `Chapter ${p.chapterNumber} · ${p.chapterTitle}` : p.chapterTitle);

/** Button words: "Continue on Chapter 9" for the other device's place, "Stay on Chapter 4" for this one's. */
export function choiceLabel(p: PlaceCardModel, other: PlaceCardModel): string {
  const verb = p.who === 'theirs' ? 'Continue' : 'Stay';
  if (p.chapterNumber != null && other.chapterNumber !== p.chapterNumber) return `${verb} on Chapter ${p.chapterNumber}`;
  if (p.chapterTitle !== other.chapterTitle) return `${verb} on ${p.chapterTitle}`;
  return `${verb} at ${p.percent}%`;
}

// The words and rules of the book management screens: what a delete lists, what freeing space frees, the premium
// warning, the countdown, the slide control, server name rules. Pure functions: no DOM, no network, no clock
// (the countdown takes "now"). Unknown is unknown: a size that is null is said as unknown, never as 0.
import { rangeText } from '../../lib/money';
import { sizeText } from '../offline/logic';
import type { DeleteRow, RemakeEstimate, SpaceRow, WarningText } from './types';

// ---------------------------------------------------------------------------------------------- free up space

/** Free voices are chosen to delete by default; a premium one costs money to get back, so it starts unchosen. */
export function defaultChosen(rows: readonly SpaceRow[]): Set<string> {
  return new Set(rows.filter((r) => !r.premium && (r.bytes ?? 1) > 0).map((r) => r.id));
}

/** True when there is audio to delete (a size we do not know might still be audio). */
export const hasAudio = (r: Pick<SpaceRow, 'bytes'>) => r.bytes === null || r.bytes > 0;

export interface Totals {
  /** Sum of the sizes that are known. */
  bytes: number;
  /** How many chosen audiobooks have a size we do not know. */
  unknown: number;
  count: number;
}

export function freeTotals(rows: readonly SpaceRow[], chosen: ReadonlySet<string>): Totals {
  let bytes = 0;
  let unknown = 0;
  let count = 0;
  for (const r of rows) {
    if (!chosen.has(r.id)) continue;
    count++;
    if (r.bytes === null) unknown++;
    else bytes += r.bytes;
  }
  return { bytes, unknown, count };
}

/** "310 MB", "at least 160 MB" when some size is unknown, "unknown" when all are. */
export function totalText(t: Totals): string {
  if (t.unknown === 0) return sizeText(t.bytes);
  return t.bytes > 0 ? `at least ${sizeText(t.bytes)}` : 'unknown';
}

/** The action of the Free up space sheet: it names what goes and how much, as the board does. */
export function freeButtonLabel(rows: readonly SpaceRow[], chosen: ReadonlySet<string>): string {
  const t = freeTotals(rows, chosen);
  if (t.count === 0) return 'Choose audio to delete';
  const picked = rows.filter((r) => chosen.has(r.id));
  const what = picked.length === 1 ? `Delete ${picked[0]!.name} audio` : `Delete audio of ${picked.length} audiobooks`;
  return `${what} · ${totalText(t)}`;
}

export function chaptersReadyText(r: Pick<SpaceRow, 'chaptersReady' | 'chaptersTotal' | 'premium'>): string {
  return `${r.premium ? 'Premium' : 'Free'} · ${r.chaptersReady} of ${r.chaptersTotal} chapters ready`;
}

/** The premium estimate in words: "about $1.80 to $2.60", or that no range can be given. Never a made-up number. */
export function remakeCostText(est: RemakeEstimate | null | undefined): string {
  if (!est || est.basis === 'unknown') return 'the cost cannot be estimated';
  const t = rangeText(est.low, est.high);
  // "under $0.01" already says it is an estimate
  return t.startsWith('under') ? t : `about ${t}`;
}

/** The warning for one premium audiobook: remaking it is a new plan the listener approves, and it costs money. */
export function premiumWarning(r: Pick<SpaceRow, 'name' | 'bytes' | 'remake'>): WarningText {
  return {
    title: `Making ${r.name} again costs money`,
    body: `Deleting ${r.name}’s audio frees ${sizeText(r.bytes)}. Getting it back needs a new plan, ${remakeCostText(r.remake)}.`,
  };
}

/** "Freed 1.2 GB. Places and downloads are kept." */
export function freedToast(bytes: number | null): string {
  return `${bytes === null ? 'Freed the audio.' : `Freed ${sizeText(bytes)}.`} Places and downloads are kept.`;
}

/** An error says what is kept first. */
export function freeRefusal(code: string | undefined, detail: string): string {
  if (code === 'job_running') return 'Your audio, places and downloads were not touched. Audio is being made for this book. Stop it or wait until it is done, then free up space.';
  if (code === 'deletion_pending') return 'Nothing was deleted here. This book is being deleted; undo that first if you want to keep it.';
  return `Your audio, places and downloads were not touched. ${detail}`;
}

// ---------------------------------------------------------------------------------------------- delete permanently

export interface DeleteBook {
  chapters: number;
  words: number;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** What Delete permanently removes, in the order of the board, with sizes. Audio rows come from the audiobooks. */
export function deleteList(book: DeleteBook, audio: readonly Pick<SpaceRow, 'name' | 'bytes'>[]): DeleteRow[] {
  const audioDetail = audio.length ? audio.map((a) => `${a.name} ${sizeText(a.bytes)}`).join(' · ') : 'No audio has been made for it';
  return [
    { title: 'The book and its text', detail: `${plural(book.chapters, 'chapter', 'chapters')} · ${plural(book.words, 'word', 'words')}` },
    { title: 'All audio made for it', detail: audioDetail },
    { title: 'Places, history and plans', detail: 'For every listener on this Bardic' },
  ];
}

/** Why a delete could not be scheduled; it says what is kept first (nothing has been deleted). */
export function deleteRefusal(code: string | undefined, detail: string): string {
  switch (code) {
    case 'job_running':
      return 'Nothing was deleted and the book is still in your library. Audio is being made for it. Stop that on the book page or wait until it is done, then delete it.';
    case 'deletion_pending':
      return 'Nothing more was changed. This book is already being deleted; use Undo on the banner to keep it.';
    case 'book_adding':
      return 'Nothing was deleted. The book is still being added; try again when it is ready.';
    default:
      return `Nothing was deleted and the book is still in your library. ${detail}`;
  }
}

/** What Undo says when the server no longer has a schedule to cancel. */
export function undoRefusal(code: string | undefined, detail: string): string {
  if (code === 'deletion_done') return 'Too late: the book was already deleted for good.';
  if (code === 'deletion_not_found') return 'This deletion is no longer scheduled.';
  return `The deletion is still scheduled. ${detail}`;
}

// ---------------------------------------------------------------------------------------------- the countdown

/**
 * Whole seconds left until `executesAt`, never below 0 and never above `cap` (the wait the server set: a slow reply
 * must not make the first second read 61). `now` and `skewMs` (server minus this device) only shape the display.
 */
export function remainingSeconds(executesAt: string, now: number, skewMs = 0, cap = Infinity): number {
  const t = Date.parse(executesAt);
  if (!Number.isFinite(t)) return 0;
  return Math.min(cap, Math.max(0, Math.ceil((t - (now + skewMs)) / 1000)));
}

/** "Permanent in 47 seconds"; "Deleting now" at zero. */
export function countdownText(seconds: number): string {
  if (seconds <= 0) return 'Deleting now';
  if (seconds === 1) return 'Permanent in 1 second';
  if (seconds <= 90) return `Permanent in ${seconds} seconds`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `Permanent in ${m} min${s ? ` ${s} s` : ''}`;
}

/** The number in the round badge: seconds up to 99. */
export function countdownBadge(seconds: number): string {
  return seconds > 99 ? '99+' : String(Math.max(0, seconds));
}

/** "Deleting The Ash Ledger", or "Deleting a book" when this device only learned of it. */
export function bannerTitle(title: string): string {
  return title ? `Deleting ${title}` : 'Deleting a book';
}

// ---------------------------------------------------------------------------------------------- the menu

export type FinishAction = 'finish' | 'reopen';

/** The menu offers the one that changes something: a finished book can be reopened, any other can be marked finished. */
export function finishAction(place: { finished: { finished: boolean } } | null | undefined): FinishAction {
  return place?.finished.finished ? 'reopen' : 'finish';
}

export const FINISH_COPY: Record<FinishAction, { title: string; sub: string; toast: string }> = {
  finish: { title: 'Mark as finished', sub: 'Takes it off Continue', toast: 'Marked as finished.' },
  reopen: { title: 'Mark as not started', sub: 'Puts it back on Continue at your place', toast: 'Back on Continue, at your place.' },
};

/** "160 MB Samantha, 310 MB Kore": the second line of Free up space in the menu. */
export function freeSpaceSummary(rows: readonly Pick<SpaceRow, 'name' | 'bytes'>[]): string {
  const withAudio = rows.filter(hasAudio);
  if (!withAudio.length) return 'No audio on your Bardic computer to delete';
  return `Delete audio you can make again: ${withAudio.map((r) => `${sizeText(r.bytes)} ${r.name}`).join(', ')}`;
}

// ---------------------------------------------------------------------------------------------- server name

export const SERVER_NAME_MAX = 60;
export type ServerNameProblem = 'empty' | 'too_long' | 'control';

/** As the server stores it: trimmed, 1 to 60 code points, no control characters. */
export function serverNameProblem(raw: string): ServerNameProblem | null {
  const name = raw.trim();
  const n = [...name].length;
  if (n === 0) return 'empty';
  if (n > SERVER_NAME_MAX) return 'too_long';
  if (/\p{Cc}/u.test(name)) return 'control';
  return null;
}

export function serverNameProblemText(p: ServerNameProblem): string {
  switch (p) {
    case 'empty':
      return 'Enter a name.';
    case 'too_long':
      return `Use ${SERVER_NAME_MAX} characters or fewer.`;
    case 'control':
      return 'A name cannot contain line breaks or control characters.';
  }
}

/** "312 GB"; "unknown" when the server cannot say (never 0). */
export function freeSpaceText(bytes: number | null | undefined): string {
  return sizeText(bytes);
}

/** "2.0.0" and, when it differs, the API in brackets: "2.0.0 (API 0.4.0)". */
export function versionText(version: string, apiVersion: string): string {
  return apiVersion && apiVersion !== version ? `${version} (API ${apiVersion})` : version;
}

// Pure rules of the offline screens: sizes and free space in words, "N of M chapters", the words of a
// download, what a download card says in each status, the numbers of an update offer, and the O5 message.
// Nothing here touches the DOM or the network. Unknown is unknown: a size or free space that is null is
// said as unknown, never as 0.
import { AUDIO_WORD_TEXT, AUDIO_WORD_TONE, type AudioWord, type BadgeTone } from '../../lib/bookAudio';
import { formatBytes } from '../../lib/bytes';
import type { AudioFacts, DeviceChapter, DeviceChapterState, DownloadedBook, DownloadPreview, DownloadScope, StorageInfo, UpdateOffer } from '../../offline/types';

// ---------------------------------------------------------------------------------------------- sizes

/** "812 KB", "92 MB", "54 GB", "1.2 GB"; null is "unknown", never "0 MB". */
export function sizeText(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return 'unknown';
  if (bytes < 1_000_000_000) return formatBytes(bytes);
  const gb = bytes / 1_000_000_000;
  if (gb >= 100) return `${Math.round(gb)} GB`;
  const s = (Math.round(gb * 10) / 10).toString();
  return `${s} GB`;
}

/** "61 of 92 MB" (one unit when both share it), "980 KB of 4.2 MB"; null when either is unknown. */
export function sizeProgress(done: number | null, total: number | null): string | null {
  if (done === null || total === null) return null;
  const a = sizeText(done);
  const b = sizeText(total);
  const [an, au] = a.split(' ');
  const [, bu] = b.split(' ');
  return au === bu ? `${an} of ${b}` : `${a} of ${b}`;
}

/** "54 GB free on this device", or the plain statement that it is not known. */
export function freeSpaceText(freeBytes: number | null | undefined): string {
  return freeBytes === null || freeBytes === undefined ? 'Free space on this device is unknown' : `${sizeText(freeBytes)} free on this device`;
}

export function chapterCount(n: number): string {
  return `${n} ${n === 1 ? 'chapter' : 'chapters'}`;
}

/** "3 of 22 chapters"; `short` drops the noun ("18 of 18"), as the Downloads board does for a whole book. */
export function chaptersOf(done: number, total: number, short = false): string {
  return short ? `${done} of ${total}` : `${done} of ${total} ${total === 1 ? 'chapter' : 'chapters'}`;
}

// ---------------------------------------------------------------------------------------------- chapters

/** A copy of the audio is on this device (an out of date copy still plays). */
export const isHeld = (c: DeviceChapter): boolean => c.state === 'on_device' || c.state === 'out_of_date';

/** The chapters of the download: those the listener asked for (every state except "not downloaded"). */
export const requestChapters = (book: Pick<DownloadedBook, 'chapters'>): DeviceChapter[] => book.chapters.filter((c) => c.state !== 'not_downloaded');

export const heldCount = (book: Pick<DownloadedBook, 'chapters'>): number => book.chapters.filter(isHeld).length;

/** Every chapter of the audiobook is on this device. */
export function isFullyOnDevice(book: Pick<DownloadedBook, 'chapters'>): boolean {
  return book.chapters.length > 0 && book.chapters.every(isHeld);
}

/** The chapters whose copy is out of date, in order. */
export const outOfDate = (book: Pick<DownloadedBook, 'chapters'>): DeviceChapter[] => book.chapters.filter((c) => c.state === 'out_of_date');
export const failedChapters = (book: Pick<DownloadedBook, 'chapters'>): DeviceChapter[] => book.chapters.filter((c) => c.state === 'failed');

export interface DeviceWord {
  word: AudioWord;
  text: string;
  tone: BadgeTone;
}

/** The one audio word of a chapter on this device; a chapter that is not downloaded has none here (the server's word shows). */
export function deviceWord(state: DeviceChapterState): DeviceWord | null {
  const word: AudioWord | null =
    state === 'on_device' ? 'on_device' : state === 'queued' || state === 'downloading' ? 'downloading' : state === 'failed' ? 'failed' : state === 'out_of_date' ? 'out_of_date' : null;
  return word ? { word, text: AUDIO_WORD_TEXT[word], tone: AUDIO_WORD_TONE[word] } : null;
}

export interface Progress {
  /** chapters of the request that are on this device */
  done: number;
  /** chapters of the request */
  total: number;
  /** bytes finished (held, plus the part of the ones in flight); null when any size is unknown */
  doneBytes: number | null;
  totalBytes: number | null;
  /** 0 to 1: by bytes when every size is known, otherwise by chapters */
  fraction: number;
}

export function progressOf(book: Pick<DownloadedBook, 'chapters'>): Progress {
  const req = requestChapters(book);
  const done = req.filter(isHeld).length;
  const known = req.length > 0 && req.every((c) => c.bytes !== null);
  let totalBytes: number | null = null;
  let doneBytes: number | null = null;
  if (known) {
    totalBytes = req.reduce((s, c) => s + (c.bytes ?? 0), 0);
    doneBytes = req.reduce((s, c) => s + (isHeld(c) ? (c.bytes ?? 0) : c.state === 'downloading' ? Math.round((c.bytes ?? 0) * clamp01(c.progress ?? 0)) : 0), 0);
  }
  const fraction = totalBytes && totalBytes > 0 && doneBytes !== null ? doneBytes / totalBytes : req.length ? done / req.length : 0;
  return { done, total: req.length, doneBytes, totalBytes, fraction: clamp01(fraction) };
}

export const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
export const percent = (fraction: number): number => Math.round(clamp01(fraction) * 100);

/** The sentence every problem begins with: what is kept. */
export function keptText(done: number, total: number): string {
  if (done <= 0) return 'Nothing has been downloaded yet.';
  if (done >= total) return `All ${chapterCount(total)} are kept.`;
  return `The ${chaptersOf(done, total)} already downloaded ${done === 1 ? 'is' : 'are'} kept.`;
}

// ---------------------------------------------------------------------------------------------- the card

export type CardAction = 'pause' | 'resume' | 'cancel' | 'retry' | 'mobile' | 'try_again';

export interface ProgressCard {
  icon: 'download' | 'pause' | 'wifi' | 'full' | 'offline' | 'failed';
  title: string;
  detail: string;
  /** buttons in the row, in order */
  actions: CardAction[];
  /** a link under the buttons that opens Downloads (to free space) */
  linkToDownloads: boolean;
  /** show the progress bar */
  bar: boolean;
}

/** "Wi-Fi", "Mobile data" or nothing when the browser cannot say. */
export const connectionText = (unmetered: boolean | null | undefined): string | null => (unmetered === true ? 'Wi-Fi' : unmetered === false ? 'Mobile data' : null);

/** What the download card says and offers for the status of a book. null: nothing is going on and nothing failed. */
export function progressCard(book: Pick<DownloadedBook, 'chapters' | 'status' | 'voiceName'>, unmetered: boolean | null = null): ProgressCard | null {
  const p = progressOf(book);
  const failed = failedChapters(book).length;
  const kept = keptText(p.done, p.total);
  const parts = [chaptersOf(p.done, p.total), sizeProgress(p.doneBytes, p.totalBytes), connectionText(unmetered)].filter((x): x is string => !!x);
  switch (book.status) {
    case 'running':
      return { icon: 'download', title: `Downloading · ${book.voiceName}`, detail: parts.join(' · '), actions: ['pause', 'cancel'], linkToDownloads: false, bar: true };
    case 'paused':
      return { icon: 'pause', title: `Paused · ${book.voiceName}`, detail: `${kept} Resume when you like.`, actions: ['resume', 'cancel'], linkToDownloads: false, bar: true };
    case 'waiting_wifi':
      return { icon: 'wifi', title: `Waiting for Wi-Fi · ${book.voiceName}`, detail: `${kept} It starts by itself on Wi-Fi.`, actions: ['mobile', 'cancel'], linkToDownloads: false, bar: true };
    case 'device_full':
      return { icon: 'full', title: 'This device is full', detail: `${kept} Free some space, then try again.`, actions: ['try_again', 'cancel'], linkToDownloads: true, bar: true };
    case 'offline':
      return { icon: 'offline', title: 'Waiting for your Bardic computer', detail: `${kept} It resumes by itself when your Bardic computer is back.`, actions: ['cancel'], linkToDownloads: false, bar: true };
    default:
      return failed > 0
        ? { icon: 'failed', title: `Couldn’t download ${chapterCount(failed)}`, detail: `${kept} Retry to try again.`, actions: ['retry'], linkToDownloads: false, bar: true }
        : null;
  }
}

/** The text a screen reader hears for a download, kept short. */
export function progressSpeech(book: Pick<DownloadedBook, 'chapters' | 'status' | 'voiceName'>): string {
  const p = progressOf(book);
  const c = progressCard(book);
  return `${c?.title ?? 'Download'}. ${chaptersOf(p.done, p.total)}, ${percent(p.fraction)} percent.`;
}

/** The label of the ring beside the reader controls. */
export function ringLabel(done: number, total: number): string {
  return `Downloading ${chaptersOf(done, total)}. Open downloads`;
}

// ---------------------------------------------------------------------------------------------- live announcements

export interface AnnounceState {
  step: number;
  at: number;
}

/**
 * Progress is spoken politely and rarely: when the next 10% step is reached and at least `gapMs` has passed
 * since the last time (the first value is always spoken). A change of kind (done, failed) is passed in as `force`.
 */
export function decideAnnounce(prev: AnnounceState | null, pct: number, now: number, gapMs = 5000, force = false): { say: boolean; state: AnnounceState } {
  const step = Math.floor(clamp01(pct / 100) * 10);
  if (!prev) return { say: true, state: { step, at: now } };
  if (force || (step !== prev.step && now - prev.at >= gapMs)) return { say: true, state: { step, at: now } };
  return { say: false, state: prev };
}

// ---------------------------------------------------------------------------------------------- the Download sheet

export type ScopeKind = DownloadScope['kind'];

export function previewDetail(kind: ScopeKind, preview: DownloadPreview | null, chosen: number, wholeBookEstimate: number | null = null): string {
  if (!preview) return kind === 'chapters' && chosen === 0 ? '' : 'Counting…';
  if (kind === 'ready_now') {
    if (preview.chaptersToGet === 0) return 'Nothing new is ready';
    return `${chapterCount(preview.chaptersToGet)} · ${preview.bytes === null ? 'size unknown' : sizeText(preview.bytes)}`;
  }
  if (kind === 'whole_book') {
    const total = preview.chaptersToGet + preview.notReadyYet;
    if (preview.notReadyYet > 0) {
      if (wholeBookEstimate !== null) return `${chapterCount(total)} · about ${sizeText(wholeBookEstimate)}`;
      return `${chapterCount(total)} · ${preview.bytes === null ? 'size unknown' : `${sizeText(preview.bytes)} now`}, the rest as it is made`;
    }
    return `${chapterCount(total)} · ${preview.bytes === null ? 'size unknown' : sizeText(preview.bytes)}`;
  }
  if (chosen === 0) return '';
  return `${chapterCount(preview.chaptersToGet)} · ${preview.bytes === null ? 'size unknown' : sizeText(preview.bytes)}`;
}

/** The button says what it does and the size. */
export function downloadLabel(kind: ScopeKind, preview: DownloadPreview | null): string {
  if (!preview) return 'Download';
  if (preview.chaptersToGet === 0) return 'Nothing to download';
  const size = preview.bytes === null ? null : sizeText(preview.bytes);
  if (kind === 'chapters') return size ? `Download ${chapterCount(preview.chaptersToGet)} · ${size}` : `Download ${chapterCount(preview.chaptersToGet)}`;
  if (kind === 'whole_book' && preview.notReadyYet > 0) return size ? `Download ${size} now` : `Download ${chapterCount(preview.chaptersToGet)} now`;
  return size ? `Download ${size}` : `Download ${chapterCount(preview.chaptersToGet)}`;
}

/** The sheet cannot start: nothing to get, still counting, or it will not fit. */
export function canStart(preview: DownloadPreview | null): boolean {
  return !!preview && preview.chaptersToGet > 0 && preview.fits !== false;
}

/** Said when the download does not fit; begins with what is kept. */
export function doesNotFitText(preview: Pick<DownloadPreview, 'bytes' | 'freeBytes'>): string {
  const need = sizeText(preview.bytes);
  const free = sizeText(preview.freeBytes);
  return `${need} does not fit in the ${free} free on this device. Nothing on this device has been removed. Choose fewer chapters, or remove a book you have finished.`;
}

/** Sum of the sizes of chapters; null when any is unknown (never a smaller made-up number). */
export function sumBytes(items: { bytes: number | null }[]): number | null {
  let s = 0;
  for (const i of items) {
    if (i.bytes === null) return null;
    s += i.bytes;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------- Downloads

/** "Samantha · 3 of 22 chapters · 41 MB" ("18 of 18" for a whole book). */
export function downloadedLine(book: Pick<DownloadedBook, 'voiceName' | 'chapters' | 'heldBytes'>): string {
  const held = heldCount(book);
  const total = book.chapters.length;
  return `${book.voiceName} · ${chaptersOf(held, total, held === total)} · ${sizeText(book.heldBytes)}`;
}

/** Share of the space the app can use that it has used, 0 to 1; null when either number is unknown. */
export function usedFraction(storage: Pick<StorageInfo, 'usedBytes' | 'freeBytes'>): number | null {
  if (storage.usedBytes === null || storage.freeBytes === null) return null;
  const all = storage.usedBytes + storage.freeBytes;
  return all > 0 ? storage.usedBytes / all : null;
}

/** The bar always shows a sliver when something is held, so it never reads as empty. */
export const barPercent = (fraction: number | null, held: boolean): number => (fraction === null ? 0 : Math.max(held ? 2 : 0, Math.round(fraction * 100)));

export const REMOVE_AFTER_CHOICES = [7, 14, 30] as const;
export const REMOVE_AFTER_DEFAULT = 14;

export const removeFinishedLabel = (days: number | null): string => `Remove finished books after ${days ?? REMOVE_AFTER_DEFAULT} days`;

/** What removing says before it happens (O7): it never touches the Bardic computer. */
export function removeConfirmText(title: string, heldBytes: number): string {
  return `This removes the downloaded chapters of ${title} (${sizeText(heldBytes)}) from this device only. Nothing is deleted on your Bardic computer, and you can download them again.`;
}

export const removedBookLine = (heldBytes: number): string => `${sizeText(heldBytes)} on this device`;

// ---------------------------------------------------------------------------------------------- UpdateAudio

/** "chapter 4", "chapters 1 to 3", "chapters 2, 5 and 9" or "3 chapters" when the numbers are not known. */
export function chapterRange(numbers: number[]): string {
  const ns = [...new Set(numbers)].sort((a, b) => a - b);
  if (ns.length === 0) return 'no chapters';
  if (ns.length === 1) return `chapter ${ns[0]}`;
  const contiguous = ns.every((n, i) => i === 0 || n === ns[i - 1]! + 1);
  if (contiguous) return `chapters ${ns[0]} to ${ns[ns.length - 1]}`;
  if (ns.length <= 4) return `chapters ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
  return chapterCount(ns.length);
}

/** The range of a set of offers: the chapter numbers when all are known, otherwise just how many. */
export function offersRange(offers: { chapterId: string }[], numbers: Record<string, number>): string {
  const ns = offers.map((o) => numbers[o.chapterId]);
  return ns.every((n): n is number => n !== undefined) ? chapterRange(ns) : chapterCount(offers.length);
}

/** "12:04", "1:02:09" or null when not known. */
export function lengthText(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export interface FactLines {
  voice: string;
  revision: string;
  length: string;
  size: string;
}

const same = <T>(xs: T[]): T | null => (xs.length > 0 && xs.every((x) => x === xs[0]) ? xs[0]! : null);

/** The four lines of one side of the comparison, for the chapters in `facts` (totals for several). */
export function factLines(facts: AudioFacts[]): FactLines {
  const voice = same(facts.map((f) => f.voiceName));
  const rev = same(facts.map((f) => f.revision));
  const secs = facts.every((f) => f.seconds !== null) ? facts.reduce((s, f) => s + (f.seconds ?? 0), 0) : null;
  return {
    voice: voice ?? 'More than one voice',
    revision: rev ?? 'More than one revision',
    length: `Length ${lengthText(secs) ?? 'unknown'}`,
    size: sizeText(sumBytes(facts)),
  };
}

export const updateLabel = (count: number, newBytes: number | null): string => {
  const noun = `Update ${chapterCount(count)}`;
  return newBytes === null ? noun : `${noun} · ${sizeText(newBytes)}`;
};

/** Why the chapters are offered: the same sentence the board uses when the voice changed. */
export function updateReason(offers: Pick<UpdateOffer, 'held' | 'newer'>[], range: string): string {
  const revised = offers.some((o) => o.held.revision !== o.newer.revision || o.held.voiceName !== o.newer.voiceName);
  return revised
    ? `Your computer’s voice was updated, so ${range} ${offers.length === 1 ? 'was' : 'were'} made again. Your downloaded copies are still fine to keep.`
    : `Your computer has newer audio for ${range}. Your downloaded copies are still fine to keep.`;
}

export function updateEyebrow(voiceName: string, range: string): string {
  return `${voiceName} · ${range}`;
}

// ---------------------------------------------------------------------------------------------- O5

export interface ChapterRef {
  chapterId: string;
  index: number;
  title: string;
}

/** The next chapter after the zero-based `index` that has audio on this device; null when there is none. */
export function nextDownloaded(chapters: Pick<DeviceChapter, 'chapterId' | 'index' | 'title' | 'state'>[], index: number): ChapterRef | null {
  const next = chapters
    .filter((c) => c.index > index && (c.state === 'on_device' || c.state === 'out_of_date'))
    .sort((a, b) => a.index - b.index)[0];
  return next ? { chapterId: next.chapterId, index: next.index, title: next.title } : null;
}

/** The O5 message: says chapter `chapterNumber` (as shown, from 1) is not on this device and offers the next downloaded one (`next.index` is zero-based). */
export function unavailableChapterText(chapterNumber: number, next: { index: number; title: string } | null): { title: string; body: string; playNext: string | null } {
  const title = `Chapter ${chapterNumber} is not on this device`;
  const why = 'Your Bardic computer can’t be reached, so it can’t play yet.';
  return next
    ? { title, body: `${why} Chapter ${next.index + 1} · ${next.title} is on this device.`, playNext: `Play chapter ${next.index + 1}` }
    : { title, body: `${why} No later chapter is on this device. Downloaded chapters still play.`, playNext: null };
}

// ---------------------------------------------------------------------------------------------- Home away from home

/** Splits books into the ones that play away from home and the ones that need the Bardic computer (O4). */
export function splitByDevice<T extends { id: string; onDevice?: boolean }>(books: T[]): { here: T[]; away: T[] } {
  return { here: books.filter((b) => b.onDevice), away: books.filter((b) => !b.onDevice) };
}

// ---------------------------------------------------------------------------------------------- Away from home

export interface PlayableBook {
  bookId: string;
  audiobookId: string;
  title: string;
  color: string;
  coverSrc?: string;
  /** "Chapter 4 · 3 chapters on this device" or "Whole book on this device" */
  line: string;
  /** the book the listener was in: its play button is the accent one */
  current: boolean;
}

/**
 * What can be played with no connection: the books with at least one chapter on this device. `places` is the chapter
 * number (from 1) the listener is at, by bookId. The book with a place comes first and is the current one.
 */
export function playableBooks(books: Pick<DownloadedBook, 'bookId' | 'audiobookId' | 'title' | 'coverColor' | 'coverSrc' | 'chapters'>[], places: Record<string, number> = {}): PlayableBook[] {
  const list = books
    .filter((b) => heldCount(b) > 0)
    .map((b) => {
      const held = heldCount(b);
      const place = places[b.bookId];
      const line = isFullyOnDevice(b) ? 'Whole book on this device' : `${place !== undefined ? `Chapter ${place} · ` : ''}${chapterCount(held)} on this device`;
      return { bookId: b.bookId, audiobookId: b.audiobookId, title: b.title, color: b.coverColor, coverSrc: b.coverSrc, line, current: false, hasPlace: place !== undefined };
    });
  list.sort((a, b) => Number(b.hasPlace) - Number(a.hasPlace));
  return list.map(({ hasPlace: _h, ...rest }, i) => ({ ...rest, current: i === 0 }));
}

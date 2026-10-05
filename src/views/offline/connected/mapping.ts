// Pure mappings from the offline engine's state to what the connected screens take (W5). Nothing here touches the
// network, the DOM or the engine itself; the connected wrappers in this folder call these with `$offline`.
import { chapterRows, hasMatter, type ChapterRowModel, type DeviceCopy } from '../../../lib/bookAudio';
import type { DeviceChapter, DownloadedBook, OfflineBook, OfflineStateX } from '../../../offline/types';
import type { BookCardModel, ContinueModel } from '../../library/types';
import type { AudiobookCardModel, BookHeaderModel, ChaptersModel } from '../../book/types';
import { chapterCount, heldCount, isHeld, nextDownloaded, playableBooks, progressOf, ringLabel, sizeText, type ChapterRef, type PlayableBook } from '../logic';
import type { PickChapter } from '../types';

// ---------------------------------------------------------------------------------------------- Settings

/** "1.2 GB · 3 books" for the Downloads row of Settings; the bytes are the ones the engine holds when the browser cannot say. */
export function downloadsSummary(state: Pick<OfflineStateX, 'books' | 'storage'>): string {
  const books = state.books.filter((b) => heldCount(b) > 0 || b.chapters.some((c) => c.state !== 'not_downloaded'));
  if (books.length === 0) return 'Books kept on this device';
  const used = state.storage.usedBytes ?? books.reduce((n, b) => n + b.heldBytes, 0);
  const n = `${books.length} ${books.length === 1 ? 'book' : 'books'}`;
  return used > 0 ? `${sizeText(used)} · ${n}` : n;
}

// ---------------------------------------------------------------------------------------------- the ring in Read

/** The ring beside the Read controls: only while this audiobook's download is running. */
export function ringFor(state: Pick<OfflineStateX, 'books'>, audiobookId: string | null | undefined): { fraction: number; label: string } | null {
  if (!audiobookId) return null;
  const book = state.books.find((b) => b.audiobookId === audiobookId);
  if (!book || book.status !== 'running') return null;
  const p = progressOf(book);
  return { fraction: p.fraction, label: ringLabel(p.done, p.total) };
}

// ---------------------------------------------------------------------------------------------- the book page

/** Whether the book page shows the download card: something is going on, or a chapter is out of date or failed. */
export function showDownloadCard(book: DownloadedBook | undefined): book is DownloadedBook {
  if (!book) return false;
  return book.status !== 'idle' || book.chapters.some((c) => c.state === 'failed' || c.state === 'out_of_date' || c.state === 'downloading' || c.state === 'queued');
}

/** The rows the download card lists on the book page: what is going on, not every finished chapter. */
export function downloadRows(book: DownloadedBook): DeviceChapter[] {
  return book.chapters.filter((c) => c.state === 'queued' || c.state === 'downloading' || c.state === 'failed' || c.state === 'out_of_date');
}

interface ServerChapter {
  id: string;
  title: string;
}

/** The chapters the Download sheet can pick: ready on the Bardic computer (or already held) and their sizes. */
export function pickChapters(chapters: readonly ServerChapter[], audio: ReadonlyMap<string, { state: string; bytes?: number }>, device: DownloadedBook | undefined): PickChapter[] {
  const byId = new Map((device?.chapters ?? []).map((c) => [c.chapterId, c]));
  return chapters.map((c, i) => {
    const d = byId.get(c.id);
    const a = audio.get(c.id);
    const onDevice = !!d && isHeld(d);
    return { id: c.id, number: i + 1, title: c.title, bytes: a?.bytes ?? d?.bytes ?? null, onDevice, ready: onDevice || a?.state === 'ready' };
  });
}

// ---------------------------------------------------------------------------------------------- a held book with no server

/** The chapter the listener is at, as the device's own copy of the place says (sync/place.ts keeps it under this key). */
export interface LocalPlaceRef {
  chapterId: string;
  updatedAt: number;
}

export function readLocalPlace(storage: Pick<Storage, 'getItem'>, listenerId: string, bookId: string): LocalPlaceRef | null {
  try {
    const raw = storage.getItem(`bardic.place.${listenerId}.${bookId}`);
    const p = raw ? (JSON.parse(raw) as Partial<LocalPlaceRef>) : null;
    if (!p || typeof p.chapterId !== 'string') return null;
    return { chapterId: p.chapterId, updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0 };
  } catch {
    return null;
  }
}

/** The chapter number (from 1) a place is at in a held book; undefined when the chapter is not one of the book's. */
export function placeNumber(book: Pick<DownloadedBook, 'chapters'>, place: LocalPlaceRef | null | undefined): number | undefined {
  const c = place ? book.chapters.find((x) => x.chapterId === place.chapterId) : undefined;
  return c ? c.index + 1 : undefined;
}

export interface OfflinePage {
  header: BookHeaderModel;
  card: AudiobookCardModel;
  chapters: ChaptersModel;
  /** "3 of 12 chapters on this device" */
  deviceLine: string;
  primaryLabel: string;
}

/**
 * What a held book's page shows with no server: the book, the voice, and every chapter with its one word. The device cannot
 * know the server's words here, so a chapter that is not held shows "Ready" when its size is known (the manifest lists
 * only what was ready) and "Not yet" otherwise.
 */
export function offlinePage(book: OfflineBook | DownloadedBook, place: LocalPlaceRef | null, expanded = false, storyOnly = false): OfflinePage {
  const held = heldCount(book);
  const total = book.chapters.length;
  const copies = new Map<string, DeviceCopy>();
  const audio = new Map<string, { state: 'ready' | 'not_yet' }>();
  for (const c of book.chapters) {
    if (c.state === 'on_device') copies.set(c.chapterId, 'held');
    else if (c.state === 'downloading' || c.state === 'queued') copies.set(c.chapterId, 'downloading');
    else if (c.state === 'failed') copies.set(c.chapterId, 'failed');
    else if (c.state === 'out_of_date') copies.set(c.chapterId, 'out_of_date');
    audio.set(c.chapterId, { state: c.bytes !== null ? 'ready' : 'not_yet' });
  }
  const chapters = book.chapters.map((c) => ({ id: c.chapterId, title: c.title, kind: c.kind ?? 'story' }));
  const rows: ChapterRowModel[] = chapterRows({
    chapters,
    audio: audio as never,
    held: new Set([...copies].filter(([, d]) => d === 'held').map(([id]) => id)),
    deviceState: new Map([...copies].filter(([, d]) => d !== 'held')),
    currentId: place?.chapterId,
    filter: storyOnly ? 'story' : 'all',
  });
  const shown = expanded || rows.length <= 4 ? rows : rows.slice(Math.min(Math.max(0, rows.findIndex((r) => r.current)), rows.length - 4), Math.min(Math.max(0, rows.findIndex((r) => r.current)), rows.length - 4) + 4);
  return {
    header: { title: book.title, author: book.author, meta: chapterCount(total), color: book.coverColor, ...(book.coverSrc ? { coverSrc: book.coverSrc } : {}) },
    card: {
      id: book.audiobookId,
      voice: book.voiceName,
      tier: 'free',
      sourceLine: 'Kept on this device',
      readyText: `${held} of ${total} ${total === 1 ? 'chapter' : 'chapters'} on this device`,
      deviceText: '',
      ready: total ? held / total : 0,
      canMakeReady: false,
    },
    chapters: { rows: shown, more: shown.length < rows.length, total: rows.length, hasMatter: hasMatter(chapters), storyOnly },
    deviceLine: `${held} of ${total} ${total === 1 ? 'chapter' : 'chapters'} on this device`,
    primaryLabel: place ? 'Continue listening' : 'Listen',
  };
}

// ---------------------------------------------------------------------------------------------- Home away from home

/** What the Home tab remembers of the library so it can say which books are out of reach (kept in localStorage per listener). */
export interface HomeMemory {
  books: { id: string; title: string; subtitle?: string; color: string }[];
  /** the book Continue was showing, with the line under it */
  continueId?: string;
}

export const homeMemoryKey = (listenerId: string) => `bardic.home.${listenerId}`;

export function rememberHome(storage: Pick<Storage, 'setItem'>, listenerId: string, cards: BookCardModel[], continueItem: ContinueModel | null): void {
  const mem: HomeMemory = { books: cards.map((c) => ({ id: c.id, title: c.title, ...(c.subtitle ? { subtitle: c.subtitle } : {}), color: c.color })), ...(continueItem ? { continueId: continueItem.id } : {}) };
  try {
    storage.setItem(homeMemoryKey(listenerId), JSON.stringify(mem));
  } catch {
    /* the cards then show only what this device holds */
  }
}

export function recallHome(storage: Pick<Storage, 'getItem'>, listenerId: string): HomeMemory {
  try {
    const raw = storage.getItem(homeMemoryKey(listenerId));
    const m = raw ? (JSON.parse(raw) as Partial<HomeMemory>) : null;
    if (m && Array.isArray(m.books)) return { books: m.books.filter((b) => b && typeof b.id === 'string' && typeof b.title === 'string' && typeof b.color === 'string'), continueId: typeof m.continueId === 'string' ? m.continueId : undefined };
  } catch {
    /* fall through */
  }
  return { books: [] };
}

export interface AwayHome {
  /** every book Home would show: the ones on this device (openable) and the ones remembered (not) */
  books: BookCardModel[];
  continueItem: ContinueModel | null;
}

/**
 * Home with no server. Books on this device come from the engine (openable, with the chapter the local place is at);
 * the rest of the library is whatever Home last showed, dimmed. `places` is the local place by book id.
 */
export function awayHome(state: Pick<OfflineStateX, 'books'>, memory: HomeMemory, places: Record<string, LocalPlaceRef | null>): AwayHome {
  const here = new Map<string, OfflineBook | DownloadedBook>();
  for (const b of state.books) if (heldCount(b) > 0 && !here.has(b.bookId)) here.set(b.bookId, b);
  const books: BookCardModel[] = [];
  for (const b of here.values()) books.push({ id: b.bookId, title: b.title, subtitle: b.author, color: b.coverColor, coverSrc: b.coverSrc, onDevice: true, href: `#/book/${b.bookId}` });
  for (const m of memory.books) if (!here.has(m.id)) books.push({ id: m.id, title: m.title, subtitle: m.subtitle, color: m.color, onDevice: false });
  // Continue: the held book with the most recent local place, else the book Continue showed if it is held.
  let pick: { book: OfflineBook | DownloadedBook; place: LocalPlaceRef | null } | null = null;
  for (const b of here.values()) {
    const place = places[b.bookId] ?? null;
    if (place && (!pick || !pick.place || place.updatedAt > pick.place.updatedAt)) pick = { book: b, place };
  }
  if (!pick && memory.continueId && here.has(memory.continueId)) pick = { book: here.get(memory.continueId)!, place: null };
  let continueItem: ContinueModel | null = null;
  if (pick) {
    const n = placeNumber(pick.book, pick.place);
    const ch = n !== undefined ? pick.book.chapters[n - 1] : undefined;
    continueItem = {
      id: pick.book.bookId,
      title: pick.book.title,
      color: pick.book.coverColor,
      coverSrc: pick.book.coverSrc,
      progress: 0,
      ...(ch ? { chapterLine: `Chapter ${n} · ${ch.title}` } : {}),
      detail: isFullyHeld(pick.book) ? 'Whole book on this device' : `${chapterCount(heldCount(pick.book))} on this device`,
      href: `#/book/${pick.book.bookId}`,
    };
  }
  return { books, continueItem };
}

const isFullyHeld = (b: Pick<DownloadedBook, 'chapters'>) => b.chapters.length > 0 && b.chapters.every(isHeld);

/** The books Away from home can play, with the chapter the local place is at. */
export function awayPlayable(state: Pick<OfflineStateX, 'books'>, places: Record<string, LocalPlaceRef | null>): PlayableBook[] {
  const numbers: Record<string, number> = {};
  for (const b of state.books) {
    const n = placeNumber(b, places[b.bookId]);
    if (n !== undefined) numbers[b.bookId] = n;
  }
  return playableBooks(state.books, numbers);
}

// ---------------------------------------------------------------------------------------------- Now Playing

/** The next downloaded chapter after the one asked for: the player's own answer when it gave one, else the device's. */
export function nextForNotice(
  offlineNext: { chapterId: string; title: string } | null | undefined,
  book: Pick<DownloadedBook, 'chapters'> | undefined,
  chapterIndex: number,
): ChapterRef | null {
  if (offlineNext) {
    const c = book?.chapters.find((x) => x.chapterId === offlineNext.chapterId);
    return { chapterId: offlineNext.chapterId, index: c?.index ?? chapterIndex + 1, title: offlineNext.title };
  }
  return book ? nextDownloaded(book.chapters, chapterIndex) : null;
}

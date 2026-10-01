// The library as the screens need it: the list of books with filter, sort and search, paged through the
// server's cursor; Home's sections; the Manage actions. The rules that decide what is shown are plain
// functions (tested); the stores at the bottom join them to the typed client and to /api/events.
import { derived, writable, type Readable } from 'svelte/store';
import { api } from '../api/client';
import type { components } from '../api/schema';
import { deviceId } from '../lib/device';
import { subscribeSharedEvents } from '../lib/sse';
import { hslToHex } from '../theme/derive';
import type { BookCardModel, ContinueModel, LibraryFilter, LibrarySort, ManageBookModel, SeriesModel } from '../views/library/types';

export type Book = components['schemas']['Book'];
export type BookPage = components['schemas']['BookPage'];
export type Series = components['schemas']['Series'];
export type Chapter = components['schemas']['Chapter'];

// --------------------------------------------------------------------------- queries

export interface LibraryQuery {
  q: string;
  filter: LibraryFilter;
  sort: LibrarySort;
}

export const DEFAULT_QUERY: LibraryQuery = { q: '', filter: 'all', sort: 'recent' };

/** What listBooks accepts. */
export interface ListParams {
  q?: string;
  filter?: 'all' | 'in_progress' | 'not_started' | 'finished';
  sort?: LibrarySort;
  include_removed?: boolean;
  limit?: number;
  after?: string;
}

/** Most the server allows per page; the library loads every page, so a few big ones are cheaper than many small. */
export const PAGE_SIZE = 200;
/** A guard against a cursor that never ends. 50 pages is 10,000 books. */
export const MAX_PAGES = 50;

/**
 * Query parameters for listBooks. `on_device` is not a server filter ("the server does not know what a
 * device holds"): it asks for all books and the client narrows the page by what it holds.
 */
export function buildListParams(query: LibraryQuery, extra: { after?: string; limit?: number; includeRemoved?: boolean } = {}): ListParams {
  const p: ListParams = { sort: query.sort, limit: extra.limit ?? PAGE_SIZE };
  const q = query.q.trim();
  if (q) p.q = q;
  if (query.filter !== 'all' && query.filter !== 'on_device') p.filter = query.filter;
  if (extra.includeRemoved) p.include_removed = true;
  if (extra.after) p.after = extra.after;
  return p;
}

/** Read every page by following `next` until it is null. */
export async function fetchAllPages(
  fetchPage: (after: string | undefined) => Promise<BookPage>,
  maxPages = MAX_PAGES,
): Promise<{ books: Book[]; complete: boolean }> {
  const books: Book[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(after);
    books.push(...page.items);
    if (!page.next) return { books, complete: true };
    after = page.next;
  }
  return { books, complete: false };
}

// --------------------------------------------------------------------------- shaping

const DEFAULT_COVER = '#c65a43';

/** The cover colour: the stored sample, or a steady colour made from the id (a book with no cover sample). */
export function coverColor(book: Pick<Book, 'id' | 'cover'>): string {
  const sample = book.cover?.sample;
  if (sample) return sample.hex;
  if (!book.id) return DEFAULT_COVER;
  let h = 0;
  for (const ch of book.id) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return hslToHex(h % 360, 0.38, 0.4);
}

/**
 * The image to show for a book: a real cover only. A generated cover (a book with none of its own)
 * is drawn as the flat colour of its sample with the title over it, as the boards show; the sample
 * still colours the screen.
 */
export function realCoverUrl(cover: Pick<NonNullable<Book['cover']>, 'url' | 'generated'> | null | undefined): string | undefined {
  return cover && !cover.generated ? cover.url : undefined;
}

export function volumeLabel(order: number): string {
  return `Vol. ${order}`;
}

/** "Vol. 2" inside a series, otherwise the author. */
export function bookSubtitle(book: Pick<Book, 'author' | 'series'>): string {
  const order = book.series?.order;
  if (order !== undefined && order !== null) return volumeLabel(order);
  return book.author;
}

export function progressOf(book: Pick<Book, 'place'>): number | undefined {
  const p = book.place;
  if (!p || p.finished) return undefined;
  return p.progress > 0 ? p.progress : undefined;
}

export const bookHref = (id: string) => `#/book/${id}`;

export function toCard(book: Book, onDevice: ReadonlySet<string> = new Set()): BookCardModel {
  const card: BookCardModel = {
    id: book.id,
    title: book.title,
    subtitle: bookSubtitle(book),
    color: coverColor(book),
    onDevice: onDevice.has(book.id),
    adding: book.state === 'adding',
    href: book.state === 'adding' ? undefined : bookHref(book.id),
  };
  const p = progressOf(book);
  if (p !== undefined) card.progress = p;
  const src = realCoverUrl(book.cover);
  if (src) card.coverSrc = src;
  return card;
}

/** Books of one series sit together, in order, at the place of the series' first book in the list (A7). */
export function groupBySeries(books: Book[]): Book[] {
  const firstSeen = new Map<string, number>();
  books.forEach((b, i) => {
    const name = b.series?.name;
    if (name && !firstSeen.has(name.toLowerCase())) firstSeen.set(name.toLowerCase(), i);
  });
  const slot = (b: Book, i: number) => (b.series ? (firstSeen.get(b.series.name.toLowerCase()) ?? i) : i);
  return books
    .map((b, i) => ({ b, i, s: slot(b, i) }))
    .sort((x, y) => x.s - y.s || (x.b.series && y.b.series ? (x.b.series.order ?? Infinity) - (y.b.series.order ?? Infinity) : 0) || x.i - y.i)
    .map((x) => x.b);
}

/** Apply the client-resolved filter. Other filters were applied by the server. */
export function applyClientFilter(books: Book[], filter: LibraryFilter, onDevice: ReadonlySet<string>): Book[] {
  return filter === 'on_device' ? books.filter((b) => onDevice.has(b.id)) : books;
}

/** The visible grid: filtered, then series grouped. */
export function libraryView(books: Book[], query: LibraryQuery, onDevice: ReadonlySet<string>): Book[] {
  return groupBySeries(applyClientFilter(books, query.filter, onDevice));
}

// --------------------------------------------------------------------------- Home

/** The book to carry on with: the listener's most recently read book that is started and not finished (A8). */
export function pickContinue(books: Book[]): Book | undefined {
  return books.find((b) => b.state === 'readable' && b.place && !b.place.finished);
}

const byAddedDesc = (a: Book, b: Book) => Date.parse(b.added_at) - Date.parse(a.added_at);

export interface HomeSections {
  continueBook?: Book;
  onDevice: Book[];
  recent: Book[];
}

export const HOME_ROW_LIMIT = 12;

export function homeSections(books: Book[], onDevice: ReadonlySet<string>): HomeSections {
  const readable = books.filter((b) => b.state === 'readable');
  return {
    continueBook: pickContinue(readable),
    onDevice: readable.filter((b) => onDevice.has(b.id)).slice(0, HOME_ROW_LIMIT),
    recent: [...readable].sort(byAddedDesc).slice(0, HOME_ROW_LIMIT),
  };
}

/** "Chapter 4 · The Ferryman’s Ledger": the number counts story chapters only. */
export function chapterLine(chapters: Pick<Chapter, 'id' | 'kind' | 'title'>[], chapterId: string): string | undefined {
  const i = chapters.findIndex((c) => c.id === chapterId);
  const c = chapters[i];
  if (!c) return undefined;
  if (c.kind !== 'story') return c.title;
  const n = chapters.slice(0, i + 1).filter((x) => x.kind === 'story').length;
  return `Chapter ${n} · ${c.title}`;
}

export const percent = (p: number) => `${Math.floor(p * 100)}%`;

export function toContinue(book: Book, line: string | undefined): ContinueModel {
  const progress = book.place?.progress ?? 0;
  const m: ContinueModel = {
    id: book.id,
    title: book.title,
    color: coverColor(book),
    progress,
    // The time ahead needs the audiobook's ready audio, which the book list does not carry: leave it out rather than guess.
    detail: percent(progress),
    href: bookHref(book.id),
  };
  if (line) m.chapterLine = line;
  const src = realCoverUrl(book.cover);
  if (src) m.coverSrc = src;
  return m;
}

/** A tile in "On this device" shows the percentage for a started book, otherwise the author. */
export function homeCard(book: Book, onDevice: ReadonlySet<string>): BookCardModel {
  const c = toCard(book, onDevice);
  const p = progressOf(book);
  c.subtitle = p !== undefined ? percent(p) : book.author;
  return c;
}

// --------------------------------------------------------------------------- Manage

export function toManage(book: Book): ManageBookModel {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    color: coverColor(book),
    coverSrc: realCoverUrl(book.cover),
    chapters: book.chapter_count,
    seriesName: book.series?.name ?? '',
    seriesOrder: book.series?.order === null || book.series?.order === undefined ? '' : String(book.series.order),
  };
}

/** The series card: "3 of 4 volumes", with the known missing ones as lines (A7). */
export function toSeriesModel(s: Series): SeriesModel {
  const have = s.books.map((b) => ({ order: b.series?.order ?? 0, title: b.title, available: true }));
  const missing = s.missing_orders.map((order) => ({ order, title: `Volume ${order}`, available: false }));
  const volumes = [...have, ...missing].sort((a, b) => a.order - b.order);
  const total = s.books.length + s.missing_orders.length;
  return { name: s.name, summary: `${s.books.length} of ${total} ${total === 1 ? 'volume' : 'volumes'}`, volumes };
}

/** The body of updateBook from the edit form. A blank series name clears the series. */
export function buildBookUpdate(
  original: Pick<Book, 'title' | 'author' | 'series'>,
  edit: { title: string; author: string; seriesName: string; seriesOrder: string },
): components['schemas']['BookUpdate'] {
  const body: components['schemas']['BookUpdate'] = {};
  const title = edit.title.trim();
  if (title && title !== original.title) body.title = title;
  const author = edit.author.trim();
  if (author !== original.author) body.author = author;
  const name = edit.seriesName.trim();
  const orderText = edit.seriesOrder.trim();
  const order = orderText === '' ? null : Number(orderText);
  if (!name) {
    if (original.series) body.series = null;
  } else if (name !== original.series?.name || order !== (original.series?.order ?? null)) {
    body.series = { name, order: Number.isFinite(order) ? order : null };
  }
  return body;
}

// --------------------------------------------------------------------------- the stores

/** Ids of books with a downloaded audiobook on this device. Offline storage (W5) fills it; until then it is empty. */
export const onDeviceIds = writable<ReadonlySet<string>>(new Set());

const headers = (listenerId: string) => ({ 'X-Bardic-Listener': listenerId, 'X-Bardic-Device': deviceId() });

export interface ListState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  books: Book[];
  /** False when the cap on pages was reached. */
  complete: boolean;
  error?: string;
}

const errorText = (e: unknown) => (e && typeof e === 'object' && 'detail' in e ? String((e as { detail: unknown }).detail) : 'Your Bardic computer could not be reached.');

/** A list of books for one query, reloaded when something changes. */
export class BookListStore {
  private readonly store = writable<ListState>({ status: 'idle', books: [], complete: true });
  readonly subscribe: Readable<ListState>['subscribe'] = this.store.subscribe;
  private listenerId: string | null = null;
  private query: LibraryQuery = DEFAULT_QUERY;
  private includeRemoved = false;
  private run = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** Set what to list. Returns true when that started a load (the settings changed). */
  configure(listenerId: string | null, query: LibraryQuery, includeRemoved = false): boolean {
    const changed = listenerId !== this.listenerId || query.q !== this.query.q || query.sort !== this.query.sort || filterKey(query) !== filterKey(this.query) || includeRemoved !== this.includeRemoved;
    this.listenerId = listenerId;
    this.query = query;
    this.includeRemoved = includeRemoved;
    if (changed) void this.load();
    return changed;
  }

  /** Reload after a change notice; bursts collapse into one request. */
  refreshSoon(delay = 250): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(false), delay);
  }

  async load(showLoading = true): Promise<void> {
    const id = this.listenerId;
    if (!id) return;
    const mine = ++this.run;
    if (showLoading) this.store.update((s) => ({ ...s, status: s.status === 'ready' ? 'ready' : 'loading' }));
    try {
      const { books, complete } = await fetchAllPages(async (after) => {
        const { data, error } = await api.GET('/api/books', {
          params: { query: buildListParams(this.query, { after, includeRemoved: this.includeRemoved }), header: headers(id) },
        });
        if (!data) throw error ?? new Error('list failed');
        return data;
      });
      if (mine === this.run) this.store.set({ status: 'ready', books, complete });
    } catch (e) {
      if (mine === this.run) this.store.update((s) => ({ ...s, status: 'error', error: errorText(e) }));
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.run++;
  }
}

/** Only the parts of a query that the server sees: `on_device` is the same request as `all`. */
function filterKey(q: LibraryQuery): string {
  return q.filter === 'on_device' ? 'all' : q.filter;
}

export const libraryQuery = writable<LibraryQuery>(DEFAULT_QUERY);
export const libraryList = new BookListStore();
export const homeList = new BookListStore();
export const manageList = new BookListStore();

/** What the Library screen draws. */
export const libraryBooks: Readable<{ state: ListState; books: Book[]; query: LibraryQuery }> = derived(
  [libraryList, libraryQuery, onDeviceIds],
  ([state, query, held]) => ({ state, query, books: libraryView(state.books, query, held) }),
);

/** Notice types that can change what the library shows. */
const LIBRARY_NOTICES = new Set(['book.updated', 'import.updated', 'place.updated', 'resync', 'listener.updated']);

/** True when a notice is about this listener's library (listener-scoped notices of others are ignored). */
export function noticeConcerns(notice: { type?: string; listener_id?: string | null }, listenerId: string): boolean {
  if (!notice.type || !LIBRARY_NOTICES.has(notice.type)) return false;
  return !notice.listener_id || notice.listener_id === listenerId;
}

let stopFollowing: (() => void) | undefined;
let subscribers = 0;

/**
 * Follow /api/events and reload the lists on library notices, through the one stream shared by the whole page.
 * Reference counted. Without the stream the screens still work; they just reload on navigation.
 */
export function followLibraryEvents(listenerId: string): () => void {
  subscribers++;
  if (subscribers === 1) {
    stopFollowing = subscribeSharedEvents(
      listenerId,
      {
        onopen: () => {
          for (const l of [libraryList, homeList, manageList]) l.refreshSoon(0);
        },
        onmessage: (msg) => {
          try {
            const notice = JSON.parse(msg.data) as { type?: string; listener_id?: string | null };
            if (noticeConcerns(notice, listenerId)) for (const l of [libraryList, homeList, manageList]) l.refreshSoon();
          } catch {
            /* not a notice */
          }
        },
      },
      { headers: () => ({ 'X-Bardic-Listener': listenerId, 'X-Bardic-Device': deviceId() }) },
    );
  }
  return () => {
    subscribers--;
    if (subscribers === 0) {
      stopFollowing?.();
      stopFollowing = undefined;
    }
  };
}

// ---- single-book actions (Manage, duplicates, sample)

export type ActionResult<T = null> = { ok: true; value: T } | { ok: false; detail: string; code?: string };

async function act<T>(run: () => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<ActionResult<T>> {
  try {
    const r = await run();
    if (r.response.ok) return { ok: true, value: r.data as T };
    const e = r.error as { code?: string; detail?: string } | undefined;
    return { ok: false, detail: e?.detail ?? 'Something went wrong.', code: e?.code };
  } catch {
    return { ok: false, detail: 'Your Bardic computer could not be reached. Nothing was changed.' };
  }
}

export const bookActions = {
  update: (listenerId: string, bookId: string, body: components['schemas']['BookUpdate']) =>
    act(() => api.PATCH('/api/books/{book_id}', { params: { path: { book_id: bookId }, header: headers(listenerId) }, body })),
  refreshCover: (listenerId: string, bookId: string) =>
    act(() => api.POST('/api/books/{book_id}/cover/refresh', { params: { path: { book_id: bookId }, header: headers(listenerId) } })),
  remove: (listenerId: string, bookId: string) =>
    act(() => api.POST('/api/books/{book_id}/remove', { params: { path: { book_id: bookId }, header: headers(listenerId) } })),
  restore: (listenerId: string, bookId: string) =>
    act(() => api.POST('/api/books/{book_id}/restore', { params: { path: { book_id: bookId }, header: headers(listenerId) } })),
  sample: () => act(() => api.POST('/api/books/sample', { params: { header: { 'X-Bardic-Device': deviceId() } } })),
  series: (listenerId: string) => act(() => api.GET('/api/series', { params: { header: { 'X-Bardic-Listener': listenerId } } })),
  chapters: (bookId: string) => act(() => api.GET('/api/books/{book_id}/chapters', { params: { path: { book_id: bookId } } })),
};


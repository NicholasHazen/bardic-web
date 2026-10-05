import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUERY,
  MAX_PAGES,
  PAGE_SIZE,
  applyClientFilter,
  bookSubtitle,
  buildBookUpdate,
  buildListParams,
  chapterLine,
  coverColor,
  fetchAllPages,
  groupBySeries,
  homeCard,
  homeSections,
  libraryView,
  noticeConcerns,
  pickContinue,
  toCard,
  realCoverUrl,
  toContinue,
  toManage,
  toSeriesModel,
  type Book,
} from './library';

const book = (id: string, over: Partial<Book> = {}): Book => ({
  id,
  title: id,
  author: 'Odile Brandt',
  state: 'readable',
  added_at: '2026-03-01T00:00:00Z',
  series: null,
  cover: null,
  chapter_count: 10,
  story_chapter_count: 10,
  word_count: 1000,
  source_sha256: null,
  place: null,
  ...over,
});
const place = (progress: number, finished = false) => ({ chapter_id: 'c', progress, finished, updated_at: '2026-03-02T00:00:00Z' });
const inSeries = (id: string, name: string, order: number | null) => book(id, { series: { name, order } });

describe('list parameters', () => {
  it('sends sort and a page size, and nothing for an empty search or All', () => {
    expect(buildListParams(DEFAULT_QUERY)).toEqual({ sort: 'recent', limit: PAGE_SIZE });
  });
  it('trims the search and passes server filters', () => {
    expect(buildListParams({ q: '  ash ', filter: 'in_progress', sort: 'title' })).toEqual({ q: 'ash', filter: 'in_progress', sort: 'title', limit: PAGE_SIZE });
    expect(buildListParams({ q: '', filter: 'finished', sort: 'added' }).filter).toBe('finished');
    expect(buildListParams({ q: '', filter: 'not_started', sort: 'author' }).filter).toBe('not_started');
  });
  it('leaves On this device to the client', () => {
    expect(buildListParams({ q: '', filter: 'on_device', sort: 'recent' })).not.toHaveProperty('filter');
  });
  it('adds the cursor and removed books when asked', () => {
    expect(buildListParams(DEFAULT_QUERY, { after: 'abc', includeRemoved: true, limit: 20 })).toEqual({ sort: 'recent', limit: 20, after: 'abc', include_removed: true });
  });
});

describe('cursor paging', () => {
  const pages = [
    { items: [book('a'), book('b')], next: 'p2' },
    { items: [book('c')], next: 'p3' },
    { items: [book('d')], next: null },
  ];
  it('follows next until it is null, passing each cursor', async () => {
    const seen: (string | undefined)[] = [];
    const r = await fetchAllPages(async (after) => {
      seen.push(after);
      return pages[seen.length - 1]!;
    });
    expect(r.books.map((b) => b.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.complete).toBe(true);
    expect(seen).toEqual([undefined, 'p2', 'p3']);
  });
  it('stops at the page cap and says it is incomplete', async () => {
    let n = 0;
    const r = await fetchAllPages(async () => ({ items: [book(`x${n++}`)], next: 'again' }), 3);
    expect(r.books).toHaveLength(3);
    expect(r.complete).toBe(false);
    expect(MAX_PAGES).toBeGreaterThan(3);
  });
  it('lets an error through', async () => {
    await expect(fetchAllPages(async () => { throw new Error('down'); })).rejects.toThrow('down');
  });
});

describe('what the grid shows', () => {
  it('says Vol. N inside a series and the author otherwise', () => {
    expect(bookSubtitle(inSeries('a', 'S', 2))).toBe('Vol. 2');
    expect(bookSubtitle(inSeries('a', 'S', 2.5))).toBe('Vol. 2.5');
    expect(bookSubtitle(book('a'))).toBe('Odile Brandt');
    expect(bookSubtitle(inSeries('a', 'S', null))).toBe('Odile Brandt');
  });
  it('groups a series at its first book, in order', () => {
    const list = [inSeries('v2', 'Ashmark', 2), book('solo1'), inSeries('v1', 'Ashmark', 1), book('solo2'), inSeries('v4', 'Ashmark', 4)];
    expect(groupBySeries(list).map((b) => b.id)).toEqual(['v1', 'v2', 'v4', 'solo1', 'solo2']);
  });
  it('keeps the order of books that are not in a series', () => {
    const list = [book('b'), book('a'), book('c')];
    expect(groupBySeries(list).map((b) => b.id)).toEqual(['b', 'a', 'c']);
  });
  it('filters On this device by what the device holds', () => {
    const list = [book('a'), book('b'), book('c')];
    expect(applyClientFilter(list, 'on_device', new Set(['b'])).map((b) => b.id)).toEqual(['b']);
    expect(applyClientFilter(list, 'all', new Set(['b']))).toHaveLength(3);
    expect(libraryView(list, { ...DEFAULT_QUERY, filter: 'on_device' }, new Set())).toEqual([]);
  });
  it('makes a card with progress, the mark and a link', () => {
    const c = toCard(book('a', { place: place(0.34) }), new Set(['a']));
    expect(c).toMatchObject({ id: 'a', progress: 0.34, onDevice: true, href: '#/book/a', adding: false });
  });
  it('shows no bar for a finished or untouched book', () => {
    expect(toCard(book('a', { place: place(1, true) })).progress).toBeUndefined();
    expect(toCard(book('a', { place: place(0) })).progress).toBeUndefined();
  });
  it('shows an adding book as a tile with no link', () => {
    expect(toCard(book('a', { state: 'adding' }))).toMatchObject({ adding: true, href: undefined });
  });
  it('takes the cover colour from the sample, else a steady one from the id', () => {
    const cover = { url: '/c', generated: false, sha256: 'x', width: 1, height: 1, sample: { hex: '#c65a43', hue: 10, saturation: 0.5, lightness: 0.5, vivid: true, version: 1 } };
    expect(coverColor(book('a', { cover }))).toBe('#c65a43');
    expect(coverColor(book('abc'))).toBe(coverColor(book('abc')));
    expect(coverColor(book('abc'))).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('shows the image of a real cover, and for a generated cover the flat sample colour with the title', () => {
    const sample = { hex: '#3f6f8f', hue: 204, saturation: 0.4, lightness: 0.4, vivid: true, version: 1 };
    const real = { url: '/real.jpg', generated: false, sha256: 'a', width: 240, height: 360, sample };
    const made = { ...real, url: '/made.jpg', generated: true };
    expect(realCoverUrl(real)).toBe('/real.jpg');
    expect(realCoverUrl(made)).toBeUndefined();
    expect(realCoverUrl(null)).toBeUndefined();
    expect(toCard(book('a', { cover: made }))).toMatchObject({ color: '#3f6f8f' });
    expect(toCard(book('a', { cover: made })).coverSrc).toBeUndefined();
    expect(toCard(book('a', { cover: real })).coverSrc).toBe('/real.jpg');
  });
});

describe('Home', () => {
  const books = [
    book('read', { place: place(0.34), added_at: '2026-01-01T00:00:00Z' }),
    book('done', { place: place(1, true), added_at: '2026-02-01T00:00:00Z' }),
    book('new', { added_at: '2026-04-01T00:00:00Z' }),
    book('adding', { state: 'adding', added_at: '2026-05-01T00:00:00Z' }),
  ];
  it('continues the first started book that is not finished (A8)', () => {
    expect(pickContinue(books)?.id).toBe('read');
    expect(pickContinue([books[1]!, books[2]!])).toBeUndefined();
  });
  it('lists recently added newest first, only readable books', () => {
    expect(homeSections(books, new Set()).recent.map((b) => b.id)).toEqual(['new', 'done', 'read']);
  });
  it('lists what the device holds', () => {
    expect(homeSections(books, new Set(['done', 'adding'])).onDevice.map((b) => b.id)).toEqual(['done']);
  });
  it('shows the percentage under a started book and the author otherwise', () => {
    expect(homeCard(books[0]!, new Set()).subtitle).toBe('34%');
    expect(homeCard(books[2]!, new Set()).subtitle).toBe('Odile Brandt');
  });
  it('names the chapter, counting story chapters only', () => {
    const chapters = [
      { id: 'f', kind: 'front_matter' as const, title: 'Contents' },
      { id: 'c1', kind: 'story' as const, title: 'One' },
      { id: 'c2', kind: 'story' as const, title: 'The Ferryman’s Ledger' },
    ];
    expect(chapterLine(chapters, 'c2')).toBe('Chapter 2 · The Ferryman’s Ledger');
    expect(chapterLine(chapters, 'f')).toBe('Contents');
    expect(chapterLine(chapters, 'zzz')).toBeUndefined();
  });
  it('does not claim a time ahead it does not know', () => {
    expect(toContinue(books[0]!, undefined).detail).toBe('34%');
  });
});

describe('Manage', () => {
  it('shows a known gap as a missing volume (3 of 4)', () => {
    const s = toSeriesModel({ name: 'Ashmark', books: [inSeries('a', 'Ashmark', 1), inSeries('b', 'Ashmark', 2), inSeries('d', 'Ashmark', 4)], missing_orders: [3] });
    expect(s.summary).toBe('3 of 4 volumes');
    expect(s.volumes.map((v) => [v.order, v.available])).toEqual([[1, true], [2, true], [3, false], [4, true]]);
    expect(s.volumes[2]!.title).toBe('Volume 3');
  });
  it('fills the form from the book', () => {
    expect(toManage(inSeries('a', 'Ashmark', 2))).toMatchObject({ seriesName: 'Ashmark', seriesOrder: '2', chapters: 10 });
    expect(toManage(book('a'))).toMatchObject({ seriesName: '', seriesOrder: '' });
  });
  it('sends only what changed', () => {
    const b = inSeries('a', 'Ashmark', 2);
    const same = { title: 'a', author: 'Odile Brandt', seriesName: 'Ashmark', seriesOrder: '2' };
    expect(buildBookUpdate(b, same)).toEqual({});
    expect(buildBookUpdate(b, { ...same, title: ' New ' })).toEqual({ title: 'New' });
    expect(buildBookUpdate(b, { ...same, seriesOrder: '3' })).toEqual({ series: { name: 'Ashmark', order: 3 } });
  });
  it('clears the series with a blank name and starts one with a name', () => {
    expect(buildBookUpdate(inSeries('a', 'S', 1), { title: 'a', author: 'Odile Brandt', seriesName: ' ', seriesOrder: '' })).toEqual({ series: null });
    expect(buildBookUpdate(book('a'), { title: 'a', author: 'Odile Brandt', seriesName: 'New', seriesOrder: '' })).toEqual({ series: { name: 'New', order: null } });
    expect(buildBookUpdate(book('a'), { title: 'a', author: 'Odile Brandt', seriesName: '', seriesOrder: '' })).toEqual({});
  });
});

describe('change notices', () => {
  it('reloads for library notices, not for other listeners’ places', () => {
    expect(noticeConcerns({ type: 'book.updated' }, 'me')).toBe(true);
    expect(noticeConcerns({ type: 'place.updated', listener_id: 'me' }, 'me')).toBe(true);
    expect(noticeConcerns({ type: 'place.updated', listener_id: 'other' }, 'me')).toBe(false);
    expect(noticeConcerns({ type: 'resync' }, 'me')).toBe(true);
    expect(noticeConcerns({ type: 'job.updated' }, 'me')).toBe(false);
  });
});

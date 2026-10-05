import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../../../lib/clock';
import type { DeviceChapter, OfflineBook, OfflineStateX } from '../../../offline/types';
import { awayHome, awayPlayable, downloadRows, downloadsSummary, nextForNotice, offlinePage, pickChapters, placeNumber, readLocalPlace, recallHome, rememberHome, ringFor, showDownloadCard } from './mapping';
import { listenerName, rememberListenerName } from './listenerName';

const ch = (n: number, state: DeviceChapter['state'], extra: Partial<DeviceChapter> = {}): DeviceChapter => ({ chapterId: `c${n}`, index: n - 1, title: `Chapter title ${n}`, state, bytes: 1000, progress: null, error: null, ...extra });
const book = (over: Partial<OfflineBook> = {}): OfflineBook => ({
  bookId: 'b1',
  audiobookId: 'a1',
  title: 'The Lamp',
  author: 'A. Writer',
  coverColor: '#445566',
  voiceName: 'Mara',
  chapters: [ch(1, 'on_device'), ch(2, 'on_device'), ch(3, 'not_downloaded')],
  status: 'idle',
  heldBytes: 2000,
  remainingBytes: 0,
  wifiOnly: true,
  keepNew: false,
  checkedAt: null,
  message: null,
  ...over,
});
const storage = { usedBytes: null, freeBytes: null, persisted: false, unmetered: null };

describe('downloadsSummary', () => {
  it('says nothing is kept when nothing is', () => {
    expect(downloadsSummary({ books: [], storage })).toBe('Books kept on this device');
  });
  it('uses the engine usage, else the bytes of the books; never a made-up zero', () => {
    expect(downloadsSummary({ books: [book()], storage: { ...storage, usedBytes: 92_000_000 } })).toBe('92 MB · 1 book');
    expect(downloadsSummary({ books: [book({ heldBytes: 2_000_000 }), book({ audiobookId: 'a2', bookId: 'b2', heldBytes: 3_000_000 })], storage })).toBe('5 MB · 2 books');
  });
});

describe('ringFor', () => {
  it('shows only while this audiobook is running', () => {
    const running = book({ status: 'running', chapters: [ch(1, 'on_device'), ch(2, 'downloading', { progress: 0.5 }), ch(3, 'queued')] });
    const r = ringFor({ books: [running] }, 'a1');
    expect(r?.fraction).toBeCloseTo(0.5);
    expect(r?.label).toBe('Downloading 1 of 3 chapters. Open downloads');
    expect(ringFor({ books: [book({ status: 'paused' })] }, 'a1')).toBeNull();
    expect(ringFor({ books: [running] }, 'other')).toBeNull();
    expect(ringFor({ books: [running] }, null)).toBeNull();
  });
});

describe('the download card of the book page', () => {
  it('shows when something is going on or needs a choice, not for a finished book', () => {
    expect(showDownloadCard(undefined)).toBe(false);
    expect(showDownloadCard(book())).toBe(false);
    expect(showDownloadCard(book({ status: 'running' }))).toBe(true);
    expect(showDownloadCard(book({ chapters: [ch(1, 'out_of_date')] }))).toBe(true);
    expect(showDownloadCard(book({ chapters: [ch(1, 'failed', { error: 'x' })] }))).toBe(true);
  });
  it('lists only the chapters that are going on or need a choice', () => {
    const b = book({ chapters: [ch(1, 'on_device'), ch(2, 'downloading'), ch(3, 'failed'), ch(4, 'out_of_date'), ch(5, 'not_downloaded')] });
    expect(downloadRows(b).map((c) => c.chapterId)).toEqual(['c2', 'c3', 'c4']);
  });
});

describe('pickChapters', () => {
  it('a chapter is pickable when ready on the server; held chapters are marked; sizes stay unknown when unknown', () => {
    const rows = pickChapters(
      [
        { id: 'c1', title: 'One' },
        { id: 'c2', title: 'Two' },
        { id: 'c3', title: 'Three' },
      ],
      new Map([
        ['c1', { state: 'ready', bytes: 500 }],
        ['c2', { state: 'ready' }],
        ['c3', { state: 'making' }],
      ]),
      book({ chapters: [ch(1, 'on_device', { bytes: 500 }), ch(2, 'not_downloaded', { bytes: null }), ch(3, 'not_downloaded', { bytes: null })] }),
    );
    expect(rows).toEqual([
      { id: 'c1', number: 1, title: 'One', bytes: 500, onDevice: true, ready: true },
      { id: 'c2', number: 2, title: 'Two', bytes: null, onDevice: false, ready: true },
      { id: 'c3', number: 3, title: 'Three', bytes: null, onDevice: false, ready: false },
    ]);
  });
});

describe('a held book with no server', () => {
  it('gives every chapter one word and says how many are on the device', () => {
    const p = offlinePage(book({ chapters: [ch(1, 'on_device'), ch(2, 'out_of_date'), ch(3, 'not_downloaded', { bytes: null })] }), { chapterId: 'c2', updatedAt: 5 });
    expect(p.chapters.rows.map((r) => r.wordText)).toEqual(['On this device', 'Out of date', 'Not yet']);
    expect(p.chapters.rows[1]?.current).toBe(true);
    expect(p.deviceLine).toBe('2 of 3 chapters on this device');
    expect(p.primaryLabel).toBe('Continue listening');
    expect(p.header.meta).toBe('3 chapters');
    expect(offlinePage(book(), null).primaryLabel).toBe('Listen');
  });
  it('shows a short list around the place until asked for all', () => {
    const many = book({ chapters: Array.from({ length: 10 }, (_, i) => ch(i + 1, 'on_device')) });
    const p = offlinePage(many, { chapterId: 'c6', updatedAt: 1 });
    expect(p.chapters.rows).toHaveLength(4);
    expect(p.chapters.more).toBe(true);
    expect(p.chapters.rows.some((r) => r.current)).toBe(true);
    expect(offlinePage(many, null, true).chapters.rows).toHaveLength(10);
  });
  it('hides cached matter with stable chapter IDs, story numbers and device totals', () => {
    const cached = book({ chapters: [
      ch(1, 'on_device', { kind: 'front_matter', title: 'Copyright' }),
      ch(2, 'on_device', { kind: 'story', title: 'The Lantern River' }),
      ch(3, 'on_device', { kind: 'back_matter', title: 'Notes' }),
      ch(4, 'on_device', { kind: 'story', title: 'The Far Shore' }),
      ch(5, 'out_of_date', { kind: 'back_matter', title: 'Acknowledgements' }),
    ] });
    const before = structuredClone(cached);
    const place = { chapterId: 'c4', updatedAt: 5 };
    const all = offlinePage(cached, place, true);
    expect(all.chapters.rows.map((row) => [row.id, row.number])).toEqual([['c1', '–'], ['c2', '1'], ['c3', '–'], ['c4', '2'], ['c5', '–']]);
    const hidden = offlinePage(cached, place, true, true);
    expect(hidden.chapters).toMatchObject({ hasMatter: true, storyOnly: true, total: 2 });
    expect(hidden.chapters.rows.map((row) => [row.id, row.number])).toEqual([['c2', '1'], ['c4', '2']]);
    expect(hidden.chapters.rows[1]?.current).toBe(true);
    expect(hidden.deviceLine).toBe(all.deviceLine);
    expect(hidden.header).toEqual(all.header);
    expect(cached).toEqual(before);
    expect(offlinePage(cached, place, true, false)).toEqual(all);
  });
  it('keeps legacy cached chapters visible when their kind is unknown', () => {
    const legacy = book();
    const hidden = offlinePage(legacy, null, true, true);
    expect(hidden.chapters.hasMatter).toBe(false);
    expect(hidden.chapters.rows.map((row) => row.id)).toEqual(['c1', 'c2', 'c3']);
  });
  it('shows cached source length, retained audio runtime and exact chapter-local progress without the server', () => {
    const cached = book({ chapters: [ch(1, 'out_of_date', { wordCount: 1200, textLength: 10000, pageCount: 4, durationSeconds: 240 })] });
    const row = offlinePage(cached, { chapterId: 'c1', offset: 2500, updatedAt: 5 }, true).chapters.rows[0]!;
    expect(row).toMatchObject({ wordText: 'Out of date', metadata: '1,200 words · 4 pages · 4 min audio', progressText: '25% through chapter' });
    expect(row.progress).toBeUndefined();
    const legacy = offlinePage(book(), { chapterId: 'c1', offset: 5, updatedAt: 5 }, true).chapters.rows[0]!;
    expect(legacy.metadata).toBeUndefined();
    expect(legacy.progressText).toBeUndefined();
  });
});

describe('local places', () => {
  it('reads the copy the device keeps and ignores damage', () => {
    const s = memoryStorage({ 'bardic.place.l1.b1': JSON.stringify({ chapterId: 'c2', offset: 4, mode: 'listening', updatedAt: 9 }), 'bardic.place.l1.b2': '{oops' });
    expect(readLocalPlace(s, 'l1', 'b1')).toEqual({ chapterId: 'c2', offset: 4, updatedAt: 9 });
    expect(readLocalPlace(s, 'l1', 'b2')).toBeNull();
    expect(readLocalPlace(s, 'l1', 'none')).toBeNull();
    expect(placeNumber(book(), { chapterId: 'c2', updatedAt: 9 })).toBe(2);
    expect(placeNumber(book(), { chapterId: 'zz', updatedAt: 9 })).toBeUndefined();
  });
});

describe('Home away from home', () => {
  const state: Pick<OfflineStateX, 'books'> = { books: [book()] };
  it('opens the books on this device and shows the rest as not available', () => {
    const s = memoryStorage();
    rememberHome(s, 'l1', [{ id: 'b1', title: 'The Lamp', color: '#445566' }, { id: 'b2', title: 'Elsewhere', subtitle: 'Someone', color: '#112233' }], null);
    const mem = recallHome(s, 'l1');
    const home = awayHome(state, mem, { b1: { chapterId: 'c2', updatedAt: 3 } });
    expect(home.books.map((b) => [b.id, !!b.onDevice, b.href])).toEqual([
      ['b1', true, '#/book/b1'],
      ['b2', false, undefined],
    ]);
    expect(home.continueItem).toMatchObject({ id: 'b1', chapterLine: 'Chapter 2 · Chapter title 2', detail: '2 chapters on this device' });
  });
  it('does not offer to continue a book that is not here, and survives an empty or damaged memory', () => {
    const s = memoryStorage({ 'bardic.home.l1': 'nope' });
    expect(recallHome(s, 'l1')).toEqual({ books: [] });
    expect(awayHome({ books: [] }, { books: [{ id: 'b9', title: 'Far', color: '#000000' }], continueId: 'b9' }, {}).continueItem).toBeNull();
  });
  it('lists what plays, the book with a place first', () => {
    const two = [book(), book({ bookId: 'b2', audiobookId: 'a2', title: 'Second' })];
    const list = awayPlayable({ books: two }, { b2: { chapterId: 'c2', updatedAt: 1 } });
    expect(list.map((b) => b.bookId)).toEqual(['b2', 'b1']);
    expect(list[0]?.line).toBe('Chapter 2 · 2 chapters on this device');
    expect(list[0]?.current).toBe(true);
  });
});

describe('the next chapter in O5', () => {
  it('prefers the player, else the device', () => {
    const b = book({ chapters: [ch(1, 'not_downloaded'), ch(2, 'not_downloaded'), ch(3, 'on_device')] });
    expect(nextForNotice({ chapterId: 'c3', title: 'Chapter title 3' }, b, 0)).toEqual({ chapterId: 'c3', index: 2, title: 'Chapter title 3' });
    expect(nextForNotice(undefined, b, 0)).toEqual({ chapterId: 'c3', index: 2, title: 'Chapter title 3' });
    expect(nextForNotice(null, b, 2)).toBeNull();
    expect(nextForNotice(null, undefined, 0)).toBeNull();
  });
});

describe('the remembered name', () => {
  it('is kept per listener', () => {
    const s = memoryStorage();
    rememberListenerName(s, 'l1', 'Nick');
    expect(listenerName(s, 'l1')).toBe('Nick');
    expect(listenerName(s, 'l2')).toBe('');
  });
});

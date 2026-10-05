// Fixtures for the W5 offline boards (DownloadSheet, DownloadProgress, Downloads, UpdateAudio, ServerOffline,
// HomeOffline, ReadDownloading). OfflineState-shaped, original synthetic data; the names are the boards' own.
import type { DeviceChapter, DeviceChapterState, DownloadedBook, DownloadPreview, OfflineState, UpdateOffer } from '../offline/types';
import type { PickChapter } from '../views/offline/types';
import { chapters as ashInfo } from './book';
import { colors } from './library';

export const MB = 1_000_000;
export const GB = 1_000_000_000;

/** A fixed "now": 1 Oct 2026, 10:00 local. */
export const NOW = new Date(2026, 9, 1, 10, 0).getTime();

export const freeBytes = 54 * GB;

/** Build the chapters of an audiobook from titles and a state for each (the rest are not downloaded). */
function chaptersOf(titles: string[], states: Record<number, DeviceChapterState> = {}, bytes = 11.5 * MB, fill: DeviceChapterState = 'not_downloaded'): DeviceChapter[] {
  return titles.map((title, i) => {
    const state = states[i] ?? fill;
    return { chapterId: `c${i + 1}`, index: i, title, state, bytes, progress: state === 'downloading' ? 0.3043478 : state === 'on_device' ? 1 : null, error: null };
  });
}

const ashTitles = ashInfo.map((c) => c.title);
const numbered = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);

// --- DownloadProgress: 8 of 22 chapters asked for; five are on this device (one out of date), one downloading, one failed, one waiting.
export const ashDownloading: DownloadedBook = {
  bookId: 'ash',
  audiobookId: 'ab-samantha',
  title: 'The Ash Ledger',
  author: 'Odile Brandt',
  coverColor: colors.ash,
  voiceName: 'Samantha',
  chapters: chaptersOf(ashTitles, { 0: 'on_device', 1: 'on_device', 2: 'on_device', 3: 'downloading', 4: 'failed', 5: 'out_of_date', 6: 'on_device', 7: 'queued' }),
  status: 'running',
  heldBytes: 57.5 * MB,
  remainingBytes: 34.5 * MB,
  wifiOnly: true,
  keepNew: true,
  checkedAt: NOW - 3_600_000,
};
/** The board lists chapters 3 to 6. */
export const ashDownloadingRows = ashDownloading.chapters.slice(2, 6);

/** Same book in the other statuses (unit tests and states the boards do not draw). */
export const ashFailedDetail: DownloadedBook = {
  ...ashDownloading,
  status: 'idle',
  chapters: ashDownloading.chapters.map((c) =>
    c.state === 'failed' ? { ...c, error: 'The other chapters are kept. Your Bardic computer didn’t answer for this one; try again.' } : c.state === 'downloading' || c.state === 'queued' ? { ...c, state: 'not_downloaded' as const, progress: null } : c,
  ),
};

// --- Downloads
const lanternTitles = numbered(18, 'Lantern part');
const hollowTitles = numbered(26, 'Tide part');

export const ashOnDevice: DownloadedBook = {
  ...ashDownloading,
  chapters: chaptersOf(ashTitles, { 0: 'on_device', 1: 'on_device', 2: 'on_device' }),
  status: 'idle',
  heldBytes: 41 * MB,
  remainingBytes: null,
};
export const lanternfall: DownloadedBook = {
  bookId: 'lantern',
  audiobookId: 'ab-lantern',
  title: 'Lanternfall',
  author: 'Odile Brandt',
  coverColor: colors.lantern,
  voiceName: 'Samantha',
  chapters: chaptersOf(lanternTitles, {}, 11.6 * MB, 'on_device'),
  status: 'idle',
  heldBytes: 210 * MB,
  remainingBytes: 0,
  wifiOnly: true,
  keepNew: false,
  checkedAt: NOW - 86_400_000,
};
export const hollowTide: DownloadedBook = {
  bookId: 'hollow',
  audiobookId: 'ab-hollow',
  title: 'Hollow Tide',
  author: 'Odile Brandt',
  coverColor: colors.hollow,
  voiceName: 'Kore',
  chapters: chaptersOf(hollowTitles, {}, 18.4 * MB, 'on_device'),
  status: 'idle',
  heldBytes: 480 * MB,
  remainingBytes: 0,
  wifiOnly: true,
  keepNew: false,
  checkedAt: NOW - 86_400_000,
};

export const downloadsState: OfflineState = {
  online: true,
  lastContact: NOW,
  storage: { usedBytes: 731 * MB, freeBytes, persisted: true, unmetered: true },
  books: [ashOnDevice, lanternfall, hollowTide],
  updates: [],
  removedBooks: [],
  removeFinishedAfterDays: null,
};

// --- DownloadSheet
const preview = (p: Partial<DownloadPreview>): DownloadPreview => ({ chaptersToGet: 8, bytes: 92 * MB, freeBytes, fits: true, notReadyYet: 0, ...p });
export const sheetPreviews = {
  ready_now: preview({}),
  whole_book: preview({ notReadyYet: 14 }),
  chapters: null,
};
export const wholeBookEstimate = 240 * MB;

/** Chapters 1 to 8 are ready; 1 to 3 are already on this device. */
export const pickChapters: PickChapter[] = ashTitles.map((title, i) => ({ id: `c${i + 1}`, number: i + 1, title, bytes: 11.5 * MB, onDevice: i < 3, ready: i < 8 }));

// --- UpdateAudio: chapters 1 to 3 were made again with a newer voice revision
const held = (i: number) => ({ voiceName: 'Samantha', revision: 'Ventura voice 13.2', seconds: [241, 241, 242][i]!, bytes: [53_300_000, 53_300_000, 53_400_000][i]!, madeAt: NOW - 90 * 86_400_000 });
const newer = (i: number) => ({ voiceName: 'Samantha', revision: 'Sonoma voice 14.1', seconds: [237, 237, 238][i]!, bytes: 54 * MB, madeAt: NOW - 86_400_000 });
export const updateOffers: UpdateOffer[] = [0, 1, 2].map((i) => ({
  audiobookId: 'ab-samantha',
  bookId: 'ash',
  chapterId: `c${i + 1}`,
  chapterTitle: ashTitles[i]!,
  held: held(i),
  newer: newer(i),
}));
export const updateNumbers: Record<string, number> = { c1: 1, c2: 2, c3: 3 };

// --- ServerOffline and HomeOffline
export const serverOfflineState: OfflineState = {
  ...downloadsState,
  online: false,
  lastContact: NOW - 2 * 3_600_000,
  books: [ashOnDevice, lanternfall],
};
/** Where the listener is in each book, as the chapter number. */
export const placeByBook: Record<string, number> = { ash: 4 };

export const ringLabelText = 'Downloading 5 of 8 chapters. Open downloads';
export const ringFraction = 0.62;

// --- States the boards do not draw (the gallery boards OfflineStates* show them; unit tests use them too)
const withStatus = (status: DownloadedBook['status']): DownloadedBook => ({ ...ashFailedDetail, status });
export const ashPaused = withStatus('paused');
export const ashWaitingWifi = withStatus('waiting_wifi');
export const ashDeviceFull = withStatus('device_full');
export const ashOffline = withStatus('offline');
export const ashIdleFailed = ashFailedDetail;

export const removedBooks = [
  { bookId: 'old1', audiobookId: 'ab-old1', title: 'The Tin Orchard', heldBytes: 96 * MB },
  { bookId: 'old2', audiobookId: 'ab-old2', title: 'Salt and Lamplight', heldBytes: 188 * MB },
];
export const downloadsBusyState: OfflineState = {
  ...downloadsState,
  storage: { usedBytes: 731 * MB, freeBytes: null, persisted: false, unmetered: null },
  updates: updateOffers,
  removedBooks,
  removeFinishedAfterDays: 14,
};
export const noFitPreviews = { ready_now: preview({ bytes: 92 * MB, freeBytes: 40 * MB, fits: false }), whole_book: preview({ notReadyYet: 14, fits: false }), chapters: null };
export const chosenPreview = preview({ chaptersToGet: 2, bytes: 23 * MB });

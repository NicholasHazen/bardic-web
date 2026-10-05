// Synthetic data for the sheet and playback-state boards (W3). Original text only.
import type { PlaceConflictInfo, SleepTimer } from '../player/types';
import type { ReaderAppearanceValue, ReaderExtras } from '../views/sheets/appearance';
import type { SheetChapter } from '../views/sheets/chapters';
import { hitToRow, type SearchHitInput, type SearchResultRow } from '../views/sheets/search';

export const book = { title: 'The Ash Ledger', author: 'Odile Brandt', color: '#c65a43', seriesLine: 'The Ashmark Cycle · Volume 2', meta: '22 chapters · 74,200 words' };

/** The reader behind the sheets: chapter 4, the second line is being read, the last one is the place when paused. */
export const readerLines = [
  'The ferry kept no hours, only a lantern on a post and a ledger under a stone. Nessa read the last entry twice before she trusted it.',
  '“You are early,” the ferryman said, without looking up from the water. “The river isn’t.”',
  'She set the ledger down where she had found it. Somewhere upstream a bell counted the tide, one stroke slower than the hour.',
  '“Then I’ll wait,” she said.',
];
export const reader = { eyebrow: 'Chapter 4 of 22', title: 'The Ferryman’s Ledger' };

// Reader appearance
export const appearancePhone: ReaderAppearanceValue = { size: 21, theme: 'dark', font: 'serif', spacing: 1.7, dimAura: false };
export const appearanceTablet: ReaderAppearanceValue = { size: 23, theme: 'dark', font: 'serif', spacing: 1.7, dimAura: false };
export const extrasPhone: ReaderExtras = { followNarration: true, keepScreenOn: true, pageWidth: 'wide' };

/** A fixed "now" so times and the sleep timer read the same every time: 1 Oct 2026, 10:00 local. */
export const NOW = new Date(2026, 9, 1, 10, 0).getTime();

// Sleep timer: 30 minutes chosen just now
export const sleep30: SleepTimer = { kind: 'minutes', minutes: 30, endsAt: NOW + 30 * 60_000 };

// Speed
export const speed = 1.25;

// Chapters: 3 on this device, the one being listened to, one in progress, the rest not yet
export const chapters: SheetChapter[] = [
  ['ch1', 'Ash on the Water', 'on_device'],
  ['ch2', 'What the Ledger Owes', 'on_device'],
  ['ch3', 'A Debt in Salt', 'on_device'],
  ['ch4', 'The Ferryman’s Ledger', 'ready', 4310],
  ['ch5', 'Quiet Tolls', 'ready'],
  ['ch6', 'The Long Dry Month', 'ready'],
  ['ch7', 'Ledger Day', 'making'],
  ['ch8', 'Salt Tithe', 'not_yet'],
  ['ch9', 'A Small Weather', 'not_yet'],
].map(([id, title, audio, words], i) => ({
  id: id as string,
  title: title as string,
  index: i,
  storyNumber: i + 1,
  matter: false,
  audio: audio as SheetChapter['audio'],
  words: (words as number | undefined) ?? 3900,
}));

/** The same book with a cover note and acknowledgements, for the matter filter. */
export const chaptersWithMatter: SheetChapter[] = [
  { id: 'front', title: 'Cover note', index: 0, storyNumber: null, matter: true, audio: 'ready', words: 410 },
  ...chapters.map((c) => ({ ...c, index: c.index + 1 })),
  { id: 'back', title: 'Acknowledgements', index: 10, storyNumber: null, matter: true, audio: 'not_yet', words: 520 },
];

// Search: "ferryman", 7 passages, 4 shown
const hit = (line: string, start: number, before: string, after: string, ch: string): SearchHitInput => ({ chapter_id: ch, line_id: line, start, end: start + 8, before, match: 'ferryman', after });
export const searchHits: SearchResultRow[] = [
  hitToRow(hit('l-1-3', 2310, '“Nobody crosses without the ', '’s leave.”', 'ch1'), 'Chapter 1', 'Passage 3'),
  hitToRow(hit('l-4-12', 640, '“You are early,” the ', ' said, without looking up.', 'ch4'), 'Chapter 4', 'Passage 12'),
  hitToRow(hit('l-4-14', 1180, '“Wait for what?” the ', ' asked.', 'ch4'), 'Chapter 4', 'Passage 14'),
  hitToRow(hit('l-7-2', 220, 'She had not seen the ', ' since the flood.', 'ch7'), 'Chapter 7', 'Passage 2'),
];

// Place conflict: this phone at chapter 4, the iPad at chapter 9
export const conflict: PlaceConflictInfo = {
  mine: { chapterTitle: 'The Ferryman’s Ledger', chapterIndex: 3, progress: 0.34, deviceName: 'This phone', updatedAt: NOW - 3 * 60_000, mode: 'listen' },
  theirs: { chapterTitle: 'Salt Tithe', chapterIndex: 8, progress: 0.71, deviceName: 'Nick’s iPad', updatedAt: new Date(2026, 8, 30, 21, 40).getTime(), mode: 'listen' },
};

// End of book
export const endOfBook = {
  summary: 'Chapter 22 of 22 · listened over 9 days',
  next: { title: 'Hollow Tide' },
  missingVolume: 'Volume 3 of The Ashmark Cycle is not in your library.',
};

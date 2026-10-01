// Fixtures for the book page boards (BookTop, BookChapters, BookRunning, BookTablet, PlanFree). Original,
// synthetic titles; the names are the boards' own. The chapter rows go through the same functions the
// connected screen uses.
import { chapterRows, readyText, deviceText, otherLine, shortList, type ChapterAudio, type ChapterInfo } from '../lib/bookAudio';
import type { AudiobookCardModel, BookHeaderModel, ChaptersModel, MakeSheetModel, OtherAudiobookModel } from '../views/book/types';

export const header: BookHeaderModel = {
  title: 'The Ash Ledger',
  author: 'Odile Brandt',
  seriesLine: 'The Ashmark Cycle · Volume 2',
  meta: '22 chapters · 74,200 words',
  color: '#c65a43',
};

const titles = [
  'Ash on the Water',
  'What the Ledger Owes',
  'A Debt in Salt',
  'The Ferryman’s Ledger',
  'Quiet Tolls',
  'The Long Dry Month',
  'Ledger Day',
  'Salt Tithe',
  'The Lamp Hours',
  'Low Water',
  'A Season of Rope',
  'Smoke Over the Weir',
  'The Quartermaster’s Hand',
  'Tallow and Tin',
  'What the River Kept',
  'Ninefold Gate',
  'The Counting House',
  'Old Wages',
  'Ink Without Name',
  'The Last Barge',
  'Settling the Account',
  'Ash on the Water, Again',
];

export const chapters: ChapterInfo[] = titles.map((title, i) => ({ id: `c${i + 1}`, title, kind: 'story' }));
/** The ferryman's chapter: where the listener is. */
export const currentId = 'c4';
export const progress = 0.34;

const ready = (id: string): [string, ChapterAudio] => [id, { state: 'ready' }];
/** Chapters 1 to 6 are ready, and two later ones: 8 of 22. */
export const audio = new Map<string, ChapterAudio>([...['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c9', 'c10'].map(ready)]);
/** Chapters 1 to 3 are held on this device. */
export const held = new Set(['c1', 'c2', 'c3']);

export const audioRunning = new Map<string, ChapterAudio>([...audio, ['c6', { state: 'making' }]]);
audioRunning.set('c6', { state: 'making' });

const rowsFor = (a: Map<string, ChapterAudio>, list: ChapterInfo[] = chapters) => chapterRows({ chapters: list, audio: a, held, currentId, progress });

/** BookTop: a few rows from the chapter the listener is in, and "Show all 22 chapters". */
export function shortChapters(a = audio): ChaptersModel {
  const s = shortList(rowsFor(a), false);
  return { rows: s.rows, more: s.more, total: s.total, hasMatter: false, storyOnly: false };
}

/** BookChapters and BookTablet: the first eight rows, nothing hidden. */
export function allChapters(): ChaptersModel {
  const first8 = chapters.slice(0, 8);
  const s = shortList(rowsFor(audio, first8), true);
  return { rows: s.rows, more: false, total: s.total, hasMatter: false, storyOnly: false };
}

export const samantha: AudiobookCardModel = {
  id: 'ab-samantha',
  voice: 'Samantha',
  tier: 'free',
  sourceLine: 'Mac voice · on your Bardic computer',
  readyText: readyText({ ready: 8, total: 22 }),
  deviceText: deviceText(3),
  ready: 0.36,
  canMakeReady: true,
};

export const samanthaRunning: AudiobookCardModel = {
  ...samantha,
  running: {
    label: 'Making it ready',
    tone: 'making',
    countText: '9 of 22 chapters',
    ready: 0.55,
    done: 0.41,
    note: 'About 22 min left. You can listen while it works.',
    paused: false,
    canPause: true,
    canResume: false,
  },
};

export const kore: OtherAudiobookModel = { id: 'ab-kore', voice: 'Kore', tier: 'premium', line: otherLine(13, 22, 1) };
export const koreTablet: OtherAudiobookModel = { id: 'ab-kore', voice: 'Kore', tier: 'premium', line: otherLine(13, 22, 0) };

export const makeSheet: MakeSheetModel = {
  eyebrow: 'Samantha · free',
  options: [
    { id: 'whole', title: 'Whole book', detail: '22 chapters · none ready yet' },
    { id: 'from', title: 'From chapter 4', detail: '19 chapters · none ready yet' },
  ],
  selected: 'whole',
  toMake: '14 chapters',
  time: 'About 25 min, in the background',
  space: 'About 160 MB on the server',
};

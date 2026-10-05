// Fixtures for the Home, Library, Add and Manage boards. Original, synthetic titles; the names are the boards' own.
import { formatBytes } from '../lib/bytes';
import type { FileInfo } from '../state/imports';
import type { BookCardModel, ContinueModel, ExistingBookModel, ListenerModel, ManageBookModel, SeriesModel } from '../views/library/types';

export const listener: ListenerModel = { name: 'Nick', hue: 38 };

export const colors = {
  ash: '#c65a43',
  lantern: '#3f6f8f',
  hollow: '#4c7a5a',
  salt: '#8a5a34',
  weather: '#6b5a8c',
  winter: '#4a5568',
  sparrow: '#7a3e5e',
};

export const continueAsh: ContinueModel = {
  id: 'ash',
  title: 'The Ash Ledger',
  color: colors.ash,
  progress: 0.34,
  chapterLine: 'Chapter 4 · The Ferryman’s Ledger',
  detail: '34% · 6 min ahead',
};

export const miniPlayer = {
  title: 'The Ash Ledger',
  detail: 'Ch. 4 · 6 min ahead',
  color: colors.ash,
  progress: 0.34,
  speed: '1.25×',
};

export const homeOnDevice: BookCardModel[] = [
  { id: 'ash', title: 'The Ash Ledger', subtitle: '34%', color: colors.ash, progress: 0.34, onDevice: true },
  { id: 'lantern', title: 'Lanternfall', subtitle: 'Odile Brandt', color: colors.lantern, onDevice: true },
  { id: 'hollow', title: 'Hollow Tide', subtitle: 'Odile Brandt', color: colors.hollow, onDevice: true },
];

export const homeRecent: BookCardModel[] = [
  { id: 'salt', title: 'The Salt Road', subtitle: 'Tamsin Hale', color: colors.salt },
  { id: 'weather', title: 'A Small Weather', subtitle: 'Jonah Pryce', color: colors.weather },
  { id: 'winter', title: 'Winterhouse Letters', subtitle: 'R. K. Osei', color: colors.winter },
];

const rest: BookCardModel[] = [
  { id: 'salt', title: 'The Salt Road', subtitle: 'Tamsin Hale', color: colors.salt },
  { id: 'weather', title: 'A Small Weather', subtitle: 'Jonah Pryce', color: colors.weather },
  { id: 'winter', title: 'Winterhouse Letters', subtitle: 'R. K. Osei', color: colors.winter },
  { id: 'sparrow', title: 'Copper Sparrow', subtitle: 'Lin Marchetti', color: colors.sparrow },
];

export const libraryBooks: BookCardModel[] = [
  { id: 'lantern', title: 'Lanternfall', subtitle: 'Vol. 1', color: colors.lantern, onDevice: true },
  { id: 'ash', title: 'The Ash Ledger', subtitle: 'Vol. 2', color: colors.ash, progress: 0.34, onDevice: true },
  { id: 'hollow', title: 'Hollow Tide', subtitle: 'Vol. 4', color: colors.hollow, onDevice: true },
  ...rest,
];

export const libraryBooksTablet: BookCardModel[] = [
  ...libraryBooks,
  { id: 'sample', title: 'Lanternfall', subtitle: 'Sample', color: colors.lantern },
];

/** Behind the duplicate sheet the library shows only three books. */
export const libraryBooksDuplicate: BookCardModel[] = [
  libraryBooks[0]!,
  libraryBooks[1]!,
  { id: 'hollow', title: 'Hollow Tide', subtitle: 'Odile Brandt', color: colors.hollow },
];

export const existingAsh: ExistingBookModel = {
  id: 'ash',
  title: 'The Ash Ledger',
  color: colors.ash,
  detail: 'Added 12 March · 34% listened',
  removed: false,
};

export const importFile: FileInfo = { name: 'the-ash-ledger.epub', size: 2_400_000, kind: 'EPUB' };
export const importFileMeta = `${formatBytes(importFile.size)} · EPUB`;

export const manageBooks: ManageBookModel[] = [
  { id: 'lantern', title: 'Lanternfall', author: 'Odile Brandt', color: colors.lantern, chapters: 24, seriesName: 'The Ashmark Cycle', seriesOrder: '1' },
  { id: 'ash', title: 'The Ash Ledger', author: 'Odile Brandt', color: colors.ash, chapters: 22, seriesName: 'The Ashmark Cycle', seriesOrder: '2' },
  { id: 'hollow', title: 'Hollow Tide', author: 'Odile Brandt', color: colors.hollow, chapters: 26, seriesName: 'The Ashmark Cycle', seriesOrder: '4' },
];

export const manageSeries: SeriesModel[] = [
  {
    name: 'The Ashmark Cycle',
    summary: '3 of 4 volumes',
    volumes: [
      { order: 1, title: 'Lanternfall', available: true },
      { order: 2, title: 'The Ash Ledger', available: true },
      { order: 3, title: 'Volume 3', available: false },
      { order: 4, title: 'Hollow Tide', available: true },
    ],
  },
];

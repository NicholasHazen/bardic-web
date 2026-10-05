// View models: what the presentational screens take. The connected components build them from API data
// (src/state/library.ts); the board views build them from src/fixtures/library.ts.

export interface ListenerModel {
  name: string;
  /** Avatar hue, 0 to 359; derived from the name when omitted. */
  hue?: number;
}

export interface BookCardModel {
  id: string;
  title: string;
  /** Author, or "Vol. 2" inside a series. */
  subtitle?: string;
  /** Cover colour (the sample's hex, or a generated colour). */
  color: string;
  coverSrc?: string;
  /** 0 to 1; shown as a bar when the listener has started the book. */
  progress?: number;
  /** A downloaded audiobook is held on this device. */
  onDevice?: boolean;
  /** An import that is still running or has failed (shown as an "Adding" tile). */
  adding?: boolean;
  href?: string;
}

export interface ContinueModel {
  id: string;
  title: string;
  color: string;
  coverSrc?: string;
  /** 0 to 1 */
  progress: number;
  /** "Chapter 4 · The Ferryman’s Ledger"; absent while the chapter is not known yet. */
  chapterLine?: string;
  /** "34% · 6 min ahead"; the time ahead is left out when it is not known. */
  detail: string;
  href?: string;
}

export type LibraryFilter = 'all' | 'in_progress' | 'on_device' | 'not_started' | 'finished';
export type LibrarySort = 'recent' | 'title' | 'author' | 'added';

export const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'on_device', label: 'On this device' },
  { id: 'not_started', label: 'Not started' },
  { id: 'finished', label: 'Finished' },
];

export const SORTS: { id: LibrarySort; label: string }[] = [
  { id: 'recent', label: 'Recently read' },
  { id: 'title', label: 'Title' },
  { id: 'author', label: 'Author' },
  { id: 'added', label: 'Recently added' },
];

/** The duplicate sheet's subject: the book already in the library. */
export interface ExistingBookModel {
  id: string;
  title: string;
  color: string;
  coverSrc?: string;
  /** "Added 12 March · 34% listened" */
  detail: string;
  removed: boolean;
}

export interface ManageBookModel {
  id: string;
  title: string;
  author: string;
  color: string;
  coverSrc?: string;
  /** "24 ch" */
  chapters: number;
  seriesName: string;
  seriesOrder: string;
}

export interface SeriesVolumeModel {
  order: number;
  title: string;
  available: boolean;
}

export interface SeriesModel {
  name: string;
  /** "3 of 4 volumes" */
  summary: string;
  volumes: SeriesVolumeModel[];
}

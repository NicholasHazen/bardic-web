// View models of the book page: what the presentational screens take. The connected screen builds them
// from API data (src/state/book.ts); the board views build them from src/fixtures/book.ts.
import type { BadgeTone, ChapterRowModel, RunningModel } from '../../lib/bookAudio';

export type { ChapterRowModel, RunningModel };

export interface BookHeaderModel {
  title: string;
  author: string;
  /** "The Ashmark Cycle · Volume 2" */
  seriesLine?: string;
  /** "22 chapters · 74,200 words" */
  meta: string;
  color: string;
  coverSrc?: string;
}

export interface AudiobookCardModel {
  id: string;
  voice: string;
  tier: 'free' | 'premium';
  /** "Mac voice · on your Bardic computer" */
  sourceLine: string;
  /** "8 of 22 chapters ready" */
  readyText: string;
  /** "3 on this device" */
  deviceText: string;
  /** What is ready, 0 to 1. */
  ready: number;
  /** Set while a job makes it ready. */
  running?: RunningModel;
  /** Make ready would have something to make. */
  canMakeReady: boolean;
}

export interface OtherAudiobookModel {
  id: string;
  voice: string;
  tier: 'free' | 'premium';
  line: string;
}

export interface ChaptersModel {
  rows: ChapterRowModel[];
  /** "Show all 22 chapters": more rows exist than are shown. */
  more: boolean;
  total: number;
  /** The book has front or back matter, so the filter is offered. */
  hasMatter: boolean;
  /** Front and back matter are left out. */
  storyOnly: boolean;
}

export interface MakeSheetModel {
  /** "Samantha · free" */
  eyebrow: string;
  options: { id: string; title: string; detail: string }[];
  selected: string;
  /** "14 chapters" */
  toMake: string;
  /** "About 25 min, in the background" */
  time: string;
  /** "About 160 MB on the server" */
  space: string;
  /** Nothing to make: Start is off. */
  nothingToMake?: boolean;
  busy?: boolean;
  error?: string;
}

export const tierTone = (tier: 'free' | 'premium'): BadgeTone => (tier === 'free' ? 'ready' : 'paid');
export const tierText = (tier: 'free' | 'premium') => (tier === 'free' ? 'Free' : 'Premium');

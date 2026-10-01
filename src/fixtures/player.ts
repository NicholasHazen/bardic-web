// Fixtures for the Now Playing boards (B1Listen, B1Read, B1ReadControls, BarExpanded, ReadAway,
// B1Tablet, B1TabletListen, B1TabletRead). Original synthetic text; the names are the boards' own.
import { cpLength } from '../lib/codepoints';
import type { PlayerState, ReaderAppearance, TextLine } from '../player/types';
import { chapters as bookChapters } from './book';

/** Build a chapter's text and its line ranges (code points) from paragraphs of lines. */
export function buildChapter(paragraphs: string[][]): { text: string; lines: TextLine[] } {
  const lines: TextLine[] = [];
  let text = '';
  let at = 0;
  let n = 0;
  paragraphs.forEach((p, pi) => {
    p.forEach((l, li) => {
      if (li > 0) {
        text += ' ';
        at += 1;
      }
      const len = cpLength(l);
      lines.push({ id: `l${++n}`, start: at, end: at + len });
      text += l;
      at += len;
    });
    if (pi < paragraphs.length - 1) {
      text += '\n\n';
      at += 2;
    }
  });
  return { text, lines };
}

/** The four lines the boards show: one line per paragraph. */
export const boardChapter = buildChapter([
  ['The ferry kept no hours, only a lantern on a post and a ledger under a stone. Nessa read the last entry twice before she trusted it.'],
  ['“You are early,” the ferryman said, without looking up from the water. “The river isn’t.”'],
  ['She set the ledger down where she had found it. Somewhere upstream a bell counted the tide, one stroke slower than the hour.'],
  ['“Then I’ll wait,” she said.'],
]);

/** A longer chapter with several lines in each paragraph, for scrolling and following. */
export const longChapter = buildChapter([
  [
    'The ferry kept no hours, only a lantern on a post and a ledger under a stone.',
    'Nessa read the last entry twice before she trusted it.',
    'The ink had run where a wet thumb had rested.',
  ],
  [
    '“You are early,” the ferryman said, without looking up from the water.',
    '“The river isn’t.”',
  ],
  [
    'She set the ledger down where she had found it.',
    'Somewhere upstream a bell counted the tide, one stroke slower than the hour.',
    'A heron lifted from the reeds and did not look back.',
  ],
  ['“Then I’ll wait,” she said.'],
  [
    'The ferryman laughed, a short dry sound like a latch.',
    '“Everyone does, at first.”',
    'He pushed the pole into the mud and leaned on it as though the river might change its mind.',
  ],
  [
    'The lantern guttered once. Down the bank the water slid past the pilings without a sound.',
    'Nessa counted the strokes of the bell and found it had missed one.',
  ],
  [
    'By the time the far shore showed its first light, the ledger had a new line in it.',
    'She did not remember writing it.',
  ],
]);

export const colors = { ash: '#c65a43' };

const chapterRows: PlayerState['chapters'] = bookChapters.map((c, i) => ({
  id: c.id,
  title: c.title,
  index: i,
  storyNumber: i + 1,
  matter: false,
  audio: i < 3 ? 'on_device' : i === 3 ? 'ready' : i === 4 ? 'making' : 'not_yet',
}));

/** The Ash Ledger, chapter 4, playing at 4:12, 34% of the book. */
export const nowPlayingState: PlayerState = {
  loaded: true,
  book: { id: 'ash', title: 'The Ash Ledger', author: 'Odile Brandt', coverColor: colors.ash },
  chapter: { id: 'c4', index: 3, total: 22, storyNumber: 4, storyTotal: 22, title: 'The Ferryman’s Ledger', matter: false },
  voice: { id: 'samantha', name: 'Samantha', tier: 'free' },
  audiobookId: 'ab-ash-samantha',
  listening: 'playing',
  detail: '6 min ahead',
  needsYou: null,
  playing: true,
  position: 252,
  duration: 741,
  aheadSeconds: 360,
  bookProgress: 0.34,
  remainingSeconds: 12 * 3600 + 20 * 60,
  speed: 1.25,
  sleep: { kind: 'off' },
  mode: 'listen',
  text: boardChapter.text,
  lines: boardChapter.lines,
  timings: [],
  currentLineId: 'l2',
  chapters: chapterRows,
  conflict: null,
  finishedBook: false,
  placeSync: 'saved',
};

export const nowPlayingRead: PlayerState = { ...nowPlayingState, mode: 'read' };

/** The same listen in each of the other three states. */
export const gettingReady: PlayerState = { ...nowPlayingState, listening: 'getting_ready', detail: 'First audio in about 10 s', playing: false };
export const waiting: PlayerState = { ...nowPlayingState, listening: 'waiting', detail: 'Continues in about 40 s' };
export const needsYou: PlayerState = {
  ...nowPlayingState,
  listening: 'needs_you',
  detail: null,
  playing: false,
  needsYou: {
    code: 'limit_exceeded',
    text: 'Finished chapters are kept. The plan reached its limit of $2.00.',
    action: { label: 'Choose what to do', route: '#/book/ash' },
  },
};

/** Reader appearance on the phone and tablet boards (the guide's reading sizes, about 1.7 line spacing). */
export const appearancePhone: ReaderAppearance = { size: 21, theme: 'dark', font: 'serif', spacing: 1.72, dimAura: true };
export const appearanceLandscape: ReaderAppearance = { size: 23, theme: 'dark', font: 'serif', spacing: 1.7, dimAura: true };
export const appearancePortrait: ReaderAppearance = { size: 23, theme: 'dark', font: 'serif', spacing: 1.72, dimAura: true };

/** Line 4 carries the dotted underline on the boards. */
export const markedLines = ['l4'];

/** The portrait Listen board's byline: author and series. */
export const byline = 'Odile Brandt · The Ashmark Cycle, Volume 2';

// The chapter list of the Chapters sheet: which rows show and the one audio word of each.
import { AUDIO_WORD_TEXT, AUDIO_WORD_TONE, type AudioWord, type BadgeTone } from '../../lib/bookAudio';
import type { PlayerState } from '../../player/types';
import { chapterMetricsText, chapterProgressText } from '../../lib/chapterMetrics';

/** A row of `PlayerState.chapters`, plus the word count the board shows when the engine knows it. */
export type SheetChapter = PlayerState['chapters'][number] & { words?: number | null };

export interface ChapterRowView {
  id: string;
  /** "4", or "–" for front and back matter */
  number: string;
  title: string;
  /** "4,310 words"; null when not known (never shown as 0) */
  detail: string | null;
  progressText?: string;
  current: boolean;
  matter: boolean;
  word: AudioWord;
  wordText: string;
  tone: BadgeTone;
}

export function wordsText(words: number | null | undefined): string | null {
  if (words == null || !Number.isFinite(words) || words < 0) return null;
  return `${Math.round(words).toLocaleString('en-US')} ${Math.round(words) === 1 ? 'word' : 'words'}`;
}

/** Story only hides front and back matter, but the chapter the listener is in always stays so the list shows where they are. */
export function visibleChapters<T extends { id: string; matter: boolean }>(rows: readonly T[], storyOnly: boolean, currentId: string | null): T[] {
  return storyOnly ? rows.filter((r) => !r.matter || r.id === currentId) : [...rows];
}

export function hasMatter(rows: readonly { matter: boolean }[]): boolean {
  return rows.some((r) => r.matter);
}

/** Chapters without audio: the "Make the rest ready" button is offered when there is something to make. */
export function chaptersToMake(rows: readonly { audio: string }[]): number {
  return rows.filter((r) => r.audio === 'not_yet').length;
}

export function chapterRows(rows: readonly SheetChapter[], currentId: string | null, storyOnly: boolean, chapterOffset?: number): ChapterRowView[] {
  return visibleChapters(rows, storyOnly, currentId).map((r) => {
    const word: AudioWord = r.audio;
    const current = r.id === currentId;
    return {
      id: r.id,
      number: r.storyNumber != null ? String(r.storyNumber) : '–',
      title: r.title,
      detail: chapterMetricsText({ wordCount: r.wordCount ?? r.words, pageCount: r.pageCount, durationSeconds: r.durationSeconds }) ?? null,
      progressText: current ? chapterProgressText(chapterOffset, r.textLength) : undefined,
      current,
      matter: r.matter,
      word,
      wordText: AUDIO_WORD_TEXT[word],
      // the chapter you are in keeps the accent tone of the board when it can play
      tone: current && (word === 'ready' || word === 'on_device') ? 'here' : AUDIO_WORD_TONE[word],
    };
  });
}

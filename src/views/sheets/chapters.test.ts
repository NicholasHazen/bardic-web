import { describe, expect, it } from 'vitest';
import { chapterRows, chaptersToMake, hasMatter, visibleChapters, wordsText, type SheetChapter } from './chapters';

const rows: SheetChapter[] = [
  { id: 'f', title: 'Cover note', index: 0, storyNumber: null, matter: true, audio: 'ready' },
  { id: 'a', title: 'Ash', index: 1, storyNumber: 1, matter: false, audio: 'on_device', words: 3900 },
  { id: 'b', title: 'Ledger', index: 2, storyNumber: 2, matter: false, audio: 'ready', words: 4310 },
  { id: 'c', title: 'Salt', index: 3, storyNumber: 3, matter: false, audio: 'making' },
  { id: 'd', title: 'Weather', index: 4, storyNumber: 4, matter: false, audio: 'not_yet' },
  { id: 'z', title: 'Thanks', index: 5, storyNumber: null, matter: true, audio: 'not_yet' },
];

describe('visibleChapters', () => {
  it('hides front and back matter when asked', () => {
    expect(visibleChapters(rows, true, 'b').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(visibleChapters(rows, false, 'b')).toHaveLength(6);
  });
  it('keeps the matter chapter the listener is in', () => {
    expect(visibleChapters(rows, true, 'z').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'z']);
  });
  it('knows whether there is matter', () => {
    expect(hasMatter(rows)).toBe(true);
    expect(hasMatter(rows.filter((r) => !r.matter))).toBe(false);
  });
});

describe('chapterRows', () => {
  const view = chapterRows(rows, 'b', true);
  it('gives each row one audio word', () => {
    expect(view.map((r) => r.wordText)).toEqual(['On this device', 'Ready', 'Making', 'Not yet']);
    expect(view.map((r) => r.number)).toEqual(['1', '2', '3', '4']);
  });
  it('marks the current chapter and gives it the accent tone when it can play', () => {
    expect(view.filter((r) => r.current).map((r) => r.id)).toEqual(['b']);
    expect(view[1]!.tone).toBe('here');
    expect(view[0]!.tone).toBe('ready');
    expect(view[3]!.tone).toBe('idle');
  });
  it('keeps the tone of a current chapter that cannot play yet', () => {
    expect(chapterRows(rows, 'c', true)[2]!.tone).toBe('making');
  });
  it('shows a dash for matter and leaves unknown words out', () => {
    const all = chapterRows(rows, null, false);
    expect(all[0]!.number).toBe('–');
    expect(all[3]!.detail).toBeNull();
    expect(all[1]!.detail).toBe('3,900 words');
  });
  it('shows source pages, recorded audio duration and text progress alongside the audio word', () => {
    const chapter: SheetChapter = { ...rows[4]!, wordCount: 200, pageCount: 2, textLength: 1000, durationSeconds: 120 };
    const [row] = chapterRows([chapter], chapter.id, false, 250);
    expect(row).toMatchObject({ detail: '200 words · 2 pages · 2 min audio', progressText: '25% through chapter', wordText: 'Not yet', current: true });
  });
  it('shows progress only for the current chapter, leaving missing pagination and duration out', () => {
    const chapters: SheetChapter[] = rows.map((r) => ({ ...r, textLength: 100 }));
    const view = chapterRows(chapters, 'b', false, 50);
    expect(view.filter((r) => r.progressText).map((r) => r.id)).toEqual(['b']);
    expect(view[2]!.detail).toBe('4,310 words');
    expect(view[2]!.progressText).toBe('50% through chapter');
  });
});

describe('numbers', () => {
  it('counts chapters to make', () => {
    expect(chaptersToMake(rows)).toBe(2);
  });
  it('writes words, never zero for unknown', () => {
    expect(wordsText(null)).toBeNull();
    expect(wordsText(undefined)).toBeNull();
    expect(wordsText(1)).toBe('1 word');
    expect(wordsText(74200)).toBe('74,200 words');
  });
});

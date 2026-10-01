import { describe, expect, it } from 'vitest';
import type { ChapterInfo } from '../../player/types';
import {
  audioWord,
  barDetail,
  capsuleLabel,
  chapterLabel,
  chapterLine,
  formatBookRemaining,
  formatClock,
  listeningPill,
  liveAnnouncement,
  percent,
  remainingLine,
  scrubFraction,
  secondsAt,
  sleepCaption,
  speedLabel,
  stepSpeed,
  spokenBookRemaining,
  upNext,
} from './nowPlaying';

const ch = (over: Partial<ChapterInfo> = {}): ChapterInfo => ({
  id: 'c4', index: 3, total: 22, storyNumber: 4, storyTotal: 22, title: 'The Ferryman’s Ledger', matter: false, ...over,
});

describe('clock formatting', () => {
  it('writes m:ss and h:mm:ss', () => {
    expect(formatClock(252)).toBe('4:12');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(3599.9)).toBe('59:59');
    expect(formatClock(3725)).toBe('1:02:05');
  });
  it('reads missing or negative input as zero', () => {
    expect(formatClock(null)).toBe('0:00');
    expect(formatClock(undefined)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });
  it('writes the time left in the book with a tilde, hours and minutes from an hour up', () => {
    expect(formatBookRemaining(12 * 3600 + 20 * 60)).toBe('~12:20');
    expect(formatBookRemaining(3600)).toBe('~1:00');
    expect(formatBookRemaining(5 * 60 + 9)).toBe('~5:09');
  });
  it('never shows an unknown time left as zero', () => {
    expect(formatBookRemaining(null)).toBeNull();
    expect(formatBookRemaining(undefined)).toBeNull();
    expect(formatBookRemaining(-1)).toBeNull();
    expect(remainingLine(null, 0.34)).toBe('34% of book');
  });
  it('says the time left aloud', () => {
    expect(spokenBookRemaining(12 * 3600 + 20 * 60)).toBe('about 12 hours 20 minutes left in the book');
    expect(spokenBookRemaining(3600)).toBe('about 1 hour left in the book');
    expect(spokenBookRemaining(60)).toBe('about 1 minute left in the book');
    expect(spokenBookRemaining(null)).toBeNull();
  });
});

describe('progress', () => {
  it('rounds and clamps the percentage', () => {
    expect(percent(0.34)).toBe(34);
    expect(percent(0.3449)).toBe(34);
    expect(percent(1.4)).toBe(100);
    expect(percent(-1)).toBe(0);
    expect(percent(Number.NaN)).toBe(0);
  });
  it('writes the right-hand line of the scrubber and the capsule label', () => {
    expect(remainingLine(44400, 0.34)).toBe('~12:20 · 34% of book');
    expect(capsuleLabel(252, 0.34)).toBe('4:12 · 34%');
  });
  it('maps the scrubber to seconds inside the chapter', () => {
    expect(scrubFraction(252, 741)).toBeCloseTo(0.34, 2);
    expect(scrubFraction(10, 0)).toBe(0);
    expect(scrubFraction(900, 741)).toBe(1);
    expect(secondsAt(0.5, 600)).toBe(300);
    expect(secondsAt(2, 600)).toBe(600);
    expect(secondsAt(0.5, 0)).toBeNull();
  });
});

describe('labels', () => {
  it('counts story chapters', () => {
    expect(chapterLabel(ch())).toBe('Chapter 4 of 22');
    expect(chapterLine(ch())).toBe('Chapter 4 · The Ferryman’s Ledger');
    expect(chapterLabel(null)).toBe('');
  });
  it('gives matter no number', () => {
    const m = ch({ storyNumber: null, matter: true, title: 'Title page' });
    expect(chapterLabel(m)).toBe('Front or back matter');
    expect(chapterLine(m)).toBe('Title page');
  });
  it('writes speeds', () => {
    expect(speedLabel(1.25)).toBe('1.25×');
    expect(speedLabel(1)).toBe('1×');
    expect(speedLabel(1.5)).toBe('1.5×');
    expect(speedLabel(0.75)).toBe('0.75×');
    expect(speedLabel(1.7500001)).toBe('1.75×');
  });
  it('captions the sleep button with what is running', () => {
    expect(sleepCaption({ kind: 'off' }, 0)).toBe('Sleep');
    expect(sleepCaption({ kind: 'end_of_chapter' }, 0)).toBe('Chapter end');
    expect(sleepCaption({ kind: 'minutes', minutes: 15, endsAt: 12 * 60000 }, 0)).toBe('12 min');
    expect(sleepCaption({ kind: 'minutes', minutes: 15, endsAt: 5000 }, 0)).toBe('1 min');
  });
});

describe('listening states', () => {
  it('uses exactly the four words and tones', () => {
    expect(listeningPill('playing', '6 min ahead')).toMatchObject({ word: 'Playing', tone: 'here', detail: '6 min ahead' });
    expect(listeningPill('getting_ready', 'First audio in about 10 s')).toMatchObject({ word: 'Getting ready', tone: 'making' });
    expect(listeningPill('waiting', 'Continues in about 40 s')).toMatchObject({ word: 'Waiting', tone: 'paid' });
    expect(listeningPill('needs_you', null)).toMatchObject({ word: 'Needs you', tone: 'failed', detail: null });
  });
  it('says nothing when there is nothing to say', () => {
    expect(listeningPill(null, 'ignored')).toBeNull();
    expect(liveAnnouncement(null)).toBe('');
  });
  it('puts what is kept first for Needs you', () => {
    const p = listeningPill('needs_you', 'other', { code: 'limit_exceeded', text: 'Finished chapters are kept. The plan reached its limit.' });
    expect(p?.detail).toBe('Finished chapters are kept. The plan reached its limit.');
  });
  it('announces word and detail', () => {
    expect(liveAnnouncement(listeningPill('playing', '6 min ahead'))).toBe('Playing. 6 min ahead');
    expect(liveAnnouncement(listeningPill('waiting', ' '))).toBe('Waiting');
  });
  it('words the bar', () => {
    const base = { chapter: ch(), detail: '6 min ahead', playing: true, bookProgress: 0.34 };
    expect(barDetail({ ...base, listening: 'playing' })).toBe('Ch. 4 · 6 min ahead');
    expect(barDetail({ ...base, listening: 'getting_ready' })).toBe('Ch. 4 · Getting ready');
    expect(barDetail({ ...base, listening: null, playing: false })).toBe('Ch. 4 · 34%');
    expect(barDetail({ ...base, listening: 'playing', detail: null })).toBe('Ch. 4 · Playing');
    expect(barDetail({ ...base, chapter: null, listening: 'waiting' })).toBe('Waiting');
  });
});

describe('up next', () => {
  const list = [
    { id: 'a', title: 'A', index: 0, storyNumber: null, matter: true, audio: 'ready' as const },
    { id: 'b', title: 'B', index: 1, storyNumber: 1, matter: false, audio: 'on_device' as const },
    { id: 'c', title: 'C', index: 2, storyNumber: 2, matter: false, audio: 'making' as const },
    { id: 'd', title: 'D', index: 3, storyNumber: null, matter: true, audio: 'not_yet' as const },
    { id: 'e', title: 'E', index: 4, storyNumber: 3, matter: false, audio: 'not_yet' as const },
  ];
  it('lists the chapters after the current one with the status words', () => {
    expect(upNext(list, 'b')).toEqual([
      { id: 'c', number: '2', title: 'C', word: 'Making' },
      { id: 'e', number: '3', title: 'E', word: 'Not yet' },
    ]);
  });
  it('is empty when the current chapter is unknown or last', () => {
    expect(upNext(list, 'zzz')).toEqual([]);
    expect(upNext(list, 'e')).toEqual([]);
    expect(upNext(list, 'b', 1)).toHaveLength(1);
  });
  it('knows the four audio words', () => {
    expect(['ready', 'on_device', 'making', 'not_yet'].map((a) => audioWord(a as never))).toEqual(['Ready', 'On this device', 'Making', 'Not yet']);
  });
});

describe('speed steps', () => {
  it('moves along the list and stops at the ends', () => {
    expect(stepSpeed(1.25, 1)).toBe(1.5);
    expect(stepSpeed(1.25, -1)).toBe(1);
    expect(stepSpeed(2, 1)).toBe(2);
    expect(stepSpeed(0.75, -1)).toBe(0.75);
    expect(stepSpeed(1.1, 1)).toBe(1.25);
    expect(stepSpeed(1.1, -1)).toBe(1);
  });
});

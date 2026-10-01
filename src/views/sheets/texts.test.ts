import { describe, expect, it } from 'vitest';
import type { PlaceConflictInfo } from '../../player/types';
import { choiceLabel, firstAudioText, percentOf, placeCards, placeLine } from './texts';

describe('firstAudioText', () => {
  it('says seconds, then minutes, and nothing for unknown', () => {
    expect(firstAudioText(10)).toBe('First audio in about 10 seconds.');
    expect(firstAudioText(3)).toBe('First audio in a few seconds.');
    expect(firstAudioText(47)).toBe('First audio in about 45 seconds.');
    expect(firstAudioText(150)).toBe('First audio in about 3 minutes.');
    expect(firstAudioText(null)).toBeNull();
    expect(firstAudioText(Number.NaN)).toBeNull();
  });
});

const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime();
const NOW = at(1, 10, 0);
const conflict: PlaceConflictInfo = {
  mine: { chapterTitle: 'The Ferryman’s Ledger', chapterIndex: 3, progress: 0.34, deviceName: 'This phone', updatedAt: NOW - 3 * 60_000, mode: 'listen' },
  theirs: { chapterTitle: 'Salt Tithe', chapterIndex: 8, progress: 0.71, deviceName: 'Nick’s iPad', updatedAt: at(0, 21, 40), mode: 'read' },
};

const by = (cards: ReturnType<typeof placeCards>, who: 'mine' | 'theirs') => cards.find((c) => c.who === who)!;

describe('placeCards', () => {
  it('shows both places with device, chapter, progress and time', () => {
    const cards = placeCards(conflict, NOW);
    expect(cards.map((c) => c.device).sort()).toEqual(['Nick’s iPad', 'This device']);
    for (const c of cards) {
      expect(c.chapterTitle).toBeTruthy();
      expect(c.when).toBeTruthy();
      expect(c.percent).toBeGreaterThanOrEqual(0);
    }
  });
  it('offers the other device\'s place first, whatever the clocks say', () => {
    for (const theirsAt of [NOW - 1000, NOW - 3_600_000 * 5]) {
      const cards = placeCards({ ...conflict, theirs: { ...conflict.theirs, updatedAt: theirsAt } }, NOW);
      expect(cards[0].who).toBe('theirs');
      expect(cards[0].suggested).toBe(true);
      expect(cards[1].suggested).toBe(false);
    }
  });
  it('words the time, the percent and the chapter', () => {
    const cards = placeCards(conflict, NOW);
    expect(by(cards, 'theirs').when).toBe('Yesterday, 9:40 pm');
    expect(by(cards, 'mine').when).toBe('3 min ago');
    expect(by(cards, 'theirs').percent).toBe(71);
    expect(placeLine(by(cards, 'theirs'))).toBe('Chapter 9 · Salt Tithe');
    expect(placeLine(by(cards, 'mine'))).toBe('Chapter 4 · The Ferryman’s Ledger');
  });
  it('uses the given story numbers, including none for matter', () => {
    const cards = placeCards(conflict, NOW, { theirs: 7, mine: null });
    expect(placeLine(by(cards, 'theirs'))).toBe('Chapter 7 · Salt Tithe');
    expect(placeLine(by(cards, 'mine'))).toBe('The Ferryman’s Ledger');
  });
});

describe('choiceLabel', () => {
  it('names the chapter to go to', () => {
    const cards = placeCards(conflict, NOW);
    const [theirs, mine] = [by(cards, 'theirs'), by(cards, 'mine')];
    expect(choiceLabel(theirs, mine)).toBe('Continue on Chapter 9');
    expect(choiceLabel(mine, theirs)).toBe('Stay on Chapter 4');
  });
  it('falls back to the percent when both are in the same chapter', () => {
    const same = { ...conflict, theirs: { ...conflict.theirs, chapterIndex: 3, chapterTitle: conflict.mine.chapterTitle } };
    const cards = placeCards(same, NOW);
    const [theirs, mine] = [by(cards, 'theirs'), by(cards, 'mine')];
    expect(choiceLabel(theirs, mine)).toBe('Continue at 71%');
    expect(choiceLabel(mine, theirs)).toBe('Stay at 34%');
  });
});

describe('percentOf', () => {
  it('rounds and clamps', () => {
    expect(percentOf(0.714)).toBe(71);
    expect(percentOf(2)).toBe(100);
    expect(percentOf(-1)).toBe(0);
    expect(percentOf(Number.NaN)).toBe(0);
  });
});

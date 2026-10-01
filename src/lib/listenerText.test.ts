import { describe, expect, it } from 'vitest';
import { avatarHue, booksStartedText, cleanName, findNameTaken, initialOf, joinNames, listenedLabel, nameLength, nameProblem } from './listenerText';

const people = [
  { id: 'a', name: 'Nick' },
  { id: 'b', name: 'Sam' },
];

describe('name validation (mirrors the server)', () => {
  it('trims before checking', () => {
    expect(cleanName('  Ada \n')).toBe('Ada');
    expect(nameProblem('   ')).toBe('empty');
    expect(nameProblem('')).toBe('empty');
    expect(nameProblem(' Ada ')).toBeNull();
  });
  it('counts code points, not UTF-16 units', () => {
    expect(nameLength('😀😀')).toBe(2);
    expect(nameProblem('😀'.repeat(40))).toBeNull();
    expect(nameProblem('😀'.repeat(41))).toBe('too_long');
    expect(nameProblem('x'.repeat(40))).toBeNull();
    expect(nameProblem('x'.repeat(41))).toBe('too_long');
  });
  it('refuses control characters inside the name', () => {
    expect(nameProblem('bad\nname')).toBe('control');
    expect(nameProblem('tab\tname')).toBe('control');
  });
});

describe('name taken', () => {
  it('ignores case and surrounding space', () => {
    expect(findNameTaken('nick', people)?.id).toBe('a');
    expect(findNameTaken('  NICK ', people)?.id).toBe('a');
    expect(findNameTaken('Ada', people)).toBeUndefined();
    expect(findNameTaken('', people)).toBeUndefined();
  });
  it('lets a listener keep or re-case their own name', () => {
    expect(findNameTaken('nick', people, 'a')).toBeUndefined();
    expect(findNameTaken('sam', people, 'a')?.id).toBe('b');
  });
});

describe('avatar', () => {
  it('uses the first code point, upper-cased', () => {
    expect(initialOf('ada')).toBe('A');
    expect(initialOf(' 😀x')).toBe('😀');
    expect(initialOf('')).toBe('?');
  });
  it('has a stable hue in range', () => {
    expect(avatarHue('01HX')).toBe(avatarHue('01HX'));
    for (const s of ['a', 'b', 'Nick', '😀']) expect(avatarHue(s)).toBeGreaterThanOrEqual(0), expect(avatarHue(s)).toBeLessThan(360);
  });
});

describe('listenedLabel', () => {
  const now = new Date(2026, 9, 1, 15, 0, 0);
  const at = (days: number, h = 9) => new Date(2026, 9, 1 - days, h).toISOString();
  it('says what is known', () => {
    expect(listenedLabel(null, now)).toBe('Not started yet');
    expect(listenedLabel(at(0, 1), now)).toBe('Listened today');
    expect(listenedLabel(at(1, 23), now)).toBe('Listened yesterday');
    expect(listenedLabel(at(3), now)).toBe('Listened 3 days ago');
    expect(listenedLabel(at(15), now)).toBe('Listened 2 weeks ago');
    expect(listenedLabel(at(35), now)).toBe('Listened last month');
    expect(listenedLabel(at(100), now)).toBe('Listened 3 months ago');
    expect(listenedLabel(at(800), now)).toBe('Listened over a year ago');
  });
  it('does not invent a time for garbage', () => {
    expect(listenedLabel('not a date', now)).toBe('Not started yet');
  });
});

describe('words', () => {
  it('joins names', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Nick'])).toBe('Nick');
    expect(joinNames(['Nick', 'Riley'])).toBe('Nick and Riley');
    expect(joinNames(['Nick', 'Riley', 'Jo'])).toBe('Nick, Riley and Jo');
  });
  it('pluralises books', () => {
    expect(booksStartedText(0)).toBe('No books started.');
    expect(booksStartedText(1)).toBe('1 book started.');
    expect(booksStartedText(6)).toBe('6 books started.');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createSearchDebounce, highlightPieces, hitToRow, passageCount, searchableQuery, type Scheduler } from './search';

describe('searchableQuery', () => {
  it('trims and collapses whitespace; empty is null', () => {
    expect(searchableQuery('  ferry   man ')).toBe('ferry man');
    expect(searchableQuery('   ')).toBeNull();
    expect(searchableQuery('')).toBeNull();
  });
  it('cuts at 200 characters without splitting a surrogate pair', () => {
    const q = searchableQuery('😀'.repeat(250))!;
    expect(Array.from(q)).toHaveLength(200);
    expect(q.endsWith('😀')).toBe(true);
  });
});

describe('highlighting by code points', () => {
  it('marks the match', () => {
    const row = hitToRow({ chapter_id: 'c', line_id: 'l1', start: 40, end: 48, before: '“You are early,” the ', match: 'ferryman', after: ' said.' }, 'Chapter 4', 'Passage 12');
    expect(highlightPieces(row.text, row.ranges)).toEqual([
      { text: '“You are early,” the ', mark: false },
      { text: 'ferryman', mark: true },
      { text: ' said.', mark: false },
    ]);
    expect(row.id).toBe('l1:40');
    expect(row.chapterLabel).toBe('Chapter 4');
  });
  it('does not split an astral character before the match', () => {
    const row = hitToRow({ chapter_id: 'c', line_id: 'l', start: 3, end: 5, before: '😀 a ', match: 'bé', after: '!' }, 'Chapter 1');
    expect(row.ranges).toEqual([{ start: 4, end: 6 }]);
    const pieces = highlightPieces(row.text, row.ranges);
    expect(pieces.filter((p) => p.mark).map((p) => p.text)).toEqual(['bé']);
    expect(pieces.map((p) => p.text).join('')).toBe(row.text);
  });
  it('returns the whole line unmarked when there are no ranges', () => {
    expect(highlightPieces('plain', [])).toEqual([{ text: 'plain', mark: false }]);
  });
  it('handles a match at the very start and end', () => {
    expect(highlightPieces('abc', [{ start: 0, end: 3 }])).toEqual([{ text: 'abc', mark: true }]);
  });
});

describe('passageCount', () => {
  it('pluralises', () => {
    expect(passageCount(7)).toBe('7 passages');
    expect(passageCount(1)).toBe('1 passage');
    expect(passageCount(1200)).toBe('1,200 passages');
  });
});

function fakeScheduler() {
  let now = 0;
  let id = 0;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  const s: Scheduler = {
    set(fn, ms) {
      tasks.set(++id, { at: now + ms, fn });
      return id;
    },
    clear(h) {
      tasks.delete(h as number);
    },
  };
  return {
    s,
    advance(ms: number) {
      now += ms;
      for (const [k, t] of [...tasks]) {
        if (t.at <= now) {
          tasks.delete(k);
          t.fn();
        }
      }
    },
  };
}

describe('createSearchDebounce', () => {
  it('waits for the last keystroke', () => {
    const clock = fakeScheduler();
    const onsearch = vi.fn();
    const d = createSearchDebounce(onsearch, vi.fn(), { delay: 250, scheduler: clock.s });
    d.input('f');
    clock.advance(100);
    d.input('fe');
    clock.advance(100);
    d.input('ferry');
    clock.advance(249);
    expect(onsearch).not.toHaveBeenCalled();
    clock.advance(1);
    expect(onsearch).toHaveBeenCalledTimes(1);
    expect(onsearch).toHaveBeenCalledWith('ferry');
  });
  it('does not repeat the same query, even with extra spaces', () => {
    const clock = fakeScheduler();
    const onsearch = vi.fn();
    const d = createSearchDebounce(onsearch, vi.fn(), { scheduler: clock.s });
    d.input('ferry');
    clock.advance(300);
    d.input('ferry ');
    clock.advance(300);
    expect(onsearch).toHaveBeenCalledTimes(1);
    d.reset();
    d.input('ferry');
    clock.advance(300);
    expect(onsearch).toHaveBeenCalledTimes(2);
  });
  it('clears at once when the field is emptied and drops a pending search', () => {
    const clock = fakeScheduler();
    const onsearch = vi.fn();
    const oncleared = vi.fn();
    const d = createSearchDebounce(onsearch, oncleared, { scheduler: clock.s });
    d.input('ferry');
    clock.advance(300);
    d.input('');
    expect(oncleared).toHaveBeenCalledTimes(1);
    d.input('ferr');
    d.input('  ');
    clock.advance(1000);
    expect(onsearch).toHaveBeenCalledTimes(1);
    expect(oncleared).toHaveBeenCalledTimes(1); // nothing was shown, nothing to clear
  });
  it('flushes on Enter', () => {
    const clock = fakeScheduler();
    const onsearch = vi.fn();
    const d = createSearchDebounce(onsearch, vi.fn(), { scheduler: clock.s });
    d.input('salt');
    d.flush();
    expect(onsearch).toHaveBeenCalledWith('salt');
    clock.advance(1000);
    expect(onsearch).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from 'vitest';
import { cpLength, cpSlice, cpToIndex, cutByRanges, indexToCp } from './codepoints';

// "a", an astral emoji (2 UTF-16 units, 1 code point), "é" written as e + combining accent (2 code points), "z"
const s = 'a😀éz';

describe('code point offsets', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(s.length).toBe(6);
    expect(cpLength(s)).toBe(5);
  });
  it('maps offsets to indices and back without splitting a surrogate pair', () => {
    expect(cpToIndex(s, 0)).toBe(0);
    expect(cpToIndex(s, 1)).toBe(1);
    expect(cpToIndex(s, 2)).toBe(3);
    expect(cpToIndex(s, 99)).toBe(6);
    for (let cp = 0; cp <= 5; cp++) expect(indexToCp(s, cpToIndex(s, cp))).toBe(cp);
  });
  it('slices by code points, end exclusive', () => {
    expect(cpSlice(s, 1, 2)).toBe('😀');
    expect(cpSlice(s, 2, 4)).toBe('é');
    expect(cpSlice(s, 0, 0)).toBe('');
    expect(cpSlice(s, 3, 99)).toBe('́z');
  });
  it('cuts text at ranges, keeping the gaps, and the pieces join back to the text', () => {
    const pieces = cutByRanges(s, [{ start: 1, end: 2 }, { start: 3, end: 5 }]);
    expect(pieces.map((p) => p.text)).toEqual(['a', '😀', 'e', '́z']);
    expect(pieces.map((p) => p.range !== null)).toEqual([false, true, false, true]);
    expect(pieces.map((p) => p.text).join('')).toBe(s);
  });
  it('ignores overlap and out-of-range ends', () => {
    const pieces = cutByRanges('abcdef', [{ start: 1, end: 3 }, { start: 2, end: 4 }, { start: 5, end: 99 }]);
    expect(pieces.map((p) => p.text).join('')).toBe('abcdef');
    expect(pieces.filter((p) => p.range).map((p) => p.text)).toEqual(['bc', 'd', 'f']);
  });
});

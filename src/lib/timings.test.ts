import { describe, expect, it } from 'vitest';
import { cpLength } from './codepoints';
import { lineAtOffset, lineAtTime, normalizeTimings, offsetAtTime, spreadTimings, timeForOffset, timingIndexAt } from './timings';
import type { LineTiming, TextLine } from '../player/types';

const lines: TextLine[] = [
  { id: 'a', start: 0, end: 10 },
  { id: 'b', start: 11, end: 20 },
  { id: 'c', start: 21, end: 33 },
];
const timings: LineTiming[] = [
  { lineId: 'a', startMs: 1000, endMs: 3000 },
  { lineId: 'b', startMs: 3500, endMs: 6000 },
  { lineId: 'c', startMs: 6000, endMs: 9000 },
];

describe('normalizeTimings', () => {
  it('sorts, drops unknown lines, duplicates and malformed entries, and never goes backwards', () => {
    const raw = [
      { line_id: 'c', start_ms: 6000, end_ms: 9000 },
      { line_id: 'a', start_ms: 1000, end_ms: 3000 },
      { line_id: 'zzz', start_ms: 0, end_ms: 1 },
      { line_id: 'b', start_ms: 3500, end_ms: 3000 },
      { line_id: 'a', start_ms: 99, end_ms: 100 },
      { line_id: 'x', start_ms: Number.NaN, end_ms: 5 },
      { line_id: 'y', start_ms: -5, end_ms: 5 },
    ];
    const out = normalizeTimings(raw, lines);
    expect(out.map((t) => t.lineId)).toEqual(['a', 'b', 'c']);
    expect(out[1]).toEqual({ lineId: 'b', startMs: 3500, endMs: 3500 });
  });
  it('is empty for missing timings', () => {
    expect(normalizeTimings(null, lines)).toEqual([]);
    expect(normalizeTimings(undefined, lines)).toEqual([]);
    expect(normalizeTimings([], lines)).toEqual([]);
  });
  it('keeps same-start lines in reading order', () => {
    const out = normalizeTimings(
      [
        { line_id: 'b', start_ms: 0, end_ms: 0 },
        { line_id: 'a', start_ms: 0, end_ms: 0 },
      ],
      lines,
    );
    expect(out.map((t) => t.lineId)).toEqual(['a', 'b']);
  });
});

describe('lineAtTime', () => {
  it('finds the line being spoken', () => {
    expect(lineAtTime(timings, 1000)).toBe('a');
    expect(lineAtTime(timings, 2999)).toBe('a');
    expect(lineAtTime(timings, 3500)).toBe('b');
    expect(lineAtTime(timings, 6000)).toBe('c');
  });
  it('before the first line it is the first line', () => {
    expect(lineAtTime(timings, 0)).toBe('a');
    expect(lineAtTime(timings, -50)).toBe('a');
  });
  it('in a gap it is the line before; after the end the last line', () => {
    expect(lineAtTime(timings, 3200)).toBe('a');
    expect(lineAtTime(timings, 99_000)).toBe('c');
  });
  it('is null with no timings', () => {
    expect(lineAtTime([], 1000)).toBeNull();
    expect(timingIndexAt([], 5)).toBe(-1);
  });
});

describe('lineAtOffset', () => {
  it('maps offsets to lines, gaps to the line before, before the start to the first', () => {
    expect(lineAtOffset(lines, 0)!.id).toBe('a');
    expect(lineAtOffset(lines, 10)!.id).toBe('a'); // the space between lines
    expect(lineAtOffset(lines, 11)!.id).toBe('b');
    expect(lineAtOffset(lines, 500)!.id).toBe('c');
    expect(lineAtOffset(lines, -3)!.id).toBe('a');
    expect(lineAtOffset([], 3)).toBeNull();
  });
  it('accepts lines out of order', () => {
    expect(lineAtOffset([lines[2]!, lines[0]!, lines[1]!], 12)!.id).toBe('b');
  });
});

describe('offsets are code points, not UTF-16 units', () => {
  // "😀" is one code point and two UTF-16 units; the second line starts at code point 4
  const text = '😀 ab. cd';
  const l: TextLine[] = [
    { id: 'x', start: 0, end: 5 },
    { id: 'y', start: 6, end: 8 },
  ];
  it('the text length is counted in code points', () => {
    expect(text.length).toBe(9);
    expect(cpLength(text)).toBe(8);
    expect(l[1]!.end).toBe(cpLength(text));
  });
  it('maps an offset after an emoji to the right line and back', () => {
    const t: LineTiming[] = [
      { lineId: 'x', startMs: 0, endMs: 5000 },
      { lineId: 'y', startMs: 5000, endMs: 8000 },
    ];
    expect(lineAtOffset(l, 6)!.id).toBe('y');
    expect(timeForOffset(t, l, 6, 8000)).toBe(5000);
    expect(offsetAtTime(t, l, 5500, 8000)).toBe(6);
    // a UTF-16 reading of the same place would be one off
    expect(text.indexOf('cd')).toBe(7);
    expect(cpLength(text.slice(0, text.indexOf('cd')))).toBe(6);
  });
});

describe('timeForOffset and offsetAtTime', () => {
  it('the start of a line is its start time; inside a line is spread across it', () => {
    expect(timeForOffset(timings, lines, 0)).toBe(1000);
    expect(timeForOffset(timings, lines, 11)).toBe(3500);
    expect(timeForOffset(timings, lines, 5)).toBe(2000); // half way through line a (0 to 10)
  });
  it('past the end of the text is the end of the audio', () => {
    expect(timeForOffset(timings, lines, 33, 10_000)).toBe(10_000);
    expect(timeForOffset(timings, lines, 999)).toBe(9000);
  });
  it('a line with no timing uses the end of the nearest earlier timed line, then a share of the duration', () => {
    const t = [timings[0]!];
    expect(timeForOffset(t, lines, 25)).toBe(3000);
    expect(timeForOffset([], lines, 16, 33_000)).toBe(16_000);
    expect(timeForOffset([], lines, 16)).toBeNull();
    expect(timeForOffset(timings, [], 3)).toBeNull();
  });
  it('the offset stored for a time is the start of the line being spoken', () => {
    expect(offsetAtTime(timings, lines, 0)).toBe(0);
    expect(offsetAtTime(timings, lines, 4000)).toBe(11);
    expect(offsetAtTime(timings, lines, 7000)).toBe(21);
  });
  it('without timings it is the line at the same share of the audio', () => {
    expect(offsetAtTime([], lines, 5000, 10_000)).toBe(11);
    expect(offsetAtTime([], lines, 0, 10_000)).toBe(0);
    expect(offsetAtTime([], lines, 10_000, 10_000)).toBe(21);
    expect(offsetAtTime([], lines, 5000)).toBe(0);
    expect(offsetAtTime(timings, [], 5000)).toBe(0);
  });
});

describe('spreadTimings', () => {
  it('covers the whole audio by line length', () => {
    const t = spreadTimings(lines, 33_000);
    expect(t[0]!.startMs).toBe(0);
    expect(t[2]!.endMs).toBe(33_000);
    expect(t.every((x, i) => i === 0 || x.startMs === t[i - 1]!.endMs)).toBe(true);
    expect(spreadTimings(lines, 0)).toEqual([]);
    expect(spreadTimings([], 1000)).toEqual([]);
  });
});

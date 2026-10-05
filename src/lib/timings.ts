// Mapping between audio time and text offsets for one chapter. Timings say when each line is spoken;
// lines say which code points they cover. Offsets are zero-based Unicode code points, end exclusive
// (never UTF-16 units), so everything here compares code point offsets and never indexes a string.
import { cpLength } from './codepoints';
import type { LineTiming, TextLine } from '../player/types';

export interface RawTiming {
  line_id: string;
  start_ms: number;
  end_ms: number;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Lines ordered by start (a copy only when they are not already in order). */
export function sortedLines(lines: readonly TextLine[]): readonly TextLine[] {
  for (let i = 1; i < lines.length; i++) if (lines[i]!.start < lines[i - 1]!.start) return [...lines].sort((a, b) => a.start - b.start);
  return lines;
}

/**
 * The server's timings as the player uses them: only lines the text has, one entry per line, never
 * negative or backwards, sorted by start (ties keep reading order). Missing or malformed entries are
 * dropped rather than trusted.
 */
export function normalizeTimings(raw: readonly RawTiming[] | null | undefined, lines: readonly TextLine[]): LineTiming[] {
  if (!raw?.length) return [];
  const order = new Map<string, number>();
  sortedLines(lines).forEach((l, i) => order.set(l.id, i));
  const seen = new Set<string>();
  const out: LineTiming[] = [];
  for (const r of raw) {
    if (!r || typeof r.line_id !== 'string' || !finite(r.start_ms) || !finite(r.end_ms)) continue;
    if (lines.length && !order.has(r.line_id)) continue;
    if (seen.has(r.line_id)) continue;
    seen.add(r.line_id);
    const startMs = Math.max(0, r.start_ms);
    out.push({ lineId: r.line_id, startMs, endMs: Math.max(startMs, r.end_ms) });
  }
  return out.sort((a, b) => a.startMs - b.startMs || (order.get(a.lineId) ?? 0) - (order.get(b.lineId) ?? 0));
}

/** Timings spread over `durationMs` by line length: the stand-in when the server has none. */
export function spreadTimings(lines: readonly TextLine[], durationMs: number): LineTiming[] {
  const ls = sortedLines(lines);
  if (!ls.length || !(durationMs > 0)) return [];
  const weights = ls.map((l) => Math.max(1, l.end - l.start));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  return ls.map((l, i) => {
    const startMs = Math.round((acc / total) * durationMs);
    acc += weights[i]!;
    return { lineId: l.id, startMs, endMs: Math.round((acc / total) * durationMs) };
  });
}

/**
 * Index into `timings` (sorted by start) of the line being spoken at `ms`: the last line that has
 * started. In a gap between lines that is the line before; before the first line it is the first line
 * (the lead-in belongs to it); after the last it is the last. -1 only when there are no timings.
 */
export function timingIndexAt(timings: readonly LineTiming[], ms: number): number {
  if (!timings.length) return -1;
  let lo = 0;
  let hi = timings.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timings[mid]!.startMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export function lineAtTime(timings: readonly LineTiming[], ms: number): string | null {
  const i = timingIndexAt(timings, ms);
  return i < 0 ? null : timings[i]!.lineId;
}

/** The line a code point offset falls in: in a gap the line before, before the first the first, past the end the last. */
export function lineAtOffset(lines: readonly TextLine[], offset: number): TextLine | null {
  const ls = sortedLines(lines);
  if (!ls.length) return null;
  let lo = 0;
  let hi = ls.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ls[mid]!.start <= offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ls[found]!;
}

/** Code point length of the text the lines cover (end of the last line). */
export function linesEnd(lines: readonly TextLine[]): number {
  return lines.reduce((m, l) => Math.max(m, l.end), 0);
}

/**
 * Audio time (ms) for a text offset. Inside a line it is spread across the line's span; past the end
 * of the text it is the end of the audio. With no timing for the line it falls back to the nearest
 * earlier timed line, then to a share of `durationMs`. Null when nothing can be said.
 */
export function timeForOffset(timings: readonly LineTiming[], lines: readonly TextLine[], offset: number, durationMs = 0): number | null {
  const ls = sortedLines(lines);
  if (!ls.length) return null;
  const end = linesEnd(ls);
  const byId = new Map(timings.map((t) => [t.lineId, t]));
  if (offset >= end) {
    const last = timings.length ? Math.max(...timings.map((t) => t.endMs)) : 0;
    return durationMs > 0 ? Math.max(durationMs, last) : timings.length ? last : null;
  }
  const line = lineAtOffset(ls, offset)!;
  let t = byId.get(line.id);
  if (!t) {
    for (let i = ls.indexOf(line) - 1; i >= 0 && !t; i--) t = byId.get(ls[i]!.id);
    if (t) return t.endMs;
    return durationMs > 0 && end > 0 ? Math.round((offset / end) * durationMs) : null;
  }
  const span = line.end - line.start;
  const frac = span > 0 ? Math.min(1, Math.max(0, (offset - line.start) / span)) : 0;
  return Math.round(t.startMs + frac * (t.endMs - t.startMs));
}

/**
 * The text offset to store for an audio time: the start of the line being spoken (so another device
 * resumes at the start of a sentence). With no timings it is the line at the same share of the text.
 */
export function offsetAtTime(timings: readonly LineTiming[], lines: readonly TextLine[], ms: number, durationMs = 0): number {
  const ls = sortedLines(lines);
  if (!ls.length) return 0;
  const id = lineAtTime(timings, ms);
  if (id !== null) {
    const line = ls.find((l) => l.id === id);
    if (line) return line.start;
  }
  if (durationMs > 0) {
    const cp = Math.round((Math.min(Math.max(ms, 0), durationMs) / durationMs) * linesEnd(ls));
    return lineAtOffset(ls, Math.min(cp, Math.max(0, linesEnd(ls) - 1)))!.start;
  }
  return ls[0]!.start;
}

/** Code point length of a chapter text (offsets past this are out of range). */
export const textLength = cpLength;

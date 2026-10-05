// Chapter text offsets are zero-based Unicode code points, end exclusive (never bytes, never
// JavaScript string indices, which count UTF-16 units). Everything that maps an offset to text, or
// text to an offset, goes through here.

/** Number of code points in `s`. */
export function cpLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** The UTF-16 index of the code point at `cp` (`s.length` when `cp` is at or past the end). */
export function cpToIndex(s: string, cp: number): number {
  if (cp <= 0) return 0;
  let i = 0;
  let n = 0;
  while (i < s.length && n < cp) {
    i += (s.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
    n++;
  }
  return i;
}

/** The code point offset of the UTF-16 index `index`. */
export function indexToCp(s: string, index: number): number {
  let n = 0;
  for (let i = 0; i < Math.min(index, s.length); ) {
    i += (s.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
    n++;
  }
  return n;
}

/** `s` between code point offsets `start` and `end` (end exclusive). */
export function cpSlice(s: string, start: number, end: number): string {
  return s.slice(cpToIndex(s, start), cpToIndex(s, end));
}

/**
 * Cut `text` into consecutive pieces at the given code point ranges. Ranges must be ordered and not
 * overlap; text between ranges comes back as pieces with `range: null`. Used to render a chapter
 * with its lines marked up without ever splitting a surrogate pair.
 */
export function cutByRanges<T extends { start: number; end: number }>(
  text: string,
  ranges: readonly T[],
): { text: string; range: T | null }[] {
  const out: { text: string; range: T | null }[] = [];
  const total = cpLength(text);
  let at = 0;
  for (const r of ranges) {
    const start = Math.max(r.start, at);
    const end = Math.min(r.end, total);
    if (start > at) out.push({ text: cpSlice(text, at, start), range: null });
    if (end > start) out.push({ text: cpSlice(text, start, end), range: r });
    at = Math.max(at, end);
  }
  if (at < total) out.push({ text: cpSlice(text, at, total), range: null });
  return out;
}

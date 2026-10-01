// Find in book: the query rules, the debounce, and how a hit becomes a line with its match marked.
// Offsets are Unicode code points (never string indices): highlighting goes through cutByRanges.
import { cpLength, cutByRanges } from '../../lib/codepoints';

/** The contract's limits for `searchBook`: `q` is 1 to 200 characters. */
export const QUERY_MAX = 200;
export const DEBOUNCE_MS = 250;

/** The query to send, or null when there is nothing to search for. Whitespace is trimmed and runs of it become one space. */
export function searchableQuery(raw: string): string | null {
  const q = raw.replace(/\s+/g, ' ').trim();
  if (!q) return null;
  const chars = Array.from(q);
  return chars.length > QUERY_MAX ? chars.slice(0, QUERY_MAX).join('').trim() : q;
}

/** What `searchBook` returns for one match (SearchHit in the contract). */
export interface SearchHitInput {
  chapter_id: string;
  line_id: string;
  start: number;
  end: number;
  before: string;
  match: string;
  after: string;
}

/** A result as the sheet shows it. */
export interface SearchResultRow {
  /** unique: the line and the match start */
  id: string;
  chapterId: string;
  lineId: string;
  /** chapter text offset of the match, to go to */
  start: number;
  /** "Chapter 4" */
  chapterLabel: string;
  /** "Passage 12"; null when the lead cannot tell */
  passageLabel: string | null;
  /** the line text shown: before + match + after */
  text: string;
  /** code point ranges of `text` to mark */
  ranges: { start: number; end: number }[];
}

export function hitToRow(hit: SearchHitInput, chapterLabel: string, passageLabel: string | null = null): SearchResultRow {
  const from = cpLength(hit.before);
  return {
    id: `${hit.line_id}:${hit.start}`,
    chapterId: hit.chapter_id,
    lineId: hit.line_id,
    start: hit.start,
    chapterLabel,
    passageLabel,
    text: hit.before + hit.match + hit.after,
    ranges: [{ start: from, end: from + cpLength(hit.match) }],
  };
}

/** The line cut into plain and marked pieces. */
export function highlightPieces(text: string, ranges: readonly { start: number; end: number }[]): { text: string; mark: boolean }[] {
  const ordered = [...ranges].sort((a, b) => a.start - b.start);
  return cutByRanges(text, ordered).map((p) => ({ text: p.text, mark: p.range !== null }));
}

/** "7 passages", "1 passage". */
export function passageCount(total: number): string {
  return `${total.toLocaleString('en-US')} ${total === 1 ? 'passage' : 'passages'}`;
}

export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
const realScheduler: Scheduler = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/**
 * Turns typing into searches: waits `delay` ms after the last keystroke, sends the cleaned query, and does not
 * send the same query twice in a row. An empty query calls `oncleared` at once (no wait) so stale results go away.
 */
export function createSearchDebounce(
  onsearch: (query: string) => void,
  oncleared: () => void,
  opts: { delay?: number; scheduler?: Scheduler } = {},
) {
  const delay = opts.delay ?? DEBOUNCE_MS;
  const sched = opts.scheduler ?? realScheduler;
  let handle: unknown = null;
  let last: string | null = null;
  let pending: string | null = null;

  const cancel = () => {
    if (handle !== null) sched.clear(handle);
    handle = null;
    pending = null;
  };
  const fire = () => {
    handle = null;
    const q = pending;
    pending = null;
    if (q === null || q === last) return;
    last = q;
    onsearch(q);
  };
  return {
    /** The field changed. */
    input(raw: string) {
      const q = searchableQuery(raw);
      cancel();
      if (q === null) {
        if (last !== null) {
          last = null;
          oncleared();
        }
        return;
      }
      pending = q;
      handle = sched.set(fire, delay);
    },
    /** Enter pressed: search now. */
    flush() {
      if (handle !== null) {
        sched.clear(handle);
        fire();
      }
    },
    cancel,
    /** Forget the last query so the same words search again (the book changed). */
    reset() {
      cancel();
      last = null;
    },
  };
}

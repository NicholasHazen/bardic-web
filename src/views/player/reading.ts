// Pure rules for Read mode: how the chapter text is cut into paragraphs and lines, which lines are
// marked, and whether the view follows the narration or has been scrolled away.
// Offsets are Unicode code points (src/lib/codepoints.ts); nothing here uses string indices.
import { cutByRanges } from '../../lib/codepoints';
import type { ReaderAppearance, TextLine } from '../../player/types';
import type { Layout } from './nowPlaying';

export interface TextPart {
  text: string;
  /** the line this text belongs to, or null for text between lines */
  lineId: string | null;
}
export interface Paragraph {
  parts: TextPart[];
}

/**
 * The chapter as paragraphs of parts. Lines come from the server's ranges; the text between them
 * is kept as it is, and a line break there starts a new paragraph. Lines may arrive in any order.
 */
export function paragraphsOf(text: string, lines: readonly TextLine[]): Paragraph[] {
  const ordered = [...lines].sort((a, b) => a.start - b.start);
  const out: Paragraph[] = [];
  let cur: TextPart[] = [];
  const flush = () => {
    for (let last = cur[cur.length - 1]; last && last.lineId === null && !last.text.trim(); last = cur[cur.length - 1]) cur.pop();
    if (cur.length) out.push({ parts: cur });
    cur = [];
  };
  for (const piece of cutByRanges(text, ordered)) {
    if (piece.range) {
      cur.push({ text: piece.text, lineId: piece.range.id });
      continue;
    }
    piece.text.split(/\r?\n/).forEach((seg, i) => {
      if (i > 0) flush();
      if (seg.length && (cur.length || seg.trim())) cur.push({ text: seg, lineId: null });
    });
  }
  flush();
  return out;
}

export type LineMark = 'current' | 'marked';

/**
 * Which lines are highlighted: the line being spoken ("current", the filled highlight) and any lines
 * the listener should find again ("marked", the dotted underline, e.g. a search result). The current
 * line wins when it is also marked.
 */
export function highlightedLines(currentLineId: string | null, markedIds: readonly string[] = []): Map<string, LineMark> {
  const m = new Map<string, LineMark>();
  for (const id of markedIds) m.set(id, 'marked');
  if (currentLineId) m.set(currentLineId, 'current');
  return m;
}

/** The line `delta` lines from the current one (clamped to the chapter); the first line when none is current. */
export function neighbourLine(lines: readonly TextLine[], currentLineId: string | null, delta: number): string | null {
  if (!lines.length) return null;
  const ordered = [...lines].sort((a, b) => a.start - b.start);
  const at = ordered.findIndex((l) => l.id === currentLineId);
  if (at < 0) return ordered[0]?.id ?? null;
  return ordered[Math.min(ordered.length - 1, Math.max(0, at + delta))]?.id ?? null;
}

// ---- following the narration -------------------------------------------------------------------

export type FollowMode = 'following' | 'away';
export type FollowEvent =
  /** the listener scrolled by hand (wheel, touch, keys, scrollbar), never our own scrolling */
  | 'user-scroll'
  /** the "Back to narration" button */
  | 'back-to-narration'
  /** the listener tapped a line to jump there */
  | 'line-tapped'
  /** the spoken line changed, or a seek moved it */
  | 'line-changed'
  /** a different chapter was loaded */
  | 'chapter-changed'
  /** Read mode was opened */
  | 'read-entered';

export interface FollowStep {
  mode: FollowMode;
  /** scroll the current line into place now */
  scroll: boolean;
}

/**
 * Following the narration as a small state machine. Following keeps the current line in view.
 * A hand scroll stops it (the view then shows "Back to narration" and never yanks the text away
 * from the listener); only the button, a tap on a line, or opening Read / a new chapter resume it.
 */
export function followStep(mode: FollowMode, event: FollowEvent): FollowStep {
  switch (event) {
    case 'user-scroll':
      return { mode: 'away', scroll: false };
    case 'back-to-narration':
    case 'chapter-changed':
    case 'read-entered':
      return { mode: 'following', scroll: true };
    case 'line-tapped':
      return { mode: 'following', scroll: false };
    case 'line-changed':
      return { mode, scroll: mode === 'following' };
  }
}

/** The label of the way back. */
export function backLabel(playing: boolean): string {
  return playing ? 'Back to narration' : 'Back to your place';
}

// ---- appearance ---------------------------------------------------------------------------------

export interface ReaderMetrics {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  /** chapter title size */
  titleSize: number;
  /** width of the text column; null fills the space */
  columnWidth: number | null;
  /** gap between paragraphs */
  gap: number;
}

const TITLE: Record<Layout, number> = { phone: 30, 'tablet-portrait': 33, 'tablet-landscape': 35 };

/** Sizes for the text column from the listener's appearance and the layout. */
export function readerMetrics(a: ReaderAppearance, layout: Layout): ReaderMetrics {
  return {
    fontSize: a.size,
    lineHeight: a.spacing,
    fontFamily: a.font === 'serif' ? "var(--font-book)" : 'var(--font-ui)',
    titleSize: TITLE[layout],
    columnWidth: layout === 'phone' ? 390 : layout === 'tablet-portrait' ? 640 : null,
    gap: layout === 'tablet-landscape' ? 16 : 18,
  };
}

export interface ReaderColors {
  /** paper themes replace the aura with a flat page */
  paper: string | null;
  ink: string;
  muted: string;
  /** accent for text on this page */
  accent: string;
  /** glass fill and edge for the controls drawn over the page */
  glass: string;
  edge: string;
  /** capsule fill */
  capsule: string;
  /** dim themes darken the aura further */
  dim: boolean;
}

/** Colours for the four reader themes. Dark is the board's; dim is the same, quieter; light and sepia are paper. */
export function readerColors(theme: ReaderAppearance['theme']): ReaderColors {
  switch (theme) {
    case 'light':
      return { paper: '#f6f2ea', ink: '#231d18', muted: '#5a5048', accent: 'color-mix(in srgb, var(--accent) 38%, #000)', glass: 'rgba(0,0,0,.06)', edge: 'rgba(0,0,0,.16)', capsule: 'rgba(255,255,255,.78)', dim: false };
    case 'sepia':
      return { paper: '#efe2c6', ink: '#33281a', muted: '#65563f', accent: 'color-mix(in srgb, var(--accent) 38%, #000)', glass: 'rgba(60,40,10,.07)', edge: 'rgba(60,40,10,.2)', capsule: 'rgba(250,240,216,.82)', dim: false };
    case 'dim':
      return { paper: null, ink: '#d9d4cc', muted: '#b3adc2', accent: 'var(--accent)', glass: 'rgba(255,255,255,.09)', edge: 'rgba(255,255,255,.18)', capsule: 'rgba(20,16,28,.55)', dim: true };
    default:
      return { paper: null, ink: '#f5f1ea', muted: '#d0cade', accent: 'var(--accent)', glass: 'rgba(255,255,255,.09)', edge: 'rgba(255,255,255,.18)', capsule: 'rgba(20,16,28,.55)', dim: false };
  }
}

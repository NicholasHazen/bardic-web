// Reader appearance (S4: per device). Defaults, clamping, the five colour choices and persistence through an
// injectable storage. Pure: nothing here touches the DOM, so it is unit tested.
import type { ReaderAppearance } from '../../player/types';

/** The guide's reading sizes (docs/UI-GUIDE.md). */
export const SIZE_MIN = 19;
export const SIZE_MAX = 23;
export const SPACING_MIN = 1.4;
export const SPACING_MAX = 2.0;

/**
 * The reader offers five colours (Aura, Paper, Sepia, Dusk, Night).
 * Mapping: dark = Aura (the book's own colour), light = Paper, sepia = Sepia, dim = Dusk, night = Night.
 */
export type ReaderTheme = ReaderAppearance['theme'] | 'night';
export type ReaderAppearanceValue = Omit<ReaderAppearance, 'theme'> & { theme: ReaderTheme };

/** Things the reader sheets show that `ReaderAppearance` does not carry. */
export interface ReaderExtras {
  /** the page scrolls to the passage being read */
  followNarration: boolean;
  /** keep the screen on while the reader is open and playing */
  keepScreenOn: boolean;
  /** tablet only: how wide the page is */
  pageWidth: PageWidth;
}

export const PAGE_WIDTHS = ['narrow', 'medium', 'wide', 'wider', 'full'] as const;
export type PageWidth = (typeof PAGE_WIDTHS)[number];

export const DEFAULT_APPEARANCE: ReaderAppearanceValue = { size: 21, theme: 'dark', font: 'serif', spacing: 1.7, dimAura: false };
export const DEFAULT_EXTRAS: ReaderExtras = { followNarration: true, keepScreenOn: true, pageWidth: 'wide' };

export interface ThemeChoice {
  id: ReaderTheme;
  label: string;
  /** the page colour of the swatch; Aura is the book's base colour */
  background: string;
  ink: string;
}

export const THEME_CHOICES: readonly ThemeChoice[] = [
  { id: 'dark', label: 'Aura', background: '#1a0e0c', ink: '#f5f1ea' },
  { id: 'light', label: 'Paper', background: '#ffffff', ink: '#292730' },
  { id: 'sepia', label: 'Sepia', background: '#f6efe2', ink: '#3d3325' },
  { id: 'dim', label: 'Dusk', background: '#2b2b2e', ink: '#e8e4ee' },
  { id: 'night', label: 'Night', background: '#000000', ink: '#d6d2dc' },
];

export interface SpacingChoice {
  label: string;
  value: number;
}
export const SPACING_CHOICES: readonly SpacingChoice[] = [
  { label: 'Tight', value: 1.5 },
  { label: 'Normal', value: 1.7 },
  { label: 'Loose', value: 1.9 },
];

export const PAGE_WIDTH_LABELS: Record<PageWidth, string> = { narrow: 'Narrow', medium: 'Medium', wide: 'Wide', wider: 'Wider', full: 'Full' };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A whole number of pixels inside the reading sizes. Anything that is not a number becomes the default. */
export function clampSize(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_APPEARANCE.size;
  return clamp(Math.round(n), SIZE_MIN, SIZE_MAX);
}

export function clampSpacing(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_APPEARANCE.spacing;
  return Math.round(clamp(n, SPACING_MIN, SPACING_MAX) * 100) / 100;
}

/** The size one A+ or A- step away, staying inside the reading sizes. */
export function stepSize(size: number, direction: 1 | -1): number {
  return clampSize(size + direction);
}

/** The spacing choice a stored spacing is closest to (any stored number shows as Tight, Normal or Loose). */
export function nearestSpacing(spacing: number): SpacingChoice {
  let best = SPACING_CHOICES[1]!;
  for (const c of SPACING_CHOICES) if (Math.abs(c.value - spacing) < Math.abs(best.value - spacing)) best = c;
  return best;
}

const THEMES: ReadonlySet<string> = new Set(THEME_CHOICES.map((t) => t.id));

/** Make any value (stored, remote, half-filled) a valid appearance. */
export function normalizeAppearance(v: unknown): ReaderAppearanceValue {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    size: clampSize(o.size),
    theme: typeof o.theme === 'string' && THEMES.has(o.theme) ? (o.theme as ReaderTheme) : DEFAULT_APPEARANCE.theme,
    font: o.font === 'sans' ? 'sans' : 'serif',
    spacing: clampSpacing(o.spacing),
    dimAura: typeof o.dimAura === 'boolean' ? o.dimAura : DEFAULT_APPEARANCE.dimAura,
  };
}

export function normalizeExtras(v: unknown): ReaderExtras {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    followNarration: typeof o.followNarration === 'boolean' ? o.followNarration : DEFAULT_EXTRAS.followNarration,
    keepScreenOn: typeof o.keepScreenOn === 'boolean' ? o.keepScreenOn : DEFAULT_EXTRAS.keepScreenOn,
    pageWidth: (PAGE_WIDTHS as readonly string[]).includes(o.pageWidth as string) ? (o.pageWidth as PageWidth) : DEFAULT_EXTRAS.pageWidth,
  };
}

/** The part of Storage this module uses, so tests (and a blocked browser storage) can stand in. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const APPEARANCE_KEY = 'bardic.reader.appearance';
export const EXTRAS_KEY = 'bardic.reader.extras';

function read(storage: KeyValueStorage | null | undefined, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined; // blocked or corrupt storage: the defaults apply
  }
}
function write(storage: KeyValueStorage | null | undefined, key: string, value: unknown): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // the choice still applies for this visit
  }
}

export function loadAppearance(storage?: KeyValueStorage | null): ReaderAppearanceValue {
  return normalizeAppearance(read(storage, APPEARANCE_KEY));
}
export function saveAppearance(storage: KeyValueStorage | null | undefined, value: ReaderAppearanceValue): boolean {
  return write(storage, APPEARANCE_KEY, normalizeAppearance(value));
}
export function loadExtras(storage?: KeyValueStorage | null): ReaderExtras {
  return normalizeExtras(read(storage, EXTRAS_KEY));
}
export function saveExtras(storage: KeyValueStorage | null | undefined, value: ReaderExtras): boolean {
  return write(storage, EXTRAS_KEY, normalizeExtras(value));
}

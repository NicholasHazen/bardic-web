// The palette of a book, computed from its cover. Rules are the `B1Palette` board's
// (docs/UI-GUIDE.md), fitted to the board's four worked examples (derive.test.ts).

export interface CoverSample {
  hex: string;
  hue: number; // degrees
  saturation: number; // 0 to 1
  lightness: number; // 0 to 1
  vivid: boolean;
}

export interface Palette {
  base: string;
  glow: string;
  glow2: string;
  accent: string;
  /** contrast of the accent on the base */
  accentRatio: number;
  /** false when the default palette was used */
  fromCover: boolean;
}

/** The default coral and amber palette (the Ash Ledger's), used with no usable sample. */
export const DEFAULT_HUE = 10.5;

const BASE_S = 0.38;
const BASE_L = 0.075;
const GLOW_S = 0.78;
const GLOW_L = 0.55;
// The guide says "about +40°". 39.7 is the shift that reproduces the board's four published
// values exactly (8-bit rounding of the cover colours the board shows).
const GLOW2_SHIFT = 39.7;
const GLOW2_S = 0.72;
const GLOW2_L = 0.5;
const ACCENT_S = 0.88;
const ACCENT_L0 = 0.72;
const ACCENT_STEP = 0.02;
const MIN_RATIO = 7;

export function hslToHex(h: number, s: number, l: number): string {
  const hh = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    const u = (t + 1) % 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  const c = [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)].map((v) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${c.join('')}`;
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function paletteFromHue(hue: number, fromCover: boolean): Palette {
  const base = hslToHex(hue, BASE_S, BASE_L);
  let l = ACCENT_L0;
  let accent = hslToHex(hue, ACCENT_S, l);
  while (contrast(accent, base) < MIN_RATIO && l < 0.98) {
    l += ACCENT_STEP;
    accent = hslToHex(hue, ACCENT_S, l);
  }
  return {
    base,
    glow: hslToHex(hue, GLOW_S, GLOW_L),
    glow2: hslToHex(hue + GLOW2_SHIFT, GLOW2_S, GLOW2_L),
    accent,
    accentRatio: contrast(accent, base),
    fromCover,
  };
}

/** The palette for a cover sample, or the default when there is none or it is not vivid. */
export function derivePalette(sample: CoverSample | null | undefined): Palette {
  if (!sample || !sample.vivid) return paletteFromHue(DEFAULT_HUE, false);
  return paletteFromHue(sample.hue, true);
}

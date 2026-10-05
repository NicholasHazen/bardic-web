import { derivePalette, type Palette } from './derive';

/** The hue (degrees) of a #rrggbb colour. */
export function hueOfHex(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** A book's palette from the flat colour of its cover (the sample's hex), when the full sample is not at hand. */
export function paletteFromHex(hex: string): Palette {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return derivePalette(null);
  return derivePalette({ hex, hue: hueOfHex(hex), saturation: 0.5, lightness: 0.5, vivid: true });
}

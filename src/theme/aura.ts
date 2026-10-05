import { contrast, type Palette } from './derive';

/** Bright cover colours need less glow behind tablet text and translucent glass. */
export function tabletGlows<T extends { color: string; opacity: number }>(glows: T[], palette?: Palette): T[] {
  if (!palette) return glows; // keep the authored default glow values without a book palette
  return glows.map((glow) => {
    const color = glow.color === 'var(--glow)' ? palette.glow : glow.color === 'var(--glow2)' ? palette.glow2 : null;
    if (!color) return glow;
    const luminance = (contrast(color, '#000000') - 1) / 20;
    // Preserve the hue, but cap its luminance contribution. Large tablet glows
    // otherwise make light chapter text fail even before the current-line mark.
    return { ...glow, opacity: glow.opacity * Math.min(1, 0.12 / luminance) };
  });
}

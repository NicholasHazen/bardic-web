import { describe, expect, it } from 'vitest';
import { derivePalette, paletteFromHue } from './derive';

// The four worked examples on the `B1Palette` board.
const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const board = [
  { name: 'The Ash Ledger', cover: '#c65a43', base: '#1a0e0c', glow: '#e65233', glow2: '#dbbd24', accent: '#f68f79', ratio: 8.2 },
  { name: 'Lanternfall', cover: '#3f6f8f', base: '#0c151a', glow: '#339ee6', glow2: '#2f24db', accent: '#79c4f6', ratio: 9.7 },
  { name: 'Hollow Tide', cover: '#4c7a5a', base: '#0c1a10', glow: '#33e669', glow2: '#24dbd5', accent: '#79f69f', ratio: 13.2 },
  { name: 'Winterhouse', cover: '#6b5a8c', base: '#110c1a', glow: '#7033e6', glow2: '#db24db', accent: '#b18cf8', ratio: 7.3 },
];

describe('palette from the cover', () => {
  for (const b of board) {
    it(`reproduces the board for ${b.name}`, () => {
      const p = derivePalette({ hex: b.cover, hue: hue(b.cover), saturation: 0.5, lightness: 0.5, vivid: true });
      expect(p).toMatchObject({ base: b.base, glow: b.glow, glow2: b.glow2, accent: b.accent, fromCover: true });
      expect(p.accentRatio.toFixed(1)).toBe(b.ratio.toFixed(1));
      expect(p.accentRatio).toBeGreaterThanOrEqual(7);
    });
  }

  it('uses the default coral palette with no sample or when the cover is not vivid', () => {
    const d = paletteFromHue(10.5, false);
    expect(derivePalette(null)).toEqual(d);
    expect(derivePalette({ hex: '#777777', hue: 0, saturation: 0, lightness: 0.5, vivid: false })).toEqual(d);
    expect(d.base).toBe('#1a0e0c');
    expect(d.accent).toBe('#f68f79');
  });

  it('keeps the accent at 7:1 or more for every hue', () => {
    for (let h = 0; h < 360; h += 5) expect(paletteFromHue(h, true).accentRatio).toBeGreaterThanOrEqual(7);
  });
});

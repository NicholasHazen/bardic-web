// Shared by design-refs and design-check.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const manifest = JSON.parse(fs.readFileSync(path.join(root, 'design/manifest.json'), 'utf8'));
export const deviations = JSON.parse(fs.readFileSync(path.join(root, 'design/deviations.json'), 'utf8'));
export const DEFAULT_TOLERANCE = 1.0; // percent of pixels that may differ

/** Render a page at a size and wait for fonts and for layout to settle. */
export async function shoot(browser, url, w, h, out) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  // Fonts load lazily as text is laid out: wait until none is still loading, then for two frames, so a
  // screenshot never catches a fallback glyph (this made some boards flicker between 0.5% and 1.0%).
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.fonts].every((f) => f.status !== 'loading'));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(400);
  await page.screenshot({ path: out });
  await ctx.close();
}

export function diff(aPath, bPath, outPath) {
  const a = PNG.sync.read(fs.readFileSync(aPath));
  const b = PNG.sync.read(fs.readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) {
    return { percent: 100, note: `size ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  const d = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, d.data, a.width, a.height, { threshold: 0.1, includeAA: false });
  fs.writeFileSync(outPath, PNG.sync.write(d));
  return { percent: (100 * n) / (a.width * a.height), pixels: n };
}

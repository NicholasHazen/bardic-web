// Render every board's canvas source to design/refs/<Board>.png in this machine's Chromium.
// The client is diffed against these (same engine, so the noise is near zero); the exported
// PNGs in design/boards/ stay the reference a person reviews.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { root, manifest, shoot } from './design-lib.mjs';

const only = process.argv[2];
fs.mkdirSync(path.join(root, 'design/refs'), { recursive: true });
const browser = await chromium.launch();
for (const [name, b] of Object.entries(manifest)) {
  if (only && name !== only) continue;
  await shoot(browser, `file://${root}/design/canvas/${name}.dc.html`, b.w, b.h, path.join(root, `design/refs/${name}.png`));
  process.stdout.write(`${name} `);
}
await browser.close();
console.log('\nrefs done');

// axe-core cannot decide color-contrast over blurred, translucent or gradient backgrounds ("incomplete"), and the glass
// screens are made of exactly those. This measures what is actually painted: hide the glyphs, screenshot the text's own line
// boxes, and compare the text colour (with its alpha and its ancestors' opacity) against the worst of the background pixels.
import { PNG } from 'pngjs';
import type { Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export async function contrastByPixels(page: Page, selectors: string[], cap = 30) {
  const out = { checked: 0, failing: [] as { selector: string; text: string; ratio: number; need: number }[], measured: [] as { selector: string; ratio: number; need: number }[] };
  await page.evaluate(() => { (window as any).__auditScrolls = [...document.querySelectorAll('*')].map((el) => [el, el.scrollLeft, el.scrollTop]); });
  // Keep color/currentColor intact: changing it also changes SVGs, borders and some
  // backgrounds. Hide only glyphs while preserving the compositor's backdrop.
  const style = await page.addStyleTag({ content: '*{-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}*::placeholder{-webkit-text-fill-color:transparent!important}' });
  await style.evaluate((el) => ((el as HTMLStyleElement).disabled = true)); // disabled until the rects are known
  try {
    for (const sel of [...new Set(selectors)].slice(0, cap)) {
      const info: any = await page.evaluate((s) => {
        let el: Element | null = null;
        try {
          el = document.querySelector(s);
        } catch {}
        if (!el || el.closest('[inert],[aria-hidden="true"],svg')) return null;
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        // behind a scrim or another screen: what is painted over it is not this element's background
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(Math.min(Math.max(b.x + b.width / 2, 0.5), innerWidth - 0.5), Math.min(Math.max(b.y + b.height / 2, 0.5), innerHeight - 0.5));
        const layer = (e: Element) => e.closest('[role=dialog],[aria-modal=true],dialog') ?? document.body;
        if (!hit || hit.matches('.scrim') || layer(hit) !== layer(el) || !(el === hit || el.contains(hit) || hit.contains(el))) return null;
        const runs: { x: number; y: number; w: number; h: number; rgba: number[] }[] = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let text = '';
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.nodeValue!.trim()) continue;
          text += n.nodeValue!.trim() + ' ';
          const parent = n.parentElement!;
          // CSS Color 4 returns normalized color(srgb ...) for color-mix, not
          // rgb's 0..255 channels. Let the browser convert every CSS color.
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = getComputedStyle(parent).color; ctx.fillRect(0, 0, 1, 1);
          const color = [...ctx.getImageData(0, 0, 1, 1).data];
          let op = 1;
          for (let e: Element | null = parent; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
          const r = document.createRange();
          r.selectNodeContents(n);
          for (const q of r.getClientRects()) if (q.width > 2 && q.height > 2) runs.push({ x: q.x, y: q.y, w: q.width, h: q.height, rgba: [color[0]!, color[1]!, color[2]!, color[3]! / 255 * op] });
        }
        return { runs: runs.slice(0, 12), text: text.trim().slice(0, 40) };
      }, sel);
      if (!info || !info.runs.length) continue;
      out.checked++;
      await style.evaluate((el) => ((el as HTMLStyleElement).disabled = false));
      let worst = Infinity;
      for (const r of info.runs as { x: number; y: number; w: number; h: number; rgba: number[] }[]) {
        const vw = page.viewportSize()!;
        const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
        const w = Math.min(vw.width, Math.ceil(r.x + r.w)) - x, h = Math.min(vw.height, Math.ceil(r.y + r.h)) - y;
        if (w < 2 || h < 2) continue;
        const png = PNG.sync.read(await page.screenshot({ clip: { x, y, width: w, height: h } }));
        const [tr, tg, tb, ta] = r.rgba;
        const ratios: number[] = [];
        for (let i = 0; i < png.data.length; i += 4) {
          const br = png.data[i]!, bg = png.data[i + 1]!, bb = png.data[i + 2]!;
          const fr = tr! * ta! + br * (1 - ta!), fg = tg! * ta! + bg * (1 - ta!), fb = tb! * ta! + bb * (1 - ta!);
          ratios.push(ratio(lum(fr, fg, fb), lum(br, bg, bb)));
        }
        ratios.sort((a, b) => a - b);
        worst = Math.min(worst, ratios[Math.floor(ratios.length * 0.05)]!); // 5th percentile: ignore single odd pixels
      }
      await style.evaluate((el) => ((el as HTMLStyleElement).disabled = true));
      if (!Number.isFinite(worst)) continue;
      const need = 4.5; // Bardic's spec requires 4.5:1 for every text size.
      out.measured.push({ selector: sel.slice(0, 160), ratio: Math.round(worst * 100) / 100, need });
      if (worst < need) out.failing.push({ selector: sel.slice(0, 160), text: info.text, ratio: Math.round(worst * 100) / 100, need });
    }
  } finally {
    await style.evaluate((el) => el.remove());
    await page.evaluate(() => { for (const [el, x, y] of (window as any).__auditScrolls) { el.scrollLeft = x; el.scrollTop = y; } delete (window as any).__auditScrolls; });
  }
  return out;
}

// Shared set-up for the audit specs: listeners, books, audiobooks and the synthetic 500-book library. Everything is
// original synthetic text; nothing paid is ever requested (the premium voice is the fake Gemini).
import { expect } from '@playwright/test';
import { apiCall } from '../harness';
import { zip } from '../zip';
import type { Fake } from '../fakes';

export const DEV = 'e2e-audit-device';
/* eslint-disable @typescript-eslint/no-explicit-any */

export const mkListener = async (api: string, name: string) => (await apiCall(api, 'POST', '/api/listeners', { name }, DEV)).json.id as string;

export async function importFile(api: string, listener: string | undefined, fileName: string, bytes: Uint8Array, type: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', new Blob([bytes as BlobPart], { type }), fileName);
  const r = await fetch(`${api}/api/imports`, { method: 'POST', headers: { 'x-bardic-device': DEV, ...(listener ? { 'x-bardic-listener': listener } : {}) }, body: fd });
  if (r.status !== 202) throw new Error(`import ${fileName}: ${r.status} ${await r.text()}`);
  const imp = await r.json();
  for (let i = 0; i < 600; i++) {
    const s = await (await fetch(`${api}/api/imports/${imp.id}`, { headers: { 'x-bardic-device': DEV } })).json();
    if (s.state === 'done') return s.book_id as string;
    if (s.state === 'failed') throw new Error(`import ${fileName} failed: ${JSON.stringify(s)}`);
    await new Promise((res) => setTimeout(res, i < 20 ? 10 : 40));
  }
  throw new Error(`import ${fileName} did not finish`);
}

/** The shape of the server's perf generator (crates/bardic-server/tests/perf.rs): 24 chapters of about 12 KB, made of
 * pronounceable nonsense, plus a rare marker in the last line. xorshift32 here instead of xorshift64: same shape, not same bits. */
const SYL = ['lan', 'tern', 'mor', 'wen', 'dar', 'ik', 'sol', 'eth', 'bra', 'vin', 'cor', 'ul', 'pe', 'ran', 'tho', 'mis', 'gal', 'or', 'fen', 'yl', 'ash', 'red', 'mar', 'it'];
export const CHAPTERS = 24;
export function bookText(n: number): string {
  let s = (0x9e3779b9 ^ Math.imul(n + 1, 0x12345679)) >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
  const out: string[] = [`Synthetic Volume ${n}\n\n`];
  for (let c = 1; c <= CHAPTERS; c++) {
    out.push(`Chapter ${c}\n\n`);
    let bytes = 0;
    while (bytes < 12_000) {
      const sentences: string[] = [];
      for (let k = 0, ns = 3 + (next() % 4); k < ns; k++) {
        const words: string[] = [];
        for (let w = 0, nw = 8 + (next() % 10); w < nw; w++) {
          let word = '';
          for (let y = 0, ny = 1 + (next() % 3); y < ny; y++) word += SYL[next() % 24];
          words.push(word);
        }
        sentences.push(words.join(' ') + '.');
      }
      const para = sentences.join(' ');
      bytes += para.length + 2;
      out.push(para, '\n\n');
    }
  }
  out.push('The very last line holds the zebracorn marker.\n');
  return out.join('');
}

export async function seedLibrary(api: string, count: number, concurrency = 4, log?: (s: string) => void): Promise<string[]> {
  const ids: string[] = new Array(count);
  let next = 0;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const n = next++;
        if (n >= count) return;
        ids[n] = await importFile(api, undefined, `vol${n}.txt`, Buffer.from(bookText(n)), 'text/plain');
      }
    }),
  );
  log?.(`seeded ${count} books in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return ids;
}

const para = (n: number, who: string) => Array.from({ length: n }, (_, i) => `<p>${who} ${i}: the tide came in at noon, and the lanterns burned low over the harbour wall.</p>`).join('');
/** "Tide Tables": four story chapters, for the premium voice. */
export function tideEpub(sizes = [30, 25, 35, 20]): Buffer {
  const chapters: [string, string][] = sizes.map((n, i) => [`Chapter ${i + 1} of the Tide`, para(n, `Tide${i}`)]);
  const files: Record<string, string> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'OEBPS/content.opf': `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Tide Tables</dc:title><dc:creator>A. Writer</dc:creator></metadata><manifest>${chapters.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`,
  };
  chapters.forEach(([t, body], i) => (files[`OEBPS/c${i}.xhtml`] = `<html><body><h1>${t}</h1>${body}</body></html>`));
  return zip(files);
}

export async function freeVoiceId(api: string, listener: string): Promise<string> {
  return (await apiCall(api, 'GET', '/api/voices?source_id=breeze', undefined, DEV, listener)).json.items[0].id as string;
}

/** A book with a free audiobook, every chapter made (or only `chapters` of them when given). */
export async function readyAudiobook(api: string, listener: string, book: string, voice: string): Promise<string> {
  const made = await apiCall(api, 'POST', `/api/books/${book}/audiobooks`, { voice_id: voice }, DEV, listener);
  expect([200, 201]).toContain(made.status);
  const ab = (await apiCall(api, 'GET', `/api/books/${book}/audiobooks`, undefined, DEV, listener)).json.items[0].id as string;
  await apiCall(api, 'POST', `/api/audiobooks/${ab}/make-ready`, { scope: { kind: 'whole_book' } }, DEV, listener);
  await expect
    .poll(async () => {
      const a = (await apiCall(api, 'GET', `/api/audiobooks/${ab}`, undefined, DEV, listener)).json;
      return a.chapters_ready >= a.chapters_total;
    }, { timeout: 60000 })
    .toBe(true);
  return ab;
}

export async function configureBreeze(api: string, breeze: Fake) {
  expect((await apiCall(api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, DEV)).status).toBe(200);
}

/** Median and max of a list of milliseconds. */
export function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const p = (q: number) => s[Math.min(s.length - 1, Math.floor((s.length - 1) * q + 0.5))]!;
  return { n: s.length, p50: Math.round(p(0.5) * 10) / 10, max: Math.round(s[s.length - 1]! * 10) / 10, min: Math.round(s[0]! * 10) / 10 };
}

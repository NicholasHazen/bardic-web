// W6 performance at 500 books (spec 10.1), in Chromium against a real bardic-server and the fake Breeze.
// 500 synthetic books (24 chapters, about 300 KB each, original nonsense text shaped like the server's perf generator) are
// imported once for the whole file. Every measurement is repeated 5 times; p50 and max are written to design/perf-report.json.
// The last test asserts the spec's numbers and prints everything measured. Machines differ: read the numbers, not only the verdict.
// Run on a quiet machine, ONE worker (parallel workers would measure each other):
//   VITE_E2E=1 BARDIC_DIST=dist-audit npx vite build --outDir dist-audit --emptyOutDir
//   BARDIC_DIST=dist-audit npx playwright test --config=playwright.audit.config.ts e2e/perf.spec.ts --output=/tmp/pw-audit
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { startStack, apiCall, type Running } from './harness';
import { startBreeze, type Fake } from './fakes';
import { silenceAudio } from './helpers/silentAudio';
import { DEV, configureBreeze, freeVoiceId, mkListener, readyAudiobook, seedLibrary, stats } from './helpers/world';

/* eslint-disable @typescript-eslint/no-explicit-any */
const REPORT = process.env.PERF_REPORT ? path.resolve(process.env.PERF_REPORT) : path.resolve(import.meta.dirname, '..', 'design', 'perf-report.json');
const BOOKS = Number(process.env.PERF_BOOKS ?? 500);
const RUNS = Number(process.env.PERF_RUNS ?? 5);
const PHONE = { width: 390, height: 844 };

interface Metric {
  what: string;
  unit: string;
  /** the spec's number, when there is one (section 10.1) */
  target?: number;
  /** what the target applies to: p50 or max */
  on?: 'p50' | 'max';
  values: number[];
  note?: string;
}
const metrics: Record<string, Metric> = {};
const facts: Record<string, unknown> = {};
const record = (key: string, m: Omit<Metric, 'values'>, v: number) => ((metrics[key] ??= { ...m, values: [] }).values.push(Math.round(v * 10) / 10), v);

let stack: Running, breeze: Fake, context: BrowserContext, page: Page, listener: string;
let ids: string[] = [];
let sample = '';
let newBooks: string[] = [];
let midBook = '';
let searchHits = 0;

test.describe.configure({ mode: 'serial', timeout: 20 * 60_000 });

const MARKS = `
  (() => {
    const t = (window.__perf = { t: {}, tiles: 0, nodes: 0 });
    const sel = 'a[href^="#/book/"]';
    const mark = (k) => { if (!(k in t.t)) t.t[k] = performance.now(); };
    const check = () => {
      const n = document.querySelectorAll(sel).length;
      t.tiles = n;
      if (n > 0) mark('firstTile');
      if (n >= ${BOOKS}) mark('allTiles');
      if (window.__want !== undefined && n === window.__want && window.__lastKey !== undefined) mark('wanted');
    };
    new MutationObserver(check).observe(document, { subtree: true, childList: true });
    addEventListener('keydown', () => { window.__lastKey = performance.now(); delete t.t.wanted; }, true);
    addEventListener('click', () => { t.t.click = performance.now(); }, true);
    // the search results of a book
    new MutationObserver(() => { if (document.querySelector('ul[aria-label="Results"] li') && window.__lastKey !== undefined) mark('results'); }).observe(document, { subtree: true, childList: true });
    // resume: the player has the chapter's audio and knows its length
    const poll = setInterval(() => {
      const p = window.__player;
      if (!p) return;
      let st; p.subscribe((v) => (st = v))();
      if (st.loaded && st.chapter && st.duration > 0) mark('resumed');
      if (st.playing && st.listening === 'playing') mark('playing');
    }, 5);
    addEventListener('pagehide', () => clearInterval(poll));
  })();
`;

test.beforeAll(async ({ browser }) => {
  breeze = await startBreeze();
  stack = await startStack();
  listener = await mkListener(stack.api, 'Perf');
  await configureBreeze(stack.api, breeze);
  const t0 = Date.now();
  ids = await seedLibrary(stack.api, BOOKS, 4, (s) => console.log(s));
  facts.seedSeconds = Math.round((Date.now() - t0) / 100) / 10;
  // places for a fifth of the library, as the server's own perf test does, so Home and the filters have work to do
  for (let i = 0; i < ids.length; i += 5) {
    const chs = (await apiCall(stack.api, 'GET', `/api/books/${ids[i]}/chapters`, undefined, DEV, listener)).json.items as { id: string }[];
    await apiCall(stack.api, 'PUT', `/api/books/${ids[i]}/place`, { chapter_id: chs[3]!.id, offset: 10, mode: 'reading', base_revision: 0 }, DEV, listener);
  }
  // the one book with every chapter made (the sample, three short chapters) and a place in chapter 2
  sample = (await apiCall(stack.api, 'POST', '/api/books/sample', {}, DEV, listener)).json.id;
  const voice = await freeVoiceId(stack.api, listener);
  const ab = await readyAudiobook(stack.api, listener, sample, voice);
  const sc = (await apiCall(stack.api, 'GET', `/api/books/${sample}/chapters`, undefined, DEV, listener)).json.items as { id: string }[];
  await apiCall(stack.api, 'PUT', `/api/books/${sample}/place`, { chapter_id: sc[1]!.id, offset: 40, mode: 'listening', audiobook_id: ab, base_revision: 0 }, DEV, listener);
  // books with a voice chosen and nothing made yet: "press Listen on a new book"
  newBooks = ids.slice(10, 10 + RUNS);
  for (const b of newBooks) await apiCall(stack.api, 'POST', `/api/books/${b}/audiobooks`, { voice_id: voice }, DEV, listener);
  midBook = ids[Math.floor(BOOKS / 2)]!;
  const q = await apiCall(stack.api, 'GET', '/api/books?limit=200&q=vol4', undefined, DEV, listener);
  searchHits = q.json.items.length + (q.json.next ? 1000 : 0);
  facts.books = BOOKS + 1;
  facts.libraryQueryVol4Matches = searchHits;

  context = await browser.newContext({ baseURL: stack.url, viewport: PHONE });
  await silenceAudio(context);
  context.setDefaultTimeout(30_000);
  await context.addInitScript(MARKS);
  page = await context.newPage();
  await page.goto('/?e2e=player');
  await page.getByRole('button', { name: /^Perf/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Perf/ })).toBeVisible();
});
test.afterAll(async () => {
  const out: Record<string, unknown> = {
    generated: new Date().toISOString().slice(0, 10),
    machine: { cpus: os.cpus().length, cpu: os.cpus()[0]?.model, memGB: Math.round(os.totalmem() / 2 ** 30), platform: `${os.platform()} ${os.release()}`, node: process.version },
    browser: 'Chromium (Playwright, headless), phone viewport 390x844, same machine as the server, loopback network, fake Breeze',
    runs: RUNS,
    ...facts,
    metrics: Object.fromEntries(
      Object.entries(metrics).map(([k, m]) => {
        const s = stats(m.values);
        const v = m.target === undefined ? undefined : (m.on === 'max' ? s.max : s.p50) <= m.target;
        return [k, { what: m.what, unit: m.unit, ...(m.target !== undefined ? { target: m.target, targetOn: m.on ?? 'p50', meetsTarget: v } : { informational: true }), ...s, values: m.values, ...(m.note ? { note: m.note } : {}) }];
      }),
    ),
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  if (Object.keys(metrics).length) fs.writeFileSync(REPORT, JSON.stringify(out, null, 1) + '\n');
  await context?.close();
  await stack?.stop();
  await breeze?.stop();
});

const load = async (hash: string) => {
  await page.goto('about:blank');
  await page.goto(`/?e2e=player#${hash}`);
};
const perf = () => page.evaluate(() => (window as any).__perf as { t: Record<string, number>; tiles: number });
const bookResponses = () =>
  page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('/api/books?'))
      .map((e) => ({ start: e.startTime, end: (e as PerformanceResourceTiming).responseEnd })),
  );

test('library: first page, whole grid, DOM size', async () => {
  for (let i = 0; i < RUNS; i++) {
    await load('/library');
    await page.waitForFunction((n) => (window as any).__perf?.t.allTiles !== undefined || (window as any).__perf?.tiles >= n, BOOKS, { timeout: 30000 });
    await page.waitForTimeout(300);
    const p = await perf();
    const rs = await bookResponses();
    // SSE can trigger a later refresh. Only responses that arrived before the measured paint belong to this load.
    const first = rs.filter((r) => r.end <= p.t.firstTile!)[0]!;
    const last = rs.filter((r) => r.end <= p.t.allTiles!).at(-1)!;
    record('library.firstTile.fromNavigation', { what: 'Library: navigation to the first book tile on screen', unit: 'ms' }, p.t.firstTile!);
    record('library.firstTile.afterData', { what: 'Library: first book tile on screen, counted from the first book list response arriving', unit: 'ms' }, p.t.firstTile! - first.end);
    record('library.allTiles.afterLastData', { what: 'Library: all tiles rendered, counted from the last book list response arriving (spec: opens in under 1 s after data arrives)', unit: 'ms', target: 1000, on: 'max' }, p.t.allTiles! - last.end);
    record('library.allTiles.fromNavigation', { what: 'Library: navigation to all tiles rendered', unit: 'ms' }, p.t.allTiles!);
    facts.libraryBookRequests = rs.length;
    const dom = await page.evaluate(() => ({ nodes: document.querySelectorAll('*').length, tiles: document.querySelectorAll('a[href^="#/book/"]').length, imgs: document.querySelectorAll('img').length }));
    facts.libraryDom = { ...dom, virtualised: dom.tiles < BOOKS, note: dom.tiles >= BOOKS ? 'every tile is in the DOM (no virtualisation or paging)' : 'tiles are windowed' };
    const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0);
    record('library.firstContentfulPaint', { what: 'Library: first contentful paint from navigation', unit: 'ms' }, fcp);
  }
});

test('home: first page', async () => {
  for (let i = 0; i < RUNS; i++) {
    await load('/');
    await page.waitForFunction(() => (window as any).__perf?.t.firstTile !== undefined, undefined, { timeout: 30000 });
    await page.waitForTimeout(300);
    const p = await perf();
    const rs = await bookResponses();
    const last = rs.filter((r) => r.end <= p.t.firstTile!).at(-1)!;
    record('home.firstTile.fromNavigation', { what: 'Home: navigation to the first book tile on screen', unit: 'ms' }, p.t.firstTile!);
    record('home.firstTile.afterData', { what: 'Home: first tile on screen, counted from the last book list response arriving (spec: under 1 s after data arrives)', unit: 'ms', target: 1000, on: 'max' }, p.t.firstTile! - last.end);
    facts.homeBookRequests = rs.length;
    facts.homeTiles = p.tiles;
  }
});

test('library: scroll jank and memory', async () => {
  const cdp = await context.newCDPSession(page);
  for (let i = 0; i < RUNS; i++) {
    await load('/library');
    await page.waitForFunction((n) => (window as any).__perf?.t.allTiles !== undefined, BOOKS, { timeout: 30000 });
    await page.waitForTimeout(500);
    const r = await page.evaluate(async () => {
      // find what scrolls: the element with the most hidden height, or the page
      const cands = [document.scrollingElement!, ...document.querySelectorAll<HTMLElement>('div,main,section')];
      const el = cands.map((e) => ({ e, extra: e.scrollHeight - e.clientHeight })).filter((c) => c.extra > 200).sort((a, b) => b.extra - a.extra)[0]!;
      const max = el.extra;
      const longtasks: number[] = [];
      const po = new PerformanceObserver((l) => l.getEntries().forEach((x) => longtasks.push(x.duration)));
      po.observe({ type: 'longtask', buffered: false });
      const frames: number[] = [];
      const DURATION = 2500;
      await new Promise<void>((done) => {
        let t0 = 0, last = 0;
        const step = (t: number) => {
          if (!t0) t0 = last = t;
          frames.push(t - last);
          last = t;
          const k = Math.min(1, (t - t0) / DURATION);
          el.e.scrollTop = k * max;
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
      po.disconnect();
      const f = frames.slice(1);
      return { distance: Math.round(max), frames: f.length, slowFrames: f.filter((d) => d > 50).length, maxFrame: Math.round(Math.max(...f)), longtasks: longtasks.length, longMs: Math.round(longtasks.reduce((a, b) => a + b, 0)), maxLong: Math.round(Math.max(0, ...longtasks)) };
    });
    record('library.scroll.longTasks', { what: 'Library: long tasks (over 50 ms) during a programmatic scroll through all tiles in 2.5 s', unit: 'count' }, r.longtasks);
    record('library.scroll.maxLongTask', { what: 'Library: the longest task during that scroll', unit: 'ms' }, r.maxLong);
    record('library.scroll.slowFrames', { what: 'Library: frames over 50 ms during that scroll (headless, software rendering)', unit: 'count' }, r.slowFrames);
    record('library.scroll.maxFrame', { what: 'Library: the longest frame during that scroll', unit: 'ms' }, r.maxFrame);
    facts.libraryScrollDistancePx = r.distance;
    await page.evaluate(() => (window as any).gc?.());
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage');
    const dom = await cdp.send('Memory.getDOMCounters');
    record('library.memory.jsHeapMB', { what: `Library (${BOOKS + 1} tiles): JS heap in use after a garbage collection`, unit: 'MB' }, heap.usedSize / 2 ** 20);
    record('library.memory.domNodes', { what: `Library (${BOOKS + 1} tiles): DOM nodes`, unit: 'count' }, dom.nodes);
    record('library.memory.listeners', { what: `Library (${BOOKS + 1} tiles): event listeners`, unit: 'count' }, dom.jsEventListeners);
  }
});

test('library: search from keypress to results', async () => {
  await load('/library');
  await page.waitForFunction(() => (window as any).__perf?.t.allTiles !== undefined, undefined, { timeout: 30000 });
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const field = page.getByRole('searchbox', { name: 'Find a book' });
  const want = searchHits >= 1000 ? 200 : searchHits;
  for (let i = 0; i < RUNS; i++) {
    await field.fill('');
    await page.waitForFunction((n) => document.querySelectorAll('a[href^="#/book/"]').length >= n, BOOKS, { timeout: 15000 });
    await page.evaluate((w) => {
      const p = (window as any).__perf;
      delete p.t.wanted;
      (window as any).__want = w;
      (window as any).__lastKey = undefined;
    }, want);
    await field.focus();
    await page.keyboard.type('vol4', { delay: 40 });
    await page.waitForFunction(() => (window as any).__perf.t.wanted !== undefined, undefined, { timeout: 15000 }).catch(() => {});
    const t = await page.evaluate(() => ((window as any).__perf.t.wanted ?? NaN) - (window as any).__lastKey);
    record('library.search.keypressToResults', { what: 'Library: last keypress of "vol4" to the matching tiles on screen (includes the 250 ms typing pause)', unit: 'ms', note: `the server answers q= in a few ms; the UI waits 250 ms after the last key; ${searchHits >= 1000 ? 'matches exceed one page' : searchHits + ' matches'}` }, t);
  }
  await page.evaluate(() => ((window as any).__want = undefined));
});

test('book: search from keypress to results', async () => {
  for (const word of ['zebracorn', 'lantern']) {
    for (let i = 0; i < RUNS; i++) {
      await load(`/listen/${midBook}`);
      await page.getByRole('radio', { name: 'Read' }).click();
      await page.getByText(/Chapter \d+ of/i).waitFor({ timeout: 20000 });
      await page.keyboard.press('ControlOrMeta+f');
      const field = page.getByRole('searchbox', { name: 'Find in this book' });
      await field.waitFor();
      await page.evaluate(() => ((window as any).__lastKey = undefined));
      await field.focus();
      await page.keyboard.type(word, { delay: 30 });
      await page.waitForFunction(() => (window as any).__perf.t.results !== undefined, undefined, { timeout: 15000 });
      const t = await page.evaluate(() => (window as any).__perf.t.results - (window as any).__lastKey);
      record(`book.search.${word}`, { what: `In-book search for "${word}": last keypress to results on screen (includes the typing pause)`, unit: 'ms', ...(word === 'zebracorn' ? {} : {}) }, t);
      record('book.search.worst', { what: 'In-book search, either word: last keypress to results on screen (spec: within 500 ms)', unit: 'ms', target: 500, on: 'max' }, t);
    }
  }
});

test('resume and first audio', async () => {
  for (let i = 0; i < RUNS; i++) {
    // Resume includes the user's Play gesture; loading audio alone does not prove playback resumes.
    await load(`/listen/${sample}`);
    await page.waitForFunction(() => (window as any).__perf?.t.resumed !== undefined, undefined, { timeout: 20000 });
    record('resume.toReady', { what: 'Stored place: navigation to #/listen/<id> to the chapter loaded and ready to play', unit: 'ms' }, (await perf()).t.resumed!);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => (window as any).__perf?.t.playing !== undefined, undefined, { timeout: 20000 });
    const resumed = await perf();
    record('resume.toPlaying', { what: 'Resume from a stored place: Play pressed to playback from that place (same network)', unit: 'ms', target: 2000, on: 'max' }, resumed.t.playing! - resumed.t.click!);
  }
  for (let i = 0; i < RUNS; i++) {
    // first audio on a chapter that is already made: Listen pressed to sound playing
    await load(`/book/${sample}`);
    await page.getByRole('button', { name: /^(Listen|Continue listening)$/ }).click();
    await page.waitForFunction(() => (window as any).__perf?.t.playing !== undefined, undefined, { timeout: 20000 });
    const p = await perf();
    record('firstAudio.readyChapter', { what: 'First audio on an already-made chapter: Listen pressed to playing', unit: 'ms', target: 2000, on: 'max' }, p.t.playing! - p.t.click!);
  }
  for (let i = 0; i < RUNS; i++) {
    // first audio on a new book: a voice is chosen, nothing is made; the free voice (fake Breeze) makes the first chapter
    const before = breeze.spoken.length;
    await load(`/book/${newBooks[i]}`);
    await page.getByRole('button', { name: /^(Listen|Continue listening)$/ }).click({ timeout: 20000 });
    await page.waitForFunction(() => (window as any).__perf?.t.playing !== undefined, undefined, { timeout: 40000 });
    const p = await perf();
    expect(breeze.spoken.length).toBeGreaterThan(before);
    record('firstAudio.newBook', { what: 'First audio on a new book (fake Breeze: instant voice, 24 chapters of about 12 KB): Listen pressed to playing', unit: 'ms', target: 10000, on: 'p50', note: 'the fake voice answers at once, so this is Bardic overhead only; a real Breeze takes about as long as the audio lasts' }, p.t.playing! - p.t.click!);
  }
});

test('verdict: the spec numbers', async () => {
  const lines = Object.entries(metrics).map(([k, m]) => {
    const s = stats(m.values);
    return `${k.padEnd(38)} p50 ${String(s.p50).padStart(8)}  max ${String(s.max).padStart(8)} ${m.unit}${m.target !== undefined ? `   target ${m.target} on ${m.on ?? 'p50'}` : ''}`;
  });
  console.log('\n' + lines.join('\n') + '\n' + JSON.stringify({ libraryDom: facts.libraryDom, homeTiles: facts.homeTiles, seedSeconds: facts.seedSeconds }));
  for (const [k, m] of Object.entries(metrics)) {
    expect(m.values.length, `${k} was not measured in every run`).toBeGreaterThanOrEqual(RUNS);
    expect(m.values.every(Number.isFinite), `${k} includes a missing measurement`).toBe(true);
    if (m.target === undefined) continue;
    const s = stats(m.values);
    const v = m.on === 'max' ? s.max : s.p50;
    expect.soft(v, `${k}: ${m.what}. Measured p50 ${s.p50} ms, max ${s.max} ms; the spec says ${m.target} ms on the ${m.on ?? 'p50'}`).toBeLessThanOrEqual(m.target);
  }
  expect(Object.keys(metrics).length, 'the measurement tests did not run').toBeGreaterThan(5);
});

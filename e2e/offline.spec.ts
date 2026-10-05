// The offline engine (O1 to O8) against a real bardic-server and the fake Breeze, in a real browser. There are no offline
// screens in this file's scope, so the engine is driven through `window.__offline` (src/offline/testhost.ts, only in a
// VITE_E2E build and only with ?e2e=offline). "Offline" is made two ways at once where it matters: Playwright's
// context.setOffline(true), and a route that aborts /api/**.
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import type { BrowserContext, Page, Route } from '@playwright/test';
import type { Fake } from './fakes';
import { reloadCachedPage } from './helpers/offlineReload';

const DEV = 'e2e-offline-device';
type Stack = { api: string; url: string };
/* eslint-disable @typescript-eslint/no-explicit-any */
const off = (page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as any).__offline[f as string](...(a as unknown[])), [fn, args] as const);
const state = (page: Page) => page.evaluate(() => new Promise<any>((r) => (window as any).__offline.subscribe((s: unknown) => r(JSON.parse(JSON.stringify(s)))) && undefined));
const book = async (page: Page, ab: string) => (await state(page)).books.find((b: any) => b.audiobookId === ab);
const chapterStates = async (page: Page, ab: string) => ((await book(page, ab))?.chapters ?? []).map((c: any) => c.state) as string[];

async function signIn(page: Page, stack: Stack) {
  const l = (await apiCall(stack.api, 'POST', '/api/listeners', { name: 'Nick' })).json.id as string;
  await page.goto('/?e2e=offline');
  await page.getByRole('button', { name: /^Nick/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__offline);
  return l;
}

async function readyBook(stack: Stack, breeze: Fake, l: string) {
  await apiCall(stack.api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, DEV);
  const book = (await apiCall(stack.api, 'POST', '/api/books/sample', {}, DEV, l)).json.id as string;
  const voice = (await apiCall(stack.api, 'GET', '/api/voices?source_id=breeze', undefined, DEV, l)).json.items[0].id;
  await apiCall(stack.api, 'POST', `/api/books/${book}/audiobooks`, { voice_id: voice }, DEV, l);
  const ab = (await apiCall(stack.api, 'GET', `/api/books/${book}/audiobooks`, undefined, DEV, l)).json.items[0].id as string;
  await apiCall(stack.api, 'POST', `/api/audiobooks/${ab}/make-ready`, { scope: { kind: 'whole_book' } }, DEV, l);
  await expect
    .poll(async () => {
      const a = (await apiCall(stack.api, 'GET', `/api/audiobooks/${ab}`, undefined, DEV, l)).json;
      return a.chapters_ready >= a.chapters_total;
    }, { timeout: 30000 })
    .toBe(true);
  return { book, ab };
}

const manifest = async (stack: Stack, ab: string) => (await apiCall(stack.api, 'GET', `/api/audiobooks/${ab}/manifest`, undefined, DEV)).json.chapters as { chapter_id: string; audio: { id: string; bytes: number; sha256: string; duration_seconds: number }; text_sha256: string }[];

/** Set up a signed-in page with a ready book. */
async function setup(page: Page, stack: Stack, breeze: Fake) {
  const l = await signIn(page, stack);
  const ids = await readyBook(stack, breeze, l);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__offline);
  return { l, ...ids };
}

const downloadAll = async (page: Page, ab: string, opts = { wifiOnly: false, keepNew: false }) => {
  await off(page, 'start', ab, { kind: 'ready_now' }, opts);
  await expect.poll(() => chapterStates(page, ab), { timeout: 30000 }).toEqual(['on_device', 'on_device', 'on_device']);
};

const cut = async (context: BrowserContext) => {
  await context.route('**/api/**', (r) => r.abort('connectionrefused'));
};

test('O1: the preview matches the manifest, and a download makes every ready chapter On this device', async ({ page, stack, breeze }) => {
  const { ab } = await setup(page, stack, breeze);
  const m = await manifest(stack, ab);
  const total = m.reduce((n, c) => n + c.audio.bytes, 0);
  const p = await off(page, 'preview', ab, { kind: 'ready_now' });
  expect(p).toMatchObject({ chaptersToGet: 3, bytes: total, notReadyYet: 0 });
  expect(p.freeBytes === null || p.freeBytes > 0).toBe(true);
  expect(p.fits === null || p.fits === true).toBe(true);
  expect(await chapterStates(page, ab)).toEqual([]);
  await downloadAll(page, ab);
  const b = await book(page, ab);
  expect(b).toMatchObject({ status: 'idle', heldBytes: total, remainingBytes: 0 });
  expect(b.chapters.map((c: any) => c.bytes)).toEqual(m.map((c) => c.audio.bytes));
  // what is stored is what the manifest promised: size and hash, per chapter
  const stored = await page.evaluate(async (ab) => {
    const kit = (window as any).__offlineKit;
    const out: { chapterId: string; bytes: number; sha256: string; audioId: string }[] = [];
    for (const r of await kit.realStore.chapters(ab)) out.push({ chapterId: r.chapterId, bytes: (await kit.realStore.readAudio(r.audioId)).size, sha256: r.sha256, audioId: r.audioId });
    return out;
  }, ab);
  expect(stored.map((s) => [s.chapterId, s.bytes, s.sha256, s.audioId]).sort()).toEqual(m.map((c) => [c.chapter_id, c.audio.bytes, c.audio.sha256, c.audio.id]).sort());
  expect((await state(page)).storage.usedBytes).toBeGreaterThanOrEqual(total);
  // it survives a reload and is checked on open
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__offline);
  await expect.poll(() => chapterStates(page, ab)).toEqual(['on_device', 'on_device', 'on_device']);
});

test.describe('cached app shell', () => {
test.use({ serviceWorkers: 'allow' });
test('O3: with the server cut, held chapters play and read, and the app shell reloads from the service worker', async ({ page, context, stack, breeze }) => {
  const { ab, book: bookId, l } = await setup(page, stack, breeze);
  await downloadAll(page, ab);
  const chapters = (await apiCall(stack.api, 'GET', `/api/books/${bookId}/chapters`, undefined, DEV, l)).json.items as { id: string }[];
  const text = (await apiCall(stack.api, 'GET', `/api/books/${bookId}/chapters/${chapters[0]!.id}/text`, undefined, DEV, l)).json;
  // the worker has the shell before the network goes
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('bardic-app-')) && !!(await caches.match('/index.html')) && !!navigator.serviceWorker.controller), { timeout: 15000 })
    .toBe(true);
  stack.setReachable(false);
  await reloadCachedPage(page);
  await page.waitForFunction(() => !!(window as any).__offline, undefined, { timeout: 15000 });
  await expect(page).toHaveTitle('Bardic');
  expect(await page.locator('#app').innerHTML()).not.toBe('');
  // the server is really out of reach
  expect(await page.evaluate(() => fetch('/api/health').then(() => 'reached', () => 'cut'))).toBe('cut');
  await expect.poll(() => chapterStates(page, ab)).toEqual(['on_device', 'on_device', 'on_device']);
  // the held chapter: exact text, timings, and sound that really plays
  const held = await page.evaluate((a) => (window as any).__offline.heldChapter(a.ab, a.ch), { ab, ch: chapters[0]!.id });
  expect(held.text).toBe(text.text);
  expect(held.lines).toEqual(text.lines);
  expect(held.timings.length).toBeGreaterThan(0);
  expect(held.audioUrl).toMatch(/^blob:/);
  await page.mouse.click(10, 10); // a gesture, so the browser lets sound start
  const played = await page.evaluate(async (url) => {
    const a = new Audio(url);
    a.volume = 0;
    await a.play();
    const t0 = a.currentTime;
    await new Promise((r) => setTimeout(r, 400));
    return { t0, t1: a.currentTime, error: a.error?.code ?? null, duration: a.duration };
  }, held.audioUrl);
  expect(played.error).toBeNull();
  expect(played.t1).toBeGreaterThan(played.t0);
  expect(played.duration).toBeGreaterThan(0);
  // and the engine knows it is cut off
  await off(page, 'refresh');
  expect((await state(page)).online).toBe(false);
  stack.setReachable(true);
});
});

test('O2: a connection that drops keeps its bytes and carries on by Range; pause keeps them; cancel keeps what finished; retry only the failed', async ({ page, context, stack, breeze }) => {
  const { ab } = await setup(page, stack, breeze);
  const m = await manifest(stack, ab);
  const first = m[0]!.audio;
  const ranges: string[] = [];
  let cutShort = true;
  let hold: ((v: void) => void) | null = null;
  let holdNext = false;
  await context.route('**/api/audio/*', async (route: Route) => {
    const req = route.request();
    const id = req.url().split('/').pop()!;
    if (id !== first.id) return route.continue();
    ranges.push(req.headers()['range'] ?? '');
    if (cutShort) {
      // the body ends after 40% of the file, as if the connection dropped
      cutShort = false;
      const res = await route.fetch();
      const body = await res.body();
      return route.fulfill({ status: 200, headers: { 'content-type': 'audio/wav' }, body: body.subarray(0, Math.floor(body.length * 0.4)) });
    }
    if (holdNext) {
      await new Promise<void>((r) => (hold = r));
    }
    return route.continue().catch(() => {});
  });
  holdNext = true;
  await off(page, 'start', ab, { kind: 'chapters', chapterIds: [m[0]!.chapter_id] }, { wifiOnly: false, keepNew: false });
  const kept = Math.floor(first.bytes * 0.4);
  // the second request (the retry) is held; meanwhile the first 40% is kept in the store
  await expect.poll(() => ranges.length, { timeout: 15000 }).toBe(2);
  expect(ranges[1]).toBe(`bytes=${kept}-`);
  const partial = () => page.evaluate((id) => (window as any).__offlineKit.realStore.partial(id).then((p: any) => p.bytes), first.id);
  expect(await partial()).toBe(kept);
  // pause while it waits: the bytes stay
  await off(page, 'pause', ab);
  await expect.poll(async () => (await book(page, ab)).status).toBe('paused');
  expect(await partial()).toBe(kept);
  holdNext = false;
  hold?.();
  await off(page, 'resume', ab);
  await expect.poll(() => chapterStates(page, ab), { timeout: 20000 }).toEqual(['on_device', 'not_downloaded', 'not_downloaded']);
  expect(ranges.at(-1)).toBe(`bytes=${kept}-`);
  expect(ranges.length).toBeGreaterThanOrEqual(3);

  // cancel keeps the chapter that finished; the one in flight is forgotten
  const second = m[1]!.audio;
  let release: ((v: void) => void) | null = null;
  await context.route(`**/api/audio/${second.id}`, async (route) => {
    await new Promise<void>((r) => (release = r));
    await route.continue().catch(() => {});
  });
  await off(page, 'start', ab, { kind: 'ready_now' }, { wifiOnly: false, keepNew: false });
  await expect.poll(() => chapterStates(page, ab)).toEqual(['on_device', 'downloading', 'queued']);
  await off(page, 'cancel', ab);
  await expect.poll(() => chapterStates(page, ab)).toEqual(['on_device', 'not_downloaded', 'not_downloaded']);
  (release as ((v: void) => void) | null)?.();
  await context.unroute(`**/api/audio/${second.id}`);

  // a chapter that arrives wrong fails alone; retry fetches only it
  await context.route(`**/api/audio/${second.id}`, async (route) => {
    const res = await route.fetch();
    const body = Buffer.from(await res.body());
    body[Math.floor(body.length / 2)] = body[Math.floor(body.length / 2)]! ^ 0xff;
    await route.fulfill({ status: 200, headers: { 'content-type': 'audio/wav' }, body });
  });
  await off(page, 'start', ab, { kind: 'ready_now' }, { wifiOnly: false, keepNew: false });
  await expect.poll(() => chapterStates(page, ab), { timeout: 20000 }).toEqual(['on_device', 'failed', 'on_device']);
  const b = await book(page, ab);
  expect(b.chapters[1].error).toMatch(/^The other chapters are kept\./);
  await context.unroute(`**/api/audio/${second.id}`);
  await off(page, 'retry', ab, m[1]!.chapter_id);
  await expect.poll(() => chapterStates(page, ab), { timeout: 20000 }).toEqual(['on_device', 'on_device', 'on_device']);
});

test('O2: a full device stops with what finished kept, and says so', async ({ page, stack, breeze }) => {
  const { ab } = await setup(page, stack, breeze);
  const m = await manifest(stack, ab);
  const limit = m[0]!.audio.bytes + Math.floor(m[1]!.audio.bytes / 2);
  await page.evaluate(([ab, limit]) => {
    const full = (window as any).__offlineKit.fullDevice(limit);
    (window as any).__full = full.engine;
    return full.engine.start(ab, { kind: 'ready_now' }, { wifiOnly: false, keepNew: false });
  }, [ab, limit] as const);
  await expect
    .poll(() => page.evaluate(() => new Promise<string>((r) => (window as any).__full.subscribe((s: any) => r(s.books[0]?.status ?? '')))), { timeout: 20000 })
    .toBe('device_full');
  const s = await page.evaluate(() => new Promise<any>((r) => (window as any).__full.subscribe((s: any) => r(JSON.parse(JSON.stringify(s))))));
  expect(s.books[0].chapters.map((c: any) => c.state)).toEqual(['on_device', 'queued', 'queued']);
  expect(s.books[0].message).toMatch(/^The 1 chapter on this device is kept\. This device has no room/);
  expect(await page.evaluate((ab) => (window as any).__full.heldChapter(ab, (window as any).__full.heldChapters(ab).values().next().value).then((h: any) => !!h?.audioUrl), ab)).toBe(true);
});

test('O6: newer audio is offered, never applied by itself, replaces only the chapters chosen, and Keep what I have is not offered again', async ({ page, stack, breeze }) => {
  const { ab, l } = await setup(page, stack, breeze);
  await downloadAll(page, ab);
  const m = await manifest(stack, ab);
  const heldId = (ch: string) => page.evaluate(async ([ab, ch]) => (await (window as any).__offlineKit.realStore.chapter(ab, ch))?.audioId as string, [ab, ch] as const);
  const remake = async (chapterIds: string[]) => {
    // the server's own flow: free the audiobook's audio, then make chapters again (a later audio for the same chapter)
    expect((await apiCall(stack.api, 'DELETE', `/api/audiobooks/${ab}/space`, undefined, DEV)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 1100));
    await apiCall(stack.api, 'POST', `/api/audiobooks/${ab}/make-ready`, { scope: { kind: 'chapters', chapter_ids: chapterIds } }, DEV, l);
    await expect
      .poll(async () => (await manifest(stack, ab)).map((c) => c.chapter_id).sort(), { timeout: 30000 })
      .toEqual([...chapterIds].sort());
  };
  const [c1, c2, c3] = m.map((c) => c.chapter_id) as [string, string, string];
  const old = { c1: await heldId(c1), c2: await heldId(c2), c3: await heldId(c3) };
  await remake([c2, c3]);
  await off(page, 'checkUpdates');
  let s = await state(page);
  expect(s.updates.map((u: any) => u.chapterId).sort()).toEqual([c2, c3].sort());
  const offer = s.updates.find((u: any) => u.chapterId === c2);
  expect(offer.held.bytes).toBe(m[1]!.audio.bytes);
  expect(offer.held.voiceName).toBe(offer.newer.voiceName);
  expect(await chapterStates(page, ab)).toEqual(['on_device', 'out_of_date', 'out_of_date']);
  // nothing was replaced by asking, and the old copies still play (their server audio is gone)
  expect([await heldId(c1), await heldId(c2), await heldId(c3)]).toEqual([old.c1, old.c2, old.c3]);
  expect(await page.evaluate(([ab, ch]) => (window as any).__offline.heldChapter(ab, ch).then((h: any) => !!h), [ab, c2] as const)).toBe(true);
  // update chapter 2 only
  await off(page, 'applyUpdate', ab, [c2]);
  const now = (await manifest(stack, ab)).find((c) => c.chapter_id === c2)!.audio;
  expect(await heldId(c2)).toBe(now.id);
  expect(await heldId(c2)).not.toBe(old.c2);
  expect(await heldId(c3)).toBe(old.c3);
  expect(await heldId(c1)).toBe(old.c1);
  s = await state(page);
  expect(s.updates.map((u: any) => u.chapterId)).toEqual([c3]);
  expect(await chapterStates(page, ab)).toEqual(['on_device', 'on_device', 'out_of_date']);
  // keep what I have for chapter 3: not offered again, not even after a check
  await off(page, 'keepOld', ab, [c3]);
  await off(page, 'checkUpdates');
  expect((await state(page)).updates).toEqual([]);
  expect(await heldId(c3)).toBe(old.c3);
  // the server makes chapter 3 again: offered again
  await remake([c3]);
  await off(page, 'checkUpdates');
  expect((await state(page)).updates.map((u: any) => u.chapterId)).toEqual([c3]);
});

test('O7 and O8: removing never deletes server audio; a book removed from the library is offered for removal after reconnecting, not removed', async ({ page, context, stack, breeze }) => {
  const { ab, book: bookId, l } = await setup(page, stack, breeze);
  await downloadAll(page, ab);
  const m = await manifest(stack, ab);
  const audioStatus = async (id: string) => (await fetch(`${stack.api}/api/audio/${id}`, { headers: { Range: 'bytes=0-9' } })).status;
  // O8: the library entry is removed on the server while the device cannot reach it
  await cut(context);
  expect((await apiCall(stack.api, 'POST', `/api/books/${bookId}/remove`, {}, DEV, l)).status).toBe(200);
  await off(page, 'refresh');
  expect((await state(page)).removedBooks).toEqual([]); // nothing learned while out of reach
  await context.unroute('**/api/**');
  await off(page, 'refresh');
  await expect.poll(async () => (await state(page)).removedBooks.map((r: any) => r.audiobookId)).toEqual([ab]);
  expect(await chapterStates(page, ab)).toEqual(['on_device', 'on_device', 'on_device']); // offered, not removed
  expect(await page.evaluate(([ab, ch]) => (window as any).__offline.heldChapter(ab, ch).then((h: any) => !!h), [ab, m[0]!.chapter_id] as const)).toBe(true);
  // O7: the listener removes it from the device; the server keeps every byte
  const before = await Promise.all(m.map((c) => audioStatus(c.audio.id)));
  expect(before).toEqual([206, 206, 206]);
  await off(page, 'remove', ab);
  expect(await chapterStates(page, ab)).toEqual([]);
  expect((await state(page)).removedBooks).toEqual([]);
  expect(await page.evaluate((ab) => (window as any).__offlineKit.realStore.chapters(ab).then((r: any[]) => r.length), ab)).toBe(0);
  expect(await Promise.all(m.map((c) => audioStatus(c.audio.id)))).toEqual([206, 206, 206]);
  expect((await apiCall(stack.api, 'GET', `/api/audiobooks/${ab}/manifest`, undefined, DEV)).json.chapters).toHaveLength(3);
});

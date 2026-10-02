// The offline screens (W5, O1 to O8) through the real app, against a real bardic-server and the fake Breeze: the Download
// sheet and progress on the book page, Downloads, newer audio, Home and the away-from-home screens with the Bardic computer cut
// off, and the Now Playing notice for a chapter that is not on the device. The engine's own rules are in e2e/offline.spec.ts.
// "Cut off" is two things at once: Playwright's context.setOffline(true) and a route that aborts /api/**.
import { test, expect } from './fixtures';
import { reloadCachedPage } from './helpers/offlineReload';
import { apiCall, type Running } from './harness';
import { epub } from './zip';
import type { BrowserContext, Page } from '@playwright/test';
import type { Fake } from './fakes';

const DEV = 'e2e-offui-device';
type Stack = { api: string };
/* eslint-disable @typescript-eslint/no-explicit-any */
const off = (page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as any).__offline[f as string](...(a as unknown[])), [fn, args] as const);
const state = (page: Page) => page.evaluate(() => new Promise<any>((r) => (window as any).__offline.subscribe((s: unknown) => r(JSON.parse(JSON.stringify(s)))) && undefined));
const chapterStates = async (page: Page, ab: string) => (((await state(page)).books.find((b: any) => b.audiobookId === ab)?.chapters ?? []) as any[]).map((c) => c.state as string);

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
  const title = (await apiCall(stack.api, 'GET', `/api/books/${book}`, undefined, DEV, l)).json.title as string;
  const chapters = (await apiCall(stack.api, 'GET', `/api/books/${book}/chapters`, undefined, DEV, l)).json.items as { id: string; title: string }[];
  return { book, ab, title, chapters };
}

const manifest = async (stack: Stack, ab: string) => (await apiCall(stack.api, 'GET', `/api/audiobooks/${ab}/manifest`, undefined, DEV)).json.chapters as { chapter_id: string; audio: { id: string; bytes: number; sha256: string } }[];

/** A second book nobody downloads, so Home has something to say is out of reach. */
async function otherBook(stack: Stack, title: string) {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(epub({ title, titles: ['The Crossing', 'The Far Shore'] }))], { type: 'application/epub+zip' }), 'other.epub');
  const imp = await (await fetch(`${stack.api}/api/imports`, { method: 'POST', headers: { 'x-bardic-device': DEV }, body: form })).json();
  for (let i = 0; i < 100; i++) {
    const s = await (await fetch(`${stack.api}/api/imports/${imp.id}`, { headers: { 'x-bardic-device': DEV } })).json();
    if (s.state === 'done') return s.book_id as string;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('import did not finish');
}

/** Hold audio requests until `open()`: a download that stays in progress long enough to be seen. */
async function gate(page: Page) {
  let isOpen = false;
  const waiting: (() => void)[] = [];
  await page.route('**/api/audio/*', async (route) => {
    // only the downloads wait (they ask for the whole file); sound played straight from the server (an <audio> element asks by Range) does not
    if (!isOpen && !route.request().headers()['range']) await new Promise<void>((r) => waiting.push(r));
    await route.continue().catch(() => {});
  });
  return {
    open() {
      isOpen = true;
      waiting.splice(0).forEach((r) => r());
    },
    close() {
      isOpen = false;
    },
  };
}

/** The sheet's Download button, e.g. "Download 3 chapters" or "Download 1.2 MB". */
const startButton = (page: Page) => page.getByRole('dialog').getByRole('button', { name: /^Download\b/ });

async function downloadFromBookPage(page: Page, book: string, opts: { chapters?: string[] } = {}) {
  await page.goto(`/?e2e=offline#/book/${book}`);
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Download to this device')).toBeVisible();
  // this browser cannot tell Wi-Fi from mobile data, so Wi-Fi only starts off (it would wait forever) and the sheet says so
  await expect(sheet.getByRole('switch', { name: /Wi-Fi only/ })).toHaveAttribute('aria-checked', 'false');
  if (opts.chapters) {
    await sheet.getByRole('radio', { name: /Choose chapters/ }).click();
    for (const t of opts.chapters) await sheet.getByRole('checkbox', { name: new RegExp(t) }).click();
  }
  await startButton(page).click();
}

const cut = async (page: Page, stack: Running) => {
  // the worker already has the app shell before the network goes
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('bardic-app-')) && !!(await caches.match('/index.html')) && !!navigator.serviceWorker.controller), { timeout: 15000 })
    .toBe(true);
  stack.setReachable(false);
};
const reconnect = async (stack: Running) => { stack.setReachable(true); };

test('O1: the Download sheet shows the size and the free space; Start downloads; the chapters say On this device and the bytes match the manifest', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book, ab } = await readyBook(stack, breeze, l);
  const m = await manifest(stack, ab);
  const total = m.reduce((n, c) => n + c.audio.bytes, 0);
  await page.goto(`/?e2e=offline#/book/${book}`);
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Download to this device')).toBeVisible();
  await expect(sheet.getByRole('radio', { name: /What is ready now/ }).getByText(/^3 chapters · \d/)).toBeVisible(); // what is ready now, with its size
  await expect(sheet.getByText(/free on this device|Free space on this device is unknown/)).toBeVisible(); // never "0"
  await expect(startButton(page)).toBeEnabled();
  expect(await chapterStates(page, ab)).toEqual([]); // looking at the sheet downloads nothing
  await startButton(page).click();
  await expect(sheet).toBeHidden();
  const rows = page.locator('[data-chapter-rows]');
  await expect(rows.getByText('On this device', { exact: true })).toHaveCount(3, { timeout: 30000 });
  expect(await chapterStates(page, ab)).toEqual(['on_device', 'on_device', 'on_device']);
  const stored = await page.evaluate(async (ab) => {
    const kit = (window as any).__offlineKit;
    const out: [string, number, string][] = [];
    for (const r of await kit.realStore.chapters(ab)) out.push([r.chapterId, (await kit.realStore.readAudio(r.audioId)).size, r.sha256]);
    return out.sort();
  }, ab);
  expect(stored).toEqual(m.map((c) => [c.chapter_id, c.audio.bytes, c.audio.sha256] as [string, number, string]).sort());
  expect((await state(page)).books[0].heldBytes).toBe(total);
  // Settings summarises it
  await page.goto(`/?e2e=offline#/settings`);
  await expect(page.getByRole('link', { name: /Downloads/ })).toContainText(/1 book/);
});

test('O2: progress, pause, resume and cancel are visible on the book page; what finished is kept', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book, ab } = await readyBook(stack, breeze, l);
  const g = await gate(page);
  await downloadFromBookPage(page, book);
  const card = page.getByRole('group', { name: /^Download of / });
  await expect(card.getByText(/^Downloading · /)).toBeVisible();
  await expect(card.getByRole('progressbar', { name: 'Downloaded' })).toBeVisible();
  await expect(page.locator('[data-chapter-rows]').getByText('Downloading', { exact: true }).first()).toBeVisible();
  await card.getByRole('button', { name: 'Pause' }).click();
  await expect(card.getByText(/^Paused · /)).toBeVisible();
  await expect(card.getByText(/Resume when you like/)).toBeVisible();
  await card.getByRole('button', { name: 'Resume' }).click();
  await expect(card.getByText(/^Downloading · /)).toBeVisible();
  await card.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toBeHidden();
  expect(await chapterStates(page, ab)).toEqual([]);
  // starting again and letting it through finishes
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await startButton(page).click();
  g.open();
  await expect(page.locator('[data-chapter-rows]').getByText('On this device', { exact: true })).toHaveCount(3, { timeout: 30000 });
  await expect(card).toBeHidden();
});

test.describe('cached app shell', () => {
test.use({ serviceWorkers: 'allow' });
test('O3 and O4: with the server cut off, Home opens the downloaded book and shows the rest as unavailable; the book page does not wait for the server', async ({ page, context, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book, ab, title } = await readyBook(stack, breeze, l);
  const otherTitle = 'Lanterns of the Far Shore';
  await otherBook(stack, otherTitle);
  await downloadFromBookPage(page, book);
  await expect(page.locator('[data-chapter-rows]').getByText('On this device', { exact: true })).toHaveCount(3, { timeout: 30000 });
  // Home is seen online once, so it can say which books are out of reach later
  await page.goto('/?e2e=offline#/');
  await expect(page.getByRole('link', { name: new RegExp(title) }).first()).toBeVisible();
  await expect(page.getByText(otherTitle).first()).toBeVisible();
  await cut(page, stack);
  await reloadCachedPage(page);
  await expect(page.getByText('Can’t reach your Bardic computer')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('link', { name: new RegExp(title) }).first()).toBeVisible();
  await expect(page.getByRole('group', { name: new RegExp(`${otherTitle}.*Needs your Bardic computer`) })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(otherTitle) })).toHaveCount(0);
  // the held book opens, with its chapters and their words, and no spinner
  await page.getByRole('link', { name: new RegExp(title) }).first().click();
  await expect(page).toHaveURL(new RegExp(`#/book/${book}`));
  await expect(page.locator('[data-chapter-rows]').getByText('On this device', { exact: true })).toHaveCount(3);
  await expect(page.getByText('Opening the book…')).toHaveCount(0);
  await expect(page.getByText('Can’t reach your Bardic computer')).toBeVisible();
  // a book that is not held says it needs the Bardic computer, and the Library lists what can be played
  await page.evaluate(() => (location.hash = '#/library'));
  await expect(page.getByRole('heading', { name: 'Can’t reach Bardic' })).toBeVisible();
  await expect(page.getByText('Play from this device')).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`^Play ${title}`) })).toBeVisible();
  await expect(page.getByText(ab)).toHaveCount(0);
  // Retry checks and, with the server still cut, says so without leaving
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Can’t reach Bardic' })).toBeVisible();
  // everything comes back by itself when the server does
  await reconnect(stack);
  await page.getByRole('button', { name: 'Try again' }).click({ timeout: 3000 }).catch(() => {}); // or the app has already noticed by itself
  await expect(page.getByRole('heading', { name: 'Can’t reach Bardic' })).toBeHidden({ timeout: 15000 });
  await expect(page.getByText(otherTitle).first()).toBeVisible({ timeout: 15000 });
});

test('O3: with the server cut off, Listen plays from the device and Read shows the exact text', async ({ page, context, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book, ab, title, chapters } = await readyBook(stack, breeze, l);
  const text = (await apiCall(stack.api, 'GET', `/api/books/${book}/chapters/${chapters[0]!.id}/text`, undefined, DEV, l)).json;
  await downloadFromBookPage(page, book);
  await expect.poll(() => chapterStates(page, ab), { timeout: 30000 }).toEqual(['on_device', 'on_device', 'on_device']);
  await page.goto('/?e2e=offline#/');
  await expect(page.getByRole('link', { name: new RegExp(title) }).first()).toBeVisible();
  await cut(page, stack);
  await reloadCachedPage(page);
  await page.getByRole('link', { name: new RegExp(title) }).first().click();
  await page.getByRole('button', { name: /^(Listen|Continue listening)$/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${book}`), { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15000 });
  // it keeps playing with no server: the position moves, and nothing asks for the Bardic computer
  const slider = page.getByRole('slider').first();
  const at = async () => Number(await slider.getAttribute('aria-valuenow'));
  await expect.poll(at, { timeout: 8000 }).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page.getByText('Needs you')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Read' }).click();
  const first = [...text.text].slice(text.lines[0].start, text.lines[0].end).join('').trim();
  await expect(page.getByText(first.slice(0, 40), { exact: false }).first()).toBeVisible();
});

test('O5: a chapter that is not on the device says why and offers the next downloaded one', async ({ page, context, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book, ab, title, chapters } = await readyBook(stack, breeze, l);
  // chapters 1 and 3 are downloaded; chapter 2 is not
  await downloadFromBookPage(page, book, { chapters: [chapters[0]!.title, chapters[2]!.title] });
  await expect.poll(() => chapterStates(page, ab), { timeout: 30000 }).toEqual(['on_device', 'not_downloaded', 'on_device']);
  await page.goto('/?e2e=offline#/');
  await expect(page.getByRole('link', { name: new RegExp(title) }).first()).toBeVisible();
  await cut(page, stack);
  await reloadCachedPage(page);
  await page.getByRole('link', { name: new RegExp(title) }).first().click();
  await page.getByRole('button', { name: /^(Listen|Continue listening)$/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${book}`), { timeout: 15000 });
  await page.getByRole('button', { name: 'Chapters' }).click();
  await page.getByRole('dialog').getByText(chapters[1]!.title).click();
  const notice = page.getByText('Chapter 2 is not on this device');
  await expect(notice).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Your Bardic computer can’t be reached/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Play chapter 3' }).click();
  await expect(page.getByText(/Chapter 3 · /)).toBeVisible({ timeout: 15000 });
  await expect(notice).toBeHidden();
});

});

test('O2: the Read ring shows while this book downloads and opens Downloads', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book } = await readyBook(stack, breeze, l);
  const g = await gate(page);
  await downloadFromBookPage(page, book);
  await expect(page.getByRole('group', { name: /^Download of / }).getByText(/^Downloading · /)).toBeVisible();
  await page.getByRole('button', { name: /^(Listen|Continue listening)$/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${book}`), { timeout: 15000 });
  await page.getByRole('radio', { name: 'Read' }).click();
  const ring = page.getByRole('button', { name: /^Downloading \d+ of \d+ chapters\. Open downloads$/ });
  await expect(ring).toBeVisible();
  await ring.click();
  await expect(page).toHaveURL(/#\/settings\/downloads$/);
  await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible();
  g.open();
});

/** Newer audio on the server: free the audiobook's audio, wait, make the chapters again (a later audio for the same chapter). */
async function remake(stack: Stack, l: string, ab: string, chapterIds: string[]) {
  expect((await apiCall(stack.api, 'DELETE', `/api/audiobooks/${ab}/space`, undefined, DEV)).status).toBe(200);
  await new Promise((r) => setTimeout(r, 1100));
  await apiCall(stack.api, 'POST', `/api/audiobooks/${ab}/make-ready`, { scope: { kind: 'chapters', chapter_ids: chapterIds } }, DEV, l);
  await expect
    .poll(async () => (await manifest(stack, ab)).map((c) => c.chapter_id).sort(), { timeout: 30000 })
    .toEqual([...chapterIds].sort());
}
const heldAudio = (page: Page, ab: string, ch: string) => page.evaluate(async ([ab, ch]) => (await (window as any).__offlineKit.realStore.chapter(ab, ch))?.audioId as string, [ab, ch] as const);

test('O6: Downloads offers newer audio; nothing is replaced until Update; Keep what I have keeps the old copy and is not offered again', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book, ab } = await readyBook(stack, breeze, l);
  await downloadFromBookPage(page, book);
  await expect.poll(() => chapterStates(page, ab), { timeout: 30000 }).toEqual(['on_device', 'on_device', 'on_device']);
  const m = await manifest(stack, ab);
  const [c1, c2, c3] = m.map((c) => c.chapter_id) as [string, string, string];
  const old = { c1: await heldAudio(page, ab, c1), c2: await heldAudio(page, ab, c2), c3: await heldAudio(page, ab, c3) };
  await remake(stack, l, ab, [c2, c3]);

  await page.goto('/?e2e=offline#/settings/downloads');
  await page.reload();
  await expect(page.getByText('Newer audio is available')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/2 chapters with newer audio\. Nothing changes until you choose\./)).toBeVisible();
  expect([await heldAudio(page, ab, c1), await heldAudio(page, ab, c2), await heldAudio(page, ab, c3)]).toEqual([old.c1, old.c2, old.c3]);
  await page.getByRole('button', { name: 'See what changed' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Newer on your computer')).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Hear old audio/ })).toBeVisible();
  // hearing the old copy plays the one held here, from the one <audio> element; closing stops it
  await sheet.getByRole('button', { name: /^Hear old audio/ }).click();
  await expect(sheet.getByRole('button', { name: 'Stop the old audio' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('audio')].some((a) => !a.paused && a.src.startsWith('blob:')))).toBe(true);
  await sheet.getByRole('button', { name: /^Hear new audio/ }).click();
  await expect(sheet.getByRole('button', { name: 'Stop the new audio' })).toBeVisible();
  expect(await page.evaluate(() => [...document.querySelectorAll('audio')].some((a) => a.src.includes('/api/audio/')))).toBe(true);
  // nothing was replaced by looking; Update replaces the chapters
  expect([await heldAudio(page, ab, c2), await heldAudio(page, ab, c3)]).toEqual([old.c2, old.c3]);
  await sheet.getByRole('button', { name: /^Update 2 chapters/ }).click();
  await expect(sheet).toBeHidden({ timeout: 15000 });
  expect(await page.evaluate(() => [...document.querySelectorAll('audio')].every((a) => a.paused))).toBe(true);
  const now = await manifest(stack, ab);
  expect(await heldAudio(page, ab, c2)).toBe(now.find((c) => c.chapter_id === c2)!.audio.id);
  expect(await heldAudio(page, ab, c3)).toBe(now.find((c) => c.chapter_id === c3)!.audio.id);
  expect(await heldAudio(page, ab, c1)).toBe(old.c1);
  await expect(page.getByText('Newer audio is available')).toBeHidden();

  // the server makes chapter 3 again: offered; Keep what I have keeps it and does not offer it again
  const before = await heldAudio(page, ab, c3);
  await remake(stack, l, ab, [c3]);
  await page.reload();
  await expect(page.getByText(/1 chapter with newer audio/)).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'See what changed' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep what I have' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Newer audio is available')).toBeHidden();
  expect(await heldAudio(page, ab, c3)).toBe(before);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__offline);
  await off(page, 'checkUpdates');
  await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible();
  await expect(page.getByText('Newer audio is available')).toBeHidden();
  expect((await state(page)).updates).toEqual([]);
});

test('O6: an Out of date chapter on the book page offers the update sheet', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book, ab } = await readyBook(stack, breeze, l);
  await downloadFromBookPage(page, book);
  await expect.poll(() => chapterStates(page, ab), { timeout: 30000 }).toEqual(['on_device', 'on_device', 'on_device']);
  const c2 = (await manifest(stack, ab))[1]!.chapter_id;
  await remake(stack, l, ab, [c2]);
  await page.goto(`/?e2e=offline#/book/${book}`);
  await page.reload();
  await expect(page.locator('[data-chapter-rows]').getByText('Out of date', { exact: true }).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /^Update / }).first().click();
  await expect(page.getByRole('dialog').getByText('Newer audio is available')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep what I have' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('O7: removing a book from Downloads is for this device only and the server keeps every byte', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book, ab, title } = await readyBook(stack, breeze, l);
  await downloadFromBookPage(page, book);
  await expect.poll(() => chapterStates(page, ab), { timeout: 30000 }).toEqual(['on_device', 'on_device', 'on_device']);
  const m = await manifest(stack, ab);
  const audioStatus = async (id: string) => (await fetch(`${stack.api}/api/audio/${id}`, { headers: { Range: 'bytes=0-9' } })).status;
  await page.goto('/?e2e=offline#/settings/downloads');
  await expect(page.getByText('Downloaded · 1')).toBeVisible();
  await page.getByRole('button', { name: `Remove ${title}` }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(/from this device only\. Nothing is deleted on your Bardic computer/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Keep it' }).click();
  expect(await chapterStates(page, ab)).toEqual(['on_device', 'on_device', 'on_device']);
  await page.getByRole('button', { name: `Remove ${title}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Remove .* from this device$/ }).click();
  await expect(page.getByText('Downloaded · 0')).toBeVisible();
  expect(await chapterStates(page, ab)).toEqual([]);
  expect(await page.evaluate((ab) => (window as any).__offlineKit.realStore.chapters(ab).then((r: any[]) => r.length), ab)).toBe(0);
  expect(await Promise.all(m.map((c) => audioStatus(c.audio.id)))).toEqual([206, 206, 206]);
  expect((await apiCall(stack.api, 'GET', `/api/audiobooks/${ab}/manifest`, undefined, DEV)).json.chapters).toHaveLength(3);
});

test('O7: the Wi-Fi only rule and the remove-finished rule are kept', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book, ab } = await readyBook(stack, breeze, l);
  await downloadFromBookPage(page, book);
  await expect.poll(() => chapterStates(page, ab), { timeout: 30000 }).toEqual(['on_device', 'on_device', 'on_device']);
  await page.goto('/?e2e=offline#/settings/downloads');
  const wifi = page.getByRole('switch', { name: /Wi-Fi only/ });
  await expect(wifi).toHaveAttribute('aria-checked', 'false'); // the download turned it off for this book
  await wifi.click();
  await expect.poll(async () => (await state(page)).books[0].wifiOnly).toBe(true);
  await page.getByRole('switch', { name: /Remove finished books after/ }).click();
  await expect.poll(async () => (await state(page)).removeFinishedAfterDays).toBe(14);
  await page.getByRole('radio', { name: '30 days' }).click();
  await expect.poll(async () => (await state(page)).removeFinishedAfterDays).toBe(30);
});

test('O8: a book removed from the library is offered for removal after reconnecting, and removed only when chosen', async ({ page, context, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book, ab, title } = await readyBook(stack, breeze, l);
  await downloadFromBookPage(page, book);
  await expect.poll(() => chapterStates(page, ab), { timeout: 30000 }).toEqual(['on_device', 'on_device', 'on_device']);
  await page.goto('/?e2e=offline#/settings/downloads');
  await context.route('**/api/**', (r) => r.abort('connectionrefused'));
  expect((await apiCall(stack.api, 'POST', `/api/books/${book}/remove`, {}, DEV, l)).status).toBe(200);
  await context.unroute('**/api/**');
  await off(page, 'refresh');
  await expect(page.getByText('Removed from your library · 1')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Their downloads are still here until you remove them/)).toBeVisible();
  expect(await chapterStates(page, ab)).toEqual(['on_device', 'on_device', 'on_device']);
  await page.getByRole('button', { name: `Remove ${title} from this device` }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Remove .* from this device$/ }).click();
  await expect(page.getByText('Removed from your library · 1')).toBeHidden();
  expect(await chapterStates(page, ab)).toEqual([]);
});

// S9: actual end-of-book screens, a real Bardic server and original synthetic books.
// The shared fixtures mute all native media before play; neither continuation nor recovery may make speech.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import { configureBreeze, freeVoiceId, importFile, readyAudiobook } from './helpers/world';
import { zip } from './zip';
import type { Fake } from './fakes';

const DEV = 'e2e-series-continuation';
const SERIES = 'The Synthetic Ferry Cycle';
const CURRENT_TITLE = 'Synthetic Ferry Two';
const LOOKUP_ERROR = 'Your place is kept. The next volume could not be checked.';
type World = { api: string; listener: string; current: string; audiobook: string; voice: string; title: string };

function syntheticBook(title: string) {
  const body = Array.from({ length: 8 }, (_, i) => `<p>The synthetic ferry counted lantern ${i + 1} beside a paper river. Its quiet passenger folded an imaginary map and waited for the bell.</p>`).join('');
  return zip({
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'OEBPS/content.opf': `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title><dc:creator>Synthetic Writer</dc:creator></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>`,
    'OEBPS/chapter.xhtml': `<html><body><h1>Chapter 1</h1>${body}</body></html>`,
  });
}

async function addBook(api: string, listener: string, title: string, order: number | null, series: string | null = SERIES) {
  const book = await importFile(api, listener, `${title.replaceAll(' ', '-')}.epub`, syntheticBook(title), 'application/epub+zip');
  const update = await apiCall(api, 'PATCH', `/api/books/${book}`, { series: series === null ? null : { name: series, order } }, DEV, listener);
  expect(update.status).toBe(200);
  return book;
}

async function setup(page: Page, api: string, breeze: Fake, order: number | null = 2, series: string | null = SERIES): Promise<World> {
  const listener = (await apiCall(api, 'POST', '/api/listeners', { name: 'Series reader' }, DEV)).json.id as string;
  await configureBreeze(api, breeze);
  const voice = await freeVoiceId(api, listener);
  const settings = await apiCall(api, 'PUT', `/api/listeners/${listener}/settings`, { default_voice_id: voice, place_conflict: 'ask', continue_into_next_chapter: true }, DEV, listener);
  expect(settings.status).toBe(200);
  const current = await addBook(api, listener, CURRENT_TITLE, order, series);
  const audiobook = await readyAudiobook(api, listener, current, voice);
  await page.addInitScript((id) => localStorage.setItem('bardic.listener', id), listener);
  return { api, listener, current, audiobook, voice, title: CURRENT_TITLE };
}

const state = (page: Page) => page.evaluate(() => {
  let value: { playing: boolean; duration: number; position: number; finishedBook: boolean; book: { id: string } | null } | undefined;
  window.__player!.subscribe((s) => { value = s; })();
  return { playing: value!.playing, duration: value!.duration, position: value!.position, finishedBook: value!.finishedBook, book: value!.book };
});

async function reachEnd(page: Page, book: string, title = CURRENT_TITLE, firstNavigation = true) {
  if (firstNavigation) await page.goto(`/?e2e=player#/book/${book}`);
  else await page.evaluate((id) => { location.hash = `#/book/${id}`; }, book);
  await page.getByRole('button', { name: /^(Listen|Continue listening)$/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${book}$`));
  await page.waitForFunction(() => !!window.__player);
  await expect.poll(async () => (await state(page)).duration).toBeGreaterThan(1);
  // Keep the actual play gesture, decode and native ended event, while avoiding a long synthetic chapter wait.
  await page.evaluate(() => {
    let duration = 0;
    window.__player!.subscribe((s) => { duration = s.duration; })();
    window.__player!.seek(duration - 0.1);
  });
  await expect(page.getByRole('heading', { name: `You finished ${title}`, exact: true })).toBeVisible({ timeout: 15000 });
  expect((await state(page)).playing).toBe(false);
}

async function endWithLookup(page: Page, book: string, title = CURRENT_TITLE, firstNavigation = true) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/api/series' && r.status() === 200),
    reachEnd(page, book, title, firstNavigation),
  ]);
  await response.finished();
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await expect(page.getByText('Checking the next volume…', { exact: true })).toBeHidden();
}

const nextButton = (page: Page) => page.getByRole('button', { name: / · next you own$/ });
const markFinished = (page: Page) => page.getByRole('button', { name: 'Mark as finished', exact: true });
const restart = (page: Page) => page.getByRole('button', { name: 'Listen again from the start', exact: true });
const place = (w: World) => apiCall(w.api, 'GET', `/api/books/${w.current}/place`, undefined, DEV, w.listener);

test.describe.configure({ timeout: 60000 });

test('S9: the nearest readable next volume skips removed books, explains only intervening known gaps and opens without playing', async ({ page, stack, breeze, gemini }) => {
  const w = await setup(page, stack.api, breeze);
  await addBook(stack.api, w.listener, 'Synthetic Ferry One', 1);
  const removed = await addBook(stack.api, w.listener, 'Removed Ferry Three', 3);
  expect((await apiCall(stack.api, 'POST', `/api/books/${removed}/remove`, undefined, DEV, w.listener)).status).toBe(200);
  const next = await addBook(stack.api, w.listener, 'Synthetic Ferry Four', 4);
  await addBook(stack.api, w.listener, 'Synthetic Ferry Seven', 7);
  await addBook(stack.api, w.listener, 'Unknown Ferry Volume', null);
  await reachEnd(page, w.current);
  await expect(nextButton(page)).toHaveText('Synthetic Ferry Four · next you own');
  await expect(page.getByText(`Volume 3 of ${SERIES} is not in your library.`, { exact: false })).toBeVisible();
  await expect(page.getByText(/Volume (5|6) of .* is not in your library/)).toHaveCount(0);
  const before = breeze.received();
  await nextButton(page).click();
  await expect(page).toHaveURL(new RegExp(`#/book/${next}$`));
  await expect(page.getByRole('heading', { name: 'Synthetic Ferry Four', exact: true })).toBeVisible();
  expect((await state(page)).playing).toBe(false);
  expect(breeze.received()).toBe(before);
  expect(gemini.received()).toBe(0);
  expect((await apiCall(stack.api, 'GET', `/api/books/${next}/audiobooks`, undefined, DEV, w.listener)).json.items).toEqual([]);
});

test('S9: marking finished acknowledges the server and listening again clears the finish at the start', async ({ page, stack, breeze, gemini }) => {
  const w = await setup(page, stack.api, breeze);
  await addBook(stack.api, w.listener, 'Synthetic Ferry Three', 3);
  await reachEnd(page, w.current);
  await expect.poll(async () => (await place(w)).json.progress).toBeGreaterThan(0.99);
  await markFinished(page).click();
  await expect(page.getByRole('button', { name: 'Marked as finished', exact: true })).toBeDisabled();
  expect((await place(w)).json.finished).toMatchObject({ finished: true, reason: 'marked' });
  const before = breeze.received();
  await restart(page).click();
  await expect(page.getByRole('heading', { name: `You finished ${w.title}`, exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect((await state(page)).position).toBeLessThan(2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await place(w)).json.finished.finished).toBe(false);
  expect(breeze.received()).toBe(before);
  expect(gemini.received()).toBe(0);
});

for (const scenario of ['final volume', 'unknown order', 'standalone book'] as const) {
  test(`S9: no next volume is guessed for a ${scenario}`, async ({ page, stack, breeze, gemini }) => {
    const order = scenario === 'final volume' ? 4 : scenario === 'unknown order' ? null : 2;
    const w = await setup(page, stack.api, breeze, order, scenario === 'standalone book' ? null : SERIES);
    await addBook(stack.api, w.listener, 'Synthetic Ferry Earlier', 1);
    if (scenario !== 'final volume') await addBook(stack.api, w.listener, 'Synthetic Ferry Later', 7);
    await endWithLookup(page, w.current);
    await expect(markFinished(page)).toBeVisible();
    await expect(restart(page)).toBeVisible();
    await expect(nextButton(page)).toHaveCount(0);
    await expect(page.getByText(/Volume .* is not in your library/)).toHaveCount(0);
    expect(gemini.received()).toBe(0);
  });
}

test('S9: fractional series orders use the nearest higher owned volume without inventing a missing number', async ({ page, stack, breeze }) => {
  const w = await setup(page, stack.api, breeze);
  await addBook(stack.api, w.listener, 'Synthetic Ferry Interlude', 2.5);
  await addBook(stack.api, w.listener, 'Synthetic Ferry Four', 4);
  await reachEnd(page, w.current);
  await expect(nextButton(page)).toHaveText('Synthetic Ferry Interlude · next you own');
  await expect(page.getByText(/Volume .* is not in your library/)).toHaveCount(0);
});

test('S9: a long next-volume title wraps within its button and both next and restart stay reachable', async ({ page, stack, breeze, gemini }) => {
  const w = await setup(page, stack.api, breeze);
  const title = 'The Synthetic Ferry and the Very Long Journey Through the Folded Paper Islands Beyond the Imaginary Lantern Harbour';
  const next = await addBook(stack.api, w.listener, title, 3);
  await reachEnd(page, w.current);
  const button = nextButton(page);
  await expect(button).toHaveText(`${title} · next you own`);
  // The first SSE open refreshes the series list and briefly replaces its next
  // button. Measure the current connected node and player end state together,
  // rather than an ElementHandle that can detach after a trial click.
  await expect(async () => {
    await expect(page.getByRole('heading', { name: `You finished ${w.title}`, exact: true })).toBeVisible();
    await expect(button).toHaveText(`${title} · next you own`);
    await button.scrollIntoViewIfNeeded();
    await button.click({ trial: true });
    const bounds = await page.evaluate(() => {
      const label = document.querySelector('.overlay .next-title');
      const el = label?.closest('button');
      if (!label || !el || !el.isConnected) return null;
      let playerState: { finishedBook: boolean; book: { id: string } | null } | undefined;
      window.__player!.subscribe((s) => { playerState = s; })();
      const b = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(label);
      return { finishedBook: playerState!.finishedBook, book: playerState!.book?.id, label: label.textContent,
        button: { left: b.left, top: b.top, right: b.right, bottom: b.bottom, height: b.height },
        width: innerWidth, height: innerHeight,
        lines: [...range.getClientRects()].map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })) };
    });
    expect(bounds).not.toBeNull();
    expect(bounds!.finishedBook).toBe(true);
    expect(bounds!.book).toBe(w.current);
    expect(bounds!.label).toBe(`${title} · next you own`);
    expect(bounds!.button.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.button.left).toBeGreaterThanOrEqual(0);
    expect(bounds!.button.right).toBeLessThanOrEqual(bounds!.width);
    expect(bounds!.button.top).toBeGreaterThanOrEqual(0);
    expect(bounds!.button.bottom).toBeLessThanOrEqual(bounds!.height);
    expect(bounds!.lines.length).toBeGreaterThan(1);
    for (const line of bounds!.lines) {
      expect(line.left).toBeGreaterThanOrEqual(bounds!.button.left - 1);
      expect(line.right).toBeLessThanOrEqual(bounds!.button.right + 1);
      expect(line.top).toBeGreaterThanOrEqual(bounds!.button.top - 1);
      expect(line.bottom).toBeLessThanOrEqual(bounds!.button.bottom + 1);
    }
  }).toPass({ timeout: 5000 });
  await restart(page).scrollIntoViewIfNeeded();
  await restart(page).click({ trial: true });
  const again = await restart(page).boundingBox();
  expect(again!.y).toBeGreaterThanOrEqual(0);
  expect(again!.y + again!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  const before = breeze.received();
  await button.click();
  await expect(page).toHaveURL(new RegExp(`#/book/${next}$`));
  expect(breeze.received()).toBe(before);
  expect(gemini.received()).toBe(0);
});

test('S9: a failed series lookup keeps end controls and can be retried without generation', async ({ page, stack, breeze, gemini }) => {
  const w = await setup(page, stack.api, breeze);
  await addBook(stack.api, w.listener, 'Synthetic Ferry Four', 4);
  // Isolate manual Retry from the event stream's automatic reconnect refresh.
  await page.route('**/api/events', (route) => route.abort());
  let lookups = 0;
  let fail = true;
  await page.route('**/api/series*', async (route) => {
    lookups++;
    if (fail) await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'internal_error', detail: 'Synthetic lookup failure.', retryable: true }) });
    else await route.continue();
  });
  await reachEnd(page, w.current);
  await expect(page.getByText(LOOKUP_ERROR, { exact: true })).toBeVisible();
  await expect(markFinished(page)).toBeVisible();
  await expect(restart(page)).toBeVisible();
  await expect(nextButton(page)).toHaveCount(0);
  const before = breeze.received();
  fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(nextButton(page)).toHaveText('Synthetic Ferry Four · next you own');
  await expect(page.getByText(LOOKUP_ERROR, { exact: true })).toBeHidden();
  expect(lookups).toBeGreaterThanOrEqual(2);
  expect(breeze.received()).toBe(before);
  expect(gemini.received()).toBe(0);
});

test('S9: a delayed old lookup cannot populate another book after navigation', async ({ page, stack, breeze, gemini }) => {
  const w = await setup(page, stack.api, breeze);
  await addBook(stack.api, w.listener, 'Synthetic Ferry Four', 4);
  const soloTitle = 'Another Synthetic Journey';
  const solo = await addBook(stack.api, w.listener, soloTitle, null, null);
  await readyAudiobook(stack.api, w.listener, solo, w.voice);
  let release!: () => void;
  let entered!: () => void;
  let delivered!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  const lookupStarted = new Promise<void>((r) => { entered = r; });
  const lookupSettled = new Promise<void>((r) => { delivered = r; });
  let first = true;
  await page.route('**/api/series*', async (route) => {
    if (!first) return route.continue();
    first = false;
    const response = await route.fetch();
    entered();
    await held;
    try { await route.fulfill({ response }); }
    catch { /* Cleanup may already have aborted this old request, which is the expected safe outcome. */ }
    finally { delivered(); }
  });
  try {
    await reachEnd(page, w.current);
    await lookupStarted;
    await endWithLookup(page, solo, soloTitle, false);
    release();
    await lookupSettled;
    await expect(page).toHaveURL(new RegExp(`#/listen/${solo}$`));
    await expect(page.getByRole('heading', { name: `You finished ${soloTitle}`, exact: true })).toBeVisible();
    await expect(nextButton(page)).toHaveCount(0);
    await expect(page.getByText(/Volume 3 of .* is not in your library/)).toHaveCount(0);
    expect(gemini.received()).toBe(0);
  } finally { release(); }
});

test('S9: an already loaded chapter can end offline without guessing a next volume', async ({ page, context, stack, breeze, gemini }) => {
  const w = await setup(page, stack.api, breeze);
  await addBook(stack.api, w.listener, 'Synthetic Ferry Four', 4);
  let lookups = 0;
  page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/series') lookups++; });
  await page.goto(`/?e2e=player#/book/${w.current}`);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${w.current}$`));
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(async () => (await state(page)).duration).toBeGreaterThan(1);
  await expect.poll(async () => (await state(page)).playing).toBe(true);
  // Metadata alone does not establish playback or a fully loaded short chapter.
  await page.waitForFunction(() => {
    const audio = window.__audio;
    return !!audio && !audio.paused && !audio.ended && audio.currentTime > 0
      && Number.isFinite(audio.duration) && audio.buffered.length > 0
      && audio.buffered.start(0) <= 0.05
      && audio.buffered.end(audio.buffered.length - 1) >= audio.duration - 0.05;
  });
  // This checks the current document's network state, not a service-worker or offline-reload claim.
  await context.setOffline(true);
  try {
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await page.evaluate(() => {
      let duration = 0;
      window.__player!.subscribe((s) => { duration = s.duration; })();
      window.__player!.seek(duration - 0.1);
    });
    await expect(page.getByRole('heading', { name: `You finished ${w.title}`, exact: true })).toBeVisible({ timeout: 15000 });
    await expect(markFinished(page)).toBeVisible();
    await expect(restart(page)).toBeVisible();
    await expect(nextButton(page)).toHaveCount(0);
    await expect(page.getByText(LOOKUP_ERROR, { exact: true })).toBeVisible();
    await expect(page.getByText(/Volume .* is not in your library/)).toHaveCount(0);
    expect(lookups).toBeGreaterThan(0);
    expect(gemini.received()).toBe(0);
  } finally { await context.setOffline(false); }
});

import { test, expect } from './fixtures';
import { apiCall } from './harness';
import { zip } from './zip';
import type { Page } from '@playwright/test';
import type { Fake } from './fakes';

// The book page (B1 to B6, V3) against a real bardic-server, with a fake Breeze that speaks and a fake Gemini
// that must never be asked to (nothing paid starts without an approved plan).

const DEVICE = 'e2e-other-device-1';
const para = (n: number, who: string) => Array.from({ length: n }, (_, i) => `<p>${who} ${i}: the tide came in at noon, and the lanterns burned low over the harbour wall.</p>`).join('');

/** A small original EPUB with front and back matter around three story chapters. */
function harbourEpub(): Buffer {
  const chapters: [string, string][] = [
    ['Copyright', para(1, 'Notice')],
    ['The Crossing', para(30, 'Crossing')],
    ['The Far Shore', para(30, 'Shore')],
    ['The Last Lantern', para(30, 'Lantern')],
    ['About the Author', para(1, 'Author')],
  ];
  const files: Record<string, string> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'OEBPS/content.opf': `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Harbour Lights</dc:title><dc:creator>A. Writer</dc:creator></metadata><manifest>${chapters.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`,
  };
  chapters.forEach(([t, body], i) => (files[`OEBPS/c${i}.xhtml`] = `<html><body><h1>${t}</h1>${body}</body></html>`));
  return zip(files);
}

interface World {
  listener: string;
  bookId: string;
  chapters: { id: string; title: string; kind: string }[];
  free: { id: string; voice_name: string };
  premium: { id: string; voice_name: string };
}

/** A listener, both voice sources, the book, a free and a premium audiobook, and a place in chapter two on the free one. */
async function world(api: string, breeze: Fake, opts: { place?: boolean } = {}): Promise<World> {
  const l = (await apiCall(api, 'POST', '/api/listeners', { name: 'Nick' })).json.id as string;
  const b = await apiCall(api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url });
  expect(b.status).toBe(200);
  const g = await apiCall(api, 'PUT', '/api/voice-sources/gemini', { api_key: 'test-key' });
  expect(g.status).toBe(200);
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(harbourEpub())], { type: 'application/epub+zip' }), 'Harbour Lights.epub');
  const imp = await fetch(`${api}/api/imports`, { method: 'POST', headers: { 'x-bardic-device': DEVICE }, body: fd });
  expect(imp.status).toBe(202);
  let bookId = '';
  await expect
    .poll(async () => {
      const items = (await apiCall(api, 'GET', '/api/books?limit=50', undefined, DEVICE, l)).json.items as { id: string; state: string }[];
      bookId = items[0]?.id ?? '';
      return items[0]?.state;
    })
    .toBe('readable');
  await apiCall(api, 'PATCH', `/api/books/${bookId}`, { series: { name: 'The Harbour Cycle', order: 2 } }, DEVICE, l);
  const chapters = (await apiCall(api, 'GET', `/api/books/${bookId}/chapters`)).json.items as World['chapters'];
  const voices = (await apiCall(api, 'GET', '/api/voices')).json.items as { id: string; tier: string; name: string }[];
  const mara = voices.find((v) => v.name === 'Mara')!;
  const kore = voices.find((v) => v.tier === 'premium')!;
  const free = (await apiCall(api, 'POST', `/api/books/${bookId}/audiobooks`, { voice_id: mara.id }, DEVICE)).json;
  const premium = (await apiCall(api, 'POST', `/api/books/${bookId}/audiobooks`, { voice_id: kore.id }, DEVICE)).json;
  if (opts.place !== false) {
    const p = await apiCall(api, 'PUT', `/api/books/${bookId}/place`, { chapter_id: chapters[2]!.id, offset: 40, mode: 'listening', audiobook_id: free.id, base_revision: 0 }, DEVICE, l);
    expect(p.status).toBe(200);
  }
  return { listener: l, bookId, chapters, free, premium };
}

async function signIn(page: Page, name = 'Nick') {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('button', { name: new RegExp(`Listening as ${name}`) })).toBeVisible();
}

const openBook = async (page: Page, w: World) => {
  await signIn(page);
  await page.goto(`/#/book/${w.bookId}`);
  await expect(page.getByRole('heading', { name: 'Harbour Lights', level: 1 })).toBeVisible();
};

const rows = (page: Page) => page.locator('[data-chapter-rows] > div');
const WORDS = ['On this device', 'Ready', 'Making', 'Not yet', 'Downloading', 'Couldn’t download', 'Out of date'];
const wordsIn = (text: string) => WORDS.filter((w) => new RegExp(`(^|[^A-Za-z’])${w}([^A-Za-z]|$)`).test(text));
const placeOf = async (api: string, w: World) => (await apiCall(api, 'GET', `/api/books/${w.bookId}/place`, undefined, DEVICE, w.listener)).json;

test('B1: the book page shows the book, the primary action, the audiobook card and the chapters', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  await openBook(page, w);
  await expect(page.getByText('Harbour Lights').first()).toBeVisible();
  await expect(page.getByText('A. Writer')).toBeVisible();
  await expect(page.getByText('The Harbour Cycle · Volume 2')).toBeVisible();
  // the header counts every chapter (5), the same set the Audiobook card counts ("0 of 5")
  await expect(page.getByText('5 chapters · ')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Audiobook', exact: true })).toBeVisible();
  const card = page.locator('[data-section="audiobook"]');
  await expect(card.getByText('Mara')).toBeVisible();
  await expect(card.getByText('Free', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
  // the primary action carries on from the place and goes to the player route (W3)
  await page.getByRole('button', { name: 'Continue listening' }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${w.bookId}$`));
});

test('B1: a book with no place says Listen', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze, { place: false });
  await openBook(page, w);
  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue listening' })).toHaveCount(0);
});

test('B2: the audiobook card shows voice, tier, ready and on-device counts, and the actions', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  await openBook(page, w);
  const card = page.locator('[data-section="audiobook"]');
  await expect(card.getByText('Mara')).toBeVisible();
  await expect(card.getByText('Free', { exact: true })).toBeVisible();
  await expect(card.getByText('0 of 5 chapters ready')).toBeVisible();
  await expect(card.getByText('0 on this device')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Make ready' })).toBeEnabled();
  // Download is offered and usable (offline storage, W5)
  await expect(card.getByRole('button', { name: 'Download' })).toBeEnabled();
  // Change opens the voice chooser
  await card.getByRole('button', { name: /^Change/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('B3: switching audiobook keeps the place; a premium audiobook starts nothing', async ({ page, stack, breeze, gemini }) => {
  const w = await world(stack.api, breeze);
  const before = await placeOf(stack.api, w);
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/api/')) posts.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  await openBook(page, w);
  const other = page.getByRole('button', { name: new RegExp(`^Use ${w.premium.voice_name}`) });
  await expect(page.getByRole('heading', { name: 'Other audiobooks' })).toBeVisible();
  await expect(other).toContainText('Premium');
  await other.click();
  const card = page.locator('[data-section="audiobook"]');
  await expect(card.getByText(w.premium.voice_name)).toBeVisible();
  await expect(card.getByText('Premium', { exact: true })).toBeVisible();
  // the place is the same text position, now with the other audiobook; the revision moved on by one
  await expect.poll(async () => (await placeOf(stack.api, w)).audiobook_id).toBe(w.premium.id);
  const after = await placeOf(stack.api, w);
  expect({ chapter: after.chapter_id, offset: after.offset, mode: after.mode }).toEqual({ chapter: before.chapter_id, offset: before.offset, mode: before.mode });
  expect(after.revision).toBe(before.revision + 1);
  // the free one is now in the list of others, and switching back works
  await expect(page.getByRole('button', { name: new RegExp(`^Use ${w.free.voice_name}`) })).toBeVisible();
  // a premium audiobook cannot be made ready from here: no Make ready; "Plan the whole book" opens the plan sheet
  // (pressed in e2e/plans.spec.ts) and says nothing is spent until a plan is approved
  await expect(card.getByRole('button', { name: 'Make ready' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Plan the whole book' })).toBeEnabled();
  await expect(card.getByText(/Nothing is spent until you do/)).toBeVisible();
  // nothing that can cost money was called, and the provider heard nothing
  expect(posts.filter((p) => /make-ready|plan|request/.test(p))).toEqual([]);
  expect(gemini.received()).toBe(0);
  await page.getByRole('button', { name: new RegExp(`^Use ${w.free.voice_name}`) }).click();
  await expect(card.getByText(w.free.voice_name)).toBeVisible();
  await expect.poll(async () => (await placeOf(stack.api, w)).audiobook_id).toBe(w.free.id);
  expect((await placeOf(stack.api, w)).chapter_id).toBe(before.chapter_id);
});

test('B4: every chapter row carries exactly one audio word', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  // make the middle chapter so the list shows more than one word
  await apiCall(stack.api, 'POST', `/api/audiobooks/${w.free.id}/chapters/${w.chapters[1]!.id}/request`, { ahead: 0 }, DEVICE, w.listener);
  await openBook(page, w);
  await page.getByRole('button', { name: /^Show all/ }).click();
  await expect(rows(page)).toHaveCount(5);
  await expect.poll(async () => (await rows(page).nth(1).innerText()).includes('Ready')).toBe(true);
  for (let i = 0; i < 5; i++) {
    const text = await rows(page).nth(i).innerText();
    expect(wordsIn(text), `row ${i}: ${text}`).toHaveLength(1);
  }
  // the chapter you are in says so, and shows your progress in place of Ready or Not yet only when ready
  await expect(rows(page).nth(2)).toContainText('You are here');
});

test('B6: the matter filter leaves out front and back matter', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  await openBook(page, w);
  await page.getByRole('button', { name: /^Show all/ }).click();
  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByText('Copyright')).toBeVisible();
  await expect(page.getByText('About the Author')).toBeVisible();
  const filter = page.getByRole('button', { name: 'Hide front and back matter' });
  await expect(filter).toHaveAttribute('aria-pressed', 'false');
  await filter.click();
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByText('Copyright')).toHaveCount(0);
  await expect(page.getByText('About the Author')).toHaveCount(0);
  await expect(page.getByText('The Crossing')).toBeVisible();
  await filter.click();
  await expect(rows(page)).toHaveCount(5);
});

test('V3: Make ready for a free voice shows time and space, starts a job, and the rows move from Making to Ready', async ({ page, stack, breeze, gemini }) => {
  const w = await world(stack.api, breeze);
  await openBook(page, w);
  await page.getByRole('button', { name: /^Show all/ }).click();
  // the voice server is slow to answer, so the chapters stay in Making long enough to see
  breeze.setDown(true);
  const card = page.locator('[data-section="audiobook"]');
  await card.getByRole('button', { name: 'Make ready' }).click();
  const sheet = page.getByRole('dialog', { name: 'Make ready' });
  await expect(sheet).toContainText('Mara · free');
  await expect(sheet.getByRole('radio', { name: /Whole book/ })).toBeChecked();
  await expect(sheet.getByRole('radio', { name: /From chapter 2/ })).toBeVisible();
  await expect(sheet).toContainText('To make');
  await expect(sheet).toContainText('5 chapters');
  await expect(sheet).toContainText(/About .*, in the background|Less than a minute, in the background/);
  await expect(sheet).toContainText('Free');
  await expect(sheet).toContainText(/About .* on the server/);
  // Escape closes without starting anything
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  expect((await apiCall(stack.api, 'GET', `/api/jobs?audiobook_id=${w.free.id}`)).json.items).toHaveLength(0);

  await card.getByRole('button', { name: 'Make ready' }).click();
  await page.getByRole('dialog', { name: 'Make ready' }).getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('dialog', { name: 'Make ready' })).toHaveCount(0);
  await expect(card.getByText('Making it ready')).toBeVisible();
  await expect(card.getByText('0 of 5 chapters')).toBeVisible();
  await expect(card.getByText(/You can listen while it works/)).toBeVisible();
  for (let i = 0; i < 5; i++) await expect(rows(page).nth(i)).toContainText('Making', { timeout: 10000 });
  const jobs = (await apiCall(stack.api, 'GET', `/api/jobs?audiobook_id=${w.free.id}`)).json.items as { state: string; plan_id: string | null }[];
  expect(jobs).toHaveLength(1);
  expect(jobs[0]!.plan_id).toBeNull();

  // pause and resume
  await card.getByRole('button', { name: 'Pause' }).click();
  await expect(card.getByText('Paused', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Resume' }).click();
  await expect(card.getByText('Making it ready')).toBeVisible();

  // the voice answers again: the chapters become Ready, the job ends and the card shows the count
  breeze.setDown(false);
  for (let i = 0; i < 5; i++) await expect(rows(page).nth(i)).toContainText('Ready', { timeout: 30000 });
  await expect(card.getByText('5 of 5 chapters ready')).toBeVisible({ timeout: 30000 });
  await expect(card.getByText('Making it ready')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Make ready' })).toBeDisabled();
  expect(breeze.spoken.length).toBeGreaterThan(0);
  expect(breeze.spoken.join(' ')).toContain('the tide came in at noon');
  expect(gemini.received()).toBe(0);
  for (let i = 0; i < 5; i++) expect(wordsIn(await rows(page).nth(i).innerText()), `row ${i}`).toHaveLength(1);
});

test('V3: Stop keeps what is finished and returns the card to Make ready', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  await openBook(page, w);
  breeze.setDown(true);
  const card = page.locator('[data-section="audiobook"]');
  await card.getByRole('button', { name: 'Make ready' }).click();
  await page.getByRole('dialog', { name: 'Make ready' }).getByRole('button', { name: 'Start' }).click();
  await expect(card.getByText('Making it ready')).toBeVisible();
  await card.getByRole('button', { name: /^Stop/ }).click();
  await expect(card.getByText('Making it ready')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Make ready' })).toBeEnabled();
  const jobs = (await apiCall(stack.api, 'GET', `/api/jobs?audiobook_id=${w.free.id}`)).json.items as { state: string }[];
  expect(jobs[0]!.state).toBe('stopped');
});

test('live: a job started from another device shows up without reloading', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  await openBook(page, w);
  const card = page.locator('[data-section="audiobook"]');
  await expect(card.getByText('0 of 5 chapters ready')).toBeVisible();
  breeze.setDown(true);
  const r = await apiCall(stack.api, 'POST', `/api/audiobooks/${w.free.id}/make-ready`, { scope: { kind: 'whole_book' } }, DEVICE, w.listener);
  expect(r.status).toBe(202);
  await expect(card.getByText('Making it ready')).toBeVisible({ timeout: 10000 });
  breeze.setDown(false);
  await expect(card.getByText('5 of 5 chapters ready')).toBeVisible({ timeout: 30000 });
});

test('a book that is not there says so and keeps your places', async ({ page, stack }) => {
  await apiCall(stack.api, 'POST', '/api/listeners', { name: 'Nick' });
  await signIn(page);
  await page.goto('/#/book/01NOSUCHBOOK');
  await expect(page.getByText('This book is not here')).toBeVisible();
  await page.getByRole('button', { name: 'Back to library' }).click();
  await expect(page).toHaveURL(/#\/library$/);
});

test('tablet: the three columns show the same page', async ({ page, stack, breeze }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  const w = await world(stack.api, breeze);
  await openBook(page, w);
  await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible();
  await expect(page.locator('[data-section="audiobook"]').getByText('Mara')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue listening' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to library' })).toBeVisible();
});

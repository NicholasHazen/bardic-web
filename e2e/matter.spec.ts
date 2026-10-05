import type { Locator, Page, Response } from '@playwright/test';
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import { configureBreeze, importFile, mkListener } from './helpers/world';
import { zip } from './zip';
import type { Fake } from './fakes';

const DEV = 'e2e-matter-device';
const BOOK = 'The Kestrel Ledger';
const TITLES = ['Before the voyage', 'Chapter 1: The Kestrel', 'The Beacon', 'After the voyage'];
const KINDS = ['front_matter', 'story', 'story', 'back_matter'];
const INCLUDE = 'Include front and back matter';

/** Original prose in opaque files, with names only in EPUB3 navigation. */
function matterEpub(paginated = false): Buffer {
  const names = ['s07.xhtml', 's 18.xhtml', 's29.xhtml', 's43.xhtml'];
  const tokens = ['frontmatter', 'chapter', 'chapter', 'backmatter'];
  const words = [
    'FrontOnly: This original notice introduces a fictional ledger kept aboard an imaginary vessel.',
    'KestrelOnly: Neri carried the brass lantern to the quiet pier. The kestrel turned above the water. She opened the ledger and drew a little star beside the morning entry. A sailor waved from the deck, and the boat moved gently toward the channel. “Keep the light steady,” she said. The flame flickered like a tiny 🔥 beneath the blue glass. Nobody hurried; there was time to watch the tide.',
    'BeaconOnly: Farther along the coast, Oren waited beside the beacon. He counted the flashes and wrote each interval in his notebook. A soft wind moved the grass around his boots. Beyond the rocks, a small boat appeared in the mist. He lifted his hand in greeting, then set a warm cup on the wall. The fog thinned until he could see the lantern shining at the bow.',
    'BackOnly: This original closing note thanks the imaginary cartographers who charted the fictional inlet.',
  ];
  const files: Record<string, string> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    'OPS/book.opf': `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${BOOK}</dc:title><dc:creator>A. Inventor</dc:creator></metadata><manifest><item id="nav" href="navigation/toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>${names.map((name, i) => `<item id="r${i}" href="pages/${name.replace(' ', '%20')}" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${names.map((_, i) => `<itemref idref="r${i}"/>`).join('')}</spine></package>`,
    // TOC order deliberately differs from the spine; chapter reading order must
    // still follow the source. A page-list must never supply chapter names.
    'OPS/navigation/toc.xhtml': `<html xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="page-list">${paginated ? '<a href="../pages/s%2018.xhtml#p10">10</a><a href="../pages/s%2018.xhtml#p11">11</a>' : '<a href="../pages/s%2018.xhtml">17</a>'}</nav><nav epub:type="toc"><ol>${[3, 2, 1, 0].map((i) => `<li><a href="../pages/${names[i]!.replace(' ', '%20')}#start">${TITLES[i]}</a></li>`).join('')}</ol></nav></body></html>`,
  };
  names.forEach((name, i) => {
    const body = paginated && i === 1
      ? `<span id="p10"></span><p>${words[i]}</p><span id="p11"></span><p>Neri traced a signal of ${'🔥'.repeat(180)} across her imaginary chart.</p>`
      : `<p>${words[i]}</p>`;
    files[`OPS/pages/${name}`] = `<html xmlns:epub="http://www.idpf.org/2007/ops"><body><section epub:type="${tokens[i]}" id="start">${body}</section></body></html>`;
  });
  return zip(files);
}

interface Chapter {
  id: string;
  index: number;
  title: string;
  kind: string;
  word_count: number;
  text_length: number;
  page_count: number | null;
  text_sha256: string;
}

interface World {
  listener: string;
  book: string;
  audiobook: string;
  chapters: Chapter[];
}

async function world(api: string, breeze: Fake, tier: 'free' | 'premium' = 'free', paginated = false): Promise<World> {
  const listener = await mkListener(api, 'Synthetic chapter listener');
  await configureBreeze(api, breeze);
  if (tier === 'premium') {
    expect((await apiCall(api, 'PUT', '/api/voice-sources/gemini', { api_key: 'test-key' }, DEV)).status).toBe(200);
    expect((await apiCall(api, 'PUT', '/api/prices/gemini', { unit: 'million_characters', per_unit: { micros: 18_200_000, currency: 'USD' } }, DEV, listener)).status).toBe(200);
  }
  const book = await importFile(api, listener, 'kestrel-ledger.epub', new Uint8Array(matterEpub(paginated)), 'application/epub+zip');
  const chapters = (await apiCall(api, 'GET', `/api/books/${book}/chapters`, undefined, DEV, listener)).json.items as Chapter[];
  expect(chapters.map((c) => c.title)).toEqual(TITLES);
  expect(chapters.map((c) => c.kind)).toEqual(KINDS);
  const voices = (await apiCall(api, 'GET', '/api/voices')).json.items as { id: string; name: string }[];
  const voice = voices.find((v) => v.name === (tier === 'free' ? 'Mara' : 'Kore'))!;
  const made = await apiCall(api, 'POST', `/api/books/${book}/audiobooks`, { voice_id: voice.id }, DEV, listener);
  expect(made.status).toBe(201);
  return { listener, book, audiobook: made.json.id as string, chapters };
}

async function openBook(page: Page, w: World) {
  await page.addInitScript((id) => localStorage.setItem('bardic.listener', id), w.listener);
  await page.goto(`/#/book/${w.book}`);
  await expect(page.getByRole('heading', { name: BOOK, exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('[data-section="audiobook"]')).toBeVisible();
}

const card = (page: Page) => page.locator('[data-section="audiobook"]');
const makeSheet = (page: Page) => page.getByRole('dialog', { name: 'Make ready', exact: true });
const toMake = (sheet: Locator) => sheet.locator('dt').filter({ hasText: /^To make$/ }).locator('..').locator('dd');
const inclusion = (sheet: Locator) => sheet.getByRole('checkbox', { name: INCLUDE, exact: true });
const previewResponse = (page: Page) => page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/plan-preview'));
const states = async (api: string, w: World) => ((await apiCall(api, 'GET', `/api/audiobooks/${w.audiobook}/chapters`, undefined, DEV, w.listener)).json.items as { state: string }[]).map((c) => c.state);
const chapterOptions = (page: Page) => page.getByRole('button', { name: 'Chapter options', exact: true });
const showMatter = (scope: Page | Locator) => scope.getByRole('switch', { name: 'Show front and back matter', exact: true });
const updateDetails = (page: Page) => page.getByRole('button', { name: /^(Update chapter details|Updating chapter details…)$/ });

async function nothingPaidStarted(api: string, listener: string, gemini: Fake) {
  expect(gemini.received()).toBe(0);
  for (const path of ['/api/jobs', '/api/plans']) {
    const r = await apiCall(api, 'GET', path, undefined, DEV, listener);
    expect(r.status).toBe(200);
    expect(r.json.items).toEqual([]);
  }
  expect((await apiCall(api, 'GET', '/api/allowance')).json.spent).toMatchObject({ known: { micros: 0 }, unknown_items: 0 });
}

test('EPUB navigation supplies exact names and book/player matter filters preserve the story', async ({ page, stack, breeze, gemini }) => {
  const w = await world(stack.api, breeze);
  await openBook(page, w);
  const bookRows = page.locator('[data-chapter-rows] > div');
  await expect(bookRows).toHaveCount(4);
  for (let i = 0; i < TITLES.length; i++) await expect(bookRows.nth(i)).toContainText(TITLES[i]!);
  // Maintenance options stay collapsed until the listener asks for them.
  await expect(showMatter(page)).toBeHidden();
  await expect(updateDetails(page)).toBeHidden();
  await expect(chapterOptions(page)).toHaveAttribute('aria-expanded', 'false');
  await chapterOptions(page).click();
  await expect(chapterOptions(page)).toHaveAttribute('aria-expanded', 'true');
  const hideBook = showMatter(page);
  await expect(hideBook).toBeChecked();
  await expect(page.getByText('Shown', { exact: true })).toBeVisible();
  await hideBook.click();
  await expect(hideBook).not.toBeChecked();
  await expect(page.getByText('Hidden · your current chapter stays visible', { exact: true })).toBeVisible();
  await expect(bookRows).toHaveCount(2);
  await expect(bookRows.nth(0)).toContainText(TITLES[1]!);
  await expect(bookRows.nth(1)).toContainText(TITLES[2]!);
  await hideBook.click();
  await expect(hideBook).toBeChecked();
  await expect(bookRows).toHaveCount(4);
  await chapterOptions(page).click();
  await expect(showMatter(page)).toBeHidden();
  await expect(updateDetails(page)).toBeHidden();
  expect(breeze.received()).toBe(0);
  expect(gemini.received()).toBe(0);

  // First Listen starts with the story and look-ahead never narrates matter.
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${w.book}$`));
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Chapters', exact: true }).click();
  const chapters = page.getByRole('dialog', { name: 'Chapters', exact: true });
  const playerRows = chapters.getByRole('list', { name: 'Chapters', exact: true }).getByRole('button');
  await expect(playerRows).toHaveCount(4);
  await expect(playerRows.nth(1)).toHaveAttribute('aria-current', 'true');
  const hidePlayer = showMatter(chapters);
  await expect(hidePlayer).toBeChecked();
  await hidePlayer.click();
  await expect(hidePlayer).not.toBeChecked();
  await expect(playerRows).toHaveCount(2);
  await hidePlayer.click();
  await expect(hidePlayer).toBeChecked();
  await expect(playerRows).toHaveCount(4);
  expect(breeze.spoken.join(' ')).not.toMatch(/FrontOnly|BackOnly/);

  // Retained matter remains playable when the listener chooses it explicitly.
  await playerRows.nth(0).click();
  await expect(chapters).toHaveCount(0);
  await expect(page.getByText(TITLES[0]!, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Chapters', exact: true }).click();
  await showMatter(chapters).click();
  await expect(playerRows).toHaveCount(3);
  await expect(playerRows.nth(0)).toHaveAttribute('aria-current', 'true');
  await expect(playerRows.nth(0)).toContainText(TITLES[0]!);
  await showMatter(chapters).click();
  await expect(playerRows).toHaveCount(4);
  await chapters.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => breeze.spoken.join(' ')).toContain('FrontOnly');
  expect(gemini.received()).toBe(0);
});

test('chapter lists show source pages, voiced runtime and code point progress beside the audio word', async ({ page, stack, breeze, gemini }, testInfo) => {
  const w = await world(stack.api, breeze, 'free', true);
  const story = w.chapters[1]!;
  expect(w.chapters.map((chapter) => chapter.page_count)).toEqual([null, 2, null, null]);
  const text = (await apiCall(stack.api, 'GET', `/api/books/${w.book}/chapters/${story.id}/text`, undefined, DEV, w.listener)).json.text as string;
  expect(story.text_length).toBe([...text].length);
  expect(story.text_length).toBeLessThan(text.length);
  const offset = Math.floor(story.text_length / 2);
  const percent = Math.floor(offset / story.text_length * 100);
  // Enough supplementary-plane characters make UTF-16 indexing observably wrong.
  expect(Math.floor(offset / text.length * 100)).not.toBe(percent);
  expect((await apiCall(stack.api, 'PUT', `/api/books/${w.book}/place`, { chapter_id: story.id, offset, mode: 'reading', audiobook_id: w.audiobook, base_revision: 0 }, DEV, w.listener)).status).toBe(200);

  await openBook(page, w);
  const rows = page.locator('[data-chapter-rows] > div');
  const current = rows.nth(1);
  await expect(current).toContainText(`${story.word_count.toLocaleString('en-US')} words · 2 pages`);
  await expect(current).toContainText(`${percent}% through chapter`);
  await expect(current.getByText('Not yet', { exact: true })).toBeVisible();
  await expect(current).not.toContainText('audio');
  await expect(rows.nth(2)).not.toContainText(/\bpages?\b|audio/);

  expect((await apiCall(stack.api, 'POST', `/api/audiobooks/${w.audiobook}/chapters/${story.id}/request`, { ahead: 0 }, DEV, w.listener)).status).toBe(202);
  await expect.poll(() => states(stack.api, w)).toEqual(['not_yet', 'ready', 'not_yet', 'not_yet']);
  await expect(current).toContainText('<1 min audio');
  await expect(current).toContainText(`${percent}% through chapter`);
  await expect(current.getByText('Ready', { exact: true })).toBeVisible();
  await chapterOptions(page).click();
  await current.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/bardic-chapter-review-book-${testInfo.project.name}.png`, fullPage: true });

  await page.goto(`/#/listen/${w.book}`);
  await page.getByRole('button', { name: 'Show controls', exact: true }).click();
  await page.getByRole('dialog', { name: 'Playback controls', exact: true }).getByRole('button', { name: 'Chapters', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Chapters', exact: true });
  const playerCurrent = sheet.getByRole('list', { name: 'Chapters', exact: true }).getByRole('button').nth(1);
  await expect(playerCurrent).toHaveAttribute('aria-current', 'true');
  await expect(playerCurrent).toContainText(`${story.word_count.toLocaleString('en-US')} words · 2 pages · <1 min audio`);
  await expect(playerCurrent).toContainText(`${percent}% through chapter`);
  await expect(playerCurrent.getByText('Ready', { exact: true })).toBeVisible();
  await page.screenshot({ path: `/tmp/bardic-chapter-review-player-${testInfo.project.name}.png`, fullPage: true });
  expect(gemini.received()).toBe(0);
});

test('free Make ready defaults to story chapters and inclusion changes counts and the actual job', async ({ page, stack, breeze, gemini }) => {
  const w = await world(stack.api, breeze);
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Make ready', exact: true }).click();
  const sheet = makeSheet(page);
  const include = inclusion(sheet);
  await expect(include).not.toBeChecked();
  await expect(toMake(sheet)).toHaveText('2 chapters');
  await include.click();
  await expect(include).toBeChecked();
  await expect(toMake(sheet)).toHaveText('4 chapters');
  await include.click();
  await expect(toMake(sheet)).toHaveText('2 chapters');
  expect(breeze.received()).toBe(0);
  const storyRequest = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === `/api/audiobooks/${w.audiobook}/make-ready`);
  await sheet.getByRole('button', { name: 'Start', exact: true }).click();
  expect((await storyRequest).postDataJSON()).toMatchObject({ scope: { kind: 'whole_book', include_matter: false } });
  await expect.poll(() => states(stack.api, w), { timeout: 30000 }).toEqual(['not_yet', 'ready', 'ready', 'not_yet']);
  expect(breeze.spoken.join(' ')).not.toMatch(/FrontOnly|BackOnly/);

  await card(page).getByRole('button', { name: 'Make ready', exact: true }).click();
  await expect(inclusion(sheet)).not.toBeChecked();
  await inclusion(sheet).click();
  await expect(toMake(sheet)).toHaveText('2 chapters');
  const allRequest = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === `/api/audiobooks/${w.audiobook}/make-ready`);
  await sheet.getByRole('button', { name: 'Start', exact: true }).click();
  expect((await allRequest).postDataJSON()).toMatchObject({ scope: { kind: 'whole_book', include_matter: true } });
  await expect.poll(() => states(stack.api, w), { timeout: 30000 }).toEqual(['ready', 'ready', 'ready', 'ready']);
  expect(breeze.spoken.filter((text) => text.includes('KestrelOnly'))).toHaveLength(1);
  expect(breeze.spoken.filter((text) => text.includes('BeaconOnly'))).toHaveLength(1);
  expect(breeze.spoken.join(' ')).toMatch(/FrontOnly/);
  expect(breeze.spoken.join(' ')).toMatch(/BackOnly/);
  expect(gemini.received()).toBe(0);
});

test('premium matter inclusion gets a fresh estimate and cannot generate before Approve', async ({ page, stack, breeze, gemini }) => {
  const w = await world(stack.api, breeze, 'premium');
  await openBook(page, w);
  const firstResponse = previewResponse(page);
  await card(page).getByRole('button', { name: 'Plan the whole book', exact: true }).click();
  const first = await (await firstResponse).json();
  expect(first).toMatchObject({ scope: { kind: 'whole_book', include_matter: false }, chapters_to_make: 2 });
  const sheet = makeSheet(page);
  const include = inclusion(sheet);
  await expect(include).not.toBeChecked();
  await expect(toMake(sheet)).toHaveText('2 chapters');
  const estimates: string[] = [first.estimate_id as string];
  let current: { estimate_id: string; chapters_to_make: number; scope: { include_matter: boolean } } = first;
  for (const checked of [true, false, true]) {
    const response: Promise<Response> = previewResponse(page);
    await include.click();
    current = await (await response).json();
    expect(current.scope.include_matter).toBe(checked);
    expect(current.chapters_to_make).toBe(checked ? 4 : 2);
    estimates.push(current.estimate_id);
    await expect(toMake(sheet)).toHaveText(checked ? '4 chapters' : '2 chapters');
    await nothingPaidStarted(stack.api, w.listener, gemini);
  }
  expect(new Set(estimates).size).toBe(estimates.length);
  const approvalRequest = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/plans');
  const approve = sheet.getByRole('button', { name: /^Approve plan · up to \$/ });
  await expect(approve).toBeEnabled();
  await approve.click();
  expect((await approvalRequest).postDataJSON().estimate_id).toBe(current.estimate_id);
  await expect.poll(() => states(stack.api, w), { timeout: 30000 }).toEqual(['ready', 'ready', 'ready', 'ready']);
  const plans = (await apiCall(stack.api, 'GET', '/api/plans', undefined, DEV, w.listener)).json.items;
  expect(plans).toHaveLength(1);
  expect(plans[0]).toMatchObject({ scope: { kind: 'whole_book', include_matter: true }, chapters_total: 4 });
  expect(gemini.spoken.join(' ')).toMatch(/FrontOnly/);
  expect(gemini.spoken.join(' ')).toMatch(/BackOnly/);
  expect(breeze.received()).toBe(0);
});

test('Update chapter details shows busy and completion feedback, then reports a repeated no-op', async ({ page, stack, breeze, gemini }) => {
  const w = await world(stack.api, breeze);
  expect((await apiCall(stack.api, 'POST', `/api/audiobooks/${w.audiobook}/chapters/${w.chapters[1]!.id}/request`, { ahead: 0 }, DEV, w.listener)).status).toBe(202);
  await expect.poll(() => states(stack.api, w)).toEqual(['not_yet', 'ready', 'not_yet', 'not_yet']);
  expect((await apiCall(stack.api, 'PUT', `/api/books/${w.book}/place`, { chapter_id: w.chapters[1]!.id, offset: 12, mode: 'reading', audiobook_id: w.audiobook, base_revision: 0 }, DEV, w.listener)).status).toBe(200);
  const texts = () => Promise.all(w.chapters.map((c) => apiCall(stack.api, 'GET', `/api/books/${w.book}/chapters/${c.id}/text`, undefined, DEV, w.listener).then((r) => r.json)));
  const getAudio = () => apiCall(stack.api, 'GET', `/api/audiobooks/${w.audiobook}/chapters`, undefined, DEV, w.listener).then((r) => r.json);
  const getPlace = () => apiCall(stack.api, 'GET', `/api/books/${w.book}/place`, undefined, DEV, w.listener).then((r) => r.json);
  const before = { texts: await texts(), audio: await getAudio(), place: await getPlace(), calls: breeze.received() };

  // Present the prior client-facing names while retaining the real saved EPUB.
  // Server conformance tests cover persisted legacy metadata; this browser
  // regression covers the refresh action and its immutable dependent records.
  let oldNames = true;
  await page.route(`**/api/books/${w.book}/chapters*`, async (route) => {
    if (route.request().method() !== 'GET' || new URL(route.request().url()).pathname !== `/api/books/${w.book}/chapters` || !oldNames) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.json();
    body.items = body.items.map((c: Chapter, i: number) => ({ ...c, title: `Section ${i + 1}` }));
    await route.fulfill({ response, json: body });
  });
  await openBook(page, w);
  const rows = page.locator('[data-chapter-rows] > div');
  await expect(rows.nth(1)).toContainText('Section 2');
  await expect(updateDetails(page)).toBeHidden();
  await chapterOptions(page).click();
  const refresh = updateDetails(page);
  await expect(refresh).toBeEnabled();
  let releaseRefresh!: () => void;
  const gate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  await page.route(`**/api/books/${w.book}/chapters/refresh`, async (route) => {
    await gate;
    await route.continue();
  });
  oldNames = false;
  const response = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/books/${w.book}/chapters/refresh`);
  await refresh.click();
  await expect(refresh).toHaveText('Updating chapter details…');
  await expect(refresh).toBeDisabled();
  releaseRefresh();
  const refreshed = await response;
  expect(refreshed.status()).toBe(200);
  const items = (await refreshed.json()).items as Chapter[];
  expect(items.map(({ id, text_sha256 }) => ({ id, text_sha256 }))).toEqual(w.chapters.map(({ id, text_sha256 }) => ({ id, text_sha256 })));
  for (let i = 0; i < TITLES.length; i++) await expect(rows.nth(i)).toContainText(TITLES[i]!);
  await expect(page.getByRole('status').filter({ hasText: 'Chapter details updated.' })).toBeVisible();
  await expect(refresh).toHaveText('Update chapter details');
  await expect(refresh).toBeEnabled();
  const repeated = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/books/${w.book}/chapters/refresh`);
  await refresh.click();
  expect((await repeated).status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'Chapter details are up to date.' })).toBeVisible();
  expect(await texts()).toEqual(before.texts);
  expect(await getAudio()).toEqual(before.audio);
  expect(await getPlace()).toEqual(before.place);
  expect(breeze.received()).toBe(before.calls);
  expect(gemini.received()).toBe(0);
});

test('returning to a book leaves a newer chapter update in charge of its busy state and notice', async ({ page, stack, breeze, gemini }) => {
  const w = await world(stack.api, breeze);
  const other = await importFile(stack.api, w.listener, 'other-synthetic-ledger.txt', Buffer.from('Chapter 1\n\nAn original imaginary ledger waited on another shelf.'), 'text/plain');
  const otherTitle = (await apiCall(stack.api, 'GET', `/api/books/${other}`, undefined, DEV, w.listener)).json.title as string;
  let refreshPosts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === `/api/books/${w.book}/chapters/refresh`) refreshPosts++;
  });
  await page.addInitScript((id) => localStorage.setItem('bardic.listener', id), w.listener);
  await page.goto(`/?e2e=offline#/book/${w.book}`);
  await page.waitForFunction(() => !!window.__offline && !!window.__offlineKit);
  await expect(page.getByRole('heading', { name: BOOK, exact: true, level: 1 })).toBeVisible();
  await page.evaluate(() => {
    const scoped = window as Window & { __chapterUpdateReleases?: (() => void)[]; __chapterUpdatesFinished?: number };
    const engine = window.__offline!;
    const original = engine.updateChapterMetadata.bind(engine);
    scoped.__chapterUpdateReleases = [];
    scoped.__chapterUpdatesFinished = 0;
    engine.updateChapterMetadata = async (...args) => {
      await new Promise<void>((resolve) => scoped.__chapterUpdateReleases!.push(resolve));
      await original(...args);
      scoped.__chapterUpdatesFinished = (scoped.__chapterUpdatesFinished ?? 0) + 1;
    };
  });
  await chapterOptions(page).click();
  await updateDetails(page).click();
  await page.waitForFunction(() => (window as Window & { __chapterUpdateReleases?: (() => void)[] }).__chapterUpdateReleases?.length === 1);
  await expect(updateDetails(page)).toHaveText('Updating chapter details…');

  // A different route invalidates the first operation; returning starts a new
  // operation against the same book and listener identities.
  await page.goto(`/?e2e=offline#/book/${other}`);
  await expect(page.getByRole('heading', { name: otherTitle, exact: true, level: 1 })).toBeVisible();
  await page.goto(`/?e2e=offline#/book/${w.book}`);
  await expect(page.getByRole('heading', { name: BOOK, exact: true, level: 1 })).toBeVisible();
  await chapterOptions(page).click();
  await updateDetails(page).click();
  await page.waitForFunction(() => (window as Window & { __chapterUpdateReleases?: (() => void)[] }).__chapterUpdateReleases?.length === 2);
  await page.evaluate(() => (window as Window & { __chapterUpdateReleases?: (() => void)[] }).__chapterUpdateReleases![0]!());
  await page.waitForFunction(() => (window as Window & { __chapterUpdatesFinished?: number }).__chapterUpdatesFinished === 1);
  await expect(updateDetails(page)).toHaveText('Updating chapter details…');
  await expect(updateDetails(page)).toBeDisabled();
  await expect(page.getByText('Chapter details are up to date.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Chapter details updated.', { exact: true })).toHaveCount(0);

  await page.evaluate(() => (window as Window & { __chapterUpdateReleases?: (() => void)[] }).__chapterUpdateReleases![1]!());
  await expect(updateDetails(page)).toHaveText('Update chapter details');
  await expect(updateDetails(page)).toBeEnabled();
  await expect(page.getByRole('status').filter({ hasText: 'Chapter details are up to date.' })).toBeVisible();
  expect(refreshPosts).toBe(2);
  expect(breeze.received()).toBe(0);
  expect(gemini.received()).toBe(0);
});

test('Refresh keeps downloaded text and audio while correcting cached section names and matter kinds', async ({ page, stack, breeze, gemini }) => {
  const w = await world(stack.api, breeze);
  const story = w.chapters[1]!;
  expect((await apiCall(stack.api, 'POST', `/api/audiobooks/${w.audiobook}/chapters/${story.id}/request`, { ahead: 0 }, DEV, w.listener)).status).toBe(202);
  await expect.poll(() => states(stack.api, w)).toEqual(['not_yet', 'ready', 'not_yet', 'not_yet']);
  let oldMetadata = true;
  let refreshPosts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === `/api/books/${w.book}/chapters/refresh`) refreshPosts++;
  });
  // Both the connected book list and the real downloader read this projection.
  // The actual saved EPUB, chapter IDs, text and audio remain synthetic and real.
  await page.route(`**/api/books/${w.book}/chapters*`, async (route) => {
    if (route.request().method() !== 'GET' || new URL(route.request().url()).pathname !== `/api/books/${w.book}/chapters` || !oldMetadata) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.json();
    body.items = body.items.map((c: Chapter, i: number) => ({ ...c, title: `Section ${i + 1}`, kind: 'story' }));
    await route.fulfill({ response, json: body });
  });
  await page.addInitScript((id) => localStorage.setItem('bardic.listener', id), w.listener);
  await page.goto(`/?e2e=offline#/book/${w.book}`);
  await page.waitForFunction(() => !!window.__offline && !!window.__offlineKit);
  await expect(page.getByRole('heading', { name: BOOK, exact: true, level: 1 })).toBeVisible();
  await page.evaluate(async ({ audiobook, chapter }) => {
    await window.__offline!.ready;
    await window.__offline!.start(audiobook, { kind: 'chapters', chapterIds: [chapter] }, { wifiOnly: false, keepNew: false });
  }, { audiobook: w.audiobook, chapter: story.id });
  await expect.poll(() => page.evaluate(({ audiobook, chapter }) => window.__offline!.heldChapters(audiobook).has(chapter), { audiobook: w.audiobook, chapter: story.id })).toBe(true);

  const snapshot = () => page.evaluate(async ({ audiobook, book, chapter }) => {
    const store = window.__offlineKit!.realStore;
    const record = await store.chapter(audiobook, chapter);
    if (!record) throw new Error('The synthetic story chapter was not downloaded.');
    const audio = await store.readAudio(record.audioId);
    if (!audio) throw new Error('The downloaded synthetic audio is missing.');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await audio.arrayBuffer()))].map((n) => n.toString(16).padStart(2, '0')).join('');
    const meta = await store.getValue<{ chapters: { id: string; index: number; title: string; kind: string; wordCount: number; textLength: number; pageCount: number | null }[] }>(`book:${audiobook}`);
    return {
      record,
      content: await store.content(audiobook, chapter),
      audio: { bytes: audio.size, sha256: hash },
      cachedChapters: meta?.chapters ?? [],
      heldChapters: window.__offline!.heldBook(book, audiobook)?.chapters ?? [],
    };
  }, { audiobook: w.audiobook, book: w.book, chapter: story.id });
  const before = await snapshot();
  const oldChapters = w.chapters.map((c, i) => ({ id: c.id, index: i, title: `Section ${i + 1}`, kind: 'story', wordCount: c.word_count, textLength: c.text_length, pageCount: c.page_count }));
  expect(before.cachedChapters).toEqual(oldChapters);
  expect(before.heldChapters).toEqual(oldChapters);
  expect(before.audio).toMatchObject({ bytes: before.record.bytes, sha256: before.record.sha256 });
  const calls = breeze.received();

  await page.evaluate(() => {
    const scoped = window as Window & { __releaseMatterRefresh?: () => void; __matterRefreshEntered?: boolean };
    const engine = window.__offline!;
    const original = engine.updateChapterMetadata.bind(engine);
    const gate = new Promise<void>((resolve) => { scoped.__releaseMatterRefresh = resolve; });
    engine.updateChapterMetadata = async (...args) => {
      scoped.__matterRefreshEntered = true;
      await gate;
      await original(...args);
    };
  });
  oldMetadata = false;
  const response = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/books/${w.book}/chapters/refresh`);
  await chapterOptions(page).click();
  const refresh = updateDetails(page);
  await refresh.click();
  expect((await response).status()).toBe(200);
  await page.waitForFunction(() => (window as Window & { __matterRefreshEntered?: boolean }).__matterRefreshEntered === true);
  await expect(refresh).toBeDisabled();
  await expect(refresh).toHaveText('Updating chapter details…');
  // An additional activation while durable cache reconciliation is pending
  // cannot submit a second refresh.
  await refresh.evaluate((button) => (button as HTMLButtonElement).click());
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(refreshPosts).toBe(1);
  expect(await snapshot()).toEqual(before);
  await page.evaluate(() => {
    const scoped = window as Window & { __releaseMatterRefresh?: () => void };
    scoped.__releaseMatterRefresh!();
  });
  await expect(refresh).toBeEnabled();
  const after = await snapshot();
  const freshChapters = w.chapters.map((c, i) => ({ id: c.id, index: i, title: c.title, kind: c.kind, wordCount: c.word_count, textLength: c.text_length, pageCount: c.page_count }));
  expect(after.cachedChapters).toEqual(freshChapters);
  expect(after.heldChapters).toEqual(freshChapters);
  expect(after.record).toEqual(before.record);
  expect(after.content).toEqual(before.content);
  expect(after.audio).toEqual(before.audio);
  expect(refreshPosts).toBe(1);
  expect(breeze.received()).toBe(calls);
  expect(gemini.received()).toBe(0);
});

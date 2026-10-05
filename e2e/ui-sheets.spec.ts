import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import { importFile, mkListener } from './helpers/world';
import { zip } from './zip';

const DEV = 'e2e-ui-sheets-device';
const OTHER = 'e2e-ui-sheets-other-device';
const BOOK_TITLE = 'SyntheticCartographicNotebookWithALongUnbrokenTitleForTheSheetReview';
const CHAPTER_TITLE = 'IntercontinentalSyntheticCartographicObservationsWithoutAnySpacesForWrapping🦉café';
const DEVICE_NAME = 'SyntheticTabletWithAnUnbrokenSixtyCharacterDeviceNameForLayout'.padEnd(60, 'X').slice(0, 60);

async function buttonFits(button: Locator, page: Page) {
  await expect(button).toBeVisible();
  const r = await button.boundingBox();
  const viewport = page.viewportSize()!;
  expect(r).not.toBeNull();
  expect(r!.width).toBeGreaterThanOrEqual(44);
  expect(r!.height).toBeGreaterThanOrEqual(44);
  expect(r!.x).toBeGreaterThanOrEqual(-1);
  expect(r!.x + r!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(r!.y).toBeGreaterThanOrEqual(-1);
  expect(r!.y + r!.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function textFits(text: Locator) {
  await expect(text).toBeVisible();
  const m = await text.evaluate((el) => {
    const bounds = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    return {
      left: bounds.left, right: bounds.right, client: el.clientWidth, scroll: el.scrollWidth,
      lines: [...range.getClientRects()].filter((r) => r.width > 0).map((r) => ({ left: r.left, right: r.right })),
    };
  });
  expect(m.scroll).toBeLessThanOrEqual(m.client + 1);
  for (const line of m.lines) {
    expect(line.left).toBeGreaterThanOrEqual(m.left - 1);
    expect(line.right).toBeLessThanOrEqual(m.right + 1);
  }
}

async function noPaidWork(api: string, listener: string) {
  for (const path of ['/api/jobs', '/api/plans']) {
    const r = await apiCall(api, 'GET', path, undefined, DEV, listener);
    expect(r.status).toBe(200);
    expect(r.json.items).toHaveLength(0);
  }
  expect((await apiCall(api, 'GET', '/api/allowance')).json.spent).toMatchObject({ known: { micros: 0 }, unknown_items: 0 });
}

for (const [width, height] of [[390, 844], [320, 568]]) {
  test(`the live 30-voice Premium chooser scrolls its list while keeping plan controls in reach at ${width}px`, async ({ page, stack, breeze, gemini }) => {
    await page.setViewportSize({ width, height });
    const listener = await mkListener(stack.api, 'Synthetic sheet reader');
    // The fixture sends this key only to the local fake Gemini. No examples or plans are requested.
    expect((await apiCall(stack.api, 'PUT', '/api/voice-sources/gemini', { api_key: 'test-key' }, DEV)).status).toBe(200);
    const book = (await apiCall(stack.api, 'POST', '/api/books/sample', {}, DEV, listener)).json.id as string;
    await page.addInitScript((id) => localStorage.setItem('bardic.listener', id), listener);
    await page.goto(`/#/book/${book}`);
    await page.getByRole('button', { name: 'Choose a voice', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Choose a voice', exact: true });
    await dialog.getByRole('radio', { name: 'Premium', exact: true }).click();
    const panel = dialog.getByRole('radiogroup', { name: 'Premium voices', exact: true });
    const choices = panel.getByRole('radio');
    await expect(choices).toHaveCount(30);

    const size = await panel.evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight, overflow: getComputedStyle(el).overflowY }));
    expect(size.client).toBeGreaterThanOrEqual(124);
    expect(size.scroll).toBeGreaterThan(size.client + 100);
    expect(size.overflow).toBe('auto');
    const plan = dialog.getByRole('button', { name: 'Plan the whole book', exact: true });
    const close = dialog.getByRole('button', { name: 'Close', exact: true });
    await buttonFits(plan, page);
    await buttonFits(close, page);
    const outerScroll = await dialog.evaluate((el) => el.scrollTop);

    // Scroll the actual list, rather than letting a driver scroll the complete sheet to its final action.
    await panel.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const last = choices.last();
    await expect(last).toBeInViewport({ ratio: 0.99 });
    await last.click();
    await expect(last).toHaveAttribute('aria-checked', 'true');
    await expect(plan).toBeEnabled();
    expect(await dialog.evaluate((el) => el.scrollTop)).toBe(outerScroll);
    await buttonFits(plan, page);
    await buttonFits(close, page);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(breeze.received()).toBe(0);
    expect(gemini.received()).toBe(0);
    await noPaidWork(stack.api, listener);
    expect((await apiCall(stack.api, 'GET', `/api/books/${book}/audiobooks`, undefined, DEV, listener)).json.items).toHaveLength(0);
  });
}

async function textOnlyBook(page: Page, api: string) {
  const listener = await mkListener(api, 'Synthetic chapter reader');
  const titles = [`${CHAPTER_TITLE}One`, `${CHAPTER_TITLE}Two`];
  const files: Record<string, string> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'OEBPS/content.opf': `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${BOOK_TITLE}</dc:title><dc:creator>Synthetic writer</dc:creator></metadata><manifest>${titles.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${titles.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`,
  };
  titles.forEach((title, i) => { files[`OEBPS/c${i}.xhtml`] = `<html><body><h1>${title}</h1><p>This original synthetic section ${i + 1} records an imaginary folded atlas. A quiet 🦉 waits beside the café.</p></body></html>`; });
  const book = await importFile(api, listener, 'original-sheet-notebook.epub', zip(files), 'application/epub+zip');
  const chapters = (await apiCall(api, 'GET', `/api/books/${book}/chapters`, undefined, DEV, listener)).json.items as { id: string; title: string }[];
  expect(chapters.map((c) => c.title)).toEqual(titles);
  expect((await apiCall(api, 'PUT', `/api/books/${book}/place`, { chapter_id: chapters[0]!.id, offset: 1, mode: 'listening', base_revision: 0 }, DEV, listener)).status).toBe(200);
  await page.addInitScript((id) => localStorage.setItem('bardic.listener', id), listener);
  await page.goto(`/#/listen/${book}`);
  await expect(page.getByRole('heading', { name: BOOK_TITLE, exact: true })).toBeVisible();
  return { listener, book, chapters };
}

test('live Chapters keeps exact long chapter titles and its final action reachable on a narrow phone', async ({ page, stack, breeze, gemini }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const world = await textOnlyBook(page, stack.api);
  // Opening paused, without any audiobook, needs no audio generation or playback.
  await page.getByRole('button', { name: 'Chapters', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Chapters', exact: true });
  await expect(dialog).toBeVisible();
  const rows = dialog.getByRole('list', { name: 'Chapters', exact: true }).getByRole('button');
  await expect(rows).toHaveCount(world.chapters.length);
  for (let i = 0; i < world.chapters.length; i++) {
    const row = rows.nth(i);
    await row.scrollIntoViewIfNeeded();
    await buttonFits(row, page);
    await expect(row.locator('.title')).toHaveText(world.chapters[i]!.title);
    await textFits(row.locator('.title'));
  }
  const rest = dialog.getByRole('button', { name: 'Make the rest ready', exact: true });
  await rest.scrollIntoViewIfNeeded();
  await buttonFits(rest, page);
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await close.scrollIntoViewIfNeeded();
  await buttonFits(close, page);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(breeze.received()).toBe(0);
  expect(gemini.received()).toBe(0);
  await noPaidWork(stack.api, world.listener);
});

test('live place conflict wraps a long named device and exact chapter titles while keeping both choices reachable', async ({ page, stack, breeze, gemini }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const world = await textOnlyBook(page, stack.api);
  expect(Array.from(DEVICE_NAME)).toHaveLength(60);
  // Merely opening an unchanged server place does not persist a local snapshot.
  // Read and tap a real line so this device records its own distinct, paused place.
  await page.getByRole('radio', { name: 'Read', exact: true }).click();
  await page.getByRole('region', { name: 'Chapter text', exact: true }).locator('[data-line]').last().click();
  const thisDevice = await page.evaluate(() => localStorage.getItem('bardic.device')!);
  await expect.poll(async () => {
    const saved = (await apiCall(stack.api, 'GET', `/api/books/${world.book}/place`, undefined, DEV, world.listener)).json;
    return saved.device_id === thisDevice && saved.chapter_id === world.chapters[0]!.id && saved.mode === 'reading' && saved.offset > 1;
  }).toBe(true);
  const mine = (await apiCall(stack.api, 'GET', `/api/books/${world.book}/place`, undefined, DEV, world.listener)).json;
  await expect.poll(() => page.evaluate(([listener, book]) => {
    const raw = localStorage.getItem(`bardic.place.${listener}.${book}`);
    return raw ? JSON.parse(raw) : null;
  }, [world.listener, world.book])).toMatchObject({ chapterId: mine.chapter_id, offset: mine.offset, mode: 'reading', rev: mine.revision });
  // Register and rename a real synthetic device, then write its different place using the current revision.
  expect((await apiCall(stack.api, 'GET', '/api/server', undefined, OTHER)).status).toBe(200);
  expect((await apiCall(stack.api, 'PATCH', `/api/devices/${OTHER}`, { name: DEVICE_NAME }, DEV)).status).toBe(200);
  expect((await apiCall(stack.api, 'PUT', `/api/books/${world.book}/place`, { chapter_id: world.chapters[1]!.id, offset: 2, mode: 'reading', base_revision: mine.revision }, OTHER, world.listener)).status).toBe(200);
  // Reopening checks the remembered local place against the authoritative server revision,
  // independently of when the SSE reconnect notice arrives.
  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'Where to continue?', exact: true });
  await expect(dialog).toBeVisible();
  const cards = dialog.getByRole('list', { name: 'The two places', exact: true }).getByRole('listitem');
  await expect(cards).toHaveCount(2);
  const otherDevice = cards.locator('.device').filter({ hasText: DEVICE_NAME });
  await otherDevice.scrollIntoViewIfNeeded();
  await expect(otherDevice).toHaveText(DEVICE_NAME);
  await textFits(otherDevice);
  for (let i = 0; i < world.chapters.length; i++) {
    const chapter = cards.locator('.chapter').filter({ hasText: world.chapters[i]!.title });
    await chapter.scrollIntoViewIfNeeded();
    await textFits(chapter);
  }
  for (const label of ['Continue on Chapter 2', 'Stay on Chapter 1', 'Close']) {
    const choice = dialog.getByRole('button', { name: label, exact: true });
    await choice.scrollIntoViewIfNeeded();
    await buttonFits(choice, page);
  }
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // Merely inspecting the offered places must leave the server's new place intact.
  expect((await apiCall(stack.api, 'GET', `/api/books/${world.book}/place`, undefined, DEV, world.listener)).json.chapter_id).toBe(world.chapters[1]!.id);
  expect(breeze.received()).toBe(0);
  expect(gemini.received()).toBe(0);
  await noPaidWork(stack.api, world.listener);
});

// Live layout regressions use original synthetic books and the shared muted browser fixture.
// No generation, sample playback or plan approval is needed to inspect these screens.
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import { configureBreeze, freeVoiceId, importFile } from './helpers/world';
import { zip } from './zip';
import type { Fake } from './fakes';

const DEV = 'e2e-ui-layout';
const TITLE = 'IntercontinentalSyntheticCartographicReferenceWithoutAnySpacesForWrapping🦉café';
const AUTHOR = 'SyntheticAuthorWithAnUnusuallyLongUnbrokenSurnameForTheLayoutReview';
const SERIES = 'TheSyntheticCartographicArchiveWithAnUnusuallyLongSeriesNameForWrapping';
const CHAPTER = 'IntercontinentalCartographicObservationsWithoutAnySpacesForWrapping🦉café';
const SHORT_TITLE = 'A Short Synthetic Neighbor';

function syntheticBook(title: string, names: string[]) {
  const files: Record<string, string> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'OEBPS/content.opf': `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title><dc:creator>${AUTHOR}</dc:creator></metadata><manifest>${names.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${names.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`,
  };
  names.forEach((name, i) => {
    files[`OEBPS/c${i}.xhtml`] = `<html><body><h1>${name}</h1><p>This original synthetic section ${i + 1} belongs to an imaginary paper atlas. A quiet 🦉 waits beside the café while a folded ferry crosses the river.</p></body></html>`;
  });
  return zip(files);
}

async function setup(page: Page, api: string, breeze: Fake) {
  const listener = (await apiCall(api, 'POST', '/api/listeners', { name: 'Layout reader' }, DEV)).json.id as string;
  await configureBreeze(api, breeze);
  const voice = await freeVoiceId(api, listener);
  const book = await importFile(api, listener, 'original-layout-atlas.epub', syntheticBook(TITLE, ['Copyright', CHAPTER, 'Acknowledgements']), 'application/epub+zip');
  expect((await apiCall(api, 'PATCH', `/api/books/${book}`, { series: { name: SERIES, order: 2.5 } }, DEV, listener)).status).toBe(200);
  const ab = await apiCall(api, 'POST', `/api/books/${book}/audiobooks`, { voice_id: voice }, DEV, listener);
  expect([200, 201]).toContain(ab.status);
  const chapters = (await apiCall(api, 'GET', `/api/books/${book}/chapters`, undefined, DEV, listener)).json.items as { id: string; title: string; kind: string }[];
  const story = chapters.find((chapter) => chapter.kind === 'story')!;
  expect(story.title).toBe(CHAPTER);
  expect((await apiCall(api, 'PUT', `/api/books/${book}/place`, { chapter_id: story.id, offset: 0, audiobook_id: ab.json.id, mode: 'reading', base_revision: 0 }, DEV, listener)).status).toBe(200);
  const textResponse = await apiCall(api, 'GET', `/api/books/${book}/chapters/${story.id}/text`, undefined, DEV, listener);
  expect(textResponse.status).toBe(200);
  const text = textResponse.json;
  expect(typeof text.text).toBe('string');

  const neighbor = await importFile(api, listener, 'short-layout-neighbor.epub', syntheticBook(SHORT_TITLE, ['A Short Synthetic Chapter']), 'application/epub+zip');
  const shortChapter = (await apiCall(api, 'GET', `/api/books/${neighbor}/chapters`, undefined, DEV, listener)).json.items[0];
  const shortResponse = await apiCall(api, 'GET', `/api/books/${neighbor}/chapters/${shortChapter.id}/text`, undefined, DEV, listener);
  expect(shortResponse.status).toBe(200);
  const shortText = shortResponse.json.text as string;
  expect(typeof shortText).toBe('string');
  expect((await apiCall(api, 'PUT', `/api/books/${neighbor}/place`, { chapter_id: shortChapter.id, offset: Math.floor(Array.from(shortText).length / 2), mode: 'reading', base_revision: 0 }, DEV, listener)).status).toBe(200);
  await page.addInitScript((id) => localStorage.setItem('bardic.listener', id), listener);
  return { book, neighbor, chapters, story, text, listener };
}

async function textFits(locator: Locator) {
  await expect(locator).toBeVisible();
  const measured = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      left: bounds.left, right: bounds.right, client: element.clientWidth, scroll: element.scrollWidth,
      lines: [...range.getClientRects()].filter((r) => r.width > 0).map((r) => ({ left: r.left, right: r.right })),
    };
  });
  expect(measured.scroll).toBeLessThanOrEqual(measured.client + 1);
  for (const line of measured.lines) {
    expect(line.left).toBeGreaterThanOrEqual(measured.left - 1);
    expect(line.right).toBeLessThanOrEqual(measured.right + 1);
  }
}

async function mainFits(page: Page) {
  const widths = await page.locator('main').first().evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
}

for (const [width, height] of [[320, 740], [390, 844], [768, 1024], [834, 1194], [1194, 834], [1440, 1000]]) {
  test(`live Library and Book layouts retain long text and usable controls at ${width}px`, async ({ page, stack, breeze, gemini }) => {
    await page.setViewportSize({ width, height });
    const world = await setup(page, stack.api, breeze);
    await page.goto('/#/library');
    const tiles = page.locator('main .grid .tile');
    await expect(tiles).toHaveCount(2);
    for (const tile of await tiles.all()) {
      const cover = await tile.locator('.cover').boundingBox();
      expect(cover).not.toBeNull();
      expect(cover!.height / cover!.width).toBeCloseTo(1.5, 1);
      await textFits(tile.locator('.meta .name'));
    }
    const neighbor = page.locator(`.tile[href="#/book/${world.neighbor}"]`);
    const progress = neighbor.locator(':scope > .bar');
    await expect(progress).toBeVisible();
    const progressBounds = await progress.boundingBox();
    expect(progressBounds!.height).toBeGreaterThan(0);
    expect(progressBounds!.height).toBeLessThanOrEqual(4);
    await mainFits(page);

    await page.locator(`.tile[href="#/book/${world.book}"]`).click();
    const title = page.getByRole('heading', { name: TITLE, exact: true });
    await expect(title).toHaveText(TITLE);
    await textFits(title);
    await textFits(page.locator('.titles .series .badge'));
    const rows = page.locator('[data-chapter-rows] .row');
    await expect(rows).toHaveCount(world.chapters.length);
    for (let i = 0; i < world.chapters.length; i++) {
      const chapterTitle = rows.nth(i).locator('.title');
      await expect(chapterTitle).toHaveText(world.chapters[i].title);
      await textFits(chapterTitle);
    }
    if (width >= 768) {
      const column = await page.locator('.body > .center').boundingBox();
      expect(column!.width).toBeGreaterThanOrEqual(250);
      expect(column!.x).toBeGreaterThanOrEqual(0);
      expect(column!.x + column!.width).toBeLessThanOrEqual(width + 1);
    }
    const actions = page.locator('[data-section="audiobook"] .actions');
    await actions.scrollIntoViewIfNeeded();
    const buttons = actions.getByRole('button');
    await expect(buttons).toHaveCount(2);
    const bounds = await Promise.all((await buttons.all()).map((button) => button.boundingBox()));
    for (const rect of bounds) {
      expect(rect!.width).toBeGreaterThanOrEqual(44);
      expect(rect!.height).toBeGreaterThanOrEqual(44);
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1);
    }
    const [a, b] = bounds;
    const horizontal = Math.min(a!.x + a!.width, b!.x + b!.width) - Math.max(a!.x, b!.x);
    const vertical = Math.min(a!.y + a!.height, b!.y + b!.height) - Math.max(a!.y, b!.y);
    expect(horizontal <= 1 || vertical <= 1).toBe(true);
    await mainFits(page);
    const afterText = await apiCall(stack.api, 'GET', `/api/books/${world.book}/chapters/${world.story.id}/text`, undefined, DEV, world.listener);
    expect(afterText.status).toBe(200);
    expect(afterText.json).toEqual(world.text);

    // Open the real player without playing or making audio. The Chapters sheet
    // must also retain the exact long title within its usable control bounds.
    await page.goto(`/?e2e=player#/book/${world.book}`);
    await page.waitForFunction(() => !!window.__player);
    await page.evaluate(async (id) => {
      await window.__player!.open(id, { autoplay: false });
      window.__player!.setMode('listen');
      location.hash = `#/listen/${id}`;
    }, world.book);
    await page.getByRole('button', { name: 'Chapters', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Chapters', exact: true });
    await expect(dialog).toBeVisible();
    const chapterButton = dialog.getByRole('button', { name: new RegExp(CHAPTER) });
    await chapterButton.scrollIntoViewIfNeeded();
    await expect(chapterButton.locator('.title')).toHaveText(CHAPTER);
    await textFits(chapterButton.locator('.title'));
    const chapterBounds = await chapterButton.boundingBox();
    expect(chapterBounds!.height).toBeGreaterThanOrEqual(44);
    expect(chapterBounds!.x).toBeGreaterThanOrEqual(0);
    expect(chapterBounds!.x + chapterBounds!.width).toBeLessThanOrEqual(width + 1);
    expect(breeze.received()).toBe(0);
    expect(gemini.received()).toBe(0);
  });
}

test('free Make ready keeps every summary row and Start scrollable at 200 percent phone layout', async ({ page, stack, breeze, gemini }) => {
  await page.setViewportSize({ width: 195, height: 422 });
  const world = await setup(page, stack.api, breeze);
  await page.goto(`/#/book/${world.book}`);
  await page.getByRole('button', { name: 'Make ready', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Make ready', exact: true });
  await expect(dialog).toBeVisible();
  const summary = dialog.locator('.glass:has(dl)');
  const summaryBounds = await summary.boundingBox();
  expect(summaryBounds!.height).toBeGreaterThanOrEqual(184);
  const summaryOverflow = await summary.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }));
  expect(summaryOverflow.scroll).toBeLessThanOrEqual(summaryOverflow.client + 1);
  for (const label of ['To make', 'Time', 'Cost', 'Space']) {
    const row = dialog.locator('dl > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) });
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeInViewport();
    await textFits(row.locator('dd'));
  }
  const start = dialog.getByRole('button', { name: 'Start', exact: true });
  await start.scrollIntoViewIfNeeded();
  await expect(start).toBeInViewport();
  const startBounds = await start.boundingBox();
  expect(startBounds!.height).toBeGreaterThanOrEqual(52);
  expect(startBounds!.x).toBeGreaterThanOrEqual(0);
  expect(startBounds!.x + startBounds!.width).toBeLessThanOrEqual(196);
  expect(breeze.received()).toBe(0);
  expect(gemini.received()).toBe(0);
});

// Book management (W6): mark finished, remove and restore, free up space, delete permanently with undo, and the
// server's name, through the real screens, against a real bardic-server and the fake Breeze and Gemini.
// Original synthetic text only. No screen here may start paid work: every test that can, checks the fake Gemini.
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import type { Page } from '@playwright/test';
import type { Fake, GeminiFake } from './fakes';

const DEV = 'e2e-manage-device';
type Stack = { api: string };
/* eslint-disable @typescript-eslint/no-explicit-any */
const state = (page: Page) => page.evaluate(() => new Promise<any>((r) => (window as any).__offline.subscribe((s: unknown) => r(JSON.parse(JSON.stringify(s)))) && undefined));
const chapterStates = async (page: Page, ab: string) => (((await state(page)).books.find((b: any) => b.audiobookId === ab)?.chapters ?? []) as any[]).map((c) => c.state as string);

const get = async (stack: Stack, path: string, l?: string) => apiCall(stack.api, 'GET', path, undefined, DEV, l);

async function signIn(page: Page, stack: Stack) {
  const l = (await apiCall(stack.api, 'POST', '/api/listeners', { name: 'Nick' })).json.id as string;
  await page.goto('/?e2e=offline');
  await page.getByRole('button', { name: /^Nick/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__offline);
  return l;
}

/** The sample book with a Mara (free) audiobook, every chapter made, and the listener's place in it. */
async function readyBook(stack: Stack, breeze: Fake, l: string) {
  await apiCall(stack.api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, DEV);
  const book = (await apiCall(stack.api, 'POST', '/api/books/sample', {}, DEV, l)).json.id as string;
  const voice = (await apiCall(stack.api, 'GET', '/api/voices?source_id=breeze', undefined, DEV, l)).json.items[0].id;
  await apiCall(stack.api, 'POST', `/api/books/${book}/audiobooks`, { voice_id: voice }, DEV, l);
  const ab = (await apiCall(stack.api, 'GET', `/api/books/${book}/audiobooks`, undefined, DEV, l)).json.items[0].id as string;
  await apiCall(stack.api, 'POST', `/api/audiobooks/${ab}/make-ready`, { scope: { kind: 'whole_book' } }, DEV, l);
  await expect
    .poll(async () => {
      const a = (await get(stack, `/api/audiobooks/${ab}`, l)).json;
      return a.chapters_ready >= a.chapters_total;
    }, { timeout: 30000 })
    .toBe(true);
  const chapters = (await get(stack, `/api/books/${book}/chapters`, l)).json.items as { id: string; title: string }[];
  const put = await apiCall(stack.api, 'PUT', `/api/books/${book}/place`, { chapter_id: chapters[1]!.id, offset: 40, mode: 'listening', audiobook_id: ab, base_revision: 0 }, DEV, l);
  expect(put.status).toBe(200);
  return { book, ab, chapters, title: 'The Lantern Keeper' };
}

/** A premium (Kore) audiobook of the book, with the chosen chapters made by an approved plan against the fake Gemini. */
async function premiumAudio(stack: Stack, l: string, book: string, chapterIds: string[], wait = true) {
  expect((await apiCall(stack.api, 'PUT', '/api/voice-sources/gemini', { api_key: 'test-key' }, DEV)).status).toBe(200);
  const voices = (await get(stack, '/api/voices?source_id=gemini')).json.items as { id: string; name: string }[];
  const kore = voices.find((v) => v.name === 'Kore') ?? voices[0]!;
  const existing = ((await get(stack, `/api/books/${book}/audiobooks`, l)).json.items as { id: string; voice_id: string }[]).find((a) => a.voice_id === kore.id);
  const ab = existing?.id ?? ((await apiCall(stack.api, 'POST', `/api/books/${book}/audiobooks`, { voice_id: kore.id }, DEV, l)).json.id as string);
  const est = (await apiCall(stack.api, 'POST', `/api/audiobooks/${ab}/plan-preview`, { scope: { kind: 'chapters', chapter_ids: chapterIds } }, DEV, l)).json;
  const plan = await apiCall(stack.api, 'POST', '/api/plans', { estimate_id: est.estimate_id, limit: est.suggested_limit }, DEV, l);
  expect(plan.status).toBe(201);
  if (wait) {
    await expect.poll(async () => (await get(stack, `/api/plans/${plan.json.id}`)).json.state as string, { timeout: 60_000 }).toMatch(/completed|stopped|failed|needs_you/);
  }
  return { ab, plan: plan.json.id as string };
}

const openMenu = async (page: Page, book: string) => {
  await page.goto(`/?e2e=offline#/book/${book}`);
  await page.getByRole('button', { name: 'Edit this book' }).click();
  const menu = page.getByRole('dialog', { name: 'This book' });
  await expect(menu).toBeVisible();
  return menu;
};
const spaceOf = async (stack: Stack, ab: string) => (await get(stack, `/api/audiobooks/${ab}/space`)).json as { bytes: number; chapters: number; remake_estimate: { low: { micros: number }; high: { micros: number }; basis: string } | null };
const spent = async (stack: Stack) => JSON.stringify((await get(stack, '/api/allowance')).json.spent);
const place = async (stack: Stack, l: string, book: string) => (await get(stack, `/api/books/${book}/place`, l)).json;
const slider = (page: Page) => page.getByRole('slider', { name: 'Slide to delete permanently' });
const library = (page: Page) => page.getByRole('link', { name: /^The Lantern Keeper/ });
const banner = (page: Page) => page.getByRole('group', { name: /^Deleting The Lantern Keeper/ });
const secondsLeft = async (page: Page) => Number((await banner(page).getByText(/^Permanent in \d+ seconds?$/).textContent())!.match(/\d+/)![0]);

async function openDeleteSheet(page: Page, book: string) {
  const menu = await openMenu(page, book);
  await menu.getByRole('button', { name: /^Delete permanently/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete permanently?' });
  await expect(sheet).toBeVisible();
  return sheet;
}
async function confirmWithKeyboard(page: Page) {
  const s = slider(page);
  await s.focus();
  for (let i = 0; i < 4; i++) await s.press('Enter');
}

test('A10: mark as finished takes the book off Continue; mark as not started puts it back', async ({ page, stack, breeze, gemini }) => {
  const l = await signIn(page, stack);
  const { book, title } = await readyBook(stack, breeze, l);
  await page.goto('/#/');
  await expect(page.getByText('Continue', { exact: true })).toBeVisible();

  let menu = await openMenu(page, book);
  await expect(menu.getByRole('button', { name: /Mark as not started/ })).toHaveCount(0);
  await menu.getByRole('button', { name: /^Mark as finished/ }).click();
  await expect(page.getByText('Marked as finished.')).toBeVisible();
  await expect(menu).toBeHidden();
  expect((await place(stack, l, book)).finished.finished).toBe(true);
  await page.goto('/#/');
  await expect(page.getByText('Continue', { exact: true })).toHaveCount(0);

  menu = await openMenu(page, book);
  await expect(menu.getByRole('button', { name: /^Mark as finished/ })).toHaveCount(0);
  await menu.getByRole('button', { name: /^Mark as not started/ }).click();
  await expect(page.getByText('Back on Continue, at your place.')).toBeVisible();
  const p = await place(stack, l, book);
  expect(p.finished.finished).toBe(false);
  expect(p.offset).toBeGreaterThanOrEqual(0);
  await page.goto('/#/');
  await expect(page.getByText('Continue', { exact: true })).toBeVisible();
  await expect(page.getByText(title).first()).toBeVisible();
  expect(gemini.received()).toBe(0);
});

test('A10: remove from library hides the book and keeps everything; Undo in the toast brings it back', async ({ page, stack, breeze, gemini }) => {
  const l = await signIn(page, stack);
  const { book, ab } = await readyBook(stack, breeze, l);
  const before = await place(stack, l, book);
  const menu = await openMenu(page, book);
  await menu.getByRole('button', { name: /^Remove from library/ }).click();
  await expect(page).toHaveURL(/#\/library$/);
  await expect(page.getByText(/The Lantern Keeper removed\. Its audio and your places are kept\./)).toBeVisible();
  await expect(library(page)).toHaveCount(0);
  expect((await get(stack, `/api/books/${book}`, l)).json.state).toBe('removed');
  // kept: the audio and the place
  expect((await get(stack, `/api/audiobooks/${ab}`)).json.chapters_ready).toBe(3);
  expect((await place(stack, l, book)).revision).toBe(before.revision);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(library(page)).toBeVisible();
  expect((await get(stack, `/api/books/${book}`, l)).json.state).toBe('readable');
  expect((await place(stack, l, book)).offset).toBe(before.offset);

  // Restore also from the Manage screen's Removed tab
  const menu2 = await openMenu(page, book);
  await menu2.getByRole('button', { name: /^Remove from library/ }).click();
  await expect(library(page)).toHaveCount(0);
  await page.goto('/#/library/manage');
  await page.getByRole('tab', { name: 'Removed' }).click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.goto('/#/library');
  await expect(library(page)).toBeVisible();
  expect(gemini.received()).toBe(0);
});

test('A10: Edit details opens the editor for this book', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book } = await readyBook(stack, breeze, l);
  const menu = await openMenu(page, book);
  await menu.getByRole('button', { name: /^Edit details/ }).click();
  await expect(page).toHaveURL(/#\/library\/manage$/);
  await expect(page.getByLabel('Title')).toHaveValue('The Lantern Keeper');
});

test('C7: restore a recent place from the book menu with a revision; the place left behind stays in history', async ({ page, stack, breeze, gemini }) => {
  const l = await signIn(page, stack);
  const { book, ab, chapters } = await readyBook(stack, breeze, l);
  const original = await place(stack, l, book);
  const jump = await apiCall(stack.api, 'PUT', `/api/books/${book}/place`, { chapter_id: chapters[2]!.id, offset: 60, mode: 'reading', audiobook_id: ab, base_revision: original.revision }, DEV, l);
  expect(jump.status).toBe(200);
  const revisions: number[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && new URL(r.url()).pathname === `/api/books/${book}/place`) revisions.push(r.postDataJSON().base_revision);
  });
  const menu = await openMenu(page, book);
  await menu.getByRole('button', { name: /^Recent places/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Recent places' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: /^Restore Chapter 2/ }).first().click();
  await expect(sheet).toBeHidden();
  const restored = await place(stack, l, book);
  expect(restored.chapter_id).toBe(original.chapter_id);
  expect(restored.offset).toBe(original.offset);
  expect(restored.revision).toBeGreaterThan(jump.json.revision);
  expect(revisions.length).toBeGreaterThan(0);
  expect(revisions.every((n) => Number.isInteger(n) && n > 0)).toBe(true);
  const history = (await get(stack, `/api/books/${book}/place/history`, l)).json.items;
  expect(history.some((p: any) => p.chapter_id === chapters[2]!.id && p.offset === 60)).toBe(true);
  expect(gemini.received()).toBe(0);
});

test('C7: a concurrent place change asks before restoration and keeps both places in history', async ({ page, stack, breeze, gemini }) => {
  const l = await signIn(page, stack);
  const { book, ab, chapters } = await readyBook(stack, breeze, l);
  const original = await place(stack, l, book);
  await apiCall(stack.api, 'PUT', `/api/books/${book}/place`, { chapter_id: chapters[2]!.id, offset: 60, mode: 'reading', audiobook_id: ab, base_revision: original.revision }, DEV, l);
  let raced = false;
  await page.route(`**/api/books/${book}/place`, async (route) => {
    const r = route.request();
    if (!raced && r.method() === 'PUT' && r.postDataJSON().chapter_id === original.chapter_id) {
      raced = true;
      const current = await place(stack, l, book);
      const remote = await apiCall(stack.api, 'PUT', `/api/books/${book}/place`, { chapter_id: chapters[0]!.id, offset: 15, mode: 'reading', audiobook_id: ab, base_revision: current.revision }, 'other-device', l);
      expect(remote.status).toBe(200);
    }
    await route.continue();
  });
  const menu = await openMenu(page, book);
  await menu.getByRole('button', { name: /^Recent places/ }).click();
  await page.getByRole('dialog', { name: 'Recent places' }).getByRole('button', { name: /^Restore Chapter 2/ }).first().click();
  const conflict = page.getByRole('dialog', { name: 'Where to continue?' });
  await expect(conflict).toBeVisible();
  expect(raced).toBe(true);
  expect((await place(stack, l, book)).chapter_id).toBe(chapters[0]!.id);
  await conflict.getByRole('button', { name: /^Stay on Chapter 2/ }).click();
  await expect(conflict).toBeHidden();
  await expect.poll(async () => (await place(stack, l, book)).chapter_id).toBe(original.chapter_id);
  const history = (await get(stack, `/api/books/${book}/place/history`, l)).json.items;
  expect(history.some((p: any) => p.chapter_id === chapters[0]!.id && p.offset === 15)).toBe(true);
  expect(history.some((p: any) => p.chapter_id === original.chapter_id && p.offset === original.offset)).toBe(true);
  expect(gemini.received()).toBe(0);
});

test('C7: resolves an existing device conflict before applying the selected historical place', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book, ab, chapters } = await readyBook(stack, breeze, l);
  const original = await place(stack, l, book);
  await apiCall(stack.api, 'PUT', `/api/books/${book}/place`, { chapter_id: chapters[2]!.id, offset: 60, mode: 'reading', audiobook_id: ab, base_revision: original.revision }, 'other-device', l);
  await page.evaluate(({ listener, bookId, chapter, audiobookId, revision }) => {
    localStorage.setItem(`bardic.place.${listener}.${bookId}`, JSON.stringify({ chapterId: chapter, offset: 20, time: null, mode: 'reading', audiobookId, rev: revision, updatedAt: Date.now() }));
  }, { listener: l, bookId: book, chapter: chapters[0]!.id, audiobookId: ab, revision: original.revision });
  const menu = await openMenu(page, book);
  await menu.getByRole('button', { name: /^Recent places/ }).click();
  await page.getByRole('dialog', { name: 'Recent places' }).getByRole('button', { name: /^Restore Chapter 2/ }).first().click();
  const conflict = page.getByRole('dialog', { name: 'Where to continue?' });
  await expect(conflict).toBeVisible();
  await conflict.getByRole('button', { name: /^Continue on Chapter 3/ }).click();
  await expect(conflict).toBeHidden();
  await expect.poll(async () => (await place(stack, l, book)).chapter_id).toBe(original.chapter_id);
  expect((await place(stack, l, book)).offset).toBe(original.offset);
});

test('G3: Undo stays visible in Now Playing and survives reload when its schedule cannot be reread', async ({ page, context, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book } = await readyBook(stack, breeze, l);
  await openDeleteSheet(page, book);
  await confirmWithKeyboard(page);
  await expect(banner(page)).toBeVisible();
  await page.evaluate((id) => (location.hash = `#/listen/${id}`), book);
  await expect(banner(page)).toBeVisible();
  await page.route(`**/api/books/${book}/deletion`, async (route) => {
    if (route.request().method() === 'GET') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'temporary', detail: 'Try later' }) });
    else await route.continue();
  });
  await page.reload();
  await expect(banner(page)).toBeVisible();
  await page.evaluate(() => (location.hash = '#/settings'));
  await expect(banner(page)).toBeVisible();
  await context.setOffline(true);
  await banner(page).getByRole('button', { name: /^Undo deleting/ }).click();
  await expect(banner(page).getByRole('alert')).toContainText('The deletion is still scheduled.');
  expect((await get(stack, `/api/books/${book}/deletion`)).json.state).toBe('pending');
  await context.setOffline(false);
  await banner(page).getByRole('button', { name: /^Undo deleting/ }).click();
  await expect(banner(page)).toBeHidden();
  expect((await get(stack, `/api/books/${book}`, l)).status).toBe(200);
});

test('G2: free up space deletes the chosen audio on the server and nothing else; a premium audiobook shows the new-plan warning and the estimate', async ({ page, stack, breeze, gemini }) => {
  const l = await signIn(page, stack);
  const { book, ab, chapters } = await readyBook(stack, breeze, l);
  const premium = await premiumAudio(stack, l, book, [chapters[0]!.id]);
  // the Mara audiobook is held on this device
  await page.goto(`/?e2e=offline#/book/${book}`);
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Download\b/ }).click();
  await expect.poll(() => chapterStates(page, ab), { timeout: 30000 }).toEqual(['on_device', 'on_device', 'on_device']);

  const calls = gemini.received();
  expect(calls).toBeGreaterThan(0); // the premium chapter that was made on purpose, before the screens
  const marasBytes = (await spaceOf(stack, ab)).bytes;
  const koreBefore = await spaceOf(stack, premium.ab);
  expect(marasBytes).toBeGreaterThan(0);
  expect(koreBefore.bytes).toBeGreaterThan(0);
  expect(koreBefore.remake_estimate).not.toBeNull();
  const placeBefore = await place(stack, l, book);
  const plansBefore = JSON.stringify((await get(stack, '/api/plans', l)).json.items);
  const spentBefore = await spent(stack);

  const menu = await openMenu(page, book);
  await expect(menu.getByRole('button', { name: /^Free up space/ })).toContainText(/Delete audio you can make again: .* Mara, .* Kore/);
  await menu.getByRole('button', { name: /^Free up space/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Free up space' });
  await expect(sheet.getByText('Deletes audio on your Bardic computer that can be made again. Your places, the book and downloads on devices are not touched.')).toBeVisible();
  // the free audiobook starts chosen; the premium one does not
  const mara = sheet.getByRole('checkbox', { name: /Mara/ });
  const kore = sheet.getByRole('checkbox', { name: /Kore/ });
  await expect(mara).toHaveAttribute('aria-checked', 'true');
  await expect(kore).toHaveAttribute('aria-checked', 'false');
  // the premium warning and its estimate come from the server
  await expect(sheet.getByText('Making Kore again costs money')).toBeVisible();
  await expect(sheet.getByText(/Getting it back needs a new plan, (about \$\d+\.\d\d( to \$\d+\.\d\d)?|under \$0\.01( to \$\d+\.\d\d)?)\./)).toBeVisible();
  const free = sheet.getByRole('button', { name: /^Delete Mara audio · / });
  await expect(free).toBeVisible();
  // choosing nothing leaves nothing to press
  await mara.click();
  await expect(sheet.getByRole('button', { name: 'Choose audio to delete' })).toBeDisabled();
  await mara.click();
  await free.click();
  await expect(page.getByText(/^Freed .+\. Places and downloads are kept\.$/)).toBeVisible();

  // on the server: Mara's audio is gone; Kore's, the place, the plans and the book are untouched
  await expect.poll(async () => (await spaceOf(stack, ab)).bytes).toBe(0);
  expect((await get(stack, `/api/audiobooks/${ab}`)).json.chapters_ready).toBe(0);
  expect((await spaceOf(stack, premium.ab)).bytes).toBe(koreBefore.bytes);
  expect((await place(stack, l, book)).revision).toBe(placeBefore.revision);
  expect(JSON.stringify((await get(stack, '/api/plans', l)).json.items)).toBe(plansBefore);
  expect((await get(stack, `/api/books/${book}`, l)).json.state).toBe('readable');
  // on this device: the downloaded chapters are still held
  expect(await chapterStates(page, ab)).toEqual(['on_device', 'on_device', 'on_device']);

  // now the premium one: chosen on purpose, with the warning in view; the plan record stays
  const menu2 = await openMenu(page, book);
  await menu2.getByRole('button', { name: /^Free up space/ }).click();
  const sheet2 = page.getByRole('dialog', { name: 'Free up space' });
  await expect(sheet2.getByRole('checkbox', { name: /Mara/ })).toBeDisabled();
  await expect(sheet2.getByText('Making Kore again costs money')).toBeVisible();
  await sheet2.getByRole('checkbox', { name: /Kore/ }).click();
  await sheet2.getByRole('button', { name: /^Delete Kore audio · / }).click();
  await expect(page.getByText(/^Freed .+\. Places and downloads are kept\.$/)).toBeVisible();
  await expect.poll(async () => (await spaceOf(stack, premium.ab)).bytes).toBe(0);
  expect(JSON.stringify((await get(stack, '/api/plans', l)).json.items)).toBe(plansBefore);

  // no screen spent anything: the fake Gemini heard nothing new and the Allowance did not move
  expect(gemini.received()).toBe(calls);
  expect(await spent(stack)).toBe(spentBefore);
});

test('G2: free up space is refused while audio is being made, in words that begin with what is kept', async ({ page, stack, breeze, gemini }) => {
  const l = await signIn(page, stack);
  const { book, chapters } = await readyBook(stack, breeze, l);
  const made = await premiumAudio(stack, l, book, [chapters[0]!.id]);
  // a second plan for the same audiobook, slowed down: a job is running for it
  (gemini as GeminiFake).setDelay(20_000);
  const before = gemini.received();
  await premiumAudio(stack, l, book, [chapters[1]!.id, chapters[2]!.id], false);
  await expect.poll(() => gemini.received()).toBeGreaterThan(before);
  const calls = gemini.received();
  const bytes = (await spaceOf(stack, made.ab)).bytes;
  expect(bytes).toBeGreaterThan(0);

  const menu = await openMenu(page, book);
  await menu.getByRole('button', { name: /^Free up space/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Free up space' });
  await sheet.getByRole('checkbox', { name: /Mara/ }).click(); // choose only the premium audio
  await sheet.getByRole('checkbox', { name: /Kore/ }).click();
  await sheet.getByRole('button', { name: /^Delete Kore audio · / }).click();
  const refusal = sheet.getByRole('alert');
  await expect(refusal).toContainText('Nothing was deleted');
  await expect(refusal).toContainText(/^Nothing was deleted\s*Your audio, places and downloads were not touched\. Audio is being made for this book\./);
  expect((await spaceOf(stack, made.ab)).bytes).toBe(bytes);
  expect(gemini.received()).toBe(calls);
});

test('G3: delete permanently lists exactly what goes; Escape closes without deleting; the slide control works from the keyboard; the book is hidden at once with a countdown; Undo brings it back with its place', async ({ page, stack, breeze, gemini }) => {
  const l = await signIn(page, stack);
  const { book, ab, title } = await readyBook(stack, breeze, l);
  const before = await place(stack, l, book);
  const audioBytes = (await spaceOf(stack, ab)).bytes;

  // what is listed: the text with its numbers, the audio with its size, places, history and plans
  let sheet = await openDeleteSheet(page, book);
  await expect(sheet.getByText('The book and its text')).toBeVisible();
  await expect(sheet.getByText(/^3 chapters · [\d,]+ words$/)).toBeVisible();
  await expect(sheet.getByText('All audio made for it')).toBeVisible();
  await expect(sheet.getByText(/^Mara \d+(\.\d)? (KB|MB)$/)).toBeVisible();
  await expect(sheet.getByText('Places, history and plans')).toBeVisible();
  await expect(sheet.getByText('You get 60 seconds to undo')).toBeVisible();
  await expect(sheet.getByText('This removes everything below from your Bardic computer.')).toBeVisible();

  // the slide control is a real slider with a name and a value
  await expect(slider(page)).toHaveAttribute('aria-valuenow', '0');
  await expect(slider(page)).toHaveAttribute('aria-valuetext', 'Not confirmed');
  await slider(page).focus();
  await slider(page).press('Enter');
  await expect(slider(page)).toHaveAttribute('aria-valuetext', '1 of 4 steps toward deleting');
  await slider(page).press('ArrowLeft');
  await expect(slider(page)).toHaveAttribute('aria-valuenow', '0');
  // Escape closes the sheet and never confirms, even part way
  await slider(page).press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect((await get(stack, `/api/books/${book}/deletion`)).status).toBe(404);
  expect((await get(stack, `/api/books/${book}`, l)).status).toBe(200);
  // focus returns to the button that opened the menu
  await expect(page.getByRole('button', { name: 'Edit this book' })).toBeFocused();

  // "Keep the book" closes too
  sheet = await openDeleteSheet(page, book);
  await sheet.getByRole('button', { name: 'Keep the book' }).click();
  await expect(sheet).toBeHidden();
  expect((await get(stack, `/api/books/${book}/deletion`)).status).toBe(404);

  // three presses are not enough; the fourth confirms
  sheet = await openDeleteSheet(page, book);
  const s = slider(page);
  await s.focus();
  for (let i = 0; i < 3; i++) await s.press('Space');
  expect((await get(stack, `/api/books/${book}/deletion`)).status).toBe(404);
  await s.press('Space');
  await expect(sheet).toBeHidden();

  // hidden at once: the server hides it, Library goes without it, a countdown with Undo is on screen
  await expect(page).toHaveURL(/#\/library$/);
  await expect(banner(page)).toBeVisible();
  await expect(library(page)).toHaveCount(0);
  expect((await get(stack, `/api/books/${book}`, l)).status).toBe(404);
  const d = (await get(stack, `/api/books/${book}/deletion`)).json;
  expect(d.state).toBe('pending');
  expect(Date.parse(d.executes_at) - Date.parse(d.scheduled_at)).toBe(60_000);
  const first = await secondsLeft(page);
  expect(first).toBeGreaterThan(40);
  expect(first).toBeLessThanOrEqual(60);
  await page.waitForTimeout(2200);
  expect(await secondsLeft(page)).toBeLessThan(first);

  // closing the client and coming back: the schedule is on the server, so the banner is too
  await page.reload();
  await expect(banner(page)).toBeVisible();
  expect(await secondsLeft(page)).toBeLessThan(first);
  // the book's own page says so, and still offers Undo through the banner
  await page.goto(`/#/book/${book}`);
  await expect(page.getByText('This book is being deleted')).toBeVisible();
  await expect(banner(page)).toBeVisible();

  // Undo cancels cleanly: the book is back exactly as it was
  await banner(page).getByRole('button', { name: /^Undo deleting/ }).click();
  await expect(banner(page)).toBeHidden();
  await expect(page.getByText(`${title} is back, with your places.`)).toBeVisible();
  expect((await get(stack, `/api/books/${book}`, l)).json.state).toBe('readable');
  const after = await place(stack, l, book);
  expect(after.offset).toBe(before.offset);
  expect(after.revision).toBe(before.revision);
  expect((await spaceOf(stack, ab)).bytes).toBe(audioBytes);
  expect((await get(stack, `/api/books/${book}/deletion`)).status).toBe(404);
  await page.goto('/#/library');
  await expect(library(page)).toBeVisible();
  expect(gemini.received()).toBe(0);
});

test('G3: the slide control can be dragged; a short drag does nothing, a full drag confirms; Undo follows', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book } = await readyBook(stack, breeze, l);
  await openDeleteSheet(page, book);
  const h = (await slider(page).boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 120, h.y + h.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(slider(page)).toHaveAttribute('aria-valuenow', '0');
  expect((await get(stack, `/api/books/${book}/deletion`)).status).toBe(404);
  // The short drag returns the handle with a CSS transition. Wait for its position to settle before measuring
  // the next drag's grab point; the accessible value resets before the animation finishes.
  await slider(page).click({ trial: true });
  const h2 = (await slider(page).boundingBox())!;
  const track = (await slider(page).locator('..').boundingBox())!;
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width - h2.width / 2 - 6, h2.y + h2.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(banner(page)).toBeVisible();
  expect((await get(stack, `/api/books/${book}/deletion`)).json.state).toBe('pending');
  await banner(page).getByRole('button', { name: /^Undo deleting/ }).click();
  await expect(banner(page)).toBeHidden();
  expect((await get(stack, `/api/books/${book}`, l)).json.state).toBe('readable');
});

test('G3: delete permanently is refused while audio is being made; nothing is deleted and the slider is ready again', async ({ page, stack, breeze, gemini }) => {
  const l = await signIn(page, stack);
  const { book, chapters } = await readyBook(stack, breeze, l);
  await premiumAudio(stack, l, book, [chapters[0]!.id]);
  (gemini as GeminiFake).setDelay(20_000);
  const before = gemini.received();
  await premiumAudio(stack, l, book, [chapters[1]!.id, chapters[2]!.id], false);
  await expect.poll(() => gemini.received()).toBeGreaterThan(before);
  const calls = gemini.received();

  const sheet = await openDeleteSheet(page, book);
  await confirmWithKeyboard(page);
  const refusal = sheet.getByRole('alert');
  await expect(refusal).toContainText(/Nothing was deleted and the book is still in your library\. Audio is being made for it\./);
  await expect(sheet).toBeVisible();
  await expect(slider(page)).toHaveAttribute('aria-valuenow', '0');
  expect((await get(stack, `/api/books/${book}`, l)).json.state).toBe('readable');
  expect((await get(stack, `/api/books/${book}/deletion`)).status).toBe(404);
  await expect(banner(page)).toHaveCount(0);
  expect(gemini.received()).toBe(calls);
});

test('G3: it really is deleted after the 60 seconds, from every list; devices holding it are offered removal', async ({ page, stack, breeze, gemini }) => {
  test.slow();
  test.setTimeout(240_000);
  const l = await signIn(page, stack);
  const { book, ab, title } = await readyBook(stack, breeze, l);
  await page.goto(`/?e2e=offline#/book/${book}`);
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Download\b/ }).click();
  await expect.poll(() => chapterStates(page, ab), { timeout: 30000 }).toEqual(['on_device', 'on_device', 'on_device']);

  await openDeleteSheet(page, book);
  await confirmWithKeyboard(page);
  await expect(banner(page)).toBeVisible();
  // the server runs it when the 60 seconds are up (its clock cannot be moved from here: this one waits)
  await expect(banner(page)).toBeHidden({ timeout: 100_000 });
  await expect.poll(async () => (await get(stack, `/api/books/${book}/deletion`)).json?.state, { timeout: 20_000 }).toBe('done');
  expect((await get(stack, `/api/books/${book}`, l)).status).toBe(404);
  expect((await get(stack, `/api/audiobooks/${ab}`)).status).toBe(404);
  expect((await place(stack, l, book))?.code).toBeTruthy();
  expect((await apiCall(stack.api, 'DELETE', `/api/books/${book}/deletion`, undefined, DEV, l)).json.code).toBe('deletion_done');
  await page.goto('/#/library');
  await expect(library(page)).toHaveCount(0);
  await page.goto('/#/');
  await expect(page.getByText(title)).toHaveCount(0);
  // the book's page no longer finds it, and says nothing about a deletion
  await page.goto(`/#/book/${book}`);
  await expect(page.getByText('This book is not here')).toBeVisible();
  // this device still holds the chapters and is offered removal
  await page.goto('/?e2e=offline#/settings/downloads');
  await expect(page.getByText(/Removed from your library · 1/)).toBeVisible({ timeout: 20_000 });
  expect(await chapterStates(page, ab)).toEqual(['on_device', 'on_device', 'on_device']);
  expect(gemini.received()).toBe(0);
});

test('G1, G7: About this Bardic shows the server, saves a new name, and every screen that shows it follows', async ({ page, stack }) => {
  await signIn(page, stack);
  const server = (await get(stack, '/api/server')).json as { name: string; version: string; api_version: string; free_bytes: number | null };
  await page.goto('/#/settings');
  const row = page.getByRole('link', { name: /About this Bardic/ });
  await expect(row).toContainText(server.name);
  await row.click();
  await expect(page).toHaveURL(/#\/settings\/about$/);
  await expect(page.getByRole('heading', { name: 'About this Bardic' })).toBeVisible();
  const field = page.getByLabel('Server name');
  await expect(field).toHaveValue(server.name);
  const dl = page.locator('dl');
  await expect(dl).toContainText(new URL(page.url()).host);
  await expect(dl).toContainText(server.version);
  await expect(dl).toContainText('Free space');
  if (server.free_bytes === null) await expect(dl.getByText('Free space').locator('..')).toContainText('unknown');
  else await expect(dl.getByText('Free space').locator('..')).toContainText(/\d+(\.\d)? (GB|MB)/);
  // not saved until asked: unchanged, Save is off
  await expect(page.getByRole('button', { name: 'Save name' })).toBeDisabled();

  // the server's rule, said before asking
  await field.fill('   ');
  await expect(page.getByText('Enter a name.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save name' })).toBeDisabled();
  await field.fill('x'.repeat(61));
  await expect(page.getByText('Use 60 characters or fewer.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save name' })).toBeDisabled();

  await field.fill('  Den Server ');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Name saved. Every device shows it.')).toBeVisible();
  expect(((await get(stack, '/api/server')).json as { name: string }).name).toBe('Den Server');
  await expect(field).toHaveValue('Den Server');

  // Settings shows it, and follows a rename made from another device without a reload
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole('link', { name: /About this Bardic/ })).toContainText('Den Server');
  expect((await apiCall(stack.api, 'PATCH', '/api/server', { name: 'Hall Server' }, 'e2e-other-device-2')).status).toBe(200);
  await expect(page.getByRole('link', { name: /About this Bardic/ })).toContainText('Hall Server', { timeout: 10_000 });
  await page.reload();
  await expect(page.getByRole('link', { name: /About this Bardic/ })).toContainText('Hall Server');
});

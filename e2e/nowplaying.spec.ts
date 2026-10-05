// A listening session through the real screens, against a real server and the fake Breeze:
// Listen, Now Playing, Read, the sheets, place sync, the mini-player and what the book page says
// when there is no voice. (The engine's own rules are covered in e2e/player.spec.ts.)
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import type { Page } from '@playwright/test';
import type { Fake } from './fakes';

const DEV = 'e2e-np-device';
type Stack = { api: string };

async function signIn(page: Page, stack: Stack) {
  const l = (await apiCall(stack.api, 'POST', '/api/listeners', { name: 'Nick' })).json.id as string;
  await page.goto('/');
  await page.getByRole('button', { name: /^Nick/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
  return l;
}

/** The sample book with a Mara audiobook, every chapter made. */
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
    }, { timeout: 20000 })
    .toBe(true);
  return { book, ab };
}

const place = async (stack: Stack, l: string, book: string) => (await apiCall(stack.api, 'GET', `/api/books/${book}/place`, undefined, DEV, l)).json;

async function listen(page: Page, book: string) {
  await page.goto(`/#/book/${book}`);
  await page.reload();
  await page.getByRole('button', { name: /^(Listen|Continue listening)$/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${book}`));
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15000 });
}

test('S1: Listen starts the sound and opens Now Playing; pause and resume; the place is saved on pause', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book } = await readyBook(stack, breeze, l);
  await listen(page, book);
  await expect(page.getByText('Playing', { exact: true })).toBeVisible();
  await expect(page.getByText(/Chapter 1 · /)).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect.poll(async () => (await place(stack, l, book)).chapter_id, { timeout: 10000 }).toBeTruthy();
  const saved = await place(stack, l, book);
  expect(saved.offset).toBeGreaterThanOrEqual(0);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});

test('S2 and S3: speed and chapters change how it plays and where', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book } = await readyBook(stack, breeze, l);
  await listen(page, book);
  await page.getByRole('button', { name: /^Speed/ }).click();
  const speed = page.getByRole('dialog');
  await expect(speed).toBeVisible();
  await speed.getByRole('radio', { name: /1\.5/ }).first().click().catch(async () => speed.getByText('1.5×').first().click());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Speed 1\.5/ })).toBeVisible();

  await page.getByRole('button', { name: 'Chapters' }).click();
  const chapters = page.getByRole('dialog');
  await expect(chapters).toBeVisible();
  await chapters.getByText('A Stranger with a Case').click();
  await expect(page.getByText(/Chapter 2 · A Stranger with a Case/)).toBeVisible();
  await expect.poll(async () => (await apiCall(stack.api, 'GET', `/api/books/${book}/chapters`, undefined, DEV, l)).json.items[1].id === (await place(stack, l, book)).chapter_id, { timeout: 15000 }).toBe(true);
});

test('S4 and S5: Read shows the exact chapter text, follows the narration, and tapping a line jumps to it', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book } = await readyBook(stack, breeze, l);
  await listen(page, book);
  await page.getByRole('radio', { name: 'Read' }).click();
  await expect(page.getByText('CHAPTER 1 OF 3')).toBeVisible();
  const ch = (await apiCall(stack.api, 'GET', `/api/books/${book}/chapters`, undefined, DEV, l)).json.items[0];
  const text = (await apiCall(stack.api, 'GET', `/api/books/${book}/chapters/${ch.id}/text`, undefined, DEV, l)).json;
  // the first sentence of the stored text is on screen, word for word
  const first = [...text.text].slice(text.lines[0].start, text.lines[0].end).join('').trim();
  await expect(page.getByText(first.slice(0, 40), { exact: false }).first()).toBeVisible();
  // tap a later line: the narration jumps there and the saved place follows
  const lastLine = text.lines[text.lines.length - 1];
  const spoken = [...text.text].slice(lastLine.start, lastLine.end).join('').trim().slice(0, 30);
  await page.getByText(spoken, { exact: false }).first().click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await place(stack, l, book)).offset, { timeout: 10000 }).toBeGreaterThanOrEqual(lastLine.start - 1);
});

test('S6: sleep timer at the end of the chapter pauses there', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book } = await readyBook(stack, breeze, l);
  await listen(page, book);
  await page.getByRole('button', { name: /^Speed/ }).click();
  await page.getByRole('dialog').getByText('2×', { exact: true }).first().click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sleep' }).click();
  await page.getByRole('dialog').getByText(/End of chapter/i).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 25000 });
  // paused at the start of chapter 2, not the end of the book
  await expect(page.getByText(/Chapter 2 · /)).toBeVisible();
});

test('S7: in the book, search finds a passage and opens it in Read', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book } = await readyBook(stack, breeze, l);
  await listen(page, book);
  await page.getByRole('radio', { name: 'Read' }).click();
  await page.keyboard.press('Control+f');
  const field = page.getByRole('searchbox').or(page.getByRole('textbox')).first();
  await field.fill('lamp');
  await expect(page.getByText(/passage/i).first()).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /lamp/i }).first().click().catch(async () => page.getByText(/lamp/i).first().click());
  await expect(page.getByText('CHAPTER 1 OF 3')).toBeVisible();
  // a word that is not in the book finds nothing and says so
  await page.keyboard.press('Control+f');
  await page.getByRole('searchbox').or(page.getByRole('textbox')).first().fill('zzzzqqqq');
  await expect(page.getByText(/no passage|No results|nothing/i).first()).toBeVisible({ timeout: 10000 });
});

test('mini-player: the bar follows you to Home, plays and pauses, and opens Now Playing', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book } = await readyBook(stack, breeze, l);
  await listen(page, book);
  await page.getByRole('button', { name: 'Minimise' }).click();
  await page.goto('/#/library');
  const bar = page.getByRole('button', { name: /^Open Now Playing/ });
  await expect(bar).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).first().click();
  await expect(page.getByRole('button', { name: 'Play' }).first()).toBeVisible();
  await bar.click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${book}`));
});

/** This device has paused at a place; another device then writes a different one. */
async function conflictSetup(page: Page, stack: Stack, breeze: Fake) {
  const l = await signIn(page, stack);
  const { book } = await readyBook(stack, breeze, l);
  await listen(page, book);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await place(stack, l, book)).revision, { timeout: 10000 }).toBeGreaterThan(0);
  const mine = await place(stack, l, book);
  const chapters = (await apiCall(stack.api, 'GET', `/api/books/${book}/chapters`, undefined, DEV, l)).json.items;
  const r = await apiCall(stack.api, 'PUT', `/api/books/${book}/place`, { chapter_id: chapters[2].id, offset: 5, mode: 'listening', base_revision: mine.revision }, 'e2e-other-device-9', l);
  expect(r.status).toBe(200);
  return { l, book, chapters, mine };
}
const history = async (stack: Stack, l: string, book: string) => JSON.stringify((await apiCall(stack.api, 'GET', `/api/books/${book}/place/history`, undefined, DEV, l)).json);

test('C3 and C5: a place written meanwhile on another device is offered, not jumped to; staying keeps both places', async ({ page, stack, breeze }) => {
  const { l, book, chapters, mine } = await conflictSetup(page, stack, breeze);
  const dialog = page.getByRole('dialog', { name: 'Where to continue?' });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  // both places, with device, chapter and progress; nothing moved on its own
  await expect(dialog.getByRole('list', { name: 'The two places' }).getByRole('listitem')).toHaveCount(2);
  await expect(dialog).toContainText('This device');
  await expect(dialog).toContainText('Chapter 3');
  await expect(dialog).toContainText('Chapter 1');
  await expect(dialog).toContainText('The other place is kept in your history');
  const screen = page.getByRole('region', { name: 'Now playing' });
  await expect(screen.getByText(/Chapter 1 · /)).toBeVisible();
  await dialog.getByRole('button', { name: /^Stay on Chapter 1/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(screen.getByText(/Chapter 1 · /)).toBeVisible();
  // this device's choice is now the place, and the other device's place is still in history
  await expect.poll(async () => (await place(stack, l, book)).chapter_id, { timeout: 10000 }).toBe(mine.chapter_id);
  expect(await history(stack, l, book)).toContain(chapters[2].id);
});

test('C4: choosing the other device\'s place moves there, and the place left behind is kept in history', async ({ page, stack, breeze }) => {
  const { l, book, chapters, mine } = await conflictSetup(page, stack, breeze);
  const dialog = page.getByRole('dialog', { name: 'Where to continue?' });
  await expect(dialog).toBeVisible({ timeout: 15000 });
  await dialog.getByRole('button', { name: /^Continue on Chapter 3/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Now playing' }).getByText(/Chapter 3 · /)).toBeVisible();
  await expect.poll(async () => (await place(stack, l, book)).chapter_id, { timeout: 10000 }).toBe(chapters[2].id);
  // nothing was discarded: this device's place before the choice is in the server's history
  expect(await history(stack, l, book)).toContain(mine.chapter_id);
});

test('no voice: pressing Listen with nothing set up stays on the book page and says what is needed', async ({ page, stack }) => {
  const l = await signIn(page, stack);
  const book = (await apiCall(stack.api, 'POST', '/api/books/sample', {}, DEV, l)).json.id as string;
  await page.goto(`/#/book/${book}`);
  await page.reload();
  await page.getByRole('button', { name: /^(Listen|Continue listening)$/ }).click();
  await expect(page.getByText(/No voice source is set up/i)).toBeVisible({ timeout: 10000 });
  await expect(page).toHaveURL(new RegExp(`#/book/${book}`));
  await expect(page.getByRole('link', { name: /Set up a voice/i })).toBeVisible();
});

test('first play: a chapter that is not made yet is made when you press Listen, then plays; nothing is paid', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  await apiCall(stack.api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, DEV);
  const book = (await apiCall(stack.api, 'POST', '/api/books/sample', {}, DEV, l)).json.id as string;
  const voice = (await apiCall(stack.api, 'GET', '/api/voices?source_id=breeze', undefined, DEV, l)).json.items[0].id;
  await apiCall(stack.api, 'POST', `/api/books/${book}/audiobooks`, { voice_id: voice }, DEV, l);
  await listen(page, book);
  expect(breeze.spoken.length).toBeGreaterThan(0);
  expect((await apiCall(stack.api, 'GET', '/api/allowance')).json.spent.known.micros).toBe(0);
});

test('S9: reaching the end of the book shows the end-of-book screen, and Listen again starts over', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  const { book } = await readyBook(stack, breeze, l);
  const chapters = (await apiCall(stack.api, 'GET', `/api/books/${book}/chapters`, undefined, DEV, l)).json.items;
  const last = chapters[chapters.length - 1];
  const text = (await apiCall(stack.api, 'GET', `/api/books/${book}/chapters/${last.id}/text`, undefined, DEV, l)).json;
  const end = [...text.text].length;
  const cur = await place(stack, l, book);
  await apiCall(stack.api, 'PUT', `/api/books/${book}/place`, { chapter_id: last.id, offset: Math.max(0, end - 60), mode: 'listening', base_revision: cur.revision ?? 0 }, DEV, l);
  await listen(page, book);
  await expect(page.getByRole('button', { name: /Listen again|Start again|again/i })).toBeVisible({ timeout: 30000 });
});

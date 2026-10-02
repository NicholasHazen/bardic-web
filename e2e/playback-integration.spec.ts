// Regression journeys through the real book/voice screens, with a real server and synthetic provider audio.
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import { startBreeze } from './fakes';
import type { Page } from '@playwright/test';

const DEV = 'e2e-playback-integration';
const playerState = (page: Page) => page.evaluate(() => {
  let value: any;
  (window as any).__player.subscribe((s: any) => { value = s; })();
  return JSON.parse(JSON.stringify(value));
});

async function setup(page: Page, api: string, breeze: { url: string }) {
  const listener = (await apiCall(api, 'POST', '/api/listeners', { name: 'Listener' }, DEV)).json.id as string;
  await apiCall(api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, DEV, listener);
  const book = (await apiCall(api, 'POST', '/api/books/sample', {}, DEV, listener)).json.id as string;
  const voices = (await apiCall(api, 'GET', '/api/voices', undefined, DEV, listener)).json.items as { id: string; name: string }[];
  await page.addInitScript((id) => localStorage.setItem('bardic.listener', id), listener);
  await page.goto(`/?e2e=player#/book/${book}`);
  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__player);
  return { listener, book, voices };
}

async function makeReady(api: string, listener: string, book: string, voice: string) {
  const ab = (await apiCall(api, 'POST', `/api/books/${book}/audiobooks`, { voice_id: voice }, DEV, listener)).json.id as string;
  await apiCall(api, 'POST', `/api/audiobooks/${ab}/make-ready`, { scope: { kind: 'whole_book' } }, DEV, listener);
  await expect.poll(async () => {
    const a = (await apiCall(api, 'GET', `/api/audiobooks/${ab}`, undefined, DEV, listener)).json;
    return a.chapters_ready === a.chapters_total;
  }, { timeout: 30000 }).toBe(true);
  return ab;
}

async function defaultVoice(api: string, listener: string, id: string) {
  await apiCall(api, 'PUT', `/api/listeners/${listener}/settings`, { default_voice_id: id, place_conflict: 'ask', continue_into_next_chapter: true }, DEV, listener);
}

test('V3: a free chooser starts listening after an initial no-voice play, without reloading', async ({ page, stack, breeze }) => {
  const w = await setup(page, stack.api, breeze);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.getByText('Needs you', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Choose a voice', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a voice' });
  await chooser.getByRole('radio', { name: /Mara/ }).click();
  await chooser.getByRole('button', { name: 'Start listening', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${w.book}`));
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect((await playerState(page)).voice.name).toBe('Mara');
  expect(breeze.received()).toBeGreaterThan(0);
});

test('V3: Make the whole book ready opens the free confirmation and starts only after Start', async ({ page, stack, breeze }) => {
  const w = await setup(page, stack.api, breeze);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.getByText('Needs you', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Choose a voice', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a voice' });
  await chooser.getByRole('radio', { name: /Tobias/ }).click();
  await chooser.getByRole('button', { name: 'Make the whole book ready', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Make ready' });
  await expect(confirmation).toBeVisible();
  expect(breeze.received()).toBe(0);
  expect((await apiCall(stack.api, 'GET', '/api/jobs')).json.items).toHaveLength(0);
  await confirmation.getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(() => breeze.received()).toBeGreaterThan(0);
  await expect.poll(async () => (await apiCall(stack.api, 'GET', `/api/books/${w.book}/audiobooks`)).json.items[0].voice_name).toBe('Tobias');
});

test('V6: a default free voice creates a new audiobook and plays it from the first Listen', async ({ page, stack, breeze }) => {
  const w = await setup(page, stack.api, breeze);
  await defaultVoice(stack.api, w.listener, w.voices.find((v) => v.name === 'Mara')!.id);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${w.book}`));
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect((await playerState(page)).voice.name).toBe('Mara');
});

test('V6 and P2: a default premium voice opens a plan on a new book and spends nothing', async ({ page, stack, breeze, gemini }) => {
  const w = await setup(page, stack.api, breeze);
  await apiCall(stack.api, 'PUT', '/api/voice-sources/gemini', { api_key: 'test-key' }, DEV, w.listener);
  const voices = (await apiCall(stack.api, 'GET', '/api/voices')).json.items as { id: string; name: string }[];
  await defaultVoice(stack.api, w.listener, voices.find((v) => v.name === 'Kore')!.id);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Make ready' })).toBeVisible();
  expect(gemini.received()).toBe(0);
  expect((await apiCall(stack.api, 'GET', '/api/plans')).json.items).toHaveLength(0);
  expect((await apiCall(stack.api, 'GET', '/api/jobs')).json.items).toHaveLength(0);
  await expect(page).toHaveURL(new RegExp(`#/book/${w.book}`));
});

test('S7: switching a paused audiobook uses the exact local text place and the chosen sound', async ({ page, stack, breeze }) => {
  const w = await setup(page, stack.api, breeze);
  const mara = await makeReady(stack.api, w.listener, w.book, w.voices.find((v) => v.name === 'Mara')!.id);
  const tobias = await makeReady(stack.api, w.listener, w.book, w.voices.find((v) => v.name === 'Tobias')!.id);
  await defaultVoice(stack.api, w.listener, w.voices.find((v) => v.name === 'Mara')!.id);
  await page.reload();
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${w.book}`));
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.evaluate(async () => { const p = (window as any).__player; p.gotoLine((await new Promise<any>((r) => p.subscribe(r)())).lines[1].id); await p.sync.flush(); });
  const before = (await apiCall(stack.api, 'GET', `/api/books/${w.book}/place`, undefined, DEV, w.listener)).json;
  expect(before.audiobook_id).toBe(mara);
  await page.evaluate((book) => { location.hash = `#/book/${book}`; }, w.book);
  await page.getByRole('button', { name: /^Use Tobias/ }).click();
  await expect.poll(async () => (await playerState(page)).audiobookId).toBe(tobias);
  expect((await playerState(page)).playing).toBe(false);
  const after = (await apiCall(stack.api, 'GET', `/api/books/${w.book}/place`, undefined, DEV, w.listener)).json;
  expect({ chapter: after.chapter_id, offset: after.offset }).toEqual({ chapter: before.chapter_id, offset: before.offset });
  await page.getByRole('button', { name: 'Continue listening', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${w.book}`));
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect((await playerState(page)).voice.name).toBe('Tobias');
});

test('S7: the old sound keeps playing while the newly chosen free voice gets ready', async ({ page, stack }) => {
  let hold = false;
  let release!: () => void;
  const heldSpeech = new Promise<void>((r) => { release = r; });
  const delayedBreeze = await startBreeze({ beforeSpeech: async () => { if (hold) await heldSpeech; } });
  try {
    const w = await setup(page, stack.api, delayedBreeze);
    await makeReady(stack.api, w.listener, w.book, w.voices.find((v) => v.name === 'Mara')!.id);
    const tobias = (await apiCall(stack.api, 'POST', `/api/books/${w.book}/audiobooks`, { voice_id: w.voices.find((v) => v.name === 'Tobias')!.id }, DEV, w.listener)).json.id as string;
    await defaultVoice(stack.api, w.listener, w.voices.find((v) => v.name === 'Mara')!.id);
    await page.reload();
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/listen/${w.book}`));
    const oldUrl = await page.evaluate(() => (window as any).__audio.src);
    hold = true;
    await page.evaluate((book) => { location.hash = `#/book/${book}`; }, w.book);
    await page.getByRole('button', { name: /^Use Tobias/ }).click();
    await expect.poll(async () => (await playerState(page)).listening).toBe('getting_ready');
    expect(await page.evaluate(() => (window as any).__audio.src)).toBe(oldUrl);
    expect(await page.evaluate(() => (window as any).__audio.paused)).toBe(false);
    release();
    await expect.poll(async () => (await playerState(page)).audiobookId, { timeout: 20000 }).toBe(tobias);
    expect((await playerState(page)).playing).toBe(true);
    expect(await page.evaluate(() => (window as any).__audio.src)).not.toBe(oldUrl);
  } finally {
    release();
    await delayedBreeze.stop();
  }
});

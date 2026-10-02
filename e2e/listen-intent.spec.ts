// Hold real server responses at each first-Listen boundary. Later taps, routes and listeners must win.
// The shared fixture mutes native media before play; native clocks and engine state are still exercised.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { apiCall } from './harness';

const DEV = 'e2e-listen-intent';
const current = (page: Page) => page.evaluate(() => {
  let state: any;
  (window as any).__player.subscribe((s: any) => { state = s; })();
  return { loaded: state.loaded, playing: state.playing, voice: state.voice?.name, book: state.book?.id };
});

async function setup(page: Page, api: string, breeze: { url: string }, voiceName: string) {
  const nick = (await apiCall(api, 'POST', '/api/listeners', { name: 'Nick' }, DEV)).json.id as string;
  const sam = (await apiCall(api, 'POST', '/api/listeners', { name: 'Sam' }, DEV)).json.id as string;
  await apiCall(api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, DEV, nick);
  if (voiceName === 'Kore') await apiCall(api, 'PUT', '/api/voice-sources/gemini', { api_key: 'test-key' }, DEV, nick);
  const book = (await apiCall(api, 'POST', '/api/books/sample', {}, DEV, nick)).json.id as string;
  const voices = (await apiCall(api, 'GET', '/api/voices')).json.items as { id: string; name: string }[];
  // Configure before mounting: otherwise listener/source notices can start background reads which steal the gate.
  await defaultVoice(api, nick, voices.find((v) => v.name === voiceName)!.id);
  await page.addInitScript((id) => localStorage.setItem('bardic.listener', id), nick);
  await page.goto(`/?e2e=player#/book/${book}`);
  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__player);
  return { nick, sam, book, voices };
}

async function defaultVoice(api: string, listener: string, voice: string) {
  await apiCall(api, 'PUT', `/api/listeners/${listener}/settings`, {
    default_voice_id: voice, place_conflict: 'ask', continue_into_next_chapter: true,
  }, DEV, listener);
}

async function holdNext(page: Page, url: string, method = 'GET', all = false) {
  let release!: () => void;
  let reached!: () => void;
  let header: string | undefined;
  let used = false;
  const held = new Promise<void>((r) => { release = r; });
  const entered = new Promise<void>((r) => { reached = r; });
  await page.route(url, async (route) => {
    if ((!all && used) || route.request().method() !== method) return route.continue();
    used = true;
    header = route.request().headers()['x-bardic-listener'];
    const response = await route.fetch(); // take the real response now, then deliver it out of order
    reached();
    await held;
    await route.fulfill({ response });
  });
  return { entered, header: () => header, release: async () => {
    const response = page.waitForResponse((r) => r.url().endsWith(url.replace('**', '')) && r.request().method() === method);
    release();
    await response;
    // Give the released fetch continuation and any incorrect follow-on request time to become observable.
    await page.waitForTimeout(350);
  }, abandon: release };
}

async function nothingStarted(page: Page, api: string, breeze: { received(): number }, gemini: { received(): number }) {
  expect(await current(page)).toMatchObject({ loaded: false, playing: false });
  expect(breeze.received()).toBe(0);
  expect(gemini.received()).toBe(0);
  expect((await apiCall(api, 'GET', '/api/jobs')).json.items).toHaveLength(0);
  expect((await apiCall(api, 'GET', '/api/plans')).json.items).toHaveLength(0);
  await expect(page.getByRole('dialog', { name: 'Make ready' })).toHaveCount(0);
}

test('V6: leaving before default-voice setup returns cannot create or autoplay the old book', async ({ page, stack, breeze, gemini }) => {
  const w = await setup(page, stack.api, breeze, 'Mara');
  const held = await holdNext(page, `**/api/listeners/${w.nick}/settings`);
  try {
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await held.entered;
    await page.getByRole('button', { name: 'Back to library' }).click();
    await expect(page).toHaveURL(/#\/library$/);
    await held.release();
    await expect(page).toHaveURL(/#\/library$/);
    expect((await apiCall(stack.api, 'GET', `/api/books/${w.book}/audiobooks`)).json.items).toHaveLength(0);
    await nothingStarted(page, stack.api, breeze, gemini);
  } finally { held.abandon(); }
});

test('V6: leaving while player metadata is delayed invalidates the opening before audio starts', async ({ page, stack, breeze, gemini }) => {
  const w = await setup(page, stack.api, breeze, 'Mara');
  // Creating the record also emits notices which can reread the book page. Hold both readers at this boundary.
  const held = await holdNext(page, `**/api/books/${w.book}`, 'GET', true);
  try {
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await held.entered;
    await page.getByRole('button', { name: 'Back to library' }).click();
    await expect(page).toHaveURL(/#\/library$/);
    await held.release();
    await expect(page).toHaveURL(/#\/library$/);
    // Creating a free record before leaving is harmless; the delayed player must not make its audio.
    expect((await apiCall(stack.api, 'GET', `/api/books/${w.book}/audiobooks`)).json.items).toHaveLength(1);
    await nothingStarted(page, stack.api, breeze, gemini);
  } finally { held.abandon(); }
});

test('P2: a late premium voice lookup cannot reopen the plan sheet after leaving', async ({ page, stack, breeze, gemini }) => {
  const w = await setup(page, stack.api, breeze, 'Kore');
  const held = await holdNext(page, '**/api/voices');
  try {
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await held.entered;
    await page.getByRole('button', { name: 'Back to library' }).click();
    await held.release();
    await expect(page).toHaveURL(/#\/library$/);
    expect((await apiCall(stack.api, 'GET', `/api/books/${w.book}/audiobooks`)).json.items).toHaveLength(0);
    await nothingStarted(page, stack.api, breeze, gemini);
  } finally { held.abandon(); }
});

test('L4 and P2: switching listener during record creation cannot play or show the old listener a plan', async ({ page, stack, breeze, gemini }) => {
  await page.setViewportSize({ width: 1100, height: 844 });
  const w = await setup(page, stack.api, breeze, 'Kore');
  const held = await holdNext(page, `**/api/books/${w.book}/audiobooks`, 'POST');
  try {
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await held.entered;
    expect(held.header()).toBe(w.nick);
    await page.getByRole('button', { name: /Listening as Nick/ }).click();
    await page.getByRole('dialog', { name: 'Switch listener' }).getByRole('button', { name: /^Sam/ }).click();
    await expect(page.getByRole('button', { name: /Listening as Sam/ })).toBeVisible();
    const selectedRoute = await page.evaluate(() => location.hash);
    await held.release();
    expect(await page.evaluate(() => location.hash)).toBe(selectedRoute);
    expect(await page.evaluate(() => localStorage.getItem('bardic.listener'))).toBe(w.sam);
    await nothingStarted(page, stack.api, breeze, gemini);
  } finally { held.abandon(); }
});

test('V6: a later Listen tap wins over a stale earlier default and makes only the chosen voice', async ({ page, stack, breeze }) => {
  const w = await setup(page, stack.api, breeze, 'Mara');
  const held = await holdNext(page, `**/api/listeners/${w.nick}/settings`);
  try {
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await held.entered;
    await defaultVoice(stack.api, w.nick, w.voices.find((v) => v.name === 'Tobias')!.id);
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/listen/${w.book}$`));
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await held.release();
    expect(await current(page)).toMatchObject({ playing: true, voice: 'Tobias', book: w.book });
    const audiobooks = (await apiCall(stack.api, 'GET', `/api/books/${w.book}/audiobooks`)).json.items;
    expect(audiobooks).toHaveLength(1);
    expect(audiobooks[0].voice_name).toBe('Tobias');
  } finally { held.abandon(); }
});

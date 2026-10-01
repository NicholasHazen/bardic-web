// W2 voices against a real bardic-server with the fake Breeze and Gemini (e2e/fakes.ts).
//
// The screens are opened through the real app routes:
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import type { Fake } from './fakes';
import type { Page } from '@playwright/test';

const DEV = 'e2e-voices-device';
type Stack = { api: string };

async function signIn(page: Page, stack: Stack, name = 'Nick'): Promise<string> {
  const made = await apiCall(stack.api, 'POST', '/api/listeners', { name });
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('button', { name: new RegExp(`Listening as ${name}`) })).toBeVisible();
  return made.json.id as string;
}

// The real app routes: Settings screens by hash route, the chooser from the book page's Change action.
async function open(page: Page, screen: 'settings' | 'voices' | 'breeze' | 'default' | 'chooser', book?: string) {
  if (screen === 'chooser') {
    await page.goto(`/#/book/${book}`);
    await page.reload();
    await page.getByRole('button', { name: /^(Change|Choose a voice)/ }).first().click();
    return;
  }
  const route = { settings: '/', voices: '/voices', breeze: '/voices/breeze', default: '/voices/default' }[screen];
  await page.goto(`/#/settings${route === '/' ? '' : route}`);
  await page.reload(); // opening a screen re-reads the server; a same-URL goto would not
}

const setupBreeze = (stack: Stack, breeze: Fake) => apiCall(stack.api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, DEV);
const setupGemini = (stack: Stack) => apiCall(stack.api, 'PUT', '/api/voice-sources/gemini', { api_key: 'test-key' }, DEV);
const sampleBook = async (stack: Stack, listener: string) => (await apiCall(stack.api, 'POST', '/api/books/sample', undefined, DEV, listener)).json.id as string;
const audiobooks = async (stack: Stack, listener: string, book: string) => (await apiCall(stack.api, 'GET', `/api/books/${book}/audiobooks`, undefined, DEV, listener)).json.items as { voice_name: string; tier: string }[];
const spent = async (stack: Stack) => (await apiCall(stack.api, 'GET', '/api/allowance')).json.spent as { known: { micros: number }; unknown_items: number };

test('V1: the chooser lists Free (Breeze voices) then Premium (Gemini voices), each with an example button', async ({ page, stack, breeze }) => {
  const listener = await signIn(page, stack);
  await setupBreeze(stack, breeze);
  await setupGemini(stack);
  const book = await sampleBook(stack, listener);
  await open(page, 'chooser', book);

  const dialog = page.getByRole('dialog', { name: 'Choose a voice' });
  await expect(dialog).toBeVisible();
  const tabs = dialog.getByRole('radiogroup', { name: 'Voice tier' }).getByRole('radio');
  await expect(tabs).toHaveText(['Free', 'Premium']);
  await expect(tabs.first()).toHaveAttribute('aria-checked', 'true');

  // only the cloned Breeze voices are offered (the designed "Sketch" is not)
  const free = dialog.getByRole('radiogroup', { name: 'Free voices' });
  await expect(free.getByRole('radio')).toHaveCount(2);
  await expect(free.getByRole('radio', { name: /Mara/ })).toContainText('from Breeze');
  await expect(free.getByRole('radio', { name: /Tobias/ })).toBeVisible();
  await expect(free.getByRole('button', { name: 'Hear Mara' })).toBeVisible();
  await expect(dialog.getByText('Free and private')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Start listening' })).toBeVisible();

  await tabs.nth(1).click();
  const premium = dialog.getByRole('radiogroup', { name: 'Premium voices' });
  await expect(premium.getByRole('radio')).toHaveCount(30);
  await expect(premium.getByRole('radio', { name: /Kore/ })).toContainText('Premium');
  await expect(premium.getByRole('button', { name: 'Hear Kore' })).toBeVisible();
  await expect(dialog.getByText('Premium voices cost money')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Plan the whole book' })).toBeVisible();
  // the sample book has not been started, so there is nothing to plan "from"
  await expect(dialog.getByRole('button', { name: /Plan from chapter/ })).toHaveCount(0);
});

test('V2: a free example plays and costs nothing', async ({ page, stack, breeze, gemini }) => {
  const listener = await signIn(page, stack);
  await setupBreeze(stack, breeze);
  const book = await sampleBook(stack, listener);
  await open(page, 'chooser', book);
  const dialog = page.getByRole('dialog', { name: 'Choose a voice' });

  const request = page.waitForResponse((r) => r.url().includes('/sample') && r.status() === 200);
  await dialog.getByRole('button', { name: 'Hear Mara' }).click();
  const res = await request;
  expect(res.headers()['content-type']).toMatch(/^audio\//);
  await expect(dialog.getByText('Playing Mara. Nothing is spent.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Hear Mara' })).toHaveAttribute('aria-pressed', 'true');
  expect(breeze.received()).toBeGreaterThan(0);
  expect(gemini.received()).toBe(0);
  expect(await spent(stack)).toEqual({ known: expect.objectContaining({ micros: 0 }), unknown_items: 0 });

  // pressing it again stops it
  await dialog.getByRole('button', { name: 'Hear Mara' }).click();
  await expect(dialog.getByRole('button', { name: 'Hear Mara' })).toHaveAttribute('aria-pressed', 'false');
});

test('V2: a premium example without a Google key explains that a key is needed and asks for nothing', async ({ page, stack, breeze, gemini }) => {
  const listener = await signIn(page, stack);
  await setupBreeze(stack, breeze);
  const book = await sampleBook(stack, listener);
  await open(page, 'chooser', book);
  const dialog = page.getByRole('dialog', { name: 'Choose a voice' });

  await dialog.getByRole('radio', { name: 'Premium' }).click();
  await expect(dialog.getByText('Premium voices need an account')).toBeVisible();
  let sampleCalls = 0;
  page.on('request', (r) => r.url().includes('/sample') && sampleCalls++);
  await dialog.getByRole('button', { name: 'Hear Kore' }).click();
  await expect(dialog.getByText(/A Google key is needed to hear a premium example/)).toBeVisible();
  expect(sampleCalls).toBe(0);
  expect(gemini.received()).toBe(0);
  await expect(dialog.getByRole('button', { name: 'Add Google key' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Stay with free voices' }).click();
  await expect(dialog.getByRole('radio', { name: 'Free' })).toHaveAttribute('aria-checked', 'true');
});

test('V3: choosing a free voice makes the audiobook for the book, and the first choice becomes the default', async ({ page, stack, breeze }) => {
  const listener = await signIn(page, stack);
  await setupBreeze(stack, breeze);
  const book = await sampleBook(stack, listener);
  expect(await audiobooks(stack, listener, book)).toEqual([]);
  await open(page, 'chooser', book);
  const dialog = page.getByRole('dialog', { name: 'Choose a voice' });

  await dialog.getByRole('radio', { name: /Tobias/ }).click();
  await expect(dialog.getByRole('radio', { name: /Tobias/ })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await audiobooks(stack, listener, book)).map((a) => a.voice_name)).toEqual(['Tobias']);
  const voices = (await apiCall(stack.api, 'GET', '/api/voices')).json.items as { id: string; name: string }[];
  const tobias = voices.find((v) => v.name === 'Tobias')!.id;
  const defaultVoice = async () => (await apiCall(stack.api, 'GET', `/api/listeners/${listener}/settings`)).json.default_voice_id;
  await expect.poll(defaultVoice).toBe(tobias);

  // choosing it again finds the same audiobook; a second voice makes a second one
  await dialog.getByRole('radio', { name: /Tobias/ }).click();
  await dialog.getByRole('radio', { name: /Mara/ }).click();
  await expect.poll(async () => (await audiobooks(stack, listener, book)).map((a) => a.voice_name).sort()).toEqual(['Mara', 'Tobias']);
  // the default does not move once it is set
  expect(await defaultVoice()).toBe(tobias);
});

test('V4: choosing a premium voice starts nothing; the plan button opens the plan sheet and starts nothing either: no job, no plan, no speech request, nothing spent', async ({ page, stack, breeze, gemini }) => {
  const listener = await signIn(page, stack);
  await setupBreeze(stack, breeze);
  await setupGemini(stack);
  const book = await sampleBook(stack, listener);
  await open(page, 'chooser', book);
  const dialog = page.getByRole('dialog', { name: 'Choose a voice' });

  await dialog.getByRole('radio', { name: 'Premium' }).click();
  await dialog.getByRole('radio', { name: /Kore/ }).click();
  await expect(dialog.getByRole('radio', { name: /Kore/ })).toHaveAttribute('aria-checked', 'true');
  // before a plan button is pressed nothing exists yet
  expect(await audiobooks(stack, listener, book)).toEqual([]);
  // "Plan the whole book" makes the (free, empty) audiobook for the voice and opens the plan sheet; that is all it does
  await dialog.getByRole('button', { name: 'Plan the whole book' }).click();
  await expect(page.getByRole('dialog', { name: 'Make ready' })).toBeVisible();

  expect(gemini.received()).toBe(0);
  expect(breeze.received()).toBe(0);
  expect(await audiobooks(stack, listener, book)).toMatchObject([{ voice_name: 'Kore', tier: 'premium' }]);
  expect((await apiCall(stack.api, 'GET', '/api/jobs', undefined, DEV, listener)).json.items).toEqual([]);
  expect((await apiCall(stack.api, 'GET', '/api/plans', undefined, DEV, listener)).json.items).toEqual([]);
  expect(await spent(stack)).toEqual({ known: expect.objectContaining({ micros: 0 }), unknown_items: 0 });
});

test('V2: a premium example with a key says it counts toward spending, and only that press asks Gemini; a repeat is free', async ({ page, stack, breeze, gemini }) => {
  const listener = await signIn(page, stack);
  await setupBreeze(stack, breeze);
  await setupGemini(stack);
  const book = await sampleBook(stack, listener);
  await open(page, 'chooser', book);
  const dialog = page.getByRole('dialog', { name: 'Choose a voice' });
  await dialog.getByRole('radio', { name: 'Premium' }).click();
  const kore = dialog.getByRole('button', { name: 'Hear Kore' });
  await expect(kore).toHaveAttribute('title', /counts toward spending/);
  await expect(dialog.getByText('Examples are short and count toward your Allowance.')).toBeVisible();
  expect(gemini.received()).toBe(0);

  // hold the answer so the words shown while it is requested can be read
  await page.route('**/api/voices/*/sample', async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });
  const answered = page.waitForResponse((r) => r.url().includes('/sample'));
  await kore.click();
  await expect(dialog.getByText('Getting a short example of Kore. It counts toward spending.')).toBeVisible();
  const res = await answered;
  expect(res.status()).toBe(200);
  expect(gemini.received()).toBe(1);
  await expect.poll(async () => (await spent(stack)).known.micros + (await spent(stack)).unknown_items).toBeGreaterThan(0);
  // the same voice again plays from what was kept: no second request to Gemini
  await expect(kore).toHaveAttribute('aria-pressed', 'false');
  await kore.click();
  await expect(dialog.getByText('Playing Kore again. A repeat is free.')).toBeVisible();
  expect(gemini.received()).toBe(1);
  expect(await audiobooks(stack, listener, book)).toEqual([]);
});

test('V8: with no source set up the chooser is the first-time set up with one action each', async ({ page, stack }) => {
  const listener = await signIn(page, stack);
  const book = await sampleBook(stack, listener);
  await open(page, 'chooser', book);
  const dialog = page.getByRole('dialog', { name: 'Set up a voice' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('First time')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Set up Breeze' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Add a Google key' })).toBeVisible();
  // this server has no voices of its own, so "This computer" is not offered (V5)
  await expect(dialog.getByRole('button', { name: 'Use these voices' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('V5: set up Breeze from the Voices screen, with a clear error for a wrong address', async ({ page, stack, breeze }) => {
  await signIn(page, stack);
  await open(page, 'voices');
  await expect(page.getByRole('heading', { name: 'Voices' })).toBeVisible();
  await expect(page.getByLabel('Breeze', { exact: true })).toContainText('Not set up');
  await expect(page.getByLabel('Gemini', { exact: true })).toContainText('Not set up');
  await expect(page.getByLabel('This computer')).toHaveCount(0);

  await page.getByRole('button', { name: 'Set up Breeze' }).click();
  await expect(page.getByRole('heading', { name: 'Breeze' })).toBeVisible();
  await expect(page.getByText('Enter the address of your Breeze server')).toBeVisible();

  // a wrong address: nothing is stored, and the screen says so first
  const address = page.getByLabel('Server address');
  await address.fill('http://127.0.0.1:9');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('alert')).toContainText('Couldn’t connect');
  await expect(page.getByRole('alert')).toContainText('Nothing was changed');
  expect((await apiCall(stack.api, 'GET', '/api/voice-sources/breeze')).json.state).toBe('not_set_up');

  // a malformed one is caught before asking
  await address.fill('http://127.0.0.1:1/v1');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('alert')).toContainText('without a path');

  // the fake's address works; its voices appear
  await address.fill(breeze.url);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText(/2 voices found/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Voices from your server · 2' })).toBeVisible();
  const list = page.getByRole('group', { name: 'Voices from your server' });
  await expect(list).toContainText('Mara');
  await expect(list).toContainText('Warm, unhurried');
  await expect(list).toContainText('Tobias');
  await expect(list).not.toContainText('Sketch');
  expect((await apiCall(stack.api, 'GET', '/api/voice-sources/breeze')).json).toMatchObject({ state: 'connected', base_url: breeze.url, voice_count: 2 });

  // Refresh voices re-reads them; Test connection on the saved address only tests
  await page.getByRole('button', { name: 'Refresh voices' }).click();
  await expect(page.getByText(/2 voices found/)).toBeVisible();

  // a free example from this screen plays
  await page.getByRole('button', { name: 'Hear Tobias' }).click();
  await expect(page.getByText('Playing Tobias. Nothing is spent.')).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Breeze', { exact: true })).toContainText('Connected');
});

test('V5: an unreachable Breeze server is named, what is kept comes first, and its voices stay listed', async ({ page, stack, breeze }) => {
  await signIn(page, stack);
  await setupBreeze(stack, breeze);
  breeze.setDown(true);
  await open(page, 'breeze');
  await expect(page.getByRole('alert')).toContainText('Can’t reach your Breeze server');
  await expect(page.getByRole('alert')).toContainText('Audio already made is kept');
  await expect(page.getByLabel('Server address')).toHaveValue(breeze.url);
  await expect(page.getByRole('group', { name: 'Voices from your server' })).toContainText('Mara');
  breeze.setDown(false);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
});

test('V5: Gemini shows Connected once the server accepts the key, and Key rejected when it stops', async ({ page, stack, breeze, gemini }) => {
  await signIn(page, stack);
  await setupBreeze(stack, breeze);
  await open(page, 'voices');
  await expect(page.getByLabel('Gemini', { exact: true })).toContainText('Not set up');
  await expect(page.getByLabel('Gemini', { exact: true }).getByRole('button', { name: 'Add a Google key' })).toBeVisible();

  // the key is entered through the API here (the Premium screen is W4); the screen never sees it
  expect((await setupGemini(stack)).status).toBe(200);
  await open(page, 'voices');
  const card = page.getByLabel('Gemini', { exact: true });
  await expect(card).toContainText('Connected');
  await expect(card.getByRole('button', { name: 'Manage key' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Voices' })).toBeVisible();
  await expect(page.getByLabel('Breeze', { exact: true })).toContainText('Connected');
  await expect(page.locator('body')).not.toContainText('test-key');

  // Google starts refusing the key: opening the screen re-reads the source
  gemini.setKey('another-key');
  await open(page, 'voices');
  await expect(page.getByLabel('Gemini', { exact: true })).toContainText('Key rejected');
  await expect(page.getByLabel('Gemini', { exact: true })).toContainText('Audio already made is kept');
});

test('V6: the default voice is chosen on its own screen, saved at once, and shown in Settings', async ({ page, stack, breeze }) => {
  const listener = await signIn(page, stack);
  await setupBreeze(stack, breeze);
  await setupGemini(stack);
  await open(page, 'settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Default voice/ })).toContainText('Not chosen yet');
  await expect(page.getByRole('link', { name: /Breeze/ })).toContainText('Connected');
  await expect(page.getByRole('link', { name: /Gemini/ })).toContainText('Premium · 30 voices');
  await expect(page.getByRole('link', { name: /Nick/ })).toHaveAttribute('href', '#/settings/listeners');
  await expect(page.getByRole('link', { name: /Allowance/ })).toContainText('No monthly limit');
  await expect(page.getByRole('link', { name: /Gemini/ })).toHaveAttribute('href', '#/settings/premium');

  await page.getByRole('link', { name: /Default voice/ }).click();
  await expect(page.getByRole('heading', { name: 'Default voice' })).toBeVisible();
  await expect(page.getByText('If you pick a premium voice')).toBeVisible();
  const list = page.getByRole('radiogroup', { name: 'Default voice' });
  await expect(list.getByRole('radio', { checked: true })).toHaveCount(0);
  await list.getByRole('radio', { name: /Mara/ }).click();
  await expect(page.getByText('Default voice saved: Mara.')).toBeVisible();
  await expect(list.getByRole('radio', { name: /Mara/ })).toHaveAttribute('aria-checked', 'true');

  const voices = (await apiCall(stack.api, 'GET', '/api/voices')).json.items as { id: string; name: string }[];
  expect((await apiCall(stack.api, 'GET', `/api/listeners/${listener}/settings`)).json.default_voice_id).toBe(voices.find((v) => v.name === 'Mara')!.id);
  // the other settings are untouched
  expect((await apiCall(stack.api, 'GET', `/api/listeners/${listener}/settings`)).json).toMatchObject({ place_conflict: 'ask', continue_into_next_chapter: true });

  // a premium default is allowed and keeps its price in words; nothing is spent by choosing it
  await list.getByRole('radio', { name: /Kore/ }).click();
  await expect(page.getByText('Default voice saved: Kore.')).toBeVisible();
  expect(await spent(stack)).toEqual({ known: expect.objectContaining({ micros: 0 }), unknown_items: 0 });

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('link', { name: /Default voice/ })).toContainText('Kore · premium');
  await page.reload();
  await expect(page.getByRole('link', { name: /Default voice/ })).toContainText('Kore · premium');
});

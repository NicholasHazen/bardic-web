import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import { configureBreeze, importFile, mkListener, tideEpub } from './helpers/world';
import type { Fake } from './fakes';

const DEV = 'e2e-audio-selection';
interface World { listener: string; book: string; audiobook: string; chapters: { id: string; title: string }[] }

async function world(api: string, breeze: Fake, tier: 'free' | 'premium'): Promise<World> {
  const listener = await mkListener(api, 'Synthetic chapter selection listener');
  await configureBreeze(api, breeze);
  if (tier === 'premium') {
    expect((await apiCall(api, 'PUT', '/api/voice-sources/gemini', { api_key: 'test-key' }, DEV)).status).toBe(200);
    expect((await apiCall(api, 'PUT', '/api/prices/gemini', { unit: 'million_characters', per_unit: { micros: 18_200_000, currency: 'USD' } }, DEV, listener)).status).toBe(200);
  }
  const book = await importFile(api, listener, 'synthetic-audio-selection.epub', tideEpub([4, 4, 4, 4]), 'application/epub+zip');
  const chapters = (await apiCall(api, 'GET', `/api/books/${book}/chapters`, undefined, DEV, listener)).json.items as World['chapters'];
  expect(chapters).toHaveLength(4);
  const voices = (await apiCall(api, 'GET', '/api/voices')).json.items as { id: string; name: string }[];
  const voice = voices.find((item) => item.name === (tier === 'free' ? 'Mara' : 'Kore'))!;
  const made = await apiCall(api, 'POST', `/api/books/${book}/audiobooks`, { voice_id: voice.id }, DEV, listener);
  expect(made.status).toBe(201);
  return { listener, book, audiobook: made.json.id as string, chapters };
}

async function open(page: Page, w: World, premium = false) {
  await page.addInitScript((id) => localStorage.setItem('bardic.listener', id), w.listener);
  await page.goto(`/#/book/${w.book}`);
  await expect(page.getByRole('heading', { name: 'Tide Tables', exact: true, level: 1 })).toBeVisible();
  await page.locator('[data-section="audiobook"]').getByRole('button', { name: premium ? 'Plan the whole book' : 'Make ready', exact: true }).click();
  return page.getByRole('dialog', { name: 'Make ready', exact: true });
}

async function states(api: string, w: World) {
  return ((await apiCall(api, 'GET', `/api/audiobooks/${w.audiobook}/chapters`, undefined, DEV, w.listener)).json.items as { state: string }[]).map((item) => item.state);
}

async function nothingStarted(api: string, w: World, breeze: Fake, gemini: Fake) {
  expect(breeze.received()).toBe(0);
  expect(gemini.received()).toBe(0);
  expect((await apiCall(api, 'GET', '/api/jobs', undefined, DEV, w.listener)).json.items).toEqual([]);
  expect((await apiCall(api, 'GET', '/api/plans', undefined, DEV, w.listener)).json.items).toEqual([]);
}

test('free Make ready voices only chosen nonadjacent chapters and keeps existing audio', async ({ page, stack, breeze, gemini }) => {
  const w = await world(stack.api, breeze, 'free');
  const sheet = await open(page, w);
  await sheet.getByRole('radio', { name: /^Choose chapters/ }).click();
  await expect(sheet.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText('4 of 4 chapters selected');
  await sheet.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText('0 of 4 chapters selected');
  for (const chapter of [w.chapters[0]!, w.chapters[2]!]) {
    const checkbox = sheet.getByRole('checkbox', { name: chapter.title, exact: true });
    await checkbox.check();
    const box = await checkbox.locator('..').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(sheet.getByRole('status')).toHaveText('2 of 4 chapters selected');
  await nothingStarted(stack.api, w, breeze, gemini);
  const request = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === `/api/audiobooks/${w.audiobook}/make-ready`);
  await sheet.getByRole('button', { name: 'Start', exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({ scope: { kind: 'chapters', chapter_ids: [w.chapters[0]!.id, w.chapters[2]!.id], include_matter: false } });
  await expect.poll(() => states(stack.api, w), { timeout: 30000 }).toEqual(['ready', 'not_yet', 'ready', 'not_yet']);
  const completedCalls = breeze.received();
  await page.locator('[data-section="audiobook"]').getByRole('button', { name: 'Make ready', exact: true }).click();
  await sheet.getByRole('radio', { name: /^Choose chapters/ }).click();
  await sheet.getByRole('checkbox', { name: `${w.chapters[0]!.title} Ready`, exact: true }).check();
  await sheet.getByRole('checkbox', { name: w.chapters[1]!.title, exact: true }).check();
  const toMake = sheet.locator('dt').filter({ hasText: /^To make$/ }).locator('..').locator('dd');
  await expect(toMake).toHaveText('1 chapter');
  await sheet.getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(() => states(stack.api, w), { timeout: 30000 }).toEqual(['ready', 'ready', 'ready', 'not_yet']);
  expect(breeze.received()).toBeGreaterThan(completedCalls);
  expect(breeze.spoken.filter((text) => text.includes('Tide0'))).toHaveLength(1);
  expect(breeze.spoken.join(' ')).not.toContain('Tide3');
  expect(gemini.received()).toBe(0);
});

test('premium chapter edits invalidate approval, ignore a late preview, and spend only after approving the matching scope', async ({ page, stack, breeze, gemini }) => {
  const w = await world(stack.api, breeze, 'premium');
  const sheet = await open(page, w, true);
  await expect(sheet.getByRole('button', { name: /^Approve plan/ })).toBeVisible();
  await sheet.getByRole('radio', { name: /^Choose chapters/ }).click();
  await expect(sheet.getByRole('button', { name: /^Approve plan/ })).toHaveCount(0);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/plan-preview', async (route) => {
    const body = route.request().postDataJSON();
    // Price the actual scope directly against the real API, then deliver its
    // answer out of order. This avoids APIRequestContext replaying incomplete
    // browser provenance through the reverse proxy.
    const response = await apiCall(stack.api, 'POST', new URL(route.request().url()).pathname, body, DEV, w.listener);
    expect(response.status).toBe(200);
    if (body.scope.kind === 'chapters' && body.scope.chapter_ids.length === 1) await gate;
    await route.fulfill({ status: response.status, json: response.json });
  });
  try {
    await sheet.getByRole('checkbox', { name: w.chapters[0]!.title, exact: true }).check();
    await expect(sheet.getByRole('button', { name: /^Approve plan/ })).toHaveCount(0);
    const latestResponse = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/plan-preview') && r.request().postDataJSON().scope.chapter_ids?.length === 2);
    await sheet.getByRole('checkbox', { name: w.chapters[2]!.title, exact: true }).check();
    const latestReply = await latestResponse;
    expect(latestReply.status()).toBe(200);
    const latest = await latestReply.json();
    expect(latest.scope).toMatchObject({ kind: 'chapters', chapter_ids: [w.chapters[0]!.id, w.chapters[2]!.id], include_matter: false });
    await expect(sheet.getByRole('button', { name: /^Approve plan/ })).toBeEnabled();
    const late = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/plan-preview') && r.request().postDataJSON().scope.chapter_ids?.length === 1);
    release();
    expect((await late).status()).toBe(200);
    await nothingStarted(stack.api, w, breeze, gemini);
    const approval = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/plans');
    await sheet.getByRole('button', { name: /^Approve plan/ }).click();
    expect((await approval).postDataJSON().estimate_id).toBe(latest.estimate_id);
    await expect.poll(() => states(stack.api, w), { timeout: 30000 }).toEqual(['ready', 'not_yet', 'ready', 'not_yet']);
    const plans = (await apiCall(stack.api, 'GET', '/api/plans', undefined, DEV, w.listener)).json.items;
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ chapters_total: 2, scope: latest.scope });
    expect(gemini.spoken.join(' ')).not.toMatch(/Tide1|Tide3/);
    expect(breeze.received()).toBe(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

import { test, expect } from './fixtures';
import { apiCall } from './harness';
import type { Page } from '@playwright/test';
import { reloadCachedPage } from './helpers/offlineReload';

const DEV = 'e2e-settings-device';
async function signIn(page: Page, api: string) {
  const listener = (await apiCall(api, 'POST', '/api/listeners', { name: 'Settings reader' })).json.id as string;
  await page.goto('/');
  await page.getByRole('button', { name: /^Settings reader/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Settings reader/ })).toBeVisible();
  return listener;
}

test('reader settings open from Settings and survive reload, including the tablet page width', async ({ page, stack, gemini }) => {
  await signIn(page, stack.api);
  await page.goto('/#/settings');
  await page.getByRole('link', { name: /Reader appearance/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Text and colour' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('radio', { name: 'Paper', exact: true }).click();
  await sheet.getByRole('button', { name: 'Larger text' }).click();
  await sheet.getByRole('switch', { name: 'Follow the narration' }).click();
  await sheet.getByRole('switch', { name: 'Dim the aura' }).click();
  await page.reload();
  await expect(sheet.getByRole('radio', { name: 'Paper', exact: true })).toBeChecked();
  await expect(sheet.getByRole('slider', { name: 'Text size' })).toHaveValue('22');
  await expect(sheet.getByRole('switch', { name: 'Follow the narration' })).not.toBeChecked();
  await expect(sheet.getByRole('switch', { name: 'Dim the aura' })).toBeChecked();
  await page.setViewportSize({ width: 1194, height: 834 });
  await sheet.getByRole('radio', { name: 'Narrow', exact: true }).click();
  await page.reload();
  await expect(sheet.getByRole('radio', { name: 'Narrow', exact: true })).toBeChecked();
  expect(gemini.received()).toBe(0);
});

test('listening settings save per listener without losing the default voice; screen-on is local', async ({ page, stack, breeze, gemini }) => {
  const listener = await signIn(page, stack.api);
  await apiCall(stack.api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, DEV);
  const voice = (await apiCall(stack.api, 'GET', '/api/voices?source_id=breeze')).json.items[0].id as string;
  await apiCall(stack.api, 'PUT', `/api/listeners/${listener}/settings`, { default_voice_id: voice, continue_into_next_chapter: true, place_conflict: 'ask' }, DEV, listener);
  await page.goto('/#/settings');
  await page.getByRole('link', { name: /Listening behaviour/ }).click();
  await expect(page.getByRole('heading', { name: 'Listening behaviour' })).toBeVisible();
  await page.getByRole('switch', { name: 'Continue into the next chapter' }).click();
  const read = async () => (await apiCall(stack.api, 'GET', `/api/listeners/${listener}/settings`)).json;
  await expect.poll(async () => (await read()).continue_into_next_chapter).toBe(false);
  await page.getByRole('radio', { name: /^Use this device/ }).check();
  await expect.poll(async () => (await read()).place_conflict).toBe('this_device');
  expect((await read()).default_voice_id).toBe(voice);
  await page.getByRole('switch', { name: 'Keep the screen on while listening' }).click();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Continue into the next chapter' })).not.toBeChecked();
  await expect(page.getByRole('radio', { name: /^Use this device/ })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Keep the screen on while listening' })).not.toBeChecked();
  expect(gemini.received()).toBe(0);
});

test.describe('cached app shell', () => {
test.use({ serviceWorkers: 'allow' });
test('the server name follows renames into the switcher and the offline screen after reload', async ({ page, context, stack }) => {
  await signIn(page, stack.api);
  await apiCall(stack.api, 'PATCH', '/api/server', { name: 'Lantern room' }, DEV);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bardic.server.name'))).toBe('Lantern room');
  await page.getByRole('button', { name: /Listening as Settings reader/ }).click();
  await expect(page.getByRole('dialog', { name: 'Switch listener' }).getByText('Lantern room', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.evaluate(() => (location.hash = '#/library'));
  await expect.poll(() => page.evaluate(async () => !!navigator.serviceWorker.controller && !!(await caches.match('/index.html')))).toBe(true);
  stack.setReachable(false);
  await reloadCachedPage(page);
  await expect(page.getByRole('heading', { name: 'Can’t reach Lantern room' })).toBeVisible();
});

test('the install manifest and icons load and stay cached with the offline shell', async ({ page, context, stack, browserName }) => {
  await signIn(page, stack.api);
  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  expect(manifest).toMatchObject({ name: 'Bardic', start_url: '/', display: 'standalone' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  if (browserName === 'chromium') {
    const cdp = await context.newCDPSession(page);
    const parsed = await cdp.send('Page.getAppManifest');
    expect(parsed.errors).toEqual([]);
  }
  await expect.poll(() => page.evaluate(async () => !!navigator.serviceWorker.controller && !!(await caches.match('/manifest.webmanifest')) && !!(await caches.match('/icon-512.png')))).toBe(true);
  stack.setReachable(false);
  await reloadCachedPage(page);
  const offline = await page.evaluate(async () => ({ manifest: (await fetch('/manifest.webmanifest')).status, icon: (await fetch('/icon-512.png')).status }));
  expect(offline).toEqual({ manifest: 200, icon: 200 });
});
});

// Preferences must change the reader's actual page, including after a new document opens.
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import { configureBreeze, freeVoiceId, readyAudiobook } from './helpers/world';

async function openReader(page: any, api: string, breeze: any) {
  const listener = (await apiCall(api, 'POST', '/api/listeners', { name: 'Reader listener' })).json.id as string;
  await configureBreeze(api, breeze);
  const book = (await apiCall(api, 'POST', '/api/books/sample', {}, 'e2e-reader', listener)).json.id as string;
  await readyAudiobook(api, listener, book, await freeVoiceId(api, listener));
  await page.addInitScript((id: string) => localStorage.setItem('bardic.listener', id), listener);
  await page.goto(`/?e2e=player#/listen/${book}`);
  await expect(page.getByRole('region', { name: 'Now playing', exact: true })).toBeVisible();
  return book;
}

test('Night selected in Settings paints the phone reader black with its own text colours', async ({ page, stack, breeze }) => {
  const book = await openReader(page, stack.api, breeze);
  await page.getByRole('radio', { name: 'Read', exact: true }).click();
  await page.evaluate(() => { location.hash = '#/settings/reader'; });
  const settings = page.getByRole('dialog', { name: 'Text and colour' });
  await settings.getByRole('radio', { name: 'Night', exact: true }).click();
  await settings.getByRole('button', { name: 'Done', exact: true }).click();
  await page.evaluate((id: string) => { location.hash = `#/listen/${id}`; }, book);
  const reader = page.getByRole('region', { name: 'Chapter text', exact: true });
  await expect(page.getByRole('region', { name: 'Now playing', exact: true })).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(reader.locator('.p').first()).toHaveCSS('color', 'rgb(214, 210, 220)');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Now playing', exact: true })).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(page.getByRole('region', { name: 'Chapter text', exact: true }).locator('.p').first()).toHaveCSS('color', 'rgb(214, 210, 220)');
});

test('tablet Page width narrows the rendered text column and survives a new document', async ({ page, stack, breeze }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await openReader(page, stack.api, breeze);
  const reader = page.getByRole('region', { name: 'Chapter text', exact: true });
  const column = reader.locator('.col');
  const wide = await column.evaluate((el: HTMLElement) => el.getBoundingClientRect().width);
  expect(wide).toBeGreaterThan(420);
  await page.getByRole('button', { name: 'Text settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Text and colour' });
  await settings.getByRole('radiogroup', { name: 'Page width', exact: true }).getByRole('radio', { name: 'Narrow', exact: true }).click();
  await settings.getByRole('radio', { name: 'Night', exact: true }).click();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => column.evaluate((el: HTMLElement) => el.getBoundingClientRect().width)).toBe(420);
  await expect(page.locator('.read.panel')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await page.reload();
  await expect.poll(() => page.getByRole('region', { name: 'Chapter text', exact: true }).locator('.col').evaluate((el: HTMLElement) => el.getBoundingClientRect().width)).toBe(420);
  await expect(page.locator('.read.panel')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
});

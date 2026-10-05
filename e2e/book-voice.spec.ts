// The seam between the book page and the voice chooser, end to end: choose a voice from the book
// page, see the Audiobook card, make it ready with a free voice, and watch the chapters turn Ready.
import { test, expect } from './fixtures';
import { apiCall } from './harness';

const DEV = 'e2e-seam-device';

test('choose a free voice from the book page, then make the book ready', async ({ page, stack, breeze }) => {
  await apiCall(stack.api, 'POST', '/api/listeners', { name: 'Nick' });
  await page.goto('/');
  await page.getByRole('button', { name: /^Nick/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
  const listener = (await apiCall(stack.api, 'GET', '/api/listeners')).json.items[0].id as string;
  expect((await apiCall(stack.api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, DEV)).status).toBe(200);
  const book = (await apiCall(stack.api, 'POST', '/api/books/sample', undefined, DEV, listener)).json.id as string;

  await page.goto(`/#/book/${book}`);
  await page.reload();
  await expect(page.getByText('No audiobook yet')).toBeVisible();
  await page.getByRole('button', { name: 'Choose a voice' }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a voice' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radiogroup', { name: 'Free voices' }).getByRole('radio', { name: /Mara/ }).click();
  await expect.poll(async () => (await apiCall(stack.api, 'GET', `/api/books/${book}/audiobooks`, undefined, DEV, listener)).json.items.map((a: { voice_name: string }) => a.voice_name)).toEqual(['Mara']);
  await page.keyboard.press('Escape');

  // the Audiobook card now names the voice and the chapters still say Not yet
  await expect(page.getByText('No audiobook yet')).toHaveCount(0);
  await expect(page.getByText('Mara').first()).toBeVisible();
  await expect(page.getByText('Not yet')).toHaveCount(3);

  // a free voice: Make ready asks for a simple confirmation, then the rows move to Ready
  await page.getByRole('button', { name: /Make ready/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /Make ready|Start/ }).last().click();
  await expect(page.getByText('Ready', { exact: true })).toHaveCount(3, { timeout: 20000 });
  expect(breeze.spoken.length).toBeGreaterThan(0);
  // nothing paid was involved
  expect((await apiCall(stack.api, 'GET', '/api/allowance')).json.spent.known.micros).toBe(0);
});

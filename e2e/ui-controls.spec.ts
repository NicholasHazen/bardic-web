import { test, expect } from './fixtures';
import { apiCall } from './harness';
import { configureBreeze, DEV, freeVoiceId, mkListener, readyAudiobook } from './helpers/world';

test('Read playback controls keep focus inside and return it after keyboard or backdrop dismissal', async ({ page, stack, breeze }) => {
  test.setTimeout(60000);
  const listener = await mkListener(stack.api, 'Player controls');
  await configureBreeze(stack.api, breeze);
  const voice = await freeVoiceId(stack.api, listener);
  const book = (await apiCall(stack.api, 'POST', '/api/books/sample', {}, DEV, listener)).json.id as string;
  await readyAudiobook(stack.api, listener, book, voice);

  // The shared fixture silences every media play before the page is created.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript((id) => localStorage.setItem('bardic.listener', id), listener);
  await page.goto('/?e2e=player');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.waitForFunction(() => !!window.__player);
  await page.evaluate(async (id) => {
    await window.__player!.open(id, { autoplay: false });
    window.__player!.setMode('read');
    location.hash = `#/listen/${id}`;
  }, book);
  await expect(page.getByRole('radio', { name: 'Read', exact: true })).toBeChecked();

  const opener = page.getByRole('button', { name: 'Show controls', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Playback controls', exact: true });
  await expect(dialog).toBeVisible();
  const buttons = dialog.getByRole('button');
  await buttons.last().focus();
  await page.keyboard.press('Tab');
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(buttons.last()).toBeFocused();

  const background = page.locator('.np .column');
  expect(await background.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  const backgroundButton = background.locator('button').first();
  expect(await backgroundButton.evaluate((el) => { el.focus(); return el !== document.activeElement; })).toBe(true);
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await background.evaluate((el) => (el as HTMLElement).inert)).toBe(false);

  await opener.click();
  await expect(dialog).toBeVisible();
  await page.locator('.np .scrim').click({ position: { x: 2, y: 2 } });
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await background.evaluate((el) => (el as HTMLElement).inert)).toBe(false);
});

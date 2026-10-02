import { test, expect } from './fixtures';
import { apiCall } from './harness';

test('modal sheets keep the covered page inert while the scrim dismisses and returns focus', async ({ page, stack }) => {
  await apiCall(stack.api, 'POST', '/api/listeners', { name: 'First reader' });
  await apiCall(stack.api, 'POST', '/api/listeners', { name: 'Second reader' });
  let release!: () => void;
  const libraryGate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/books**', async (route) => {
    if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/api/books') await libraryGate;
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^First reader/ }).click();

  const opener = page.getByRole('button', { name: /Listening as First reader/, includeHidden: true });
  const originalOpener = await opener.elementHandle();
  for (const activation of ['keyboard', 'pointer']) {
    if (activation === 'keyboard') {
      await opener.focus();
      await opener.press('Enter');
    } else {
      await opener.evaluate((el) => (el as HTMLElement).blur());
      await opener.click();
    }
    const dialog = page.getByRole('dialog', { name: 'Switch listener' });
    await expect(dialog).toBeVisible();
    if (activation === 'keyboard') {
      // The real initial loading→empty transition must preserve the modal's launcher.
      release();
      await expect(page.getByText('Add your first book', { exact: true })).toBeVisible();
      await expect.poll(() => originalOpener!.evaluate((el) => el.isConnected)).toBe(true);
    }
    await expect.poll(() => opener.evaluate((el) => !!el.closest('[inert]'))).toBe(true);
    await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    // Keyboard focus stays in the sheet; the pointer dismissal layer remains usable.
    for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await expect.poll(() => page.locator('.scrim.fixed').evaluate((el) => !!el.closest('[inert]'))).toBe(false);
    await page.locator('.scrim.fixed').click({ position: { x: 5, y: 5 } });
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect.poll(() => opener.evaluate((el) => !!el.closest('[inert]'))).toBe(false);
  }
});

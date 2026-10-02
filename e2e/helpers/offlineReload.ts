import { expect, type Page } from '@playwright/test';

/** Verify a genuinely new cached document, rather than the old page merely reacting to a network-state change.
 * Cut the harness origin's sockets before calling this; driver offline toggles bypass workers in Firefox/WebKit. */
export async function reloadCachedPage(page: Page) {
  const marker = `before-reload-${Date.now()}-${Math.random()}`;
  await page.evaluate((m) => { document.documentElement.dataset.reloadMarker = m; }, marker);
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.reloadMarker)).not.toBe(marker);
  await expect(page).toHaveTitle('Bardic');
  await expect(page.locator('#app > *').first()).toBeVisible();
}

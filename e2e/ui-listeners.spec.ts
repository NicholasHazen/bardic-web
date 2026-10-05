import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { apiCall } from './harness';

// Original synthetic names. The unbroken value is the server's maximum length,
// so layout cannot depend on names having a convenient space or being short.
const LONG_NAME = 'AlexandriannaMontgomeryWetheringtonQuillXX'.slice(0, 40);

test.use({ viewport: { width: 320, height: 568 } });

async function createListener(api: string, name: string) {
  const r = await apiCall(api, 'POST', '/api/listeners', { name });
  expect(r.status).toBe(201);
}

async function fitsButton(button: Locator, page: Page) {
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeVisible();
  const viewport = page.viewportSize()!;
  const size = await button.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const text = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const lines: { left: number; right: number; top: number; bottom: number }[] = [];
    for (let node = text.nextNode(); node; node = text.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const line of range.getClientRects()) if (line.width && line.height) {
        lines.push({ left: line.left, right: line.right, top: line.top, bottom: line.bottom });
      }
    }
    return {
      left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, lines,
    };
  });
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
  expect(size.left).toBeGreaterThanOrEqual(-1);
  expect(size.right).toBeLessThanOrEqual(viewport.width + 1);
  expect(size.top).toBeGreaterThanOrEqual(-1);
  expect(size.bottom).toBeLessThanOrEqual(viewport.height + 1);
  expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 1);
  expect(size.scrollHeight).toBeLessThanOrEqual(size.clientHeight + 1);
  for (const line of size.lines) {
    expect(line.left).toBeGreaterThanOrEqual(size.left - 1);
    expect(line.right).toBeLessThanOrEqual(size.right + 1);
    expect(line.top).toBeGreaterThanOrEqual(size.top - 1);
    expect(line.bottom).toBeLessThanOrEqual(size.bottom + 1);
  }
}

test('narrow listener deletion keeps the full name, Close, and wrapped actions inside the dialog', async ({ page, stack }) => {
  expect(Array.from(LONG_NAME)).toHaveLength(40);
  await createListener(stack.api, 'Synthetic reviewer');
  await createListener(stack.api, LONG_NAME);
  await page.goto('/');
  await page.getByRole('button', { name: /^Synthetic reviewer\./ }).click();
  await expect(page.getByRole('button', { name: /Listening as Synthetic reviewer/ })).toBeVisible();
  await page.goto('/#/settings/listeners');

  const edit = page.getByRole('button', { name: `Edit ${LONG_NAME}`, exact: true });
  // A keyboard opener makes the focus-return assertion meaningful on engines
  // that do not focus a button merely because it was clicked.
  await edit.focus();
  await edit.press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete listener', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Delete ${LONG_NAME}?`, exact: true });
  await expect(dialog).toBeVisible();
  await fitsButton(dialog.getByRole('button', { name: 'Close', exact: true }), page);
  await fitsButton(dialog.getByRole('button', { name: `Delete ${LONG_NAME}`, exact: true }), page);
  const keep = dialog.getByRole('button', { name: `Keep ${LONG_NAME}`, exact: true });
  await fitsButton(keep, page);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  await keep.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  expect((await apiCall(stack.api, 'GET', '/api/listeners')).json.items).toHaveLength(2);
});

test('a long listener list scrolls to its last choice and management actions above the persistent navigation', async ({ page, stack }) => {
  await createListener(stack.api, LONG_NAME);
  for (let n = 2; n <= 12; n++) await createListener(stack.api, `Synthetic listener ${n}`);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Who’s listening?' })).toBeVisible();
  const last = page.getByRole('button', { name: /^Synthetic listener 12\./ });
  await fitsButton(last, page);
  await fitsButton(page.getByRole('button', { name: 'Add a listener', exact: true }), page);
  await last.click();
  await expect(page.getByRole('button', { name: /Listening as Synthetic listener 12/ })).toBeVisible();
  await page.goto('/#/settings/listeners');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Settings', exact: true })).toHaveAttribute('aria-current', 'page');
  await fitsButton(page.getByRole('button', { name: 'Edit Synthetic listener 12', exact: true }), page);
  await fitsButton(page.getByRole('button', { name: 'Add a listener', exact: true }), page);
  for (const name of ['Home', 'Library', 'Settings']) await fitsButton(nav.getByRole('button', { name, exact: true }), page);

  // The page's actual shell continues behind the entire short viewport, rather
  // than ending after its initial listener rows and leaving an unthemed gap.
  const background = await page.locator('.app > .shell').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, colour: getComputedStyle(el).backgroundColor };
  });
  expect(background.top).toBe(0);
  expect(background.bottom).toBe(568);
  expect(background.left).toBe(0);
  expect(background.right).toBe(320);
  expect(background.colour).not.toBe('rgba(0, 0, 0, 0)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await nav.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});

// The whole premium journey, driven only through the screens a person uses, against a real server and the
// fake Gemini: set the key, choose a premium voice, read the estimate, approve, wait, listen to the audio,
// and see what it cost. The checks that matter most: nothing paid happens before Approve, exactly once after
// it, the key never comes back, and what is shown as spent is what the server recorded.
import { test, expect } from './fixtures';
import { apiCall } from './harness';

const DEV = 'e2e-journey-device';

test('set a key, choose a premium voice, approve one plan, listen, and see what it cost', async ({ page, stack, gemini }) => {
  const l = (await apiCall(stack.api, 'POST', '/api/listeners', { name: 'Nick' })).json.id as string;
  await page.goto('/');
  await page.getByRole('button', { name: /^Nick/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
  const book = (await apiCall(stack.api, 'POST', '/api/books/sample', {}, DEV, l)).json.id as string;
  const spent = async () => (await apiCall(stack.api, 'GET', '/api/allowance')).json.spent as { known: { micros: number }; unknown_items: number };
  const plans = async () => (await apiCall(stack.api, 'GET', '/api/plans', undefined, DEV, l)).json.items as { state: string; spent: { known: { micros: number } }; limit: { micros: number } }[];

  // 1. The key, entered once, through Settings. It is never shown back.
  await page.goto('/#/settings/premium');
  await page.reload();
  await page.getByLabel('Google API key').fill('test-key');
  await page.getByRole('button', { name: 'Check key' }).click();
  await expect(page.getByRole('button', { name: 'Remove key' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.outerHTML + JSON.stringify(localStorage))).not.toContain('test-key');
  expect(gemini.received()).toBe(0);

  // 2. Choosing a premium voice on the book page starts nothing and costs nothing.
  await page.goto(`/#/book/${book}`);
  await page.reload();
  await page.getByRole('button', { name: 'Choose a voice' }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a voice' });
  await chooser.getByRole('radio', { name: 'Premium', exact: true }).click();
  await chooser.getByRole('radio', { name: /Kore/ }).click();
  expect(gemini.received()).toBe(0);
  expect(await plans()).toHaveLength(0);

  // 3. The plan sheet: the estimate is a range with a most-likely value, and nothing is sent yet.
  await chooser.getByRole('button', { name: 'Plan the whole book' }).click();
  const sheet = page.getByRole('dialog').last();
  await expect(sheet).toContainText(/\$\d+\.\d\d to \$\d+\.\d\d|under \$0\.01/);
  await expect(sheet).toContainText(/most likely/i);
  const approve = sheet.getByRole('button', { name: /^Approve plan · up to \$/ });
  await expect(approve).toBeVisible();
  expect(gemini.received()).toBe(0);
  expect(await plans()).toHaveLength(0);
  expect((await spent()).known.micros).toBe(0);

  // 4. Approve, once. A second click while it works makes no second plan.
  await approve.dblclick();
  await expect.poll(async () => (await plans()).length, { timeout: 10000 }).toBe(1);
  await expect
    .poll(async () => {
      const ab = (await apiCall(stack.api, 'GET', `/api/books/${book}/audiobooks`, undefined, DEV, l)).json.items[0];
      return ab.chapters_ready >= ab.chapters_total && ab.chapters_total > 0;
    }, { timeout: 30000 })
    .toBe(true);
  expect(await plans()).toHaveLength(1);
  const p = (await plans())[0]!;
  expect(p.spent.known.micros).toBeGreaterThan(0);
  expect(p.spent.known.micros).toBeLessThanOrEqual(p.limit.micros);
  const s = await spent();
  expect(s.known.micros).toBeGreaterThan(0);
  expect(s.unknown_items).toBe(0);
  const requests = gemini.received();
  expect(requests).toBeGreaterThan(0);

  // 5. Listening to audio that is already made asks Google for nothing more.
  await page.goto(`/#/book/${book}`);
  await page.reload();
  await page.getByRole('button', { name: /^(Listen|Continue listening)$/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${book}`));
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);
  expect(gemini.received()).toBe(requests);
  expect((await spent()).known.micros).toBe(s.known.micros);

  // 6. The Allowance screen shows what the server recorded.
  await page.goto('/#/settings/allowance');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Allowance' })).toBeVisible();
  const dollars = (s.known.micros / 1_000_000).toFixed(2);
  const shown = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  expect(shown).toMatch(/spent/i);
  expect(shown.includes(`$${dollars}`) || shown.includes('under $0.01')).toBe(true);
});

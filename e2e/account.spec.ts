// W4 Gemini account and Allowance against a real bardic-server with the fake Breeze and Gemini (e2e/fakes.ts).
//
// The screens are opened on their app routes (#/settings/premium, #/settings/allowance).
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import type { Fake } from './fakes';
import type { Page } from '@playwright/test';

const DEV = 'e2e-account-device';
type Stack = { api: string };

async function signIn(page: Page, stack: Stack, name = 'Nick'): Promise<string> {
  const made = await apiCall(stack.api, 'POST', '/api/listeners', { name });
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('button', { name: new RegExp(`Listening as ${name}`) })).toBeVisible();
  return made.json.id as string;
}

async function open(page: Page, screen: 'premium' | 'allowance') {
  await page.goto(`/#/settings/${screen}`);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: screen === 'premium' ? 'Premium voices' : 'Allowance' })).toBeVisible();
}

const setupGemini = (stack: Stack, key = 'test-key') => apiCall(stack.api, 'PUT', '/api/voice-sources/gemini', { api_key: key }, DEV);
const gemini = (stack: Stack) => apiCall(stack.api, 'GET', '/api/voice-sources/gemini');
const allowance = async (stack: Stack) => (await apiCall(stack.api, 'GET', '/api/allowance')).json;

/** Everything a page can show or keep: the markup, every field's value, and the browser's storage. */
async function everythingOnPage(page: Page): Promise<string> {
  return page.evaluate(() =>
    JSON.stringify({
      html: document.documentElement.outerHTML,
      values: [...document.querySelectorAll('input,textarea')].map((i) => (i as HTMLInputElement).value),
      local: { ...localStorage },
      session: { ...sessionStorage },
      text: document.body.innerText,
    }),
  );
}

test('V5: a key entered through the screen is checked, shown as Connected, and never shown or kept again', async ({ page, stack, gemini: fake }) => {
  await signIn(page, stack);
  const responses: string[] = [];
  page.on('response', async (r) => {
    if (r.url().includes('/api/') && (r.headers()['content-type'] ?? '').includes('json')) responses.push(await r.text().catch(() => ''));
  });
  await open(page, 'premium');

  await expect(page.getByText('Not set up', { exact: true })).toBeVisible();
  const field = page.getByLabel('Google API key');
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveAttribute('autocomplete', 'off');
  await expect(page.getByRole('button', { name: 'Check key' })).toBeDisabled();

  await field.fill('test-key');
  const sent = page.waitForRequest((r) => r.method() === 'PUT' && r.url().endsWith('/api/voice-sources/gemini'));
  await page.getByRole('button', { name: 'Check key' }).click();
  expect((await sent).postDataJSON()).toEqual({ api_key: 'test-key' });

  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText('The key works.')).toBeVisible();
  await expect(field).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Remove key' })).toBeVisible();
  expect(await everythingOnPage(page)).not.toContain('test-key');

  // after a reload, and on the Voices screen
  await page.reload();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  expect(await everythingOnPage(page)).not.toContain('test-key');

  // the server: has_key, no key, anywhere
  const g = await gemini(stack);
  expect(g.json.has_key).toBe(true);
  expect(g.json.state).toBe('connected');
  expect(JSON.stringify(g.json)).not.toContain('test-key');
  expect(g.json).not.toHaveProperty('api_key');
  const list = await apiCall(stack.api, 'GET', '/api/voice-sources');
  expect(JSON.stringify(list.json)).not.toContain('test-key');
  // and in no response the page itself received
  expect(responses.length).toBeGreaterThan(0);
  expect(responses.join('\n')).not.toContain('test-key');
  expect(fake.received()).toBe(0); // checking a key reads the model list; nothing is spoken
});

test('V5: prices are shown with their date and where they come from', async ({ page, stack }) => {
  await signIn(page, stack);
  await setupGemini(stack);
  await open(page, 'premium');
  await expect(page.getByText(/^Prices as of \d{1,2} \w+ \d{4}, from a list entered by hand\./)).toBeVisible();
  await expect(page.getByText('Bardic can’t see your Google balance')).toBeVisible();
});

test('V5: a wrong key says Key rejected, begins with what is kept, and stores nothing', async ({ page, stack }) => {
  await signIn(page, stack);
  await open(page, 'premium');
  await page.getByLabel('Google API key').fill('wrong-key');
  await page.getByRole('button', { name: 'Check key' }).click();

  const alert = page.getByRole('alert').filter({ hasText: 'Key rejected' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Audio already made is kept and still plays.');
  await expect(alert).toContainText('nothing was changed');
  await expect(page.getByLabel('Google API key')).toHaveValue('');
  expect(await everythingOnPage(page)).not.toContain('wrong-key');

  const g = await gemini(stack);
  expect(g.json.has_key).toBe(false);
  expect(g.json.state).toBe('not_set_up');
});

test('PL11: a key rejected later shows the key problem; free voices still play; replacing the key connects again', async ({ page, stack, breeze, gemini: fake }) => {
  await signIn(page, stack);
  await apiCall(stack.api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, DEV);
  await setupGemini(stack);
  fake.setKey('other'); // Google now rejects the stored key
  const t = await apiCall(stack.api, 'POST', '/api/voice-sources/gemini/test', undefined, DEV);
  expect(t.json.state).toBe('key_rejected');

  await open(page, 'premium');
  const problem = page.getByRole('alert').filter({ hasText: 'Google rejected the key' });
  await expect(problem).toBeVisible();
  await expect(problem).toContainText('Audio already made keeps playing.');
  await expect(problem).toContainText('Premium voices are paused.');
  await expect(page.getByText('Free voices are not affected.')).toBeVisible();

  // free voices: Breeze is still connected and a free example still plays
  const breezeNow = await apiCall(stack.api, 'GET', '/api/voice-sources/breeze');
  expect(breezeNow.json.state).toBe('connected');
  const voices = await apiCall(stack.api, 'GET', '/api/voices?source_id=breeze');
  const sample = await fetch(`${stack.api}/api/voices/${encodeURIComponent(voices.json.items[0].id)}/sample`, { headers: { 'x-bardic-device': DEV } });
  expect(sample.status).toBe(200);
  expect(fake.received()).toBe(0);

  // Test again: Google still rejects it
  await page.getByRole('button', { name: 'Test again' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Still rejected' })).toBeVisible();

  // Replace key with nothing typed asks for the key first and sends nothing
  await page.getByRole('button', { name: 'Replace key' }).click();
  await expect(page.getByText('Paste the new key into the field')).toBeVisible();
  await expect(page.getByLabel('Google API key')).toBeFocused();

  // a new key Google accepts
  fake.setKey('fresh-key');
  await page.getByLabel('Google API key').fill('fresh-key');
  await page.getByRole('button', { name: 'Replace key' }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText('Google rejected the key')).toHaveCount(0);
  expect(await everythingOnPage(page)).not.toContain('fresh-key');
  expect((await gemini(stack)).json.state).toBe('connected');
});

test('V5: Remove key asks first, keeps audio, and returns to Not set up', async ({ page, stack }) => {
  await signIn(page, stack);
  await setupGemini(stack);
  await open(page, 'premium');
  await page.getByRole('button', { name: 'Remove key' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove the key?' });
  await expect(dialog).toContainText('Audio already made is kept and still plays.');
  await dialog.getByRole('button', { name: 'Keep the key' }).click();
  expect((await gemini(stack)).json.has_key).toBe(true);

  await page.getByRole('button', { name: 'Remove key' }).click();
  await page.getByRole('dialog', { name: 'Remove the key?' }).getByRole('button', { name: 'Remove key' }).click();
  await expect(page.getByText('Not set up', { exact: true })).toBeVisible();
  const g = await gemini(stack);
  expect(g.json.has_key).toBe(false);
});

test('PL8: no monthly limit by default; set the monthly limit and the default plan limit, then clear the limit', async ({ page, stack }) => {
  await signIn(page, stack);
  await open(page, 'allowance');

  const a0 = await allowance(stack);
  expect(a0.monthly_limit).toBeNull();
  const toggle = page.getByRole('switch', { name: /Set a monthly limit/ });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Off: only each plan’s own limit applies')).toBeVisible();
  await expect(page.getByText('Shared by all listeners')).toBeVisible();

  // a bad amount is refused in words and nothing is sent
  await toggle.click();
  await page.getByLabel(/Monthly limit/).fill('lots');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('A monthly limit must be an amount in dollars')).toBeVisible();
  expect((await allowance(stack)).monthly_limit).toBeNull();

  await page.getByLabel(/Monthly limit/).fill('20');
  await page.getByLabel(/Default limit for one plan/).fill('7.50');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  const a1 = await allowance(stack);
  expect(a1.monthly_limit).toEqual({ micros: 20_000_000, currency: 'USD' });
  expect(a1.default_plan_limit).toEqual({ micros: 7_500_000, currency: 'USD' });

  // the "with a limit" variant after a reload
  await page.reload();
  await expect(page.getByText('$0.00 of $20.00')).toBeVisible();
  await expect(page.getByText('$20.00 left this month.')).toBeVisible();
  await expect(page.getByLabel(/Monthly limit/)).toHaveValue('20.00');
  await expect(page.getByLabel(/Default limit for one plan/)).toHaveValue('7.50');

  // clear the limit
  await page.getByRole('switch', { name: /Set a monthly limit/ }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'There is no monthly limit' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('A plan that is running keeps its own limit.');
  const a2 = await allowance(stack);
  expect(a2.monthly_limit).toBeNull();
  expect(a2.default_plan_limit.micros).toBe(7_500_000);
});

test('PL9: a limit below what is spent is allowed and says what it does; the spend is shown', async ({ page, stack }) => {
  const listener = await signIn(page, stack);
  await setupGemini(stack);
  // spend something against the fake Gemini: a plan with its own limit (offline; nothing real is charged)
  const book = (await apiCall(stack.api, 'POST', '/api/books/sample', undefined, DEV, listener)).json.id as string;
  const voices = (await apiCall(stack.api, 'GET', '/api/voices?source_id=gemini')).json.items as { id: string }[];
  const ab = (await apiCall(stack.api, 'POST', `/api/books/${book}/audiobooks`, { voice_id: voices[0]!.id }, DEV, listener)).json.id as string;
  const est = (await apiCall(stack.api, 'POST', `/api/audiobooks/${ab}/plan-preview`, { scope: { kind: 'whole_book' } }, DEV, listener)).json;
  const plan = await apiCall(stack.api, 'POST', '/api/plans', { estimate_id: est.estimate_id, limit: est.suggested_limit }, DEV, listener);
  expect(plan.status).toBe(201);
  await expect
    .poll(async () => ((await apiCall(stack.api, 'GET', `/api/plans/${plan.json.id}`)).json.state as string), { timeout: 60_000 })
    .toMatch(/completed|stopped|failed|needs_you/);
  const spent = (await allowance(stack)).spent as { known: { micros: number }; unknown_items: number };
  expect(spent.known.micros + spent.unknown_items).toBeGreaterThan(0);

  await open(page, 'allowance');
  if (spent.known.micros > 0) await expect(page.getByText(/ spent$/).first()).toBeVisible();
  if (spent.unknown_items > 0) await expect(page.getByText(/with unknown cost/)).toBeVisible();

  // one micro is below any spending: allowed, with the PL9 note before and after saving
  await page.getByRole('switch', { name: /Set a monthly limit/ }).click();
  await page.getByLabel(/Monthly limit/).fill('0.000001');
  const note = page.getByText('This limit is below what has been spent');
  if (spent.known.micros > 1) await expect(note).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect((await allowance(stack)).monthly_limit.micros).toBe(1);
  if (spent.known.micros > 1) {
    await expect(note).toBeVisible();
    await expect(page.getByText('New plans can’t start')).toBeVisible();
    await expect(page.getByText('Nothing left this month.')).toBeVisible();
  }
});

// A browser allows about six connections per server over HTTP/1.1, and each open event stream holds one.
// The library, the book page, the player and the offline engine used to open one each, and ordinary requests
// then queued behind them. The page now holds ONE stream however many screens are listening.
import { test, expect } from './fixtures';
import { apiCall } from './harness';

test('the app holds one event stream across Home, Library, a book, Now Playing and Settings', async ({ page, stack, breeze }) => {
  const DEV = 'e2e-streams-device';
  const l = (await apiCall(stack.api, 'POST', '/api/listeners', { name: 'Nick' })).json.id as string;
  await page.goto('/');
  await page.getByRole('button', { name: /^Nick/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
  await apiCall(stack.api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, DEV);
  const book = (await apiCall(stack.api, 'POST', '/api/books/sample', {}, DEV, l)).json.id as string;
  const voice = (await apiCall(stack.api, 'GET', '/api/voices?source_id=breeze', undefined, DEV, l)).json.items[0].id;
  await apiCall(stack.api, 'POST', `/api/books/${book}/audiobooks`, { voice_id: voice }, DEV, l);

  let open = 0;
  let most = 0;
  const isStream = (url: string) => /\/api\/events(\?|$)/.test(url);
  page.on('request', (r) => {
    if (isStream(r.url())) most = Math.max(most, ++open);
  });
  const closed = (r: { url(): string }) => {
    if (isStream(r.url())) open = Math.max(0, open - 1);
  };
  page.on('requestfinished', closed);
  page.on('requestfailed', closed);

  await page.goto('/#/');
  await page.reload();
  for (const route of ['/library', `/book/${book}`, '/settings', '/', `/book/${book}`]) {
    await page.evaluate((r) => (location.hash = `#${r}`), route);
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: /^(Listen|Continue listening)$/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/listen/${book}`));
  await page.waitForTimeout(1500);
  expect(most, 'event streams open at the same time').toBeLessThanOrEqual(1);
  expect(most).toBeGreaterThanOrEqual(1);
});

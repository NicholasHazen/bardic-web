import { test, expect } from './fixtures';
import { apiCall } from './harness';

test('switching listeners on a mounted Settings page refreshes its default voice', async ({ page, stack, breeze }) => {
  const a = (await apiCall(stack.api, 'POST', '/api/listeners', { name: 'First reader' })).json.id;
  const b = (await apiCall(stack.api, 'POST', '/api/listeners', { name: 'Second reader' })).json.id;
  await apiCall(stack.api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url });
  const voices = (await apiCall(stack.api, 'GET', '/api/voices?source_id=breeze')).json.items;
  for (const [listener, voice] of [[a, voices[0]], [b, voices[1]]]) {
    await apiCall(stack.api, 'PUT', `/api/listeners/${listener}/settings`, { default_voice_id: voice.id, continue_into_next_chapter: true, place_conflict: 'ask' });
  }
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto('/');
  await page.getByRole('button', { name: /^First reader/ }).click();
  await page.evaluate(() => (location.hash = '#/settings'));
  const summary = page.getByRole('link', { name: /^Default voice/ });
  await expect(summary).toContainText(voices[0].name);
  await page.getByRole('button', { name: /Listening as First reader/ }).click();
  await page.getByRole('dialog', { name: 'Switch listener' }).getByRole('button', { name: /^Second reader/ }).click();
  await expect(summary).toContainText(voices[1].name);
  await summary.click();
  await page.getByRole('button', { name: /Listening as Second reader/ }).click();
  await page.getByRole('dialog', { name: 'Switch listener' }).getByRole('button', { name: /^First reader/ }).click();
  await expect(page.getByRole('radio', { name: new RegExp(voices[0].name) })).toBeChecked();
});

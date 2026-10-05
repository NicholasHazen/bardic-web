import { test, expect } from './fixtures';
import { apiCall } from './harness';

const mk = async (api: string, name: string) => (await apiCall(api, 'POST', '/api/listeners', { name })).json.id as string;

test('L1: first launch asks for a name, creates the first listener and remembers it', async ({ page, stack }) => {
  await page.goto('/');
  await expect(page.getByText('Welcome to Bardic')).toBeVisible();
  await page.getByLabel('Your name').fill('Nick');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
  const list = await apiCall(stack.api, 'GET', '/api/listeners');
  expect(list.json.items.map((l: { name: string }) => l.name)).toEqual(['Nick']);
  await page.reload();
  await expect(page.getByText('Welcome to Bardic')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
});

test('L2: with several listeners and no remembered choice a chooser appears, and the choice is remembered', async ({ page, stack }) => {
  await mk(stack.api, 'Nick');
  await mk(stack.api, 'Sam');
  await page.goto('/');
  await expect(page.getByText('Who’s listening?')).toBeVisible();
  await page.getByRole('button', { name: /^Sam/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Sam/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Who’s listening?')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Listening as Sam/ })).toBeVisible();
});

test('L3: the avatar opens a switcher that lists listeners and switches; the choice is per device', async ({ page, stack, browser }) => {
  await mk(stack.api, 'Nick');
  await mk(stack.api, 'Sam');
  await page.goto('/');
  await page.getByRole('button', { name: /^Nick/ }).click();
  await page.getByRole('button', { name: /Listening as Nick/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Switch listener')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Sam/ })).toBeVisible();
  await dialog.getByRole('button', { name: /^Sam/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Sam/ })).toBeVisible();
  // another device has its own choice
  const other = await browser.newContext({ baseURL: stack.url, viewport: { width: 390, height: 844 } });
  const p2 = await other.newPage();
  await p2.goto('/');
  await expect(p2.getByText('Who’s listening?')).toBeVisible();
  await other.close();
});

test('L5: add, rename, a taken name is refused, delete shows what is lost, the last listener cannot be deleted', async ({ page, stack }) => {
  await mk(stack.api, 'Nick');
  await page.goto('/');
  await page.getByRole('button', { name: /^Nick/ }).click();
  await page.goto('/#/settings/listeners');

  // add
  await page.getByRole('button', { name: 'Add a listener' }).click();
  await page.locator('#listener-name-add').fill('Sam');
  await page.getByRole('button', { name: 'Add listener' }).click();
  await expect(page.getByRole('button', { name: 'Edit Sam' })).toBeVisible();

  // a taken name (any case) is refused and nothing changes
  await page.getByRole('button', { name: 'Edit Sam' }).click();
  await page.locator('#listener-name-edit').fill('nick');
  await expect(page.getByRole('button', { name: 'Save name' })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText(/already|taken/i);
  // rename
  await page.locator('#listener-name-edit').fill('Samira');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('button', { name: 'Edit Samira' })).toBeVisible();
  const names = (await apiCall(stack.api, 'GET', '/api/listeners')).json.items.map((l: { name: string }) => l.name).sort();
  expect(names).toEqual(['Nick', 'Samira']);

  // delete shows what is lost, then deletes
  await page.getByRole('button', { name: 'Edit Samira' }).click();
  await page.getByRole('button', { name: 'Delete listener' }).click();
  await expect(page.getByRole('dialog')).toContainText(/places|books/i);
  await page.getByRole('dialog').getByRole('button', { name: /^Delete/ }).last().click();
  await expect(page.getByRole('button', { name: 'Edit Samira' })).toHaveCount(0);

  // the last listener cannot be deleted
  await page.getByRole('button', { name: 'Edit Nick' }).click();
  await expect(page.getByRole('button', { name: 'Delete listener' })).toBeDisabled();
});

test('L6: deleting the listener selected on another device sends that device back to the chooser', async ({ page, stack }) => {
  const nick = await mk(stack.api, 'Nick');
  await mk(stack.api, 'Sam');
  await page.goto('/');
  await page.getByRole('button', { name: /^Nick/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
  expect((await apiCall(stack.api, 'DELETE', `/api/listeners/${nick}`)).status).toBeLessThan(300);
  await page.reload();
  await expect(page.getByText('Who’s listening?')).toBeVisible();
});

test('L7: nothing says listeners are private or protected', async ({ page, stack }) => {
  await mk(stack.api, 'Nick');
  await mk(stack.api, 'Sam');
  await page.goto('/');
  const text = (await page.locator('body').innerText()).toLowerCase();
  expect(text).not.toMatch(/\b(private|protected|secure|secret|locked)\b/);
  expect(text).toContain('not passwords');
});

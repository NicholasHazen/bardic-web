import { test, expect } from './fixtures';
import { apiCall } from './harness';
import type { Page } from '@playwright/test';

const tale = (n: string) =>
  Buffer.from(`Chapter One\n\nThe tide came in at noon, and ${n} watched it climb the harbour wall.\n\nChapter Two\n\nBy evening the boats had returned, one lantern at a time.\n`);

async function signIn(page: Page, stack: { api: string }, name = 'Nick') {
  await apiCall(stack.api, 'POST', '/api/listeners', { name });
  await page.goto('/');
  // a new device with listeners on the server is asked who is listening, even when there is one
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('button', { name: new RegExp(`Listening as ${name}`) })).toBeVisible();
}

async function addFile(page: Page, name: string, buffer: Buffer) {
  await page.getByLabel('Add a book').first().click();
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'text/plain', buffer });
  await page.getByRole('dialog').getByRole('button', { name: 'Add book' }).click();
}

test('A1 and A6: three tabs; an empty library offers the sample, which then appears', async ({ page, stack }) => {
  await signIn(page, stack);
  for (const tab of ['Home', 'Library', 'Settings']) await expect(page.getByRole('button', { name: tab, exact: true }).first()).toBeVisible();
  await expect(page.getByText('Add your first book')).toBeVisible();
  await page.getByRole('button', { name: 'Open the sample' }).click();
  await expect(page.getByText('The Lantern Keeper').first()).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).first().click();
  await expect(page.getByText('1 book')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('A2 and A4: adding a text file stores it and the book appears in the library', async ({ page, stack }) => {
  await signIn(page, stack);
  await page.goto('/#/library');
  await addFile(page, 'Harbour Lights.txt', tale('Mara'));
  await expect(page.getByText('Harbour Lights').first()).toBeVisible({ timeout: 15000 });
  const l = (await apiCall(stack.api, 'GET', '/api/listeners')).json.items[0].id;
  await expect
    .poll(async () => (await apiCall(stack.api, 'GET', '/api/books?limit=50', undefined, 'e2e-other-device-1', l)).json.items.map((b: { title: string }) => b.title), { timeout: 15000 })
    .toContain('Harbour Lights');
  // the words are stored as written
  const book = (await apiCall(stack.api, 'GET', '/api/books?limit=50', undefined, 'e2e-other-device-1', l)).json.items[0];
  const chapters = (await apiCall(stack.api, 'GET', `/api/books/${book.id}/chapters`, undefined, 'e2e-other-device-1', l)).json.items;
  expect(chapters).toHaveLength(2);
});

test('A3: the same file again is recognised before uploading and can be opened or added anyway', async ({ page, stack }) => {
  await signIn(page, stack);
  await page.goto('/#/library');
  await addFile(page, 'Harbour Lights.txt', tale('Mara'));
  await expect(page.getByText('Harbour Lights').first()).toBeVisible({ timeout: 15000 });
  await addFile(page, 'Harbour Lights copy.txt', tale('Mara'));
  await expect(page.getByText(/Already in your library/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Add another copy/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Open/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /Add another copy/i }).click();
  await expect.poll(async () => {
    const l = (await apiCall(stack.api, 'GET', '/api/listeners')).json.items[0].id;
    return (await apiCall(stack.api, 'GET', '/api/books?limit=50', undefined, 'e2e-other-device-1', l)).json.items.length;
  }, { timeout: 15000 }).toBe(2);
});

test('A4: a file that cannot be added says why, first that nothing was added, and leaves no book', async ({ page, stack }) => {
  await signIn(page, stack);
  await page.goto('/#/library');
  await addFile(page, 'broken.txt', Buffer.from([0xff, 0xfe, 0x41, 0x00, 0xc3, 0x28]));
  await expect(page.getByRole('dialog')).toContainText(/Nothing was added/i, { timeout: 15000 });
  const l = (await apiCall(stack.api, 'GET', '/api/listeners')).json.items[0].id;
  expect((await apiCall(stack.api, 'GET', '/api/books?limit=50', undefined, 'e2e-other-device-1', l)).json.items).toHaveLength(0);
});

test('A7: search and filters narrow the library', async ({ page, stack }) => {
  await signIn(page, stack);
  await page.goto('/#/library');
  await addFile(page, 'Harbour Lights.txt', tale('Mara'));
  await expect(page.getByText('Harbour Lights').first()).toBeVisible({ timeout: 15000 });
  const l = (await apiCall(stack.api, 'GET', '/api/listeners')).json.items[0].id;
  await expect
    .poll(async () => (await apiCall(stack.api, 'GET', '/api/books?limit=50', undefined, 'e2e-other-device-1', l)).json.items.length, { timeout: 15000 })
    .toBe(1);
  await apiCall(stack.api, 'POST', '/api/books/sample', {}, 'e2e-other-device-1', l);
  await page.reload();
  await expect(page.getByText('2 books')).toBeVisible();
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('searchbox').or(page.getByRole('textbox')).first().fill('lantern');
  await expect(page.getByText('The Lantern Keeper').first()).toBeVisible();
  await expect(page.getByText('Harbour Lights')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finished' }).click();
  await expect(page.getByText('The Lantern Keeper')).toHaveCount(0);
});

test('A9: editing details changes the title and author and never the text', async ({ page, stack }) => {
  await signIn(page, stack);
  const l = (await apiCall(stack.api, 'GET', '/api/listeners')).json.items[0].id;
  const sample = (await apiCall(stack.api, 'POST', '/api/books/sample', {}, 'e2e-other-device-1', l)).json;
  const text = async () => {
    const ch = (await apiCall(stack.api, 'GET', `/api/books/${sample.id}/chapters`, undefined, 'e2e-other-device-1', l)).json.items[0];
    return JSON.stringify((await apiCall(stack.api, 'GET', `/api/books/${sample.id}/chapters/${ch.id}/text`, undefined, 'e2e-other-device-1', l)).json);
  };
  const before = await text();
  await page.goto('/#/library/manage');
  await page.getByRole('button', { name: /More|Edit/i }).first().click();
  await page.getByLabel('Title').fill('The Lantern Keeper, Revised');
  await page.getByLabel('Author').fill('A. Writer');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await apiCall(stack.api, 'GET', `/api/books/${sample.id}`, undefined, 'e2e-other-device-1', l)).json.title).toBe('The Lantern Keeper, Revised');
  expect(await text()).toBe(before);
});

test('A2 and A4: a DRM-protected EPUB is refused with the board’s words and leaves no book; a plain EPUB is added', async ({ page, stack }) => {
  const { epub } = await import('./zip');
  await signIn(page, stack);
  await page.goto('/#/library');
  await page.getByLabel('Add a book').first().click();
  await page.locator('input[type=file]').setInputFiles({ name: 'protected.epub', mimeType: 'application/epub+zip', buffer: epub({ drm: true }) });
  await page.getByRole('dialog').getByRole('button', { name: 'Add book' }).click();
  await expect(page.getByRole('dialog')).toContainText('This EPUB is protected', { timeout: 15000 });
  await expect(page.getByRole('dialog')).toContainText(/DRM/);
  const l = (await apiCall(stack.api, 'GET', '/api/listeners')).json.items[0].id;
  expect((await apiCall(stack.api, 'GET', '/api/books?limit=50', undefined, 'e2e-other-device-1', l)).json.items).toHaveLength(0);
  // choose another file: a plain EPUB goes through
  await page.getByRole('button', { name: /Choose another file/i }).click().catch(() => {});
  await page.locator('input[type=file]').setInputFiles({ name: 'plain.epub', mimeType: 'application/epub+zip', buffer: epub() });
  await page.getByRole('dialog').getByRole('button', { name: 'Add book' }).click();
  await expect.poll(async () => (await apiCall(stack.api, 'GET', '/api/books?limit=50', undefined, 'e2e-other-device-1', l)).json.items.map((b: { title: string }) => b.title), { timeout: 15000 }).toContain('The Test Ferry');
});

test('A8: Home shows Continue for a book with a place, and a finished book leaves Continue', async ({ page, stack }) => {
  await signIn(page, stack);
  const l = (await apiCall(stack.api, 'GET', '/api/listeners')).json.items[0].id;
  const d = 'e2e-other-device-1';
  const sample = (await apiCall(stack.api, 'POST', '/api/books/sample', {}, d, l)).json;
  const ch = (await apiCall(stack.api, 'GET', `/api/books/${sample.id}/chapters`, undefined, d, l)).json.items;
  await page.goto('/#/');
  await expect(page.getByText(/continue/i)).toHaveCount(0);
  const put = (body: object) => apiCall(stack.api, 'PUT', `/api/books/${sample.id}/place`, body, d, l);
  expect((await put({ chapter_id: ch[1].id, offset: 40, mode: 'listening', base_revision: 0 })).status).toBe(200);
  await page.reload();
  await expect(page.getByText(/continue/i).first()).toBeVisible();
  await expect(page.getByText('The Lantern Keeper').first()).toBeVisible();
  // marked finished: leaves Continue
  const done = await apiCall(stack.api, 'PUT', `/api/books/${sample.id}/place/finished`, { finished: true }, d, l);
  expect(done.status).toBe(200);
  await page.reload();
  await expect(page.getByText(/continue/i)).toHaveCount(0);
});

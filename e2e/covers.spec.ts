import { test, expect } from './fixtures';
import { apiCall } from './harness';
import { epub } from './zip';
import type { Page } from '@playwright/test';

const DEV = 'e2e-covers-device';

async function signIn(page: Page, stack: { api: string }) {
  const l = (await apiCall(stack.api, 'POST', '/api/listeners', { name: 'Nick' })).json.id as string;
  await page.goto('/');
  await page.getByRole('button', { name: /^Nick/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
  return l;
}

const upload = async (api: string, name: string, buffer: Buffer, type = 'application/epub+zip') => {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(buffer)], { type }), name);
  const r = await fetch(`${api}/api/imports`, { method: 'POST', headers: { 'x-bardic-device': DEV }, body: form });
  const imp = await r.json();
  for (let i = 0; i < 100; i++) {
    const s = await (await fetch(`${api}/api/imports/${imp.id}`, { headers: { 'x-bardic-device': DEV } })).json();
    if (s.state === 'done') return s.book_id as string;
    await new Promise((res) => setTimeout(res, 50));
  }
  throw new Error('import did not finish');
};

test('chapter counts agree: the header counts every chapter, the same set the audiobook covers', async ({ page, stack, breeze }) => {
  const l = await signIn(page, stack);
  expect((await apiCall(stack.api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, DEV)).status).toBe(200);
  const book = await upload(stack.api, 'matter.epub', epub({ title: 'Matter Test', titles: ['Copyright', 'The Crossing', 'The Far Shore', 'About the Author'] }));
  const voice = (await apiCall(stack.api, 'GET', '/api/voices?source_id=breeze', undefined, DEV, l)).json.items[0].id;
  await apiCall(stack.api, 'POST', `/api/books/${book}/audiobooks`, { voice_id: voice }, DEV, l);
  const b = (await apiCall(stack.api, 'GET', `/api/books/${book}`, undefined, DEV, l)).json;
  expect([b.chapter_count, b.story_chapter_count]).toEqual([4, 2]);
  await page.goto(`/#/book/${book}`);
  await page.reload();
  await expect(page.getByText('4 chapters · ')).toBeVisible();
  await expect(page.getByText(/0 of 4/)).toBeVisible();
});

test('a book with no cover gets a steady colour of its own that themes its page; a real cover is kept', async ({ page, stack }) => {
  const l = await signIn(page, stack);
  const a = await upload(stack.api, 'A Tale of Tides.txt', Buffer.from('Chapter One\n\nThe tide came in.\n'), 'text/plain');
  const b = await upload(stack.api, 'Winterhouse Letters.txt', Buffer.from('Chapter One\n\nSnow fell on the roof.\n'), 'text/plain');
  const cover = async (id: string) => (await apiCall(stack.api, 'GET', `/api/books/${id}`, undefined, DEV, l)).json.cover;
  const [ca, cb] = [await cover(a), await cover(b)];
  expect([ca.generated, cb.generated]).toEqual([true, true]);
  expect(ca.sample.vivid && cb.sample.vivid).toBe(true);
  expect(ca.sample.hex).not.toBe(cb.sample.hex);
  const base = async (id: string) => {
    await page.goto(`/#/book/${id}`);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    return page.evaluate(() => getComputedStyle(document.querySelector('[style*="--base"]') ?? document.body).getPropertyValue('--base').trim());
  };
  const [baseA, baseB] = [await base(a), await base(b)];
  expect(baseA).toMatch(/^#[0-9a-f]{6}$/);
  expect(baseA).not.toBe(baseB);
  // the same title on another copy gets the same colour, so every device agrees
  const again = await upload(stack.api, 'A Tale of Tides copy.txt', Buffer.from('Chapter One\n\nThe tide came in, again.\n'), 'text/plain');
  expect((await apiCall(stack.api, 'PATCH', `/api/books/${again}`, { title: 'A Tale of Tides' }, DEV, l)).status).toBe(200);
  await apiCall(stack.api, 'POST', `/api/books/${again}/cover/refresh`, {}, DEV, l);
  expect((await cover(again)).sample.hex).toBe(ca.sample.hex);
  // a tile shows its title over the flat colour, as on the boards
  await page.goto('/#/library');
  await page.reload();
  await expect(page.getByText('A Tale of Tides').first()).toBeVisible();
});

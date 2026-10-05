// The player with no connection (O3 to O5) against a real bardic-server and the fake Breeze: chapters downloaded with
// the offline engine play and read from this device, the others say why and offer the next one that is held, the place is
// kept and reaches the server when it is back. The page has both hooks (?e2e=offline gives window.__offline and
// window.__player). The harness cuts real origin sockets: the server is unreachable while local Blob audio remains usable.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { apiCall } from './harness';

const OTHER = 'e2e-other-device-1';
/* eslint-disable @typescript-eslint/no-explicit-any */
const off = (page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as any).__offline[f as string](...(a as unknown[])), [fn, args] as const);
const offState = (page: Page) => page.evaluate(() => new Promise<any>((r) => (window as any).__offline.subscribe((s: unknown) => r(JSON.parse(JSON.stringify(s)))) && undefined));
const st = (page: Page) =>
  page.evaluate(() => {
    let v: any;
    window.__player!.subscribe((s) => (v = s))();
    const { text, lines, timings, ...rest } = v;
    return { ...rest, text, lineCount: lines.length } as any;
  });
const cmd = (page: Page, name: string, ...args: unknown[]) => page.evaluate(([n, a]) => (window.__player as any)[n as string](...(a as unknown[])), [name, args] as const);

test.describe.configure({ timeout: 90000 });

test('O3 and O5: downloaded chapters play and read with no server, the others say why, the place follows when it returns', async ({ page, stack, breeze }) => {
  const l = (await apiCall(stack.api, 'POST', '/api/listeners', { name: 'Nick' })).json.id as string;
  expect((await apiCall(stack.api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, OTHER)).status).toBe(200);
  const bookId = (await apiCall(stack.api, 'POST', '/api/books/sample', undefined, OTHER, l)).json.id as string;
  const chapters = (await apiCall(stack.api, 'GET', `/api/books/${bookId}/chapters`)).json.items as { id: string; title: string }[];
  const voices = (await apiCall(stack.api, 'GET', '/api/voices?source_id=breeze')).json.items as { id: string }[];
  const ab = (await apiCall(stack.api, 'POST', `/api/books/${bookId}/audiobooks`, { voice_id: voices[0]!.id }, OTHER)).json.id as string;
  await apiCall(stack.api, 'POST', `/api/audiobooks/${ab}/make-ready`, { scope: { kind: 'whole_book' } }, OTHER, l);
  await expect.poll(async () => ((await apiCall(stack.api, 'GET', `/api/audiobooks/${ab}/chapters`)).json.items as { state: string }[]).every((c) => c.state === 'ready'), { timeout: 30000 }).toBe(true);
  const texts = await Promise.all(chapters.map(async (c) => (await apiCall(stack.api, 'GET', `/api/books/${bookId}/chapters/${c.id}/text`)).json));
  const audio = (await apiCall(stack.api, 'GET', `/api/audiobooks/${ab}/chapters`)).json.items as { chapter_id: string; audio: { id: string } }[];
  const timings0 = (await apiCall(stack.api, 'GET', `/api/audio/${audio[0]!.audio.id}/timings`)).json.lines as { line_id: string; start_ms: number }[];

  await page.goto('/?e2e=offline');
  await page.getByRole('button', { name: /^Nick/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__offline && !!window.__player);

  // download chapters one and three; chapter two stays on the server only
  await off(page, 'start', ab, { kind: 'chapters', chapterIds: [chapters[0]!.id, chapters[2]!.id] }, { wifiOnly: false, keepNew: false });
  await expect
    .poll(async () => ((await offState(page)).books.find((b: any) => b.audiobookId === ab)?.chapters ?? []).map((c: any) => c.state), { timeout: 30000 })
    .toEqual(['on_device', 'not_downloaded', 'on_device']);

  // the Bardic computer goes away
  stack.setReachable(false);
  await off(page, 'refresh');
  await expect.poll(async () => (await offState(page)).online, { timeout: 20000 }).toBe(false);

  // open: from what the device remembers, at the first chapter that is held
  await page.evaluate((b) => window.__player!.open(b), bookId);
  let s = await st(page);
  expect(s.loaded).toBe(true);
  expect(s.book.title).toBeTruthy();
  expect(s.chapter.id).toBe(chapters[0]!.id);
  expect(s.text).toBe(texts[0].text);
  expect(s.lineCount).toBe(texts[0].lines.length);
  expect(s.needsYou).toBeNull();
  expect(s.chapters.map((c: any) => c.audio)).toEqual(['on_device', 'not_yet', 'on_device']);

  // play: the element plays the held copy, the time advances, the line follows (Read mode has the text and the line)
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await st(page)).position, { timeout: 10000 }).toBeGreaterThan(1);
  expect(await page.evaluate(() => window.__audio!.src)).toMatch(/^blob:/);
  expect(await page.evaluate(() => window.__audio!.currentTime)).toBeGreaterThan(0.5);
  s = await st(page);
  expect(s.playing).toBe(true);
  expect(s.listening).toBe('playing');
  const expected = [...timings0].filter((t) => t.start_ms <= s.position * 1000).pop()!.line_id;
  expect(texts[0].lines.some((x: any) => x.id === s.currentLineId)).toBe(true);
  expect(Math.abs(timings0.findIndex((t) => t.line_id === s.currentLineId) - timings0.findIndex((t) => t.line_id === expected))).toBeLessThanOrEqual(1);
  await cmd(page, 'gotoLine', timings0[timings0.length - 1]!.line_id);
  await expect.poll(async () => (await st(page)).currentLineId).toBe(timings0[timings0.length - 1]!.line_id);

  // O5: chapter two is not on this device
  await cmd(page, 'pause');
  await cmd(page, 'gotoChapter', chapters[1]!.id);
  await expect.poll(async () => (await st(page)).needsYou?.code).toBe('offline_not_downloaded');
  s = await st(page);
  expect(s.listening).toBe('needs_you');
  expect(s.needsYou.text.startsWith('Your place is kept.')).toBe(true);
  expect(s.needsYou.text).toContain("Chapter 2 isn't on this device.");
  expect(s.offlineNext).toEqual({ chapterId: chapters[2]!.id, title: chapters[2]!.title });
  expect(s.playing).toBe(false);

  // take the offer: chapter three plays from the device
  await cmd(page, 'gotoChapter', s.offlineNext.chapterId);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await st(page)).position, { timeout: 10000 }).toBeGreaterThan(1);
  s = await st(page);
  expect(s.chapter.id).toBe(chapters[2]!.id);
  expect(s.text).toBe(texts[2].text);
  expect(s.needsYou).toBeNull();
  expect(s.offlineNext).toBeNull();
  await cmd(page, 'pause');

  // the place is kept on this device and waits to be sent
  await expect.poll(async () => (await st(page)).placeSync).toBe('queued_offline');
  s = await st(page);
  expect(s.placeSync).toBe('queued_offline');
  const local = await page.evaluate(([li, b]) => JSON.parse(localStorage.getItem(`bardic.place.${li}.${b}`) ?? 'null'), [l, bookId] as const);
  expect(local).toMatchObject({ chapterId: chapters[2]!.id, mode: 'listening' });
  expect((await apiCall(stack.api, 'GET', `/api/books/${bookId}/place`, undefined, OTHER, l)).status).toBe(404);

  // the Bardic computer comes back: the place reaches it, with no conflict and no jump
  const pos = (await st(page)).position;
  stack.setReachable(true);
  await off(page, 'refresh');
  await expect.poll(async () => (await apiCall(stack.api, 'GET', `/api/books/${bookId}/place`, undefined, OTHER, l)).json?.chapter_id, { timeout: 45000 }).toBe(chapters[2]!.id);
  await expect.poll(async () => (await st(page)).placeSync, { timeout: 20000 }).toBe('saved');
  s = await st(page);
  expect(s.conflict).toBeNull();
  expect(s.chapter.id).toBe(chapters[2]!.id);
  expect(Math.abs(s.position - pos)).toBeLessThan(0.5);
  expect(s.playing).toBe(false);
});

test('opening a book that is not on the device, offline, says so and keeps the place', async ({ page, stack, breeze }) => {
  const l = (await apiCall(stack.api, 'POST', '/api/listeners', { name: 'Nick' })).json.id as string;
  expect((await apiCall(stack.api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, OTHER)).status).toBe(200);
  const bookId = (await apiCall(stack.api, 'POST', '/api/books/sample', undefined, OTHER, l)).json.id as string;
  await page.goto('/?e2e=offline');
  await page.getByRole('button', { name: /^Nick/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
  await page.waitForFunction(() => !!window.__player);
  stack.setReachable(false);
  await page.evaluate((b) => window.__player!.open(b), bookId);
  const s = await st(page);
  expect(s.loaded).toBe(false);
  expect(s.listening).toBe('needs_you');
  expect(s.needsYou.code).toBe('offline_not_downloaded');
  expect(s.needsYou.text).toBe("Your place is kept. This book is not on this device, and your Bardic computer can't be reached.");
});

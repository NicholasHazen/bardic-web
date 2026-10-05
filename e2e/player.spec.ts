// The player engine and place sync (W3, logic only) against a real bardic-server with the fake Breeze (and a
// fake Gemini that must never be asked to speak). There is no Now Playing screen yet: the page exposes the
// player through `?e2e=player` (src/player/testhost/install.ts), and the tests drive it from the page.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import type { Fake } from './fakes';

const OTHER = 'e2e-other-device-1';

interface World {
  listener: string;
  bookId: string;
  chapters: { id: string; title: string; kind: string }[];
  /** every chapter made */
  ready: { id: string };
  /** nothing made */
  empty: { id: string };
}

type Api = string;

async function world(api: Api, breeze: Fake, opts: { gemini?: boolean; names?: string[] } = {}): Promise<World> {
  const names = opts.names ?? ['Nick'];
  const ids: string[] = [];
  for (const n of names) ids.push((await apiCall(api, 'POST', '/api/listeners', { name: n })).json.id as string);
  const l = ids[0]!;
  expect((await apiCall(api, 'PUT', '/api/voice-sources/breeze', { base_url: breeze.url }, OTHER)).status).toBe(200);
  if (opts.gemini) expect((await apiCall(api, 'PUT', '/api/voice-sources/gemini', { api_key: 'test-key' }, OTHER)).status).toBe(200);
  const bookId = (await apiCall(api, 'POST', '/api/books/sample', undefined, OTHER, l)).json.id as string;
  const chapters = (await apiCall(api, 'GET', `/api/books/${bookId}/chapters`)).json.items as World['chapters'];
  const voices = (await apiCall(api, 'GET', '/api/voices')).json.items as { id: string; name: string; tier: string }[];
  const ready = (await apiCall(api, 'POST', `/api/books/${bookId}/audiobooks`, { voice_id: voices.find((v) => v.name === 'Mara')!.id }, OTHER)).json;
  const empty = (await apiCall(api, 'POST', `/api/books/${bookId}/audiobooks`, { voice_id: voices.find((v) => v.name === 'Tobias')!.id }, OTHER)).json;
  const job = await apiCall(api, 'POST', `/api/audiobooks/${ready.id}/make-ready`, { scope: { kind: 'whole_book' } }, OTHER, l);
  expect(job.status).toBe(202);
  await expect
    .poll(async () => ((await apiCall(api, 'GET', `/api/audiobooks/${ready.id}/chapters`)).json.items as { state: string }[]).every((c) => c.state === 'ready'), { timeout: 30000 })
    .toBe(true);
  if (opts.gemini) {
    const kore = voices.find((v) => v.tier === 'premium')!;
    (world as unknown as { premium?: string }).premium = (await apiCall(api, 'POST', `/api/books/${bookId}/audiobooks`, { voice_id: kore.id }, OTHER)).json.id;
  }
  return { listener: l, bookId, chapters, ready, empty };
}

const setSettings = (api: Api, listener: string, place_conflict: 'ask' | 'newest' | 'this_device') =>
  apiCall(api, 'PUT', `/api/listeners/${listener}/settings`, { default_voice_id: null, place_conflict, continue_into_next_chapter: true }, OTHER);

async function signIn(page: Page, name = 'Nick') {
  await page.goto('/?e2e=player');
  const listening = page.getByRole('button', { name: new RegExp(`Listening as ${name}`) });
  const choose = page.getByRole('button', { name: new RegExp(`^${name}`) });
  await expect(listening.or(choose)).toBeVisible();
  if (await choose.isVisible()) await choose.click(); // the chooser is only shown until the choice is remembered
  await expect(listening).toBeVisible();
  await page.waitForFunction(() => !!window.__player);
}

/** The state without the text (and a history of every listening state seen). */
const st = (page: Page) =>
  page.evaluate(() => {
    let v: any;
    window.__player!.subscribe((s) => (v = s))();
    const { text, lines, timings, ...rest } = v;
    return { ...rest, lineCount: lines.length, timingCount: timings.length } as any;
  });

const track = (page: Page) =>
  page.evaluate(() => {
    const w = window as any;
    w.__hist = [];
    window.__player!.subscribe((s) => {
      const last = w.__hist[w.__hist.length - 1];
      if (last !== s.listening) w.__hist.push(s.listening);
    });
  });
const hist = (page: Page) => page.evaluate(() => (window as any).__hist as (string | null)[]);

const open = (page: Page, bookId: string, opts: Record<string, unknown> = {}) => page.evaluate(([b, o]) => window.__player!.open(b as string, o as any), [bookId, opts] as const);
const cmd = (page: Page, name: string, ...args: unknown[]) => page.evaluate(([n, a]) => (window.__player as any)[n as string](...(a as unknown[])), [name, args] as const);
/** Run play inside the real click handler, as the app's Play button does. */
const tap = async (page: Page) => {
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.dataset.testPlayback = '';
    button.textContent = 'Start test playback';
    button.style.cssText = 'position:fixed;top:0;left:0;z-index:9999;padding:12px';
    button.onclick = () => { window.__player!.play(); button.remove(); };
    document.body.append(button);
  });
  await page.locator('[data-test-playback]').click();
};
const placeOf = async (api: Api, w: World) => (await apiCall(api, 'GET', `/api/books/${w.bookId}/place`, undefined, OTHER, w.listener));
const historyOf = async (api: Api, w: World) => (await apiCall(api, 'GET', `/api/books/${w.bookId}/place/history`, undefined, OTHER, w.listener)).json.items as { chapter_id: string }[];

test.describe.configure({ timeout: 60000 });

test('S1: open a book with ready audio and play: position, pause, speed, the line and the next chapter', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  await signIn(page);
  await track(page);
  await open(page, w.bookId);
  let s = await st(page);
  expect(s.loaded).toBe(true);
  expect(s.chapter.id).toBe(w.chapters[0]!.id);
  expect(s.playing).toBe(false);
  expect(s.lineCount).toBeGreaterThan(0);
  expect(s.timingCount).toBeGreaterThan(0);
  expect(s.duration).toBeGreaterThan(5);

  await tap(page);
  await expect.poll(async () => (await st(page)).position, { timeout: 10000 }).toBeGreaterThan(1.5);
  s = await st(page);
  expect(s.playing).toBe(true);
  expect(s.listening).toBe('playing');
  expect(s.detail).toMatch(/ahead$/);

  // pause holds the position
  await cmd(page, 'pause');
  const at = (await st(page)).position;
  await page.waitForTimeout(600);
  expect((await st(page)).position).toBe(at);
  expect((await st(page)).listening).toBeNull();

  // the current line is the one the timings say, at that position
  const ab = (await apiCall(stack.api, 'GET', `/api/audiobooks/${w.ready.id}/chapters`)).json.items as { chapter_id: string; audio: { id: string } }[];
  const timings = (await apiCall(stack.api, 'GET', `/api/audio/${ab[0]!.audio.id}/timings`)).json.lines as { line_id: string; start_ms: number }[];
  const expected = [...timings].filter((t) => t.start_ms <= at * 1000).pop()?.line_id ?? timings[0]!.line_id;
  expect((await st(page)).currentLineId).toBe(expected);

  // resume, and the speed is applied with the pitch kept
  await cmd(page, 'play');
  await cmd(page, 'setSpeed', 1.5);
  await expect.poll(() => page.evaluate(() => window.__audio?.playbackRate)).toBe(1.5);
  expect(await page.evaluate(() => window.__audio?.preservesPitch)).toBe(true);
  await expect.poll(async () => (await st(page)).position, { timeout: 10000 }).toBeGreaterThan(at + 0.5);

  // the end of the chapter goes on to the next one
  const dur = (await st(page)).duration;
  await cmd(page, 'seek', dur - 1);
  await expect.poll(async () => (await st(page)).chapter.id, { timeout: 15000 }).toBe(w.chapters[1]!.id);
  await expect.poll(async () => (await st(page)).playing).toBe(true);
  expect((await st(page)).speed).toBe(1.5);
  await cmd(page, 'pause');
  expect(await hist(page)).not.toContain('needs_you');
});

test('S8: a chapter that is not made yet is made when you press play (a free voice), then plays', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  await apiCall(stack.api, 'PUT', `/api/books/${w.bookId}/place`, { chapter_id: w.chapters[0]!.id, offset: 0, mode: 'listening', audiobook_id: w.empty.id, base_revision: 0 }, OTHER, w.listener);
  const received = breeze.received();
  await signIn(page);
  await track(page);
  await open(page, w.bookId);
  let s = await st(page);
  expect(s.audiobookId).toBe(w.empty.id);
  expect(s.chapters.map((c: { audio: string }) => c.audio)).toEqual(['not_yet', 'not_yet', 'not_yet']);
  // opening asks for nothing
  expect(breeze.received()).toBe(received);

  await tap(page);
  s = await st(page);
  expect(s.listening).toBe('getting_ready');
  expect(s.detail).toBe('First audio in about 10 s');
  await expect.poll(async () => (await st(page)).playing, { timeout: 30000 }).toBe(true);
  expect((await st(page)).listening).toBe('playing');
  expect(await hist(page)).toContain('getting_ready');
  expect(breeze.received()).toBeGreaterThan(received);
  // the following chapters are made ahead without anyone asking
  await expect
    .poll(async () => ((await apiCall(stack.api, 'GET', `/api/audiobooks/${w.empty.id}/chapters`)).json.items as { state: string }[]).filter((c) => c.state === 'ready').length, { timeout: 30000 })
    .toBeGreaterThan(1);
  await cmd(page, 'pause');
});

test('C1: the place is saved on pause and restored on reload, exactly on this device and by line on another', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  await signIn(page);
  await open(page, w.bookId);
  await cmd(page, 'gotoChapter', w.chapters[1]!.id);
  await expect.poll(async () => (await st(page)).chapter.id).toBe(w.chapters[1]!.id);
  await tap(page);
  await expect.poll(async () => (await st(page)).position, { timeout: 10000 }).toBeGreaterThan(2);
  await cmd(page, 'pause');
  const s = await st(page);
  await expect.poll(async () => (await placeOf(stack.api, w)).json?.chapter_id).toBe(w.chapters[1]!.id);
  const p = (await placeOf(stack.api, w)).json;
  expect(p).toMatchObject({ chapter_id: w.chapters[1]!.id, mode: 'listening', audiobook_id: w.ready.id });
  expect(p.offset).toBeGreaterThan(0);
  expect(p.device_name === undefined || typeof p.device_name === 'string').toBe(true);

  // reload: back at the same chapter and the exact time
  await signIn(page);
  await open(page, w.bookId);
  let r = await st(page);
  expect(r.chapter.id).toBe(w.chapters[1]!.id);
  expect(Math.abs(r.position - s.position)).toBeLessThan(0.6);
  expect(r.playing).toBe(false);

  // on another device (no local copy) it starts at the line
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('bardic.place.')).forEach((k) => localStorage.removeItem(k)));
  await signIn(page);
  await open(page, w.bookId);
  r = await st(page);
  expect(r.chapter.id).toBe(w.chapters[1]!.id);
  expect(r.position).toBeLessThanOrEqual(s.position + 0.05);
  expect(s.position - r.position).toBeLessThan(40);
  expect(r.conflict).toBeNull();
});

for (const policy of ['ask', 'newest', 'this_device'] as const) {
  test(`C3: another device moved the place meanwhile, the setting is ${policy}`, async ({ page, stack, breeze }) => {
    const w = await world(stack.api, breeze);
    await setSettings(stack.api, w.listener, policy);
    await signIn(page);
    await open(page, w.bookId);
    await tap(page);
    await expect.poll(async () => (await st(page)).position, { timeout: 10000 }).toBeGreaterThan(1);
    await cmd(page, 'pause');
    await expect.poll(async () => (await placeOf(stack.api, w)).json?.revision).toBeGreaterThan(0);
    const mine = (await placeOf(stack.api, w)).json;
    // the tablet writes chapter three
    const theirs = await apiCall(stack.api, 'PUT', `/api/books/${w.bookId}/place`, { chapter_id: w.chapters[2]!.id, offset: 0, mode: 'listening', audiobook_id: w.ready.id, base_revision: mine.revision }, OTHER, w.listener);
    expect(theirs.status).toBe(200);

    await signIn(page);
    await open(page, w.bookId);
    let s = await st(page);
    expect(s.playing).toBe(false);
    if (policy === 'ask') {
      expect(s.conflict).not.toBeNull();
      expect(s.conflict.theirs.chapterTitle).toBe(w.chapters[2]!.title);
      expect(s.conflict.mine.chapterTitle).toBe(w.chapters[0]!.title);
      // nothing was written while the listener decides
      expect((await placeOf(stack.api, w)).json.chapter_id).toBe(w.chapters[2]!.id);
      await cmd(page, 'resolveConflict', 'theirs');
      await expect.poll(async () => (await st(page)).chapter.id).toBe(w.chapters[2]!.id);
      s = await st(page);
      expect(s.conflict).toBeNull();
      // the place we did not take is still in the history
      expect((await historyOf(stack.api, w)).some((h) => h.chapter_id === w.chapters[0]!.id)).toBe(true);
    } else if (policy === 'newest') {
      // the tablet wrote later
      expect(s.conflict).toBeNull();
      expect(s.chapter.id).toBe(w.chapters[2]!.id);
    } else {
      expect(s.conflict).toBeNull();
      expect(s.chapter.id).toBe(w.chapters[0]!.id);
      await tap(page);
      await expect.poll(async () => (await st(page)).position, { timeout: 10000 }).toBeGreaterThan(0.5);
      await cmd(page, 'pause');
      await expect.poll(async () => (await placeOf(stack.api, w)).json.chapter_id).toBe(w.chapters[0]!.id);
      expect((await historyOf(stack.api, w)).some((h) => h.chapter_id === w.chapters[2]!.id)).toBe(true);
    }
  });
}

test("C4: ask, and the listener keeps this device's place: it is written on the server's revision", async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  await signIn(page);
  await open(page, w.bookId);
  await tap(page);
  await expect.poll(async () => (await st(page)).position, { timeout: 10000 }).toBeGreaterThan(1);
  await cmd(page, 'pause');
  await expect.poll(async () => (await placeOf(stack.api, w)).json?.revision).toBeGreaterThan(0);
  const mine = (await placeOf(stack.api, w)).json;
  await apiCall(stack.api, 'PUT', `/api/books/${w.bookId}/place`, { chapter_id: w.chapters[2]!.id, offset: 0, mode: 'listening', audiobook_id: w.ready.id, base_revision: mine.revision }, OTHER, w.listener);
  await signIn(page);
  await open(page, w.bookId);
  expect((await st(page)).conflict).not.toBeNull();
  await cmd(page, 'resolveConflict', 'mine');
  await expect.poll(async () => (await placeOf(stack.api, w)).json.chapter_id).toBe(w.chapters[0]!.id);
  expect((await st(page)).conflict).toBeNull();
  expect((await historyOf(stack.api, w)).some((h) => h.chapter_id === w.chapters[2]!.id)).toBe(true);
});

test('C5: a place written by another device while this one is paused is offered, not jumped to', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  await signIn(page);
  await open(page, w.bookId);
  await tap(page);
  await expect.poll(async () => (await st(page)).position, { timeout: 10000 }).toBeGreaterThan(1);
  await cmd(page, 'pause');
  await expect.poll(async () => (await placeOf(stack.api, w)).json?.revision).toBeGreaterThan(0);
  const mine = (await placeOf(stack.api, w)).json;
  await apiCall(stack.api, 'PUT', `/api/books/${w.bookId}/place`, { chapter_id: w.chapters[2]!.id, offset: 0, mode: 'listening', audiobook_id: w.ready.id, base_revision: mine.revision }, OTHER, w.listener);
  await expect.poll(async () => (await st(page)).conflict, { timeout: 10000 }).not.toBeNull();
  const s = await st(page);
  expect(s.chapter.id).toBe(w.chapters[0]!.id); // still where it was
  expect(s.conflict.theirs.chapterTitle).toBe(w.chapters[2]!.title);
});

test('listener switch pauses, saves under the previous listener and unloads', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze, { names: ['Nick', 'Sam'] });
  await signIn(page);
  await open(page, w.bookId);
  await tap(page);
  await expect.poll(async () => (await st(page)).position, { timeout: 10000 }).toBeGreaterThan(2);
  await page.getByRole('button', { name: /Listening as Nick/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Sam/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Sam/ })).toBeVisible();
  await expect.poll(async () => (await st(page)).loaded).toBe(false);
  expect((await st(page)).playing).toBe(false);
  expect(await page.evaluate(() => window.__audio?.paused)).toBe(true);
  await expect.poll(async () => (await placeOf(stack.api, w)).json?.chapter_id).toBe(w.chapters[0]!.id);
  const nick = (await placeOf(stack.api, w)).json;
  expect(nick.offset).toBeGreaterThan(0);
  // Sam has no place in this book
  const sam = (await apiCall(stack.api, 'GET', '/api/listeners')).json.items.find((l: { name: string }) => l.name === 'Sam').id;
  expect((await apiCall(stack.api, 'GET', `/api/books/${w.bookId}/place`, undefined, OTHER, sam)).status).toBe(404);
});

test('sleep timer: end of chapter pauses at the end and the next chapter waits, ready', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  await signIn(page);
  await open(page, w.bookId);
  await tap(page);
  await expect.poll(async () => (await st(page)).position, { timeout: 10000 }).toBeGreaterThan(1);
  await cmd(page, 'setSleep', { kind: 'end_of_chapter' });
  const dur = (await st(page)).duration;
  await cmd(page, 'seek', dur - 1);
  await expect.poll(async () => (await st(page)).chapter.id, { timeout: 15000 }).toBe(w.chapters[1]!.id);
  await page.waitForTimeout(1200);
  const s = await st(page);
  expect(s.playing).toBe(false);
  expect(s.sleep).toEqual({ kind: 'off' });
  expect(s.position).toBeLessThan(1);
  await expect.poll(async () => (await placeOf(stack.api, w)).json.chapter_id).toBe(w.chapters[1]!.id);
});

test('P2: a premium audiobook chapter that is not made is never requested', async ({ page, stack, breeze, gemini }) => {
  const w = await world(stack.api, breeze, { gemini: true });
  const premium = (world as unknown as { premium: string }).premium;
  expect(premium).toBeTruthy();
  await apiCall(stack.api, 'PUT', `/api/books/${w.bookId}/place`, { chapter_id: w.chapters[0]!.id, offset: 0, mode: 'listening', audiobook_id: premium, base_revision: 0 }, OTHER, w.listener);
  await signIn(page);
  await open(page, w.bookId);
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && /\/api\//.test(r.url()) && !/\/place/.test(r.url())) requests.push(`${r.method()} ${r.url()}`);
  });
  expect((await st(page)).voice.tier).toBe('premium');
  await tap(page);
  await expect.poll(async () => (await st(page)).listening).toBe('needs_you');
  const s = await st(page);
  expect(s.needsYou.text).toContain('Premium audio is made under a plan');
  expect(s.needsYou.action.route).toBe(`/book/${w.bookId}`);
  expect(s.playing).toBe(false);
  await page.waitForTimeout(3000);
  // nothing was started: no request, no job, no plan, nothing spent, the provider was not asked
  expect(requests).toEqual([]);
  expect(gemini.received()).toBe(0);
  expect(((await apiCall(stack.api, 'GET', '/api/jobs')).json.items as { audiobook_id: string }[]).filter((j) => j.audiobook_id === premium)).toEqual([]);
  expect(((await apiCall(stack.api, 'GET', '/api/plans', undefined, OTHER, w.listener)).json?.items ?? []).length).toBe(0);
  expect((await apiCall(stack.api, 'GET', '/api/allowance')).json.spent.known.micros).toBe(0);
});

test('S9: the end of the book keeps the place at the end; finishing is the server rule or the reader', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  await signIn(page);
  await open(page, w.bookId, { chapterId: w.chapters[2]!.id, offset: 0 });
  await tap(page);
  await expect.poll(async () => (await st(page)).position, { timeout: 10000 }).toBeGreaterThan(1);
  await cmd(page, 'seek', (await st(page)).duration - 1);
  await expect.poll(async () => (await st(page)).finishedBook, { timeout: 15000 }).toBe(true);
  expect((await st(page)).playing).toBe(false);
  await expect.poll(async () => (await placeOf(stack.api, w)).json?.progress, { timeout: 10000 }).toBeGreaterThan(0.99);
  const p = (await placeOf(stack.api, w)).json;
  expect(p.chapter_id).toBe(w.chapters[2]!.id);
  expect(p.finished.finished).toBe(false); // by the server's rule: after 24 hours unchanged (C6)
  expect(await page.evaluate(() => window.__player!.markFinished(true))).toBe(true);
  expect((await placeOf(stack.api, w)).json.finished).toMatchObject({ finished: true, reason: 'marked' });
  // listening again starts over and clears the end state
  await cmd(page, 'listenAgain');
  await expect.poll(async () => (await st(page)).chapter.id).toBe(w.chapters[0]!.id);
  expect((await st(page)).finishedBook).toBe(false);
  await cmd(page, 'pause');
});

test('C3: choosing theirs keeps this device\'s unsynced position in the place history', async ({ page, stack, breeze }) => {
  const w = await world(stack.api, breeze);
  await signIn(page);
  await open(page, w.bookId);
  await tap(page);
  await expect.poll(async () => (await st(page)).position, { timeout: 10000 }).toBeGreaterThan(1);
  await cmd(page, 'pause');
  await expect.poll(async () => (await placeOf(stack.api, w)).json?.revision).toBeGreaterThan(0);
  const synced = (await placeOf(stack.api, w)).json;
  // the tablet writes chapter three; this device then moves on while it cannot reach the server
  await apiCall(stack.api, 'PUT', `/api/books/${w.bookId}/place`, { chapter_id: w.chapters[2]!.id, offset: 0, mode: 'listening', audiobook_id: w.ready.id, base_revision: synced.revision }, OTHER, w.listener);
  // the notice offers the tablet's place while paused; the listener moves on here in the meantime
  await expect.poll(async () => (await st(page)).conflict, { timeout: 10000 }).not.toBeNull();
  const dur = (await st(page)).duration;
  await cmd(page, 'seek', dur - 2);
  await page.waitForTimeout(1000);
  const unsynced = await page.evaluate(() => JSON.parse(localStorage.getItem('bardic.placequeue') ?? '[]')[0].input.offset as number);
  expect(unsynced).toBeGreaterThan(synced.offset);
  expect((await placeOf(stack.api, w)).json.chapter_id).toBe(w.chapters[2]!.id); // nothing written while the listener decides
  await cmd(page, 'resolveConflict', 'theirs');
  await expect.poll(async () => (await st(page)).chapter.id).toBe(w.chapters[2]!.id);
  await expect.poll(async () => (await historyOf(stack.api, w) as { chapter_id: string; offset: number }[]).some((h) => h.chapter_id === w.chapters[0]!.id && h.offset === unsynced)).toBe(true);
  const now = (await placeOf(stack.api, w)).json;
  expect(now.chapter_id).toBe(w.chapters[2]!.id);
});

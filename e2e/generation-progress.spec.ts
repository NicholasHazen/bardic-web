// Real server, local gated voice providers, and original synthetic chapter text only.
// Requests stop at explicit gates so progress and pause assertions do not race fast fake audio.
import http from 'node:http';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import { startBreeze, startGemini, type Fake } from './fakes';
import { apiCall, startStack, type Running } from './harness';
import { configureBreeze, importFile, mkListener } from './helpers/world';
import { silenceAudio } from './helpers/silentAudio';
import { zip } from './zip';

const DEVICE = 'e2e-generation-device';
const BOOK = 'The Lantern Workshop';
const TITLES = ['Chapter 1: The Copper Lamp', 'Chapter 2: The Glass Bell', 'Chapter 3: The Paper Star'];

class RequestGate {
  private releases: (() => void)[] = [];
  private open = false;
  get received() { return this.releases.length; }
  hold = async () => {
    await new Promise<void>((resolve) => {
      this.releases.push(resolve);
      if (this.open) resolve();
    });
  };
  release(request: number) {
    expect(this.releases[request - 1], `request ${request} reached its gate`).toBeDefined();
    this.releases[request - 1]!();
  }
  releaseAll() {
    this.open = true;
    this.releases.forEach((release) => release());
  }
  async waitFor(request: number) {
    await expect.poll(() => this.received, { timeout: 15000 }).toBeGreaterThanOrEqual(request);
  }
}

/** Gate the existing Gemini fake without changing its shared behaviour or contacting Google. */
async function gatedGemini(gate: RequestGate): Promise<Fake> {
  const fake = await startGemini();
  const server = http.createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      if (req.url === '/v1beta/interactions' && req.method === 'POST') await gate.hold();
      if (res.destroyed) return;
      const upstream = await fetch(`${fake.url}${req.url}`, {
        method: req.method,
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': String(req.headers['x-goog-api-key'] ?? ''),
        },
        body: body.length ? body : undefined,
      });
      res.writeHead(upstream.status, { 'content-type': 'application/json' });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      if (!res.destroyed) res.writeHead(502).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    ...fake,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    stop: async () => {
      gate.releaseAll();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fake.stop();
    },
  };
}

type Providers = { breeze: Fake; gemini: Fake; freeGate: RequestGate; paidGate: RequestGate };
const test = base.extend<{ providers: Providers; stack: Running }>({
  context: async ({ context }, use) => {
    await silenceAudio(context);
    await use(context);
  },
  providers: async ({}, use) => {
    const freeGate = new RequestGate();
    const paidGate = new RequestGate();
    const breeze = await startBreeze({ beforeSpeech: freeGate.hold });
    const gemini = await gatedGemini(paidGate);
    try { await use({ breeze, gemini, freeGate, paidGate }); }
    finally {
      freeGate.releaseAll();
      paidGate.releaseAll();
      await Promise.all([breeze.stop(), gemini.stop()]);
    }
  },
  stack: async ({ providers }, use) => {
    const stack = await startStack({ env: { BARDIC_GEMINI_URL: providers.gemini.url, BARDIC_AUDIO_CHUNK_CHARS: '400' } });
    try { await use(stack); }
    finally { await stack.stop(); }
  },
  baseURL: async ({ stack }, use) => use(stack.url),
});

interface World { listener: string; book: string; audiobook: string; chapters: { id: string; title: string }[] }
interface Generation {
  chapter_id: string;
  requests_done: number;
  requests_total: number;
  characters_done: number;
  characters_total: number;
  chapter_seconds_remaining: number | null;
  job_seconds_remaining: number | null;
}
interface Job { id: string; state: string; chapters_total: number; chapters_done: number; current_chapter_id: string | null; generation: Generation | null }

function originalBook(): Buffer {
  const files: Record<string, string> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    'OPS/book.opf': `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${BOOK}</dc:title><dc:creator>A. Inventor</dc:creator></metadata><manifest>${TITLES.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${TITLES.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`,
  };
  TITLES.forEach((title, chapter) => {
    const paragraphs = Array.from({ length: 18 }, (_, i) => `<p>Workshop${chapter} entry ${i}: Neri set a tiny 🔥 beside the imaginary chart. Oren folded a paper boat and watched it drift beneath the copper lamp.</p>`).join('');
    files[`OPS/c${chapter}.xhtml`] = `<html><body><h1>${title}</h1>${paragraphs}</body></html>`;
  });
  return zip(files);
}

async function world(stack: Running, providers: Providers, tier: 'free' | 'premium'): Promise<World> {
  const listener = await mkListener(stack.api, 'Synthetic generation listener');
  await configureBreeze(stack.api, providers.breeze);
  if (tier === 'premium') {
    expect((await apiCall(stack.api, 'PUT', '/api/voice-sources/gemini', { api_key: 'test-key' }, DEVICE)).status).toBe(200);
  }
  const book = await importFile(stack.api, listener, 'lantern-workshop.epub', new Uint8Array(originalBook()), 'application/epub+zip');
  const chapters = (await apiCall(stack.api, 'GET', `/api/books/${book}/chapters`)).json.items as World['chapters'];
  expect(chapters.map((chapter) => chapter.title)).toEqual(TITLES);
  const voices = (await apiCall(stack.api, 'GET', '/api/voices')).json.items as { id: string; name: string }[];
  const voice = voices.find((item) => item.name === (tier === 'free' ? 'Mara' : 'Kore'))!;
  const audiobook = await apiCall(stack.api, 'POST', `/api/books/${book}/audiobooks`, { voice_id: voice.id }, DEVICE, listener);
  expect(audiobook.status).toBe(201);
  return { listener, book, audiobook: audiobook.json.id as string, chapters };
}

const card = (page: Page) => page.locator('[data-section="audiobook"]');
const progress = (page: Page) => page.locator('[data-generation-progress]');
const rows = (page: Page) => page.locator('[data-chapter-rows] > div');
async function capture(page: Page, testInfo: TestInfo, name: string) {
  const directory = process.env.GEN_REVIEW_DIR;
  if (directory) await mkdir(directory, { recursive: true });
  const screenshot = directory ? path.resolve(directory, `${testInfo.project.name}-${name}.png`) : testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach(name, { path: screenshot, contentType: 'image/png' });
}
const readJob = async (stack: Running, w: World): Promise<Job> => {
  const result = await apiCall(stack.api, 'GET', '/api/jobs', undefined, DEVICE, w.listener);
  expect(result.status).toBe(200);
  expect(result.json.items).toHaveLength(1);
  return result.json.items[0] as Job;
};
const audioStates = async (stack: Running, w: World): Promise<{ state: string; audio: unknown }[]> =>
  (await apiCall(stack.api, 'GET', `/api/audiobooks/${w.audiobook}/chapters`, undefined, DEVICE, w.listener)).json.items;

async function selectAndStart(page: Page, stack: Running, w: World, tier: 'free' | 'premium', providers: Providers, testInfo: TestInfo) {
  await page.addInitScript((id) => localStorage.setItem('bardic.listener', id), w.listener);
  await page.goto(`/#/book/${w.book}`);
  await expect(page.getByRole('heading', { name: BOOK, exact: true, level: 1 })).toBeVisible();
  await card(page).getByRole('button', { name: tier === 'free' ? 'Make ready' : 'Plan the whole book', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Make ready', exact: true });
  await sheet.getByRole('radio', { name: /^Choose chapters/ }).click();
  await sheet.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await sheet.getByRole('checkbox', { name: TITLES[0]!, exact: true }).check();
  await sheet.getByRole('checkbox', { name: TITLES[2]!, exact: true }).check();
  await expect(sheet.getByText('2 of 3 chapters selected', { exact: true })).toBeVisible();
  expect(providers.freeGate.received).toBe(0);
  expect(providers.paidGate.received).toBe(0);
  expect((await apiCall(stack.api, 'GET', '/api/jobs', undefined, DEVICE, w.listener)).json.items).toEqual([]);
  const start = tier === 'free' ? sheet.getByRole('button', { name: 'Start', exact: true }) : sheet.getByRole('button', { name: /^Approve plan · up to \$/ });
  await expect(start).toBeEnabled();
  await capture(page, testInfo, `${tier}-chosen-chapters`);
  await start.click();
  await expect(sheet).toHaveCount(0);
}

async function initialAndMeasuredProgress(page: Page, stack: Running, w: World, gate: RequestGate, testInfo: TestInfo, tier: 'free' | 'premium') {
  await gate.waitFor(1);
  await expect(progress(page)).toContainText(TITLES[0]!);
  await expect(progress(page)).toContainText('0% of chapter');
  await expect(progress(page)).toContainText('Chapter time: Unknown until enough audio is made');
  await expect(progress(page)).toContainText('Generation time: Unknown until enough audio is made');
  const first = await readJob(stack, w);
  expect(first).toMatchObject({ chapters_total: 2, chapters_done: 0, current_chapter_id: w.chapters[0]!.id });
  expect(first.generation).toMatchObject({ requests_done: 0, chapter_seconds_remaining: null, job_seconds_remaining: null });
  expect(first.generation!.requests_total).toBeGreaterThanOrEqual(3);
  expect((await audioStates(stack, w)).every((chapter) => chapter.audio === null)).toBe(true);
  await expect(rows(page).nth(0).getByText('Making', { exact: true })).toBeVisible();
  await expect(rows(page).nth(1).getByText('Not yet', { exact: true })).toBeVisible();
  await expect(rows(page).nth(2).getByText('Making', { exact: true })).toBeVisible();
  await capture(page, testInfo, `${tier}-generation-unknown`);

  gate.release(1);
  await gate.waitFor(2);
  await expect.poll(async () => (await readJob(stack, w)).generation?.requests_done).toBe(1);
  const measured = (await readJob(stack, w)).generation!;
  const percentage = Math.floor(measured.characters_done / measured.characters_total * 100);
  expect(percentage).toBeGreaterThan(0);
  expect(percentage).toBeLessThan(100);
  expect(measured.chapter_seconds_remaining).toBeGreaterThan(0);
  expect(measured.job_seconds_remaining).toBeGreaterThan(measured.chapter_seconds_remaining!);
  const detail = `${percentage}% of chapter · 1 of ${measured.requests_total} requests complete`;
  await expect(progress(page)).toContainText(detail);
  await expect(progress(page)).toContainText(/Chapter: .* left/);
  await expect(progress(page)).toContainText(/Selected chapters: .* left/);
  await expect(progress(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(percentage));
  await expect(rows(page).nth(0).locator('[data-chapter-generation]')).toContainText(detail);
  await expect(rows(page).nth(0).getByRole('progressbar')).toHaveAttribute('aria-valuetext', new RegExp(detail));
  expect((await audioStates(stack, w))[0]).toMatchObject({ state: 'making', audio: null });
  await expect(rows(page).nth(0).getByText('Ready', { exact: true })).toHaveCount(0);
  await capture(page, testInfo, `${tier}-generation-measured`);
  return measured;
}

async function completedSelection(page: Page, stack: Running, w: World) {
  await expect.poll(async () => (await readJob(stack, w)).state, { timeout: 15000 }).toBe('completed');
  const chapters = await audioStates(stack, w);
  expect(chapters.map((chapter) => chapter.state)).toEqual(['ready', 'not_yet', 'ready']);
  expect(chapters[0]!.audio).not.toBeNull();
  expect(chapters[1]!.audio).toBeNull();
  expect(chapters[2]!.audio).not.toBeNull();
  await expect(rows(page).nth(0).getByText('Ready', { exact: true })).toBeVisible();
  await expect(rows(page).nth(1).getByText('Not yet', { exact: true })).toBeVisible();
  await expect(rows(page).nth(2).getByText('Ready', { exact: true })).toBeVisible();
}

test('free generation reports durable request progress and measured time; pause retains completed requests', async ({ page, stack, providers }, testInfo) => {
  const w = await world(stack, providers, 'free');
  await selectAndStart(page, stack, w, 'free', providers, testInfo);
  await initialAndMeasuredProgress(page, stack, w, providers.freeGate, testInfo, 'free');
  const firstText = providers.breeze.spoken[0]!;
  const interruptedText = providers.breeze.spoken[1]!;
  await card(page).getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await readJob(stack, w)).state).toBe('paused');
  expect((await readJob(stack, w)).generation).toMatchObject({ requests_done: 1, chapter_seconds_remaining: null, job_seconds_remaining: null });
  await expect(progress(page)).toContainText('Chapter time: Unknown while generation is not running');
  providers.freeGate.release(2);
  await card(page).getByRole('button', { name: 'Resume', exact: true }).click();
  await providers.freeGate.waitFor(3);
  expect(providers.breeze.spoken[2]).toBe(interruptedText);
  expect(providers.breeze.spoken.filter((text) => text === firstText)).toHaveLength(1);
  expect((await readJob(stack, w)).generation?.requests_done).toBe(1);
  providers.freeGate.releaseAll();
  await completedSelection(page, stack, w);
  expect(providers.breeze.spoken.join(' ')).not.toContain('Workshop1');
  expect(providers.paidGate.received).toBe(0);
  expect(providers.gemini.received()).toBe(0);
});

test('premium progress starts only after approval; pause keeps a completed chapter and its paid requests', async ({ page, stack, providers }, testInfo) => {
  const w = await world(stack, providers, 'premium');
  await selectAndStart(page, stack, w, 'premium', providers, testInfo);
  const measured = await initialAndMeasuredProgress(page, stack, w, providers.paidGate, testInfo, 'premium');
  const firstText = providers.gemini.spoken[0]!;
  await card(page).getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await readJob(stack, w)).state).toBe('paused');
  // An already approved premium chapter finishes at its boundary when paused.
  for (let request = 2; request <= measured.requests_total; request++) {
    await providers.paidGate.waitFor(request);
    providers.paidGate.release(request);
  }
  await expect.poll(async () => (await audioStates(stack, w))[0]!.state).toBe('ready');
  const paused = await readJob(stack, w);
  expect(paused).toMatchObject({ state: 'paused', chapters_done: 1, chapters_total: 2 });
  expect(providers.paidGate.received).toBe(measured.requests_total);
  const keptAudio = (await audioStates(stack, w))[0]!.audio;
  await expect(card(page).getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await card(page).getByRole('button', { name: 'Resume', exact: true }).click();
  await providers.paidGate.waitFor(measured.requests_total + 1);
  expect((await audioStates(stack, w))[0]!.audio).toEqual(keptAudio);
  expect(providers.gemini.spoken.filter((text) => text === firstText)).toHaveLength(1);
  await expect(progress(page)).toContainText(TITLES[2]!);
  providers.paidGate.releaseAll();
  await completedSelection(page, stack, w);
  expect(providers.gemini.spoken.join(' ')).not.toContain('Workshop1');
  expect(providers.freeGate.received).toBe(0);
  expect(providers.breeze.received()).toBe(0);
});

const parallelTest = test.extend({
  stack: async ({ providers }, use) => {
    const stack = await startStack({ env: {
      BARDIC_GEMINI_URL: providers.gemini.url,
      BARDIC_AUDIO_CHUNK_CHARS: '400',
      BARDIC_BREEZE_CONCURRENCY: '3',
    } });
    try { await use(stack); }
    finally { await stack.stop(); }
  },
});

parallelTest('parallel free requests report out-of-order durable progress and retain it through pause and resume', async ({ page, stack, providers }, testInfo) => {
  const w = await world(stack, providers, 'free');
  await selectAndStart(page, stack, w, 'free', providers, testInfo);
  await providers.freeGate.waitFor(3);
  expect(providers.freeGate.received).toBe(3);
  expect(providers.breeze.spoken).toHaveLength(3);
  expect(providers.breeze.spoken.every((text) => text.includes('Workshop0'))).toBe(true);
  const initial = await readJob(stack, w);
  expect(initial).toMatchObject({ chapters_total: 2, chapters_done: 0, current_chapter_id: w.chapters[0]!.id });
  expect(initial.generation).toMatchObject({ requests_done: 0, chapter_seconds_remaining: null, job_seconds_remaining: null });
  await expect(progress(page)).toContainText('0% of chapter');
  await expect(progress(page)).toContainText('Chapter time: Unknown until enough audio is made');

  // The first two requests remain gated. The third response is durable even
  // though it cannot yet be appended to the chapter's ordered audio prefix.
  const retainedText = providers.breeze.spoken[2]!;
  providers.freeGate.release(3);
  await providers.freeGate.waitFor(4);
  await expect.poll(async () => (await readJob(stack, w)).generation?.requests_done).toBe(1);
  const measured = (await readJob(stack, w)).generation!;
  const percentage = Math.floor(measured.characters_done / measured.characters_total * 100);
  expect(percentage).toBeGreaterThan(0);
  expect(percentage).toBeLessThan(100);
  expect(measured.chapter_seconds_remaining).toBeGreaterThan(0);
  const detail = `${percentage}% of chapter · 1 of ${measured.requests_total} requests complete`;
  await expect(progress(page)).toContainText(detail);
  await expect(rows(page).nth(0).locator('[data-chapter-generation]')).toContainText(detail);
  await expect(rows(page).nth(0).getByText('Making', { exact: true })).toBeVisible();
  await expect(rows(page).nth(0).getByText('Ready', { exact: true })).toHaveCount(0);
  expect((await audioStates(stack, w))[0]).toMatchObject({ state: 'making', audio: null });
  await capture(page, testInfo, 'parallel-out-of-order-progress');

  await card(page).getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await readJob(stack, w)).state).toBe('paused');
  // Wait for the public elapsed clock to stop advancing: this observes drained
  // cancellation without assuming how long a provider socket takes to close.
  let previousElapsed: number | undefined;
  await expect.poll(async () => {
    const response = await apiCall(stack.api, 'GET', '/api/jobs', undefined, DEVICE, w.listener);
    expect(response.status).toBe(200);
    const elapsed = response.json.items[0].generation.elapsed_seconds as number;
    const stopped = previousElapsed !== undefined && elapsed === previousElapsed;
    previousElapsed = elapsed;
    return stopped;
  }).toBe(true);
  const paused = (await readJob(stack, w)).generation!;
  expect(paused).toMatchObject({
    requests_done: 1, characters_done: measured.characters_done,
    chapter_seconds_remaining: null, job_seconds_remaining: null,
  });
  await expect(progress(page)).toContainText('Chapter time: Unknown while generation is not running');
  await expect(progress(page)).toContainText('Generation time: Unknown while generation is not running');
  providers.freeGate.releaseAll();
  expect((await readJob(stack, w)).generation).toEqual(paused);
  await expect(progress(page)).toContainText(detail);
  await capture(page, testInfo, 'parallel-paused-progress');

  await card(page).getByRole('button', { name: 'Resume', exact: true }).click();
  await completedSelection(page, stack, w);
  expect(providers.breeze.spoken.filter((text) => text === retainedText)).toHaveLength(1);
  expect(providers.breeze.spoken.join(' ')).not.toContain('Workshop1');
  // Both chosen chapters retain source line order after out-of-order completion.
  const states = await audioStates(stack, w);
  for (const index of [0, 2]) {
    const text = await apiCall(stack.api, 'GET', `/api/books/${w.book}/chapters/${w.chapters[index]!.id}/text`, undefined, DEVICE, w.listener);
    expect(text.status).toBe(200);
    const audio = states[index]!.audio as { timings_url: string };
    const timings = await apiCall(stack.api, 'GET', audio.timings_url, undefined, DEVICE, w.listener);
    expect(timings.status).toBe(200);
    const lines = timings.json.lines as { line_id: string; start_ms: number; end_ms: number }[];
    expect(lines.map((line) => line.line_id)).toEqual(text.json.lines.map((line: { id: string }) => line.id));
    for (let line = 1; line < lines.length; line++) {
      // A provider sentence can span the heading and the following line; their
      // timings may overlap, but neither endpoint can move backward in text order.
      expect(lines[line]!.start_ms).toBeGreaterThanOrEqual(lines[line - 1]!.start_ms);
      expect(lines[line]!.end_ms).toBeGreaterThanOrEqual(lines[line - 1]!.end_ms);
    }
  }
  expect(providers.paidGate.received).toBe(0);
  expect(providers.gemini.received()).toBe(0);
});
